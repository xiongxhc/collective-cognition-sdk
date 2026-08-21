import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { devNull } from "node:os";
import { isAbsolute } from "node:path";

import { createSourceRecord } from "../source-records.ts";
import { isUnicodeScalarString } from "../types.ts";
import {
  classifyGitProcessResult,
  validGitObjectByteLength,
} from "./git-process-result.ts";
import type { SourceRecord } from "../source-records.ts";

export const GIT_REPOSITORY_FORMAT = "git-repository/1";

export interface GitCommitSourceRecordOptions {
  readonly repositoryPath: string;
  readonly sourceInstance: string;
  readonly tipCommitId: string;
  readonly capturedAt: string;
  readonly limit: number;
  readonly includeMessage?: boolean;
  readonly includeAuthorEmail?: boolean;
}

export type GitConnectorErrorCode =
  | "invalid_options"
  | "target_unavailable"
  | "incompatible_repository"
  | "invalid_commit"
  | "read_failed";

export type GitConnectorStage =
  | "options"
  | "open"
  | "history"
  | "mapping";

export class GitConnectorError extends Error {
  readonly code: GitConnectorErrorCode;
  readonly stage: GitConnectorStage;
  readonly details: Readonly<Record<string, string | number | boolean>>;

  constructor(
    code: GitConnectorErrorCode,
    stage: GitConnectorStage,
    message: string,
    details: Readonly<Record<string, string | number | boolean>> = {},
  ) {
    super(message);
    this.name = "GitConnectorError";
    this.code = code;
    this.stage = stage;
    this.details = Object.freeze({ ...details });
    Object.freeze(this);
  }
}

interface ValidatedOptions {
  readonly repositoryPath: string;
  readonly sourceInstance: string;
  readonly tipCommitId: string;
  readonly capturedAt: string;
  readonly limit: number;
  readonly includeMessage: boolean;
  readonly includeAuthorEmail: boolean;
}

interface GitSignature {
  readonly name: string;
  readonly email: string;
  readonly timestamp: string;
}

interface GitCommit {
  readonly commitId: string;
  readonly parents: readonly string[];
  readonly author: GitSignature;
  readonly committedAt: string;
  readonly message: string;
}

interface GitCommandFailure {
  readonly code: GitConnectorErrorCode;
  readonly stage: GitConnectorStage;
  readonly outputLimit: number;
}

const allowedOptionFields = new Set([
  "repositoryPath",
  "sourceInstance",
  "tipCommitId",
  "capturedAt",
  "limit",
  "includeMessage",
  "includeAuthorEmail",
]);
const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const controlCharacterPattern = /[\u0000-\u001f\u007f-\u009f]/u;
const executionEnvironmentFields = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "TMP",
  "TEMP",
] as const;

function inheritedEnvironmentValue(name: string): string | undefined {
  const inheritedName = Object.keys(process.env).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return inheritedName === undefined ? undefined : process.env[inheritedName];
}

const gitEnvironment: Readonly<NodeJS.ProcessEnv> = Object.freeze({
  ...Object.fromEntries(
    executionEnvironmentFields.flatMap((name) => {
      const value = inheritedEnvironmentValue(name);
      return value === undefined ? [] : [[name, value]];
    }),
  ),
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_NO_LAZY_FETCH: "1",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
  LANG: "C",
  LC_ALL: "C",
});
const GIT_PROCESS_TIMEOUT_MS = 5_000;
const GIT_HISTORY_MAX_BYTES = 128 * 1024;
const GIT_OBJECT_BATCH_MAX_BYTES = 8 * 1024 * 1024;
const GIT_COMMIT_MAX_BYTES = 1024 * 1024;

function connectorError(
  code: GitConnectorErrorCode,
  stage: GitConnectorStage,
  details: Readonly<Record<string, string | number | boolean>> = {},
): GitConnectorError {
  const messages: Record<GitConnectorErrorCode, string> = {
    invalid_options: "Git connector options are invalid.",
    target_unavailable: "Git repository is unavailable.",
    incompatible_repository: "Git repository is incompatible.",
    invalid_commit: "Git repository contains an invalid commit.",
    read_failed: "Git repository could not be read.",
  };
  return new GitConnectorError(code, stage, messages[code], details);
}

function snapshotOptions(value: unknown): Record<string, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw connectorError("invalid_options", "options");
    }
    if (Reflect.getPrototypeOf(value) !== Object.prototype) {
      throw connectorError("invalid_options", "options");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string" || !allowedOptionFields.has(key))) {
      throw connectorError("invalid_options", "options");
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string") {
        throw connectorError("invalid_options", "options");
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        throw connectorError("invalid_options", "options");
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch (error) {
    if (error instanceof GitConnectorError) {
      throw error;
    }
    throw connectorError("invalid_options", "options");
  }
}

function validIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !isoTimestampPattern.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    return false;
  }
  const datePart = value.slice(0, 10);
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  return !Number.isNaN(calendarDate.getTime()) &&
    calendarDate.toISOString().slice(0, 10) === datePart;
}

function validSourceInstance(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    isUnicodeScalarString(value) &&
    [...value].length <= 128 &&
    !controlCharacterPattern.test(value);
}

function validateOptions(value: unknown): ValidatedOptions {
  const options = snapshotOptions(value);
  const repositoryPath = options.repositoryPath;
  if (
    typeof repositoryPath !== "string" ||
    repositoryPath.length === 0 ||
    repositoryPath.includes("\u0000") ||
    repositoryPath.startsWith("~") ||
    repositoryPath.includes("://") ||
    !isAbsolute(repositoryPath)
  ) {
    throw connectorError("invalid_options", "options", { field: "repositoryPath" });
  }
  if (!validSourceInstance(options.sourceInstance)) {
    throw connectorError("invalid_options", "options", { field: "sourceInstance" });
  }
  if (
    typeof options.tipCommitId !== "string" ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(options.tipCommitId)
  ) {
    throw connectorError("invalid_options", "options", { field: "tipCommitId" });
  }
  if (!validIsoTimestamp(options.capturedAt)) {
    throw connectorError("invalid_options", "options", { field: "capturedAt" });
  }
  if (
    !Number.isSafeInteger(options.limit) ||
    (options.limit as number) < 1 ||
    (options.limit as number) > 1_000
  ) {
    throw connectorError("invalid_options", "options", { field: "limit" });
  }
  for (const field of ["includeMessage", "includeAuthorEmail"] as const) {
    if (options[field] !== undefined && typeof options[field] !== "boolean") {
      throw connectorError("invalid_options", "options", { field });
    }
  }

  return {
    repositoryPath,
    sourceInstance: options.sourceInstance,
    tipCommitId: options.tipCommitId,
    capturedAt: options.capturedAt,
    limit: options.limit as number,
    includeMessage: options.includeMessage === true,
    includeAuthorEmail: options.includeAuthorEmail === true,
  };
}

function runGit(
  repositoryPath: string,
  args: readonly string[],
  failure: GitCommandFailure,
  input?: Buffer,
): Buffer {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], {
    encoding: null,
    env: gitEnvironment,
    input,
    maxBuffer: failure.outputLimit,
    shell: false,
    timeout: GIT_PROCESS_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  const classification = classifyGitProcessResult(result);
  switch (classification.kind) {
    case "target_unavailable":
      throw connectorError("target_unavailable", "open");
    case "read_failed":
      throw connectorError("read_failed", failure.stage);
    case "command_failed":
      throw connectorError(failure.code, failure.stage);
    case "success":
      return classification.stdout;
  }
}

function objectIdPattern(objectFormat: string): RegExp | undefined {
  if (objectFormat === "sha1") {
    return /^[0-9a-f]{40}$/;
  }
  if (objectFormat === "sha256") {
    return /^[0-9a-f]{64}$/;
  }
  return undefined;
}

function partialOrPromisorRepository(config: Buffer): boolean {
  let entries: readonly string[];
  try {
    entries = new TextDecoder("utf-8", { fatal: true }).decode(config).split("\0");
  } catch {
    throw connectorError("read_failed", "open");
  }
  return entries.some((entry) => {
    const separatorIndex = entry.indexOf("\n");
    const key = (separatorIndex < 0 ? entry : entry.slice(0, separatorIndex)).toLowerCase();
    const value = (separatorIndex < 0 ? "" : entry.slice(separatorIndex + 1))
      .toLowerCase();
    return key === "extensions.partialclone" ||
      (/^remote\..+\.promisor$/.test(key) &&
        ["", "true", "yes", "on", "1"].includes(value));
  });
}

function epochTimestamp(value: string): string | undefined {
  if (!/^-?\d+$/.test(value)) {
    return undefined;
  }
  const seconds = Number(value);
  const milliseconds = seconds * 1_000;
  if (!Number.isSafeInteger(seconds) || !Number.isSafeInteger(milliseconds)) {
    return undefined;
  }
  const timestamp = new Date(milliseconds);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
}

function parseSignature(value: string): GitSignature | undefined {
  const match = /^(.*) <(.*)> (-?\d+) ([+-](?:[01]\d|2[0-3])[0-5]\d)$/.exec(value);
  if (match === null || match[1].length === 0) {
    return undefined;
  }
  const timestamp = epochTimestamp(match[3]);
  if (timestamp === undefined) {
    return undefined;
  }
  return {
    name: match[1],
    email: match[2],
    timestamp,
  };
}

function parseCommit(
  commitId: string,
  contents: string,
  objectId: RegExp,
): GitCommit | undefined {
  const separatorIndex = contents.indexOf("\n\n");
  if (separatorIndex < 0) {
    return undefined;
  }
  const headerLines = contents.slice(0, separatorIndex).split("\n");
  const message = contents.slice(separatorIndex + 2);
  const tree = headerLines.shift();
  if (tree === undefined || !new RegExp(`^tree ${objectId.source.slice(1, -1)}$`).test(tree)) {
    return undefined;
  }

  const parents: string[] = [];
  while (headerLines[0]?.startsWith("parent ")) {
    const parent = headerLines.shift()?.slice("parent ".length);
    if (parent === undefined || !objectId.test(parent)) {
      return undefined;
    }
    parents.push(parent);
  }
  const authorLine = headerLines.shift();
  const committerLine = headerLines.shift();
  if (
    authorLine === undefined ||
    committerLine === undefined ||
    !authorLine.startsWith("author ") ||
    !committerLine.startsWith("committer ")
  ) {
    return undefined;
  }
  const author = parseSignature(authorLine.slice("author ".length));
  const committer = parseSignature(committerLine.slice("committer ".length));
  if (author === undefined || committer === undefined) {
    return undefined;
  }
  return {
    commitId,
    parents,
    author,
    committedAt: committer.timestamp,
    message,
  };
}

function parseCommitBatch(
  output: Buffer,
  commitIds: readonly string[],
  objectId: RegExp,
): readonly GitCommit[] {
  const commits: GitCommit[] = [];
  let offset = 0;
  for (const [commitIndex, requestedCommitId] of commitIds.entries()) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd < 0) {
      throw connectorError("invalid_commit", "history", { commitIndex });
    }
    const header = output.toString("ascii", offset, headerEnd);
    const match = /^([0-9a-f]+) commit ([0-9]+)$/.exec(header);
    if (
      match === null ||
      match[1] !== requestedCommitId ||
      !objectId.test(match[1])
    ) {
      throw connectorError("invalid_commit", "history", { commitIndex });
    }
    if (!validGitObjectByteLength(match[2], GIT_COMMIT_MAX_BYTES)) {
      throw connectorError("invalid_commit", "history", { commitIndex });
    }
    const byteLength = Number(match[2]);
    const contentsStart = headerEnd + 1;
    const contentsEnd = contentsStart + byteLength;
    if (contentsEnd >= output.length || output[contentsEnd] !== 0x0a) {
      throw connectorError("invalid_commit", "history", { commitIndex });
    }
    let contents: string;
    try {
      contents = new TextDecoder("utf-8", { fatal: true }).decode(
        output.subarray(contentsStart, contentsEnd),
      );
    } catch {
      throw connectorError("invalid_commit", "mapping", { commitIndex });
    }
    const commit = parseCommit(requestedCommitId, contents, objectId);
    if (commit === undefined) {
      throw connectorError("invalid_commit", "mapping", { commitIndex });
    }
    commits.push(commit);
    offset = contentsEnd + 1;
  }
  if (offset !== output.length) {
    throw connectorError("invalid_commit", "history", { commitIndex: commitIds.length });
  }
  return commits;
}

function mapCommit(
  commit: GitCommit,
  options: ValidatedOptions,
): SourceRecord {
  const summaryLine = commit.message.split("\n", 1)[0] ?? "";
  const summary = summaryLine.endsWith("\r")
    ? summaryLine.slice(0, -1)
    : summaryLine;
  return createSourceRecord({
    id: `source-record:git-repository:${encodeURIComponent(options.sourceInstance)}:${commit.commitId}`,
    source: { system: "git-repository", instance: options.sourceInstance },
    sourceId: `commit:${commit.commitId}`,
    revisionId: commit.commitId,
    capturedAt: options.capturedAt,
    observedAt: commit.author.timestamp,
    mediaType: "application/vnd.git.commit+json",
    content: {
      commitId: commit.commitId,
      parents: commit.parents,
      authoredAt: commit.author.timestamp,
      committedAt: commit.committedAt,
      author: {
        name: commit.author.name,
        ...(options.includeAuthorEmail && commit.author.email.length > 0
          ? { email: commit.author.email }
          : {}),
      },
      summary,
      ...(options.includeMessage ? { message: commit.message } : {}),
    },
  });
}

export function readGitCommitSourceRecords(
  options: GitCommitSourceRecordOptions,
): readonly SourceRecord[] {
  const validatedOptions = validateOptions(options);
  try {
    if (!statSync(validatedOptions.repositoryPath).isDirectory()) {
      throw connectorError("target_unavailable", "open");
    }
  } catch (error) {
    if (error instanceof GitConnectorError) {
      throw error;
    }
    throw connectorError("target_unavailable", "open");
  }

  runGit(
    validatedOptions.repositoryPath,
    ["rev-parse", "--git-dir"],
    {
      code: "incompatible_repository",
      stage: "open",
      outputLimit: GIT_HISTORY_MAX_BYTES,
    },
  );
  const localConfig = runGit(
    validatedOptions.repositoryPath,
    ["config", "--local", "--null", "--list"],
    { code: "read_failed", stage: "open", outputLimit: GIT_HISTORY_MAX_BYTES },
  );
  if (partialOrPromisorRepository(localConfig)) {
    throw connectorError("incompatible_repository", "open");
  }
  const objectFormat = runGit(
    validatedOptions.repositoryPath,
    ["rev-parse", "--show-object-format"],
    { code: "read_failed", stage: "open", outputLimit: GIT_HISTORY_MAX_BYTES },
  ).toString("ascii").trim();
  const objectId = objectIdPattern(objectFormat);
  if (objectId === undefined) {
    throw connectorError("incompatible_repository", "open");
  }
  if (!objectId.test(validatedOptions.tipCommitId)) {
    throw connectorError("incompatible_repository", "history");
  }

  const tipType = runGit(
    validatedOptions.repositoryPath,
    ["cat-file", "-t", validatedOptions.tipCommitId],
    { code: "incompatible_repository", stage: "history", outputLimit: GIT_HISTORY_MAX_BYTES },
  ).toString("ascii").trim();
  if (tipType !== "commit") {
    throw connectorError("incompatible_repository", "history");
  }

  const selected = runGit(
    validatedOptions.repositoryPath,
    [
      "rev-list",
      "--first-parent",
      `--max-count=${validatedOptions.limit}`,
      validatedOptions.tipCommitId,
    ],
    { code: "read_failed", stage: "history", outputLimit: GIT_HISTORY_MAX_BYTES },
  ).toString("ascii").trimEnd();
  if (selected.length === 0) {
    throw connectorError("invalid_commit", "history");
  }
  const selectedCommitIds = selected.split("\n");
  if (
    selectedCommitIds.length > validatedOptions.limit ||
    selectedCommitIds[0] !== validatedOptions.tipCommitId ||
    selectedCommitIds.some((commitId) => !objectId.test(commitId))
  ) {
    throw connectorError("invalid_commit", "history");
  }
  selectedCommitIds.reverse();

  const commits = parseCommitBatch(
    runGit(
      validatedOptions.repositoryPath,
      ["cat-file", "--batch"],
      { code: "read_failed", stage: "history", outputLimit: GIT_OBJECT_BATCH_MAX_BYTES },
      Buffer.from(`${selectedCommitIds.join("\n")}\n`, "ascii"),
    ),
    selectedCommitIds,
    objectId,
  );
  try {
    return Object.freeze(commits.map((commit) => mapCommit(commit, validatedOptions)));
  } catch (error) {
    if (error instanceof GitConnectorError) {
      throw error;
    }
    throw connectorError("invalid_commit", "mapping");
  }
}
