import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DomainError,
  DomainErrorCode,
} from "../src/index.ts";
import {
  readTeamMemoryEvents,
  teamMemoryEventToSourceRecord,
} from "../src/adapters/team-memory.ts";
import type { TeamMemoryEventRow } from "../src/adapters/team-memory.ts";

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

type EventInput = Omit<TeamMemoryEventRow, "id"> & { readonly id?: number };

function createLedger(events: readonly EventInput[]): {
  readonly directory: string;
  readonly path: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "collective-cognition-teammem-"));
  const path = join(directory, "ledger.db");
  const database = new DatabaseSync(path);
  database.exec(eventsSchema);
  const insert = database.prepare(
    "INSERT INTO events (id, person, project, ts, source, kind, summary, refs, raw, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );

  for (const event of events) {
    insert.run(
      event.id ?? null,
      event.person,
      event.project,
      event.ts,
      event.source,
      event.kind,
      event.summary,
      event.refs,
      event.raw,
      event.hash,
    );
  }
  database.close();
  return { directory, path };
}

function cleanupLedger(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}

function createIncompatibleLedger(): {
  readonly directory: string;
  readonly path: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "collective-cognition-teammem-"));
  const path = join(directory, "ledger.db");
  const database = new DatabaseSync(path);
  database.exec(`
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
    INSERT INTO events VALUES (
      'not-an-id', 'alice', 'collective-cognition', '2026-07-24T10:00:00.000Z',
      'gitlab', 'commit', 'Incompatible ledger row.', NULL, NULL, 'hash-1'
    );
  `);
  database.close();
  return { directory, path };
}

function event(overrides: Partial<EventInput> = {}): EventInput {
  return {
    person: "alice",
    project: "collective-cognition",
    ts: "2026-07-24T10:00:00.000Z",
    source: "gitlab",
    kind: "commit",
    summary: "Added a read-only adapter.",
    refs: '{"url":"https://gitlab.example/commit/1","sha":"abc123"}',
    raw: '{"id":"abc123"}',
    hash: "hash-1",
    ...overrides,
  };
}

test("reads a read-only filtered ledger in deterministic order", () => {
  const ledger = createLedger([
    event({ id: 2, hash: "hash-2", summary: "Second selected event." }),
    event({ id: 1, hash: "hash-1", summary: "First selected event." }),
    event({ id: 3, person: "bob", hash: "hash-3" }),
    event({ id: 4, project: "other", hash: "hash-4" }),
    event({ id: 5, ts: "2026-07-25T10:00:00.000Z", hash: "hash-5" }),
  ]);

  try {
    const before = statSync(ledger.path);
    chmodSync(ledger.path, 0o444);

    const rows = readTeamMemoryEvents({
      dbPath: ledger.path,
      from: "2026-07-24T00:00:00.000Z",
      to: "2026-07-25T00:00:00.000Z",
      person: "alice",
      project: "collective-cognition",
      limit: 2,
    });

    assert.deepEqual(rows.map((row) => row.hash), ["hash-1", "hash-2"]);
    assert.equal(rows[0].source, "gitlab");
    assert.equal(rows[0].refs, '{"url":"https://gitlab.example/commit/1","sha":"abc123"}');
    assert.deepEqual(statSync(ledger.path).mtimeMs, before.mtimeMs);
  } finally {
    chmodSync(ledger.path, 0o644);
    cleanupLedger(ledger.directory);
  }
});

test("binds filter values instead of treating them as SQL", () => {
  const ledger = createLedger([event(), event({ id: 2, person: "bob", hash: "hash-2" })]);

  try {
    const rows = readTeamMemoryEvents({
      dbPath: ledger.path,
      person: "alice' OR 1 = 1 --",
    });

    assert.deepEqual(rows, []);
  } finally {
    cleanupLedger(ledger.directory);
  }
});

test("rejects invalid limits before opening the source ledger", () => {
  for (const limit of [0, -1, 1.5]) {
    assert.throws(
      () => readTeamMemoryEvents({ dbPath: "/missing/ledger.db", limit }),
      (error: unknown) =>
        error instanceof DomainError && error.code === DomainErrorCode.INVALID_OBJECT,
    );
  }
});

test("rejects incompatible ledger rows before returning them", () => {
  const ledger = createIncompatibleLedger();

  try {
    assert.throws(
      () => readTeamMemoryEvents({ dbPath: ledger.path }),
      (error: unknown) =>
        error instanceof DomainError && error.code === DomainErrorCode.INVALID_OBJECT,
    );
  } finally {
    cleanupLedger(ledger.directory);
  }
});

test("rejects malformed refs.url before returning queried rows", () => {
  const ledger = createLedger([event({ refs: '{"url":42}' })]);

  try {
    assert.throws(
      () => readTeamMemoryEvents({ dbPath: ledger.path }),
      (error: unknown) =>
        error instanceof DomainError && error.code === DomainErrorCode.INVALID_OBJECT,
    );
  } finally {
    cleanupLedger(ledger.directory);
  }
});

test("rejects invalid ISO timestamps before returning queried rows", () => {
  const ledger = createLedger([event({ ts: "2026-02-30T10:00:00.000Z" })]);

  try {
    assert.throws(
      () => readTeamMemoryEvents({ dbPath: ledger.path }),
      (error: unknown) =>
        error instanceof DomainError && error.code === DomainErrorCode.INVALID_OBJECT,
    );
  } finally {
    cleanupLedger(ledger.directory);
  }
});

test("accepts six-digit fractional seconds in queried ledger rows", () => {
  const timestamp = "2026-06-23T10:51:33.326000+00:00";
  const ledger = createLedger([event({ ts: timestamp })]);

  try {
    const [row] = readTeamMemoryEvents({ dbPath: ledger.path });
    const record = teamMemoryEventToSourceRecord(row);

    assert.equal(row.ts, timestamp);
    assert.equal(record.observedAt, timestamp);
    assert.equal(record.capturedAt, timestamp);
  } finally {
    cleanupLedger(ledger.directory);
  }
});

test("maps a ledger event to a source-neutral immutable record", () => {
  const row: TeamMemoryEventRow = { id: 7, ...event() };

  const record = teamMemoryEventToSourceRecord(row);

  assert.equal(
    record.id,
    "source-record:team-memory:alice:gitlab:hash-1",
  );
  assert.deepEqual(record.source, { system: "team-memory-agent" });
  assert.equal(record.sourceId, "alice:gitlab");
  assert.equal(record.revisionId, "hash-1");
  assert.equal(record.observedAt, row.ts);
  assert.equal(record.capturedAt, row.ts);
  assert.equal(record.mediaType, "application/vnd.team-memory.event+json");
  assert.equal(record.actorId, "person:alice");
  assert.deepEqual(record.content, {
    project: "collective-cognition",
    kind: "commit",
    summary: "Added a read-only adapter.",
    refs: {
      url: "https://gitlab.example/commit/1",
      sha: "abc123",
    },
    raw: '{"id":"abc123"}',
  });
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.content), true);
  assert.equal(
    Object.isFrozen((record.content as { refs: object }).refs),
    true,
  );
});

test("uses person, source, and hash for collision-safe record IDs", () => {
  const first = teamMemoryEventToSourceRecord({
    id: 1,
    ...event({
      person: "alice smith",
      source: "bundle:member",
      hash: "hash/with?query",
    }),
  });
  const second = teamMemoryEventToSourceRecord({
    id: 2,
    ...event({
      person: "bob smith",
      source: "bundle:member",
      hash: "hash/with?query",
    }),
  });

  assert.equal(
    first.id,
    "source-record:team-memory:alice%20smith:bundle%3Amember:hash%2Fwith%3Fquery",
  );
  assert.equal(
    second.id,
    "source-record:team-memory:bob%20smith:bundle%3Amember:hash%2Fwith%3Fquery",
  );
  assert.notEqual(first.id, second.id);
});

test("uses the stable upstream key for identity instead of the SQLite row id", () => {
  const first = teamMemoryEventToSourceRecord({ id: 7, ...event() });
  const reinserted = teamMemoryEventToSourceRecord({ id: 99, ...event() });

  assert.equal(first.id, reinserted.id);
  assert.equal(first.sourceId, "alice:gitlab");
  assert.equal(reinserted.sourceId, first.sourceId);
  assert.equal(first.revisionId, "hash-1");
});

test("rejects malformed ledger refs instead of dropping source content", () => {
  const row: TeamMemoryEventRow = {
    id: 7,
    ...event({ refs: "not-json" }),
  };

  assert.throws(() => teamMemoryEventToSourceRecord(row), /refs/i);
});

test("root exports contain no team-memory-specific API", async () => {
  const root = await import("../src/index.ts");

  assert.equal("readTeamMemoryEvents" in root, false);
  assert.equal("teamMemoryEventToSourceRecord" in root, false);
  assert.equal("teamMemoryEventToEvidence" in root, false);
});

test("CLI emits one source record per JSONL line", () => {
  const ledger = createLedger([event(), event({ id: 2, person: "bob", hash: "hash-2" })]);

  try {
    const result = spawnSync(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        "src/teammem-cli.ts",
        "--db",
        ledger.path,
        "--person",
        "alice",
        "--limit",
        "1",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const lines = result.stdout.trim().split("\n");
    assert.equal(lines.length, 1);
    assert.equal(
      JSON.parse(lines[0]).id,
      "source-record:team-memory:alice:gitlab:hash-1",
    );
  } finally {
    cleanupLedger(ledger.directory);
  }
});

test("CLI writes missing or invalid argument diagnostics only to stderr", () => {
  const ledger = createLedger([event()]);

  try {
    for (const args of [
      [],
      [
        "--db",
        ledger.path,
        "--limit",
        "0",
      ],
    ]) {
      const result = spawnSync(
        process.execPath,
        ["--disable-warning=ExperimentalWarning", "src/teammem-cli.ts", ...args],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
      assert.notEqual(result.stderr, "");
    }
  } finally {
    cleanupLedger(ledger.directory);
  }
});
