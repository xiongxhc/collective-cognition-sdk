# Durable Cognition Workflow 0.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one source-neutral, replay-safe workflow that prepares an explicit Hypothesis and neutral Evidence, commits the complete cognition atomically to SQLite, optionally publishes and projects it, and exposes the flow through a closed CLI.

**Architecture:** The workflow subpath owns validation, deterministic preparation, orchestration, result classification, and host conformance. A separate SQLite workflow store implements the optional atomic multi-object capability with schema version `2`; the CLI binds canonical files to that store and the existing Markdown adapter without importing any connector.

**Tech Stack:** TypeScript 7, Node.js `>=24`, `node:test`, `node:assert/strict`, `node:sqlite`, ESM, JSON/JSONL, existing SourceRecord, Portable Cognition, Host Integration, SQLite, and Markdown contracts.

**Spec:** `docs/superpowers/specs/2026-08-13-durable-cognition-workflow-design.md`

## Global Constraints

- Keep the root runtime and type exports unchanged; all workflow APIs live under `collective-cognition-sdk/workflows/durable/0.1.0`.
- Keep Team Memory, Git, source-ledger schemas, connector execution, model calls, and semantic inference out of the workflow implementation.
- Require an explicit version-`1`, `proposed` Hypothesis and explicit transition context; infer no Goal, Decision, Principle, authority, or attribution.
- Prepare and validate the entire workflow before opening a store, publisher, Markdown target, or any other mutable resource.
- Commit the initial Hypothesis, Evidence, transitioned Hypothesis, event, workflow ID, and request digest atomically.
- Treat SQLite schema version `1` as read/write compatible with `SqliteCognitionStore`; require a newly created schema version `2` database for `SqliteCognitionWorkflowStore`; perform no implicit migration.
- Treat publication and Markdown as optional downstream stages with explicit `not_requested` states and no delivery guarantee.
- Accept only explicit absolute paths in the CLI; discover no home directory, repository, vault, source ledger, or environment-default data path.
- Keep package `0.9.0` private and npm-unpublished; do not alter historical versioned artifacts or the immutable `v0.6.0` prerelease.
- Use Node `24.9.0` for local development commands and verify the final result against the existing CI matrix.
- Follow TDD for every behavior: observe a focused failure, implement the smallest passing behavior, then run the focused and adjacent suites.

---

### Task 1: Durable Workflow Contract and Deterministic Preparation

**Files:**
- Create: `src/workflows/durable-contract.ts`
- Create: `src/workflows/durable-prepare.ts`
- Create: `src/workflows/durable.ts`
- Create: `tests/durable-workflow-prepare.test.ts`
- Modify: `src/errors.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SourceRecord`, `EvidencePromotionPolicy`, `CognitiveObject<"hypothesis">`, `TransitionContext`, `ingestSourceRecords`, `promoteSourceRecordsToEvidence`, `transitionObject`, and `createPortableCognitionRecord`.
- Produces:

```ts
export const DURABLE_COGNITION_WORKFLOW_VERSION = "0.1.0";

export interface DurableCognitionWorkflowRequest {
  readonly workflowVersion: "0.1.0";
  readonly workflowId: string;
  readonly records: readonly SourceRecord[];
  readonly hypothesis: CognitiveObject<"hypothesis">;
  readonly promotion: EvidencePromotionContext;
  readonly reviewTransition: TransitionContext;
  readonly policy: EvidencePromotionPolicy;
}

export interface PreparedDurableCognitionCommit {
  readonly workflowId: string;
  readonly requestDigest: string;
  readonly initialHypothesis: PortableCognitiveObjectRecord;
  readonly evidence: PortableCognitiveObjectRecord;
  readonly expectedHypothesisVersion: 1;
  readonly reviewedHypothesis: PortableCognitiveObjectRecord;
  readonly event: PortableCognitionEventRecord;
}

export function prepareDurableCognitionWorkflow(
  request: DurableCognitionWorkflowRequest,
  options?: IngestionOptions,
): PreparedDurableCognitionCommit;
```

- Adds `INVALID_DURABLE_WORKFLOW_REQUEST` and `DURABLE_WORKFLOW_FAILED` to `DomainErrorCode`; neither changes existing code values.
- Adds only the development export mapping `./workflows/durable/0.1.0` during this task; package versioning and final allowlists happen in Task 7.

- [ ] **Step 1: Write the canonical preparation failure and success tests**

Add fixtures in `tests/durable-workflow-prepare.test.ts` that build one valid SourceRecord and explicit Hypothesis. Assert the exact correlation and deterministic output:

```ts
test("prepares one exact frozen durable workflow before host access", () => {
  const prepared = prepareDurableCognitionWorkflow(validRequest());

  assert.equal(prepared.workflowId, "workflow:delivery-review:1");
  assert.match(prepared.requestDigest, /^[0-9a-f]{64}$/);
  assert.equal(prepared.initialHypothesis.payload.version, 1);
  assert.equal(prepared.reviewedHypothesis.payload.version, 2);
  assert.equal(prepared.reviewedHypothesis.payload.state, "under_review");
  assert.equal(prepared.evidence.payload.type, "evidence");
  assert.equal(prepared.event.payload.objectId, prepared.reviewedHypothesis.payload.id);
  assert.equal(Object.isFrozen(prepared), true);
  assert.equal(Object.isFrozen(prepared.evidence), true);
});

test("rejects a promotion for another hypothesis before policy invocation", () => {
  let policyCalls = 0;
  const request = validRequest({
    promotion: {
      ...validRequest().promotion,
      hypothesisId: "hypothesis:another",
    },
    policy: {
      id: "test-policy",
      version: "1",
      map() {
        policyCalls += 1;
        return {
          title: "Evidence",
          statement: "Statement",
          evidenceKind: "activity",
          polarity: "neutral",
        };
      },
    },
  });

  assert.throws(
    () => prepareDurableCognitionWorkflow(request),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === "INVALID_DURABLE_WORKFLOW_REQUEST",
  );
  assert.equal(policyCalls, 0);
});
```

- [ ] **Step 2: Run the focused test and observe the missing module failure**

Run:

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/durable-workflow-prepare.test.ts
```

Expected: FAIL because `src/workflows/durable.ts` does not exist.

- [ ] **Step 3: Implement the closed contract and prepared-record construction**

In `src/workflows/durable-contract.ts`, define the exact public types above plus internal closed-field sets. In `src/workflows/durable-prepare.ts`, snapshot the request using own enumerable data descriptors, validate `workflowVersion`, `workflowId`, Hypothesis type/version/state, promotion correlation, context correlation, and fail-fast ingestion before policy capture.

Use the existing canonicalizer for the digest:

```ts
const requestDigest = createHash("sha256")
  .update(canonicalizeJson({
    workflowVersion: DURABLE_COGNITION_WORKFLOW_VERSION,
    workflowId: snapshot.workflowId,
    records: ingestion.acceptedRecords,
    policy: { id: policy.id, version: policy.version },
    promotion: snapshot.promotion,
    reviewTransition: snapshot.reviewTransition,
    outputs: {
      initialHypothesis,
      evidence,
      reviewedHypothesis,
      event,
    },
  }))
  .digest("hex");
```

Return only normalized, recursively frozen Portable Cognition records. Do not retain caller arrays, objects, policy objects, or transition context.

- [ ] **Step 4: Add hostile-structure, replay, and limit tests**

Cover reordered JSON keys, duplicated SourceRecords, revision collision, empty accepted set, accessors, inherited fields, stateful proxies, policy mutation, malformed mapping, mismatched context IDs and attribution, invalid transition confirmation, and `maxRecords`/`maxRecordBytes` propagation. Assert every rejection occurs before a supplied fake host callback is reachable.

- [ ] **Step 5: Run focused and adjacent tests**

Run:

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/durable-workflow-prepare.test.ts tests/promotion.test.ts tests/transitions.test.ts tests/portable-cognition.test.ts
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npx tsc --noEmit
```

Expected: all selected tests pass and typecheck exits `0`.

- [ ] **Step 6: Commit the prepared workflow contract**

```bash
git add src/errors.ts src/workflows/durable-contract.ts src/workflows/durable-prepare.ts src/workflows/durable.ts tests/durable-workflow-prepare.test.ts package.json
git commit -m "feat: add durable workflow preparation"
```

---

### Task 2: Workflow Orchestrator and Host Conformance

**Files:**
- Create: `src/workflows/durable-run.ts`
- Create: `src/workflows/durable-conformance.ts`
- Create: `tests/durable-workflow-run.test.ts`
- Create: `tests/durable-workflow-conformance.test.ts`
- Modify: `src/workflows/durable-contract.ts`
- Modify: `src/workflows/durable.ts`

**Interfaces:**
- Consumes: `prepareDurableCognitionWorkflow` and `PreparedDurableCognitionCommit` from Task 1.
- Produces:

```ts
export type DurableWorkflowConflictCode =
  | "workflow_id_collision"
  | "object_revision_collision"
  | "event_id_collision"
  | "version_conflict"
  | "incomplete_workflow";

export type DurableCognitionCommitResult =
  | { readonly status: "committed" | "already_committed" }
  | {
      readonly status: "conflict";
      readonly conflict: {
        readonly code: DurableWorkflowConflictCode;
        readonly workflowId: string;
      };
    };

export interface CognitionWorkflowStore extends CognitionStore {
  commitWorkflow(
    request: PreparedDurableCognitionCommit,
  ): Promise<DurableCognitionCommitResult>;
}

export interface DurableCognitionProjector {
  project(
    records: readonly MarkdownCognitionRecord[],
  ): Promise<"projected" | "unchanged">;
}

export interface DurableCognitionWorkflowHost {
  readonly store: CognitionWorkflowStore;
  readonly publisher?: CognitionEventPublisher;
  readonly projector?: DurableCognitionProjector;
}

export function runDurableCognitionWorkflow(
  host: DurableCognitionWorkflowHost,
  request: DurableCognitionWorkflowRequest,
  options?: IngestionOptions,
): Promise<DurableCognitionWorkflowResult>;

export function runDurableWorkflowStoreConformance(
  factory: () => Promise<CognitionWorkflowStore> | CognitionWorkflowStore,
): Promise<DurableWorkflowConformanceReport>;
```

- [ ] **Step 1: Write orchestrator ordering and outcome tests**

Use recording fakes to assert persistence always precedes downstream stages and conflicts invoke neither publisher nor projector:

```ts
test("persists before publishing and projecting", async () => {
  const order: string[] = [];
  const result = await runDurableCognitionWorkflow(
    recordingHost({
      onCommit: () => order.push("commit"),
      onPublish: () => order.push("publish"),
      onProject: () => order.push("project"),
    }),
    validRequest(),
  );

  assert.equal(result.status, "committed");
  assert.deepEqual(order, ["commit", "publish", "project"]);
  assert.equal(result.publication, "published");
  assert.equal(result.projection, "projected");
});

test("does not invoke downstream stages after a conflict", async () => {
  const host = recordingHost({ commit: {
    status: "conflict",
    conflict: {
      code: "workflow_id_collision",
      workflowId: "workflow:delivery-review:1",
    },
  }});
  const result = await runDurableCognitionWorkflow(host, validRequest());

  assert.equal(result.status, "conflict");
  assert.equal(host.publishCalls.length, 0);
  assert.equal(host.projectCalls.length, 0);
});
```

- [ ] **Step 2: Run the orchestrator test and observe the missing export failure**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/durable-workflow-run.test.ts
```

Expected: FAIL because `runDurableCognitionWorkflow` is absent.

- [ ] **Step 3: Implement fail-closed result classification**

Validate the store result as a closed own-data value. On `committed` or `already_committed`, invoke the optional publisher with `prepared.event.payload.id` as the idempotency key, then invoke the optional projector with exactly:

```ts
Object.freeze([
  prepared.initialHypothesis,
  prepared.evidence,
  prepared.reviewedHypothesis,
  prepared.event,
]);
```

Classify downstream outcomes into the four success/partial-success status variants from the spec. Represent absent stages as `not_requested`. Sanitize thrown or malformed adapter values into fixed workflow failures without exposing exception text.

- [ ] **Step 4: Write the workflow-store conformance matrix**

The conformance runner must execute named isolated cases for atomic visibility, exact replay, workflow-ID collision, object collision, event collision, version conflict, incomplete workflow rejection, failed-write rollback, detached reads, and factory isolation. A report contains all cases rather than aborting at the first adapter failure:

```ts
assert.deepEqual(
  report.cases.map(({ id, status }) => ({ id, status })),
  [
    { id: "atomic-commit", status: "passed" },
    { id: "exact-replay", status: "passed" },
    { id: "workflow-id-collision", status: "passed" },
    { id: "object-collision", status: "passed" },
    { id: "event-collision", status: "passed" },
    { id: "version-conflict", status: "passed" },
    { id: "incomplete-workflow", status: "passed" },
    { id: "rollback", status: "passed" },
    { id: "detached-reads", status: "passed" },
    { id: "factory-isolation", status: "passed" },
  ],
);
```

- [ ] **Step 5: Run orchestrator, conformance, and host tests**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/durable-workflow-run.test.ts tests/durable-workflow-conformance.test.ts tests/host-integration.test.ts tests/host-conformance.test.ts
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npx tsc --noEmit
```

Expected: all selected tests pass and typecheck exits `0`.

- [ ] **Step 6: Commit orchestration and conformance**

```bash
git add src/workflows/durable-contract.ts src/workflows/durable-run.ts src/workflows/durable-conformance.ts src/workflows/durable.ts tests/durable-workflow-run.test.ts tests/durable-workflow-conformance.test.ts
git commit -m "feat: orchestrate durable cognition workflows"
```

---

### Task 3: SQLite Schema Version 2 Compatibility Boundary

**Files:**
- Modify: `src/stores/sqlite.ts`
- Create: `src/stores/sqlite-workflow.ts`
- Create: `tests/sqlite-workflow-schema.test.ts`
- Modify: `tests/sqlite-store.test.ts`

**Interfaces:**
- Consumes: existing SQLite schema version `1` and `CognitionStore` behavior.
- Produces: schema version `2` with the existing three tables plus:

```sql
CREATE TABLE cognition_workflows (
  workflow_id TEXT PRIMARY KEY,
  request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
  initial_hypothesis_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  reviewed_hypothesis_version INTEGER NOT NULL CHECK (reviewed_hypothesis_version = 2),
  event_id TEXT NOT NULL UNIQUE
) STRICT;
```

- Produces `SqliteCognitionWorkflowStoreOptions`, identical to the existing store options, and exports `SqliteCognitionWorkflowStore` from `src/stores/sqlite-workflow.ts`.

- [ ] **Step 1: Write schema-version acceptance and rejection tests**

```ts
test("the existing SQLite store opens reviewed schema versions one and two", () => {
  const versionOne = createVersionOneTarget();
  const versionTwo = createVersionTwoTarget();
  assert.doesNotThrow(() => new SqliteCognitionStore({ databasePath: versionOne.path }).close());
  assert.doesNotThrow(() => new SqliteCognitionStore({ databasePath: versionTwo.path }).close());
});

test("the workflow store requires an explicit version-two target", () => {
  const versionOne = createVersionOneTarget();
  assert.throws(
    () => new SqliteCognitionWorkflowStore({ databasePath: versionOne.path }),
    /incompatible/i,
  );
  assert.equal(readSchemaVersion(versionOne.path), 1);
});
```

Also assert that an absent workflow path remains absent unless `createIfMissing: true`, and that creating through `SqliteCognitionWorkflowStore` writes schema version `2` without touching a nearby version-`1` database.

- [ ] **Step 2: Run schema tests and observe version-two rejection**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts
```

Expected: FAIL because schema version `2` and `SqliteCognitionWorkflowStore` are not implemented.

- [ ] **Step 3: Refactor schema inspection into explicit profiles**

Keep the existing exact-schema fail-closed behavior. Replace the single schema constants with immutable `schemaVersionOne` and `schemaVersionTwo` profiles. Change `inspectExistingTarget` and `assertSchemaIdentity` to accept a closed allowed-version set, never a minimum/maximum range.

The existing constructor calls:

```ts
openCompatibleCognitionTarget(snapshot, new Set([1, 2]));
```

The workflow constructor calls:

```ts
openCompatibleCognitionTarget(snapshot, new Set([2]));
```

Creation receives the exact schema profile from the constructor and never upgrades an existing file.

- [ ] **Step 4: Verify malformed and hybrid schema rejection**

Extend tests to reject version `2` with missing workflow table, extra table/view/trigger, changed `STRICT` clauses, wrong workflow columns, unknown schema version, team-memory tables, and hybrid markers. Assert file bytes and nanosecond modification time remain unchanged after every rejected open.

- [ ] **Step 5: Run SQLite schema and existing store suites**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npx tsc --noEmit
```

Expected: all tests pass; every existing version-`1` behavior remains unchanged.

- [ ] **Step 6: Commit the schema boundary**

```bash
git add src/stores/sqlite.ts src/stores/sqlite-workflow.ts tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts
git commit -m "feat: add SQLite workflow schema boundary"
```

---

### Task 4: Atomic SQLite Workflow Commit

**Files:**
- Modify: `src/stores/sqlite.ts`
- Modify: `src/stores/sqlite-workflow.ts`
- Create: `tests/sqlite-workflow-store.test.ts`
- Modify: `tests/durable-workflow-conformance.test.ts`

**Interfaces:**
- Consumes: `PreparedDurableCognitionCommit`, `DurableCognitionCommitResult`, and `CognitionWorkflowStore` from Tasks 1–2.
- Produces: `SqliteCognitionWorkflowStore implements CognitionWorkflowStore` with `commitWorkflow`, all existing read methods, and idempotent `close`.

- [ ] **Step 1: Write atomic commit, replay, and reopen tests**

```ts
test("commits and reopens one complete durable workflow", async () => {
  const fixture = temporaryWorkflowDatabase();
  const prepared = prepareDurableCognitionWorkflow(validRequest());
  const store = new SqliteCognitionWorkflowStore({
    databasePath: fixture.path,
    createIfMissing: true,
  });
  assert.deepEqual(await store.commitWorkflow(prepared), { status: "committed" });
  store.close();

  const reopened = new SqliteCognitionWorkflowStore({ databasePath: fixture.path });
  assert.deepEqual(await reopened.getObjectVersion(prepared.initialHypothesis.payload.id, 1), prepared.initialHypothesis);
  assert.deepEqual(await reopened.getLatestObject(prepared.reviewedHypothesis.payload.id), prepared.reviewedHypothesis);
  assert.deepEqual(await reopened.getLatestObject(prepared.evidence.payload.id), prepared.evidence);
  assert.deepEqual(await reopened.listObjectEvents(prepared.reviewedHypothesis.payload.id), [prepared.event]);
  assert.deepEqual(await reopened.commitWorkflow(prepared), { status: "already_committed" });
  reopened.close();
});
```

- [ ] **Step 2: Run the focused store test and observe the missing method failure**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-store.test.ts
```

Expected: FAIL because `commitWorkflow` is absent.

- [ ] **Step 3: Implement one immediate transaction with fixed conflict precedence**

Prepare and canonicalize the request before `BEGIN IMMEDIATE`. Inside the transaction use this precedence:

1. exact workflow receipt and complete matching records → `already_committed`;
2. same workflow ID with another digest → `workflow_id_collision`;
3. complete matching records without receipt → `incomplete_workflow`;
4. initial Hypothesis or Evidence revision mismatch → `object_revision_collision`;
5. event ID or occupied object-version event mismatch → `event_id_collision`;
6. latest Hypothesis version differs from expected version → `version_conflict`;
7. otherwise insert all object rows, event row, and receipt, then return `committed`.

Validate stored row identity and canonical Portable Cognition payloads before comparison. Catch no transaction error as a success-shaped result.

- [ ] **Step 4: Add rollback and concurrency tests**

Use the existing SQLite test hook pattern to force failure after each insert boundary and assert zero workflow rows remain. Open two store instances and assert:

```ts
assert.deepEqual(
  new Set((await Promise.all([
    first.commitWorkflow(prepared),
    second.commitWorkflow(prepared),
  ])).map((result) => result.status)),
  new Set(["committed", "already_committed"]),
);
```

Run a conflicting pair with one workflow ID and different digests; assert one complete winner and one `workflow_id_collision` with no mixed object set.

- [ ] **Step 5: Run store conformance against SQLite**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-store.test.ts tests/durable-workflow-conformance.test.ts tests/sqlite-store.test.ts
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npx tsc --noEmit
```

Expected: SQLite passes every durable workflow conformance case and existing store tests remain green.

- [ ] **Step 6: Commit atomic workflow persistence**

```bash
git add src/stores/sqlite.ts src/stores/sqlite-workflow.ts tests/sqlite-workflow-store.test.ts tests/durable-workflow-conformance.test.ts
git commit -m "feat: persist durable workflows atomically"
```

---

### Task 5: Closed Durable Workflow CLI

**Files:**
- Create: `src/workflow-cli-contract.ts`
- Create: `src/workflow-cli.ts`
- Create: `tests/workflow-cli-contract.test.ts`
- Create: `tests/workflow-cli.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `prepareDurableCognitionWorkflow`, `runDurableCognitionWorkflow`, `neutralEvidencePolicyV1`, `SqliteCognitionWorkflowStore`, and `projectMarkdownCognition`.
- Produces:

```ts
export const WORKFLOW_CLI_CONTRACT = {
  commands: ["run"],
  formats: ["json", "jsonl"],
  policyIds: ["neutral-evidence-v1"],
  defaults: {
    maxInputBytes: 10_485_760,
    maxRecords: 10_000,
    maxRecordBytes: 1_048_576,
    maxRequestBytes: 1_048_576,
  },
} as const;
```

- Adds executable `collective-cognition-workflow` pointing to `./dist/workflow-cli.js`.
- Serialized request JSON contains `workflowVersion`, `workflowId`, `hypothesis`, `promotion`, `reviewTransition`, and `policyId`; it contains no paths or executable policy value.

- [ ] **Step 1: Write exact help, argument, and request-shape tests**

```ts
test("keeps the workflow CLI surface closed", () => {
  for (const args of [
    [], ["run"], ["watch"], ["run", "--input", "records.jsonl"],
    ["run", "--unknown", "value"],
  ]) {
    const result = runCli(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).stage, "arguments");
  }
});

test("rejects relative paths before opening any file", () => {
  const result = runCli([
    "run",
    "--request", "request.json",
    "--input", "records.jsonl",
    "--format", "jsonl",
    "--cognition-db", "cognition.db",
  ]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, "WORKFLOW_INVALID_ARGUMENTS");
});
```

- [ ] **Step 2: Run CLI contract tests and observe the missing CLI failure**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/workflow-cli-contract.test.ts tests/workflow-cli.test.ts
```

Expected: FAIL because the CLI files do not exist.

- [ ] **Step 3: Implement bounded parsing and path preflight**

Support exactly:

```text
collective-cognition-workflow run
  --request <absolute JSON file>
  --input <absolute JSON or JSONL file, or ->
  --format <json|jsonl>
  --cognition-db <absolute SQLite file>
  [--create-cognition-db]
  [--markdown-target <absolute initialized target>]
  [--max-input-bytes <positive safe integer>]
  [--max-records <positive safe integer>]
  [--max-record-bytes <positive safe integer>]
  [--max-request-bytes <positive safe integer>]
```

Read request and input incrementally with their independent byte limits. Snapshot and validate the request before opening the cognition store. Resolve only `policyId: "neutral-evidence-v1"`. Reject duplicate options, repeated flags, unknown members, extra positional values, and unsupported policy IDs.

Reuse the durable example's canonical path, realpath, sidecar, symlink, and hardlink identity checks. Reject aliasing among request, input, cognition main/sidecars, and Markdown marker/manifest paths before mutation. stdin is allowed only as `--input -`; the request always uses an explicit file.

- [ ] **Step 4: Implement sanitized stage diagnostics and one-result stdout**

Use closed stages `arguments`, `request`, `input`, `preparation`, `persistence`, `publication`, `projection`, and `output`. Before output, every failure writes exactly one JSON line to stderr and zero stdout bytes:

```json
{"code":"WORKFLOW_INVALID_REQUEST","message":"Durable workflow request is invalid.","stage":"request"}
```

Do not emit paths, input content, arbitrary exception messages, stack traces, or SQLite messages. A closed stdout failure uses a fixed `WORKFLOW_OUTPUT_FAILED` diagnostic.

- [ ] **Step 5: Run CLI security and behavior tests**

Cover JSON/JSONL equivalence, stdin, exact limits, malformed lexical JSON, source collision, policy rejection, missing/create/reopen database behavior, request/input/database/sidecar/Markdown aliases, symlink and hardlink aliases, closed streams, no source-ledger access, and no home/repository/vault discovery.

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/workflow-cli-contract.test.ts tests/workflow-cli.test.ts tests/durable-workflow-prepare.test.ts tests/sqlite-workflow-store.test.ts
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npx tsc --noEmit
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit the CLI**

```bash
git add src/workflow-cli-contract.ts src/workflow-cli.ts tests/workflow-cli-contract.test.ts tests/workflow-cli.test.ts package.json
git commit -m "feat: add durable cognition workflow CLI"
```

---

### Task 6: Markdown Projection and End-to-End Workflow Example

**Files:**
- Create: `examples/durable-cognition-workflow.ts`
- Create: `tests/durable-workflow-example.test.ts`
- Create: `tests/durable-workflow-markdown.test.ts`
- Modify: `src/workflow-cli.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: workflow CLI and existing Markdown `initialize`, `project`, and `verify` behavior.
- Produces: `npm run example:workflow`, which creates only temporary input, request, SQLite, and Markdown targets and prints one summary object.

- [ ] **Step 1: Write the temporary end-to-end acceptance test**

```ts
test("persists, replays, reopens, and projects one source-neutral workflow", () => {
  const fixture = temporaryWorkflowFixture();
  try {
    initializeMarkdownCognitionTarget({ targetDirectory: fixture.markdownTarget });
    const first = runWorkflowCli(fixture.argsWithCreate);
    const replay = runWorkflowCli(fixture.argsWithoutCreate);

    assert.equal(first.status, 0, first.stderr);
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(JSON.parse(first.stdout).persistence, "committed");
    assert.equal(JSON.parse(replay.stdout).persistence, "already_committed");
    assert.equal(JSON.parse(first.stdout).publication, "not_requested");
    assert.equal(JSON.parse(replay.stdout).projection, "unchanged");
    assert.equal(countRows(fixture.database, "cognition_objects"), 3);
    assert.equal(countRows(fixture.database, "cognition_events"), 1);
    assert.equal(countRows(fixture.database, "cognition_workflows"), 1);
    assert.equal(verifyMarkdownCognitionTarget({ targetDirectory: fixture.markdownTarget }).status, "passed");
  } finally {
    fixture.remove();
  }
});
```

- [ ] **Step 2: Run the test and observe missing projection wiring**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/durable-workflow-markdown.test.ts tests/durable-workflow-example.test.ts
```

Expected: FAIL until the CLI projector maps the four prepared records to the existing Markdown adapter.

- [ ] **Step 3: Implement the CLI projector adapter**

Wrap `projectMarkdownCognition` without changing its public API:

```ts
const projector: DurableCognitionProjector | undefined = markdownTarget === undefined
  ? undefined
  : {
      async project(records) {
        const report = await projectMarkdownCognition({
          targetDirectory: markdownTarget,
          records,
        });
        return report.created.length === 0 &&
            report.updated.length === 0 &&
            report.pruned.length === 0
          ? "unchanged"
          : "projected";
      },
    };
```

The CLI must not initialize the target. A missing or incompatible marker fails at projection after cognition remains committed, producing `committed_but_unprojected`.

- [ ] **Step 4: Add failure-recovery assertions**

Run once with an incompatible Markdown target and assert complete database persistence plus `committed_but_unprojected`. Initialize a valid target and replay the identical request; assert `already_committed`, `projected`, no duplicate database rows, and exact Markdown verification. Repeat once more and assert `unchanged` mtimes.

- [ ] **Step 5: Add the example to CI distribution verification**

Add `npm run example:workflow` after the existing host and Markdown examples. The example uses `mkdtempSync`, creates a schema-version-`2` cognition database, reopens it, verifies exact records and one receipt, projects into an initialized temporary target, and deletes the temporary root in `finally`.

- [ ] **Step 6: Run all workflow, Markdown, and example tests**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/durable-workflow-*.test.ts tests/workflow-cli.test.ts tests/markdown-cognition-*.test.ts
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm run example:workflow
```

Expected: tests pass; the example prints one JSON line and leaves no persistent file outside its temporary root.

- [ ] **Step 7: Commit the end-to-end workflow**

```bash
git add examples/durable-cognition-workflow.ts tests/durable-workflow-example.test.ts tests/durable-workflow-markdown.test.ts src/workflow-cli.ts package.json .github/workflows/ci.yml
git commit -m "test: verify durable workflow end to end"
```

---

### Task 7: Package 0.9.0 Compatibility and Public Documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/rewrite-declaration-imports.mjs`
- Modify: `tests/compatibility.test.mjs`
- Modify: `tests/package.test.mjs`
- Create: `spec/compatibility/0.9.0/baseline.json`
- Create: `spec/compatibility/0.9.0/change-cases.jsonl`
- Create: `rfcs/0010-durable-cognition-workflow.md`
- Create: `docs/durable-cognition-workflow-guide.md`
- Modify: `docs/public-api.md`
- Modify: `docs/ROADMAP.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `rfcs/README.md`
- Modify: `spec/README.md`
- Modify: `spec/compatibility.md`
- Modify: `tests/release-readiness.test.ts`

**Interfaces:**
- Consumes: completed runtime, SQLite, CLI, example, and tests from Tasks 1–6.
- Produces private package `0.9.0`, exact compatibility inventory, the two versioned workflow subpaths, and the installed executable.

- [ ] **Step 1: Write failing package and compatibility assertions**

Extend package tests to require:

```ts
assert.deepEqual(packageJson.bin["collective-cognition-workflow"], "./dist/workflow-cli.js");
assert.deepEqual(
  Object.keys(await import("collective-cognition-sdk/workflows/durable/0.1.0")).sort(),
  expectedDurableWorkflowRuntimeExports,
);
assert.deepEqual(
  Object.keys(await import("collective-cognition-sdk/stores/sqlite-workflow/0.1.0")).sort(),
  ["SqliteCognitionWorkflowStore"],
);
```

Require clean-consumer TypeScript imports of every workflow type, a packed CLI run, exact executable mode, and no source/tests/plans in the tarball.

- [ ] **Step 2: Run package and compatibility tests and observe 0.8.0 drift failures**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm run build
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --test tests/compatibility.test.mjs tests/package.test.mjs
```

Expected: FAIL until version `0.9.0`, baseline, export map, files, and executable are recorded.

- [ ] **Step 3: Update package metadata and exact allowlists**

Set package and lockfile version to `0.9.0`, retain `"private": true`, add:

```json
"./workflows/durable/0.1.0": {
  "types": "./dist/workflows/durable.d.ts",
  "import": "./dist/workflows/durable.js"
},
"./stores/sqlite-workflow/0.1.0": {
  "types": "./dist/stores/sqlite-workflow.d.ts",
  "import": "./dist/stores/sqlite-workflow.js"
}
```

Add the executable, RFC, guide, `0.9.0` compatibility files, and any required emitted declarations to the exact package allowlist. Update the build chmod step and syntax-check list for every new source, test, and example file.

- [ ] **Step 4: Generate and then hand-check baseline 0.9.0**

Record historical baseline `0.8.0` by SHA-256 and copy the existing baseline structure with exact additions:

- package version `0.9.0`;
- workflow and SQLite-workflow subpaths;
- exact runtime and type exports;
- `collective-cognition-workflow` executable contract;
- exact declaration-closure digests;
- RFC and guide digests;
- additive minor classification and no root export changes.

The change case is one canonical JSONL record with `classification: "additive"`, `packageVersionEffect: "minor"`, and exact added surfaces.

- [ ] **Step 5: Write public documentation without upgrading readiness claims**

Document the supported flow:

```text
connector or canonical JSONL
  -> explicit durable workflow request
  -> atomic cognition database
  -> optional event publisher
  -> optional managed Markdown projection
```

State prominently that the package is private/unpublished, SQLite v2 requires a new explicit database in this slice, the CLI has no publisher, Markdown is not authoritative storage, and no scheduler, automatic cognition, Obsidian discovery, authentication, encryption, durable outbox, or production certification is supplied.

Mark the Phase 4 workflow deliverable complete only after implementation evidence is present. Keep Phase 5 as the next SDK development phase pending its two-connector criteria.

- [ ] **Step 6: Run documentation, compatibility, package, and release-policy tests**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm run build
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts tests/distribution-readiness-profile.test.ts
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --test tests/compatibility.test.mjs tests/package.test.mjs
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm run pack:check
```

Expected: all checks pass; npm publication remains blocked and production use remains `not-claimed`.

- [ ] **Step 7: Commit package and documentation stabilization**

```bash
git add package.json package-lock.json scripts/rewrite-declaration-imports.mjs tests/compatibility.test.mjs tests/package.test.mjs tests/release-readiness.test.ts spec/compatibility/0.9.0 rfcs/0010-durable-cognition-workflow.md docs/durable-cognition-workflow-guide.md docs/public-api.md docs/ROADMAP.md README.md CHANGELOG.md rfcs/README.md spec/README.md spec/compatibility.md
git commit -m "feat: stabilize durable workflow package surface"
```

---

### Task 8: Real-Ledger Acceptance, Full Verification, and Review

**Files:**
- Create: `docs/acceptance/durable-cognition-workflow-0.1.0.md`
- Modify: `docs/ROADMAP.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing Team Memory connector CLI only as an external SourceRecord producer; the durable workflow remains source-neutral.
- Produces: recorded read-only acceptance evidence and final whole-branch verification. No live vault write is permitted.

- [ ] **Step 1: Capture source-ledger identity before acceptance**

Require the operator to supply one explicit compatible ledger path. Do not record that path in committed public documentation:

```bash
: "${CCSDK_ACCEPTANCE_LEDGER:?Set CCSDK_ACCEPTANCE_LEDGER to an explicit compatible ledger path}"
ledger="$(realpath "$CCSDK_ACCEPTANCE_LEDGER")"
test -f "$ledger"
stat -f '%z %m %c %i' "$ledger" > /tmp/ccsdk-ledger-before.txt
shasum -a 256 "$ledger" >> /tmp/ccsdk-ledger-before.txt
```

Do not copy, edit, vacuum, migrate, or open the source ledger for writing.

- [ ] **Step 2: Export a bounded source-neutral sample**

```bash
acceptance_root="$(mktemp -d)"
records="$acceptance_root/records.jsonl"
request="$acceptance_root/request.json"
cognition="$acceptance_root/cognition.db"
markdown="$acceptance_root/Collective Cognition"

PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node dist/team-memory-cli.js export \
  --db "$ledger" \
  --source-instance local-team-memory-acceptance \
  --project unified-portal \
  --from 2026-07-28T17:59:00+08:00 \
  --limit 12 > "$records"
```

Assert exactly `12` JSONL records and no `raw` field. Write the exact serialized request:

```bash
test "$(wc -l < "$records" | tr -d ' ')" = "12"
if grep -q '"raw"' "$records"; then exit 1; fi

cat > "$request" <<'JSON'
{
  "workflowVersion": "0.1.0",
  "workflowId": "acceptance:durable-workflow-0.1.0",
  "hypothesis": {
    "id": "hypothesis:acceptance-delivery-readiness",
    "type": "hypothesis",
    "version": 1,
    "state": "proposed",
    "title": "Acceptance delivery readiness",
    "data": {
      "statement": "The selected activity may contribute to delivery readiness.",
      "scope": "unified-portal"
    },
    "createdAt": "2026-07-28T18:00:00+08:00",
    "updatedAt": "2026-07-28T18:00:00+08:00",
    "attribution": {
      "initiatorId": "human:acceptance-owner",
      "executorId": "agent:durable-workflow-acceptance",
      "accountableId": "human:acceptance-owner"
    },
    "provenance": [
      {
        "source": "acceptance",
        "sourceId": "durable-workflow-0.1.0",
        "capturedAt": "2026-07-28T18:00:00+08:00"
      }
    ],
    "contextId": "organization:acceptance",
    "relationships": [
      {
        "type": "supports-goal",
        "targetId": "goal:acceptance-delivery-readiness"
      }
    ]
  },
  "promotion": {
    "hypothesisId": "hypothesis:acceptance-delivery-readiness",
    "contextId": "organization:acceptance",
    "rationale": "The selected records describe delivery activity without inferring readiness or a decision.",
    "promotedAt": "2026-07-29T18:00:00+08:00",
    "attribution": {
      "initiatorId": "human:acceptance-owner",
      "executorId": "agent:durable-workflow-acceptance",
      "accountableId": "human:acceptance-owner"
    }
  },
  "reviewTransition": {
    "eventId": "event:acceptance-delivery-readiness-under-review",
    "occurredAt": "2026-07-29T18:00:00+08:00",
    "initiator": { "id": "human:acceptance-owner", "kind": "human" },
    "executor": { "id": "agent:durable-workflow-acceptance", "kind": "agent" },
    "accountableParty": { "id": "human:acceptance-owner", "kind": "human" },
    "automationMode": "manual",
    "consequenceLevel": "routine",
    "rationale": "Review the explicit hypothesis alongside neutral activity evidence."
  },
  "policyId": "neutral-evidence-v1"
}
JSON
```

- [ ] **Step 3: Run create, replay, reopen, and Markdown verification**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node dist/markdown-cognition-cli.js init --target "$markdown"
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node dist/workflow-cli.js run \
  --request "$request" --input "$records" --format jsonl \
  --cognition-db "$cognition" --create-cognition-db \
  --markdown-target "$markdown" > "$acceptance_root/first.json"
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node dist/workflow-cli.js run \
  --request "$request" --input "$records" --format jsonl \
  --cognition-db "$cognition" \
  --markdown-target "$markdown" > "$acceptance_root/replay.json"
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node dist/markdown-cognition-cli.js verify --target "$markdown" > "$acceptance_root/verify.json"
```

Assert first persistence `committed`, replay persistence `already_committed`, publication `not_requested`, second projection `unchanged`, one workflow receipt, three object rows, one event row, version-`2` under-review Hypothesis, neutral Evidence with `12` provenance records, and zero Decisions or Principles.

- [ ] **Step 4: Prove source immutability and record acceptance evidence**

```bash
stat -f '%z %m %c %i' "$ledger" > /tmp/ccsdk-ledger-after.txt
shasum -a 256 "$ledger" >> /tmp/ccsdk-ledger-after.txt
cmp /tmp/ccsdk-ledger-before.txt /tmp/ccsdk-ledger-after.txt
```

Write `docs/acceptance/durable-cognition-workflow-0.1.0.md` with the commit SHA, Node version, source path classification without private row content, record count, output statuses, cognition row counts, Markdown verification result, source before/after identity and hash equality, and explicit statement that no live vault was accessed.

- [ ] **Step 5: Run the complete local gate**

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm ci --ignore-scripts
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm test
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npx tsc --noEmit
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm run check
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm run example
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm run example:portable
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm run example:markdown
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm run example:host
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm run example:workflow
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npm run pack:check
git diff --check
```

Expected: zero failures; only documented platform/release-context skips; clean package dry run; no source-ledger or live-vault mutation.

- [ ] **Step 6: Request independent specification and code review**

Ask one reviewer to compare the entire branch to the approved design and one reviewer to inspect atomicity, replay, SQLite schema/version behavior, path alias protection, sanitization, package boundaries, and source neutrality. Resolve every Critical and Important finding; rerun focused tests after each correction and the complete gate after the last correction.

- [ ] **Step 7: Commit final acceptance evidence**

```bash
git add docs/acceptance/durable-cognition-workflow-0.1.0.md docs/ROADMAP.md README.md CHANGELOG.md
git commit -m "docs: record durable workflow verification"
```

- [ ] **Step 8: Push the feature branch and wait for CI only after explicit user authorization**

When the user says `push`, run:

```bash
git push -u origin feature/durable-cognition-workflow
gh run list --branch feature/durable-cognition-workflow --limit 5
```

Do not merge until the remote branch SHA matches the reviewed local SHA and the complete GitHub Actions matrix passes.
