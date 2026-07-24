import {
  readTeamMemoryEvents,
  teamMemoryEventToEvidence,
} from "../src/index.ts";

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error(
    "Usage: npm run --silent example:teammem -- /path/to/team-memory-agent/ledger.db",
  );
  process.exitCode = 1;
} else {
  const dbPath = args[0] as string;
  const context = {
    hypothesisId: "hypothesis:delivery-risk",
    contextId: "organization:team",
  };
  const evidence = readTeamMemoryEvents({ dbPath, limit: 5 }).map((row) =>
    teamMemoryEventToEvidence(row, context),
  );

  console.log(
    `Evidence imported: ${evidence.length}; hypothesis: ${context.hypothesisId}; decisions inferred: 0`,
  );
  for (const object of evidence) {
    console.log(JSON.stringify(object));
  }
}
