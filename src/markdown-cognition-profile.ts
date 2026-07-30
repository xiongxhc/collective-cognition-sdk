import { createHash } from "node:crypto";

import {
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
} from "./portable-cognition.ts";
import type { PortableCognitionRecord } from "./portable-cognition.ts";
import { canonicalizeJson } from "./source-records.ts";
import { isUnicodeScalarString } from "./types.ts";
import type {
  CognitiveObject,
  JsonValue,
  ObjectType,
  Relationship,
} from "./types.ts";

export const MARKDOWN_COGNITION_PROFILE_VERSION =
  "portable-cognition-markdown/0.1.0";
export const MARKDOWN_COGNITION_MAX_INPUT_BYTES = 1_048_576;
export const MARKDOWN_COGNITION_MAX_NOTE_BYTES = 1_048_576;

export type MarkdownCognitionRecord =
  | PortableCognitionRecord<"cognitive-object">
  | PortableCognitionRecord<"cognition-event">;

export interface MarkdownCognitionRenderContext {
  readonly records: readonly MarkdownCognitionRecord[];
}

export type MarkdownCognitionErrorCode =
  | "invalid_markdown_record"
  | "invalid_projection_input"
  | "projection_limit_exceeded"
  | "invalid_target"
  | "target_not_initialized"
  | "incompatible_target"
  | "unsafe_target_entry"
  | "managed_file_conflict"
  | "projection_io_failed";

export class MarkdownCognitionError extends Error {
  readonly code: MarkdownCognitionErrorCode;
  readonly relativePath?: string;

  constructor(
    code: MarkdownCognitionErrorCode,
    message: string,
    relativePath?: string,
  ) {
    super(message);
    this.name = "MarkdownCognitionError";
    this.code = code;
    if (relativePath !== undefined) {
      this.relativePath = relativePath;
    }
  }
}

const OBJECT_TYPE_DIRECTORIES: Readonly<Record<ObjectType, string>> = Object.freeze({
  identity: "Identities",
  goal: "Goals",
  hypothesis: "Hypotheses",
  experiment: "Experiments",
  evidence: "Evidence",
  decision: "Decisions",
  principle: "Principles",
});

const OBJECT_FRONTMATTER_KEYS = [
  "collective_cognition",
  "managed",
  "record_type",
  "record_hash",
  "object_id",
  "object_type",
  "object_version",
  "object_state",
] as const;
const EVENT_FRONTMATTER_KEYS = [
  "collective_cognition",
  "managed",
  "record_type",
  "record_hash",
  "event_id",
  "event_type",
  "object_id",
  "object_type",
  "object_version",
  "previous_state",
  "next_state",
  "occurred_at",
] as const;
const MACHINE_BLOCK_OPEN = "```json collective-cognition";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function projectionInputError(): never {
  throw new MarkdownCognitionError(
    "invalid_projection_input",
    "Markdown cognition projection input is invalid.",
  );
}

function invalidMarkdownRecord(): never {
  throw new MarkdownCognitionError(
    "invalid_markdown_record",
    "Markdown cognition record is invalid.",
  );
}

function projectionLimitExceeded(): never {
  throw new MarkdownCognitionError(
    "projection_limit_exceeded",
    "Markdown cognition projection exceeds a supported limit.",
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function objectRevisionPath(
  objectType: ObjectType,
  objectId: string,
  version: number,
): string {
  const directory = OBJECT_TYPE_DIRECTORIES[objectType];
  return `Objects/${directory}/${sha256(objectId)}/v${
    String(version).padStart(8, "0")
  }.md`;
}

function eventPath(objectId: string, eventId: string): string {
  return `Events/${sha256(objectId)}/${sha256(eventId)}.md`;
}

function snapshotMarkdownRecord(value: MarkdownCognitionRecord): MarkdownCognitionRecord {
  let accepted: PortableCognitionRecord;
  try {
    accepted = createPortableCognitionRecord(value);
  } catch {
    projectionInputError();
  }

  if (
    accepted.recordType !== "cognitive-object" &&
    accepted.recordType !== "cognition-event"
  ) {
    projectionInputError();
  }

  try {
    return deserializePortableCognitionRecord(
      canonicalizeJson(accepted as unknown as JsonValue),
    ) as MarkdownCognitionRecord;
  } catch {
    projectionInputError();
  }
}

function snapshotMarkdownRecordList(value: unknown): readonly MarkdownCognitionRecord[] {
  try {
    if (typeof value !== "object" || value === null || !Array.isArray(value)) {
      projectionInputError();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor
    >;
    const length = descriptors.length;
    const lengthValue = length !== undefined && "value" in length
      ? length.value
      : undefined;
    if (
      length === undefined ||
      typeof lengthValue !== "number" ||
      !Number.isSafeInteger(lengthValue) ||
      lengthValue < 0
    ) {
      projectionInputError();
    }
    const records: MarkdownCognitionRecord[] = [];
    for (let index = 0; index < lengthValue; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        projectionInputError();
      }
      records.push(snapshotMarkdownRecord(descriptor.value as MarkdownCognitionRecord));
    }
    if (
      Reflect.ownKeys(descriptors).length !== lengthValue + 1 ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      projectionInputError();
    }
    return Object.freeze(records);
  } catch (error) {
    if (error instanceof MarkdownCognitionError) {
      throw error;
    }
    projectionInputError();
  }
}

function snapshotContext(context: MarkdownCognitionRenderContext | undefined): readonly MarkdownCognitionRecord[] {
  if (context === undefined) {
    return [];
  }
  try {
    const descriptors = Object.getOwnPropertyDescriptors(context);
    const keys = Reflect.ownKeys(descriptors);
    const records = descriptors.records;
    if (
      keys.length !== 1 ||
      keys[0] !== "records" ||
      records === undefined ||
      !records.enumerable ||
      !("value" in records) ||
      !Array.isArray(records.value)
    ) {
      projectionInputError();
    }
    return snapshotMarkdownRecordList(records.value);
  } catch (error) {
    if (error instanceof MarkdownCognitionError) {
      throw error;
    }
    projectionInputError();
  }
}

function canonicalRecord(record: MarkdownCognitionRecord): string {
  return serializePortableCognitionRecord(record);
}

function escapeMarkdownText(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (character === "\\") {
      result += "\\\\";
    } else if (character === "\n") {
      result += "\\n";
    } else if (character === "\r") {
      result += "\\r";
    } else if (character === "\t") {
      result += "\\t";
    } else if (codePoint < 0x20 || codePoint === 0x7f) {
      result += `\\u${codePoint.toString(16).padStart(4, "0")}`;
    } else if ("#`[]!<>|".includes(character)) {
      result += `\\${character}`;
    } else {
      result += character;
    }
  }
  return result;
}

function escapeInlineCode(value: string): string {
  return escapeMarkdownText(value).replaceAll("`", "\\`");
}

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function frontmatterLine(key: string, value: string | number | boolean): string {
  if (typeof value === "string") {
    return `${key}: ${jsonString(value)}`;
  }
  return `${key}: ${String(value)}`;
}

function objectFrontmatter(record: PortableCognitionRecord<"cognitive-object">, hash: string): readonly string[] {
  const object = record.payload;
  return [
    frontmatterLine("collective_cognition", MARKDOWN_COGNITION_PROFILE_VERSION),
    frontmatterLine("managed", true),
    frontmatterLine("record_type", record.recordType),
    frontmatterLine("record_hash", hash),
    frontmatterLine("object_id", object.id),
    frontmatterLine("object_type", object.type),
    frontmatterLine("object_version", object.version),
    frontmatterLine("object_state", object.state),
  ];
}

function eventFrontmatter(record: PortableCognitionRecord<"cognition-event">, hash: string): readonly string[] {
  const event = record.payload;
  return [
    frontmatterLine("collective_cognition", MARKDOWN_COGNITION_PROFILE_VERSION),
    frontmatterLine("managed", true),
    frontmatterLine("record_type", record.recordType),
    frontmatterLine("record_hash", hash),
    frontmatterLine("event_id", event.id),
    frontmatterLine("event_type", event.type),
    frontmatterLine("object_id", event.objectId),
    frontmatterLine("object_type", event.objectType),
    frontmatterLine("object_version", event.objectVersion),
    frontmatterLine("previous_state", event.previousState),
    frontmatterLine("next_state", event.nextState),
    frontmatterLine("occurred_at", event.occurredAt),
  ];
}

function indexedObjects(records: readonly MarkdownCognitionRecord[]): Map<string, CognitiveObject> {
  const selected = new Map<string, { readonly object: CognitiveObject; readonly canonical: string }>();
  for (const record of records) {
    if (record.recordType !== "cognitive-object") {
      continue;
    }
    const object = record.payload;
    const canonical = canonicalRecord(record);
    const existing = selected.get(object.id);
    if (existing !== undefined && existing.object.version === object.version) {
      if (existing.canonical !== canonical) {
        projectionInputError();
      }
      continue;
    }
    if (existing === undefined || object.version > existing.object.version) {
      selected.set(object.id, { object, canonical });
    }
  }
  return new Map([...selected].map(([id, entry]) => [id, entry.object]));
}

function relationshipLines(
  relationships: readonly Relationship[],
  objects: ReadonlyMap<string, CognitiveObject>,
): readonly string[] {
  if (relationships.length === 0) {
    return ["- None"];
  }
  return relationships.map((relationship) => {
    const target = objects.get(relationship.targetId);
    if (target === undefined) {
      return `- ${escapeMarkdownText(relationship.type)}: \`${escapeInlineCode(relationship.targetId)}\``;
    }
    const path = objectRevisionPath(target.type, target.id, target.version).slice(0, -3);
    return `- ${escapeMarkdownText(relationship.type)}: [[${path}|${escapeMarkdownText(target.title)}]]`;
  });
}

function provenanceLines(provenance: readonly { readonly source: string; readonly sourceId: string; readonly capturedAt: string; readonly uri?: string; readonly contentHash?: string }[]): readonly string[] {
  if (provenance.length === 0) {
    return ["- None"];
  }
  return provenance.map((entry) => {
    const optional = [
      entry.uri === undefined ? undefined : `uri=${escapeMarkdownText(entry.uri)}`,
      entry.contentHash === undefined ? undefined : `content_hash=${escapeMarkdownText(entry.contentHash)}`,
    ].filter((value): value is string => value !== undefined);
    return `- source=${escapeMarkdownText(entry.source)}; source_id=${escapeMarkdownText(entry.sourceId)}; captured_at=${escapeMarkdownText(entry.capturedAt)}${optional.length === 0 ? "" : `; ${optional.join("; ")}`}`;
  });
}

function renderObjectBody(record: PortableCognitionRecord<"cognitive-object">, objects: ReadonlyMap<string, CognitiveObject>): readonly string[] {
  const object = record.payload;
  return [
    `# ${escapeMarkdownText(object.title)}`,
    "",
    "> [!warning] Managed note",
    "> This note is a deterministic read-only projection. Edit the authoritative cognition record, then project again.",
    "",
    "## Record",
    "",
    `- Type: ${escapeMarkdownText(object.type)}`,
    `- State: ${escapeMarkdownText(object.state)}`,
    `- ID: \`${escapeInlineCode(object.id)}\``,
    `- Version: ${object.version}`,
    "",
    "## Relationships",
    "",
    ...relationshipLines(object.relationships, objects),
    "",
    "## Attribution",
    "",
    `- Initiator: \`${escapeInlineCode(object.attribution.initiatorId)}\``,
    `- Executor: \`${escapeInlineCode(object.attribution.executorId)}\``,
    `- Accountable: \`${escapeInlineCode(object.attribution.accountableId)}\``,
    "",
    "## Provenance",
    "",
    ...provenanceLines(object.provenance),
    "",
    "## Structured Data",
    "",
    "```json",
    canonicalizeJson(object.data),
    "```",
    "",
    "## Revision",
    "",
    `- Created: ${escapeMarkdownText(object.createdAt)}`,
    `- Updated: ${escapeMarkdownText(object.updatedAt)}`,
    `- Context: \`${escapeInlineCode(object.contextId)}\``,
  ];
}

function renderEventBody(record: PortableCognitionRecord<"cognition-event">, objects: ReadonlyMap<string, CognitiveObject>): readonly string[] {
  const event = record.payload;
  const object = objects.get(event.objectId);
  const relatedObject = object === undefined
    ? `\`${escapeInlineCode(event.objectId)}\``
    : `[[${objectRevisionPath(object.type, object.id, object.version).slice(0, -3)}|${escapeMarkdownText(object.title)}]]`;
  const confirmation = event.humanConfirmation === undefined
    ? "- None"
    : `- Actor: \`${escapeInlineCode(event.humanConfirmation.actor.id)}\`; at: ${escapeMarkdownText(event.humanConfirmation.confirmedAt)}; event: \`${escapeInlineCode(event.humanConfirmation.eventId)}\``;
  return [
    `# ${escapeMarkdownText(event.type)}`,
    "",
    "> [!warning] Managed note",
    "> This note is a deterministic read-only projection. Edit the authoritative cognition record, then project again.",
    "",
    "## Target",
    "",
    `- Object ID: \`${escapeInlineCode(event.objectId)}\``,
    `- Object Type: ${escapeMarkdownText(event.objectType)}`,
    `- Object Version: ${event.objectVersion}`,
    "",
    "## State Transition",
    "",
    `- Previous: ${escapeMarkdownText(event.previousState)}`,
    `- Next: ${escapeMarkdownText(event.nextState)}`,
    "",
    "## Event",
    "",
    `- Event ID: \`${escapeInlineCode(event.id)}\``,
    `- Occurred: ${escapeMarkdownText(event.occurredAt)}`,
    `- Initiator: \`${escapeInlineCode(event.initiator.id)}\``,
    `- Executor: \`${escapeInlineCode(event.executor.id)}\``,
    `- Accountable: \`${escapeInlineCode(event.accountableParty.id)}\``,
    `- Automation: ${escapeMarkdownText(event.automationMode)}`,
    `- Consequence: ${escapeMarkdownText(event.consequenceLevel)}`,
    `- Rationale: ${escapeMarkdownText(event.rationale)}`,
    "",
    "## Confirmation",
    "",
    confirmation,
    "",
    "## Related Object",
    "",
    `- ${relatedObject}`,
  ];
}

export function markdownCognitionRelativePath(record: MarkdownCognitionRecord): string {
  const accepted = snapshotMarkdownRecord(record);
  if (accepted.recordType === "cognitive-object") {
    return objectRevisionPath(
      accepted.payload.type,
      accepted.payload.id,
      accepted.payload.version,
    );
  }
  return eventPath(accepted.payload.objectId, accepted.payload.id);
}

export function renderMarkdownCognitionRecord(
  record: MarkdownCognitionRecord,
  context?: MarkdownCognitionRenderContext,
): string {
  const accepted = snapshotMarkdownRecord(record);
  const records = snapshotContext(context);
  const objects = indexedObjects(records);
  const canonical = canonicalRecord(accepted);
  const hash = sha256(canonical);
  const frontmatter = accepted.recordType === "cognitive-object"
    ? objectFrontmatter(accepted, hash)
    : eventFrontmatter(accepted, hash);
  const body = accepted.recordType === "cognitive-object"
    ? renderObjectBody(accepted, objects)
    : renderEventBody(accepted, objects);
  const result = [
    "---",
    ...frontmatter,
    "---",
    "",
    ...body,
    "",
    "## Machine Record",
    "",
    MACHINE_BLOCK_OPEN,
    canonical,
    "```",
    "",
  ].join("\n");
  if (Buffer.byteLength(result, "utf8") > MARKDOWN_COGNITION_MAX_NOTE_BYTES) {
    projectionLimitExceeded();
  }
  return result;
}

type ParsedFrontmatter = Readonly<Record<string, string | number | boolean>>;

function parseFrontmatterValue(raw: string): string | number | boolean {
  if (raw === "true") {
    return true;
  }
  if (/^[1-9][0-9]*$/.test(raw)) {
    const value = Number(raw);
    if (Number.isSafeInteger(value)) {
      return value;
    }
  }
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "string" && isUnicodeScalarString(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to the fixed public error below.
    }
  }
  invalidMarkdownRecord();
}

function parseFrontmatter(markdown: string): { readonly frontmatter: ParsedFrontmatter; readonly body: string } {
  if (!markdown.startsWith("---\n")) {
    invalidMarkdownRecord();
  }
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) {
    invalidMarkdownRecord();
  }
  const lines = markdown.slice(4, end).split("\n");
  const pairs: [string, string | number | boolean][] = [];
  for (const line of lines) {
    const match = /^([a-z_]+): (.+)$/.exec(line);
    if (match === null) {
      invalidMarkdownRecord();
    }
    pairs.push([match[1]!, parseFrontmatterValue(match[2]!)]);
  }
  const keys = pairs.map(([key]) => key);
  const recordType = pairs.find(([key]) => key === "record_type")?.[1];
  const expected = recordType === "cognitive-object"
    ? OBJECT_FRONTMATTER_KEYS
    : recordType === "cognition-event"
      ? EVENT_FRONTMATTER_KEYS
      : undefined;
  if (
    expected === undefined ||
    keys.length !== expected.length ||
    !keys.every((key, index) => key === expected[index])
  ) {
    invalidMarkdownRecord();
  }
  return { frontmatter: Object.fromEntries(pairs), body: markdown.slice(end + 5) };
}

function requiredString(frontmatter: ParsedFrontmatter, key: string): string {
  const value = frontmatter[key];
  if (typeof value !== "string") {
    invalidMarkdownRecord();
  }
  return value;
}

function requiredSafePositiveInteger(frontmatter: ParsedFrontmatter, key: string): number {
  const value = frontmatter[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    invalidMarkdownRecord();
  }
  return value;
}

function requireProfileFrontmatter(frontmatter: ParsedFrontmatter): void {
  if (
    frontmatter.collective_cognition !== MARKDOWN_COGNITION_PROFILE_VERSION ||
    frontmatter.managed !== true ||
    (frontmatter.record_type !== "cognitive-object" && frontmatter.record_type !== "cognition-event") ||
    !SHA256_PATTERN.test(requiredString(frontmatter, "record_hash"))
  ) {
    invalidMarkdownRecord();
  }
}

function machineRecordFromBody(body: string): string {
  const prefix = "## Machine Record\n\n";
  if (!body.includes(prefix)) {
    invalidMarkdownRecord();
  }
  const blocks = [...body.matchAll(/```json collective-cognition\n([\s\S]*?)\n```/g)];
  if (blocks.length !== 1) {
    invalidMarkdownRecord();
  }
  const block = blocks[0]!;
  if (
    block.index === undefined ||
    body.slice(block.index) !== `${MACHINE_BLOCK_OPEN}\n${block[1]}\n${"```"}\n`
  ) {
    invalidMarkdownRecord();
  }
  if (block[1]!.includes("\n")) {
    invalidMarkdownRecord();
  }
  return block[1]!;
}

function mirrorsObjectFrontmatter(
  frontmatter: ParsedFrontmatter,
  record: PortableCognitionRecord<"cognitive-object">,
): boolean {
  const object = record.payload;
  return frontmatter.object_id === object.id &&
    frontmatter.object_type === object.type &&
    frontmatter.object_version === object.version &&
    frontmatter.object_state === object.state;
}

function mirrorsEventFrontmatter(
  frontmatter: ParsedFrontmatter,
  record: PortableCognitionRecord<"cognition-event">,
): boolean {
  const event = record.payload;
  return frontmatter.event_id === event.id &&
    frontmatter.event_type === event.type &&
    frontmatter.object_id === event.objectId &&
    frontmatter.object_type === event.objectType &&
    frontmatter.object_version === event.objectVersion &&
    frontmatter.previous_state === event.previousState &&
    frontmatter.next_state === event.nextState &&
    frontmatter.occurred_at === event.occurredAt;
}

export function parseMarkdownCognitionRecord(markdown: string): MarkdownCognitionRecord {
  try {
    if (
      typeof markdown !== "string" ||
      !isUnicodeScalarString(markdown) ||
      markdown.startsWith("\ufeff") ||
      markdown.includes("\r") ||
      !markdown.endsWith("\n") ||
      markdown.endsWith("\n\n") ||
      Buffer.byteLength(markdown, "utf8") > MARKDOWN_COGNITION_MAX_INPUT_BYTES
    ) {
      invalidMarkdownRecord();
    }
    const { frontmatter, body } = parseFrontmatter(markdown);
    requireProfileFrontmatter(frontmatter);
    const machineJson = machineRecordFromBody(body);
    const record = deserializePortableCognitionRecord(machineJson);
    const canonical = serializePortableCognitionRecord(record);
    if (
      canonical !== machineJson ||
      sha256(machineJson) !== frontmatter.record_hash ||
      record.recordType !== frontmatter.record_type ||
      (record.recordType === "cognitive-object" && !mirrorsObjectFrontmatter(frontmatter, record)) ||
      (record.recordType === "cognition-event" && !mirrorsEventFrontmatter(frontmatter, record)) ||
      (record.recordType !== "cognitive-object" && record.recordType !== "cognition-event")
    ) {
      invalidMarkdownRecord();
    }
    return snapshotMarkdownRecord(record as MarkdownCognitionRecord);
  } catch (error) {
    if (error instanceof MarkdownCognitionError) {
      throw error;
    }
    invalidMarkdownRecord();
  }
}

function normalizedTitle(title: string): string {
  return title.normalize("NFC").toLocaleLowerCase("en-US");
}

function sortedObjects(records: readonly MarkdownCognitionRecord[]): readonly CognitiveObject[] {
  const selected = indexedObjects(records);
  return [...selected.values()].sort((left, right) =>
    left.type.localeCompare(right.type, "en-US") ||
    normalizedTitle(left.title).localeCompare(normalizedTitle(right.title), "en-US") ||
    left.id.localeCompare(right.id, "en-US") ||
    left.version - right.version,
  );
}

export function renderMarkdownCognitionIndex(records: readonly MarkdownCognitionRecord[]): string {
  const snapshots = snapshotMarkdownRecordList(records);
  const objects = sortedObjects(snapshots);
  const events = snapshots
    .filter((record): record is PortableCognitionRecord<"cognition-event"> => record.recordType === "cognition-event")
    .sort((left, right) => left.payload.objectId.localeCompare(right.payload.objectId, "en-US") || left.payload.id.localeCompare(right.payload.id, "en-US"));
  const lines = [
    "---",
    frontmatterLine("collective_cognition", MARKDOWN_COGNITION_PROFILE_VERSION),
    frontmatterLine("managed", true),
    frontmatterLine("record_type", "index"),
    "---",
    "",
    "# Collective Cognition Index",
    "",
    "> [!warning] Managed index",
    "> This index is a deterministic read-only projection.",
    "",
    "## Counts",
    "",
  ];
  for (const type of Object.keys(OBJECT_TYPE_DIRECTORIES) as ObjectType[]) {
    const entries = objects.filter((object) => object.type === type);
    const stateCounts = new Map<string, number>();
    for (const object of entries) {
      stateCounts.set(object.state, (stateCounts.get(object.state) ?? 0) + 1);
    }
    const states = [...stateCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([state, count]) => `${escapeMarkdownText(state)}=${count}`)
      .join(", ");
    lines.push(`- ${OBJECT_TYPE_DIRECTORIES[type]}: ${entries.length}${states === "" ? "" : ` (${states})`}`);
  }
  lines.push(
    "",
    "## Objects",
    "",
  );
  for (const type of Object.keys(OBJECT_TYPE_DIRECTORIES) as ObjectType[]) {
    const entries = objects.filter((object) => object.type === type);
    lines.push(`### ${OBJECT_TYPE_DIRECTORIES[type]}`, "");
    if (entries.length === 0) {
      lines.push("- None", "");
      continue;
    }
    for (const object of entries) {
      const path = objectRevisionPath(object.type, object.id, object.version).slice(0, -3);
      lines.push(`- [[${path}|${escapeMarkdownText(object.title)}]] — ${escapeMarkdownText(object.state)} (v${object.version})`);
    }
    lines.push("");
  }
  lines.push("## Audit Events", "");
  if (events.length === 0) {
    lines.push("- None");
  } else {
    for (const event of events) {
      const path = eventPath(event.payload.objectId, event.payload.id).slice(0, -3);
      lines.push(`- [[${path}|${escapeMarkdownText(event.payload.type)}]] — ${escapeMarkdownText(event.payload.occurredAt)}`);
    }
  }
  lines.push("");
  const result = lines.join("\n");
  if (Buffer.byteLength(result, "utf8") > MARKDOWN_COGNITION_MAX_NOTE_BYTES) {
    projectionLimitExceeded();
  }
  return result;
}
