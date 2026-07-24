import {
  readTeamMemoryEvents,
  teamMemoryEventToSourceRecord,
} from "./adapters/team-memory.ts";
import type { TeamMemoryQuery } from "./adapters/team-memory.ts";

function parseArguments(args: readonly string[]): TeamMemoryQuery {
  const values: Record<string, string> = {};
  const names = new Set([
    "db",
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

  if (!values.db) {
    throw new Error("--db is required.");
  }

  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer.");
  }

  return {
    dbPath: values.db,
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
    process.stdout.write(
      `${JSON.stringify(teamMemoryEventToSourceRecord(row))}\n`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
