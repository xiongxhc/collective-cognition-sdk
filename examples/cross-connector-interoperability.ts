import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalizeJson,
  createObject,
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  ingestSourceRecords,
  promoteSourceRecordsToEvidence,
  serializePortableCognitionRecord,
  transitionObject,
} from "../src/index.ts";
import type {
  CognitiveObject,
  EvidencePromotionPolicy,
  IngestionBatchResult,
  JsonValue,
  PortableCognitionRecord,
  SourceRecord,
} from "../src/index.ts";
import {
  readGitCommitSourceRecords,
} from "../src/connectors/git.ts";
import {
  readTeamMemorySourceRecords,
} from "../src/connectors/team-memory.ts";

export interface CrossConnectorInteroperabilityExampleResult {
  readonly sourceRecordCount: number;
  readonly sourceSystems: readonly [
    "git-repository",
    "teammem-event-ledger",
  ];
  readonly acceptedRecordCount: number;
  readonly evidenceId: string;
  readonly hypothesisId: "hypothesis:fictional-interoperability";
  readonly portableRecordCount: number;
  readonly semanticRoundTrip: true;
  readonly decisionsInferred: 0;
  readonly principlesInferred: 0;
}

export type CrossConnectorInteroperabilityExampleEvent =
  | {
    readonly type: "temporary-sources";
    readonly temporaryRoot: string;
    readonly repositoryPath: string;
    readonly databasePath: string;
  }
  | {
    readonly type: "ingestion";
    readonly records: readonly SourceRecord[];
    readonly result: IngestionBatchResult;
  }
  | {
    readonly type: "exchange";
    readonly cognitiveObjects: readonly CognitiveObject[];
    readonly portableRecords: readonly PortableCognitionRecord[];
    readonly restoredPortableRecords: readonly PortableCognitionRecord[];
  };

export interface CrossConnectorInteroperabilityExampleOptions {
  readonly observe?: (
    event: CrossConnectorInteroperabilityExampleEvent,
  ) => void;
}

const createdAt = "2026-08-21T09:00:00.000Z";
const transitionedAt = "2026-08-21T09:01:00.000Z";
const contextId = "context:fictional-interoperability";
const hypothesisId = "hypothesis:fictional-interoperability" as const;
const attribution = {
  initiatorId: "person:fictional-owner",
  executorId: "agent:fictional-collector",
  accountableId: "person:fictional-owner",
};
const unknownNamespacedExtension = {
  "example.invalid/connector-note": {
    preservation: "opaque",
    values: ["fictional", 1, true, null],
  },
};
const neutralCrossConnectorPolicy: EvidencePromotionPolicy = {
  id: "fictional-cross-connector-neutral-evidence",
  version: "0.1.0",
  map(records) {
    return {
      title: "Fictional cross-connector evidence",
      statement: `${records.length} fictional source records were explicitly promoted without interpretation.`,
      evidenceKind: "cross-connector-reference",
      polarity: "neutral",
    };
  },
};

const eventsSchema = `
  CREATE TABLE events (
    id      INTEGER PRIMARY KEY,
    person  TEXT NOT NULL,
    project TEXT,
    ts      TEXT NOT NULL,
    source  TEXT NOT NULL,
    kind    TEXT NOT NULL,
    summary TEXT NOT NULL,
    refs    TEXT,
    raw     TEXT,
    hash    TEXT NOT NULL,
    UNIQUE(person, source, hash)
  );
`;

function runGit(
  repositoryPath: string,
  temporaryRoot: string,
  args: readonly string[],
): string {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: temporaryRoot,
      XDG_CONFIG_HOME: temporaryRoot,
      GIT_AUTHOR_DATE: "2026-08-20T10:00:00+00:00",
      GIT_AUTHOR_EMAIL: "fictional-author@example.invalid",
      GIT_AUTHOR_NAME: "Fictional Author",
      GIT_COMMITTER_DATE: "2026-08-20T10:00:00+00:00",
      GIT_COMMITTER_EMAIL: "fictional-committer@example.invalid",
      GIT_COMMITTER_NAME: "Fictional Committer",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
    },
    shell: false,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error("Fictional Git source setup failed.");
  }
  return result.stdout.trim();
}

function createFictionalGitRepository(
  temporaryRoot: string,
  repositoryPath: string,
): string {
  mkdirSync(repositoryPath);
  runGit(repositoryPath, temporaryRoot, [
    "init",
    "--quiet",
    "--initial-branch=main",
  ]);
  writeFileSync(
    join(repositoryPath, "fictional-observation.txt"),
    "fictional connector observation\n",
  );
  runGit(repositoryPath, temporaryRoot, [
    "add",
    "fictional-observation.txt",
  ]);
  runGit(repositoryPath, temporaryRoot, [
    "commit",
    "--quiet",
    "--no-gpg-sign",
    "-m",
    "Fictional interoperability observation",
  ]);
  return runGit(repositoryPath, temporaryRoot, ["rev-parse", "HEAD"]);
}

function createFictionalLedger(databasePath: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(eventsSchema);
    database.prepare(
      "INSERT INTO events (id, person, project, ts, source, kind, summary, refs, raw, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      1,
      "fictional-owner",
      "fictional-interoperability",
      "2026-08-20T10:00:00.000Z",
      "fictional-reference",
      "observation",
      "Fictional ledger observation.",
      '{"reference":"fictional-ledger-entry"}',
      null,
      "fictional-ledger-revision-1",
    );
  } finally {
    database.close();
  }
}

function ingestObservedRecords(
  records: readonly SourceRecord[],
  observe: CrossConnectorInteroperabilityExampleOptions["observe"],
): IngestionBatchResult {
  const result = ingestSourceRecords(records);
  observe?.(Object.freeze({ type: "ingestion", records, result }));
  return result;
}

function portableRecord(
  payload: CognitiveObject,
): PortableCognitionRecord<"cognitive-object"> {
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload,
  }) as PortableCognitionRecord<"cognitive-object">;
}

export function runCrossConnectorInteroperabilityExample():
  CrossConnectorInteroperabilityExampleResult;
export function runCrossConnectorInteroperabilityExample(
  options: CrossConnectorInteroperabilityExampleOptions,
): CrossConnectorInteroperabilityExampleResult;
export function runCrossConnectorInteroperabilityExample(
  options: CrossConnectorInteroperabilityExampleOptions = {},
): CrossConnectorInteroperabilityExampleResult {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "cc-interoperability-"));
  const repositoryPath = join(temporaryRoot, "repository");
  const databasePath = join(temporaryRoot, "ledger.db");

  try {
    options.observe?.(Object.freeze({
      type: "temporary-sources",
      temporaryRoot,
      repositoryPath,
      databasePath,
    }));
    const tipCommitId = createFictionalGitRepository(
      temporaryRoot,
      repositoryPath,
    );
    createFictionalLedger(databasePath);

    const gitRecords = readGitCommitSourceRecords({
      repositoryPath,
      sourceInstance: "fictional-repository.example.invalid",
      tipCommitId,
      capturedAt: createdAt,
      limit: 1,
    });
    const teamMemoryRecords = readTeamMemorySourceRecords({
      databasePath,
      sourceInstance: "fictional-ledger.example.invalid",
      limit: 1,
    });
    const records = Object.freeze([...gitRecords, ...teamMemoryRecords]);
    const ingestion = ingestObservedRecords(records, options.observe);

    const goal = createObject({
      id: "goal:fictional-interoperability",
      type: "goal",
      version: 1,
      state: "draft",
      title: "Preserve fictional cross-connector semantics",
      data: {
        objective: "Round-trip source-neutral cognition from two fictional maintained connectors.",
      },
      createdAt,
      updatedAt: createdAt,
      attribution,
      provenance: [{
        source: "owned-reference-exchange",
        sourceId: "goal:fictional-interoperability",
        capturedAt: createdAt,
      }],
      contextId,
      relationships: [],
      extensions: unknownNamespacedExtension,
    });
    const hypothesis = createObject({
      id: hypothesisId,
      type: "hypothesis",
      version: 1,
      state: "proposed",
      title: "Independent connectors preserve common semantics",
      data: {
        statement: "Git and ledger records can retain neutral portable meaning.",
      },
      createdAt,
      updatedAt: createdAt,
      attribution,
      provenance: [{
        source: "owned-reference-exchange",
        sourceId: hypothesisId,
        capturedAt: createdAt,
      }],
      contextId,
      relationships: [{
        type: "supports-goal",
        targetId: goal.id,
      }],
    });
    const evidence = promoteSourceRecordsToEvidence(
      {
        records: ingestion.acceptedRecords,
        hypothesisId,
        contextId,
        rationale: "Explicitly preserve neutral provenance from both fictional source systems.",
        promotedAt: createdAt,
        attribution,
      },
      neutralCrossConnectorPolicy,
    );
    const transition = transitionObject(hypothesis, "under_review", {
      eventId: "event:fictional-hypothesis-review",
      occurredAt: transitionedAt,
      initiator: { id: "person:fictional-owner", kind: "human" },
      executor: { id: "agent:fictional-collector", kind: "agent" },
      accountableParty: { id: "person:fictional-owner", kind: "human" },
      automationMode: "manual",
      consequenceLevel: "routine",
      rationale: "Explicitly review the fictional interoperability hypothesis.",
    });

    const cognitiveObjects = Object.freeze([
      goal,
      hypothesis,
      evidence,
      transition.object,
    ]);
    const portableRecords = Object.freeze([
      portableRecord(goal),
      portableRecord(hypothesis),
      portableRecord(evidence),
      portableRecord(transition.object),
      createPortableCognitionRecord({
        schemaVersion: "0.1.0",
        recordType: "cognition-event",
        payload: transition.event,
      }),
    ]);
    const restoredPortableRecords = Object.freeze(
      portableRecords.map((record) =>
        deserializePortableCognitionRecord(
          serializePortableCognitionRecord(record),
        )
      ),
    );
    const semanticRoundTrip = portableRecords.every((record, index) =>
      canonicalizeJson(record as unknown as JsonValue) ===
        canonicalizeJson(
          restoredPortableRecords[index] as unknown as JsonValue,
        )
    );
    if (!semanticRoundTrip) {
      throw new Error("Portable Cognition semantic round-trip failed.");
    }

    options.observe?.(Object.freeze({
      type: "exchange",
      cognitiveObjects,
      portableRecords,
      restoredPortableRecords,
    }));

    return Object.freeze({
      sourceRecordCount: records.length,
      sourceSystems: [
        "git-repository",
        "teammem-event-ledger",
      ] as const,
      acceptedRecordCount: ingestion.acceptedRecords.length,
      evidenceId: evidence.id,
      hypothesisId,
      portableRecordCount: portableRecords.length,
      semanticRoundTrip: true,
      decisionsInferred: 0,
      principlesInferred: 0,
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.stdout.write(
    `${JSON.stringify(runCrossConnectorInteroperabilityExample())}\n`,
  );
}
