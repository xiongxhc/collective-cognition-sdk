import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  createObject,
  createPortableCognitionRecord,
  promoteSourceRecordsToEvidence,
  transitionObject,
  type CognitiveObject,
  type CognitionEvent,
} from "../src/index.ts";
import {
  readTeamMemoryEvents,
  teamMemoryEventToSourceRecord,
} from "../src/adapters/team-memory.ts";
import {
  teamMemoryActivityEvidencePolicyV1,
} from "../src/adapters/team-memory-activity.ts";
import { SqliteCognitionStore } from "../src/stores/sqlite.ts";
import type {
  CognitionStoreCommitResult,
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
} from "../src/host-integration.ts";

interface Arguments {
  readonly ledgerPath: string;
  readonly cognitionPath: string;
  readonly project: string;
  readonly from: string;
  readonly limit: number;
  readonly create: boolean;
}

const valueArguments = new Set([
  "--ledger",
  "--cognition-db",
  "--project",
  "--from",
  "--limit",
]);
const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function invalidArguments(): never {
  throw new Error("Invalid arguments.");
}

function isIsoTimestamp(value: string): boolean {
  if (!isoTimestampPattern.test(value) || Number.isNaN(Date.parse(value))) {
    return false;
  }
  const datePart = value.slice(0, 10);
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  return !Number.isNaN(calendarDate.getTime()) &&
    calendarDate.toISOString().slice(0, 10) === datePart;
}

function parseArguments(args: readonly string[]): Arguments {
  const values = new Map<string, string>();
  let create = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--create") {
      if (create) {
        invalidArguments();
      }
      create = true;
      continue;
    }
    if (
      argument === undefined ||
      !valueArguments.has(argument) ||
      values.has(argument)
    ) {
      invalidArguments();
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      invalidArguments();
    }
    values.set(argument, value);
    index += 1;
  }

  if (values.size !== valueArguments.size) {
    invalidArguments();
  }
  const ledgerPath = values.get("--ledger");
  const cognitionPath = values.get("--cognition-db");
  const project = values.get("--project");
  const from = values.get("--from");
  const limitText = values.get("--limit");
  if (
    ledgerPath === undefined ||
    cognitionPath === undefined ||
    project === undefined ||
    from === undefined ||
    limitText === undefined ||
    !isAbsolute(ledgerPath) ||
    !isAbsolute(cognitionPath) ||
    ledgerPath === cognitionPath ||
    project.trim().length === 0 ||
    !isIsoTimestamp(from) ||
    !/^[1-9]\d*$/.test(limitText)
  ) {
    invalidArguments();
  }
  const limit = Number(limitText);
  if (!Number.isSafeInteger(limit)) {
    invalidArguments();
  }

  return {
    ledgerPath,
    cognitionPath,
    project,
    from,
    limit,
    create,
  };
}

function portableObject(
  payload: CognitiveObject,
): PortableCognitiveObjectRecord {
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload,
  }) as PortableCognitiveObjectRecord;
}

function portableEvent(
  payload: CognitionEvent,
): PortableCognitionEventRecord {
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognition-event",
    payload,
  }) as PortableCognitionEventRecord;
}

function assertCommitted(result: CognitionStoreCommitResult): void {
  if (
    result.status !== "committed" &&
    result.status !== "already_committed"
  ) {
    throw new Error("Cognition commit conflicted.");
  }
}

function assertReopenedRecord(
  actual: unknown,
  expected: unknown,
): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error("Reopened cognition does not match committed cognition.");
  }
}

async function run(args: readonly string[]) {
  const options = parseArguments(args);
  const rows = readTeamMemoryEvents({
    dbPath: options.ledgerPath,
    project: options.project,
    from: options.from,
    limit: options.limit,
  });
  const sourceRecords = rows.map((row) =>
    teamMemoryEventToSourceRecord(row)
  );
  const firstCapturedAt = sourceRecords[0]?.capturedAt;
  const lastCapturedAt = sourceRecords.at(-1)?.capturedAt;
  if (firstCapturedAt === undefined || lastCapturedAt === undefined) {
    throw new Error("No team-memory activity matched the query.");
  }

  const projectIdentity = encodeURIComponent(options.project);
  const hypothesisId =
    `hypothesis:${projectIdentity}-delivery-readiness`;
  const contextId = `organization:${projectIdentity}`;
  const attribution = {
    initiatorId: "human:team-owner",
    executorId: "agent:team-memory-durable-example",
    accountableId: "human:team-owner",
  };
  const hypothesis = createObject({
    id: hypothesisId,
    type: "hypothesis",
    version: 1,
    state: "proposed",
    title: `${options.project} delivery readiness`,
    data: {
      statement:
        "The selected project activity may contribute to delivery readiness.",
      scope: options.project,
    },
    createdAt: firstCapturedAt,
    updatedAt: firstCapturedAt,
    attribution,
    provenance: [
      {
        source: "team-memory-agent",
        sourceId: `project:${projectIdentity}:delivery-readiness`,
        capturedAt: firstCapturedAt,
      },
    ],
    contextId,
    relationships: [
      {
        type: "supports-goal",
        targetId: `goal:${projectIdentity}-delivery-readiness`,
      },
    ],
  });
  const evidence = promoteSourceRecordsToEvidence(
    {
      records: sourceRecords,
      hypothesisId,
      contextId,
      rationale:
        "The selected records describe project delivery activity without inferring readiness or a decision.",
      promotedAt: lastCapturedAt,
      attribution,
    },
    teamMemoryActivityEvidencePolicyV1,
  );
  const hypothesisRecord = portableObject(hypothesis);
  const evidenceRecord = portableObject(evidence);
  const transition = transitionObject(hypothesis, "under_review", {
    eventId: `event:${projectIdentity}-delivery-readiness-under-review`,
    occurredAt: lastCapturedAt,
    initiator: { id: attribution.initiatorId, kind: "human" },
    executor: { id: attribution.executorId, kind: "agent" },
    accountableParty: { id: attribution.accountableId, kind: "human" },
    automationMode: "manual",
    consequenceLevel: "routine",
    rationale:
      "Place the delivery-readiness hypothesis under review alongside neutral activity evidence.",
  });
  const transitionedHypothesisRecord = portableObject(transition.object);
  const transitionEventRecord = portableEvent(transition.event);

  let store: SqliteCognitionStore | undefined;
  try {
    store = new SqliteCognitionStore({
      databasePath: options.cognitionPath,
      createIfMissing: options.create,
    });
    assertCommitted(await store.commitInitial({ object: hypothesisRecord }));
    assertCommitted(await store.commitInitial({ object: evidenceRecord }));
    assertCommitted(
      await store.commitTransition({
        expectedVersion: hypothesis.version,
        object: transitionedHypothesisRecord,
        event: transitionEventRecord,
      }),
    );
  } finally {
    store?.close();
  }

  let reopenedStore: SqliteCognitionStore | undefined;
  try {
    reopenedStore = new SqliteCognitionStore({
      databasePath: options.cognitionPath,
    });
    const [
      initialHypothesis,
      latestHypothesis,
      persistedEvidence,
      events,
    ] = await Promise.all([
      reopenedStore.getObjectVersion(hypothesisId, 1),
      reopenedStore.getLatestObject(hypothesisId),
      reopenedStore.getLatestObject(evidence.id),
      reopenedStore.listObjectEvents(hypothesisId),
    ]);
    assertReopenedRecord(initialHypothesis, hypothesisRecord);
    assertReopenedRecord(latestHypothesis, transitionedHypothesisRecord);
    assertReopenedRecord(persistedEvidence, evidenceRecord);
    assertReopenedRecord(events, [transitionEventRecord]);

    return {
      hypothesis: {
        id: latestHypothesis?.payload.id,
        latestVersion: latestHypothesis?.payload.version,
        state: latestHypothesis?.payload.state,
      },
      evidence: {
        state: persistedEvidence?.payload.state,
        polarity: persistedEvidence?.payload.data.polarity,
        sourceCount: persistedEvidence?.payload.provenance.length,
      },
      events: events.length,
      decisionsInferred: 0,
      reopened: true,
    };
  } finally {
    reopenedStore?.close();
  }
}

try {
  const result = await run(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Durable workflow failed."}\n`,
  );
  process.exitCode = 1;
}
