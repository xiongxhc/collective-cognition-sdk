# SQLite Cognition Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the real team-memory Evidence preview and add a durable, explicit-path SQLite `CognitionStore` that survives restart without coupling source storage to cognition storage.

**Architecture:** Keep the root SDK and `neutral-evidence-v1` unchanged. Add an internal deterministic team-memory activity policy, then package a Node-specific SQLite store only through `collective-cognition-sdk/stores/sqlite/0.1.0`. The store validates through existing Host Integration preparation functions, persists canonical Portable Cognition records under `BEGIN IMMEDIATE`, and proves durability through conformance, restart, and real-ledger acceptance tests.

**Tech Stack:** TypeScript 7, Node.js 24 `node:sqlite`, Node test runner, Portable Cognition `0.1.0`, Host Integration `0.1.0`, npm package subpath exports.

## Global Constraints

- Keep `neutral-evidence-v1` behavior and identity unchanged.
- Keep the root export storage-neutral and team-memory-neutral.
- Require an explicit absolute cognition database path; reject `:memory:`, URLs, relative paths, and implicit discovery.
- Default `createIfMissing` to `false`.
- Reject unmarked, unrelated, team-memory-shaped, and unknown-version databases without mutation.
- Never persist SourceRecords or mutate `team-memory-agent/ledger.db`.
- Use no new production dependency.
- Keep `"private": true`; this is a durable reference adapter, not production certification.
- Preserve compatibility baselines `0.1.0` through `0.3.0` byte-for-byte.
- Follow red-green-refactor for every production behavior.
- Commit at logical task boundaries without `Co-Authored-By`.

---

## File Structure

### New Files

- `src/adapters/team-memory-activity.ts` — internal deterministic team-memory activity promotion policy.
- `tests/team-memory-activity.test.ts` — policy validation, summary quality, determinism, and neutrality.
- `src/stores/sqlite.ts` — public SQLite store implementation and adapter-specific errors/options.
- `tests/sqlite-store.test.ts` — path safety, schema, commit, restart, corruption, concurrency, and conformance.
- `examples/durable-team-memory-evidence.ts` — explicit source-ledger to separate cognition-database workflow.
- `tests/durable-team-memory-example.test.ts` — generated-ledger end-to-end durability and source immutability.
- `rfcs/0005-sqlite-cognition-store.md` — adapter decision and compatibility classification.
- `spec/compatibility/0.4.0/baseline.json` — immutable package `0.4.0` compatibility baseline.
- `spec/compatibility/0.4.0/change-cases.jsonl` — additive SQLite subpath change case.

### Modified Files

- `examples/team-memory-evidence.ts` — create a real Hypothesis and use the structured internal activity policy.
- `package.json` — package `0.4.0`, SQLite and compatibility subpaths, files, scripts.
- `tsconfig.build.json` — continue excluding source connectors while emitting `src/stores/sqlite.ts`.
- `src/index.ts` — no new SQLite or team-memory exports; only reviewed generic changes if tests require them.
- `tests/package.test.mjs` — exact package inventory, clean install, SQLite subpath import.
- `tests/compatibility.test.mjs` — immutable `0.4.0` baseline and declaration closure.
- `README.md` — durable-store status, commands, limitations, and package state.
- `docs/ROADMAP.md` — mark only the database persistence adapter deliverable complete.
- `rfcs/README.md` — link RFC 0005.
- `spec/README.md` — link the adapter and clarify normative versus reference status.
- `docs/superpowers/specs/2026-07-29-sqlite-cognition-store-design.md` — mark implemented only after final verification.

---

### Task 1: Deterministic Team-Memory Activity Evidence

**Files:**
- Create: `src/adapters/team-memory-activity.ts`
- Create: `tests/team-memory-activity.test.ts`
- Modify: `examples/team-memory-evidence.ts`

**Interfaces:**
- Consumes: `SourceRecord`, `EvidencePromotionPolicy`, `createObject`, and `promoteSourceRecordsToEvidence`.
- Produces: `teamMemoryActivityEvidencePolicyV1: EvidencePromotionPolicy`.
- Produces: a real Hypothesis object with ID supplied by the example and one neutral Evidence object linked to it.

- [ ] **Step 1: Write the failing policy tests**

Create generated SourceRecords with media type `application/vnd.team-memory.event+json` and assert:

```ts
const mapping = teamMemoryActivityEvidencePolicyV1.map(records);

assert.equal(mapping.title, "Unified Portal activity (12 records)");
assert.equal(
  mapping.statement,
  [
    "12 activity records from 2026-07-28T17:59:40.952+08:00 to 2026-07-28T20:17:51.910+08:00.",
    "Actors: 2. Activity: 12 merge requests.",
    "Merge-request status: 9 merged, 2 opened, 1 closed.",
    "Unresolved status signal: opened and closed changes are both present; source review is required.",
  ].join("\n"),
);
assert.equal(mapping.evidenceKind, "team-memory-activity");
assert.equal(mapping.polarity, "neutral");
```

Also assert:

- record order does not change the summary;
- duplicate SourceRecord revisions remain handled by the existing promotion layer;
- incompatible media types fail closed;
- malformed content, unknown activity kinds, and missing timestamps fail closed;
- explicit `[reopened]` is counted independently;
- no statement contains “ready,” “successful,” “supports,” “challenges,” or an inferred Decision.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/team-memory-activity.test.ts
```

Expected: FAIL because `src/adapters/team-memory-activity.ts` does not exist.

- [ ] **Step 3: Implement the minimal closed policy**

Implement:

```ts
export const teamMemoryActivityEvidencePolicyV1: EvidencePromotionPolicy = {
  id: "team-memory-activity",
  version: "1",
  map(records) {
    const activities = records.map(readTeamMemoryActivityRecord);
    return {
      title: titleFor(activities),
      statement: statementFor(activities),
      evidenceKind: "team-memory-activity",
      polarity: "neutral",
    };
  },
};
```

`readTeamMemoryActivityRecord` must:

- accept only exact team-memory media type;
- read only own enumerable data properties;
- accept project, kind, summary, and SourceRecord actor/timestamps;
- parse only explicit merge-request status prefixes;
- sort by captured timestamp and SourceRecord ID;
- never read `raw` or infer semantic status.

- [ ] **Step 4: Verify GREEN and existing promotion stability**

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  tests/team-memory-activity.test.ts \
  tests/promotion.test.ts \
  tests/team-memory.test.ts
```

Expected: all pass; existing neutral Evidence snapshots remain unchanged.

- [ ] **Step 5: Improve the example with a real Hypothesis**

Update `examples/team-memory-evidence.ts` to:

```ts
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
  // fixed attribution, provenance, context, and timestamps
});
```

Promote records with `teamMemoryActivityEvidencePolicyV1`, print the Hypothesis and Evidence, and continue reporting `decisions inferred: 0`.

- [ ] **Step 6: Run the improved example against a generated fixture**

Run the focused test plus:

```bash
npm run --silent example:teammem -- /absolute/path/to/generated/ledger.db
```

Expected: one real Hypothesis, one structured neutral Evidence object, and zero inferred Decisions.

- [ ] **Step 7: Commit the evidence-quality scope**

```bash
git add \
  src/adapters/team-memory-activity.ts \
  tests/team-memory-activity.test.ts \
  examples/team-memory-evidence.ts
git commit -m "feat: structure team-memory activity evidence"
```

---

### Task 2: SQLite Target Safety and Schema Identity

**Files:**
- Create: `src/stores/sqlite.ts`
- Create: `tests/sqlite-store.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SqliteCognitionStoreOptions {
  readonly databasePath: string;
  readonly createIfMissing?: boolean;
  readonly busyTimeoutMs?: number;
}

export class SqliteCognitionStore implements CognitionStore {
  constructor(options: SqliteCognitionStoreOptions);
  close(): void;
}
```

- [ ] **Step 1: Write failing constructor safety tests**

Assert rejection of:

```ts
for (const databasePath of [
  "",
  "relative.db",
  ":memory:",
  "file:///tmp/cognition.db",
  "~/cognition.db",
]) {
  assert.throws(() => new SqliteCognitionStore({ databasePath }));
}
```

Also assert:

- a missing absolute path remains absent when `createIfMissing` is omitted;
- `createIfMissing: true` creates the database and all three strict tables;
- an existing empty file is rejected without mutation;
- a generated team-memory `events` database is rejected without mutation;
- an unrelated database is rejected without mutation;
- an unknown cognition schema version is rejected without mutation;
- `busyTimeoutMs` accepts only safe integers from `0` through `60_000`;
- constructor options reject accessors, unknown fields, and hostile reflection;
- `close()` is idempotent and every operation after close fails.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  --test-name-pattern="SQLite target" \
  tests/sqlite-store.test.ts
```

Expected: FAIL because `SqliteCognitionStore` does not exist.

- [ ] **Step 3: Implement option snapshot and pre-open checks**

Implement descriptor-only option capture:

```ts
function snapshotOptions(value: SqliteCognitionStoreOptions) {
  // exact own enumerable data properties only
  // validate absolute path with node:path isAbsolute
  // check existence before opening
}
```

Do not expand `~`, inspect environment variables, scan directories, or accept a source database path implicitly.

- [ ] **Step 4: Implement schema identity and creation**

Create schema version `1` only when `createIfMissing: true` targets a missing absolute path:

```sql
CREATE TABLE cognition_schema (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  adapter_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE cognition_objects (
  object_id TEXT NOT NULL,
  object_version INTEGER NOT NULL CHECK (object_version > 0),
  object_type TEXT NOT NULL,
  record_json TEXT NOT NULL,
  PRIMARY KEY (object_id, object_version)
) STRICT;

CREATE TABLE cognition_events (
  event_id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL,
  object_version INTEGER NOT NULL CHECK (object_version > 1),
  record_json TEXT NOT NULL,
  UNIQUE (object_id, object_version),
  FOREIGN KEY (object_id, object_version)
    REFERENCES cognition_objects (object_id, object_version)
) STRICT;
```

Insert marker:

```text
adapter_id = collective-cognition-sdk:sqlite-store
schema_version = 1
```

Open with foreign keys, defensive mode, extension loading disabled, double-quoted string literals disabled, and the validated busy timeout.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  --test-name-pattern="SQLite target|SQLite schema|closed SQLite" \
  tests/sqlite-store.test.ts
```

Expected: all selected tests pass and every temporary store closes.

- [ ] **Step 6: Commit target safety**

```bash
git add src/stores/sqlite.ts tests/sqlite-store.test.ts
git commit -m "feat: add safe SQLite cognition target"
```

---

### Task 3: Durable Commit and Read Semantics

**Files:**
- Modify: `src/stores/sqlite.ts`
- Modify: `tests/sqlite-store.test.ts`

**Interfaces:**
- Implements every `CognitionStore` method from `src/host-integration.ts`.
- Uses `prepareInitialCognitionCommit` and `prepareTransitionCognitionCommit`.

- [ ] **Step 1: Write failing initial commit and restart tests**

Assert:

- commit version-one object;
- close and reopen;
- read latest and version one;
- exact reordered replay returns `already_committed`;
- changed replay returns `object_revision_collision`;
- malformed stored JSON fails closed;
- read values are detached and deeply frozen.

- [ ] **Step 2: Verify initial-commit RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  --test-name-pattern="SQLite initial|SQLite restart|SQLite malformed" \
  tests/sqlite-store.test.ts
```

Expected: FAIL because commit/read methods are not implemented.

- [ ] **Step 3: Implement canonical object storage and reads**

Use:

```ts
const prepared = prepareInitialCognitionCommit(request);
const canonical = canonicalizeJson(
  prepared.object as unknown as JsonValue,
);
```

Store canonical JSON, deserialize through `deserializePortableCognitionRecord`, verify record type and row identity, and return the validated frozen record.

Query latest with:

```sql
SELECT record_json
FROM cognition_objects
WHERE object_id = ?
ORDER BY object_version DESC
LIMIT 1
```

- [ ] **Step 4: Verify initial commit GREEN**

Run the selected tests and confirm all pass.

- [ ] **Step 5: Write failing transition and rollback tests**

Assert:

- valid transition persists object and event together;
- close/reopen preserves historical version, latest version, and ordered event;
- exact replay returns `already_committed`;
- object collision precedes event collision and stale version;
- event collision precedes stale version;
- stale version reports exact actual version;
- injected event insert failure rolls back the object revision;
- partial pre-existing object/event state fails closed;
- returned conflicts leave rows unchanged.

- [ ] **Step 6: Verify transition RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  --test-name-pattern="SQLite transition|SQLite conflict|SQLite rollback" \
  tests/sqlite-store.test.ts
```

Expected: FAIL because atomic transition behavior is incomplete.

- [ ] **Step 7: Implement transaction and precedence**

Use:

```ts
database.exec("BEGIN IMMEDIATE");
try {
  // exact replay
  // object collision
  // event collision
  // partial-state failure
  // latest-version check
  // insert object and event
  database.exec("COMMIT");
} catch (error) {
  if (database.isTransaction) {
    database.exec("ROLLBACK");
  }
  throw error;
}
```

Never interpolate identifiers or record data into SQL. Use prepared statements for every value.

- [ ] **Step 8: Verify transition GREEN**

Run all `tests/sqlite-store.test.ts` tests.

- [ ] **Step 9: Commit durable semantics**

```bash
git add src/stores/sqlite.ts tests/sqlite-store.test.ts
git commit -m "feat: persist cognition in SQLite"
```

---

### Task 4: Conformance and Concurrent Writers

**Files:**
- Modify: `tests/sqlite-store.test.ts`

**Interfaces:**
- Consumes: `runCognitionHostConformance`.
- Produces: evidence that fresh SQLite stores satisfy Host Integration `0.1.0`.

- [ ] **Step 1: Write the failing conformance wrapper**

Capture each factory-created store:

```ts
const stores: SqliteCognitionStore[] = [];
const result = await runCognitionHostConformance({
  createStore() {
    const store = createTemporarySqliteStore();
    stores.push(store);
    return store;
  },
  createPublisher() {
    return new InMemoryCognitionEventPublisher();
  },
});

try {
  assert.deepEqual(
    result.cases.filter((item) => item.status !== "passed"),
    [],
  );
} finally {
  for (const store of stores) store.close();
}
```

- [ ] **Step 2: Run and verify conformance RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  --test-name-pattern="SQLite host conformance" \
  tests/sqlite-store.test.ts
```

Expected: at least one conformance case fails until adapter behavior matches the contract.

- [ ] **Step 3: Fix only contract deviations**

Adjust SQLite behavior without changing Host Integration or weakening conformance assertions.

- [ ] **Step 4: Add two-store concurrency test**

Open two stores on one database:

1. both read version `1`;
2. store A commits version `2`;
3. store B attempts a different version `2` transition with expected version `1`;
4. store B returns the contract-prescribed collision or version outcome according to target identity use;
5. only store A’s object and event remain.

Add a second contract-valid case where store B targets unused version `4` with stale expected version `3` and receives `version_conflict` with actual version `2`.

- [ ] **Step 5: Run full SQLite and host suites**

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  tests/sqlite-store.test.ts \
  tests/host-conformance.test.ts \
  tests/host-integration.test.ts \
  tests/reference-host.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit conformance**

```bash
git add tests/sqlite-store.test.ts
git commit -m "test: prove SQLite host conformance"
```

---

### Task 5: Durable Real-Ledger Workflow

**Files:**
- Create: `examples/durable-team-memory-evidence.ts`
- Create: `tests/durable-team-memory-example.test.ts`
- Modify: `package.json`

**Interfaces:**
- CLI arguments:

```text
--ledger /absolute/path/to/ledger.db
--cognition-db /absolute/path/to/cognition.db
--project <project>
--from <ISO timestamp>
--limit <positive integer>
--create
```

- [ ] **Step 1: Write failing end-to-end test**

Generate a temporary team-memory ledger, record its byte size and modification time, then invoke the example.

Assert JSON output:

```json
{
  "hypothesis": {
    "id": "hypothesis:unified-portal-delivery-readiness",
    "latestVersion": 2,
    "state": "under_review"
  },
  "evidence": {
    "state": "collected",
    "polarity": "neutral",
    "sourceCount": 12
  },
  "events": 1,
  "decisionsInferred": 0,
  "reopened": true
}
```

Also assert:

- source ledger size and modification time are unchanged;
- cognition database exists only at the explicit target;
- reopening with `--create` omitted succeeds;
- rerunning the identical fixed input is idempotent;
- no personal-vault path is accessed.

- [ ] **Step 2: Run and verify end-to-end RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  tests/durable-team-memory-example.test.ts
```

Expected: FAIL because the durable example does not exist.

- [ ] **Step 3: Implement strict argument parsing and workflow**

The example must:

1. parse exact closed arguments;
2. read the ledger through `readTeamMemoryEvents`;
3. create a real proposed Hypothesis;
4. promote structured neutral Evidence;
5. create Portable Cognition records;
6. commit both initial objects;
7. transition Hypothesis to `under_review`;
8. atomically commit its version `2` object and event;
9. close the store;
10. reopen and verify all records;
11. emit one JSON result; and
12. close in `finally`.

Use fixed or caller-derived domain timestamps from source records so exact reruns remain idempotent.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  tests/durable-team-memory-example.test.ts \
  tests/team-memory-activity.test.ts \
  tests/sqlite-store.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run manual real-ledger acceptance**

Use a temporary cognition target:

```bash
npm run --silent example:teammem:durable -- \
  --ledger ~/Workspace/local-agent-team/team-memory-agent/ledger.db \
  --cognition-db /tmp/collective-cognition-real-ledger-acceptance.db \
  --project unified-portal \
  --from 2026-07-28T17:59:00+08:00 \
  --limit 12 \
  --create
```

Before and after, record source ledger size and modification time. Remove only the explicit `/tmp` cognition target after reopen verification.

- [ ] **Step 6: Commit the durable workflow**

```bash
git add \
  examples/durable-team-memory-evidence.ts \
  tests/durable-team-memory-example.test.ts \
  package.json
git commit -m "feat: add durable team-memory cognition example"
```

---

### Task 6: Package `0.4.0` and Compatibility

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.build.json`
- Modify: `tests/package.test.mjs`
- Modify: `tests/compatibility.test.mjs`
- Create: `spec/compatibility/0.4.0/baseline.json`
- Create: `spec/compatibility/0.4.0/change-cases.jsonl`

**Interfaces:**
- Adds `collective-cognition-sdk/stores/sqlite/0.1.0`.
- Adds `collective-cognition-sdk/compatibility/0.4.0`.
- Keeps root exports unchanged.

- [ ] **Step 1: Write failing package assertions**

Assert:

- package version equals `0.4.0`;
- root runtime/type allowlists remain unchanged;
- SQLite subpath resolves emitted JS and declarations;
- clean consumer creates, closes, and reopens a temporary cognition database;
- tarball contains exact approved new files and no test database;
- historical baseline hashes remain unchanged.

- [ ] **Step 2: Run package and compatibility tests to verify RED**

Run:

```bash
npm run build
npm run test:compatibility
npm run test:package
```

Expected: failures for absent `0.4.0` baseline and package subpath.

- [ ] **Step 3: Emit and export SQLite adapter**

Update package exports:

```json
"./stores/sqlite/0.1.0": {
  "types": "./dist/stores/sqlite.d.ts",
  "import": "./dist/stores/sqlite.js"
}
```

Add compatibility `0.4.0` subpath and exact approved files. Keep adapter excluded from the root.

- [ ] **Step 4: Create immutable `0.4.0` compatibility artifacts**

Copy the `0.3.0` baseline structure, update:

- package version;
- package export keys;
- emitted file inventory;
- SQLite declaration entrypoint closure and digest;
- package files inventory; and
- additive change cases.

Do not rewrite historical baseline files.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm run test:compatibility
npm run test:package
npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 6: Commit package compatibility**

```bash
git add \
  package.json \
  tsconfig.build.json \
  tests/package.test.mjs \
  tests/compatibility.test.mjs \
  spec/compatibility/0.4.0
git commit -m "feat: package SQLite cognition store"
```

---

### Task 7: RFC, Roadmap, Review, and Final Verification

**Files:**
- Create: `rfcs/0005-sqlite-cognition-store.md`
- Modify: `rfcs/README.md`
- Modify: `spec/README.md`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/superpowers/specs/2026-07-29-sqlite-cognition-store-design.md`

**Interfaces:**
- Documents reference-adapter status, safety boundary, package subpath, and explicit deferrals.

- [ ] **Step 1: Write RFC 0005**

Document:

- source/cognition database separation;
- explicit absolute-path creation;
- schema identity marker;
- canonical records;
- transaction and replay semantics;
- no outbox;
- no inference;
- package `0.4.0` additive compatibility;
- operational and production limitations.

- [ ] **Step 2: Update every current Markdown status**

Update README and roadmap to state:

- structured team-memory activity Evidence is implemented internally;
- SQLite persistence adapter is implemented through its subpath;
- database adapter Phase 4 checkbox is complete;
- team-memory maintained connector and Obsidian adapter remain open;
- package remains private and unpublished;
- exact verified test counts and commands;
- real-ledger acceptance result and source immutability evidence.

Mark the design `Implemented and final-review verified` only after final review passes.

- [ ] **Step 3: Run documentation consistency scans**

Run:

```bash
grep -R -n -E \
  '0\\.3\\.0|Phase 4.*Planned|No persistence|not implemented yet|282 total' \
  --include='*.md' .
```

Classify every hit as current and update it, or historical and leave it immutable.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  tests/team-memory-activity.test.ts \
  tests/sqlite-store.test.ts \
  tests/durable-team-memory-example.test.ts
npm test
npx tsc --noEmit
npm run check
npm run example
npm run example:portable
npm run example:host
npm run pack:check
git diff --check
```

Expected: zero failures.

- [ ] **Step 5: Request independent final review**

Review:

- SQLite target safety and accidental-ledger protection;
- transaction atomicity and exact precedence;
- canonical replay;
- conformance cleanup;
- package root neutrality;
- compatibility artifact accuracy;
- evidence policy neutrality;
- documentation consistency.

Resolve every Critical or Important issue and rerun the affected matrix.

- [ ] **Step 6: Commit final documentation**

```bash
git add \
  README.md \
  docs/ROADMAP.md \
  docs/superpowers/specs/2026-07-29-sqlite-cognition-store-design.md \
  rfcs/0005-sqlite-cognition-store.md \
  rfcs/README.md \
  spec/README.md
git commit -m "docs: finalize SQLite cognition store"
```

- [ ] **Step 7: Push, review, and integrate**

```bash
git push origin feature/sqlite-cognition-store
```

After branch verification, integrate according to the repository’s established squash/merge policy, verify `master == origin/master`, and delete the merged feature branch locally and remotely.
