import {
  readTeamMemoryEvents,
  teamMemoryEventToSourceRecord,
} from "../src/adapters/team-memory.ts";
import {
  neutralEvidencePolicyV1,
  promoteSourceRecordToEvidence,
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
    attribution: {
      initiatorId: "human:team-owner",
      executorId: "agent:team-memory-example",
      accountableId: "human:team-owner",
    },
  };
  const sourceRecords = readTeamMemoryEvents({ dbPath, limit: 5 }).map(
    teamMemoryEventToSourceRecord,
  );
  const evidence = sourceRecords.map((record) =>
    promoteSourceRecordToEvidence(
      { ...context, record, promotedAt: record.capturedAt },
      neutralEvidencePolicyV1,
    ),
  );

  console.log(
    `Source records imported: ${sourceRecords.length}; Evidence promoted: ${evidence.length}; hypothesis: ${context.hypothesisId}; decisions inferred: 0`,
  );
  for (const object of evidence) {
    console.log(JSON.stringify(object));
  }
}
