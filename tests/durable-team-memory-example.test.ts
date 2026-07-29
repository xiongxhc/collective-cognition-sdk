import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const examplePath = fileURLToPath(
  new URL("../examples/durable-team-memory-evidence.ts", import.meta.url),
);
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
const expectedOutput = {
  hypothesis: {
    id: "hypothesis:unified-portal-delivery-readiness",
    latestVersion: 2,
    state: "under_review",
  },
  evidence: {
    state: "collected",
    polarity: "neutral",
    sourceCount: 12,
  },
  events: 1,
  decisionsInferred: 0,
  reopened: true,
};
const expectedUsage = [
  "Usage:",
  "  npm run --silent example:teammem:durable -- \\",
  "    --ledger /absolute/path/to/team-memory-agent/ledger.db \\",
  "    --cognition-db /absolute/path/to/cognition.db \\",
  "    --project <project> \\",
  "    --from <ISO timestamp> \\",
  "    --limit <positive integer> \\",
  "    --create",
  "",
  "Reopen an existing cognition database by omitting --create.",
  "",
].join("\n");

interface Fixture {
  readonly root: string;
  readonly ledgerPath: string;
  readonly cognitionPath: string;
  readonly cognitionDirectory: string;
  readonly runDirectory: string;
  readonly forbiddenHome: string;
}

function createFixture(t: test.TestContext): Fixture {
  const root = mkdtempSync(
    join(tmpdir(), "collective-cognition-durable-example-"),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ledgerDirectory = join(root, "ledger");
  const cognitionDirectory = join(root, "cognition");
  const runDirectory = join(root, "run");
  mkdirSync(ledgerDirectory);
  mkdirSync(cognitionDirectory);
  mkdirSync(runDirectory);

  const ledgerPath = join(ledgerDirectory, "ledger.db");
  const database = new DatabaseSync(ledgerPath);
  try {
    database.exec(eventsSchema);
    const insert = database.prepare(`
      INSERT INTO events (
        id,
        person,
        project,
        ts,
        source,
        kind,
        summary,
        refs,
        raw,
        hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const statuses = [
      "merged",
      "merged",
      "merged",
      "merged",
      "merged",
      "merged",
      "merged",
      "merged",
      "merged",
      "opened",
      "opened",
      "closed",
    ];
    for (const [index, status] of statuses.entries()) {
      const number = index + 1;
      const timestamp = index === 0
        ? "2026-07-28T17:59:40.952+08:00"
        : index === statuses.length - 1
          ? "2026-07-28T20:17:51.910+08:00"
          : `2026-07-28T18:${String(index).padStart(2, "0")}:00.000+08:00`;
      insert.run(
        number,
        index % 2 === 0 ? "alex" : "blair",
        "unified-portal",
        timestamp,
        `gitlab:merge-request:${number}`,
        "mr",
        `[${status}] Activity record ${number}.`,
        JSON.stringify({
          url: `https://gitlab.example/merge_requests/${number}`,
        }),
        null,
        `hash-${number}`,
      );
    }
  } finally {
    database.close();
  }

  return {
    root,
    ledgerPath,
    cognitionPath: join(cognitionDirectory, "cognition.db"),
    cognitionDirectory,
    runDirectory,
    forbiddenHome: join(root, "personal-vault-must-not-be-accessed"),
  };
}

function exampleArguments(
  fixture: Fixture,
  create: boolean,
  paths: {
    readonly ledgerPath?: string;
    readonly cognitionPath?: string;
  } = {},
): string[] {
  return [
    "--ledger",
    paths.ledgerPath ?? fixture.ledgerPath,
    "--cognition-db",
    paths.cognitionPath ?? fixture.cognitionPath,
    "--project",
    "unified-portal",
    "--from",
    "2026-07-28T17:59:00+08:00",
    "--limit",
    "12",
    ...(create ? ["--create"] : []),
  ];
}

function runExample(
  fixture: Fixture,
  args: readonly string[],
  additionalCognitionDirectories: readonly string[] = [],
): SpawnSyncReturns<string> {
  const ledgerDirectory = join(fixture.root, "ledger");
  const ledgerPermissions = new Set([
    ledgerDirectory,
    realpathSync.native(ledgerDirectory),
  ]);
  const cognitionDirectories = new Set(
    [
      fixture.cognitionDirectory,
      ...additionalCognitionDirectories,
    ].flatMap((directory) => [
      directory,
      realpathSync.native(directory),
    ]),
  );
  const cognitionPermissions = [...cognitionDirectories].flatMap((directory) => [
    `--allow-fs-read=${directory}`,
    `--allow-fs-write=${directory}`,
  ]);
  return spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--permission",
      `--allow-fs-read=${repositoryRoot}`,
      ...[...ledgerPermissions].map(
        (directory) => `--allow-fs-read=${directory}`,
      ),
      `--allow-fs-read=${fixture.runDirectory}`,
      ...cognitionPermissions,
      examplePath,
      ...args,
    ],
    {
      cwd: fixture.runDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: fixture.forbiddenHome,
      },
    },
  );
}

function parseSingleJsonOutput(
  result: SpawnSyncReturns<string>,
): unknown {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trimEnd().split("\n");
  assert.equal(lines.length, 1);
  return JSON.parse(lines[0] as string);
}

function filesBelow(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

interface FilesystemEntrySnapshot {
  readonly path: string;
  readonly type: "directory" | "file" | "symlink";
  readonly size: bigint;
  readonly modifiedAtNanoseconds: bigint;
  readonly device: bigint;
  readonly inode: bigint;
  readonly target?: string;
}

function filesystemSnapshot(root: string): FilesystemEntrySnapshot[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .map((entry): FilesystemEntrySnapshot => {
      const path = join(entry.parentPath, entry.name);
      const metadata = lstatSync(path, { bigint: true });
      return {
        path: relative(root, path),
        type: entry.isDirectory()
          ? "directory"
          : entry.isSymbolicLink()
            ? "symlink"
            : "file",
        size: metadata.size,
        modifiedAtNanoseconds: metadata.mtimeNs,
        device: metadata.dev,
        inode: metadata.ino,
        ...(entry.isSymbolicLink()
          ? { target: readlinkSync(path) }
          : {}),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function assertOverlapRejectedWithoutMutation(
  fixture: Fixture,
  ledgerPath: string,
  args: readonly string[],
  additionalCognitionDirectories: readonly string[] = [],
): void {
  const ledgerBefore = statSync(ledgerPath, { bigint: true });
  const filesystemBefore = filesystemSnapshot(fixture.root);

  const result = runExample(
    fixture,
    args,
    additionalCognitionDirectories,
  );

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /source ledger overlaps cognition target/i);
  const ledgerAfter = statSync(ledgerPath, { bigint: true });
  assert.equal(ledgerAfter.size, ledgerBefore.size);
  assert.equal(ledgerAfter.mtimeNs, ledgerBefore.mtimeNs);
  assert.deepEqual(filesystemSnapshot(fixture.root), filesystemBefore);
}

test(
  "persists real ledger evidence, reopens it, and replays idempotently",
  (t) => {
    const fixture = createFixture(t);
    const ledgerBefore = statSync(fixture.ledgerPath, { bigint: true });
    const createArguments = exampleArguments(fixture, true);

    assert.deepEqual(
      parseSingleJsonOutput(runExample(fixture, createArguments)),
      expectedOutput,
    );
    assert.deepEqual(
      parseSingleJsonOutput(runExample(fixture, createArguments)),
      expectedOutput,
    );
    assert.deepEqual(
      parseSingleJsonOutput(
        runExample(fixture, exampleArguments(fixture, false)),
      ),
      expectedOutput,
    );

    const ledgerAfter = statSync(fixture.ledgerPath, { bigint: true });
    assert.equal(ledgerAfter.size, ledgerBefore.size);
    assert.equal(ledgerAfter.mtimeNs, ledgerBefore.mtimeNs);
    assert.equal(existsSync(fixture.cognitionPath), true);
    assert.equal(existsSync(fixture.forbiddenHome), false);
    assert.deepEqual(filesBelow(fixture.root), [
      "cognition/cognition.db",
      "ledger/ledger.db",
    ]);

    const cognition = new DatabaseSync(fixture.cognitionPath, {
      readOnly: true,
    });
    try {
      const objects = cognition.prepare(`
        SELECT object_type, object_version, record_json
        FROM cognition_objects
        ORDER BY object_type, object_version
      `).all() as Array<{
        readonly object_type: string;
        readonly object_version: number;
        readonly record_json: string;
      }>;
      const events = cognition.prepare(`
        SELECT record_json
        FROM cognition_events
        ORDER BY object_version, event_id
      `).all() as Array<{ readonly record_json: string }>;

      assert.deepEqual(
        objects.map((row) => [row.object_type, row.object_version]),
        [
          ["evidence", 1],
          ["hypothesis", 1],
          ["hypothesis", 2],
        ],
      );
      assert.equal(events.length, 1);
      assert.equal(
        objects.some((row) =>
          JSON.parse(row.record_json).payload.type === "decision"
        ),
        false,
      );
      assert.deepEqual(
        events.map((row) => {
          const payload = JSON.parse(row.record_json).payload;
          return [
            payload.objectId,
            payload.objectVersion,
            payload.previousState,
            payload.nextState,
          ];
        }),
        [[
          "hypothesis:unified-portal-delivery-readiness",
          2,
          "proposed",
          "under_review",
        ]],
      );
    } finally {
      cognition.close();
    }
  },
);

test(
  "rejects a ledger at the explicit cognition journal path before creation",
  (t) => {
    const fixture = createFixture(t);
    const journalPath = `${fixture.cognitionPath}-journal`;
    renameSync(fixture.ledgerPath, journalPath);

    assertOverlapRejectedWithoutMutation(
      fixture,
      journalPath,
      exampleArguments(fixture, true, { ledgerPath: journalPath }),
    );
  },
);

test(
  "rejects cognition at every explicit source-ledger sidecar without mutation",
  (t) => {
    for (const suffix of ["-journal", "-wal", "-shm"]) {
      const fixture = createFixture(t);
      const cognitionPath = `${fixture.ledgerPath}${suffix}`;

      assertOverlapRejectedWithoutMutation(
        fixture,
        fixture.ledgerPath,
        exampleArguments(fixture, true, { cognitionPath }),
        [join(fixture.root, "ledger")],
      );
    }
  },
);

test(
  "rejects cognition at a canonical-parent source sidecar alias without mutation",
  (t) => {
    const fixture = createFixture(t);
    const ledgerAliasDirectory = join(fixture.root, "ledger-alias");
    symlinkSync(join(fixture.root, "ledger"), ledgerAliasDirectory, "dir");
    const cognitionPath = join(
      ledgerAliasDirectory,
      "ledger.db-journal",
    );

    assertOverlapRejectedWithoutMutation(
      fixture,
      fixture.ledgerPath,
      exampleArguments(fixture, true, { cognitionPath }),
      [ledgerAliasDirectory],
    );
  },
);

test(
  "rejects a symlink alias of an existing source sidecar without mutation",
  (t) => {
    const fixture = createFixture(t);
    const sourceSidecarPath = `${fixture.ledgerPath}-wal`;
    writeFileSync(sourceSidecarPath, "reserved source sidecar");
    const cognitionPath = join(
      fixture.cognitionDirectory,
      "source-sidecar-symlink.db",
    );
    symlinkSync(sourceSidecarPath, cognitionPath);

    assertOverlapRejectedWithoutMutation(
      fixture,
      fixture.ledgerPath,
      exampleArguments(fixture, false, { cognitionPath }),
      [join(fixture.root, "ledger")],
    );
  },
);

test(
  "rejects a hardlink alias of an existing source sidecar without mutation",
  (t) => {
    const fixture = createFixture(t);
    const sourceSidecarPath = `${fixture.ledgerPath}-shm`;
    writeFileSync(sourceSidecarPath, "reserved source sidecar");
    const cognitionPath = join(
      fixture.cognitionDirectory,
      "source-sidecar-hardlink.db",
    );
    linkSync(sourceSidecarPath, cognitionPath);

    assertOverlapRejectedWithoutMutation(
      fixture,
      fixture.ledgerPath,
      exampleArguments(fixture, false, { cognitionPath }),
    );
  },
);

test(
  "rejects a ledger at a canonical-parent sidecar before creation",
  (t) => {
    const fixture = createFixture(t);
    const journalPath = `${fixture.cognitionPath}-journal`;
    renameSync(fixture.ledgerPath, journalPath);
    const aliasDirectory = join(fixture.root, "cognition-alias");
    symlinkSync(fixture.cognitionDirectory, aliasDirectory, "dir");
    const aliasCognitionPath = join(aliasDirectory, "cognition.db");

    assertOverlapRejectedWithoutMutation(
      fixture,
      journalPath,
      exampleArguments(fixture, true, {
        ledgerPath: journalPath,
        cognitionPath: aliasCognitionPath,
      }),
      [aliasDirectory],
    );
  },
);

test(
  "rejects a hardlink alias at a canonical cognition-main sidecar",
  (t) => {
    const fixture = createFixture(t);
    assert.deepEqual(
      parseSingleJsonOutput(
        runExample(fixture, exampleArguments(fixture, true)),
      ),
      expectedOutput,
    );
    const aliasDirectory = join(fixture.root, "cognition-main-alias");
    mkdirSync(aliasDirectory);
    const aliasCognitionPath = join(aliasDirectory, "cognition.db");
    symlinkSync(fixture.cognitionPath, aliasCognitionPath);
    const canonicalWalPath = `${fixture.cognitionPath}-wal`;
    linkSync(fixture.ledgerPath, canonicalWalPath);

    assertOverlapRejectedWithoutMutation(
      fixture,
      fixture.ledgerPath,
      exampleArguments(fixture, false, {
        cognitionPath: aliasCognitionPath,
      }),
      [aliasDirectory],
    );
  },
);

test(
  "rejects a symlink alias at an explicit cognition sidecar",
  (t) => {
    const fixture = createFixture(t);
    const sharedMemoryPath = `${fixture.cognitionPath}-shm`;
    symlinkSync(fixture.ledgerPath, sharedMemoryPath);

    assertOverlapRejectedWithoutMutation(
      fixture,
      fixture.ledgerPath,
      exampleArguments(fixture, true),
    );
  },
);

test("prints the complete closed durable usage without touching data", (t) => {
  const fixture = createFixture(t);

  const result = runExample(fixture, ["--help"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, expectedUsage);
  assert.equal(existsSync(fixture.cognitionPath), false);
  assert.deepEqual(filesBelow(fixture.root), ["ledger/ledger.db"]);
});

test("rejects arguments outside the exact closed interface", (t) => {
  const fixture = createFixture(t);
  const valid = exampleArguments(fixture, true);
  const invalidArguments = [
    [...valid, "--unknown", "value"],
    [...valid, "--ledger", fixture.ledgerPath],
    valid.slice(0, -1).concat("--limit"),
    valid.map((value) =>
      value === fixture.ledgerPath ? "relative-ledger.db" : value
    ),
    valid.map((value) =>
      value === fixture.cognitionPath ? "relative-cognition.db" : value
    ),
    valid.map((value) =>
      value === "2026-07-28T17:59:00+08:00" ? "not-a-timestamp" : value
    ),
    valid.map((value) => value === "12" ? "0" : value),
  ];

  for (const args of invalidArguments) {
    const result = runExample(fixture, args);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.equal(result.stdout, "");
  }
  assert.equal(existsSync(fixture.cognitionPath), false);
  assert.deepEqual(filesBelow(fixture.root), ["ledger/ledger.db"]);
});
