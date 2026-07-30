import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { isAbsolute, join, normalize, parse, posix, relative, sep } from "node:path";

import { parseProfiledJson } from "./json-text.ts";
import {
  MARKDOWN_COGNITION_PROFILE_VERSION,
  MarkdownCognitionError,
} from "./markdown-cognition-profile.ts";
import type { MarkdownCognitionErrorCode } from "./markdown-cognition-profile.ts";
import { canonicalizeJson } from "./source-records.ts";
import { isUnicodeScalarString } from "./types.ts";
import type { JsonValue } from "./types.ts";

export const MARKDOWN_COGNITION_TARGET_FORMAT =
  "collective-cognition-markdown-target/1";
export const MARKDOWN_COGNITION_MARKER_FILE = ".collective-cognition.json";
export const MARKDOWN_COGNITION_MANIFEST_FILE =
  ".collective-cognition-manifest.json";

const MARKDOWN_COGNITION_MANIFEST_FORMAT =
  "collective-cognition-markdown-manifest/1";
const TARGET_ID_PATTERN = /^[0-9a-f]{32}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_MANIFEST_ENTRIES = 10_001;
const MAX_TARGET_BYTES = 128 * 1024 * 1024;
const MAX_RELATIVE_PATH_BYTES = 512;
const MAX_PATH_SEGMENTS = 4;

export interface MarkdownCognitionTargetOptions {
  readonly targetDirectory: string;
}

export interface MarkdownCognitionVerificationDiagnostic {
  readonly code: MarkdownCognitionErrorCode;
  readonly message: string;
  readonly relativePath?: string;
}

export interface MarkdownCognitionVerificationReport {
  readonly status: "passed" | "failed";
  readonly diagnostics: readonly MarkdownCognitionVerificationDiagnostic[];
  readonly managedPaths: readonly string[];
}

interface MarkdownTargetMarker {
  readonly format: typeof MARKDOWN_COGNITION_TARGET_FORMAT;
  readonly profileVersion: typeof MARKDOWN_COGNITION_PROFILE_VERSION;
  readonly targetId: string;
  readonly initializedByPackageVersion: string;
}

interface MarkdownManifestEntry {
  readonly relativePath: string;
  readonly digest: string;
  readonly recordType: "cognitive-object" | "cognition-event" | "index";
  readonly recordIdentity?: string;
  readonly recordHash?: string;
}

interface MarkdownTargetManifest {
  readonly format: typeof MARKDOWN_COGNITION_MANIFEST_FORMAT;
  readonly profileVersion: typeof MARKDOWN_COGNITION_PROFILE_VERSION;
  readonly targetId: string;
  readonly entries: readonly MarkdownManifestEntry[];
}

interface RegularFile {
  readonly contents: string;
  readonly bytes: number;
}

interface PathInspection {
  readonly kind: "present" | "missing" | "unsafe";
}

function invalidTarget(): never {
  throw new MarkdownCognitionError(
    "invalid_target",
    "Markdown cognition target is invalid.",
  );
}

function snapshotTargetOptions(
  value: MarkdownCognitionTargetOptions,
): MarkdownCognitionTargetOptions {
  try {
    if (typeof value !== "object" || value === null) {
      invalidTarget();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const targetDirectory = descriptors.targetDirectory;
    if (
      keys.length !== 1 ||
      keys[0] !== "targetDirectory" ||
      targetDirectory?.enumerable !== true ||
      !("value" in targetDirectory) ||
      typeof targetDirectory.value !== "string"
    ) {
      invalidTarget();
    }
    return Object.freeze({ targetDirectory: targetDirectory.value });
  } catch (error) {
    if (error instanceof MarkdownCognitionError) {
      throw error;
    }
    invalidTarget();
  }
}

function normalizedTargetDirectory(options: MarkdownCognitionTargetOptions): string {
  const targetDirectory = snapshotTargetOptions(options).targetDirectory;
  if (
    targetDirectory.length === 0 ||
    targetDirectory.includes("\0") ||
    !isAbsolute(targetDirectory) ||
    normalize(targetDirectory) !== targetDirectory ||
    targetDirectory === parse(targetDirectory).root
  ) {
    invalidTarget();
  }
  return targetDirectory;
}

function packageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { readonly version?: unknown };
    if (
      typeof packageJson.version !== "string" ||
      packageJson.version.length === 0 ||
      !isUnicodeScalarString(packageJson.version)
    ) {
      throw new Error("invalid version");
    }
    return packageJson.version;
  } catch {
    throw new MarkdownCognitionError(
      "projection_io_failed",
      "Markdown cognition target initialization failed.",
    );
  }
}

function pathSegments(targetDirectory: string): readonly string[] {
  const root = parse(targetDirectory).root;
  const suffix = relative(root, targetDirectory);
  return suffix === "" ? [] : suffix.split(sep);
}

function inspectPath(targetDirectory: string): PathInspection {
  const root = parse(targetDirectory).root;
  let current = root;
  for (const segment of pathSegments(targetDirectory)) {
    current = join(current, segment);
    let entry: ReturnType<typeof lstatSync>;
    try {
      entry = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { kind: "missing" };
      }
      return { kind: "unsafe" };
    }
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      return { kind: "unsafe" };
    }
  }
  return { kind: "present" };
}

function requireSafeExistingParent(targetDirectory: string): void {
  const parentDirectory = parse(targetDirectory).dir;
  if (inspectPath(parentDirectory).kind !== "present") {
    invalidTarget();
  }
}

function requireEmptySafeDirectory(targetDirectory: string): "existing" | "created" {
  const target = inspectPath(targetDirectory);
  if (target.kind === "unsafe") {
    invalidTarget();
  }
  if (target.kind === "missing") {
    requireSafeExistingParent(targetDirectory);
    try {
      mkdirSync(targetDirectory);
      return "created";
    } catch {
      invalidTarget();
    }
  }
  try {
    if (readdirSync(targetDirectory).length !== 0) {
      invalidTarget();
    }
    return "existing";
  } catch (error) {
    if (error instanceof MarkdownCognitionError) {
      throw error;
    }
    invalidTarget();
  }
}

function temporaryPath(targetDirectory: string): string {
  return join(
    targetDirectory,
    `.collective-cognition-tmp-${randomBytes(16).toString("hex")}`,
  );
}

function writeCanonicalFile(targetDirectory: string, name: string, contents: string): void {
  const temporary = temporaryPath(targetDirectory);
  let fileDescriptor: number | undefined;
  try {
    fileDescriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    const bytes = Buffer.from(contents, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(fileDescriptor, bytes, offset);
    }
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;
    renameSync(temporary, join(targetDirectory, name));
  } catch {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
    try {
      rmSync(temporary, { force: true });
    } catch {}
    throw new MarkdownCognitionError(
      "projection_io_failed",
      "Markdown cognition target initialization failed.",
    );
  }
}

function ownDataObject(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    return undefined;
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor)
    ) {
      return undefined;
    }
    result[key] = descriptor.value;
  }
  return result;
}

function canonicalJsonValue(text: string): unknown | undefined {
  try {
    const value = parseProfiledJson(text);
    if (canonicalizeJson(value as JsonValue) !== text) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

function parseMarker(contents: string): MarkdownTargetMarker | undefined {
  const value = canonicalJsonValue(contents);
  const object = ownDataObject(value, [
    "format",
    "initializedByPackageVersion",
    "profileVersion",
    "targetId",
  ]);
  if (
    object === undefined ||
    object.format !== MARKDOWN_COGNITION_TARGET_FORMAT ||
    object.profileVersion !== MARKDOWN_COGNITION_PROFILE_VERSION ||
    typeof object.targetId !== "string" ||
    !TARGET_ID_PATTERN.test(object.targetId) ||
    typeof object.initializedByPackageVersion !== "string" ||
    object.initializedByPackageVersion.length === 0 ||
    !isUnicodeScalarString(object.initializedByPackageVersion)
  ) {
    return undefined;
  }
  return Object.freeze({
    format: MARKDOWN_COGNITION_TARGET_FORMAT,
    initializedByPackageVersion: object.initializedByPackageVersion,
    profileVersion: MARKDOWN_COGNITION_PROFILE_VERSION,
    targetId: object.targetId,
  });
}

function safeRelativePath(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !isUnicodeScalarString(value) ||
    Buffer.byteLength(value, "utf8") > MAX_RELATIVE_PATH_BYTES ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value !== posix.normalize(value)
  ) {
    return undefined;
  }
  const parts = value.split("/");
  if (
    parts.length === 0 ||
    parts.length > MAX_PATH_SEGMENTS ||
    parts.some((part) =>
      part === "" ||
      part === "." ||
      part === ".." ||
      /[<>:"|?*\u0000-\u001f]/.test(part)
    )
  ) {
    return undefined;
  }
  return value;
}

function parseManifestEntry(value: unknown): MarkdownManifestEntry | undefined {
  const index = ownDataObject(value, ["digest", "recordType", "relativePath"]);
  if (
    index !== undefined &&
    index.recordType === "index" &&
    typeof index.digest === "string" &&
    SHA256_PATTERN.test(index.digest)
  ) {
    const relativePath = safeRelativePath(index.relativePath);
    return relativePath === undefined
      ? undefined
      : Object.freeze({ digest: index.digest, recordType: "index", relativePath });
  }
  const record = ownDataObject(value, [
    "digest",
    "recordHash",
    "recordIdentity",
    "recordType",
    "relativePath",
  ]);
  if (
    record === undefined ||
    (record.recordType !== "cognitive-object" && record.recordType !== "cognition-event") ||
    typeof record.digest !== "string" ||
    !SHA256_PATTERN.test(record.digest) ||
    typeof record.recordHash !== "string" ||
    !SHA256_PATTERN.test(record.recordHash) ||
    typeof record.recordIdentity !== "string" ||
    record.recordIdentity.length === 0 ||
    !isUnicodeScalarString(record.recordIdentity)
  ) {
    return undefined;
  }
  const relativePath = safeRelativePath(record.relativePath);
  return relativePath === undefined
    ? undefined
    : Object.freeze({
      digest: record.digest,
      recordHash: record.recordHash,
      recordIdentity: record.recordIdentity,
      recordType: record.recordType,
      relativePath,
    });
}

function parseManifest(contents: string): MarkdownTargetManifest | undefined {
  const value = canonicalJsonValue(contents);
  const object = ownDataObject(value, [
    "entries",
    "format",
    "profileVersion",
    "targetId",
  ]);
  if (
    object === undefined ||
    object.format !== MARKDOWN_COGNITION_MANIFEST_FORMAT ||
    object.profileVersion !== MARKDOWN_COGNITION_PROFILE_VERSION ||
    typeof object.targetId !== "string" ||
    !TARGET_ID_PATTERN.test(object.targetId) ||
    !Array.isArray(object.entries) ||
    object.entries.length > MAX_MANIFEST_ENTRIES
  ) {
    return undefined;
  }
  const entries: MarkdownManifestEntry[] = [];
  const paths = new Set<string>();
  const identities = new Set<string>();
  for (const value of object.entries) {
    const entry = parseManifestEntry(value);
    if (
      entry === undefined ||
      paths.has(entry.relativePath) ||
      (entry.recordIdentity !== undefined && identities.has(entry.recordIdentity))
    ) {
      return undefined;
    }
    paths.add(entry.relativePath);
    if (entry.recordIdentity !== undefined) {
      identities.add(entry.recordIdentity);
    }
    entries.push(entry);
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    format: MARKDOWN_COGNITION_MANIFEST_FORMAT,
    profileVersion: MARKDOWN_COGNITION_PROFILE_VERSION,
    targetId: object.targetId,
  });
}

function hasUnsafeManifestPath(contents: string): boolean {
  const value = canonicalJsonValue(contents);
  const object = ownDataObject(value, [
    "entries",
    "format",
    "profileVersion",
    "targetId",
  ]);
  if (object === undefined || !Array.isArray(object.entries)) {
    return false;
  }
  for (const entry of object.entries) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptors(entry).relativePath;
    if (
      descriptor !== undefined &&
      descriptor.enumerable === true &&
      "value" in descriptor &&
      safeRelativePath(descriptor.value) === undefined
    ) {
      return true;
    }
  }
  return false;
}

function inspectManagedPath(targetDirectory: string, relativePath: string): PathInspection {
  let current = targetDirectory;
  const parts = relativePath.split("/");
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    let entry: ReturnType<typeof lstatSync>;
    try {
      entry = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { kind: "missing" };
      }
      return { kind: "unsafe" };
    }
    if (entry.isSymbolicLink()) {
      return { kind: "unsafe" };
    }
    if (index < parts.length - 1 && !entry.isDirectory()) {
      return { kind: "unsafe" };
    }
  }
  return { kind: "present" };
}

function readRegularFileNoFollow(
  targetDirectory: string,
  relativePath: string,
): RegularFile | undefined {
  if (inspectManagedPath(targetDirectory, relativePath).kind !== "present") {
    return undefined;
  }
  const absolutePath = join(targetDirectory, ...relativePath.split("/"));
  let fileDescriptor: number | undefined;
  try {
    fileDescriptor = openSync(
      absolutePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const entry = fstatSync(fileDescriptor);
    if (!entry.isFile() || entry.nlink !== 1 || entry.size > MAX_TARGET_BYTES) {
      closeSync(fileDescriptor);
      fileDescriptor = undefined;
      return undefined;
    }
    const contents = readFileSync(fileDescriptor, "utf8");
    closeSync(fileDescriptor);
    fileDescriptor = undefined;
    return Object.freeze({ bytes: Buffer.byteLength(contents, "utf8"), contents });
  } catch {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
    return undefined;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function diagnostic(
  code: MarkdownCognitionErrorCode,
  message: string,
  relativePath?: string,
): MarkdownCognitionVerificationDiagnostic {
  return relativePath === undefined
    ? Object.freeze({ code, message })
    : Object.freeze({ code, message, relativePath });
}

function finalizedReport(
  diagnostics: readonly MarkdownCognitionVerificationDiagnostic[],
  managedPaths: readonly string[],
): MarkdownCognitionVerificationReport {
  return deepFreeze({
    diagnostics: [...diagnostics],
    managedPaths: [...managedPaths].sort(),
    status: diagnostics.length === 0 ? "passed" : "failed",
  });
}

export async function initializeMarkdownCognitionTarget(
  options: MarkdownCognitionTargetOptions,
): Promise<void> {
  const targetDirectory = normalizedTargetDirectory(options);
  requireEmptySafeDirectory(targetDirectory);
  const marker: MarkdownTargetMarker = {
    format: MARKDOWN_COGNITION_TARGET_FORMAT,
    initializedByPackageVersion: packageVersion(),
    profileVersion: MARKDOWN_COGNITION_PROFILE_VERSION,
    targetId: randomBytes(16).toString("hex"),
  };
  const manifest: MarkdownTargetManifest = {
    entries: [],
    format: MARKDOWN_COGNITION_MANIFEST_FORMAT,
    profileVersion: MARKDOWN_COGNITION_PROFILE_VERSION,
    targetId: marker.targetId,
  };
  writeCanonicalFile(
    targetDirectory,
    MARKDOWN_COGNITION_MARKER_FILE,
    canonicalizeJson(marker as unknown as JsonValue),
  );
  writeCanonicalFile(
    targetDirectory,
    MARKDOWN_COGNITION_MANIFEST_FILE,
    canonicalizeJson(manifest as unknown as JsonValue),
  );
}

export async function verifyMarkdownCognitionTarget(
  options: MarkdownCognitionTargetOptions,
): Promise<MarkdownCognitionVerificationReport> {
  const targetDirectory = normalizedTargetDirectory(options);
  const target = inspectPath(targetDirectory);
  if (target.kind === "missing") {
    return finalizedReport([
      diagnostic("target_not_initialized", "Markdown cognition target is not initialized."),
    ], []);
  }
  if (target.kind === "unsafe") {
    return finalizedReport([
      diagnostic("unsafe_target_entry", "Markdown cognition target contains an unsafe entry."),
    ], []);
  }

  const diagnostics: MarkdownCognitionVerificationDiagnostic[] = [];
  const managedPaths = [
    MARKDOWN_COGNITION_MARKER_FILE,
    MARKDOWN_COGNITION_MANIFEST_FILE,
  ];
  const markerInspection = inspectManagedPath(targetDirectory, MARKDOWN_COGNITION_MARKER_FILE);
  const manifestInspection = inspectManagedPath(targetDirectory, MARKDOWN_COGNITION_MANIFEST_FILE);
  if (markerInspection.kind === "unsafe" || manifestInspection.kind === "unsafe") {
    return finalizedReport([
      diagnostic("unsafe_target_entry", "Markdown cognition target contains an unsafe entry."),
    ], managedPaths);
  }
  if (markerInspection.kind === "missing" || manifestInspection.kind === "missing") {
    return finalizedReport([
      diagnostic("target_not_initialized", "Markdown cognition target is not initialized."),
    ], managedPaths);
  }
  const markerFile = readRegularFileNoFollow(targetDirectory, MARKDOWN_COGNITION_MARKER_FILE);
  const manifestFile = readRegularFileNoFollow(targetDirectory, MARKDOWN_COGNITION_MANIFEST_FILE);
  if (markerFile === undefined || manifestFile === undefined) {
    diagnostics.push(diagnostic(
      "unsafe_target_entry",
      "Markdown cognition target contains an unsafe entry.",
    ));
    return finalizedReport(diagnostics, managedPaths);
  }

  const marker = parseMarker(markerFile.contents);
  const manifest = parseManifest(manifestFile.contents);
  if (marker === undefined || manifest === undefined || marker.targetId !== manifest.targetId) {
    const unsafeManifestPath = manifest === undefined && hasUnsafeManifestPath(manifestFile.contents);
    diagnostics.push(diagnostic(
      unsafeManifestPath ? "unsafe_target_entry" : "incompatible_target",
      unsafeManifestPath
        ? "Markdown cognition target contains an unsafe entry."
        : "Markdown cognition target is incompatible.",
    ));
    return finalizedReport(diagnostics, managedPaths);
  }

  let totalBytes = markerFile.bytes + manifestFile.bytes;
  for (const entry of manifest.entries) {
    managedPaths.push(entry.relativePath);
    const file = readRegularFileNoFollow(targetDirectory, entry.relativePath);
    if (file === undefined) {
      diagnostics.push(diagnostic(
        "unsafe_target_entry",
        "Markdown cognition target contains an unsafe entry.",
        entry.relativePath,
      ));
      continue;
    }
    totalBytes += file.bytes;
    if (totalBytes > MAX_TARGET_BYTES || !SHA256_PATTERN.test(entry.digest) || entry.digest !== createDigest(file.contents)) {
      diagnostics.push(diagnostic(
        "incompatible_target",
        "Markdown cognition target is incompatible.",
        entry.relativePath,
      ));
    }
  }
  return finalizedReport(diagnostics, managedPaths);
}

function createDigest(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}
