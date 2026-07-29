#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  readTeamMemorySourceRecords,
  TeamMemoryConnectorError,
} from "./connectors/team-memory.ts";
import { canonicalizeJson } from "./source-records.ts";
import type {
  TeamMemorySourceRecordOptions,
} from "./connectors/team-memory.ts";
import type { JsonValue } from "./types.ts";

type CliStage = TeamMemoryConnectorError["stage"] | "arguments" | "output";

interface CliDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly stage: CliStage;
}

class CliError extends Error {
  readonly code: "invalid_command" | "output_failed";
  readonly stage: "arguments" | "output";

  constructor(
    code: "invalid_command" | "output_failed",
    stage: "arguments" | "output",
    message: string,
  ) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.stage = stage;
  }
}

const valueOptions = new Set([
  "--db",
  "--source-instance",
  "--from",
  "--to",
  "--person",
  "--project",
  "--limit",
]);
const helpText = `Usage:
  collective-cognition-teammem export \\
    --db /absolute/path/to/ledger.db \\
    --source-instance <public-stable-name> \\
    [--from <timestamp>] [--to <timestamp>] \\
    [--person <id>] [--project <id>] [--limit <positive-integer>] \\
    [--include-raw]

Options:
  --include-raw  Include privacy-sensitive raw source content.
  --help         Show this help without opening a source.
  --version      Show the package version without opening a source.
`;

function invalidArguments(): never {
  throw new CliError(
    "invalid_command",
    "arguments",
    "Team-memory CLI arguments are invalid.",
  );
}

function requiredValue(
  values: ReadonlyMap<string, string>,
  name: string,
): string {
  const value = values.get(name);
  if (value === undefined || value.trim().length === 0) {
    invalidArguments();
  }
  return value;
}

function parseArguments(
  args: readonly string[],
):
  | { readonly mode: "export"; readonly options: TeamMemorySourceRecordOptions }
  | { readonly mode: "help" }
  | { readonly mode: "version" } {
  if (args.length === 1 && args[0] === "--help") {
    return { mode: "help" };
  }
  if (args.length === 1 && args[0] === "--version") {
    return { mode: "version" };
  }
  if (args[0] !== "export") {
    invalidArguments();
  }
  const values = new Map<string, string>();
  let includeRaw = false;
  let controlMode: "help" | "version" | undefined;

  for (let index = 1; index < args.length;) {
    const option = args[index];
    if (option === "--help" || option === "--version") {
      const mode = option === "--help" ? "help" : "version";
      if (controlMode !== undefined) {
        invalidArguments();
      }
      controlMode = mode;
      index += 1;
      continue;
    }
    if (option === "--include-raw") {
      if (includeRaw) {
        invalidArguments();
      }
      includeRaw = true;
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
    if (value === undefined || value.startsWith("--")) {
      invalidArguments();
    }
    values.set(option, value);
    index += 2;
  }

  if (controlMode !== undefined) {
    return { mode: controlMode };
  }

  const limitText = values.get("--limit");
  let limit: number | undefined;
  if (limitText !== undefined) {
    if (!/^[1-9]\d*$/.test(limitText)) {
      invalidArguments();
    }
    limit = Number(limitText);
    if (!Number.isSafeInteger(limit)) {
      invalidArguments();
    }
  }

  return {
    mode: "export",
    options: {
      databasePath: requiredValue(values, "--db"),
      sourceInstance: requiredValue(values, "--source-instance"),
      ...(values.get("--from") === undefined
        ? {}
        : { from: values.get("--from") as string }),
      ...(values.get("--to") === undefined
        ? {}
        : { to: values.get("--to") as string }),
      ...(values.get("--person") === undefined
        ? {}
        : { person: values.get("--person") as string }),
      ...(values.get("--project") === undefined
        ? {}
        : { project: values.get("--project") as string }),
      ...(limit === undefined ? {} : { limit }),
      includeRaw,
    },
  };
}

function packageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { readonly version?: unknown };
  if (typeof packageJson.version !== "string") {
    throw new CliError(
      "output_failed",
      "output",
      "Team-memory CLI output failed.",
    );
  }
  return packageJson.version;
}

function diagnosticFor(error: unknown): CliDiagnostic {
  if (error instanceof TeamMemoryConnectorError) {
    const messages: Record<TeamMemoryConnectorError["code"], string> = {
      invalid_options: "Team-memory connector options are invalid.",
      target_unavailable: "Team-memory ledger is unavailable.",
      incompatible_ledger: "Team-memory ledger schema is incompatible.",
      invalid_row: "Team-memory ledger contains an invalid row.",
      read_failed: "Team-memory ledger could not be read.",
    };
    return {
      code: error.code,
      message: messages[error.code],
      stage: error.stage,
    };
  }
  if (error instanceof CliError) {
    return {
      code: error.code,
      message: error.message,
      stage: error.stage,
    };
  }
  return {
    code: "output_failed",
    message: "Team-memory CLI output failed.",
    stage: "output",
  };
}

async function writeText(
  stream: NodeJS.WriteStream,
  text: string,
): Promise<void> {
  if (text.length === 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (error?: Error | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
      } else {
        stream.off("error", onError);
        resolve();
      }
    };
    const onError = (error: Error): void => {
      settle(error);
    };
    stream.once("error", onError);
    stream.write(text, (error) => settle(error));
  });
}

async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    const parsed = parseArguments(args);
    if (parsed.mode === "help") {
      await writeText(process.stdout, helpText);
      return;
    }
    if (parsed.mode === "version") {
      await writeText(process.stdout, `${packageVersion()}\n`);
      return;
    }

    const records = readTeamMemorySourceRecords(parsed.options);
    const output = records.length === 0
      ? ""
      : `${
        records.map((record) =>
          canonicalizeJson(record as unknown as JsonValue)
        ).join("\n")
      }\n`;
    try {
      await writeText(process.stdout, output);
    } catch {
      throw new CliError(
        "output_failed",
        "output",
        "Team-memory CLI output failed.",
      );
    }
  } catch (error) {
    process.exitCode = 1;
    try {
      await writeText(
        process.stderr,
        `${JSON.stringify(diagnosticFor(error))}\n`,
      );
    } catch {}
  }
}

await main();
