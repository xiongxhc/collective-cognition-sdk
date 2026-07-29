# Maintained Source Connectors Implementation Plan

> **For implementers:** Follow this plan with red-green-refactor. Do not modify
> `team-memory-agent`, MemberKit, schedulers, live vaults, or any source ledger.

**Goal:** Ship a source-neutral connector conformance package and the first
maintained `teammem-event-ledger/1` connector as additive versioned subpaths of
the private `collective-cognition-sdk` package.

**Architecture:** Third-party and maintained connectors collect explicit source
data into immutable `SourceRecord` values. The generic conformance runner
checks that boundary without defining connector discovery, credentials,
scheduling, interpretation, promotion, or persistence. The maintained
team-memory connector is isolated under its own versioned subpath and CLI; the
root SDK and generic CLI remain source-neutral.

**Tech Stack:** TypeScript, Node.js 24 built-in test runner, `node:sqlite`,
TypeScript compiler API compatibility checks, npm package/tarball tests.

**Global Constraints:**

- Work only in `/Users/cx/Workspace/collective-cognition-sdk`.
- Use branch `feature/maintained-team-memory-connector`; do not create a
  `codex/` branch.
- Keep `"private": true`; do not publish the package.
- Keep the root runtime and type export inventories unchanged.
- Use only fictional fixtures in the repository.
- Never expose database paths, SQLite messages, SQL, source rows, raw values,
  credentials, or arbitrary thrown messages in public diagnostics.
- Snapshot hostile public inputs through own property descriptors before
  validation; do not use ordinary reads or `JSON.stringify` on untrusted
  values.
- Preserve all historical compatibility artifacts byte-for-byte.
- Commit at the end of each logical task without `Co-Authored-By`.

---

## Task 1: Add Source-Neutral Connector Conformance

**Files:**

- Create: `src/connector-conformance.ts`
- Create: `tests/connector-conformance.test.ts`
- Modify: `package.json` (`check` script only)

### Step 1: Write the failing public-behavior tests

Create `tests/connector-conformance.test.ts` with fixtures built through
`createSourceRecord` and assertions covering:

```ts
const passed = await runSourceConnectorConformance([{
  name: "fictional sync connector",
  collect: () => [record("record:one", "revision:one")],
}]);

assert.deepEqual(passed, [{
  name: "fictional sync connector",
  status: "passed",
  diagnostics: [],
}]);
assert.equal(isDeepFrozen(passed), true);
```

Add an async case and a case using `collectAgain` with freshly allocated but
canonically identical records. Add failures with exact diagnostic codes for:

```ts
{ collect: () => ({}) as never }                 // invalid_collection
{ collect: () => [{ schemaVersion: "9" }] as never } // invalid_source_record
{ collect: () => [first, first] }                // duplicate_revision
{ collect: () => [first], collectAgain: () => [changed] }
                                                    // nondeterministic_output
{ collect: () => { throw new Error("secret /tmp/source.db"); } }
                                                    // connector_exception
```

Assert the exception diagnostic contains neither `secret` nor
`/tmp/source.db`, and assert a failing case does not prevent a later valid case
from passing.

Add hostile input cases:

- accessor properties for `name`, `collect`, and `collectAgain`;
- a proxy throwing from `ownKeys`;
- inherited fields instead of own fields;
- extra own fields;
- sparse case arrays;
- a non-array cases value passed through an `unknown` cast.

Each hostile input must fail closed without invoking an accessor and without
aborting later valid cases.

Verify returned records are not retained by mutating the connector-owned source
array after completion and by checking all result objects, diagnostics, and
arrays are deeply frozen.

### Step 2: Run the focused test and confirm RED

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  tests/connector-conformance.test.ts
```

Expected: failure because `src/connector-conformance.ts` does not exist.

### Step 3: Implement the exact public interface

Create `src/connector-conformance.ts` with:

```ts
export interface SourceConnectorConformanceCase {
  readonly name: string;
  readonly collect: () =>
    | readonly SourceRecord[]
    | Promise<readonly SourceRecord[]>;
  readonly collectAgain?: () =>
    | readonly SourceRecord[]
    | Promise<readonly SourceRecord[]>;
}

export type SourceConnectorConformanceDiagnosticCode =
  | "connector_exception"
  | "invalid_collection"
  | "invalid_source_record"
  | "duplicate_revision"
  | "nondeterministic_output";

export interface SourceConnectorConformanceDiagnostic {
  readonly code: SourceConnectorConformanceDiagnosticCode;
  readonly message: string;
  readonly itemIndex?: number;
}

export interface SourceConnectorConformanceResult {
  readonly name: string;
  readonly status: "passed" | "failed";
  readonly diagnostics:
    readonly SourceConnectorConformanceDiagnostic[];
}

export async function runSourceConnectorConformance(
  cases: readonly SourceConnectorConformanceCase[],
): Promise<readonly SourceConnectorConformanceResult[]>;
```

Implementation requirements:

1. Validate `cases` is a dense array before iterating.
2. Snapshot each case using `Reflect.ownKeys` and
   `Reflect.getOwnPropertyDescriptor`.
3. Accept exactly the own enumerable data properties `name`, `collect`, and
   optional `collectAgain`.
4. Validate `name` as a non-empty string and callbacks as functions without
   invoking unknown getters.
5. Await each callback independently.
6. Require an actual array, then validate each item with
   `validateSourceRecord`.
7. Detach each record through `serializeSourceRecord` followed by
   `deserializeSourceRecord`.
8. Compare duplicate keys with `sourceRevisionKey`.
9. Compare repeated collections using the canonical serialized record strings
   in array order.
10. Replace every connector-thrown value with the fixed message
    `"Connector collection failed."`.
11. Return detached, deeply frozen structured results.

Use fixed messages for all diagnostic codes. Do not interpolate case values,
record values, thrown messages, paths, or arbitrary property names.

### Step 4: Run focused and adjacent checks

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  tests/connector-conformance.test.ts \
  tests/source-records.test.ts
npx tsc --noEmit
npm run check
```

Expected: all pass.

### Step 5: Commit the generic boundary

```bash
git add src/connector-conformance.ts \
  tests/connector-conformance.test.ts package.json
git commit -m "feat: add source connector conformance"
```

---

## Task 2: Maintain the Team-Memory Ledger Connector

**Files:**

- Create: `src/connectors/team-memory.ts`
- Modify: `tests/team-memory.test.ts`
- Modify: `tests/conformance.test.ts`
- Modify: `examples/team-memory-evidence.ts`
- Modify: `examples/durable-team-memory-evidence.ts`
- Delete: `src/adapters/team-memory.ts`
- Modify: `package.json` (`check` script only)

### Step 1: Replace adapter-level tests with public connector tests

Change imports in `tests/team-memory.test.ts` to:

```ts
import {
  TEAM_MEMORY_LEDGER_FORMAT,
  TeamMemoryConnectorError,
  readTeamMemorySourceRecords,
} from "../src/connectors/team-memory.ts";
```

Use a private test-only `EventInput` type rather than importing a SQLite row
type. Preserve fictional SQLite fixture generation.

Add success assertions:

```ts
const records = readTeamMemorySourceRecords({
  databasePath: ledger.path,
  sourceInstance: "fictional-engineering-hub",
  person: "alice",
  limit: 1,
});

assert.equal(TEAM_MEMORY_LEDGER_FORMAT, "teammem-event-ledger/1");
assert.deepEqual(records[0].source, {
  system: "teammem-event-ledger",
  instance: "fictional-engineering-hub",
});
assert.equal(Object.isFrozen(records), true);
assert.equal(isDeepFrozen(records[0]), true);
```

Add source identity isolation:

```ts
const first = readTeamMemorySourceRecords({
  databasePath: ledger.path,
  sourceInstance: "hub-a",
})[0];
const second = readTeamMemorySourceRecords({
  databasePath: ledger.path,
  sourceInstance: "hub-b",
})[0];

assert.notEqual(first.id, second.id);
assert.notEqual(sourceRevisionKey(first), sourceRevisionKey(second));
```

Assert stable mapping:

```text
id              source-record:teammem-event-ledger:<encoded instance>:<encoded person>:<encoded source>:<encoded hash>
source.system   teammem-event-ledger
source.instance fictional-engineering-hub
sourceId        <encoded person>:<encoded source>
revisionId      upstream hash
mediaType       application/vnd.team-memory.event+json
actorId         person:<person>
```

Retain tests for bound filters, deterministic ordering, six-digit fractional
seconds, raw omission/default, explicit `includeRaw`, malformed references,
invalid rows, invalid timestamps, and stable upstream identity independent of
SQLite row ID.

Add options tests for:

- non-object, arrays, accessors, proxies, inherited properties, extra fields;
- missing, relative, `~`, `:memory:`, and URL database paths;
- `sourceInstance` empty, outer-whitespace, control characters, 129 Unicode
  scalar values, and valid non-ASCII scalar values;
- invalid `from`, `to`, `person`, `project`, `limit`, and `includeRaw`;
- invalid options fail before attempting to open a database.

Add schema tests:

- missing `events`;
- missing each required column;
- incompatible declared type for each required column;
- missing `PRIMARY KEY` semantics for `id`;
- missing `NOT NULL` constraints on required fields;
- missing compatible unique constraint over `(person, source, hash)`;
- additional tables and columns accepted.

Assert each public failure is a `TeamMemoryConnectorError` with the expected
`code` and `stage`, and recursively assert `message` plus `details` contain no
fixture path, SQL, row summary, raw value, or SQLite message.

Record `size` and `mtimeNs` before and after every successful read and compare
them exactly.

In `tests/conformance.test.ts`, add the maintained connector output to the
existing source-record conformance table and assert it passes
`runSourceConnectorConformance`.

### Step 2: Run focused tests and confirm RED

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  tests/team-memory.test.ts tests/conformance.test.ts
```

Expected: failure because `src/connectors/team-memory.ts` does not exist and
the old adapter does not satisfy the approved contract.

### Step 3: Implement the connector contract

Create `src/connectors/team-memory.ts` with exactly:

```ts
export const TEAM_MEMORY_LEDGER_FORMAT = "teammem-event-ledger/1";

export interface TeamMemorySourceRecordOptions {
  readonly databasePath: string;
  readonly sourceInstance: string;
  readonly from?: string;
  readonly to?: string;
  readonly person?: string;
  readonly project?: string;
  readonly limit?: number;
  readonly includeRaw?: boolean;
}

export type TeamMemoryConnectorErrorCode =
  | "invalid_options"
  | "target_unavailable"
  | "incompatible_ledger"
  | "invalid_row"
  | "read_failed";

export class TeamMemoryConnectorError extends Error {
  readonly code: TeamMemoryConnectorErrorCode;
  readonly stage: "options" | "open" | "schema" | "query" | "mapping";
  readonly details: Readonly<Record<string, string | number | boolean>>;
}

export function readTeamMemorySourceRecords(
  options: TeamMemorySourceRecordOptions,
): readonly SourceRecord[];
```

Implementation sequence:

1. Descriptor-snapshot and validate options before touching the path.
2. Require `isAbsolute(databasePath)` and reject URL-like, `:memory:`, and
   tilde forms.
3. Validate timestamps with the same explicit-offset calendar rules as
   `SourceRecord`.
4. Validate `sourceInstance` by Unicode scalar count and control-character
   exclusion.
5. Open `DatabaseSync(databasePath, { open: true, readOnly: true })`.
6. Inspect `PRAGMA table_info(events)` plus index metadata, accepting extra
   columns/tables but requiring the documented shape and unique key.
7. Build only the fixed `SELECT` statement; append fixed filter clauses and
   bind every value.
8. Select in `ORDER BY ts ASC, id ASC`.
9. Validate every row into internal detached values before mapping any output.
10. Map with `createSourceRecord`, including `sourceInstance` in `id` and
    `source.instance`.
11. Close the database in `finally`.
12. Map internal failures to fixed public messages and allowlisted details
    such as `{ field: "sourceInstance" }`; never forward SQLite text.
13. Freeze the returned array; `createSourceRecord` freezes each record.

Do not export the internal row shape or row-to-record mapper.

Update examples to call `readTeamMemorySourceRecords` with an explicit
fictional `sourceInstance`. Remove `src/adapters/team-memory.ts` only after all
imports point to the maintained connector.

### Step 4: Run focused and adjacent checks

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  tests/team-memory.test.ts \
  tests/conformance.test.ts \
  tests/team-memory-activity.test.ts \
  tests/durable-team-memory-example.test.ts
npx tsc --noEmit
npm run check
npm run example:teammem
npm run example:teammem:durable
```

Expected: all pass; examples use only generated fictional ledgers.

### Step 5: Commit the maintained connector

```bash
git add src/connectors/team-memory.ts \
  tests/team-memory.test.ts tests/conformance.test.ts \
  examples/team-memory-evidence.ts \
  examples/durable-team-memory-evidence.ts \
  package.json
git add -u src/adapters/team-memory.ts
git commit -m "feat: maintain team-memory ledger connector"
```

---

## Task 3: Add the Dedicated Connector CLI

**Files:**

- Create: `src/team-memory-cli.ts`
- Create: `tests/team-memory-cli.test.ts`
- Delete: `src/teammem-cli.ts`
- Modify: `package.json` (`check` and development script only)

### Step 1: Write closed-parser and process-boundary tests

Create `tests/team-memory-cli.test.ts` around spawned Node processes.

Success command:

```bash
node --disable-warning=ExperimentalWarning src/team-memory-cli.ts export \
  --db /absolute/generated/ledger.db \
  --source-instance fictional-engineering-hub \
  --person alice \
  --limit 1
```

Assert:

- status `0`;
- empty stderr;
- stdout is one canonical SourceRecord JSON object per line;
- records match direct connector output byte-for-byte;
- `--include-raw` is required to expose raw;
- filters pass through exactly;
- repeated commands produce byte-identical stdout.

Parser failures must cover no command, unknown command, unknown flag,
duplicate flag, missing value, positional input, malformed limit, relative
database path, and missing `source-instance`.

For every failure assert:

```ts
assert.equal(result.status, 1);
assert.equal(result.stdout, "");
const lines = result.stderr.trim().split("\n");
assert.equal(lines.length, 1);
assert.deepEqual(Object.keys(JSON.parse(lines[0])).sort(), [
  "code",
  "message",
  "stage",
]);
```

Assert stderr excludes the path, SQL, fictional summary, raw value, and
arbitrary thrown text.

Assert `--help` and `--version` succeed when `--db` points to an unavailable
path, proving neither command opens the source.

Simulate closed stdout and assert one sanitized `output_failed` diagnostic,
nonzero status, and no unhandled stack trace.

Pipe successful stdout into:

```bash
node dist/cli.js validate --input - --format jsonl
```

and assert the generic CLI accepts every emitted record.

### Step 2: Run the focused test and confirm RED

Run:

```bash
node --disable-warning=ExperimentalWarning --test \
  tests/team-memory-cli.test.ts
```

Expected: failure because `src/team-memory-cli.ts` does not exist.

### Step 3: Implement the dedicated CLI

Implement a closed parser accepting only:

```text
export
--db <absolute path>
--source-instance <public stable name>
--from <timestamp>
--to <timestamp>
--person <id>
--project <id>
--limit <positive integer>
--include-raw
--help
--version
```

Use `serializeSourceRecord(record)` for each stdout line. Handle backpressure
and output errors before reporting success. Emit exactly one JSON object to
stderr with fixed public fields:

```ts
interface TeamMemoryCliDiagnostic {
  readonly code:
    | TeamMemoryConnectorErrorCode
    | "invalid_command"
    | "output_failed";
  readonly stage:
    | TeamMemoryConnectorError["stage"]
    | "arguments"
    | "output";
  readonly message: string;
}
```

Do not include `details` in the process diagnostic. Do not print stack traces.
Set `process.exitCode`; do not call `process.exit` while stdout may be pending.

Replace `src/teammem-cli.ts` only after the new CLI passes all process tests.

### Step 4: Run focused and generic CLI checks

Run:

```bash
npm run build
node --disable-warning=ExperimentalWarning --test \
  tests/team-memory-cli.test.ts tests/cli.test.ts tests/cli-contract.test.ts
npx tsc --noEmit
npm run check
```

Expected: all pass; generic CLI behavior remains unchanged.

### Step 5: Commit the executable source

```bash
git add src/team-memory-cli.ts tests/team-memory-cli.test.ts package.json
git add -u src/teammem-cli.ts
git commit -m "feat: add team-memory connector CLI"
```

---

## Task 4: Package Versioned Connector Surfaces

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.build.json`
- Modify: `tests/package.test.mjs`
- Modify: `tests/compatibility.test.mjs`
- Create: `spec/compatibility/0.5.0/baseline.json`
- Create: `spec/compatibility/0.5.0/change-cases.jsonl`

### Step 1: Extend package tests before package metadata

Update tests to expect package version `0.5.0` and these additive exports:

```json
"./connector-conformance/0.1.0": {
  "types": "./dist/connector-conformance.d.ts",
  "import": "./dist/connector-conformance.js"
},
"./connectors/team-memory/0.1.0": {
  "types": "./dist/connectors/team-memory.d.ts",
  "import": "./dist/connectors/team-memory.js"
}
```

Update the expected binary map:

```json
{
  "collective-cognition": "./dist/cli.js",
  "collective-cognition-teammem": "./dist/team-memory-cli.js"
}
```

Require exact emitted and tarball inventories for the three new runtime files
and declarations:

```text
dist/connector-conformance.js
dist/connector-conformance.d.ts
dist/connectors/team-memory.js
dist/connectors/team-memory.d.ts
dist/team-memory-cli.js
dist/team-memory-cli.d.ts
```

Continue rejecting internal adapters, tests, design documents, fixture
databases, logs, environment files, credentials, and unapproved connector
files.

In the clean consumer:

- runtime-import both versioned subpaths;
- type-import every public connector and conformance type;
- create a fictional compatible SQLite ledger;
- run `collective-cognition-teammem export`;
- validate its stdout through `collective-cognition validate`;
- prove the executable bit survives packing;
- assert root runtime and type names are identical to `0.4.0`.

Extend declaration-closure assertions so each new subpath closure is pinned
independently and does not pull in the other connector surface unexpectedly.

### Step 2: Extend compatibility tests and confirm RED

Pin SHA-256 values for both immutable `0.4.0` artifacts before creating
`0.5.0`. Extend the historical digest maps to cover `0.4.0`.

Add `0.5.0` assertions for:

- package metadata;
- unchanged root runtime and type names;
- additive subpath runtime/type inventories;
- exact error-code and stage unions;
- connector ledger-format constant;
- CLI binary name;
- compatible and breaking change cases.

Run:

```bash
npm run build
node --test tests/compatibility.test.mjs tests/package.test.mjs
```

Expected: failures because package metadata and `0.5.0` artifacts are absent.

### Step 3: Emit and export the approved files

Update `tsconfig.build.json` to include the maintained connector and dedicated
CLI while continuing to exclude repository-only adapters.

Update `package.json` and `package-lock.json` to `0.5.0`, retain
`"private": true`, add the two versioned exports, install the second binary,
and preserve zero production dependency fields.

Create `spec/compatibility/0.5.0/baseline.json` from independently measured
runtime, type, declaration-closure, contract, package, and CLI inventories.
Create one valid JSON object per line in
`spec/compatibility/0.5.0/change-cases.jsonl` with explicit `compatible` and
`breaking` expectations for the new public surface.

Do not modify `spec/compatibility/0.1.0` through `0.4.0`.

### Step 4: Verify build, compatibility, and clean consumption

Run:

```bash
npm run build
node --test tests/compatibility.test.mjs
node --test tests/package.test.mjs
npm run pack:check
npx tsc --noEmit
npm run check
```

Expected: all pass and `npm pack --json --dry-run` reports only allowlisted
files.

### Step 5: Commit the package boundary

```bash
git add package.json package-lock.json tsconfig.build.json \
  tests/package.test.mjs tests/compatibility.test.mjs \
  spec/compatibility/0.5.0
git commit -m "feat: package maintained source connectors"
```

---

## Task 5: Document the Extension Model

**Files:**

- Create: `rfcs/0006-maintained-source-connectors.md`
- Create: `docs/connector-author-guide.md`
- Modify: `rfcs/README.md`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `spec/README.md`
- Modify: `spec/compatibility.md`
- Modify: `package.json` (`files` only)
- Modify: `tests/package.test.mjs`

### Step 1: Add documentation assertions

Extend package/document tests to require:

- README links to the connector-author guide and RFC;
- the connector-author guide names `SourceRecord` as the universal boundary;
- the guide shows an independent package importing only the root SDK and
  `connector-conformance/0.1.0`;
- the guide does not require the team-memory connector;
- README identifies team-memory as one maintained compatible connector;
- README says collection does not imply promotion or persistence;
- RFC index links RFC 0006;
- specification index links both versioned subpaths;
- roadmap tracks all explicit deferrals;
- package remains private and unpublished;
- docs avoid certification, endorsement, and LTS claims.

Run the package test and confirm it fails on missing documentation.

### Step 2: Write RFC 0006

Document:

- the problem and source-neutral decision;
- ownership split between core, conformance, maintained connector, external
  connectors, and hosts;
- exact versioned public interfaces;
- security and privacy behavior;
- identity isolation through `sourceInstance`;
- no implicit collection, interpretation, promotion, or persistence;
- compatibility policy and extraction path to a future companion package;
- rejected alternatives and explicit deferrals.

Cross-link the approved design document for historical rationale, while
keeping the RFC independently understandable.

### Step 3: Write the public connector-author guide

Provide a complete fictional connector example:

```ts
import {
  createSourceRecord,
} from "collective-cognition-sdk";
import {
  runSourceConnectorConformance,
} from "collective-cognition-sdk/connector-conformance/0.1.0";

const collect = () => [
  createSourceRecord({
    id: "source-record:fictional:entry-1:revision-1",
    source: { system: "fictional-ledger", instance: "public-demo" },
    sourceId: "entry-1",
    revisionId: "revision-1",
    capturedAt: "2026-07-29T10:00:00.000Z",
    mediaType: "application/json",
    content: { summary: "A fictional source entry." },
  }),
];

const results = await runSourceConnectorConformance([{
  name: "fictional-ledger",
  collect,
  collectAgain: collect,
}]);
```

Explain connector-owned concerns: explicit source selection, authentication,
pagination/cursors, retries, no-mutation checks, source-specific errors, and
release policy. Explain that conformance checks output shape and determinism;
it is not security certification.

### Step 4: Update current public documentation

Update README with:

- package/repository status;
- exact imports and CLI command;
- the data flow from connector to host-selected persistence;
- the team-memory-compatible structural schema;
- `sourceInstance` privacy/identity guidance;
- raw opt-in warning;
- explicit statement that no `team-memory-agent` dependency is required.

Update the roadmap:

- mark generic conformance, maintained connector, CLI, and packaging complete
  only after final verification;
- leave scheduler, registry, network connectors, credentials, automatic
  promotion, durable publication outbox, publication, and production
  certification tracked as future work.

Update specification and compatibility indexes without changing historical
normative artifacts.

### Step 5: Verify docs and package inventory

Run:

```bash
node --test tests/package.test.mjs tests/compatibility.test.mjs
npm run pack:check
git diff --check
```

Expected: all pass.

### Step 6: Commit the public documentation

```bash
git add rfcs/0006-maintained-source-connectors.md rfcs/README.md \
  docs/connector-author-guide.md README.md docs/ROADMAP.md \
  spec/README.md spec/compatibility.md package.json tests/package.test.mjs
git commit -m "docs: explain maintained source connectors"
```

---

## Task 6: Verify Real-Ledger Compatibility and Close Review

**Files:**

- Modify after evidence is clean:
  `docs/superpowers/specs/2026-07-29-maintained-source-connectors-design.md`
- Modify after evidence is clean: `docs/ROADMAP.md`
- No production-data fixture or acceptance-output file may be added.

### Step 1: Run deterministic full verification

Use the supported Node runtime:

```bash
export PATH="/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
node --version
npm test
npx tsc --noEmit
npm run check
npm run example
npm run example:portable
npm run example:host
npm run example:teammem
npm run example:teammem:durable
npm run pack:check
git diff --check
```

Expected Node major: `24`. Record the exact test count from the output rather
than copying an earlier count.

### Step 2: Perform read-only real-ledger acceptance

Use the explicitly approved local ledger:

```text
/Users/cx/Workspace/local-agent-team/team-memory-agent/ledger.db
```

Before reading, record only:

- byte size;
- nanosecond modification time.

Run the installed connector twice with:

```text
sourceInstance = local-acceptance
includeRaw      = false
```

Do not print records to chat or store them in the repository. Write temporary
exports under `/private/tmp`, validate every line through generic ingestion,
and compare only:

- record count;
- SHA-256 of canonical JSONL;
- first and second run equality;
- source size before/after;
- source nanosecond modification time before/after.

Delete temporary exports after comparison. Do not create a cognition database,
read a vault, change a scheduler, or invoke `team-memory-agent`.

### Step 3: Run an independent code review

Review the branch diff against:

- all ten approved acceptance criteria;
- hostile input and secret-safe error behavior;
- source read-only guarantees;
- root API neutrality;
- historical artifact immutability;
- exact package inventory;
- public-open-source fixture hygiene;
- prior user correction that team-memory is one connector, not SDK root
  behavior.

Resolve every Critical and Important finding. Re-run the smallest affected
test first, then the full verification command.

### Step 4: Mark only verified status complete

After all mechanical checks and review pass:

- set the design status to `Implemented and verified`;
- mark the four delivered roadmap items complete;
- retain every deferred item as incomplete;
- record the actual test count and Node version;
- do not claim npm publication, production certification, connector
  certification, or `team-memory-agent` integration.

Run:

```bash
git diff --check
git status --short
```

### Step 5: Commit verification closeout

```bash
git add docs/superpowers/specs/2026-07-29-maintained-source-connectors-design.md \
  docs/ROADMAP.md
git commit -m "docs: record connector verification"
```

### Step 6: Push and merge only after verified

Because the user already authorized reasonable commits and pushes, push the
feature branch after local verification. Open a ready pull request if the
remote supports it, merge only if required checks pass, delete the merged
branch, and re-verify the base branch checkout. Never force-push or bypass
required checks.

