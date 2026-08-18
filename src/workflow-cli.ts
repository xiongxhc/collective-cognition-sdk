#!/usr/bin/env node

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
} from "node:path";

import { ingestSourceRecordText } from "./ingestion.ts";
import { parseProfiledJson } from "./json-text.ts";
import {
  MARKDOWN_COGNITION_MANIFEST_FILE,
  MARKDOWN_COGNITION_MARKER_FILE,
  projectMarkdownCognition,
} from "./markdown-cognition.ts";
import { neutralEvidencePolicyV1 } from "./promotion.ts";
import { SqliteCognitionWorkflowStore } from "./stores/sqlite-workflow.ts";
import {
  prepareDurableCognitionWorkflow,
  runDurableCognitionWorkflow,
} from "./workflows/durable.ts";
import {
  WORKFLOW_CLI_CONTRACT,
} from "./workflow-cli-contract.ts";
import type {
  WorkflowCliFormat,
  WorkflowCliStage,
} from "./workflow-cli-contract.ts";
import type {
  CognitionWorkflowStore,
  DurableCognitionCommitResult,
  DurableCognitionWorkflowRequest,
  PreparedDurableCognitionCommit,
} from "./workflows/durable.ts";
import type {
  CognitionStoreCommitResult,
  InitialCognitionCommit,
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
  TransitionCognitionCommit,
} from "./host-integration.ts";
import type { SourceRecord } from "./source-records.ts";

interface WorkflowCliOptions {
  readonly requestPath: string;
  readonly input: string;
  readonly format: WorkflowCliFormat;
  readonly cognitionDatabasePath: string;
  readonly createCognitionDatabase: boolean;
  readonly markdownTarget?: string;
  readonly limits: {
    readonly maxInputBytes: number;
    readonly maxRecords: number;
    readonly maxRecordBytes: number;
    readonly maxRequestBytes: number;
  };
}

interface SerializedWorkflowRequest {
  readonly workflowVersion: unknown;
  readonly workflowId: unknown;
  readonly hypothesis: unknown;
  readonly promotion: unknown;
  readonly reviewTransition: unknown;
  readonly policyId: unknown;
}

interface FileIdentity {
  readonly device: bigint;
  readonly inode: bigint;
}

interface PathCandidate {
  readonly name: string;
  readonly path: string;
  readonly identity?: FileIdentity;
}

interface PathPreflight {
  readonly candidates: readonly PathCandidate[];
  readonly requestIdentity: FileIdentity | undefined;
  readonly inputIdentity: FileIdentity | undefined;
}

interface WorkflowDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly stage: WorkflowCliStage;
}

class WorkflowPathConflict extends Error {}

class DeferredWorkflowStore implements CognitionWorkflowStore {
  readonly #options: WorkflowCliOptions;
  #store: SqliteCognitionWorkflowStore | undefined;

  constructor(options: WorkflowCliOptions) {
    this.#options = options;
  }

  #open(): SqliteCognitionWorkflowStore {
    this.#store ??= new SqliteCognitionWorkflowStore({
      databasePath: this.#options.cognitionDatabasePath,
      createIfMissing: this.#options.createCognitionDatabase,
    });
    return this.#store;
  }

  close(): void {
    this.#store?.close();
  }

  commitWorkflow(
    request: PreparedDurableCognitionCommit,
  ): Promise<DurableCognitionCommitResult> {
    return this.#open().commitWorkflow(request);
  }

  commitInitial(
    request: InitialCognitionCommit,
  ): Promise<CognitionStoreCommitResult> {
    return this.#open().commitInitial(request);
  }

  commitTransition(
    request: TransitionCognitionCommit,
  ): Promise<CognitionStoreCommitResult> {
    return this.#open().commitTransition(request);
  }

  getLatestObject(
    objectId: string,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    return this.#open().getLatestObject(objectId);
  }

  getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    return this.#open().getObjectVersion(objectId, version);
  }

  listObjectEvents(
    objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]> {
    return this.#open().listObjectEvents(objectId);
  }
}

const valueOptions = new Set([
  "--request",
  "--input",
  "--format",
  "--cognition-db",
  "--markdown-target",
  "--max-input-bytes",
  "--max-records",
  "--max-record-bytes",
  "--max-request-bytes",
]);
const requiredValueOptions = [
  "--request",
  "--input",
  "--format",
  "--cognition-db",
] as const;
const sqliteSidecarSuffixes = ["-journal", "-wal", "-shm"] as const;
const requestFields = new Set([
  "workflowVersion",
  "workflowId",
  "hypothesis",
  "promotion",
  "reviewTransition",
  "policyId",
]);
const readChunkBytes = 64 * 1024;

function invalidArguments(): never {
  throw new TypeError("Invalid durable workflow arguments.");
}

function pathConflict(): never {
  throw new WorkflowPathConflict();
}

function explicitAbsolutePath(value: string): boolean {
  return value.length > 0 &&
    !value.includes("\0") &&
    isAbsolute(value) &&
    normalize(value) === value;
}

function positiveSafeInteger(
  values: ReadonlyMap<string, string>,
  option: string,
  defaultValue: number,
): number {
  const text = values.get(option);
  if (text === undefined) return defaultValue;
  if (!/^[1-9]\d*$/.test(text)) invalidArguments();
  const value = Number(text);
  if (!Number.isSafeInteger(value)) invalidArguments();
  return value;
}

function parseArguments(args: readonly string[]): WorkflowCliOptions {
  if (args[0] !== "run") invalidArguments();
  const values = new Map<string, string>();
  let createCognitionDatabase = false;

  for (let index = 1; index < args.length;) {
    const option = args[index];
    if (option === "--create-cognition-db") {
      if (createCognitionDatabase) invalidArguments();
      createCognitionDatabase = true;
      index += 1;
      continue;
    }
    if (
      option === undefined ||
      !valueOptions.has(option) ||
      values.has(option)
    ) {
      invalidArguments();
    }
    const value = args[index + 1];
    if (value === undefined || value.length === 0 || value.startsWith("--")) {
      invalidArguments();
    }
    values.set(option, value);
    index += 2;
  }

  for (const option of requiredValueOptions) {
    if (!values.has(option)) invalidArguments();
  }
  const requestPath = values.get("--request") as string;
  const input = values.get("--input") as string;
  const format = values.get("--format") as string;
  const cognitionDatabasePath = values.get("--cognition-db") as string;
  const markdownTarget = values.get("--markdown-target");
  if (
    !explicitAbsolutePath(requestPath) ||
    (input !== "-" && !explicitAbsolutePath(input)) ||
    !WORKFLOW_CLI_CONTRACT.formats.includes(format as WorkflowCliFormat) ||
    !explicitAbsolutePath(cognitionDatabasePath) ||
    (markdownTarget !== undefined && !explicitAbsolutePath(markdownTarget))
  ) {
    invalidArguments();
  }

  return {
    requestPath,
    input,
    format: format as WorkflowCliFormat,
    cognitionDatabasePath,
    createCognitionDatabase,
    ...(markdownTarget === undefined ? {} : { markdownTarget }),
    limits: {
      maxInputBytes: positiveSafeInteger(
        values,
        "--max-input-bytes",
        WORKFLOW_CLI_CONTRACT.defaults.maxInputBytes,
      ),
      maxRecords: positiveSafeInteger(
        values,
        "--max-records",
        WORKFLOW_CLI_CONTRACT.defaults.maxRecords,
      ),
      maxRecordBytes: positiveSafeInteger(
        values,
        "--max-record-bytes",
        WORKFLOW_CLI_CONTRACT.defaults.maxRecordBytes,
      ),
      maxRequestBytes: positiveSafeInteger(
        values,
        "--max-request-bytes",
        WORKFLOW_CLI_CONTRACT.defaults.maxRequestBytes,
      ),
    },
  };
}

function pathIsAbsent(error: unknown): boolean {
  return error instanceof Error &&
    "code" in error &&
    (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      (error as NodeJS.ErrnoException).code === "ENOTDIR"
    );
}

function nearestCanonicalPath(path: string): string {
  const missingNames: string[] = [];
  let current = path;
  while (true) {
    try {
      let canonical = realpathSync.native(current);
      for (let index = missingNames.length - 1; index >= 0; index -= 1) {
        canonical = join(canonical, missingNames[index] as string);
      }
      return canonical;
    } catch (error) {
      if (!pathIsAbsent(error) || dirname(current) === current) throw error;
      missingNames.push(basename(current));
      current = dirname(current);
    }
  }
}

function inspectCandidate(name: string, path: string): PathCandidate {
  if (nearestCanonicalPath(path) !== path) pathConflict();
  try {
    const entry = lstatSync(path, { bigint: true });
    if (entry.isSymbolicLink() || !entry.isFile()) {
      pathConflict();
    }
    if (realpathSync.native(path) !== path) pathConflict();
    return {
      name,
      path,
      identity: {
        device: entry.dev,
        inode: entry.ino,
      },
    };
  } catch (error) {
    if (pathIsAbsent(error)) return { name, path };
    throw error;
  }
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function rejectCandidateConflicts(candidates: readonly PathCandidate[]): void {
  for (const [index, left] of candidates.entries()) {
    for (const right of candidates.slice(index + 1)) {
      if (
        left.path === right.path ||
        (
          left.identity !== undefined &&
          right.identity !== undefined &&
          sameIdentity(left.identity, right.identity)
        )
      ) {
        pathConflict();
      }
    }
  }
}

function preflightPaths(options: WorkflowCliOptions): PathPreflight {
  const candidates: PathCandidate[] = [
    inspectCandidate("request", options.requestPath),
    ...(options.input === "-"
      ? []
      : [inspectCandidate("input", options.input)]),
    inspectCandidate("cognition-main", options.cognitionDatabasePath),
    ...sqliteSidecarSuffixes.map((suffix) =>
      inspectCandidate(
        `cognition${suffix}`,
        `${options.cognitionDatabasePath}${suffix}`,
      )
    ),
    ...(options.markdownTarget === undefined
      ? []
      : [
          inspectCandidate(
            "markdown-marker",
            join(options.markdownTarget, MARKDOWN_COGNITION_MARKER_FILE),
          ),
          inspectCandidate(
            "markdown-manifest",
            join(options.markdownTarget, MARKDOWN_COGNITION_MANIFEST_FILE),
          ),
        ]),
  ];

  rejectCandidateConflicts(candidates);

  return {
    candidates,
    requestIdentity: candidates.find((candidate) => candidate.name === "request")?.identity,
    inputIdentity: candidates.find((candidate) => candidate.name === "input")?.identity,
  };
}

function preflightRegularStdin(paths: PathPreflight): void {
  const descriptor = fstatSync(0, { bigint: true });
  if (!descriptor.isFile()) return;
  const stdinIdentity: FileIdentity = {
    device: descriptor.dev,
    inode: descriptor.ino,
  };
  if (
    paths.candidates.some((candidate) =>
      candidate.identity !== undefined &&
      sameIdentity(stdinIdentity, candidate.identity)
    )
  ) {
    pathConflict();
  }
}

function matchingRegularFile(
  descriptorIdentity: ReturnType<typeof fstatSync>,
  pathIdentity: NonNullable<ReturnType<typeof lstatSync>>,
  expected?: FileIdentity,
): boolean {
  return descriptorIdentity.isFile() &&
    pathIdentity.isFile() &&
    !pathIdentity.isSymbolicLink() &&
    descriptorIdentity.dev === pathIdentity.dev &&
    descriptorIdentity.ino === pathIdentity.ino &&
    (
      expected === undefined ||
      (
        descriptorIdentity.dev === expected.device &&
        descriptorIdentity.ino === expected.inode
      )
    );
}

function decodeUtf8(bytes: Buffer): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function readBoundedFile(
  path: string,
  maximumBytes: number,
  expectedIdentity?: FileIdentity,
): string {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = fstatSync(descriptor, { bigint: true });
    const pathBefore = lstatSync(path, { bigint: true });
    if (!matchingRegularFile(before, pathBefore, expectedIdentity)) {
      throw new Error("unsafe file");
    }
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(readChunkBytes);
      const bytesRead = readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
      if (totalBytes > maximumBytes) throw new Error("limit exceeded");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const after = fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatSync(path, { bigint: true });
    if (
      !matchingRegularFile(after, pathAfter, expectedIdentity) ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      throw new Error("file changed");
    }
    return decodeUtf8(Buffer.concat(chunks, totalBytes));
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

async function readBoundedStdin(maximumBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const value of process.stdin) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    totalBytes += chunk.byteLength;
    if (totalBytes > maximumBytes) throw new Error("limit exceeded");
    chunks.push(chunk);
  }
  return decodeUtf8(Buffer.concat(chunks, totalBytes));
}

function closedSerializedRequest(value: unknown): SerializedWorkflowRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("invalid request");
  }
  const prototype = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    keys.length !== requestFields.size ||
    keys.some((key) => typeof key !== "string" || !requestFields.has(key))
  ) {
    throw new TypeError("invalid request");
  }
  const captured: Record<string, unknown> = Object.create(null);
  for (const field of requestFields) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, field);
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor)
    ) {
      throw new TypeError("invalid request");
    }
    captured[field] = descriptor.value;
  }
  if (
    captured.policyId !== WORKFLOW_CLI_CONTRACT.policyIds[0] ||
    typeof captured.workflowVersion !== "string" ||
    typeof captured.workflowId !== "string"
  ) {
    throw new TypeError("invalid request");
  }
  return captured as unknown as SerializedWorkflowRequest;
}

function parseRequest(text: string): SerializedWorkflowRequest {
  return closedSerializedRequest(parseProfiledJson(text));
}

function parseRecords(
  text: string,
  options: WorkflowCliOptions,
): readonly SourceRecord[] {
  return ingestSourceRecordText(text, {
    format: options.format,
    mode: "fail-fast",
    maxInputBytes: options.limits.maxInputBytes,
    maxRecords: options.limits.maxRecords,
    maxRecordBytes: options.limits.maxRecordBytes,
  }).acceptedRecords;
}

function workflowRequest(
  serialized: SerializedWorkflowRequest,
  records: readonly SourceRecord[],
): DurableCognitionWorkflowRequest {
  return {
    workflowVersion: serialized.workflowVersion as "0.1.0",
    workflowId: serialized.workflowId as string,
    records,
    hypothesis: serialized.hypothesis as DurableCognitionWorkflowRequest["hypothesis"],
    promotion: serialized.promotion as DurableCognitionWorkflowRequest["promotion"],
    reviewTransition: serialized.reviewTransition as DurableCognitionWorkflowRequest["reviewTransition"],
    policy: neutralEvidencePolicyV1,
  };
}

async function executeWorkflow(
  options: WorkflowCliOptions,
  request: DurableCognitionWorkflowRequest,
) {
  const store = new DeferredWorkflowStore(options);
  const projector = options.markdownTarget === undefined
    ? undefined
    : {
        async project(records: Parameters<typeof projectMarkdownCognition>[0]["records"]) {
          const report = await projectMarkdownCognition({
            targetDirectory: options.markdownTarget as string,
            records,
          });
          return report.created.length === 0 &&
              report.updated.length === 0 &&
              report.pruned.length === 0
            ? "unchanged" as const
            : "projected" as const;
        },
      };
  try {
    return await runDurableCognitionWorkflow(
      {
        store,
        ...(projector === undefined ? {} : { projector }),
      },
      request,
      {
        mode: "fail-fast",
        maxRecords: options.limits.maxRecords,
        maxRecordBytes: options.limits.maxRecordBytes,
      },
    );
  } finally {
    store.close();
  }
}

function diagnosticFor(
  stage: WorkflowCliStage,
  error: unknown,
): WorkflowDiagnostic {
  if (
    (stage === "preparation" || stage === "input") &&
    error instanceof WorkflowPathConflict
  ) {
    return {
      code: "WORKFLOW_PATH_CONFLICT",
      message: "Durable workflow paths conflict.",
      stage,
    };
  }
  const diagnostics: Readonly<Record<WorkflowCliStage, readonly [string, string]>> = {
    arguments: [
      "WORKFLOW_INVALID_ARGUMENTS",
      "Durable workflow arguments are invalid.",
    ],
    request: [
      "WORKFLOW_INVALID_REQUEST",
      "Durable workflow request is invalid.",
    ],
    input: [
      "WORKFLOW_INVALID_INPUT",
      "Durable workflow input is invalid.",
    ],
    preparation: [
      "WORKFLOW_PREPARATION_FAILED",
      "Durable workflow preparation failed.",
    ],
    persistence: [
      "WORKFLOW_PERSISTENCE_FAILED",
      "Durable workflow persistence failed.",
    ],
    publication: [
      "WORKFLOW_PUBLICATION_FAILED",
      "Durable workflow publication failed.",
    ],
    projection: [
      "WORKFLOW_PROJECTION_FAILED",
      "Durable workflow projection failed.",
    ],
    output: [
      "WORKFLOW_OUTPUT_FAILED",
      "Durable workflow output failed.",
    ],
  };
  const [code, message] = diagnostics[stage];
  return { code, message, stage };
}

async function writeLine(stream: NodeJS.WriteStream, value: unknown): Promise<void> {
  const line = `${JSON.stringify(value)}\n`;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error | null): void => {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error);
      } else {
        stream.off("error", onError);
        resolve();
      }
    };
    const onError = (error: Error): void => finish(error);
    stream.once("error", onError);
    try {
      stream.write(line, (error) => finish(error));
    } catch (error) {
      finish(error instanceof Error ? error : new Error("stream failed"));
    }
  });
}

async function main(): Promise<void> {
  let stage: WorkflowCliStage = "arguments";
  try {
    const options = parseArguments(process.argv.slice(2));
    stage = "preparation";
    const paths = preflightPaths(options);

    if (options.input === "-") {
      stage = "input";
      preflightRegularStdin(paths);
    }

    stage = "request";
    const serialized = parseRequest(readBoundedFile(
      options.requestPath,
      options.limits.maxRequestBytes,
      paths.requestIdentity,
    ));

    stage = "input";
    const inputText = options.input === "-"
      ? await readBoundedStdin(options.limits.maxInputBytes)
      : readBoundedFile(
          options.input,
          options.limits.maxInputBytes,
          paths.inputIdentity,
        );
    const records = parseRecords(inputText, options);

    stage = "preparation";
    const request = workflowRequest(serialized, records);
    prepareDurableCognitionWorkflow(request, {
      mode: "fail-fast",
      maxRecords: options.limits.maxRecords,
      maxRecordBytes: options.limits.maxRecordBytes,
    });

    stage = "persistence";
    const result = await executeWorkflow(options, request);
    if (result.status === "failed") throw new Error("workflow failed");

    stage = "output";
    await writeLine(process.stdout, result);
  } catch (error) {
    process.exitCode = 1;
    try {
      await writeLine(process.stderr, diagnosticFor(stage, error));
    } catch {
      process.exitCode = 1;
    }
  }
}

await main();
