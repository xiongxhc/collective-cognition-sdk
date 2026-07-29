import {
  readTeamMemoryEvents,
  teamMemoryEventToSourceRecord,
} from "../src/adapters/team-memory.ts";
import {
  createObject,
  promoteSourceRecordsToEvidence,
} from "../src/index.ts";
import {
  teamMemoryActivityEvidencePolicyV1,
} from "../src/adapters/team-memory-activity.ts";

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
    rationale: "The selected ledger records document delivery activity.",
    attribution: {
      initiatorId: "human:team-owner",
      executorId: "agent:team-memory-example",
      accountableId: "human:team-owner",
    },
  };
  const createdAt = "2026-07-28T00:00:00.000Z";
  const hypothesis = createObject({
    id: context.hypothesisId,
    type: "hypothesis",
    version: 1,
    state: "proposed",
    title: "Delivery readiness",
    data: {
      statement:
        "The selected project activity may contribute to delivery readiness.",
    },
    createdAt,
    updatedAt: createdAt,
    attribution: context.attribution,
    provenance: [
      {
        source: "example",
        sourceId: "team-memory-evidence",
        capturedAt: createdAt,
      },
    ],
    contextId: context.contextId,
    relationships: [
      { type: "supports-goal", targetId: "goal:delivery-readiness" },
    ],
  });
  const sourceRecords = readTeamMemoryEvents({ dbPath, limit: 5 }).map(
    (row) => teamMemoryEventToSourceRecord(row),
  );
  const latestCapturedAt = sourceRecords.at(-1)?.capturedAt;
  const evidence = latestCapturedAt === undefined
    ? []
    : [
      promoteSourceRecordsToEvidence(
        {
          ...context,
          records: sourceRecords,
          promotedAt: latestCapturedAt,
        },
        teamMemoryActivityEvidencePolicyV1,
      ),
    ];

  console.log(
    `Source records imported: ${sourceRecords.length}; Evidence promoted: ${evidence.length}; hypothesis: ${context.hypothesisId}; decisions inferred: 0`,
  );
  for (const object of [hypothesis, ...evidence]) {
    console.log(JSON.stringify(object));
  }
}
