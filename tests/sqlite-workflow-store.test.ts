import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { StatementSync } from "node:sqlite";
import test, { after } from "node:test";

import {
  createObject,
  createPortableCognitionRecord,
  createSourceRecord,
  serializePortableCognitionRecord,
} from "../src/index.ts";
import { SqliteCognitionWorkflowStore } from "../src/stores/sqlite-workflow.ts";
import {
  prepareDurableCognitionWorkflow,
} from "../src/workflows/durable.ts";
import type {
  EvidencePromotionPolicy,
  TransitionContext,
} from "../src/index.ts";
import type {
  DurableCognitionWorkflowRequest,
  DurableCognitionCommitResult,
  PreparedDurableCognitionCommit,
} from "../src/workflows/durable.ts";
import type { StatementResultingChanges } from "node:sqlite";

function defensiveModeIsEnforced(): boolean {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(":memory:", {
      allowExtension: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
    });
    database.enableDefensive(true);
    database.exec("PRAGMA writable_schema = ON");
    const result = database
      .prepare("PRAGMA writable_schema")
      .get() as { readonly writable_schema?: unknown };
    return result.writable_schema === 0;
  } catch {
    return false;
  } finally {
    if (database?.isOpen) database.close();
  }
}

const supportsDefensiveMode =
  typeof DatabaseSync.prototype.enableDefensive === "function" &&
  defensiveModeIsEnforced();
const sqliteTest = supportsDefensiveMode ? test : test.skip;
const temporaryDirectories = new Set<string>();

after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryWorkflowDatabase(): string {
  const directory = mkdtempSync(
    join(tmpdir(), "collective-cognition-workflow-store-"),
  );
  temporaryDirectories.add(directory);
  return join(directory, "cognition.db");
}

function policy(): EvidencePromotionPolicy {
  return {
    id: "sqlite-workflow-test",
    version: "1",
    map() {
      return {
        title: "Delivery review evidence",
        statement: "Delivery review evidence.",
        evidenceKind: "activity",
        polarity: "neutral",
      };
    },
  };
}

function reviewTransition(): TransitionContext {
  return {
    eventId: "event:sqlite-workflow:1",
    occurredAt: "2026-08-13T10:00:00.000Z",
    initiator: { id: "human:reviewer", kind: "human" },
    executor: { id: "human:reviewer", kind: "human" },
    accountableParty: { id: "human:owner", kind: "human" },
    automationMode: "manual",
    consequenceLevel: "routine",
    rationale: "The delivery is ready for review.",
  };
}

function preparedWorkflow(
  overrides: Partial<DurableCognitionWorkflowRequest> = {},
): PreparedDurableCognitionCommit {
  const hypothesis = createObject({
    id: "hypothesis:sqlite-workflow",
    type: "hypothesis",
    version: 1,
    state: "proposed",
    title: "SQLite workflow hypothesis",
    data: { statement: "The durable workflow is atomic." },
    createdAt: "2026-08-13T08:00:00.000Z",
    updatedAt: "2026-08-13T08:00:00.000Z",
    attribution: {
      initiatorId: "human:author",
      executorId: "human:author",
      accountableId: "human:owner",
    },
    provenance: [{
      source: "sqlite-workflow-test",
      sourceId: "sqlite-workflow:hypothesis",
      capturedAt: "2026-08-13T08:00:00.000Z",
    }],
    contextId: "context:sqlite-workflow",
    relationships: [{ type: "supports-goal", targetId: "goal:delivery" }],
  });
  return prepareDurableCognitionWorkflow({
    workflowVersion: "0.1.0",
    workflowId: "workflow:sqlite-workflow:1",
    records: [createSourceRecord({
      id: "source-record:sqlite-workflow:1",
      source: { system: "sqlite-workflow-test" },
      sourceId: "sqlite-workflow:1",
      revisionId: "1",
      capturedAt: "2026-08-13T09:00:00.000Z",
      mediaType: "application/json",
      content: { summary: "Delivery review evidence." },
    })],
    hypothesis,
    promotion: {
      hypothesisId: hypothesis.id,
      contextId: hypothesis.contextId,
      rationale: "The evidence is relevant to this hypothesis.",
      promotedAt: "2026-08-13T09:00:00.000Z",
      attribution: {
        initiatorId: "human:reviewer",
        executorId: "human:reviewer",
        accountableId: "human:owner",
      },
    },
    reviewTransition: reviewTransition(),
    policy: policy(),
    ...overrides,
  });
}

function workflowRowCounts(databasePath: string): {
  readonly objects: number;
  readonly events: number;
  readonly receipts: number;
} {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      objects: (database.prepare("SELECT COUNT(*) AS count FROM cognition_objects").get() as {
        readonly count: number;
      }).count,
      events: (database.prepare("SELECT COUNT(*) AS count FROM cognition_events").get() as {
        readonly count: number;
      }).count,
      receipts: (database.prepare("SELECT COUNT(*) AS count FROM cognition_workflows").get() as {
        readonly count: number;
      }).count,
    };
  } finally {
    database.close();
  }
}

function workflowRows(databasePath: string): {
  readonly objects: readonly Record<string, unknown>[];
  readonly events: readonly Record<string, unknown>[];
  readonly receipts: readonly Record<string, unknown>[];
} {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      objects: database.prepare(`
        SELECT object_id, object_version, object_type, record_json
        FROM cognition_objects
        ORDER BY object_id, object_version
      `).all(),
      events: database.prepare(`
        SELECT event_id, object_id, object_version, record_json
        FROM cognition_events
        ORDER BY event_id
      `).all(),
      receipts: database.prepare(`
        SELECT
          workflow_id,
          request_digest,
          initial_hypothesis_id,
          evidence_id,
          reviewed_hypothesis_version,
          event_id
        FROM cognition_workflows
        ORDER BY workflow_id
      `).all(),
    };
  } finally {
    database.close();
  }
}

function updateDatabase(
  databasePath: string,
  sql: string,
  ...parameters: Array<string | number>
): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.prepare(sql).run(...parameters);
  } finally {
    database.close();
  }
}

function installFailureAfterInsert(insertBoundary: number): () => void {
  const statementPrototype = StatementSync.prototype as unknown as {
    readonly sourceSQL: string;
    run: (...parameters: unknown[]) => StatementResultingChanges;
  };
  const originalRun = statementPrototype.run;
  let insertCount = 0;
  let active = true;
  const restore = () => {
    if (active) {
      active = false;
      statementPrototype.run = originalRun;
    }
  };
  statementPrototype.run = function (
    ...parameters: unknown[]
  ): StatementResultingChanges {
    const result = Reflect.apply(originalRun, this, parameters);
    if (
      /^\s*INSERT INTO cognition_(?:objects|events|workflows)/i.test(this.sourceSQL) &&
      ++insertCount === insertBoundary
    ) {
      restore();
      throw new Error(`Forced failure after insert ${insertBoundary}.`);
    }
    return result;
  };
  return restore;
}

async function assertCompleteWorkflow(
  store: SqliteCognitionWorkflowStore,
  prepared: PreparedDurableCognitionCommit,
): Promise<void> {
  assert.deepEqual(
    await store.getObjectVersion(prepared.initialHypothesis.payload.id, 1),
    prepared.initialHypothesis,
  );
  assert.deepEqual(
    await store.getObjectVersion(prepared.evidence.payload.id, 1),
    prepared.evidence,
  );
  assert.deepEqual(
    await store.getObjectVersion(prepared.reviewedHypothesis.payload.id, 2),
    prepared.reviewedHypothesis,
  );
  assert.deepEqual(
    await store.listObjectEvents(prepared.reviewedHypothesis.payload.id),
    [prepared.event],
  );
}

sqliteTest("commits and reopens one complete durable workflow", async () => {
  const databasePath = temporaryWorkflowDatabase();
  const prepared = preparedWorkflow();
  const store = new SqliteCognitionWorkflowStore({
    databasePath,
    createIfMissing: true,
  });

  assert.deepEqual(await store.commitWorkflow(prepared), { status: "committed" });
  store.close();
  store.close();

  const reopened = new SqliteCognitionWorkflowStore({ databasePath });
  assert.deepEqual(
    await reopened.getObjectVersion(prepared.initialHypothesis.payload.id, 1),
    prepared.initialHypothesis,
  );
  assert.deepEqual(
    await reopened.getLatestObject(prepared.reviewedHypothesis.payload.id),
    prepared.reviewedHypothesis,
  );
  assert.deepEqual(
    await reopened.getLatestObject(prepared.evidence.payload.id),
    prepared.evidence,
  );
  assert.deepEqual(
    await reopened.listObjectEvents(prepared.reviewedHypothesis.payload.id),
    [prepared.event],
  );
  assert.deepEqual(
    await reopened.commitWorkflow(prepared),
    { status: "already_committed" },
  );
  reopened.close();
});

for (let insertBoundary = 1; insertBoundary <= 5; insertBoundary += 1) {
  sqliteTest(
    `rolls back every workflow row after insert boundary ${insertBoundary}`,
    async () => {
      const databasePath = temporaryWorkflowDatabase();
      const prepared = preparedWorkflow();
      const store = new SqliteCognitionWorkflowStore({
        databasePath,
        createIfMissing: true,
      });
      const restore = installFailureAfterInsert(insertBoundary);
      try {
        await assert.rejects(
          () => store.commitWorkflow(prepared),
          new RegExp(`Forced failure after insert ${insertBoundary}`),
        );
      } finally {
        restore();
      }

      assert.deepEqual(workflowRowCounts(databasePath), {
        objects: 0,
        events: 0,
        receipts: 0,
      });
      assert.deepEqual(await store.commitWorkflow(prepared), { status: "committed" });
      assert.deepEqual(await store.commitWorkflow(prepared), {
        status: "already_committed",
      });
      store.close();
    },
  );
}

sqliteTest("serializes concurrent identical workflow writers", async () => {
  const databasePath = temporaryWorkflowDatabase();
  const prepared = preparedWorkflow();
  const first = new SqliteCognitionWorkflowStore({
    databasePath,
    createIfMissing: true,
  });
  const second = new SqliteCognitionWorkflowStore({ databasePath });
  try {
    const results = await Promise.all([
      first.commitWorkflow(prepared),
      second.commitWorkflow(prepared),
    ]);
    assert.deepEqual(
      new Set(results.map((result) => result.status)),
      new Set(["committed", "already_committed"]),
    );
    assert.deepEqual(workflowRowCounts(databasePath), {
      objects: 3,
      events: 1,
      receipts: 1,
    });
    await assertCompleteWorkflow(first, prepared);
  } finally {
    first.close();
    second.close();
  }
});

sqliteTest("keeps one complete winner for conflicting concurrent workflow writers", async () => {
  const databasePath = temporaryWorkflowDatabase();
  const firstPrepared = preparedWorkflow();
  const secondPrepared = preparedWorkflow({
    records: [createSourceRecord({
      id: "source-record:sqlite-workflow:2",
      source: { system: "sqlite-workflow-test" },
      sourceId: "sqlite-workflow:2",
      revisionId: "1",
      capturedAt: "2026-08-13T09:00:00.000Z",
      mediaType: "application/json",
      content: { summary: "Conflicting delivery review evidence." },
    })],
  });
  const first = new SqliteCognitionWorkflowStore({
    databasePath,
    createIfMissing: true,
  });
  const second = new SqliteCognitionWorkflowStore({ databasePath });
  try {
    const attempts = [firstPrepared, secondPrepared] as const;
    const results = await Promise.all([
      first.commitWorkflow(firstPrepared),
      second.commitWorkflow(secondPrepared),
    ]);
    const winnerIndex = results.findIndex((result) => result.status === "committed");
    const loserIndex = 1 - winnerIndex;
    assert.notEqual(winnerIndex, -1);
    assert.deepEqual(
      results[loserIndex],
      {
        status: "conflict",
        conflict: {
          code: "workflow_id_collision",
          workflowId: firstPrepared.workflowId,
        },
      } satisfies DurableCognitionCommitResult,
    );
    assert.deepEqual(workflowRowCounts(databasePath), {
      objects: 3,
      events: 1,
      receipts: 1,
    });
    await assertCompleteWorkflow(first, attempts[winnerIndex]);
    const losingEvidence = attempts[loserIndex].evidence;
    if (losingEvidence.payload.id !== attempts[winnerIndex].evidence.payload.id) {
      assert.equal(
        await first.getObjectVersion(losingEvidence.payload.id, 1),
        undefined,
      );
    }
  } finally {
    first.close();
    second.close();
  }
});

sqliteTest("validates a prepared workflow before beginning a transaction", async () => {
  const databasePath = temporaryWorkflowDatabase();
  const store = new SqliteCognitionWorkflowStore({
    databasePath,
    createIfMissing: true,
  });
  const originalExec = DatabaseSync.prototype.exec;
  let immediateTransactions = 0;
  DatabaseSync.prototype.exec = function (sql) {
    if (sql.trim() === "BEGIN IMMEDIATE") immediateTransactions += 1;
    return originalExec.call(this, sql);
  };
  try {
    await assert.rejects(
      () => store.commitWorkflow({
        ...preparedWorkflow(),
        requestDigest: "not-a-digest",
      }),
      /workflow commit is invalid/i,
    );
  } finally {
    DatabaseSync.prototype.exec = originalExec;
    store.close();
  }
  assert.equal(immediateTransactions, 0);
  assert.deepEqual(workflowRowCounts(databasePath), {
    objects: 0,
    events: 0,
    receipts: 0,
  });
});

sqliteTest("rejects forged cross-record workflow correlations before a transaction", async () => {
  const prepared = preparedWorkflow();
  const forgedReviewed = {
    ...prepared,
    reviewedHypothesis: createPortableCognitionRecord({
      ...structuredClone(prepared.reviewedHypothesis),
      payload: {
        ...structuredClone(prepared.reviewedHypothesis.payload),
        title: "A different hypothesis revision",
      },
    }),
  } as PreparedDurableCognitionCommit;
  const forgedEvidence = {
    ...prepared,
    evidence: createPortableCognitionRecord({
      ...structuredClone(prepared.evidence),
      payload: {
        ...structuredClone(prepared.evidence.payload),
        relationships: [{
          type: "relates-to-hypothesis",
          targetId: "hypothesis:another",
        }],
      },
    }),
  } as PreparedDurableCognitionCommit;

  for (const forged of [forgedReviewed, forgedEvidence]) {
    const databasePath = temporaryWorkflowDatabase();
    const store = new SqliteCognitionWorkflowStore({
      databasePath,
      createIfMissing: true,
    });
    const originalExec = DatabaseSync.prototype.exec;
    let immediateTransactions = 0;
    DatabaseSync.prototype.exec = function (sql) {
      if (sql.trim() === "BEGIN IMMEDIATE") immediateTransactions += 1;
      return originalExec.call(this, sql);
    };
    try {
      await assert.rejects(
        () => store.commitWorkflow(forged),
        /workflow commit is invalid/i,
      );
    } finally {
      DatabaseSync.prototype.exec = originalExec;
      store.close();
    }
    assert.equal(immediateTransactions, 0);
    assert.deepEqual(workflowRowCounts(databasePath), {
      objects: 0,
      events: 0,
      receipts: 0,
    });
  }
});

sqliteTest("rejects duplicate or incoherent prepared storage keys before transaction access", async () => {
  const prepared = preparedWorkflow();
  const duplicateKeyCases: readonly PreparedDurableCognitionCommit[] = [
    {
      ...prepared,
      evidence: createPortableCognitionRecord({
        ...structuredClone(prepared.evidence),
        payload: {
          ...structuredClone(prepared.evidence.payload),
          id: prepared.initialHypothesis.payload.id,
        },
      }),
    } as PreparedDurableCognitionCommit,
    {
      ...prepared,
      evidence: createPortableCognitionRecord({
        ...structuredClone(prepared.evidence),
        payload: {
          ...structuredClone(prepared.evidence.payload),
          id: prepared.reviewedHypothesis.payload.id,
          version: prepared.reviewedHypothesis.payload.version,
        },
      }),
    } as PreparedDurableCognitionCommit,
    {
      ...prepared,
      reviewedHypothesis: createPortableCognitionRecord({
        ...structuredClone(prepared.reviewedHypothesis),
        payload: {
          ...structuredClone(prepared.reviewedHypothesis.payload),
          version: prepared.initialHypothesis.payload.version,
        },
      }),
    } as PreparedDurableCognitionCommit,
    {
      ...prepared,
      event: createPortableCognitionRecord({
        ...structuredClone(prepared.event),
        payload: {
          ...structuredClone(prepared.event.payload),
          objectId: "hypothesis:sqlite-workflow:other",
        },
      }),
    } as PreparedDurableCognitionCommit,
    {
      ...prepared,
      event: createPortableCognitionRecord({
        ...structuredClone(prepared.event),
        payload: {
          ...structuredClone(prepared.event.payload),
          objectVersion: prepared.reviewedHypothesis.payload.version + 1,
        },
      }),
    } as PreparedDurableCognitionCommit,
  ];

  for (const duplicateKey of duplicateKeyCases) {
    const databasePath = temporaryWorkflowDatabase();
    const store = new SqliteCognitionWorkflowStore({
      databasePath,
      createIfMissing: true,
    });
    const originalExec = DatabaseSync.prototype.exec;
    let immediateTransactions = 0;
    DatabaseSync.prototype.exec = function (sql) {
      if (sql.trim() === "BEGIN IMMEDIATE") immediateTransactions += 1;
      return originalExec.call(this, sql);
    };
    try {
      await assert.rejects(
        () => store.commitWorkflow(duplicateKey),
        {
          name: "TypeError",
          message: "Durable workflow commit is invalid.",
        },
      );
    } finally {
      DatabaseSync.prototype.exec = originalExec;
      store.close();
    }
    assert.equal(immediateTransactions, 0);
    assert.deepEqual(workflowRowCounts(databasePath), {
      objects: 0,
      events: 0,
      receipts: 0,
    });
  }
});

sqliteTest("compares stored Portable Cognition records canonically", async () => {
  const databasePath = temporaryWorkflowDatabase();
  const prepared = preparedWorkflow();
  const store = new SqliteCognitionWorkflowStore({
    databasePath,
    createIfMissing: true,
  });
  assert.deepEqual(await store.commitWorkflow(prepared), { status: "committed" });
  store.close();
  const reordered = JSON.stringify({
    recordType: prepared.initialHypothesis.recordType,
    payload: prepared.initialHypothesis.payload,
    schemaVersion: prepared.initialHypothesis.schemaVersion,
  });
  assert.notEqual(
    reordered,
    serializePortableCognitionRecord(prepared.initialHypothesis),
  );
  updateDatabase(
    databasePath,
    `
      UPDATE cognition_objects
      SET record_json = ?
      WHERE object_id = ? AND object_version = 1
    `,
    reordered,
    prepared.initialHypothesis.payload.id,
  );

  const reopened = new SqliteCognitionWorkflowStore({ databasePath });
  try {
    assert.deepEqual(await reopened.commitWorkflow(prepared), {
      status: "already_committed",
    });
  } finally {
    reopened.close();
  }
});

sqliteTest("rejects a stored object whose row identity differs from its payload", async () => {
  const databasePath = temporaryWorkflowDatabase();
  const prepared = preparedWorkflow();
  const store = new SqliteCognitionWorkflowStore({
    databasePath,
    createIfMissing: true,
  });
  assert.deepEqual(await store.commitWorkflow(prepared), { status: "committed" });
  store.close();
  updateDatabase(
    databasePath,
    `
      UPDATE cognition_objects
      SET record_json = ?
      WHERE object_id = ? AND object_version = 1
    `,
    serializePortableCognitionRecord(prepared.reviewedHypothesis),
    prepared.initialHypothesis.payload.id,
  );
  const before = workflowRowCounts(databasePath);

  const reopened = new SqliteCognitionWorkflowStore({ databasePath });
  try {
    await assert.rejects(
      () => reopened.commitWorkflow(prepared),
      /Stored durable workflow is invalid/,
    );
  } finally {
    reopened.close();
  }
  assert.deepEqual(workflowRowCounts(databasePath), before);
});

sqliteTest("rejects a stored receipt whose identities differ from its records", async () => {
  const databasePath = temporaryWorkflowDatabase();
  const prepared = preparedWorkflow();
  const store = new SqliteCognitionWorkflowStore({
    databasePath,
    createIfMissing: true,
  });
  assert.deepEqual(await store.commitWorkflow(prepared), { status: "committed" });
  store.close();
  updateDatabase(
    databasePath,
    `
      UPDATE cognition_workflows
      SET evidence_id = ?
      WHERE workflow_id = ?
    `,
    "evidence:another",
    prepared.workflowId,
  );
  const before = workflowRowCounts(databasePath);

  const reopened = new SqliteCognitionWorkflowStore({ databasePath });
  try {
    await assert.rejects(
      () => reopened.commitWorkflow(prepared),
      /Stored durable workflow is invalid/,
    );
  } finally {
    reopened.close();
  }
  assert.deepEqual(workflowRowCounts(databasePath), before);
});

sqliteTest("validates a complete stored receipt before digest classification", async () => {
  const alternateDigest = "f".repeat(64);
  const corruptionCases = [
    {
      name: "dangling evidence reference",
      corrupt(databasePath: string, prepared: PreparedDurableCognitionCommit) {
        updateDatabase(
          databasePath,
          `
            UPDATE cognition_workflows
            SET request_digest = ?, evidence_id = ?
            WHERE workflow_id = ?
          `,
          alternateDigest,
          "evidence:missing",
          prepared.workflowId,
        );
      },
    },
    {
      name: "wrong object references",
      corrupt(databasePath: string, prepared: PreparedDurableCognitionCommit) {
        updateDatabase(
          databasePath,
          `
            UPDATE cognition_workflows
            SET
              request_digest = ?,
              initial_hypothesis_id = ?,
              evidence_id = ?
            WHERE workflow_id = ?
          `,
          alternateDigest,
          prepared.evidence.payload.id,
          prepared.initialHypothesis.payload.id,
          prepared.workflowId,
        );
      },
    },
    {
      name: "missing event",
      corrupt(databasePath: string, prepared: PreparedDurableCognitionCommit) {
        updateDatabase(
          databasePath,
          `
            UPDATE cognition_workflows
            SET request_digest = ?
            WHERE workflow_id = ?
          `,
          alternateDigest,
          prepared.workflowId,
        );
        updateDatabase(
          databasePath,
          "DELETE FROM cognition_events WHERE event_id = ?",
          prepared.event.payload.id,
        );
      },
    },
    {
      name: "mismatched stored canonical record",
      corrupt(databasePath: string, prepared: PreparedDurableCognitionCommit) {
        const changedReviewed = createPortableCognitionRecord({
          ...structuredClone(prepared.reviewedHypothesis),
          payload: {
            ...structuredClone(prepared.reviewedHypothesis.payload),
            title: "Corrupted reviewed hypothesis",
          },
        });
        updateDatabase(
          databasePath,
          `
            UPDATE cognition_workflows
            SET request_digest = ?
            WHERE workflow_id = ?
          `,
          alternateDigest,
          prepared.workflowId,
        );
        updateDatabase(
          databasePath,
          `
            UPDATE cognition_objects
            SET record_json = ?
            WHERE object_id = ? AND object_version = ?
          `,
          serializePortableCognitionRecord(changedReviewed),
          prepared.reviewedHypothesis.payload.id,
          prepared.reviewedHypothesis.payload.version,
        );
      },
    },
  ] as const;

  for (const corruptionCase of corruptionCases) {
    const databasePath = temporaryWorkflowDatabase();
    const prepared = preparedWorkflow();
    const store = new SqliteCognitionWorkflowStore({
      databasePath,
      createIfMissing: true,
    });
    assert.deepEqual(await store.commitWorkflow(prepared), {
      status: "committed",
    });
    store.close();
    corruptionCase.corrupt(databasePath, prepared);
    const before = workflowRows(databasePath);

    const reopened = new SqliteCognitionWorkflowStore({ databasePath });
    try {
      await assert.rejects(
        () => reopened.commitWorkflow(prepared),
        {
          name: "TypeError",
          message: "Stored durable workflow is invalid.",
        },
        corruptionCase.name,
      );
    } finally {
      reopened.close();
    }
    assert.deepEqual(
      workflowRows(databasePath),
      before,
      corruptionCase.name,
    );
  }
});
