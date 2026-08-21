# Cross-Connector Interoperability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a maintained read-only local Git connector and prove that Git and team-memory records can traverse the same source-neutral cognition exchange without connector-private coupling or silent semantic loss.

**Architecture:** Add `connectors/git/0.1.0` as an isolated package subpath backed by bounded, non-networking Git child processes and the existing SourceRecord contract. Add immutable language-neutral interoperability resources, then exercise both maintained connectors through one generic ingestion, explicit neutral promotion, and Portable Cognition round trip using temporary fictional sources.

**Tech Stack:** TypeScript 7, Node.js 24, `node:test`, Node child processes, local Git CLI, Node SQLite, JSON, JSONL, Markdown, npm package exports.

**Spec:** `docs/superpowers/specs/2026-08-21-cross-connector-interoperability-design.md`

## Global Constraints

- Keep `package.json` private and unpublished; advance the package from `0.9.0` to `0.10.0` only after runtime and fixture behavior is tested.
- Preserve every normative artifact and compatibility baseline from `0.1.0` through `0.9.0` byte-for-byte.
- Add no Git name to the package root and no Git CLI executable, runtime dependency, registry, plugin loader, network access, discovery, scheduler, or automatic cognition.
- Require explicit absolute `repositoryPath`, public `sourceInstance`, exact lowercase 40- or 64-hex `tipCommitId`, caller-supplied `capturedAt`, and integer `limit` from 1 through 1,000.
- Follow only first-parent ancestry from the exact tip, retain all ordered parents on merge records, and return the selected bounded window oldest-to-newest.
- Run Git with argument arrays, `shell: false`, `GIT_OPTIONAL_LOCKS=0`, `GIT_NO_LAZY_FETCH=1`, and `GIT_TERMINAL_PROMPT=0`; reject partial/promisor repositories.
- Keep messages and author email private by default and expose them only through `includeMessage` and `includeAuthorEmail`.
- Return complete frozen collections or a sanitized frozen `GitConnectorError`; never leak paths, Git stderr, commit content, author data, commands, environment, or arbitrary exception text.
- Treat interoperability resources as UTF-8 files resolved through package subpaths, not JavaScript or JSONL module imports.
- Use only fictional temporary repositories and ledgers; never inspect or mutate a live repository, ledger, vault, service, or scheduler.
- Do not claim publication, production readiness, certification, endorsement, LTS, arbitrary ecosystem support, or semantic conclusions not explicitly created by the caller.

---

### Task 1: Maintained Git Connector Contract

**Files:**
- Create: `src/connectors/git.ts`
- Replace: `tests/git-connector.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createSourceRecord(input): SourceRecord`, `SourceRecord`, `runSourceConnectorConformance(testCase)`, and a caller-selected local Git repository.
- Produces: `GIT_REPOSITORY_FORMAT`, `GitCommitSourceRecordOptions`, `GitConnectorErrorCode`, `GitConnectorStage`, `GitConnectorError`, and `readGitCommitSourceRecords(options): readonly SourceRecord[]` from `src/connectors/git.ts`.
- Preserves: `src/adapters/git-commit.ts` unchanged as internal-only compatibility code with no package export; the maintained connector defines the only public Git contract.

- [ ] **Step 1: Write failing public-contract and repository tests**

Replace the mapper-only tests with temporary-repository tests. Add helpers with these exact responsibilities:

```ts
interface GitFixture {
  readonly directory: string;
  readonly repositoryPath: string;
  readonly commits: Readonly<Record<string, string>>;
}

function createGitFixture(): GitFixture;
function runGit(repositoryPath: string, args: readonly string[]): string;
function removeGitFixture(directory: string): void;
function assertGitConnectorError(
  action: () => unknown,
  code: GitConnectorErrorCode,
  stage: GitConnectorStage,
): GitConnectorError;
```

Build a real fictional history containing a root commit, a linear commit with Unicode author name, a side commit, and a merge commit with a multiline message. Use fixed author/committer names, emails, timestamps, and environment so object IDs are deterministic within the fixture. Assert:

```ts
const records = readGitCommitSourceRecords({
  repositoryPath: fixture.repositoryPath,
  sourceInstance: "fictional-git-main",
  tipCommitId: fixture.commits.merge,
  capturedAt: "2026-08-21T12:00:00.000Z",
  limit: 3,
});

assert.deepEqual(records.map(({ revisionId }) => revisionId), [
  fixture.commits.root,
  fixture.commits.main,
  fixture.commits.merge,
]);
assert.equal(records.at(-1)?.source.system, "git-repository");
assert.equal(records.at(-1)?.source.instance, "fictional-git-main");
assert.deepEqual(records.at(-1)?.content.parents, [
  fixture.commits.main,
  fixture.commits.side,
]);
assert.equal("message" in records.at(-1)!.content, false);
assert.equal("email" in records.at(-1)!.content.author, false);
assert.equal(Object.isFrozen(records), true);
```

Also assert exact-tip selection, limit `1`, privacy opt-ins, empty author email omission, stable IDs across repeated reads, distinct IDs across two `sourceInstance` values, all ordered merge parents retained, and generic connector conformance with `collect` plus `collectAgain`. Initialize one repository with `git init --object-format=sha256` and require a valid 64-character exact tip and resulting records; if the installed Git explicitly reports that SHA-256 repositories are unsupported, report one capability skip rather than substituting a synthetic 64-character ID.

- [ ] **Step 2: Run the focused test and prove RED**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --disable-warning=ExperimentalWarning --test tests/git-connector.test.ts
```

Expected: fail because `src/connectors/git.ts` and its public contract do not exist.

- [ ] **Step 3: Implement the closed public API and pure mapping boundary**

Define the exact public surface:

```ts
export const GIT_REPOSITORY_FORMAT = "git-repository/1";

export interface GitCommitSourceRecordOptions {
  readonly repositoryPath: string;
  readonly sourceInstance: string;
  readonly tipCommitId: string;
  readonly capturedAt: string;
  readonly limit: number;
  readonly includeMessage?: boolean;
  readonly includeAuthorEmail?: boolean;
}

export type GitConnectorErrorCode =
  | "invalid_options"
  | "target_unavailable"
  | "incompatible_repository"
  | "invalid_commit"
  | "read_failed";

export type GitConnectorStage =
  | "options"
  | "open"
  | "history"
  | "mapping";

export class GitConnectorError extends Error {
  readonly code: GitConnectorErrorCode;
  readonly stage: GitConnectorStage;
  readonly details: Readonly<Record<string, string | number | boolean>>;
}

export function readGitCommitSourceRecords(
  options: GitCommitSourceRecordOptions,
): readonly SourceRecord[];
```

Use fixed public messages: `Git connector options are invalid.`, `Git repository is unavailable.`, `Git repository is incompatible.`, `Git repository contains an invalid commit.`, and `Git repository could not be read.` Snapshot options through `Reflect.ownKeys` plus own enumerable data-property descriptors. Reject non-objects, arrays, inherited/accessor/symbol/unknown fields, relative paths, `~`, URLs, NUL, invalid public source instances, non-lowercase/non-40-or-64-hex tips, invalid or offsetless timestamps, limits outside `1..1000`, and non-boolean privacy flags before any `statSync` or child process.

Map each validated commit to:

```ts
createSourceRecord({
  id: `source-record:git-repository:${encodeURIComponent(sourceInstance)}:${commitId}`,
  source: { system: "git-repository", instance: sourceInstance },
  sourceId: `commit:${commitId}`,
  revisionId: commitId,
  capturedAt,
  observedAt: authoredAt,
  mediaType: "application/vnd.git.commit+json",
  content: {
    commitId,
    parents,
    authoredAt,
    committedAt,
    author: {
      name: authorName,
      ...(includeAuthorEmail && authorEmail.length > 0
        ? { email: authorEmail }
        : {}),
    },
    summary,
    ...(includeMessage ? { message } : {}),
  },
});
```

Do not synthesize `actorId`. Normalize Git epoch timestamps to ISO UTC strings. Derive `summary` from the first LF-delimited message line after removing one trailing CR; preserve the complete decoded message only under the opt-in.

- [ ] **Step 4: Implement exact first-parent acquisition**

Use `spawnSync("git", args, { shell: false, encoding: null, timeout, maxBuffer, env })` behind one private helper that always applies the three Git environment controls and maps process results to fixed errors. Select IDs with:

```text
git -C <repositoryPath> rev-list --first-parent --max-count=<limit> <tipCommitId>
```

Validate every output line as an object ID matching the selected repository format, reverse the newest-first output exactly once, and inspect the exact selected objects through bounded `git cat-file --batch` input. Parse each batch header and exact byte length before decoding commit headers/body; require ordered `tree`, zero or more `parent`, one `author`, one `committer`, and a message separator. Validate that the batch object ID equals the requested ID and object type is `commit` before mapping any record.

- [ ] **Step 5: Run focused and adjacent tests and prove GREEN**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --disable-warning=ExperimentalWarning --test \
  tests/git-connector.test.ts \
  tests/connector-conformance.test.ts \
  tests/source-records.test.ts
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  npx tsc --noEmit
```

Expected: all selected tests and TypeScript pass, with no team-memory import in `src/connectors/git.ts`.

- [ ] **Step 6: Commit the maintained connector contract**

```bash
git add src/connectors/git.ts tests/git-connector.test.ts package.json
git commit -m "feat: add maintained git connector"
```

### Task 2: Git Process and Repository Hardening

**Files:**
- Modify: `src/connectors/git.ts`
- Modify: `tests/git-connector.test.ts`

**Interfaces:**
- Consumes: Task 1 `readGitCommitSourceRecords()` and `GitConnectorError` contract.
- Produces: fail-closed repository compatibility checks, bounded child-process behavior, sanitized diagnostics, and source non-mutation evidence without changing the public API.

- [ ] **Step 1: Add failing adversarial option and process tests**

Before implementation changes, add table-driven cases proving every malformed option fails with `invalid_options/options` before a deliberately missing repository path is accessed. Include non-enumerable, accessor, inherited, symbol, URL, NUL, uppercase/short/range/ref tips, offsetless timestamp, NaN/fractional/out-of-range limit, and non-boolean opt-in cases.

Add process cases for missing Git executable via a child process with a controlled empty `PATH`, missing repository, ordinary directory, blob tip, deleted object, partial/promisor configuration, malformed commit object, process timeout, and output overflow. Public assertions must compare only fixed `name`, `message`, `code`, `stage`, and closed details such as `{ field }`, `{ limit }`, or `{ commitIndex }`.

- [ ] **Step 2: Add failing source non-mutation assertions**

Snapshot these values before successful and failed reads:

```ts
interface RepositorySnapshot {
  readonly head: string;
  readonly refs: string;
  readonly index: { readonly size: bigint; readonly mtimeNs: bigint } | null;
  readonly config: { readonly size: bigint; readonly mtimeNs: bigint };
  readonly status: string;
  readonly worktreeEntries: readonly string[];
}
```

Use read-only test helpers to compare `HEAD`, `show-ref`, porcelain status, config/index size and modification time, and recursive worktree entries after normal collection, malformed-object failure, and incompatible-repository failure.

- [ ] **Step 3: Run the focused tests and prove RED**

Run the Task 1 focused Git test command. Expected: the new partial-clone, process-limit, sanitized-error, or non-mutation cases fail until hardening is implemented.

- [ ] **Step 4: Implement fail-closed compatibility and bounds**

Before history traversal, require an existing absolute directory and confirm Git recognizes it as a repository without changing it. Read local configuration only and reject either `extensions.partialClone` or any `remote.*.promisor=true` as `incompatible_repository/open`. Never run a command that contacts a remote, invokes a hook/filter/diff, updates the index, or creates a lock.

Use private exact limits:

```ts
const GIT_PROCESS_TIMEOUT_MS = 5_000;
const GIT_HISTORY_MAX_BYTES = 128 * 1024;
const GIT_OBJECT_BATCH_MAX_BYTES = 8 * 1024 * 1024;
const GIT_COMMIT_MAX_BYTES = 1024 * 1024;
```

Reject a selected history exceeding `limit`, an object batch exceeding its aggregate cap, or any commit exceeding its per-object cap. Convert `ENOENT` for the executable or target to `target_unavailable/open`; incompatible target/tip/object type to `incompatible_repository`; malformed commit metadata to `invalid_commit/history` or `invalid_commit/mapping`; and timeout/output/other bounded read failures to `read_failed/open|history`. Never embed the caught error or stderr in the public object.

- [ ] **Step 5: Prove hardening and conformance GREEN**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --disable-warning=ExperimentalWarning --test tests/git-connector.test.ts
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  npx tsc --noEmit
rg -n "fetch|pull|push|clone|checkout|switch|credential|shell: true" src/connectors/git.ts
```

Expected: tests and TypeScript pass; the scan finds only explicit rejection/safety prose or no match, never an executable network/mutation path.

- [ ] **Step 6: Commit Git hardening**

```bash
git add src/connectors/git.ts tests/git-connector.test.ts
git commit -m "test: harden git connector boundaries"
```

### Task 3: Interoperability Profile and Fixtures

**Files:**
- Create: `spec/interoperability.md`
- Create: `spec/interoperability/0.1.0/profile.json`
- Create: `spec/interoperability/0.1.0/source-records.jsonl`
- Create: `spec/interoperability/0.1.0/portable-cognition.jsonl`
- Create: `spec/interoperability/0.1.0/error-cases.jsonl`
- Create: `tests/interoperability-profile.test.ts`
- Create: `rfcs/0011-cross-connector-interoperability.md`

**Interfaces:**
- Consumes: SourceRecord schema/runtime normalization, Portable Cognition schema/runtime codecs, DomainError stable codes, Git connector `0.1.0`, and team-memory connector `0.1.0`.
- Produces: immutable Interoperability Profile `0.1.0`, fictional cross-source fixtures, exact error cases, rules `CCI-001` onward, and RFC 0011.

- [ ] **Step 1: Write the failing closed-profile and fixture tests**

Create a test-local parser that rejects duplicate JSON object keys before `JSON.parse`, then validates exact own-key sets and frozen normalized values. Require `profile.json` to identify:

```json
{
  "profileVersion": "0.1.0",
  "owner": "collective-cognition-sdk-maintainers",
  "sourceRecordSchemaVersion": "0.1.0",
  "portableCognitionSchemaVersion": "0.1.0"
}
```

Complete the closed profile with exact fixture filenames, connector IDs `git-repository/1` and `teammem-event-ledger/1`, semantic-equivalence rules, extension policy `preserve-or-reject-never-drop`, and non-inference declarations for Decisions, Principles, truth, confidence, readiness, belief, and authorization.

Parse every JSONL line independently. Assert SourceRecord fixtures include both source systems, one source-local duplicate, one source-local revision collision, and no false cross-source collision. Assert Portable Cognition fixtures contain an explicit Goal, explicit Hypothesis, Evidence with provenance from both source systems, one transitioned Hypothesis, matching event, attribution, relationships, timestamps, one preserved unknown namespaced extension, and zero Decision/Principle objects. Assert error cases classify invalid SourceRecord extensions as `INVALID_SOURCE_RECORD` and invalid Portable Cognition extensions as `INVALID_PORTABLE_COGNITION_RECORD`.

- [ ] **Step 2: Run the focused test and prove RED**

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --disable-warning=ExperimentalWarning --test tests/interoperability-profile.test.ts
```

Expected: fail because the profile and fixture files do not exist.

- [ ] **Step 3: Add the minimal normative profile and fictional fixtures**

Write `spec/interoperability.md` with normative `MUST`, `MUST NOT`, and `MAY` rules covering connector independence, canonical semantic equality, generic ingestion, explicit promotion, SourceRecord and Portable Cognition round trips, source-local identity, extension preservation/rejection, error classification, fictional-data hygiene, owner duties, replacement/versioning, and non-certification.

Construct fixtures through existing runtime creators/serializers where possible, then commit the resulting one-record-per-line canonical JSONL. Use only `example.invalid`, fictional person/agent IDs, public source instance names, and fixed timestamps. Do not include a repository path, ledger path, email address, token, or production data.

- [ ] **Step 4: Write RFC 0011 and validate semantic outcomes**

RFC 0011 must record the maintained-local-Git choice, rejection of an exported mapper and plugin registry, exact package/resource subpaths, reference exchange ownership, compatibility effect, privacy and process boundaries, no-Git-CLI decision, acceptance checks, and all explicit deferrals from the design.

Extend the test to feed `source-records.jsonl` through `ingestSourceRecordText(..., { format: "jsonl", mode: "collect-all" })`, assert exact accepted/duplicate/collision statuses, round-trip accepted SourceRecords canonically, and round-trip every valid Portable Cognition record with `serializePortableCognitionRecord` plus `deserializePortableCognitionRecord`. Compare canonical normalized values, not JSON formatting or object identity.

- [ ] **Step 5: Run profile, schema, and conformance tests GREEN**

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --disable-warning=ExperimentalWarning --test \
  tests/interoperability-profile.test.ts \
  tests/schema-conformance.test.mjs \
  tests/portable-cognition-schema.test.mjs \
  tests/portable-cognition-conformance.test.ts
```

Expected: all tests pass with explicit preservation or rejection and no silent extension loss.

- [ ] **Step 6: Commit the profile and fixtures**

```bash
git add spec/interoperability.md spec/interoperability/0.1.0 tests/interoperability-profile.test.ts rfcs/0011-cross-connector-interoperability.md
git commit -m "feat: define interoperability profile"
```

### Task 4: Owned Reference Exchange

**Files:**
- Create: `examples/cross-connector-interoperability.ts`
- Create: `tests/cross-connector-interoperability-example.test.ts`
- Create: `docs/acceptance/cross-connector-interoperability-0.1.0.md`
- Modify: `tests/conformance.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `readGitCommitSourceRecords`, `readTeamMemorySourceRecords`, `ingestSourceRecords`, `createObject`, `promoteSourceRecordsToEvidence`, Portable Cognition create/serialize/deserialize functions, and temporary Git/SQLite sources.
- Produces: `runCrossConnectorInteroperabilityExample(): CrossConnectorInteroperabilityExampleResult` plus a runnable `npm run example:interoperability` demonstration and an evidence report owned by `collective-cognition-sdk-maintainers`.

- [ ] **Step 1: Write the failing exchange example test**

Require the example module to export:

```ts
export interface CrossConnectorInteroperabilityExampleResult {
  readonly sourceRecordCount: number;
  readonly sourceSystems: readonly ["git-repository", "teammem-event-ledger"];
  readonly acceptedRecordCount: number;
  readonly evidenceId: string;
  readonly hypothesisId: "hypothesis:fictional-interoperability";
  readonly portableRecordCount: number;
  readonly semanticRoundTrip: true;
  readonly decisionsInferred: 0;
  readonly principlesInferred: 0;
}

export function runCrossConnectorInteroperabilityExample():
  CrossConnectorInteroperabilityExampleResult;
```

The test must snapshot the process working directory and a sentinel external file, invoke the function twice, and assert stable public result fields, cleanup of each temporary root, no access to user paths, both source systems entering one `ingestSourceRecords([...gitRecords, ...teamMemoryRecords])` call, Evidence provenance containing both systems, exact extension survival, and no Decision/Principle objects.

- [ ] **Step 2: Run the focused example test and prove RED**

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --disable-warning=ExperimentalWarning --test \
  tests/cross-connector-interoperability-example.test.ts
```

Expected: fail because the example module does not exist.

- [ ] **Step 3: Implement the temporary fictional exchange**

Create one temporary root with `mkdtempSync`, initialize a Git repository with fixed identity/timestamps, and create one compatible SQLite event ledger using the exact `events` schema already exercised by the team-memory connector test. Close the database before connector reads. Collect both records with explicit fixed options, combine them once through generic ingestion, create the Goal and Hypothesis explicitly, and use a source-neutral policy whose `map(records)` returns neutral Evidence with `polarity: "neutral"`.

Create Portable Cognition records for the Goal, original Hypothesis, Evidence, transitioned Hypothesis, and matching Cognition Event. Serialize, deserialize, and canonically compare every record. Put one valid unknown namespaced extension on a caller-created object and prove exact preservation. Return counts and stable fictional IDs only; always remove the temporary root in `finally`.

Replace the mapper-only cross-source proof in `tests/conformance.test.ts` with the maintained-connector exchange or remove it when the new example test covers the same assertion. No test may continue presenting `gitCommitToSourceRecord()` plus `teamMemoryEventToSourceRecord()` as evidence that two maintained connectors interoperate.

- [ ] **Step 4: Add the runnable script and acceptance report**

Add:

```json
"example:interoperability": "node --disable-warning=ExperimentalWarning examples/cross-connector-interoperability.ts"
```

Use an `import.meta.url` main guard so importing the function has no side effect. Direct execution prints exactly one JSON line containing `CrossConnectorInteroperabilityExampleResult`; it must not print commit messages, author values, paths, SQLite rows, or environment data.

Write the acceptance report with named owner, fictional-source boundary, exact command, observed source/object counts, semantic matches, declared mismatch/error behavior, migrations (`none` for profile `0.1.0`), no Decision/Principle inference, and a clear statement that this is reference evidence rather than certification or production validation.

- [ ] **Step 5: Run example and connector integration GREEN**

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --disable-warning=ExperimentalWarning --test \
  tests/cross-connector-interoperability-example.test.ts \
  tests/git-connector.test.ts \
  tests/team-memory-connector.test.ts \
  tests/ingestion.test.ts \
  tests/promotion.test.ts \
  tests/portable-cognition.test.ts
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  npm run --silent example:interoperability
```

Expected: all tests pass and direct execution emits one sanitized deterministic JSON object.

- [ ] **Step 6: Commit the owned reference exchange**

```bash
git add examples/cross-connector-interoperability.ts tests/cross-connector-interoperability-example.test.ts tests/conformance.test.ts docs/acceptance/cross-connector-interoperability-0.1.0.md package.json
git commit -m "feat: add cross-connector reference exchange"
```

### Task 5: Package 0.10.0 and Compatibility Evidence

**Files:**
- Create: `spec/compatibility/0.10.0/baseline.json`
- Create: `spec/compatibility/0.10.0/change-cases.jsonl`
- Create: `docs/git-connector-guide.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/compatibility.test.mjs`
- Modify: `tests/package.test.mjs`

**Interfaces:**
- Consumes: verified Git connector, interoperability resources, RFC 0011, acceptance report, and immutable package `0.9.0` baseline.
- Produces: private package `0.10.0`, Git connector subpath, four UTF-8 interoperability resource subpaths, exact declaration closure, clean-consumer coverage, tarball inventory, and immutable `0.10.0` compatibility evidence.

- [ ] **Step 1: Write package and compatibility expectations first**

Require package version `0.10.0`, `private: true`, unchanged root exports/binaries, and these additions:

```json
"./compatibility/0.10.0": "./spec/compatibility/0.10.0/baseline.json",
"./connectors/git/0.1.0": {
  "types": "./dist/connectors/git.d.ts",
  "import": "./dist/connectors/git.js"
},
"./interoperability/0.1.0/profile": "./spec/interoperability/0.1.0/profile.json",
"./interoperability/0.1.0/source-records": "./spec/interoperability/0.1.0/source-records.jsonl",
"./interoperability/0.1.0/portable-cognition": "./spec/interoperability/0.1.0/portable-cognition.jsonl",
"./interoperability/0.1.0/errors": "./spec/interoperability/0.1.0/error-cases.jsonl"
```

Extend clean-consumer TypeScript to import every Git runtime/type export from only its subpath. Extend runtime consumer code to call `import.meta.resolve()` for each profile resource and `readFileSync(fileURLToPath(url), "utf8")`; never use ESM import assertions for JSONL.

- [ ] **Step 2: Run build, package, and compatibility tests and prove RED**

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test:compatibility
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test:package
```

Expected: failures for missing version, export map, built Git declaration, resources, package files, and `0.10.0` baseline.

- [ ] **Step 3: Add package metadata and build inventory**

Bump package and lockfile versions to `0.10.0`. Keep `tsconfig.build.json` unchanged because its existing `src/**/*.ts` include already emits `src/connectors/git.ts`. Add the Git source/test/example to the syntax-check script. Write `docs/git-connector-guide.md` with the exact package import, option table, first-parent ordering, privacy defaults, local Git requirement, stable errors/stages, and non-goals. Add that guide, RFC 0011, interoperability prose/resources, acceptance report, compatibility `0.10.0` files, and required generated declarations to the exact package `files` allowlist. Do not add an executable or root export.

- [ ] **Step 4: Create the immutable 0.10.0 baseline**

Copy `spec/compatibility/0.9.0/baseline.json` to `0.10.0`, then deliberately update current package version, previous-baseline digest, package exports/files, Git declaration closure, interoperability resource digests, RFC/prose/report digests, and two new exact sections:

```json
"gitConnector": {
  "version": "0.1.0",
  "packageSubpath": "./connectors/git/0.1.0",
  "runtimeExports": [
    "GIT_REPOSITORY_FORMAT",
    "GitConnectorError",
    "readGitCommitSourceRecords"
  ],
  "typeExports": [
    "GitCommitSourceRecordOptions",
    "GitConnectorErrorCode",
    "GitConnectorStage"
  ],
  "errorCodes": [
    "incompatible_repository",
    "invalid_commit",
    "invalid_options",
    "read_failed",
    "target_unavailable"
  ]
},
"interoperabilityProfile": {
  "version": "0.1.0",
  "owner": "collective-cognition-sdk-maintainers"
}
```

Create one additive change-case line classifying the package effect as minor-before-1.0, naming the six added package subpaths, confirming no executable or root export change, and retaining all publication/production non-claims.

- [ ] **Step 5: Record exact finalized digests and prove GREEN**

Use `shasum -a 256` for every new normative/resource/document artifact and the unchanged `0.9.0` baseline. Put literal digests in `0.10.0` and exact tests. Run the commands from Step 2, then:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsc --noEmit
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: build, compatibility, package, TypeScript, syntax, declaration closure, clean-consumer, and packed-resource checks all pass.

- [ ] **Step 6: Commit the additive package boundary**

```bash
git add package.json package-lock.json docs/git-connector-guide.md tests/compatibility.test.mjs tests/package.test.mjs spec/compatibility/0.10.0
git commit -m "feat: package interoperability surfaces"
```

### Task 6: Public Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/connector-author-guide.md`
- Modify: `docs/git-connector-guide.md`
- Modify: `docs/public-api.md`
- Modify: `spec/README.md`
- Modify: `spec/compatibility.md`
- Modify: `spec/compatibility/0.10.0/baseline.json`
- Modify: `rfcs/README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/package.test.mjs`
- Modify: `tests/compatibility.test.mjs`
- Modify: `tests/release-readiness.test.ts`
- Modify: `docs/superpowers/plans/2026-08-21-cross-connector-interoperability.md`

**Interfaces:**
- Consumes: verified Tasks 1–5 behavior and exact observed test/package evidence.
- Produces: accurate public package `0.10.0` status, connector usage guidance, resource-consumption guidance, and final Task 6 review, merge, and CI evidence.

**Task 6 documentation and verification status:** Complete. Independent reviews,
pull-request CI, merge, and post-merge `main` CI are verified below.

- [x] **Step 1: Add documentation assertions before prose**

Require all public documents to identify the Git connector as explicit, local, read-only, first-parent, exact-tip, privacy-defaulted, and Git-executable-dependent. Require exact import subpath, resource-resolution examples, owner name, package `0.10.0`, two maintained connector status, no Git CLI, and the non-claims for registry, plugins, network, scheduling, automatic cognition, publication, production, certification, endorsement, and LTS.

- [x] **Step 2: Reconcile every public document**

Update README and public API with the new subpaths and a minimal Git usage example. Add a focused Git connector guide covering installation, exact options, first-parent behavior, privacy defaults, local-only process requirements, error codes/stages, and non-goals. Extend the connector-author guide with Git as a second independent maintained example without making it a required architecture for external connectors. Index RFC 0011 and Interoperability Profile `0.1.0`. Update the changelog and compatibility prose for additive `0.10.0`. Before merge, describe Phase 5 as locally verified with merge/post-merge CI pending; leave Phase 6 planned.

Add `npm run example:interoperability` to the CI distribution job after the other source-free examples and before `pack:check`. Do not alter the immutable GitHub prerelease workflow or its historical `0.6.0` asset identity in this slice.

Document resource consumption exactly:

```ts
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const sourceRecordsUrl = import.meta.resolve(
  "collective-cognition-sdk/interoperability/0.1.0/source-records",
);
const sourceRecordsJsonl = readFileSync(
  fileURLToPath(sourceRecordsUrl),
  "utf8",
);
```

- [x] **Step 3: Run focused documentation and complete local gates**

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsc --noEmit
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example:portable
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example:host
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example:markdown
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example:workflow
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example:interoperability
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run pack:check
git diff --check
```

Expected: zero failures. Record exact pass/skip counts and capability-limited skips; do not convert skips into passes or production claims.

Run the same `npm test`, `npx tsc --noEmit`, and `npm run check` gates under locally available Node.js `24.9.0`, `24.14.0`, and `24.19.0` runtimes. The pull request and post-merge CI must then prove the full Linux/macOS/Windows matrix declared in `.github/workflows/ci.yml`; local single-OS evidence never substitutes for that matrix.

Observed current-head final-review evidence: Node.js `24.19.0` passed `587` tests with `10` capability/context skips and zero failures: source `536` passed and `10` skipped, schema `10` passed, compatibility `27` passed, and package `14` passed. Node.js `24.9.0` passed `522` tests with `76` capability/context skips and zero failures: source `471` passed and `76` skipped, schema `10` passed, compatibility `27` passed, and package `14` passed. TypeScript and `npm run check` passed under both available runtimes. Node.js `24.14.0` was not locally installed, so its required evidence remains assigned to CI rather than being misreported as local. All eight example scripts, including the temporary synthetic Team Memory and durable Team Memory lanes, plus `pack:check` passed under Node.js `24.19.0`.

- [x] **Step 4: Verify historical immutability and exact package contents**

Compare every pre-existing file under `spec/compatibility/0.1.0` through `0.9.0`, `spec/conformance/0.1.0`, `spec/schemas/0.1.0`, `spec/runtime-security/0.1.0`, and `spec/distribution-readiness/0.1.0` byte-for-byte against `main`. Run `npm pack --dry-run --json` with an isolated temporary cache and compare exact expected/missing/unexpected paths. Confirm the root API and all existing binaries/subpaths remain unchanged.

Observed local evidence: all `27` historical files were byte-identical to `main`; the dry-run package contained exactly `136` expected files (`72` under `dist/`) with zero missing and zero unexpected paths; the root export, all `27` historical export subpaths, and all four existing binaries remained unchanged. The immutable GitHub prerelease workflow remained byte-identical to `main` with SHA-256 `b628e8e07829bd115a01133595d4f3424e0634e7479f9f00c35bc4e5c9a8508f`.

- [x] **Step 5: Run required independent reviews**

Give fresh reviewers the approved design, this plan, `main...HEAD` diff, Git process/environment inventory, profile fixtures, compatibility baseline, package dry-run inventory, and full test output. Run separate specification/code, security/privacy, and whole-branch reviews. Fix every Critical or Important finding, rerun affected tests plus the full gate, and request residual review until no unresolved Critical or Important finding remains.

Observed review evidence: all task-level specification and quality reviews completed without unresolved Critical or Important findings. The final whole-branch review initially found one Critical, two Important, and one Minor issue; commit `f2e605134d8589daf3269e6c5a79a90f712c6a40` corrected them. A fresh whole-branch review and the later scoped cross-platform CI-fix review both returned `0` Critical, `0` Important, and `0` Minor findings.

- [x] **Step 6: Record final evidence and close the feature branch**

Update this plan and roadmap only with observed evidence. Commit the final reconciliation with:

```bash
git add README.md CHANGELOG.md .github/workflows/ci.yml docs spec rfcs tests/package.test.mjs tests/release-readiness.test.ts
git commit -m "docs: complete cross-connector interoperability"
```

Push `feature/cross-connector-interoperability`, open a Conventional Commit-titled pull request, require all CI matrix jobs to pass, merge to `main`, pull the merged commit locally, rerun `git status --short --branch`, and verify the post-merge Actions run before deleting the local and remote feature branch/worktree. Only after that evidence exists, use a small follow-up documentation branch to mark Phase 5 **Complete** and record the merged commit and post-merge run. The documentation branch's own merge is repository closeout, not evidence required to make the already-observed Phase 5 acceptance true.

Observed final evidence: `f149805fcb366ba01255499abbf63746f9dda421` records the Task 6 documentation reconciliation; `cdc9e868bd6fe5b69ad5d0da6aacbd4c58b0cf64` fixes the macOS and Git-for-Windows CI portability findings. [Pull request #13](https://github.com/xiongxhc/collective-cognition-sdk/pull/13) passed [CI run `32483502879`](https://github.com/xiongxhc/collective-cognition-sdk/actions/runs/32483502879) and merged to `main` at `8556ee8ab2e7db05d5dbaa72fe1d544665b2b133`. [Post-merge run `32483677646`](https://github.com/xiongxhc/collective-cognition-sdk/actions/runs/32483677646) passed distribution verification and every declared Ubuntu, macOS, and Windows lane. The obsolete feature worktree and local and remote feature branches were removed. This follow-up documentation branch records Phase 5 Complete without changing the private, unpublished, or production-readiness boundaries.
