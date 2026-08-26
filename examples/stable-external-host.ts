import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

import {
  commitCognitionTransition,
  commitInitialCognition,
  createObject,
  createPortableCognitionRecord,
  ingestSourceRecords,
  neutralEvidencePolicyV1,
  promoteSourceRecordsToEvidence,
  serializePortableCognitionRecord,
  transitionObject,
} from "../src/index.ts";
import { InMemoryCognitionEventPublisher } from "../src/reference-host.ts";
import { SqliteCognitionStore } from "../src/stores/sqlite.ts";
import type {
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
} from "../src/host-integration.ts";
import type { CognitiveObject } from "../src/types.ts";

const contextId = "context:fictional-external-host";
const identityId = "identity:fictional-owner";
const createdAt = "2026-08-25T10:00:00.000Z";

function requiredPath(arguments_: readonly string[], option: string): string {
  const optionIndex = arguments_.indexOf(option);
  const value = optionIndex === -1 ? undefined : arguments_[optionIndex + 1];
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new Error(`${option} must be an explicitly supplied absolute path.`);
  }
  return value;
}

function readOptions(arguments_: readonly string[]): {
  readonly sourceRecordsPath: string;
  readonly cognitionDatabasePath: string;
} {
  if (
    arguments_.length !== 4 ||
    !arguments_.includes("--source-records") ||
    !arguments_.includes("--cognition-db")
  ) {
    throw new Error(
      "Usage: stable-external-host --source-records <absolute-jsonl-path> --cognition-db <absolute-sqlite-path>",
    );
  }
  const sourceRecordsPath = requiredPath(arguments_, "--source-records");
  const cognitionDatabasePath = requiredPath(arguments_, "--cognition-db");
  if (sourceRecordsPath === cognitionDatabasePath) {
    throw new Error("Source records and cognition database must use separate paths.");
  }
  return { sourceRecordsPath, cognitionDatabasePath };
}

function readFictionalSourceRecords(sourceRecordsPath: string): unknown[] {
  const lines = readFileSync(sourceRecordsPath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
  if (lines.length !== 2) {
    throw new Error("The fictional external host requires exactly two source records.");
  }
  return lines.map((line) => JSON.parse(line) as unknown);
}

function portableObject(
  object: CognitiveObject,
): PortableCognitiveObjectRecord {
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload: object,
  }) as PortableCognitiveObjectRecord;
}

function portableEvent(event: unknown): PortableCognitionEventRecord {
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognition-event",
    payload: event,
  } as PortableCognitionEventRecord) as PortableCognitionEventRecord;
}

function requireCommitted(
  status: "committed" | "conflict" | "failed" | "committed_but_unpublished",
): void {
  if (status !== "committed") {
    throw new Error("The fictional external host could not commit cognition.");
  }
}

export async function runStableExternalHostExample(
  arguments_: readonly string[],
): Promise<void> {
  const { sourceRecordsPath, cognitionDatabasePath } = readOptions(arguments_);
  const sourceRecords = readFictionalSourceRecords(sourceRecordsPath);
  const ingestion = ingestSourceRecords(sourceRecords, { mode: "fail-fast" });
  if (ingestion.acceptedRecords.length !== 2) {
    throw new Error("The fictional external host did not ingest both source records.");
  }

  const identity = createObject({
    id: identityId,
    type: "identity",
    version: 1,
    state: "active",
    title: "Fictional accountable owner",
    data: { actorKind: "human", displayName: "Fictional Owner" },
    createdAt,
    updatedAt: createdAt,
    attribution: {
      initiatorId: identityId,
      executorId: identityId,
      accountableId: identityId,
    },
    provenance: [{
      source: "fictional-external-host",
      sourceId: "identity:fictional-owner",
      capturedAt: createdAt,
    }],
    contextId,
    relationships: [],
  });
  const goal = createObject({
    id: "goal:fictional-external-host",
    type: "goal",
    version: 1,
    state: "draft",
    title: "Evaluate a fictional external host",
    data: { objective: "Demonstrate source-neutral cognition persistence." },
    createdAt,
    updatedAt: createdAt,
    attribution: {
      initiatorId: identityId,
      executorId: identityId,
      accountableId: identityId,
    },
    provenance: [{
      source: "fictional-external-host",
      sourceId: "goal:fictional-external-host",
      capturedAt: createdAt,
    }],
    contextId,
    relationships: [],
  });
  const hypothesis = createObject({
    id: "hypothesis:fictional-external-host",
    type: "hypothesis",
    version: 1,
    state: "proposed",
    title: "Fictional source records can support durable review",
    data: {
      statement: "Explicit fictional source records can support a durable review.",
    },
    createdAt,
    updatedAt: createdAt,
    attribution: {
      initiatorId: identityId,
      executorId: identityId,
      accountableId: identityId,
    },
    provenance: [{
      source: "fictional-external-host",
      sourceId: "hypothesis:fictional-external-host",
      capturedAt: createdAt,
    }],
    contextId,
    relationships: [{
      type: "supports-goal",
      targetId: goal.id,
    }],
  });
  const evidence = ingestion.acceptedRecords.map((record, index) =>
    promoteSourceRecordsToEvidence({
      records: [record],
      hypothesisId: hypothesis.id,
      contextId,
      rationale: `Fictional source record ${index + 1} is explicitly relevant to review.`,
      promotedAt: `2026-08-25T10:0${index + 1}:00.000Z`,
      attribution: {
        initiatorId: identityId,
        executorId: identityId,
        accountableId: identityId,
      },
    }, neutralEvidencePolicyV1)
  );
  const decision = createObject({
    id: "decision:fictional-external-host",
    type: "decision",
    version: 1,
    state: "draft",
    title: "Use the fictional external-host acceptance result",
    data: { selectedOption: "Use explicit source-neutral host inputs" },
    createdAt,
    updatedAt: createdAt,
    attribution: {
      initiatorId: identityId,
      executorId: identityId,
      accountableId: identityId,
    },
    provenance: [{
      source: "fictional-external-host",
      sourceId: "decision:fictional-external-host",
      capturedAt: createdAt,
    }],
    contextId,
    relationships: [
      { type: "supports-goal", targetId: goal.id },
      { type: "justified-by-evidence", targetId: evidence[0]!.id },
      { type: "considers-option", targetId: "option:explicit-external-host" },
      { type: "accountable-identity", targetId: identity.id },
    ],
  });

  const initialObjects = [identity, goal, hypothesis, ...evidence, decision];
  let persistedEvents = 0;
  const store = new SqliteCognitionStore({
    databasePath: cognitionDatabasePath,
    createIfMissing: true,
  });
  try {
    for (const object of initialObjects) {
      requireCommitted((await commitInitialCognition(store, {
        object: portableObject(object),
      })).status);
    }

    const publisher = new InMemoryCognitionEventPublisher();
    const transitions = [
      transitionObject(goal, "active", {
        eventId: "event:fictional-external-host:goal-active",
        occurredAt: "2026-08-25T10:03:00.000Z",
        initiator: { id: identityId, kind: "human" },
        executor: { id: identityId, kind: "human" },
        accountableParty: { id: identityId, kind: "human" },
        automationMode: "manual",
        consequenceLevel: "routine",
        rationale: "Activate the fictional external-host goal.",
      }),
      transitionObject(hypothesis, "under_review", {
        eventId: "event:fictional-external-host:hypothesis-under-review",
        occurredAt: "2026-08-25T10:04:00.000Z",
        initiator: { id: identityId, kind: "human" },
        executor: { id: identityId, kind: "human" },
        accountableParty: { id: identityId, kind: "human" },
        automationMode: "manual",
        consequenceLevel: "routine",
        rationale: "Review the fictional external-host hypothesis.",
      }),
      transitionObject(decision, "proposed", {
        eventId: "event:fictional-external-host:decision-proposed",
        occurredAt: "2026-08-25T10:05:00.000Z",
        initiator: { id: identityId, kind: "human" },
        executor: { id: identityId, kind: "human" },
        accountableParty: { id: identityId, kind: "human" },
        automationMode: "manual",
        consequenceLevel: "routine",
        rationale: "Propose the fictional external-host decision.",
      }),
    ];
    for (const transition of transitions) {
      requireCommitted((await commitCognitionTransition({ store, publisher }, {
        expectedVersion: transition.object.version - 1,
        object: portableObject(transition.object),
        event: portableEvent(transition.event),
      })).status);
    }
    persistedEvents = transitions.length;
  } finally {
    store.close();
  }

  const reopenedStore = new SqliteCognitionStore({
    databasePath: cognitionDatabasePath,
  });
  try {
    const reloadedObjects = (await Promise.all(
      initialObjects.map((object) => reopenedStore.getLatestObject(object.id)),
    )).filter((object): object is PortableCognitiveObjectRecord => object !== undefined);
    const reloadedEvents = (await Promise.all(
      initialObjects.map((object) => reopenedStore.listObjectEvents(object.id)),
    )).flat();
    if (reloadedObjects.length !== 6 || reloadedEvents.length !== 3) {
      throw new Error("The fictional external host could not reload persisted cognition.");
    }
    const portableRecords = [...reloadedObjects, ...reloadedEvents].map(
      (record) => serializePortableCognitionRecord(record),
    );

    process.stdout.write(`${JSON.stringify({
      sourceRecords: sourceRecords.length,
      ingestedSourceRecords: ingestion.acceptedRecords.length,
      identities: 1,
      goals: 1,
      hypotheses: 1,
      evidence: evidence.length,
      decisions: 1,
      persistedObjects: initialObjects.length,
      reloadedObjects: reloadedObjects.length,
      persistedEvents,
      reloadedEvents: reloadedEvents.length,
      portableRecords: portableRecords.length,
    })}\n`);
  } finally {
    reopenedStore.close();
  }
}

if (process.argv[1] !== undefined) {
  await runStableExternalHostExample(process.argv.slice(2));
}
