# Host Integration Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a testable, storage-neutral host boundary that atomically persists cognition, publishes committed events idempotently, and exposes safe retry behavior without selecting a database or queue.

**Architecture:** `src/host-integration.ts` owns the public ports, validation, sanitized outcomes, and store-first coordinators. `src/reference-host.ts` provides an in-memory store and publisher, while `src/host-conformance.ts` packages reusable behavioral checks for third-party adapters. Every host boundary carries validated Portable Cognition records; source stores and source connectors remain outside these interfaces.

**Tech Stack:** TypeScript 7, Node.js 24 ESM, `node:test`, existing Portable Cognition runtime, npm package exports, compatibility baselines.

## Global Constraints

- Host Integration Contract version is exactly `0.1.0`.
- Package and compatibility baseline version become exactly `0.3.0`.
- Package remains `"private": true` and unpublished.
- Persistence and publication remain separate ports.
- A transition store commit atomically persists its next object and matching event.
- Persistence runs before publication.
- Publication failure returns `committed_but_unpublished`; it never claims rollback.
- Event payload `id` is the publication idempotency key.
- Exact commit replays are idempotent; identity reuse with different canonical content conflicts.
- Store conflicts are outcomes; invalid requests throw a stable SDK domain error.
- Unexpected adapter failures are sanitized and never expose raw messages, stacks, paths, credentials, or host-private details.
- The cognition store accepts no `SourceRecord` and performs no source-ledger mutation.
- No SQL, Git, queue, service, network, framework, or runtime dependency is added.
- Existing `0.1.0` and `0.2.0` normative artifacts and compatibility baselines remain byte-identical.
- Public root APIs remain source-neutral.

---

### Task 1: Host Ports and Initial Commit

**Files:**
- Create: `src/host-integration.ts`
- Create: `tests/host-integration.test.ts`
- Modify: `src/errors.ts`
- Modify: `src/index.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PortableCognitionRecord`, `createPortableCognitionRecord`, and `serializePortableCognitionRecord` from `src/portable-cognition.ts`.
- Produces:

```ts
export const HOST_INTEGRATION_CONTRACT_VERSION = "0.1.0";

export type PortableCognitiveObjectRecord =
  PortableCognitionRecord<"cognitive-object">;

export type PortableCognitionEventRecord =
  PortableCognitionRecord<"cognition-event">;

export type CognitionPersistenceStatus =
  | "committed"
  | "already_committed";

export type CognitionPublicationStatus =
  | "published"
  | "already_published";

export type HostConflictCode =
  | "version_conflict"
  | "object_revision_collision"
  | "event_id_collision";

export interface HostConflict {
  readonly code: HostConflictCode;
  readonly objectId: string;
  readonly expectedVersion?: number;
  readonly actualVersion?: number;
}

export const HostFailureCode = {
  COMMIT_FAILED: "HOST_COMMIT_FAILED",
  PUBLICATION_FAILED: "HOST_PUBLICATION_FAILED",
} as const;

export type HostFailureCode =
  (typeof HostFailureCode)[keyof typeof HostFailureCode];

export interface HostFailure {
  readonly code: HostFailureCode;
  readonly message: string;
  readonly objectId: string;
  readonly eventId?: string;
}

export interface InitialCognitionCommit {
  readonly object: PortableCognitiveObjectRecord;
}

export interface TransitionCognitionCommit {
  readonly expectedVersion: number;
  readonly object: PortableCognitiveObjectRecord;
  readonly event: PortableCognitionEventRecord;
}

export type CognitionStoreCommitResult =
  | { readonly status: CognitionPersistenceStatus }
  | { readonly status: "conflict"; readonly conflict: HostConflict };

export interface CognitionStore {
  commitInitial(
    request: InitialCognitionCommit,
  ): Promise<CognitionStoreCommitResult>;

  commitTransition(
    request: TransitionCognitionCommit,
  ): Promise<CognitionStoreCommitResult>;

  getLatestObject(
    objectId: string,
  ): Promise<PortableCognitiveObjectRecord | undefined>;

  getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined>;

  listObjectEvents(
    objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]>;
}

export type InitialCommitOutcome =
  | {
      readonly status: "committed";
      readonly persistence: CognitionPersistenceStatus;
      readonly object: PortableCognitiveObjectRecord;
    }
  | { readonly status: "conflict"; readonly conflict: HostConflict }
  | { readonly status: "failed"; readonly error: HostFailure };

export function commitInitialCognition(
  store: CognitionStore,
  request: InitialCognitionCommit,
): Promise<InitialCommitOutcome>;
```

- Adds `DomainErrorCode.INVALID_HOST_INTEGRATION_REQUEST`.

- [ ] **Step 1: Write failing initial-commit tests**

Add tests that use a minimal recording `CognitionStore` and assert:

```ts
test("commits a validated initial cognitive object", async () => {
  const store = recordingStore({ status: "committed" });
  const outcome = await commitInitialCognition(store, {
    object: portableGoalRecord({ version: 1 }),
  });

  assert.equal(outcome.status, "committed");
  assert.equal(outcome.persistence, "committed");
  assert.equal(store.initialCalls.length, 1);
  assert.equal(Object.isFrozen(store.initialCalls[0].object), true);
});

test("rejects non-version-one initial objects before host invocation", async () => {
  const store = recordingStore({ status: "committed" });

  await assert.rejects(
    commitInitialCognition(store, {
      object: portableGoalRecord({ version: 2 }),
    }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.INVALID_HOST_INTEGRATION_REQUEST,
  );
  assert.equal(store.initialCalls.length, 0);
});
```

Also cover:

- an exact `already_committed` store result;
- a `conflict` result passed through unchanged;
- a store that mutates its received request cannot mutate the caller's request or returned outcome;
- a hostile accessor or stateful proxy is rejected before host invocation; and
- a thrown store error containing `HOST_COMMIT_SECRET` becomes `{ status: "failed", error: { code: "HOST_COMMIT_FAILED", message: "Cognition commit failed.", objectId } }` without the secret.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/host-integration.test.ts
```

Expected: FAIL because `commitInitialCognition`, host types, and `INVALID_HOST_INTEGRATION_REQUEST` do not exist.

- [ ] **Step 3: Implement the minimal initial host boundary**

In `src/host-integration.ts`:

- define the interfaces above;
- snapshot `request.object` exactly once through `createPortableCognitionRecord`;
- require `recordType === "cognitive-object"` and `payload.version === 1`;
- freeze a fresh request passed to the store;
- preserve only exact closed store results;
- validate and clone conflict fields before returning them;
- convert every unexpected adapter throw into the fixed safe `HostFailure`; and
- never retain a host-returned mutable alias.

Do not export generic snapshot helpers or accept `SourceRecord`.

In `src/errors.ts`, append:

```ts
INVALID_HOST_INTEGRATION_REQUEST: "INVALID_HOST_INTEGRATION_REQUEST",
```

In `src/index.ts`, export the constant, coordinator, and public host types. Add the new source and test files to `npm run check`.

- [ ] **Step 4: Run focused tests and type checking**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/host-integration.test.ts
npx tsc --noEmit
npm run check
```

Expected: all commands pass.

- [ ] **Step 5: Commit the initial host boundary**

```bash
git add src/host-integration.ts src/errors.ts src/index.ts tests/host-integration.test.ts package.json
git commit -m "feat: add cognition persistence port"
```

---

### Task 2: Transition Commit and Publication

**Files:**
- Modify: `src/host-integration.ts`
- Modify: `src/index.ts`
- Modify: `tests/host-integration.test.ts`

**Interfaces:**
- Consumes: `CognitionStore`, `TransitionCognitionCommit`, `HostFailure`, and portable record aliases from Task 1.
- Produces:

```ts
export interface CognitionEventPublisher {
  publish(
    event: PortableCognitionEventRecord,
    options: { readonly idempotencyKey: string },
  ): Promise<CognitionPublicationStatus>;
}

export interface CognitionHost {
  readonly store: CognitionStore;
  readonly publisher: CognitionEventPublisher;
}

export type TransitionCommitOutcome =
  | {
      readonly status: "committed";
      readonly persistence: CognitionPersistenceStatus;
      readonly publication: CognitionPublicationStatus;
      readonly object: PortableCognitiveObjectRecord;
      readonly event: PortableCognitionEventRecord;
    }
  | {
      readonly status: "committed_but_unpublished";
      readonly persistence: CognitionPersistenceStatus;
      readonly object: PortableCognitiveObjectRecord;
      readonly event: PortableCognitionEventRecord;
      readonly error: HostFailure;
    }
  | { readonly status: "conflict"; readonly conflict: HostConflict }
  | { readonly status: "failed"; readonly error: HostFailure };

export function commitCognitionTransition(
  host: CognitionHost,
  request: TransitionCognitionCommit,
): Promise<TransitionCommitOutcome>;
```

- [ ] **Step 1: Write failing transition and publication tests**

Add tests asserting:

```ts
test("stores a transition before publishing its event", async () => {
  const calls: string[] = [];
  const host = recordingHost({
    onCommit: () => calls.push("commit"),
    onPublish: () => calls.push("publish"),
  });

  const request = portableTransitionCommit();
  const outcome = await commitCognitionTransition(host, request);

  assert.equal(outcome.status, "committed");
  assert.deepEqual(calls, ["commit", "publish"]);
  assert.equal(host.publishCalls[0].options.idempotencyKey, request.event.payload.id);
});
```

Also cover:

- `object.payload.version === expectedVersion + 1`;
- event object ID, type, version, next state, and occurrence time match the object;
- `expectedVersion` is a positive safe integer;
- every inconsistent request fails before either adapter is invoked;
- store `conflict` prevents publication;
- store throw returns `failed` and prevents publication;
- publisher `"published"` and `"already_published"` pass through;
- publisher throw after commit returns `committed_but_unpublished`;
- the partial-success result retains frozen object and event records;
- raw publisher error text containing `HOST_PUBLICATION_SECRET` is absent; and
- retrying the identical request after publication failure allows store `already_committed` followed by publication success.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/host-integration.test.ts
```

Expected: FAIL because transition coordination and publisher types are missing.

- [ ] **Step 3: Implement store-first transition coordination**

In `src/host-integration.ts`:

- validate and snapshot object and event records once;
- validate every cross-record invariant before host invocation;
- call `store.commitTransition` exactly once;
- return `conflict` without calling the publisher;
- call `publisher.publish` only after `committed` or `already_committed`;
- pass a frozen `{ idempotencyKey: event.payload.id }`;
- accept only `"published"` or `"already_published"`;
- return `committed_but_unpublished` for every publisher rejection, invalid result, or throw;
- return `failed` for every store rejection, invalid result, or throw; and
- return detached, deeply frozen records derived from the pre-host snapshots.

Export the new runtime and type API through `src/index.ts`.

- [ ] **Step 4: Run focused and regression tests**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/host-integration.test.ts tests/portable-cognition.test.ts tests/transitions.test.ts
npx tsc --noEmit
```

Expected: all commands pass.

- [ ] **Step 5: Commit transition coordination**

```bash
git add src/host-integration.ts src/index.ts tests/host-integration.test.ts
git commit -m "feat: coordinate cognition commits and publication"
```

---

### Task 3: In-Memory Reference Host

**Files:**
- Create: `src/reference-host.ts`
- Create: `tests/reference-host.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 and Task 2 host interfaces and `serializePortableCognitionRecord`.
- Produces:

```ts
export class InMemoryCognitionStore implements CognitionStore {
  commitInitial(
    request: InitialCognitionCommit,
  ): Promise<CognitionStoreCommitResult>;
  commitTransition(
    request: TransitionCognitionCommit,
  ): Promise<CognitionStoreCommitResult>;
  getLatestObject(
    objectId: string,
  ): Promise<PortableCognitiveObjectRecord | undefined>;
  getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined>;
  listObjectEvents(
    objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]>;
}

export class InMemoryCognitionEventPublisher
  implements CognitionEventPublisher {
  publish(
    event: PortableCognitionEventRecord,
    options: { readonly idempotencyKey: string },
  ): Promise<CognitionPublicationStatus>;
  publishedEvents(): readonly PortableCognitionEventRecord[];
}
```

- [ ] **Step 1: Write failing store tests**

Add tests for:

- new version-1 object commit and latest/version read-back;
- exact initial replay returns `already_committed`;
- same object ID/version with changed canonical content returns `object_revision_collision`;
- transition commit writes object and event together;
- latest object advances while prior object versions remain readable;
- exact transition replay returns `already_committed`;
- stale expected version returns `version_conflict`;
- target revision collision returns `object_revision_collision`;
- event ID collision returns `event_id_collision`;
- failed commit exposes neither new object nor event;
- events read in object-version order;
- caller mutation after commit cannot alter stored values; and
- mutation attempts against read results cannot alter subsequent reads.

Add publisher tests for:

- first publish returns `published`;
- exact replay returns `already_published`;
- same idempotency key with changed event content rejects;
- `publishedEvents()` is ordered by first acceptance; and
- returned events are detached and deeply frozen.

- [ ] **Step 2: Run the reference-host test and confirm RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/reference-host.test.ts
```

Expected: FAIL because the reference classes do not exist.

- [ ] **Step 3: Implement the reference host**

Use private `Map` instances keyed by:

- object ID to latest version;
- `${objectId}\u0000${version}` to canonical object record;
- event ID to canonical event record; and
- publication idempotency key to canonical event record.

Use `serializePortableCognitionRecord` for exact replay equality. Validate and clone on every write and read. Stage all transition checks before mutating any map so commit remains atomic in one process.

Do not add persistence, timers, global state, filesystem access, fault injection to the public constructor, or source-record methods.

Add both new files to `npm run check`. Do not export the reference classes from the package root.

- [ ] **Step 4: Run focused tests and type checking**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/reference-host.test.ts tests/host-integration.test.ts
npx tsc --noEmit
npm run check
```

Expected: all commands pass.

- [ ] **Step 5: Commit the reference host**

```bash
git add src/reference-host.ts tests/reference-host.test.ts package.json
git commit -m "feat: add in-memory cognition host"
```

---

### Task 4: Reusable Host Conformance Harness

**Files:**
- Create: `src/host-conformance.ts`
- Create: `tests/host-conformance.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all public host interfaces and reference classes.
- Produces:

```ts
export interface CognitionHostConformanceFactory {
  readonly createStore: () => CognitionStore | Promise<CognitionStore>;
  readonly createPublisher:
    () => CognitionEventPublisher | Promise<CognitionEventPublisher>;
}

export interface CognitionHostConformanceCaseResult {
  readonly id: string;
  readonly status: "passed" | "failed";
  readonly message?: string;
}

export interface CognitionHostConformanceReport {
  readonly contractVersion: "0.1.0";
  readonly passed: boolean;
  readonly cases: readonly CognitionHostConformanceCaseResult[];
}

export function runCognitionHostConformance(
  factory: CognitionHostConformanceFactory,
): Promise<CognitionHostConformanceReport>;
```

- [ ] **Step 1: Write failing harness tests**

Add:

```ts
test("the in-memory host passes every host conformance case", async () => {
  const report = await runCognitionHostConformance({
    createStore: () => new InMemoryCognitionStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });

  assert.equal(report.passed, true);
  assert.equal(report.cases.every(({ status }) => status === "passed"), true);
});

test("a non-atomic host fails the atomicity case without aborting the suite", async () => {
  const report = await runCognitionHostConformance(brokenAtomicityFactory());

  assert.equal(report.passed, false);
  assert.equal(
    report.cases.find(({ id }) => id === "HIC-CONF-007")?.status,
    "failed",
  );
});
```

Also prove:

- every case gets a fresh store or publisher when isolation requires it;
- one case failure does not prevent later cases from running;
- thrown adapter errors become safe fixed harness messages;
- report arrays and entries are frozen;
- no case requests SourceRecord behavior; and
- the harness contains cases for initial commit/read, replay, collision, transition atomicity, stale version, event collision, immutable reads, publisher replay, publisher collision, partial success, and retry recovery.

- [ ] **Step 2: Run the harness test and confirm RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/host-conformance.test.ts
```

Expected: FAIL because the conformance API is missing.

- [ ] **Step 3: Implement isolated conformance cases**

Implement named cases `HIC-CONF-001` onward as small async functions. Use only public port behavior and Portable Cognition records created by the existing runtime. Catch each case separately and emit a fixed safe failure message such as `"Host conformance case failed."`; never return adapter exception text.

The harness must not import `src/reference-host.ts`; its test supplies the reference host through the public factory. Add the new source and test files to `npm run check`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/host-conformance.test.ts tests/reference-host.test.ts tests/host-integration.test.ts
npx tsc --noEmit
```

Expected: all commands pass, and the deliberately broken host produces a failed report rather than a test-process crash.

- [ ] **Step 5: Commit the conformance harness**

```bash
git add src/host-conformance.ts tests/host-conformance.test.ts package.json
git commit -m "feat: add host conformance harness"
```

---

### Task 5: Normative Contract and RFC

**Files:**
- Create: `spec/host-integration.md`
- Create: `rfcs/0004-host-integration-contract.md`
- Modify: `spec/README.md`
- Modify: `rfcs/README.md`
- Modify: `tests/host-conformance.test.ts`

**Interfaces:**
- Consumes: implemented public behavior from Tasks 1–4.
- Produces: Normative Stable rules `HIC-001` through `HIC-016`, with each rule mapped to runtime validation, a conformance case, or an explicit prose-only rationale.

- [ ] **Step 1: Write failing normative-artifact tests**

Add tests that read `spec/host-integration.md` and assert:

```ts
const expectedRuleIds = Array.from(
  { length: 16 },
  (_, index) => `HIC-${String(index + 1).padStart(3, "0")}`,
);

assert.deepEqual(extractRuleIds(hostContractText), expectedRuleIds);
assert.match(hostContractText, /Contract version: `0\\.1\\.0`/);
assert.match(hostContractText, /committed_but_unpublished/);
assert.match(hostContractText, /SourceRecord MUST NOT/);
```

Assert every rule appears exactly once in the normative-rules table and exactly once in the rule-to-check mapping. Assert the RFC and both indexes link the final filenames.

- [ ] **Step 2: Run the normative-artifact test and confirm RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/host-conformance.test.ts
```

Expected: FAIL because the normative prose and RFC are absent.

- [ ] **Step 3: Write the normative Host Integration Contract**

Define:

- `HIC-001`: version and applicability;
- `HIC-002`: Portable Cognition-only boundary;
- `HIC-003`: detached immutable snapshots;
- `HIC-004`: initial version and object identity;
- `HIC-005`: exact initial replay;
- `HIC-006`: transition cross-record consistency;
- `HIC-007`: atomic object-and-event visibility;
- `HIC-008`: optimistic concurrency;
- `HIC-009`: revision and event identity collision behavior;
- `HIC-010`: persistence-before-publication order;
- `HIC-011`: event-ID publication idempotency;
- `HIC-012`: committed-but-unpublished semantics;
- `HIC-013`: identical-request recovery;
- `HIC-014`: safe host failures;
- `HIC-015`: read ordering and detached values; and
- `HIC-016`: source-store separation and explicit targets.

Use `MUST`, `MUST NOT`, `SHOULD`, and `MAY` consistently. State that at-least-once attempts do not guarantee exactly-once downstream effects.

Write RFC 0004 with accepted semantics, rejected alternatives, compatibility impact, security boundaries, acceptance checks, and explicit deferrals. Update both indexes without promoting implementation to final-review verified yet.

- [ ] **Step 4: Run contract and source tests**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/host-conformance.test.ts tests/host-integration.test.ts tests/reference-host.test.ts
git diff --check
```

Expected: all commands pass.

- [ ] **Step 5: Commit normative artifacts**

```bash
git add spec/host-integration.md spec/README.md rfcs/0004-host-integration-contract.md rfcs/README.md tests/host-conformance.test.ts
git commit -m "docs: specify host integration contract"
```

---

### Task 6: Package and Compatibility Baseline 0.3.0

**Files:**
- Create: `spec/compatibility/0.3.0/baseline.json`
- Create: `spec/compatibility/0.3.0/change-cases.jsonl`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/package.test.mjs`
- Modify: `tests/compatibility.test.mjs`

**Interfaces:**
- Consumes: root host API, `dist/reference-host.*`, `dist/host-conformance.*`, normative prose, RFC 0004.
- Produces package subpaths:

```json
{
  "./contracts/host-integration/0.1.0": "./spec/host-integration.md",
  "./host-conformance/0.1.0": {
    "types": "./dist/host-conformance.d.ts",
    "import": "./dist/host-conformance.js"
  },
  "./reference-host/0.1.0": {
    "types": "./dist/reference-host.d.ts",
    "import": "./dist/reference-host.js"
  },
  "./compatibility/0.3.0": "./spec/compatibility/0.3.0/baseline.json"
}
```

- [ ] **Step 1: Write failing package and compatibility assertions**

Update package tests to expect:

- package and lockfile version `0.3.0`;
- the four subpaths above;
- root runtime exports `HOST_INTEGRATION_CONTRACT_VERSION`, `HostFailureCode`, `commitInitialCognition`, and `commitCognitionTransition`;
- root declaration exports for every Task 1 and Task 2 public type;
- clean-consumer imports from root, host conformance, and reference-host subpaths;
- resolution and readable content of the contract Markdown subpath;
- RFC 0004, host prose, compatibility `0.3.0`, and change cases in the exact tarball allowlist;
- no source tests, design documents, connector entrypoints, or adapters in the tarball; and
- `"private": true`.

Update compatibility tests so:

- baselines `0.1.0` and `0.2.0` retain their current exact SHA-256 hashes;
- `0.3.0` is the current additive baseline;
- Host Integration `0.1.0` rule IDs, prose digest, contract subpath, runtime exports, type exports, error code, declaration closure, and emitted files match the baseline; and
- a change case classifies adding the host boundary as additive with a minor package effect.

- [ ] **Step 2: Run package tests and confirm RED**

Run:

```bash
npm run build
npm run test:compatibility
npm run test:package
```

Expected: FAIL because package version `0.3.0`, new subpaths, and baseline artifacts are missing.

- [ ] **Step 3: Add package subpaths and version**

Run:

```bash
npm version 0.3.0 --no-git-tag-version
```

Update `package.json` files and exports exactly as specified. Include:

- `rfcs/0004-host-integration-contract.md`;
- `spec/host-integration.md`;
- both compatibility `0.3.0` artifacts.

Do not add `src/`, `tests/`, `examples/`, `docs/`, or connector files to the package allowlist.

- [ ] **Step 4: Create baseline 0.3.0 and change cases**

Copy the `0.2.0` baseline structure, retain all historical normative identities, and add:

- historical baseline `0.2.0` with SHA-256 `3da00ab49c1f3b02bfc19226545dce68379546641f418993f632851b8c49ddc4`;
- `normative.hostIntegration` with contract version, prose path, prose digest, all 16 rule IDs, and package subpaths;
- new runtime and type exports;
- `INVALID_HOST_INTEGRATION_REQUEST` in package error codes and Normative Stable error codes;
- new emitted and declaration files;
- package metadata version-independent fields and exact exports;
- unchanged CLI and policy identities; and
- no deprecations.

Create one additive host-integration change case and retain one breaking root-export removal example.

Generate exact artifact and declaration hashes from built files:

```bash
shasum -a 256 spec/host-integration.md spec/compatibility/0.3.0/change-cases.jsonl
npm run build
npm run test:compatibility
```

When the compatibility test reports the newly calculated declaration digest, independently recompute it with the test helper logic before recording it. Do not modify historical baseline files to make tests pass.

- [ ] **Step 5: Run package and clean-consumer checks**

Run:

```bash
npm run build
npm run test:compatibility
npm run test:package
npm run pack:check
```

Expected: all commands pass, the clean consumer typechecks and imports all three runtime entrypoints, and the tarball equals the approved allowlist.

- [ ] **Step 6: Commit package stabilization**

```bash
git add package.json package-lock.json tests/package.test.mjs tests/compatibility.test.mjs spec/compatibility/0.3.0
git commit -m "feat: package host integration contract"
```

---

### Task 7: Example and Public Documentation

**Files:**
- Create: `examples/host-integration.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `spec/README.md`
- Modify: `docs/superpowers/specs/2026-07-28-host-integration-contract-design.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: root coordinators plus the reference-host package subpath.
- Produces: one runnable demonstration of create, transition, publish failure, and identical-request recovery.

- [ ] **Step 1: Write the failing example expectation**

The example must print one JSON object with:

```json
{
  "initial": "committed",
  "firstTransition": "committed_but_unpublished",
  "retryTransition": "committed",
  "latestVersion": 2,
  "storedEventCount": 1,
  "publishedEventCount": 1
}
```

Add an npm script:

```json
"example:host": "node --disable-warning=ExperimentalWarning examples/host-integration.ts"
```

Add the example to `npm run check`.

- [ ] **Step 2: Run the example and confirm RED**

Run:

```bash
npm run example:host
```

Expected: FAIL because the example and script do not exist.

- [ ] **Step 3: Implement the host example**

Use:

- `createObject` and `transitionObject`;
- `createPortableCognitionRecord`;
- `commitInitialCognition` and `commitCognitionTransition`;
- `InMemoryCognitionStore`; and
- a local publisher wrapper that fails its first call and delegates retries to `InMemoryCognitionEventPublisher`.

Reuse the exact same transition request for recovery. Do not rerun `transitionObject` or generate a new event ID.

- [ ] **Step 4: Update public documentation**

Update README architecture and usage to explain:

```text
source connector → SourceRecord → explicit promotion → Portable Cognition
                                                ↓
                                      host CognitionStore
                                                ↓
                                  CognitionEventPublisher
```

State:

- the SDK does not own a database;
- team-memory-agent will implement or compose these ports later;
- individual memory collectors do not need the cognition host unless they promote material into shared cognition;
- publication failure is observable and retryable;
- the package is private, unpublished, and not production-ready.

Update `ROADMAP.md` only with behavior actually verified in this branch. Keep Phase 4 team-memory and persistence adapters unchecked. Reconcile `spec/README.md` and mark the design document implemented only after all focused tests pass.

- [ ] **Step 5: Run examples and documentation checks**

Run:

```bash
npm run example
npm run example:portable
npm run example:host
git diff --check
```

Expected: all commands pass and the host example prints the exact result above.

- [ ] **Step 6: Commit documentation and example**

```bash
git add examples/host-integration.ts README.md ROADMAP.md spec/README.md docs/superpowers/specs/2026-07-28-host-integration-contract-design.md package.json
git commit -m "docs: explain cognition host integration"
```

---

### Task 8: Review, Verification, and Delivery

**Files:**
- Modify only files required to fix verified Host Integration Contract defects.
- Modify: `ROADMAP.md` and `docs/superpowers/specs/2026-07-28-host-integration-contract-design.md` only after final evidence exists.

**Interfaces:**
- Consumes: the complete implementation and all repository checks.
- Produces: reviewed, verified branch ready to merge.

- [ ] **Step 1: Run focused host verification**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/host-integration.test.ts tests/reference-host.test.ts tests/host-conformance.test.ts
```

Expected: all host tests pass.

- [ ] **Step 2: Run the full local matrix**

Run:

```bash
npm test
npx tsc --noEmit
npm run check
npm run example
npm run example:portable
npm run example:host
npm run pack:check
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 3: Perform independent code review**

Review for:

- incomplete atomicity;
- false rollback claims;
- publication before persistence;
- duplicate event or revision creation on retry;
- unsafe optimistic-concurrency behavior;
- raw adapter error leakage;
- mutable aliases crossing host boundaries;
- inconsistent Portable Cognition cross-record fields;
- SourceRecord or team-memory coupling;
- package subpath or declaration drift;
- historical baseline mutation; and
- documentation claims exceeding measured evidence.

Classify findings as Critical, Important, or Minor. Fix all Critical and Important findings using focused failing regression tests before implementation changes.

- [ ] **Step 4: Re-run the complete matrix after review fixes**

Run every command from Step 2 again. Record exact test counts and compatibility hashes in `ROADMAP.md`. Change the design status to `Implemented and final-review verified` only after all checks pass.

- [ ] **Step 5: Commit final review corrections**

```bash
git add -A
git commit -m "fix: address host integration final review"
```

Skip this commit when review produces no file changes.

- [ ] **Step 6: Commit final verification documentation**

```bash
git add ROADMAP.md docs/superpowers/specs/2026-07-28-host-integration-contract-design.md
git commit -m "docs: finalize host integration contract"
```

- [ ] **Step 7: Merge, push, and clean up**

Verify the feature branch is clean and ahead only by the intended commits. Merge it into `master` using the repository's established non-`codex/` workflow, push `master`, verify `master == origin/master`, delete the merged local and remote feature branch, and rerun the focused host test from `master`.
