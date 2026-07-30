#!/usr/bin/env node

import { createReadStream, readFileSync } from "node:fs";
import { isAbsolute, normalize } from "node:path";
import { TextDecoder } from "node:util";

import {
  MARKDOWN_COGNITION_MAX_INPUT_BYTES,
  MARKDOWN_COGNITION_MAX_RECORDS,
  MarkdownCognitionError,
  initializeMarkdownCognitionTarget,
  projectMarkdownCognition,
  verifyMarkdownCognitionTarget,
} from "./markdown-cognition.ts";
import type { MarkdownCognitionRecord } from "./markdown-cognition.ts";
import { parseProfiledJson } from "./json-text.ts";
import { canonicalizeJson } from "./source-records.ts";
import type { JsonValue } from "./types.ts";

type ParsedCommand =
  | { readonly mode: "help" }
  | { readonly mode: "version" }
  | { readonly mode: "init"; readonly targetDirectory: string }
  | {
      readonly mode: "project";
      readonly input: string;
      readonly targetDirectory: string;
      readonly pruneManaged: boolean;
    }
  | { readonly mode: "verify"; readonly targetDirectory: string };

type CliStage = "arguments" | "input" | "target" | "projection" | "output";

interface CliDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly stage: CliStage;
  readonly relativePath?: string;
}

class CliError extends Error {
  readonly code: "invalid_command" | "invalid_projection_input" | "output_failed" | "projection_io_failed" | "projection_limit_exceeded";
  readonly stage: CliStage;

  constructor(
    code: CliError["code"],
    stage: CliStage,
    message: string,
  ) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.stage = stage;
  }
}

const valueOptions = new Set(["--input", "--target"]);
const helpText = `Usage:
  collective-cognition-markdown init \\
    --target /absolute/path/to/Collective-Cognition
  collective-cognition-markdown project \\
    --input /absolute/path/to/portable-cognition.jsonl \\
    --target /absolute/path/to/Collective-Cognition \\
    [--prune-managed]
  collective-cognition-markdown verify \\
    --target /absolute/path/to/Collective-Cognition

Options:
  --prune-managed  Remove unchanged files no longer in this projection.
  --help           Show this help without opening an input or target.
  --version        Show the package version without opening an input or target.
`;

const errorMessages: Readonly<Record<MarkdownCognitionError["code"], string>> = {
  incompatible_target: "Markdown cognition target is incompatible.",
  invalid_markdown_record: "Markdown cognition record is invalid.",
  invalid_projection_input: "Markdown cognition projection input is invalid.",
  invalid_target: "Markdown cognition target is invalid.",
  managed_file_conflict: "A managed Markdown cognition file has changed.",
  projection_io_failed: "Markdown cognition projection failed.",
  projection_limit_exceeded: "Markdown cognition projection exceeds a supported limit.",
  target_not_initialized: "Markdown cognition target is not initialized.",
  unsafe_target_entry: "Markdown cognition target contains an unsafe entry.",
};

function invalidArguments(): never {
  throw new CliError(
    "invalid_command",
    "arguments",
    "Markdown cognition CLI arguments are invalid.",
  );
}

function inputInvalid(): never {
  throw new CliError(
    "invalid_projection_input",
    "input",
    "Markdown cognition projection input is invalid.",
  );
}

function inputLimitExceeded(): never {
  throw new CliError(
    "projection_limit_exceeded",
    "input",
    "Markdown cognition projection exceeds a supported limit.",
  );
}

function requiredValue(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || value.length === 0) invalidArguments();
  return value;
}

function isExplicitAbsolutePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("\0") &&
    isAbsolute(value) &&
    normalize(value) === value
  );
}

function parseArguments(args: readonly string[]): ParsedCommand {
  if (args.length === 1 && args[0] === "--help") return { mode: "help" };
  if (args.length === 1 && args[0] === "--version") return { mode: "version" };

  const command = args[0];
  if (command !== "init" && command !== "project" && command !== "verify") {
    invalidArguments();
  }

  const values = new Map<string, string>();
  let controlMode: "help" | "version" | undefined;
  let pruneManaged = false;
  for (let index = 1; index < args.length;) {
    const option = args[index];
    if (option === "--help" || option === "--version") {
      if (controlMode !== undefined) invalidArguments();
      controlMode = option === "--help" ? "help" : "version";
      index += 1;
      continue;
    }
    if (option === "--prune-managed") {
      if (command !== "project" || pruneManaged) invalidArguments();
      pruneManaged = true;
      index += 1;
      continue;
    }
    if (option === undefined || !valueOptions.has(option) || values.has(option)) {
      invalidArguments();
    }
    if ((command === "init" || command === "verify") && option !== "--target") {
      invalidArguments();
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) invalidArguments();
    values.set(option, value);
    index += 2;
  }

  const targetDirectory = requiredValue(values, "--target");
  if (!isExplicitAbsolutePath(targetDirectory)) invalidArguments();
  if (command === "init" || command === "verify") {
    if (controlMode !== undefined) return { mode: controlMode };
    return command === "init"
      ? { mode: "init", targetDirectory }
      : { mode: "verify", targetDirectory };
  }

  const input = requiredValue(values, "--input");
  if (input !== "-" && !isExplicitAbsolutePath(input)) invalidArguments();
  if (controlMode !== undefined) return { mode: controlMode };
  return { mode: "project", input, targetDirectory, pruneManaged };
}

function packageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { readonly version?: unknown };
    if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
      throw new Error("invalid version");
    }
    return packageJson.version;
  } catch {
    throw new CliError(
      "output_failed",
      "output",
      "Markdown cognition CLI output failed.",
    );
  }
}

async function writeText(stream: NodeJS.WriteStream, text: string): Promise<void> {
  if (text.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (error?: Error | null): void => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    const onError = (error: Error): void => settle(error);
    stream.once("error", onError);
    stream.write(text, (error) => {
      if (error) {
        settle(error);
        return;
      }
      setImmediate(() => settle());
    });
  });
}

async function writeJson(value: object): Promise<void> {
  try {
    await writeText(
      process.stdout,
      `${canonicalizeJson(value as unknown as JsonValue)}\n`,
    );
  } catch {
    throw new CliError(
      "output_failed",
      "output",
      "Markdown cognition CLI output failed.",
    );
  }
}

function parseJsonLine(line: Buffer): unknown {
  if (line.length === 0) inputInvalid();
  if (line.length > MARKDOWN_COGNITION_MAX_INPUT_BYTES) inputLimitExceeded();
  try {
    return parseProfiledJson(
      new TextDecoder("utf-8", { fatal: true }).decode(line),
    );
  } catch {
    inputInvalid();
  }
}

async function readJsonLines(source: AsyncIterable<Buffer>): Promise<readonly MarkdownCognitionRecord[]> {
  const records: MarkdownCognitionRecord[] = [];
  let totalBytes = 0;
  let remaining = Buffer.alloc(0);
  try {
    for await (const chunk of source) {
      totalBytes += chunk.length;
      if (totalBytes > MARKDOWN_COGNITION_MAX_INPUT_BYTES) inputLimitExceeded();
      if (remaining.length + chunk.length > MARKDOWN_COGNITION_MAX_INPUT_BYTES) inputLimitExceeded();
      let contents = remaining.length === 0 ? chunk : Buffer.concat([remaining, chunk]);
      let newline = contents.indexOf(0x0a);
      while (newline !== -1) {
        if (records.length >= MARKDOWN_COGNITION_MAX_RECORDS) inputLimitExceeded();
        records.push(parseJsonLine(contents.subarray(0, newline)) as MarkdownCognitionRecord);
        contents = contents.subarray(newline + 1);
        newline = contents.indexOf(0x0a);
      }
      remaining = Buffer.from(contents);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(
      "projection_io_failed",
      "input",
      "Markdown cognition CLI input could not be read.",
    );
  }
  if (remaining.length !== 0) {
    if (records.length >= MARKDOWN_COGNITION_MAX_RECORDS) inputLimitExceeded();
    records.push(parseJsonLine(remaining) as MarkdownCognitionRecord);
  }
  return Object.freeze(records);
}

async function readRecords(input: string): Promise<readonly MarkdownCognitionRecord[]> {
  if (input === "-") return readJsonLines(process.stdin);
  return readJsonLines(createReadStream(input));
}

function safeRelativePath(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    isAbsolute(value) ||
    value === ".." ||
    value.startsWith("../") ||
    value.startsWith("..\\")
  ) {
    return undefined;
  }
  return value;
}

function diagnosticFor(error: unknown, stage: CliStage): CliDiagnostic {
  if (error instanceof CliError) {
    return { code: error.code, message: error.message, stage: error.stage };
  }
  if (error instanceof MarkdownCognitionError) {
    const relativePath = safeRelativePath(error.relativePath);
    return {
      code: error.code,
      message: errorMessages[error.code],
      stage,
      ...(relativePath === undefined
        ? {}
        : { relativePath }),
    };
  }
  return {
    code: "output_failed",
    message: "Markdown cognition CLI output failed.",
    stage: "output",
  };
}

async function main(): Promise<void> {
  let stage: CliStage = "arguments";
  try {
    const command = parseArguments(process.argv.slice(2));
    if (command.mode === "help") {
      stage = "output";
      await writeText(process.stdout, helpText);
      return;
    }
    if (command.mode === "version") {
      stage = "output";
      await writeText(process.stdout, `${packageVersion()}\n`);
      return;
    }
    if (command.mode === "init") {
      stage = "target";
      await initializeMarkdownCognitionTarget({ targetDirectory: command.targetDirectory });
      stage = "output";
      await writeJson({ status: "initialized" });
      return;
    }
    if (command.mode === "verify") {
      stage = "target";
      const report = await verifyMarkdownCognitionTarget({ targetDirectory: command.targetDirectory });
      stage = "output";
      await writeJson(report);
      if (report.status === "failed") process.exitCode = 1;
      return;
    }
    stage = "input";
    const records = await readRecords(command.input);
    stage = "projection";
    const report = await projectMarkdownCognition({
      pruneManaged: command.pruneManaged,
      records,
      targetDirectory: command.targetDirectory,
    });
    stage = "output";
    await writeJson(report);
  } catch (error) {
    process.exitCode = 1;
    try {
      await writeText(
        process.stderr,
        `${canonicalizeJson(diagnosticFor(error, stage) as unknown as JsonValue)}\n`,
      );
    } catch {}
  }
}

await main();
