import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import {
  runSourceConnectorConformance,
} from "../src/connector-conformance.ts";
import {
  readTeamMemorySourceRecords,
  TEAM_MEMORY_LEDGER_FORMAT,
  TeamMemoryConnectorError,
} from "../src/connectors/team-memory.ts";
import { sourceRevisionKey } from "../src/source-records.ts";

interface EventInput {
  readonly id?: number;
  readonly person: string;
  readonly project: string | null;
  readonly ts: string;
  readonly source: string;
  readonly kind: string;
  readonly summary: string;
  readonly refs: string | null;
  readonly raw: string | null;
  readonly hash: string;
}

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

function event(overrides: Partial<EventInput> = {}): EventInput {
  return {
    person: "alice",
    project: "fictional-cognition",
    ts: "2026-07-29T10:00:00.123456+00:00",
    source: "fictional-git",
    kind: "commit",
    summary: "Added a fictional connector fixture.",
    refs: '{"sha":"abc123","url":"https://example.invalid/commit/abc123"}',
    raw: '{"private":"fictional raw value"}',
    hash: "hash-1",
    ...overrides,
  };
}

function createLedger(
  events: readonly EventInput[],
  schema = eventsSchema,
): { readonly directory: string; readonly path: string } {
  const directory = mkdtempSync(join(tmpdir(), "cc-teammem-connector-"));
  const path = join(directory, "ledger.db");
  const database = new DatabaseSync(path);
  database.exec(schema);
  if (events.length > 0) {
    const insert = database.prepare(
      "INSERT INTO events (id, person, project, ts, source, kind, summary, refs, raw, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const item of events) {
      insert.run(
        item.id ?? null,
        item.person,
        item.project,
        item.ts,
        item.source,
        item.kind,
        item.summary,
        item.refs,
        item.raw,
        item.hash,
      );
    }
  }
  database.close();
  return { directory, path };
}

function removeLedger(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}

function assertConnectorError(
  action: () => unknown,
  code: TeamMemoryConnectorError["code"],
  stage: TeamMemoryConnectorError["stage"],
): TeamMemoryConnectorError {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof TeamMemoryConnectorError);
  assert.equal(thrown.code, code);
  assert.equal(thrown.stage, stage);
  return thrown;
}

test("reads compatible ledgers into immutable source-neutral records", () => {
  const ledger = createLedger([
    event({ id: 2, hash: "hash-2", summary: "Second event." }),
    event({ id: 1, hash: "hash-1", summary: "First event." }),
    event({ id: 3, person: "bob", hash: "hash-3" }),
  ]);

  try {
    const before = statSync(ledger.path, { bigint: true });
    const records = readTeamMemorySourceRecords({
      databasePath: ledger.path,
      sourceInstance: "fictional-engineering-hub",
      person: "alice",
      limit: 2,
    });
    const after = statSync(ledger.path, { bigint: true });

    assert.equal(TEAM_MEMORY_LEDGER_FORMAT, "teammem-event-ledger/1");
    assert.deepEqual(records.map(({ revisionId }) => revisionId), [
      "hash-1",
      "hash-2",
    ]);
    assert.deepEqual(records[0].source, {
      system: "teammem-event-ledger",
      instance: "fictional-engineering-hub",
    });
    assert.equal(
      records[0].id,
      "source-record:teammem-event-ledger:fictional-engineering-hub:alice:fictional-git:hash-1",
    );
    assert.equal(records[0].sourceId, "alice:fictional-git");
    assert.equal(records[0].actorId, "person:alice");
    assert.equal(records[0].capturedAt, "2026-07-29T10:00:00.123456+00:00");
    assert.deepEqual(records[0].content, {
      project: "fictional-cognition",
      kind: "commit",
      summary: "First event.",
      refs: {
        sha: "abc123",
        url: "https://example.invalid/commit/abc123",
      },
    });
    assert.equal(Object.isFrozen(records), true);
    assert.equal(Object.isFrozen(records[0]), true);
    assert.equal(Object.isFrozen(records[0].content), true);
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeNs, before.mtimeNs);
  } finally {
    removeLedger(ledger.directory);
  }
});

test("isolates identical revisions by explicit source instance", () => {
  const ledger = createLedger([event()]);
  try {
    const first = readTeamMemorySourceRecords({
      databasePath: ledger.path,
      sourceInstance: "hub-a",
    })[0];
    const second = readTeamMemorySourceRecords({
      databasePath: ledger.path,
      sourceInstance: "团队-hub-b",
    })[0];

    assert.notEqual(first.id, second.id);
    assert.notEqual(sourceRevisionKey(first), sourceRevisionKey(second));
  } finally {
    removeLedger(ledger.directory);
  }
});

test("omits raw by default and includes it only by explicit opt-in", () => {
  const ledger = createLedger([event()]);
  try {
    const defaultRecord = readTeamMemorySourceRecords({
      databasePath: ledger.path,
      sourceInstance: "public-demo",
    })[0];
    const optedInRecord = readTeamMemorySourceRecords({
      databasePath: ledger.path,
      sourceInstance: "public-demo",
      includeRaw: true,
    })[0];

    assert.equal("raw" in (defaultRecord.content as object), false);
    assert.equal(
      (optedInRecord.content as { readonly raw?: string }).raw,
      '{"private":"fictional raw value"}',
    );
  } finally {
    removeLedger(ledger.directory);
  }
});

test("binds filters and repeats deterministically", () => {
  const ledger = createLedger([
    event(),
    event({ id: 2, person: "bob", hash: "hash-2" }),
  ]);
  try {
    const injection = readTeamMemorySourceRecords({
      databasePath: ledger.path,
      sourceInstance: "public-demo",
      person: "alice' OR 1 = 1 --",
    });
    const options = {
      databasePath: ledger.path,
      sourceInstance: "public-demo",
      from: "2026-07-29T00:00:00.000Z",
      to: "2026-07-30T00:00:00.000Z",
    } as const;
    const first = readTeamMemorySourceRecords(options);
    const second = readTeamMemorySourceRecords(options);

    assert.deepEqual(injection, []);
    assert.deepEqual(second, first);
  } finally {
    removeLedger(ledger.directory);
  }
});

test("passes generic source connector conformance", async () => {
  const ledger = createLedger([event()]);
  try {
    const collect = () => readTeamMemorySourceRecords({
      databasePath: ledger.path,
      sourceInstance: "public-demo",
    });
    const results = await runSourceConnectorConformance([{
      name: "maintained team-memory-compatible connector",
      collect,
      collectAgain: collect,
    }]);

    assert.deepEqual(results, [{
      name: "maintained team-memory-compatible connector",
      status: "passed",
      diagnostics: [],
    }]);
  } finally {
    removeLedger(ledger.directory);
  }
});

test("rejects invalid options before opening a source", () => {
  const missing = join(tmpdir(), "does-not-exist", "ledger.db");
  const invalidOptions: unknown[] = [
    null,
    [],
    { databasePath: missing, sourceInstance: "" },
    { databasePath: missing, sourceInstance: " outer-space " },
    { databasePath: missing, sourceInstance: "control\u0000value" },
    { databasePath: missing, sourceInstance: "a".repeat(129) },
    { databasePath: relative(process.cwd(), missing), sourceInstance: "demo" },
    { databasePath: "~/ledger.db", sourceInstance: "demo" },
    { databasePath: "file:///tmp/ledger.db", sourceInstance: "demo" },
    { databasePath: ":memory:", sourceInstance: "demo" },
    {
      databasePath: missing,
      sourceInstance: "demo",
      from: "2026-07-29T24:00:00Z",
    },
    { databasePath: missing, sourceInstance: "demo", limit: 0 },
    { databasePath: missing, sourceInstance: "demo", includeRaw: "yes" },
    { databasePath: missing, sourceInstance: "demo", unknown: true },
  ];

  for (const options of invalidOptions) {
    assertConnectorError(
      () => readTeamMemorySourceRecords(options as never),
      "invalid_options",
      "options",
    );
  }

  let accessorInvocations = 0;
  const accessorOptions = {
    sourceInstance: "demo",
  } as Record<string, unknown>;
  Object.defineProperty(accessorOptions, "databasePath", {
    enumerable: true,
    get() {
      accessorInvocations += 1;
      return missing;
    },
  });
  assertConnectorError(
    () => readTeamMemorySourceRecords(accessorOptions as never),
    "invalid_options",
    "options",
  );
  assert.equal(accessorInvocations, 0);

  const target = {
    databasePath: missing,
    sourceInstance: "demo",
  };
  const revoked = Proxy.revocable(target, {});
  revoked.revoke();
  assertConnectorError(
    () => readTeamMemorySourceRecords(revoked.proxy),
    "invalid_options",
    "options",
  );

  const inherited = Object.create({
    databasePath: missing,
    sourceInstance: "demo",
  });
  assertConnectorError(
    () => readTeamMemorySourceRecords(inherited),
    "invalid_options",
    "options",
  );
});

test("rejects unavailable targets without exposing paths", () => {
  const path = join(tmpdir(), "private-secret-ledger.db");
  const error = assertConnectorError(
    () => readTeamMemorySourceRecords({
      databasePath: path,
      sourceInstance: "public-demo",
    }),
    "target_unavailable",
    "open",
  );

  assert.doesNotMatch(
    JSON.stringify({
      message: error.message,
      details: error.details,
    }),
    /private-secret-ledger|SQLITE|SELECT/i,
  );
});

test("rejects incompatible schemas with sanitized diagnostics", () => {
  const ledger = createLedger([], `
    CREATE TABLE events (
      id TEXT,
      person TEXT,
      project TEXT,
      ts TEXT,
      source TEXT,
      kind TEXT,
      summary TEXT,
      refs TEXT,
      raw TEXT,
      hash TEXT
    );
  `);
  try {
    const error = assertConnectorError(
      () => readTeamMemorySourceRecords({
        databasePath: ledger.path,
        sourceInstance: "public-demo",
      }),
      "incompatible_ledger",
      "schema",
    );
    assert.doesNotMatch(error.message, new RegExp(ledger.path));
  } finally {
    removeLedger(ledger.directory);
  }
});

test("rejects non-rowid primary keys and partial identity indexes", () => {
  const composite = createLedger([], `
    CREATE TABLE events (
      id INTEGER,
      shard INTEGER,
      person TEXT NOT NULL,
      project TEXT,
      ts TEXT NOT NULL,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      refs TEXT,
      raw TEXT,
      hash TEXT NOT NULL,
      PRIMARY KEY(id, shard),
      UNIQUE(person, source, hash)
    );
  `);
  const partial = createLedger([], `
    CREATE TABLE events (
      id INTEGER PRIMARY KEY,
      person TEXT NOT NULL,
      project TEXT,
      ts TEXT NOT NULL,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      refs TEXT,
      raw TEXT,
      hash TEXT NOT NULL
    );
    CREATE UNIQUE INDEX events_identity_partial
      ON events(person, source, hash)
      WHERE kind = 'commit';
  `);
  const descending = createLedger([], `
    CREATE TABLE events (
      id INTEGER PRIMARY KEY DESC,
      person TEXT NOT NULL,
      project TEXT,
      ts TEXT NOT NULL,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      refs TEXT,
      raw TEXT,
      hash TEXT NOT NULL,
      UNIQUE(person, source, hash)
    );
  `);
  try {
    for (const ledger of [composite, partial, descending]) {
      assertConnectorError(
        () => readTeamMemorySourceRecords({
          databasePath: ledger.path,
          sourceInstance: "public-demo",
        }),
        "incompatible_ledger",
        "schema",
      );
    }
  } finally {
    removeLedger(composite.directory);
    removeLedger(partial.directory);
    removeLedger(descending.directory);
  }
});

test("accepts additional tables and columns", () => {
  const schema = eventsSchema.replace(
    "hash    TEXT NOT NULL,",
    "hash    TEXT NOT NULL,\n    extra_metadata TEXT,",
  ) + "CREATE TABLE connector_metadata (format TEXT);";
  const ledger = createLedger([event()], schema);
  try {
    assert.equal(
      readTeamMemorySourceRecords({
        databasePath: ledger.path,
        sourceInstance: "public-demo",
      }).length,
      1,
    );
  } finally {
    removeLedger(ledger.directory);
  }
});

test("rejects malformed rows and offsetless timestamps", () => {
  const malformedRefs = createLedger([event({ refs: "not-json" })]);
  const offsetless = createLedger([
    event({ ts: "2026-07-29T10:00:00.000" }),
  ]);
  try {
    for (const ledger of [malformedRefs, offsetless]) {
      const error = assertConnectorError(
        () => readTeamMemorySourceRecords({
          databasePath: ledger.path,
          sourceInstance: "public-demo",
        }),
        "invalid_row",
        "mapping",
      );
      assert.doesNotMatch(
        JSON.stringify({
          message: error.message,
          details: error.details,
        }),
        /not-json|fictional raw value|connector fixture/i,
      );
    }
  } finally {
    removeLedger(malformedRefs.directory);
    removeLedger(offsetless.directory);
  }
});
