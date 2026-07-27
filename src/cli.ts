#!/usr/bin/env node

import { createReadStream } from "node:fs";

import { DomainError, DomainErrorCode } from "./errors.ts";
import { ingestSourceRecordText } from "./ingestion.ts";
import {
  ingestAndPromoteEvidence,
  neutralEvidencePolicyV1,
  promoteSourceRecordsToEvidence,
} from "./promotion.ts";
import type {
  IngestionBatchResult,
  IngestionItemResult,
} from "./ingestion.ts";
import type {
  EvidencePromotionContext,
  IngestAndPromoteEvidenceResult,
  PromotionFailure,
} from "./promotion.ts";
import type { JsonObject } from "./types.ts";

type Command = "validate" | "ingest" | "promote" | "ingest-promote";
type InputFormat = "json" | "jsonl";
type CliStage =
  | "arguments"
  | "input"
  | "ingestion"
  | "promotion"
  | "output";

interface CliLimits {
  readonly maxInputBytes: number;
  readonly maxRecords: number;
  readonly maxRecordBytes: number;
}

interface CliOptions {
  readonly command: Command;
  readonly input: string;
  readonly format: InputFormat;
  readonly limits: CliLimits;
  readonly promotion?: EvidencePromotionContext;
}

interface CliDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly details: JsonObject;
  readonly stage: CliStage;
}

const DEFAULT_MAX_INPUT_BYTES = 10_485_760;
const DEFAULT_MAX_RECORDS = 10_000;
const DEFAULT_MAX_RECORD_BYTES = 1_048_576;

const commands = new Set<Command>([
  "validate",
  "ingest",
  "promote",
  "ingest-promote",
]);
const baseOptionNames = [
  "input",
  "format",
  "max-input-bytes",
  "max-records",
  "max-record-bytes",
] as const;
const promotionOptionNames = [
  "policy",
  "hypothesis-id",
  "context-id",
  "rationale",
  "initiator-id",
  "executor-id",
  "accountable-id",
  "promoted-at",
] as const;
const optionNames: ReadonlySet<string> = new Set([
  ...baseOptionNames,
  ...promotionOptionNames,
]);

class CliError extends Error {
  readonly code: string;
  readonly details: JsonObject;

  constructor(code: string, message: string, details: JsonObject = {}) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.details = details;
  }
}

function isCommand(value: unknown): value is Command {
  return typeof value === "string" && commands.has(value as Command);
}

function invalidArgument(message: string, details: JsonObject = {}): never {
  throw new CliError("INVALID_ARGUMENT", message, details);
}

function requiredValue(
  values: Readonly<Record<string, string>>,
  name: string,
): string {
  const value = values[name];
  if (value === undefined || value.trim().length === 0) {
    invalidArgument(`--${name} is required.`, { option: `--${name}` });
  }
  return value;
}

function positiveSafeInteger(
  values: Readonly<Record<string, string>>,
  name: string,
  defaultValue: number,
): number {
  const rawValue = values[name];
  if (rawValue === undefined) {
    return defaultValue;
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    invalidArgument(`--${name} must be a positive safe integer.`, {
      option: `--${name}`,
      value: rawValue,
    });
  }
  return value;
}

function parseArguments(args: readonly string[]): CliOptions {
  const command = args[0];
  if (!isCommand(command)) {
    invalidArgument(
      "Command must be validate, ingest, promote, or ingest-promote.",
      { command: command ?? null },
    );
  }

  const values: Record<string, string> = {};
  for (let index = 1; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (
      typeof option !== "string" ||
      !option.startsWith("--") ||
      !optionNames.has(option.slice(2)) ||
      value === undefined ||
      values[option.slice(2)] !== undefined
    ) {
      invalidArgument(`Invalid argument: ${option ?? ""}`, {
        argument: option ?? "",
      });
    }
    values[option.slice(2)] = value;
  }

  const input = requiredValue(values, "input");
  const format = requiredValue(values, "format");
  if (format !== "json" && format !== "jsonl") {
    invalidArgument("--format must be json or jsonl.", {
      option: "--format",
      value: format,
    });
  }
  const limits = {
    maxInputBytes: positiveSafeInteger(
      values,
      "max-input-bytes",
      DEFAULT_MAX_INPUT_BYTES,
    ),
    maxRecords: positiveSafeInteger(
      values,
      "max-records",
      DEFAULT_MAX_RECORDS,
    ),
    maxRecordBytes: positiveSafeInteger(
      values,
      "max-record-bytes",
      DEFAULT_MAX_RECORD_BYTES,
    ),
  };

  const requiresPromotion =
    command === "promote" || command === "ingest-promote";
  if (!requiresPromotion) {
    for (const name of promotionOptionNames) {
      if (values[name] !== undefined) {
        invalidArgument(`--${name} is not valid for ${command}.`, {
          option: `--${name}`,
          command,
        });
      }
    }
    return { command, input, format, limits };
  }

  const policy = requiredValue(values, "policy");
  if (policy !== "neutral-evidence-v1") {
    invalidArgument("--policy must be neutral-evidence-v1.", {
      option: "--policy",
      value: policy,
    });
  }

  return {
    command,
    input,
    format,
    limits,
    promotion: {
      hypothesisId: requiredValue(values, "hypothesis-id"),
      contextId: requiredValue(values, "context-id"),
      rationale: requiredValue(values, "rationale"),
      promotedAt: requiredValue(values, "promoted-at"),
      attribution: {
        initiatorId: requiredValue(values, "initiator-id"),
        executorId: requiredValue(values, "executor-id"),
        accountableId: requiredValue(values, "accountable-id"),
      },
    },
  };
}

function serializeItemResult(item: IngestionItemResult): object {
  if (item.status !== "rejected") {
    return item;
  }
  return {
    ...item,
    error: {
      code: item.error.code,
      message: item.error.message,
      details: item.error.details,
    },
  };
}

function serializeIngestionResult(result: IngestionBatchResult): object {
  return {
    items: result.items.map(serializeItemResult),
    acceptedRecords: result.acceptedRecords,
  };
}

function serializeComposedResult(
  result: IngestAndPromoteEvidenceResult,
): object {
  return {
    ingestion: serializeIngestionResult(result.ingestion),
    promotion: result.promotion,
  };
}

function writeJsonLine(
  stream: NodeJS.WriteStream,
  value: unknown,
): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function writeItemDiagnostics(result: IngestionBatchResult): boolean {
  let rejected = false;
  for (const item of result.items) {
    if (item.status === "rejected") {
      rejected = true;
      writeJsonLine(process.stderr, serializeItemResult(item));
    }
  }
  return rejected;
}

function requirePromotion(
  options: CliOptions,
): EvidencePromotionContext {
  if (options.promotion === undefined) {
    throw new CliError(
      "INVALID_ARGUMENT",
      `Promotion arguments are required for ${options.command}.`,
    );
  }
  return options.promotion;
}

function limitExceeded(
  maximum: number,
  actual: number,
): DomainError {
  return new DomainError(
    DomainErrorCode.INGESTION_LIMIT_EXCEEDED,
    "Ingestion maxInputBytes exceeded.",
    {
      limit: "maxInputBytes",
      maximum,
      actual,
    },
  );
}

function inputReadError(error: unknown): CliError {
  const causeCode =
    typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
      ? error.code
      : "UNKNOWN";
  return new CliError(
    "INPUT_READ_ERROR",
    "Unable to read CLI input.",
    { causeCode },
  );
}

async function readBoundedInput(
  stream: AsyncIterable<Buffer | string>,
  maxInputBytes: number,
): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxInputBytes) {
      throw limitExceeded(maxInputBytes, totalBytes);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

async function readFileInput(
  path: string,
  maxInputBytes: number,
): Promise<string> {
  try {
    return await readBoundedInput(createReadStream(path), maxInputBytes);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw inputReadError(error);
  }
}

async function readStdinInput(maxInputBytes: number): Promise<string> {
  return readBoundedInput(process.stdin, maxInputBytes);
}

async function readInput(options: CliOptions): Promise<string> {
  return options.input === "-"
    ? readStdinInput(options.limits.maxInputBytes)
    : readFileInput(options.input, options.limits.maxInputBytes);
}

function topLevelDiagnostic(
  error: unknown,
  stage: CliStage,
): CliDiagnostic {
  if (error instanceof DomainError || error instanceof CliError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      stage,
    };
  }
  return {
    code: "CLI_ERROR",
    message: "CLI operation failed.",
    details: {},
    stage,
  };
}

function promotionDiagnostic(error: PromotionFailure): CliDiagnostic {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    stage: "promotion",
  };
}

async function main(): Promise<void> {
  let stage: CliStage = "arguments";
  try {
    const options = parseArguments(process.argv.slice(2));
    stage = "input";
    const text = await readInput(options);
    stage = "ingestion";
    const ingestion = ingestSourceRecordText(text, {
      format: options.format,
      mode: "collect-all",
      maxInputBytes: options.limits.maxInputBytes,
      maxRecords: options.limits.maxRecords,
      maxRecordBytes: options.limits.maxRecordBytes,
    });
    let promotionFailure: PromotionFailure | undefined;

    if (options.command === "validate") {
      stage = "output";
      for (const item of ingestion.items) {
        writeJsonLine(process.stdout, serializeItemResult(item));
      }
    } else if (options.command === "ingest") {
      stage = "output";
      for (const record of ingestion.acceptedRecords) {
        writeJsonLine(process.stdout, record);
      }
    } else if (options.command === "promote") {
      stage = "promotion";
      const evidence = promoteSourceRecordsToEvidence(
        {
          ...requirePromotion(options),
          records: ingestion.acceptedRecords,
        },
        neutralEvidencePolicyV1,
      );
      stage = "output";
      writeJsonLine(process.stdout, evidence);
    } else {
      stage = "promotion";
      const composed = ingestAndPromoteEvidence(
        ingestion,
        requirePromotion(options),
        neutralEvidencePolicyV1,
      );
      if (composed.promotion.status === "failed") {
        promotionFailure = composed.promotion.error;
      }
      stage = "output";
      writeJsonLine(process.stdout, serializeComposedResult(composed));
    }

    const rejected = writeItemDiagnostics(ingestion);
    if (promotionFailure !== undefined) {
      writeJsonLine(process.stderr, promotionDiagnostic(promotionFailure));
    }
    if (rejected || promotionFailure !== undefined) {
      process.exitCode = 1;
    }
  } catch (error) {
    writeJsonLine(process.stderr, topLevelDiagnostic(error, stage));
    process.exitCode = 1;
  }
}

await main();
