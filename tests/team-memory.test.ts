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
  readTeamMemoryEvents,
  teamMemoryEventToEvidence,
} from "../src/index.ts";
import type { TeamMemoryEventRow } from "../src/index.ts";

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
    const evidence = teamMemoryEventToEvidence(row, {
      hypothesisId: "hypothesis:adapter-safety",
      contextId: "organization:collective-cognition",
    });

    assert.equal(row.ts, timestamp);
    assert.equal(evidence.createdAt, timestamp);
    assert.equal(evidence.provenance[0].capturedAt, timestamp);
  } finally {
    cleanupLedger(ledger.directory);
  }
});

test("maps a ledger event to neutral evidence with provenance", () => {
  const row: TeamMemoryEventRow = { id: 7, ...event() };

  const evidence = teamMemoryEventToEvidence(row, {
    hypothesisId: "hypothesis:adapter-safety",
    contextId: "organization:collective-cognition",
  });

  assert.equal(
    evidence.id,
    "teammem:alice:gitlab:hash-1:context:organization%3Acollective-cognition:hypothesis:hypothesis%3Aadapter-safety",
  );
  assert.equal(evidence.state, "collected");
  assert.equal(evidence.data.statement, "Added a read-only adapter.");
  assert.equal(evidence.data.evidenceKind, "commit");
  assert.equal(evidence.data.polarity, "neutral");
  assert.equal(evidence.data.sourceActorId, "person:alice");
  assert.equal(evidence.data.project, "collective-cognition");
  assert.equal(evidence.data.upstreamSource, "gitlab");
  assert.deepEqual(evidence.provenance, [
    {
      source: "team-memory-agent",
      sourceId: "alice:gitlab:hash-1",
      capturedAt: "2026-07-24T10:00:00.000Z",
      uri: "https://gitlab.example/commit/1",
      contentHash: "hash-1",
    },
  ]);
  assert.deepEqual(evidence.relationships, [
    { type: "relates-to-hypothesis", targetId: "hypothesis:adapter-safety" },
  ]);
});

test("uses person, source, and hash for collision-safe evidence IDs", () => {
  const context = {
    hypothesisId: "hypothesis:adapter-safety",
    contextId: "organization:collective-cognition",
  };
  const first = teamMemoryEventToEvidence(
    {
      id: 1,
      ...event({
        person: "alice smith",
        source: "bundle:member",
        hash: "hash/with?query",
      }),
    },
    context,
  );
  const second = teamMemoryEventToEvidence(
    {
      id: 2,
      ...event({
        person: "bob smith",
        source: "bundle:member",
        hash: "hash/with?query",
      }),
    },
    context,
  );

  assert.equal(
    first.id,
    "teammem:alice%20smith:bundle%3Amember:hash%2Fwith%3Fquery:context:organization%3Acollective-cognition:hypothesis:hypothesis%3Aadapter-safety",
  );
  assert.equal(
    second.id,
    "teammem:bob%20smith:bundle%3Amember:hash%2Fwith%3Fquery:context:organization%3Acollective-cognition:hypothesis:hypothesis%3Aadapter-safety",
  );
  assert.notEqual(first.id, second.id);
});

test("binds evidence identity to context and hypothesis mappings", () => {
  const row: TeamMemoryEventRow = { id: 7, ...event() };
  const first = teamMemoryEventToEvidence(row, {
    hypothesisId: "hypothesis:first",
    contextId: "organization:first",
  });
  const repeated = teamMemoryEventToEvidence(row, {
    hypothesisId: "hypothesis:first",
    contextId: "organization:first",
  });
  const remappedContext = teamMemoryEventToEvidence(row, {
    hypothesisId: "hypothesis:first",
    contextId: "organization:second",
  });
  const remappedHypothesis = teamMemoryEventToEvidence(row, {
    hypothesisId: "hypothesis:second",
    contextId: "organization:first",
  });

  assert.equal(repeated.id, first.id);
  assert.notEqual(remappedContext.id, first.id);
  assert.notEqual(remappedHypothesis.id, first.id);
});

test("uses the stable upstream key for provenance instead of the SQLite row id", () => {
  const context = {
    hypothesisId: "hypothesis:adapter-safety",
    contextId: "organization:collective-cognition",
  };
  const first = teamMemoryEventToEvidence({ id: 7, ...event() }, context);
  const reinserted = teamMemoryEventToEvidence({ id: 99, ...event() }, context);

  assert.equal(first.id, reinserted.id);
  assert.equal(first.provenance[0].source, "team-memory-agent");
  assert.equal(first.provenance[0].sourceId, "alice:gitlab:hash-1");
  assert.equal(reinserted.provenance[0].sourceId, first.provenance[0].sourceId);
  assert.equal(first.data.upstreamSource, "gitlab");
});

test("rejects malformed ledger refs instead of dropping provenance", () => {
  const row: TeamMemoryEventRow = {
    id: 7,
    ...event({ refs: "not-json" }),
  };

  assert.throws(
    () =>
      teamMemoryEventToEvidence(row, {
        hypothesisId: "hypothesis:adapter-safety",
        contextId: "organization:collective-cognition",
      }),
    /refs/i,
  );
});

test("CLI emits one evidence object per JSONL line", () => {
  const ledger = createLedger([event(), event({ id: 2, person: "bob", hash: "hash-2" })]);

  try {
    const result = spawnSync(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        "src/teammem-cli.ts",
        "--db",
        ledger.path,
        "--hypothesis-id",
        "hypothesis:adapter-safety",
        "--context-id",
        "organization:collective-cognition",
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
      "teammem:alice:gitlab:hash-1:context:organization%3Acollective-cognition:hypothesis:hypothesis%3Aadapter-safety",
    );
  } finally {
    cleanupLedger(ledger.directory);
  }
});

test("CLI writes missing or invalid argument diagnostics only to stderr", () => {
  const ledger = createLedger([event()]);

  try {
    for (const args of [
      ["--db", ledger.path],
      [
        "--db",
        ledger.path,
        "--hypothesis-id",
        "hypothesis:adapter-safety",
        "--context-id",
        "organization:collective-cognition",
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
