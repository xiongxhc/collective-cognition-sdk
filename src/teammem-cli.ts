import {
  readTeamMemoryEvents,
  teamMemoryEventToSourceRecord,
} from "./adapters/team-memory.ts";
import type { TeamMemoryQuery } from "./adapters/team-memory.ts";
import { DomainError } from "./errors.ts";
import type { JsonObject } from "./types.ts";

type TeamMemoryCliStage = "arguments" | "read" | "mapping" | "output";

interface TeamMemoryCliOptions {
  readonly query: TeamMemoryQuery;
  readonly includeRaw: boolean;
}

class TeamMemoryCliError extends Error {
  readonly code: string;
  readonly details: JsonObject;

  constructor(code: string, message: string, details: JsonObject = {}) {
    super(message);
    this.name = "TeamMemoryCliError";
    this.code = code;
    this.details = details;
  }
}

function invalidArgument(message: string): never {
  throw new TeamMemoryCliError("INVALID_ARGUMENT", message);
}

function parseArguments(args: readonly string[]): TeamMemoryCliOptions {
  const values: Record<string, string> = {};
  const names = new Set([
    "db",
    "from",
    "to",
    "person",
    "project",
    "limit",
  ]);
  let includeRaw = false;

  for (let index = 0; index < args.length;) {
    const name = args[index];
    if (
      typeof name !== "string" ||
      !name.startsWith("--")
    ) {
      invalidArgument("Invalid team-memory CLI argument.");
    }
    if (name === "--include-raw") {
      if (includeRaw) {
        invalidArgument("--include-raw may be provided only once.");
      }
      includeRaw = true;
      index += 1;
      continue;
    }

    const option = name.slice(2);
    const value = args[index + 1];
    if (
      !names.has(option) ||
      value === undefined ||
      value.startsWith("--") ||
      values[option] !== undefined
    ) {
      invalidArgument("Invalid team-memory CLI argument.");
    }
    values[option] = value;
    index += 2;
  }

  if (!values.db) {
    invalidArgument("--db is required.");
  }

  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    invalidArgument("--limit must be a positive integer.");
  }

  return {
    query: {
      dbPath: values.db,
      ...(values.from === undefined ? {} : { from: values.from }),
      ...(values.to === undefined ? {} : { to: values.to }),
      ...(values.person === undefined ? {} : { person: values.person }),
      ...(values.project === undefined ? {} : { project: values.project }),
      ...(limit === undefined ? {} : { limit }),
    },
    includeRaw,
  };
}

function genericFailure(stage: TeamMemoryCliStage): {
  readonly code: string;
  readonly message: string;
} {
  switch (stage) {
    case "read":
      return {
        code: "TEAM_MEMORY_READ_FAILED",
        message: "Unable to read team-memory events.",
      };
    case "mapping":
      return {
        code: "TEAM_MEMORY_MAPPING_FAILED",
        message: "Unable to map team-memory events.",
      };
    case "output":
      return {
        code: "TEAM_MEMORY_OUTPUT_FAILED",
        message: "Unable to write team-memory records.",
      };
    case "arguments":
      return {
        code: "TEAM_MEMORY_CLI_ERROR",
        message: "Team-memory CLI operation failed.",
      };
  }
}

function diagnosticFor(
  error: unknown,
  stage: TeamMemoryCliStage,
): object {
  if (error instanceof DomainError || error instanceof TeamMemoryCliError) {
    return {
      stage,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }
  const failure = genericFailure(stage);
  return {
    stage,
    error: {
      code: failure.code,
      message: failure.message,
      details: {},
    },
  };
}

function main(): void {
  let stage: TeamMemoryCliStage = "arguments";
  try {
    const options = parseArguments(process.argv.slice(2));
    stage = "read";
    const rows = readTeamMemoryEvents(options.query);
    stage = "mapping";
    const records = rows.map((row) =>
      teamMemoryEventToSourceRecord(row, {
        includeRaw: options.includeRaw,
      })
    );
    stage = "output";
    const output = records.map((record) => JSON.stringify(record)).join("\n");
    if (output.length > 0) {
      process.stdout.write(`${output}\n`);
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify(diagnosticFor(error, stage))}\n`);
    process.exitCode = 1;
  }
}

main();
