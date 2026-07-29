import { DomainError, DomainErrorCode } from "../errors.ts";
import type { EvidencePromotionPolicy } from "../promotion.ts";
import type { SourceRecord } from "../source-records.ts";

type MergeRequestStatus = "merged" | "opened" | "closed" | "reopened";
type TeamMemoryActivityKind = "message" | "commit" | "mr";

interface TeamMemoryActivityRecord {
  readonly id: string;
  readonly project: string;
  readonly capturedAt: string;
  readonly capturedAtInstant: bigint;
  readonly actorId: string;
  readonly kind: TeamMemoryActivityKind;
  readonly status?: MergeRequestStatus;
}

const mediaType = "application/vnd.team-memory.event+json";
const activityKinds: readonly TeamMemoryActivityKind[] = [
  "message",
  "commit",
  "mr",
];
const mergeRequestStatuses: readonly MergeRequestStatus[] = [
  "merged",
  "opened",
  "closed",
  "reopened",
];
const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function invalidActivity(message: string): never {
  throw new DomainError(DomainErrorCode.INVALID_OBJECT, message);
}

function ownEnumerableDataProperty(value: unknown, field: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidActivity("Team-memory activity record must be an object.");
  }

  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Reflect.getOwnPropertyDescriptor(value, field);
  } catch {
    invalidActivity("Team-memory activity record must use data properties.");
  }
  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !("value" in descriptor)
  ) {
    invalidActivity(
      `Team-memory activity ${field} must be an own enumerable data property.`,
    );
  }
  return descriptor.value;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidActivity(`Team-memory activity ${field} must be a non-empty string.`);
  }
  return value;
}

function capturedTimestamp(
  value: unknown,
): { readonly text: string; readonly instant: bigint } {
  const text = nonEmptyString(value, "capturedAt");
  if (!isoTimestampPattern.test(text)) {
    invalidActivity(
      "Team-memory activity capturedAt must be an ISO timestamp.",
    );
  }
  const milliseconds = Date.parse(text);
  const datePart = text.slice(0, 10);
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  if (
    Number.isNaN(milliseconds) ||
    Number.isNaN(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== datePart
  ) {
    invalidActivity("Team-memory activity capturedAt must be an ISO timestamp.");
  }
  return { text, instant: timestampInstant(text) };
}

function timestampInstant(value: string): bigint {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  const zoneStart = value.endsWith("Z") ? value.length - 1 : value.length - 6;
  const fraction = value[19] === "."
    ? value.slice(20, zoneStart).padEnd(9, "0")
    : "000000000";
  let offsetMinutes = 0;
  if (value[zoneStart] !== "Z") {
    const direction = value[zoneStart] === "+" ? 1 : -1;
    offsetMinutes = direction * (
      Number(value.slice(zoneStart + 1, zoneStart + 3)) * 60 +
      Number(value.slice(zoneStart + 4, zoneStart + 6))
    );
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, 0);
  const instantMilliseconds = local.getTime() - offsetMinutes * 60_000;
  return BigInt(instantMilliseconds) * 1_000_000n + BigInt(fraction);
}

function mergeRequestStatus(summary: unknown): MergeRequestStatus {
  const text = nonEmptyString(summary, "content.summary");
  const match = /^\[(merged|opened|closed|reopened)\](?:\s|$)/.exec(text);
  if (match === null) {
    invalidActivity(
      "Team-memory activity summary must start with an explicit merge-request status.",
    );
  }
  return match[1] as MergeRequestStatus;
}

function readTeamMemoryActivityRecord(
  record: SourceRecord,
): TeamMemoryActivityRecord {
  const recordValue = record as unknown;
  const id = nonEmptyString(ownEnumerableDataProperty(recordValue, "id"), "id");
  const recordMediaType = ownEnumerableDataProperty(recordValue, "mediaType");
  if (recordMediaType !== mediaType) {
    invalidActivity("Team-memory activity mediaType is not supported.");
  }
  const timestamp = capturedTimestamp(
    ownEnumerableDataProperty(recordValue, "capturedAt"),
  );
  const actorId = nonEmptyString(
    ownEnumerableDataProperty(recordValue, "actorId"),
    "actorId",
  );
  const content = ownEnumerableDataProperty(recordValue, "content");
  const project = nonEmptyString(
    ownEnumerableDataProperty(content, "project"),
    "content.project",
  );
  const kind = ownEnumerableDataProperty(content, "kind");
  if (
    typeof kind !== "string" ||
    !activityKinds.includes(kind as TeamMemoryActivityKind)
  ) {
    invalidActivity("Team-memory activity kind is not supported.");
  }
  const summary = ownEnumerableDataProperty(content, "summary");
  nonEmptyString(summary, "content.summary");

  return {
    id,
    project,
    capturedAt: timestamp.text,
    capturedAtInstant: timestamp.instant,
    actorId,
    kind: kind as TeamMemoryActivityKind,
    ...(kind === "mr" ? { status: mergeRequestStatus(summary) } : {}),
  };
}

function sortActivities(
  activities: readonly TeamMemoryActivityRecord[],
): TeamMemoryActivityRecord[] {
  return [...activities].sort((left, right) => {
    if (left.capturedAtInstant < right.capturedAtInstant) {
      return -1;
    }
    if (left.capturedAtInstant > right.capturedAtInstant) {
      return 1;
    }
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });
}

function titleFor(activities: readonly TeamMemoryActivityRecord[]): string {
  const first = activities[0];
  if (first === undefined) {
    invalidActivity("Team-memory activity requires at least one record.");
  }
  const projects = new Set(activities.map((activity) => activity.project));
  const subject = projects.size === 1 ? first.project : "Team-memory";
  const count = activities.length;
  return `${subject} activity (${count} ${count === 1 ? "record" : "records"})`;
}

function statementFor(activities: readonly TeamMemoryActivityRecord[]): string {
  const first = activities[0];
  const last = activities.at(-1);
  if (first === undefined || last === undefined) {
    invalidActivity("Team-memory activity requires at least one record.");
  }
  const count = activities.length;
  const kindCounts = new Map<TeamMemoryActivityKind, number>();
  for (const kind of activityKinds) {
    kindCounts.set(kind, 0);
  }
  const statusCounts = new Map<MergeRequestStatus, number>();
  for (const status of mergeRequestStatuses) {
    statusCounts.set(status, 0);
  }
  for (const { kind, status } of activities) {
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    if (status !== undefined) {
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    }
  }
  const kinds = activityKinds
    .flatMap((kind) => {
      const kindCount = kindCounts.get(kind) ?? 0;
      if (kindCount === 0) {
        return [];
      }
      const labels = kind === "message"
        ? ["message", "messages"]
        : kind === "commit"
          ? ["commit", "commits"]
          : ["merge request", "merge requests"];
      return [
        `${kindCount} ${kindCount === 1 ? labels[0] : labels[1]}`,
      ];
    })
    .join(", ");
  const statuses = mergeRequestStatuses
    .flatMap((status) => {
      const statusCount = statusCounts.get(status) ?? 0;
      return statusCount === 0 ? [] : [`${statusCount} ${status}`];
    })
    .join(", ");
  const lines = [
    `${count} activity ${count === 1 ? "record" : "records"} from ${first.capturedAt} to ${last.capturedAt}.`,
    `Actors: ${new Set(activities.map((activity) => activity.actorId)).size}. Activity: ${kinds}.`,
  ];
  if ((kindCounts.get("mr") ?? 0) > 0) {
    lines.push(`Merge-request status: ${statuses}.`);
  }
  if (
    (statusCounts.get("opened") ?? 0) > 0 &&
    (statusCounts.get("closed") ?? 0) > 0
  ) {
    lines.push(
      "Unresolved status signal: opened and closed changes are both present; source review is required.",
    );
  }
  return lines.join("\n");
}

export const teamMemoryActivityEvidencePolicyV1: EvidencePromotionPolicy = {
  id: "team-memory-activity",
  version: "1",
  map(records) {
    if (records.length === 0) {
      invalidActivity("Team-memory activity requires at least one record.");
    }
    const activities = sortActivities(records.map(readTeamMemoryActivityRecord));
    return {
      title: titleFor(activities),
      statement: statementFor(activities),
      evidenceKind: "team-memory-activity",
      polarity: "neutral",
    };
  },
};
