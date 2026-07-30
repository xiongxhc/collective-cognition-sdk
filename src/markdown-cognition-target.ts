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
  unlinkSync,
  writeSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { isAbsolute, join, normalize, parse, posix, relative, sep } from "node:path";
import { TextDecoder } from "node:util";

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

export type MarkdownCognitionTargetTestEvent =
  | "initialize:after-target-inspection"
  | "initialize:before-manifest-commit"
  | "projection:before-replace"
  | "verify:after-target-inspection"
  | "verify:before-managed-open";

type MarkdownCognitionTargetTestHook = (
  event: MarkdownCognitionTargetTestEvent,
  relativePath?: string,
) => void;

let testHook: MarkdownCognitionTargetTestHook | undefined;

export function setMarkdownCognitionTargetTestHook(
  hook: MarkdownCognitionTargetTestHook | undefined,
): void {
  testHook = hook;
}

function invokeMarkdownCognitionTargetTestHook(
  event: MarkdownCognitionTargetTestEvent,
  relativePath?: string,
): void {
  testHook?.(event, relativePath);
}

const MARKDOWN_COGNITION_MANIFEST_FORMAT =
  "collective-cognition-markdown-manifest/1";
const TARGET_ID_PATTERN = /^[0-9a-f]{32}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_MANIFEST_ENTRIES = 10_001;
const MAX_TARGET_BYTES = 128 * 1024 * 1024;
const MAX_RELATIVE_PATH_BYTES = 512;
const MAX_PATH_SEGMENTS = 4;
const READ_LIMIT_EXCEEDED = Symbol("markdown-cognition-read-limit-exceeded");
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const WINDOWS_RESERVED_NAME_PATTERN =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/iu;

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

export interface MarkdownTargetMarker {
  readonly format: typeof MARKDOWN_COGNITION_TARGET_FORMAT;
  readonly profileVersion: typeof MARKDOWN_COGNITION_PROFILE_VERSION;
  readonly targetId: string;
  readonly initializedByPackageVersion: string;
}

export interface MarkdownManifestEntry {
  readonly relativePath: string;
  readonly digest: string;
  readonly recordType: "cognitive-object" | "cognition-event" | "index";
  readonly recordIdentity?: string;
  readonly recordHash?: string;
}

export interface MarkdownTargetManifest {
  readonly format: typeof MARKDOWN_COGNITION_MANIFEST_FORMAT;
  readonly profileVersion: typeof MARKDOWN_COGNITION_PROFILE_VERSION;
  readonly targetId: string;
  readonly entries: readonly MarkdownManifestEntry[];
}

interface RegularFile {
  readonly bytes: Buffer;
}

interface PathInspection {
  readonly kind: "present" | "missing" | "unsafe";
}

export interface MarkdownCognitionPathIdentity {
  readonly path: string;
  readonly device: number;
  readonly inode: number;
  readonly mode: number;
}

interface StagedFile {
  readonly finalName: string;
  readonly temporaryName: string;
  readonly identity: MarkdownCognitionPathIdentity;
}

export interface MarkdownCognitionProjectionTarget {
  readonly marker: MarkdownTargetMarker;
  readonly markerBytes: Uint8Array;
  readonly manifest: MarkdownTargetManifest;
  readonly manifestBytes: Uint8Array;
  readonly targetChain: readonly MarkdownCognitionPathIdentity[];
  readonly targetDirectory: string;
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

function pathIdentity(
  path: string,
  entry: Stats,
): MarkdownCognitionPathIdentity {
  return Object.freeze({
    device: entry.dev,
    inode: entry.ino,
    mode: entry.mode,
    path,
  });
}

function sameIdentity(
  left: Pick<MarkdownCognitionPathIdentity, "device" | "inode" | "mode">,
  right: Pick<MarkdownCognitionPathIdentity, "device" | "inode" | "mode">,
): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode
  );
}

function snapshotDirectoryChain(
  directory: string,
): readonly MarkdownCognitionPathIdentity[] | undefined {
  const root = parse(directory).root;
  const paths = [root];
  let current = root;
  for (const segment of pathSegments(directory)) {
    current = join(current, segment);
    paths.push(current);
  }
  const identities: MarkdownCognitionPathIdentity[] = [];
  try {
    for (const path of paths) {
      const entry = lstatSync(path);
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        return undefined;
      }
      identities.push(pathIdentity(path, entry));
    }
    return Object.freeze(identities);
  } catch {
    return undefined;
  }
}

function directoryChainMatches(chain: readonly MarkdownCognitionPathIdentity[]): boolean {
  try {
    for (const identity of chain) {
      const entry = lstatSync(identity.path);
      if (
        entry.isSymbolicLink() ||
        !entry.isDirectory() ||
        !sameIdentity(identity, pathIdentity(identity.path, entry))
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
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

function temporaryName(): string {
  return `.collective-cognition-tmp-${randomBytes(16).toString("hex")}`;
}

function closeFile(fileDescriptor: number | undefined): void {
  if (fileDescriptor === undefined) {
    return;
  }
  try {
    closeSync(fileDescriptor);
  } catch {}
}

function stageCanonicalFile(
  targetDirectory: string,
  targetChain: readonly MarkdownCognitionPathIdentity[],
  finalName: string,
  contents: string,
): StagedFile {
  const stagedName = temporaryName();
  const stagedPath = join(targetDirectory, stagedName);
  let fileDescriptor: number | undefined;
  let stagedIdentity: MarkdownCognitionPathIdentity | undefined;
  try {
    if (!directoryChainMatches(targetChain)) {
      throw new Error("target changed");
    }
    fileDescriptor = openSync(
      stagedPath,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const descriptorEntry = fstatSync(fileDescriptor);
    const pathEntry = lstatSync(stagedPath);
    const identity = pathIdentity(stagedPath, pathEntry);
    stagedIdentity = identity;
    if (
      !descriptorEntry.isFile() ||
      descriptorEntry.nlink !== 1 ||
      pathEntry.isSymbolicLink() ||
      !pathEntry.isFile() ||
      pathEntry.nlink !== 1 ||
      !sameIdentity(identity, {
        device: descriptorEntry.dev,
        inode: descriptorEntry.ino,
        mode: descriptorEntry.mode,
      }) ||
      !directoryChainMatches(targetChain)
    ) {
      throw new Error("unsafe staged file");
    }
    const bytes = Buffer.from(contents, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(fileDescriptor, bytes, offset);
    }
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;
    const finalEntry = lstatSync(stagedPath);
    if (
      !finalEntry.isFile() ||
      finalEntry.nlink !== 1 ||
      !sameIdentity(identity, pathIdentity(stagedPath, finalEntry)) ||
      !directoryChainMatches(targetChain)
    ) {
      throw new Error("staged file changed");
    }
    return Object.freeze({
      finalName,
      identity,
      temporaryName: stagedName,
    });
  } catch {
    closeFile(fileDescriptor);
    if (stagedIdentity !== undefined) {
      cleanupOwnedPath(
        targetDirectory,
        targetChain,
        stagedName,
        stagedIdentity,
      );
    }
    throw new Error("staging failed");
  }
}

function ownedPathMatches(
  targetDirectory: string,
  targetChain: readonly MarkdownCognitionPathIdentity[],
  name: string,
  expectedIdentity: MarkdownCognitionPathIdentity | undefined,
): boolean {
  if (!directoryChainMatches(targetChain)) {
    return false;
  }
  try {
    const entry = lstatSync(join(targetDirectory, name));
    return (
      !entry.isSymbolicLink() &&
      entry.isFile() &&
      entry.nlink === 1 &&
      directoryChainMatches(targetChain) &&
      (expectedIdentity === undefined ||
        sameIdentity(expectedIdentity, pathIdentity(name, entry)))
    );
  } catch {
    return false;
  }
}

function cleanupOwnedPath(
  targetDirectory: string,
  targetChain: readonly MarkdownCognitionPathIdentity[],
  name: string,
  expectedIdentity: MarkdownCognitionPathIdentity | undefined,
): void {
  if (!ownedPathMatches(targetDirectory, targetChain, name, expectedIdentity)) {
    return;
  }
  try {
    unlinkSync(join(targetDirectory, name));
  } catch {}
}

function commitStagedFile(
  targetDirectory: string,
  targetChain: readonly MarkdownCognitionPathIdentity[],
  staged: StagedFile,
): void {
  const stagedPath = join(targetDirectory, staged.temporaryName);
  const finalPath = join(targetDirectory, staged.finalName);
  if (
    !ownedPathMatches(
      targetDirectory,
      targetChain,
      staged.temporaryName,
      staged.identity,
    )
  ) {
    throw new Error("staged file changed");
  }
  try {
    lstatSync(finalPath);
    throw new Error("final path exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  if (!directoryChainMatches(targetChain)) {
    throw new Error("target changed");
  }
  renameSync(stagedPath, finalPath);
  if (
    !ownedPathMatches(
      targetDirectory,
      targetChain,
      staged.finalName,
      staged.identity,
    )
  ) {
    throw new Error("commit changed");
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

function decodeUtf8(bytes: Buffer): string | undefined {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    return undefined;
  }
}

function canonicalJsonValue(bytes: Buffer): unknown | undefined {
  const text = decodeUtf8(bytes);
  if (text === undefined) {
    return undefined;
  }
  try {
    const value = parseProfiledJson(text);
    const canonicalBytes = Buffer.from(
      canonicalizeJson(value as JsonValue),
      "utf8",
    );
    if (!canonicalBytes.equals(bytes)) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

function parseMarker(contents: Buffer): MarkdownTargetMarker | undefined {
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
      part.endsWith(".") ||
      part.endsWith(" ") ||
      WINDOWS_RESERVED_NAME_PATTERN.test(part) ||
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

function parseManifest(contents: Buffer): MarkdownTargetManifest | undefined {
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

function hasUnsafeManifestPath(contents: Buffer): boolean {
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
  targetChain: readonly MarkdownCognitionPathIdentity[],
  maximumBytes: number,
): RegularFile | typeof READ_LIMIT_EXCEEDED | undefined {
  if (inspectManagedPath(targetDirectory, relativePath).kind !== "present") {
    return undefined;
  }
  const parts = relativePath.split("/");
  const parentDirectory = join(targetDirectory, ...parts.slice(0, -1));
  const parentChain = snapshotDirectoryChain(parentDirectory);
  if (
    parentChain === undefined ||
    !directoryChainMatches(targetChain) ||
    !directoryChainMatches(parentChain)
  ) {
    return undefined;
  }
  invokeMarkdownCognitionTargetTestHook("verify:before-managed-open", relativePath);
  if (
    !directoryChainMatches(targetChain) ||
    !directoryChainMatches(parentChain)
  ) {
    return undefined;
  }
  const absolutePath = join(targetDirectory, ...parts);
  let fileDescriptor: number | undefined;
  try {
    fileDescriptor = openSync(
      absolutePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const descriptorBefore = fstatSync(fileDescriptor);
    const pathEntry = lstatSync(absolutePath);
    if (
      !descriptorBefore.isFile() ||
      descriptorBefore.nlink !== 1 ||
      pathEntry.isSymbolicLink() ||
      !pathEntry.isFile() ||
      pathEntry.nlink !== 1 ||
      !sameIdentity(pathIdentity(absolutePath, pathEntry), {
        device: descriptorBefore.dev,
        inode: descriptorBefore.ino,
        mode: descriptorBefore.mode,
      }) ||
      !directoryChainMatches(targetChain) ||
      !directoryChainMatches(parentChain)
    ) {
      closeFile(fileDescriptor);
      fileDescriptor = undefined;
      return undefined;
    }
    if (descriptorBefore.size > maximumBytes) {
      closeFile(fileDescriptor);
      fileDescriptor = undefined;
      return READ_LIMIT_EXCEEDED;
    }
    const contents = readFileSync(fileDescriptor);
    const descriptorAfter = fstatSync(fileDescriptor);
    closeFile(fileDescriptor);
    fileDescriptor = undefined;
    if (
      !sameIdentity(
        {
          device: descriptorBefore.dev,
          inode: descriptorBefore.ino,
          mode: descriptorBefore.mode,
        },
        {
          device: descriptorAfter.dev,
          inode: descriptorAfter.ino,
          mode: descriptorAfter.mode,
        },
      ) ||
      descriptorBefore.size !== descriptorAfter.size ||
      descriptorBefore.mtimeMs !== descriptorAfter.mtimeMs ||
      descriptorBefore.ctimeMs !== descriptorAfter.ctimeMs ||
      !directoryChainMatches(targetChain) ||
      !directoryChainMatches(parentChain)
    ) {
      return undefined;
    }
    return Object.freeze({ bytes: contents });
  } catch {
    closeFile(fileDescriptor);
    return undefined;
  }
}

function targetNotInitialized(): never {
  throw new MarkdownCognitionError(
    "target_not_initialized",
    "Markdown cognition target is not initialized.",
  );
}

function incompatibleTarget(): never {
  throw new MarkdownCognitionError(
    "incompatible_target",
    "Markdown cognition target is incompatible.",
  );
}

function unsafeTargetEntry(relativePath?: string): never {
  throw new MarkdownCognitionError(
    "unsafe_target_entry",
    "Markdown cognition target contains an unsafe entry.",
    relativePath,
  );
}

export function openMarkdownCognitionProjectionTarget(
  options: MarkdownCognitionTargetOptions,
): MarkdownCognitionProjectionTarget {
  const targetDirectory = normalizedTargetDirectory(options);
  if (inspectPath(targetDirectory).kind === "missing") {
    targetNotInitialized();
  }
  if (inspectPath(targetDirectory).kind === "unsafe") {
    unsafeTargetEntry();
  }
  const targetChain = snapshotDirectoryChain(targetDirectory);
  if (targetChain === undefined || !directoryChainMatches(targetChain)) {
    unsafeTargetEntry();
  }
  const markerInspection = inspectManagedPath(targetDirectory, MARKDOWN_COGNITION_MARKER_FILE);
  const manifestInspection = inspectManagedPath(targetDirectory, MARKDOWN_COGNITION_MANIFEST_FILE);
  if (markerInspection.kind === "missing" || manifestInspection.kind === "missing") {
    targetNotInitialized();
  }
  if (markerInspection.kind === "unsafe" || manifestInspection.kind === "unsafe") {
    unsafeTargetEntry();
  }
  const markerFile = readRegularFileNoFollow(
    targetDirectory,
    MARKDOWN_COGNITION_MARKER_FILE,
    targetChain,
    MAX_TARGET_BYTES,
  );
  if (markerFile === READ_LIMIT_EXCEEDED) {
    incompatibleTarget();
  }
  if (markerFile === undefined) {
    unsafeTargetEntry();
  }
  const manifestFile = readRegularFileNoFollow(
    targetDirectory,
    MARKDOWN_COGNITION_MANIFEST_FILE,
    targetChain,
    MAX_TARGET_BYTES - markerFile.bytes.length,
  );
  if (manifestFile === READ_LIMIT_EXCEEDED) {
    incompatibleTarget();
  }
  if (manifestFile === undefined) {
    unsafeTargetEntry();
  }
  const marker = parseMarker(markerFile.bytes);
  const manifest = parseManifest(manifestFile.bytes);
  if (marker === undefined || manifest === undefined || marker.targetId !== manifest.targetId) {
    incompatibleTarget();
  }
  return Object.freeze({
    manifest,
    manifestBytes: Buffer.from(manifestFile.bytes),
    marker,
    markerBytes: Buffer.from(markerFile.bytes),
    targetChain,
    targetDirectory,
  });
}

export function markdownCognitionManagedRelativePath(value: string): string {
  const relativePath = safeRelativePath(value);
  if (relativePath === undefined) {
    throw new MarkdownCognitionError(
      "invalid_projection_input",
      "Markdown cognition projection input is invalid.",
    );
  }
  return relativePath;
}

export function readMarkdownCognitionProjectionFile(
  target: MarkdownCognitionProjectionTarget,
  relativePath: string,
  maximumBytes: number,
): Uint8Array | undefined {
  const safePath = markdownCognitionManagedRelativePath(relativePath);
  const file = readRegularFileNoFollow(
    target.targetDirectory,
    safePath,
    target.targetChain,
    maximumBytes,
  );
  if (file === READ_LIMIT_EXCEEDED) {
    throw new MarkdownCognitionError(
      "projection_limit_exceeded",
      "Markdown cognition projection exceeds a supported limit.",
      safePath,
    );
  }
  if (file === undefined) {
    const inspection = inspectManagedPath(target.targetDirectory, safePath);
    if (inspection.kind === "missing") {
      return undefined;
    }
    unsafeTargetEntry(safePath);
  }
  return Buffer.from(file.bytes);
}

function safeProjectionParent(
  target: MarkdownCognitionProjectionTarget,
  relativePath: string,
): string {
  const parts = relativePath.split("/");
  let current = target.targetDirectory;
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    try {
      const entry = lstatSync(current);
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        unsafeTargetEntry(relativePath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        unsafeTargetEntry(relativePath);
      }
      if (!directoryChainMatches(target.targetChain)) {
        unsafeTargetEntry(relativePath);
      }
      try {
        mkdirSync(current);
      } catch {
        unsafeTargetEntry(relativePath);
      }
      const entry = lstatSync(current);
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        unsafeTargetEntry(relativePath);
      }
    }
  }
  const chain = snapshotDirectoryChain(current);
  if (chain === undefined || !directoryChainMatches(target.targetChain) || !directoryChainMatches(chain)) {
    unsafeTargetEntry(relativePath);
  }
  return current;
}

export function replaceMarkdownCognitionProjectionFile(
  target: MarkdownCognitionProjectionTarget,
  relativePath: string,
  bytes: Uint8Array,
): void {
  const safePath = markdownCognitionManagedRelativePath(relativePath);
  const parentDirectory = safeProjectionParent(target, safePath);
  const parentChain = snapshotDirectoryChain(parentDirectory);
  if (parentChain === undefined || !directoryChainMatches(target.targetChain)) {
    unsafeTargetEntry(safePath);
  }
  const temporaryPath = join(parentDirectory, temporaryName());
  const finalPath = join(target.targetDirectory, ...safePath.split("/"));
  let descriptor: number | undefined;
  let temporaryIdentity: MarkdownCognitionPathIdentity | undefined;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const descriptorEntry = fstatSync(descriptor);
    const pathEntry = lstatSync(temporaryPath);
    temporaryIdentity = pathIdentity(temporaryPath, pathEntry);
    if (
      !descriptorEntry.isFile() || descriptorEntry.nlink !== 1 ||
      pathEntry.isSymbolicLink() || !pathEntry.isFile() || pathEntry.nlink !== 1 ||
      !sameIdentity(temporaryIdentity, { device: descriptorEntry.dev, inode: descriptorEntry.ino, mode: descriptorEntry.mode }) ||
      !directoryChainMatches(target.targetChain) || !directoryChainMatches(parentChain)
    ) {
      throw new Error("unsafe staging");
    }
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset);
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    const staged = lstatSync(temporaryPath);
    if (
      !staged.isFile() || staged.isSymbolicLink() || staged.nlink !== 1 ||
      !sameIdentity(temporaryIdentity, pathIdentity(temporaryPath, staged)) ||
      !directoryChainMatches(target.targetChain) || !directoryChainMatches(parentChain)
    ) {
      throw new Error("staging changed");
    }
    invokeMarkdownCognitionTargetTestHook("projection:before-replace", safePath);
    if (!directoryChainMatches(target.targetChain) || !directoryChainMatches(parentChain)) {
      throw new Error("target changed");
    }
    renameSync(temporaryPath, finalPath);
    const finalEntry = lstatSync(finalPath);
    if (
      !finalEntry.isFile() || finalEntry.isSymbolicLink() || finalEntry.nlink !== 1 ||
      !sameIdentity(temporaryIdentity, pathIdentity(finalPath, finalEntry)) ||
      !directoryChainMatches(target.targetChain) || !directoryChainMatches(parentChain)
    ) {
      throw new Error("commit changed");
    }
  } catch {
    closeFile(descriptor);
    if (temporaryIdentity !== undefined) {
      cleanupOwnedPath(parentDirectory, parentChain, parse(temporaryPath).base, temporaryIdentity);
    }
    throw new MarkdownCognitionError(
      "projection_io_failed",
      "Markdown cognition projection failed.",
      safePath,
    );
  }
}

export function removeMarkdownCognitionProjectionFile(
  target: MarkdownCognitionProjectionTarget,
  relativePath: string,
  expectedDigest: string,
): void {
  const safePath = markdownCognitionManagedRelativePath(relativePath);
  const file = readMarkdownCognitionProjectionFile(target, safePath, MAX_TARGET_BYTES);
  if (file === undefined) {
    return;
  }
  if (markdownCognitionDigest(file) !== expectedDigest) {
    throw new MarkdownCognitionError(
      "managed_file_conflict",
      "A managed Markdown cognition file has changed.",
      safePath,
    );
  }
  const absolutePath = join(target.targetDirectory, ...safePath.split("/"));
  try {
    const entry = lstatSync(absolutePath);
    if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1 || !directoryChainMatches(target.targetChain)) {
      unsafeTargetEntry(safePath);
    }
    unlinkSync(absolutePath);
  } catch (error) {
    if (error instanceof MarkdownCognitionError) {
      throw error;
    }
    throw new MarkdownCognitionError(
      "projection_io_failed",
      "Markdown cognition projection failed.",
      safePath,
    );
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
  const targetChain = snapshotDirectoryChain(targetDirectory);
  if (targetChain === undefined) {
    throw new MarkdownCognitionError(
      "projection_io_failed",
      "Markdown cognition target initialization failed.",
    );
  }
  const staged: StagedFile[] = [];
  try {
    invokeMarkdownCognitionTargetTestHook("initialize:after-target-inspection");
    if (!directoryChainMatches(targetChain)) {
      throw new Error("target changed");
    }
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
    staged.push(stageCanonicalFile(
      targetDirectory,
      targetChain,
      MARKDOWN_COGNITION_MARKER_FILE,
      canonicalizeJson(marker as unknown as JsonValue),
    ));
    staged.push(stageCanonicalFile(
      targetDirectory,
      targetChain,
      MARKDOWN_COGNITION_MANIFEST_FILE,
      canonicalizeJson(manifest as unknown as JsonValue),
    ));
    commitStagedFile(targetDirectory, targetChain, staged[0]!);
    invokeMarkdownCognitionTargetTestHook("initialize:before-manifest-commit");
    commitStagedFile(targetDirectory, targetChain, staged[1]!);
  } catch {
    for (const file of [...staged].reverse()) {
      cleanupOwnedPath(
        targetDirectory,
        targetChain,
        file.finalName,
        file.identity,
      );
    }
    for (const file of staged) {
      cleanupOwnedPath(
        targetDirectory,
        targetChain,
        file.temporaryName,
        file.identity,
      );
    }
    throw new MarkdownCognitionError(
      "projection_io_failed",
      "Markdown cognition target initialization failed.",
    );
  }
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
  const targetChain = snapshotDirectoryChain(targetDirectory);
  if (targetChain === undefined) {
    return finalizedReport([
      diagnostic("unsafe_target_entry", "Markdown cognition target contains an unsafe entry."),
    ], []);
  }
  invokeMarkdownCognitionTargetTestHook("verify:after-target-inspection");
  if (!directoryChainMatches(targetChain)) {
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
  const markerFile = readRegularFileNoFollow(
    targetDirectory,
    MARKDOWN_COGNITION_MARKER_FILE,
    targetChain,
    MAX_TARGET_BYTES,
  );
  if (markerFile === READ_LIMIT_EXCEEDED) {
    diagnostics.push(diagnostic(
      "incompatible_target",
      "Markdown cognition target is incompatible.",
    ));
    return finalizedReport(diagnostics, managedPaths);
  }
  if (markerFile === undefined) {
    diagnostics.push(diagnostic(
      "unsafe_target_entry",
      "Markdown cognition target contains an unsafe entry.",
    ));
    return finalizedReport(diagnostics, managedPaths);
  }
  const manifestFile = readRegularFileNoFollow(
    targetDirectory,
    MARKDOWN_COGNITION_MANIFEST_FILE,
    targetChain,
    MAX_TARGET_BYTES - markerFile.bytes.length,
  );
  if (manifestFile === READ_LIMIT_EXCEEDED) {
    diagnostics.push(diagnostic(
      "incompatible_target",
      "Markdown cognition target is incompatible.",
    ));
    return finalizedReport(diagnostics, managedPaths);
  }
  if (manifestFile === undefined) {
    diagnostics.push(diagnostic(
      "unsafe_target_entry",
      "Markdown cognition target contains an unsafe entry.",
    ));
    return finalizedReport(diagnostics, managedPaths);
  }

  const marker = parseMarker(markerFile.bytes);
  const manifest = parseManifest(manifestFile.bytes);
  if (marker === undefined || manifest === undefined || marker.targetId !== manifest.targetId) {
    const unsafeManifestPath = manifest === undefined && hasUnsafeManifestPath(manifestFile.bytes);
    diagnostics.push(diagnostic(
      unsafeManifestPath ? "unsafe_target_entry" : "incompatible_target",
      unsafeManifestPath
        ? "Markdown cognition target contains an unsafe entry."
        : "Markdown cognition target is incompatible.",
    ));
    return finalizedReport(diagnostics, managedPaths);
  }

  let totalBytes = markerFile.bytes.length + manifestFile.bytes.length;
  for (const entry of manifest.entries) {
    managedPaths.push(entry.relativePath);
    const file = readRegularFileNoFollow(
      targetDirectory,
      entry.relativePath,
      targetChain,
      MAX_TARGET_BYTES - totalBytes,
    );
    if (file === READ_LIMIT_EXCEEDED) {
      diagnostics.push(diagnostic(
        "incompatible_target",
        "Markdown cognition target is incompatible.",
        entry.relativePath,
      ));
      break;
    }
    if (file === undefined) {
      diagnostics.push(diagnostic(
        "unsafe_target_entry",
        "Markdown cognition target contains an unsafe entry.",
        entry.relativePath,
      ));
      continue;
    }
    totalBytes += file.bytes.length;
    if (
      totalBytes > MAX_TARGET_BYTES ||
      decodeUtf8(file.bytes) === undefined ||
      entry.digest !== markdownCognitionDigest(file.bytes)
    ) {
      diagnostics.push(diagnostic(
        "incompatible_target",
        "Markdown cognition target is incompatible.",
        entry.relativePath,
      ));
    }
  }
  return finalizedReport(diagnostics, managedPaths);
}

export function markdownCognitionDigest(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}
