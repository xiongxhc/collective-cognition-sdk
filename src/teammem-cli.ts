import {
  readTeamMemoryEvents,
  teamMemoryEventToEvidence,
} from "./adapters/team-memory.ts";
import type {
  TeamMemoryEvidenceContext,
  TeamMemoryQuery,
} from "./adapters/team-memory.ts";

type CliOptions = TeamMemoryQuery & TeamMemoryEvidenceContext;

function parseArguments(args: readonly string[]): CliOptions {
  const values: Record<string, string> = {};
  const names = new Set([
    "db",
    "hypothesis-id",
    "context-id",
    "from",
    "to",
    "person",
    "project",
    "limit",
  ]);

  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (
      typeof name !== "string" ||
      !name.startsWith("--") ||
      !names.has(name.slice(2)) ||
      value === undefined
    ) {
      throw new Error(`Invalid argument: ${name}`);
    }
    values[name.slice(2)] = value;
  }

  if (!values.db || !values["hypothesis-id"] || !values["context-id"]) {
    throw new Error("--db, --hypothesis-id, and --context-id are required.");
  }

  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer.");
  }

  return {
    dbPath: values.db,
    hypothesisId: values["hypothesis-id"],
    contextId: values["context-id"],
    ...(values.from === undefined ? {} : { from: values.from }),
    ...(values.to === undefined ? {} : { to: values.to }),
    ...(values.person === undefined ? {} : { person: values.person }),
    ...(values.project === undefined ? {} : { project: values.project }),
    ...(limit === undefined ? {} : { limit }),
  };
}

function main(): void {
  const options = parseArguments(process.argv.slice(2));
  const rows = readTeamMemoryEvents(options);
  for (const row of rows) {
    process.stdout.write(`${JSON.stringify(teamMemoryEventToEvidence(row, options))}\n`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
