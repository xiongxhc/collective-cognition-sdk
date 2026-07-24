import { readFileSync } from "node:fs";

import { DomainError } from "./errors.ts";
import { ingestSourceRecordText } from "./ingestion.ts";
import {
  ingestAndPromoteEvidence,
  neutralEvidencePolicyV1,
  promoteSourceRecordToEvidence,
} from "./promotion.ts";
import type {
  IngestionBatchResult,
  IngestionItemResult,
} from "./ingestion.ts";
import type { EvidencePromotionContext } from "./promotion.ts";

type Command = "validate" | "ingest" | "promote" | "ingest-promote";
type InputFormat = "json" | "jsonl";

interface CliOptions {
  readonly command: Command;
  readonly input: string;
  readonly format: InputFormat;
  readonly promotion?: EvidencePromotionContext;
}

const commands = new Set<Command>([
  "validate",
  "ingest",
  "promote",
  "ingest-promote",
]);
const baseOptionNames = ["input", "format"] as const;
const promotionOptionNames = [
  "policy",
  "hypothesis-id",
  "context-id",
  "initiator-id",
  "executor-id",
  "accountable-id",
  "promoted-at",
] as const;
const optionNames: ReadonlySet<string> = new Set([
  ...baseOptionNames,
  ...promotionOptionNames,
]);

function isCommand(value: unknown): value is Command {
  return typeof value === "string" && commands.has(value as Command);
}

function requiredValue(
  values: Readonly<Record<string, string>>,
  name: string,
): string {
  const value = values[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`--${name} is required.`);
  }
  return value;
}

function parseArguments(args: readonly string[]): CliOptions {
  const command = args[0];
  if (!isCommand(command)) {
    throw new Error(
      "Command must be validate, ingest, promote, or ingest-promote.",
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
      throw new Error(`Invalid argument: ${option ?? ""}`);
    }
    values[option.slice(2)] = value;
  }

  const input = requiredValue(values, "input");
  const format = requiredValue(values, "format");
  if (format !== "json" && format !== "jsonl") {
    throw new Error("--format must be json or jsonl.");
  }

  const requiresPromotion =
    command === "promote" || command === "ingest-promote";
  if (!requiresPromotion) {
    for (const name of promotionOptionNames) {
      if (values[name] !== undefined) {
        throw new Error(`--${name} is not valid for ${command}.`);
      }
    }
    return { command, input, format };
  }

  const policy = requiredValue(values, "policy");
  if (policy !== "neutral-evidence-v1") {
    throw new Error("--policy must be neutral-evidence-v1.");
  }

  return {
    command,
    input,
    format,
    promotion: {
      hypothesisId: requiredValue(values, "hypothesis-id"),
      contextId: requiredValue(values, "context-id"),
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
  if (item.error === undefined) {
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

function writeJsonLine(
  stream: NodeJS.WriteStream,
  value: unknown,
): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function writeDiagnostics(result: IngestionBatchResult): boolean {
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
    throw new Error(`Promotion arguments are required for ${options.command}.`);
  }
  return options.promotion;
}

function main(): void {
  const options = parseArguments(process.argv.slice(2));
  const text = readFileSync(options.input === "-" ? 0 : options.input, "utf8");
  const ingestion = ingestSourceRecordText(text, {
    format: options.format,
    mode: "collect-all",
  });

  if (options.command === "validate") {
    for (const item of ingestion.items) {
      writeJsonLine(process.stdout, serializeItemResult(item));
    }
  } else if (options.command === "ingest") {
    for (const record of ingestion.acceptedRecords) {
      writeJsonLine(process.stdout, record);
    }
  } else if (options.command === "promote") {
    const promotion = requirePromotion(options);
    const evidence = ingestion.acceptedRecords.map((record) =>
      promoteSourceRecordToEvidence(
        { ...promotion, record },
        neutralEvidencePolicyV1,
      ),
    );
    for (const object of evidence) {
      writeJsonLine(process.stdout, object);
    }
  } else {
    const composed = ingestAndPromoteEvidence(
      ingestion.acceptedRecords,
      requirePromotion(options),
      neutralEvidencePolicyV1,
      { mode: "collect-all" },
    );
    writeJsonLine(process.stdout, composed);
  }

  if (writeDiagnostics(ingestion)) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof DomainError || error instanceof Error
      ? error.message
      : String(error),
  );
  process.exitCode = 1;
}
