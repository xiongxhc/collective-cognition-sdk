import { createHash } from "node:crypto";

import {
  markdownCognitionDigest,
  markdownCognitionManagedRelativePath,
  openMarkdownCognitionProjectionTarget,
  readMarkdownCognitionProjectionFile,
  removeMarkdownCognitionProjectionFile,
  replaceMarkdownCognitionProjectionFile,
} from "./markdown-cognition-target.ts";
import type {
  MarkdownCognitionTargetOptions,
  MarkdownManifestEntry,
  MarkdownTargetManifest,
} from "./markdown-cognition-target.ts";
import {
  MARKDOWN_COGNITION_MAX_NOTE_BYTES,
  MarkdownCognitionError,
  markdownCognitionRelativePath,
  parseMarkdownCognitionRecord,
  renderMarkdownCognitionIndex,
  renderMarkdownCognitionRecord,
} from "./markdown-cognition-profile.ts";
import type { MarkdownCognitionRecord } from "./markdown-cognition-profile.ts";
import { serializePortableCognitionRecord } from "./portable-cognition.ts";
import { canonicalizeJson } from "./source-records.ts";
import type { JsonValue } from "./types.ts";

export const MARKDOWN_COGNITION_MAX_RECORDS = 10_000;
export const MARKDOWN_COGNITION_MAX_TOTAL_BYTES = 128 * 1024 * 1024;
export const MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES = 10_001;
export const MARKDOWN_COGNITION_MAX_PATH_SEGMENTS = 4;
export const MARKDOWN_COGNITION_MAX_RELATIVE_PATH_BYTES = 512;

export interface MarkdownCognitionProjectionOptions
  extends MarkdownCognitionTargetOptions {
  readonly records: readonly MarkdownCognitionRecord[];
  readonly pruneManaged?: boolean;
}

export interface MarkdownCognitionProjectionReport {
  readonly created: readonly string[];
  readonly updated: readonly string[];
  readonly unchanged: readonly string[];
  readonly pruned: readonly string[];
}

interface ProjectionOptionsSnapshot {
  readonly pruneManaged: boolean;
  readonly records: readonly MarkdownCognitionRecord[];
  readonly targetDirectory: string;
}

interface DesiredFile {
  readonly bytes: Buffer;
  readonly digest: string;
  readonly recordHash?: string;
  readonly recordIdentity?: string;
  readonly recordType: "cognitive-object" | "cognition-event" | "index";
  readonly relativePath: string;
}

interface ProjectionPlan {
  readonly create: readonly DesiredFile[];
  readonly manifest: MarkdownTargetManifest;
  readonly manifestBytes: Buffer;
  readonly prune: readonly MarkdownManifestEntry[];
  readonly unchanged: readonly DesiredFile[];
  readonly update: readonly DesiredFile[];
}

function projectionInputError(): never {
  throw new MarkdownCognitionError(
    "invalid_projection_input",
    "Markdown cognition projection input is invalid.",
  );
}

function projectionLimitExceeded(relativePath?: string): never {
  throw new MarkdownCognitionError(
    "projection_limit_exceeded",
    "Markdown cognition projection exceeds a supported limit.",
    relativePath,
  );
}

function managedConflict(relativePath: string): never {
  throw new MarkdownCognitionError(
    "managed_file_conflict",
    "A managed Markdown cognition file has changed.",
    relativePath,
  );
}

function ownDataOptions(value: unknown): ProjectionOptionsSnapshot {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      projectionInputError();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const expected = ["targetDirectory", "records", "pruneManaged"];
    if (
      keys.length < 2 || keys.length > 3 ||
      !keys.every((key) => typeof key === "string" && expected.includes(key))
    ) {
      projectionInputError();
    }
    const targetDirectory = descriptors.targetDirectory;
    const records = descriptors.records;
    const pruneManaged = descriptors.pruneManaged;
    if (
      targetDirectory?.enumerable !== true || !("value" in targetDirectory) || typeof targetDirectory.value !== "string" ||
      records?.enumerable !== true || !("value" in records) ||
      (pruneManaged !== undefined && (
        pruneManaged.enumerable !== true || !("value" in pruneManaged) || typeof pruneManaged.value !== "boolean"
      ))
    ) {
      projectionInputError();
    }
    return Object.freeze({
      pruneManaged: pruneManaged === undefined ? false : pruneManaged.value as boolean,
      records: snapshotRecords(records.value),
      targetDirectory: targetDirectory.value,
    });
  } catch (error) {
    if (error instanceof MarkdownCognitionError) throw error;
    projectionInputError();
  }
}

function snapshotRecords(value: unknown): readonly MarkdownCognitionRecord[] {
  try {
    if (!Array.isArray(value)) projectionInputError();
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const length = descriptors.length;
    if (
      length === undefined || !("value" in length) ||
      typeof length.value !== "number" || !Number.isSafeInteger(length.value) || length.value < 0 ||
      length.value > MARKDOWN_COGNITION_MAX_RECORDS
    ) {
      if (length !== undefined && "value" in length && typeof length.value === "number" && length.value > MARKDOWN_COGNITION_MAX_RECORDS) {
        projectionLimitExceeded();
      }
      projectionInputError();
    }
    const accepted: MarkdownCognitionRecord[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
        projectionInputError();
      }
      const rendered = renderMarkdownCognitionRecord(descriptor.value as MarkdownCognitionRecord);
      accepted.push(parseMarkdownCognitionRecord(rendered));
    }
    return Object.freeze(accepted);
  } catch (error) {
    if (error instanceof MarkdownCognitionError) throw error;
    projectionInputError();
  }
}

function projectionIdentity(record: MarkdownCognitionRecord): string {
  return record.recordType === "cognitive-object"
    ? canonicalizeJson([
      "cognitive-object",
      record.payload.id,
      record.payload.version,
    ] as JsonValue)
    : canonicalizeJson(["cognition-event", record.payload.id] as JsonValue);
}

function canonicalRecord(record: MarkdownCognitionRecord): string {
  return serializePortableCognitionRecord(record);
}

function sortedUniqueRecords(records: readonly MarkdownCognitionRecord[]): readonly MarkdownCognitionRecord[] {
  const identities = new Map<string, { readonly canonical: string; readonly record: MarkdownCognitionRecord }>();
  for (const record of records) {
    const identity = projectionIdentity(record);
    const canonical = canonicalRecord(record);
    const previous = identities.get(identity);
    if (previous !== undefined) {
      if (previous.canonical !== canonical) projectionInputError();
      continue;
    }
    identities.set(identity, { canonical, record });
  }
  return Object.freeze([...identities.values()]
    .map((entry) => entry.record)
    .sort((left, right) => markdownCognitionRelativePath(left).localeCompare(markdownCognitionRelativePath(right), "en-US")));
}

function desiredFiles(records: readonly MarkdownCognitionRecord[]): readonly DesiredFile[] {
  const selected = sortedUniqueRecords(records);
  const files: DesiredFile[] = [];
  for (const record of selected) {
    const relativePath = markdownCognitionManagedRelativePath(markdownCognitionRelativePath(record));
    const canonical = canonicalRecord(record);
    const bytes = Buffer.from(renderMarkdownCognitionRecord(record, { records: selected }), "utf8");
    if (bytes.length > MARKDOWN_COGNITION_MAX_NOTE_BYTES) projectionLimitExceeded(relativePath);
    files.push(Object.freeze({
      bytes,
      digest: markdownCognitionDigest(bytes),
      recordHash: createHash("sha256").update(canonical, "utf8").digest("hex"),
      recordIdentity: projectionIdentity(record),
      recordType: record.recordType,
      relativePath,
    }));
  }
  const indexBytes = Buffer.from(renderMarkdownCognitionIndex(selected), "utf8");
  if (indexBytes.length > MARKDOWN_COGNITION_MAX_NOTE_BYTES) projectionLimitExceeded("Index.md");
  files.push(Object.freeze({
    bytes: indexBytes,
    digest: markdownCognitionDigest(indexBytes),
    recordType: "index",
    relativePath: "Index.md",
  }));
  if (files.length > MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES) projectionLimitExceeded();
  return Object.freeze(files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en-US")));
}

function desiredManifest(targetId: string, files: readonly DesiredFile[]): MarkdownTargetManifest {
  const entries = files.map((file) => file.recordType === "index"
    ? Object.freeze({ digest: file.digest, recordType: "index" as const, relativePath: file.relativePath })
    : Object.freeze({
      digest: file.digest,
      recordHash: file.recordHash!,
      recordIdentity: file.recordIdentity!,
      recordType: file.recordType,
      relativePath: file.relativePath,
    }));
  return Object.freeze({
    entries: Object.freeze(entries),
    format: "collective-cognition-markdown-manifest/1",
    profileVersion: "portable-cognition-markdown/0.1.0",
    targetId,
  });
}

function manifestBytes(manifest: MarkdownTargetManifest): Buffer {
  return Buffer.from(canonicalizeJson(manifest as unknown as JsonValue), "utf8");
}

function buildPlan(options: ProjectionOptionsSnapshot): { readonly plan: ProjectionPlan; readonly target: ReturnType<typeof openMarkdownCognitionProjectionTarget> } {
  const files = desiredFiles(options.records);
  const target = openMarkdownCognitionProjectionTarget({ targetDirectory: options.targetDirectory });
  const previousByPath = new Map(target.manifest.entries.map((entry) => [entry.relativePath, entry]));
  const create: DesiredFile[] = [];
  const update: DesiredFile[] = [];
  const unchanged: DesiredFile[] = [];
  for (const file of files) {
    const existing = readMarkdownCognitionProjectionFile(
      target,
      file.relativePath,
      MARKDOWN_COGNITION_MAX_NOTE_BYTES,
    );
    const previous = previousByPath.get(file.relativePath);
    if (previous === undefined) {
      if (existing === undefined) create.push(file);
      else if (existing.equals(file.bytes)) unchanged.push(file);
      else managedConflict(file.relativePath);
      continue;
    }
    if (existing === undefined || markdownCognitionDigest(existing) !== previous.digest) {
      managedConflict(file.relativePath);
    }
    if (existing.equals(file.bytes)) unchanged.push(file);
    else update.push(file);
  }
  const desiredPaths = new Set(files.map((file) => file.relativePath));
  const prune: MarkdownManifestEntry[] = [];
  for (const entry of target.manifest.entries) {
    if (desiredPaths.has(entry.relativePath)) continue;
    if (!options.pruneManaged) {
      unchanged.push(Object.freeze({
        bytes: Buffer.alloc(0),
        digest: entry.digest,
        recordType: entry.recordType,
        relativePath: entry.relativePath,
      }));
      continue;
    }
    const existing = readMarkdownCognitionProjectionFile(target, entry.relativePath, MARKDOWN_COGNITION_MAX_NOTE_BYTES);
    if (existing === undefined || markdownCognitionDigest(existing) !== entry.digest) {
      managedConflict(entry.relativePath);
    }
    prune.push(entry);
  }
  const retained: MarkdownManifestEntry[] = [];
  let retainedBytes = 0;
  for (const entry of target.manifest.entries) {
    if (desiredPaths.has(entry.relativePath)) continue;
    const existing = readMarkdownCognitionProjectionFile(target, entry.relativePath, MARKDOWN_COGNITION_MAX_NOTE_BYTES);
    if (existing === undefined || markdownCognitionDigest(existing) !== entry.digest) {
      managedConflict(entry.relativePath);
    }
    if (!options.pruneManaged) {
      retained.push(entry);
      retainedBytes += existing.length;
    }
  }
  const desired = desiredManifest(target.marker.targetId, files);
  const manifest = Object.freeze({
    ...desired,
    entries: Object.freeze([...desired.entries, ...retained]
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en-US"))),
  });
  if (manifest.entries.length > MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES) {
    projectionLimitExceeded();
  }
  const nextManifestBytes = manifestBytes(manifest);
  const totalBytes = files.reduce(
    (total, file) => total + file.bytes.length,
    target.markerBytes.length + nextManifestBytes.length + retainedBytes,
  );
  if (totalBytes > MARKDOWN_COGNITION_MAX_TOTAL_BYTES) projectionLimitExceeded();
  return Object.freeze({
    plan: Object.freeze({
      create: Object.freeze(create.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en-US"))),
      manifest,
      manifestBytes: nextManifestBytes,
      prune: Object.freeze(prune.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en-US"))),
      unchanged: Object.freeze(unchanged.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en-US"))),
      update: Object.freeze(update.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en-US"))),
    }),
    target,
  });
}

function report(plan: ProjectionPlan): MarkdownCognitionProjectionReport {
  return Object.freeze({
    created: Object.freeze(plan.create.map((file) => file.relativePath)),
    pruned: Object.freeze(plan.prune.map((entry) => entry.relativePath)),
    unchanged: Object.freeze(plan.unchanged.map((file) => file.relativePath)),
    updated: Object.freeze(plan.update.map((file) => file.relativePath)),
  });
}

export async function projectMarkdownCognition(
  options: MarkdownCognitionProjectionOptions,
): Promise<MarkdownCognitionProjectionReport> {
  const snapshot = ownDataOptions(options);
  const { plan, target } = buildPlan(snapshot);
  try {
    for (const file of [...plan.create, ...plan.update]) {
      replaceMarkdownCognitionProjectionFile(target, file.relativePath, file.bytes);
    }
    for (const entry of plan.prune) {
      removeMarkdownCognitionProjectionFile(target, entry.relativePath, entry.digest);
    }
    if (!target.manifestBytes.equals(plan.manifestBytes)) {
      replaceMarkdownCognitionProjectionFile(
        target,
        ".collective-cognition-manifest.json",
        plan.manifestBytes,
      );
    }
  } catch (error) {
    if (error instanceof MarkdownCognitionError) throw error;
    throw new MarkdownCognitionError(
      "projection_io_failed",
      "Markdown cognition projection failed.",
    );
  }
  return report(plan);
}
