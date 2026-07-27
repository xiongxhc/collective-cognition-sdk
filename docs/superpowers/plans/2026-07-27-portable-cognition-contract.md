# Portable Cognition Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Normative Stable Portable Cognition Contract `0.1.0` with strict schemas, fixtures, runtime validation, package `0.2.0`, and compatibility baseline `0.2.0`.

**Architecture:** A closed `PortableCognitionRecord` envelope carries one of five exact payload families while cognitive-object `data` remains an open JSON object. The TypeScript runtime mirrors the normative schema through one clone-freeze validation boundary; versioned conformance artifacts remain the source of cross-language truth. Package `0.2.0` adds the runtime and artifact entrypoints without changing existing SourceRecord or experimental cognitive APIs.

**Tech Stack:** TypeScript 7, Node.js 24 test runner, JSON Schema Draft 2020-12, Ajv 8, JSONL fixtures, npm package exports.

## Global Constraints

- Portable contract version is exactly `0.1.0`.
- Package and current compatibility baseline move to exactly `0.2.0`.
- Compatibility baseline `0.1.0` and every SourceRecord `0.1.0` artifact remain byte-unchanged.
- The package remains `"private": true`, runtime-dependency-free, ESM-only, and storage-neutral.
- No persistence, event delivery, connector, team-memory, Obsidian, UI, or automatic interpretation behavior enters this slice.
- Every production behavior starts with a failing focused test.
- Core envelopes and structured payloads reject unknown fields; cognitive-object `data` remains open.
- Accepted runtime values are isolated from caller mutation and deeply frozen.
- Lexical JSON rejects duplicate member names and lone surrogate strings.
- The complete envelope depth limit is 256 JSON containers.

---

### Task 1: Normative Schema and Fixture Corpus

**Files:**
- Create: `spec/portable-cognition.md`
- Create: `spec/schemas/0.1.0/portable-cognition.schema.json`
- Create: `spec/conformance/0.1.0/portable-cognition/valid.jsonl`
- Create: `spec/conformance/0.1.0/portable-cognition/invalid.jsonl`
- Create: `spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl`
- Create: `tests/portable-cognition-schema.test.mjs`

**Interfaces:**
- Consumes: Existing object types, states, relationship rules, event fields, transition-context fields, authorization-decision shapes, and domain-error codes documented in the approved design.
- Produces: One strict Draft 2020-12 entry schema and three fixture files used by Tasks 2–5.

- [ ] **Step 1: Write the failing schema-presence and strict-compilation test**

```js
const schemaUrl = new URL(
  "../spec/schemas/0.1.0/portable-cognition.schema.json",
  import.meta.url,
);
const validFixtureUrl = new URL(
  "../spec/conformance/0.1.0/portable-cognition/valid.jsonl",
  import.meta.url,
);
const invalidFixtureUrl = new URL(
  "../spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
  import.meta.url,
);

test("Portable Cognition schema compiles in strict Draft 2020-12 mode", () => {
  assert.equal(typeof compileSchema(), "function");
});

test("every schema-layer valid fixture passes", () => {
  const validate = compileSchema();
  for (const fixture of readJsonLines(validFixtureUrl)) {
    assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/portable-cognition-schema.test.mjs`

Expected: FAIL because the schema and fixture paths do not exist.

- [ ] **Step 3: Add the closed envelope and five payload families**

The schema root must use:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:collective-cognition:schema:portable-cognition:0.1.0",
  "oneOf": [
    { "$ref": "#/$defs/cognitiveObjectRecord" },
    { "$ref": "#/$defs/cognitionEventRecord" },
    { "$ref": "#/$defs/transitionContextRecord" },
    { "$ref": "#/$defs/authorizationDecisionRecord" },
    { "$ref": "#/$defs/domainErrorRecord" }
  ]
}
```

Each record definition must require exactly:

```json
{
  "schemaVersion": { "const": "0.1.0" },
  "recordType": { "const": "cognitive-object" },
  "payload": { "$ref": "#/$defs/cognitiveObject" }
}
```

Use `additionalProperties: false` on the envelope, object payload, event payload, transition context, authorization decision variants, domain error, attribution, provenance, relationship, actor, and human confirmation. Use `additionalProperties: true` only for cognitive-object `data` and JSON-valued maps.

Define all seven object discriminators with exact state enums and typed optional standard data fields. Encode relationship cardinality with `contains` and `minContains: 1`. Encode every current lifecycle edge as a valid event combination and require event type to match the target state.

- [ ] **Step 4: Add normative prose and complete fixture coverage**

`spec/portable-cognition.md` must define stable rules:

```text
PCR-001 Envelope and discriminator
PCR-002 Supported contract version
PCR-003 JSON and lexical profile
PCR-004 Depth boundary
PCR-005 Cognitive object common fields
PCR-006 Type-state correlation
PCR-007 Open typed data
PCR-008 Namespaced extensions
PCR-009 Attribution
PCR-010 Provenance
PCR-011 Relationship shape and uniqueness
PCR-012 Relationship cardinality
PCR-013 Cognitive event shape
PCR-014 Lifecycle edge and event-type correlation
PCR-015 Transition context
PCR-016 Human confirmation
PCR-017 Authorization decisions
PCR-018 Domain error projection
PCR-019 Runtime isolation and immutability
PCR-020 Stable portable error classification
PCR-021 Version independence
PCR-022 Host trust boundary
```

The valid corpus must include every record family and all seven cognitive object types. The invalid corpus must cover every machine-checkable rule and use:

```json
{
  "description": "unknown envelope member",
  "ruleId": "PCR-001",
  "expectedCode": "INVALID_PORTABLE_COGNITION_RECORD",
  "record": {
    "schemaVersion": "0.1.0",
    "recordType": "authorization-decision",
    "payload": { "status": "allowed" },
    "extra": true
  }
}
```

Lexical cases use `recordJson`; the depth-257 case uses `validationLayer: "runtime"`. The cognitive-loop corpus must contain linked records for the seven objects and at least one record from each non-object family.

- [ ] **Step 5: Complete schema assertions and verify GREEN**

Add tests that:

```js
assert.deepEqual(
  [...new Set(invalidFixtures.map((fixture) => fixture.ruleId))].sort(),
  machineCheckableRuleIds.sort(),
);
assert.ok(
  invalidFixtures.some((fixture) => fixture.validationLayer === "lexical"),
);
assert.ok(
  invalidFixtures.some((fixture) => fixture.validationLayer === "runtime"),
);
```

Run: `node --test tests/portable-cognition-schema.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the normative artifact**

```bash
git add spec/portable-cognition.md spec/schemas/0.1.0/portable-cognition.schema.json spec/conformance/0.1.0/portable-cognition tests/portable-cognition-schema.test.mjs
git commit -m "spec: define portable cognition contract"
```

---

### Task 2: Runtime Portable Record Boundary

**Files:**
- Create: `src/portable-cognition.ts`
- Create: `tests/portable-cognition.test.ts`
- Modify: `src/errors.ts`
- Modify: `src/index.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 fixture shapes and existing `parseProfiledJson`, JSON-value validation, domain-error, object, event, authorization, and transition types.
- Produces: `PortableCognitionRecord`, its five payload types, four runtime functions, two constants, and one stable error code.

- [ ] **Step 1: Write failing public API and valid-fixture tests**

```ts
import {
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  DomainError,
  DomainErrorCode,
  PORTABLE_COGNITION_MAX_JSON_DEPTH,
  PORTABLE_COGNITION_SCHEMA_VERSION,
  serializePortableCognitionRecord,
  validatePortableCognitionRecord,
} from "../src/index.ts";

test("accepts every normative valid Portable Cognition record", () => {
  for (const record of validRecords()) {
    validatePortableCognitionRecord(record);
    const accepted = createPortableCognitionRecord(record);
    assert.deepEqual(accepted, record);
    assert.equal(Object.isFrozen(accepted), true);
    assert.deepEqual(
      deserializePortableCognitionRecord(
        serializePortableCognitionRecord(accepted),
      ),
      accepted,
    );
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --disable-warning=ExperimentalWarning --test tests/portable-cognition.test.ts`

Expected: FAIL because the public runtime API does not exist.

- [ ] **Step 3: Define the portable discriminated union**

`src/portable-cognition.ts` must export:

```ts
export const PORTABLE_COGNITION_SCHEMA_VERSION = "0.1.0";
export const PORTABLE_COGNITION_MAX_JSON_DEPTH = 256;

export type PortableCognitionRecordType =
  | "cognitive-object"
  | "cognition-event"
  | "transition-context"
  | "authorization-decision"
  | "domain-error";

export interface PortableDomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly details: JsonObject;
}

export type PortableCognitionPayloadByType = {
  readonly "cognitive-object": CognitiveObject;
  readonly "cognition-event": CognitionEvent;
  readonly "transition-context": TransitionContext;
  readonly "authorization-decision": AuthorizationDecision;
  readonly "domain-error": PortableDomainError;
};

export type PortableCognitionRecord<
  T extends PortableCognitionRecordType = PortableCognitionRecordType,
> = {
  [K in T]: {
    readonly schemaVersion: "0.1.0";
    readonly recordType: K;
    readonly payload: PortableCognitionPayloadByType[K];
  };
}[T];

export type CreatePortableCognitionRecordInput =
  PortableCognitionRecord;
```

Add `INVALID_PORTABLE_COGNITION_RECORD` to `DomainErrorCode` and export all public types/functions through `src/index.ts`.

- [ ] **Step 4: Implement exact validation, cloning, freezing, and serialization**

Use descriptor-safe JSON-value validation before recursive checks. Validation must:

```ts
export function validatePortableCognitionRecord(
  value: unknown,
): asserts value is PortableCognitionRecord;

export function createPortableCognitionRecord(
  input: CreatePortableCognitionRecordInput,
): PortableCognitionRecord {
  const snapshot = structuredClone(input);
  validatePortableCognitionRecord(snapshot);
  return freezeJsonValue(
    snapshot as unknown as JsonValue,
  ) as unknown as PortableCognitionRecord;
}
```

`serializePortableCognitionRecord` validates then uses `JSON.stringify`. `deserializePortableCognitionRecord` uses `parseProfiledJson`, maps lexical/profile failures to `INVALID_PORTABLE_COGNITION_RECORD`, maps malformed JSON syntax to `SERIALIZATION_ERROR`, validates, and returns a deeply frozen isolated value.

Reuse focused helpers for exact fields, non-whitespace strings, timestamps, namespaced extensions, depth, actors, provenance, relationships, object families, events, transition contexts, decisions, and error projections. Do not change existing object or transition validation.

- [ ] **Step 5: Add invalid, mutation, lexical, and depth tests**

For each invalid fixture:

```ts
assert.throws(
  () =>
    fixture.recordJson === undefined
      ? validatePortableCognitionRecord(fixture.record)
      : deserializePortableCognitionRecord(fixture.recordJson),
  (error: unknown) =>
    error instanceof DomainError &&
    error.code === fixture.expectedCode,
  fixture.description,
);
```

Also prove:

```ts
const mutable: any = structuredClone(validRecord);
const accepted = createPortableCognitionRecord(mutable);
mutable.payload = { status: "denied", reason: "changed" };
assert.notDeepEqual(mutable, accepted);
assert.equal(Object.isFrozen(accepted.payload), true);
assert.equal(PORTABLE_COGNITION_SCHEMA_VERSION, "0.1.0");
assert.equal(PORTABLE_COGNITION_MAX_JSON_DEPTH, 256);
```

- [ ] **Step 6: Verify focused and existing source tests**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/portable-cognition.test.ts tests/objects.test.ts tests/transitions.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit the runtime boundary**

```bash
git add src/portable-cognition.ts src/errors.ts src/index.ts tests/portable-cognition.test.ts package.json
git commit -m "feat: add portable cognition runtime"
```

---

### Task 3: Differential Conformance

**Files:**
- Create: `tests/portable-cognition-conformance.test.ts`
- Modify: `tests/portable-cognition-schema.test.mjs`
- Modify: `spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 schema/fixtures and Task 2 runtime.
- Produces: Differential proof that schema, runtime, and existing cognitive-loop behavior agree.

- [ ] **Step 1: Write a failing schema-runtime parity test**

```ts
test("schema-layer fixtures have identical schema and runtime outcomes", () => {
  const validateSchema = compilePortableSchema();
  for (const record of validRecords()) {
    assert.equal(validateSchema(record), true);
    assert.doesNotThrow(() => validatePortableCognitionRecord(record));
  }
  for (const fixture of schemaInvalidFixtures()) {
    assert.equal(validateSchema(fixture.record), false, fixture.description);
    assert.throws(
      () => validatePortableCognitionRecord(fixture.record),
      portableRecordError,
      fixture.description,
    );
  }
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --disable-warning=ExperimentalWarning --test tests/portable-cognition-conformance.test.ts`

Expected: FAIL until the shared fixture helpers and complete differential assertions exist.

- [ ] **Step 3: Generate and compare the complete cognitive loop**

Use existing `createObject`, `transitionObject`, and `evaluateAuthorization` operations to create deterministic values. Wrap:

- all seven cognitive-object types;
- representative transition events across the loop;
- the transition contexts used for those events;
- one `allowed` authorization decision;
- one `confirmation_required` authorization decision; and
- one serializable domain error projection.

Compare each generated record to the corresponding committed line in `cognitive-loop.jsonl`:

```ts
assert.deepEqual(generatedRecords, cognitiveLoopFixtureRecords);
```

Then validate every generated record through schema and runtime.

- [ ] **Step 4: Verify all conformance tests GREEN**

Run:

```bash
node --test tests/portable-cognition-schema.test.mjs
node --disable-warning=ExperimentalWarning --test tests/portable-cognition.test.ts tests/portable-cognition-conformance.test.ts
```

Expected: PASS.

- [ ] **Step 5: Register checks and commit**

Add the new TypeScript and JavaScript test files to `npm run check`. Existing `tests/*.test.ts` discovery already includes the TypeScript tests.

```bash
git add tests/portable-cognition-conformance.test.ts tests/portable-cognition-schema.test.mjs spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl package.json
git commit -m "test: add portable cognition conformance"
```

---

### Task 4: Package 0.2.0 and Compatibility Baseline

**Files:**
- Create: `spec/compatibility/0.2.0/baseline.json`
- Create: `spec/compatibility/0.2.0/change-cases.jsonl`
- Modify: `tests/compatibility.test.mjs`
- Modify: `tests/package.test.mjs`
- Modify: `package.json`
- Modify: `spec/compatibility.md`

**Interfaces:**
- Consumes: Tasks 1–3 public exports, emitted declarations, schemas, fixtures, rule IDs, and artifact hashes.
- Produces: Package `0.2.0`, immutable compatibility baseline `0.2.0`, installed-consumer proof, and preserved baseline `0.1.0`.

- [ ] **Step 1: Write failing current-baseline and package-artifact tests**

```js
const historicalBaselineUrl = new URL(
  "../spec/compatibility/0.1.0/baseline.json",
  import.meta.url,
);
const currentBaselineUrl = new URL(
  "../spec/compatibility/0.2.0/baseline.json",
  import.meta.url,
);

test("historical baseline 0.1.0 remains immutable", () => {
  assert.equal(sha256(readFileSync(historicalBaselineUrl)), ORIGINAL_HASH);
});

test("current baseline describes package 0.2.0", () => {
  const baseline = readJson(currentBaselineUrl);
  assert.equal(baseline.baselineVersion, "0.2.0");
  assert.equal(baseline.appliesToPackageVersion, "0.2.0");
});
```

Package tests must expect schema, all three conformance subpaths, compatibility `0.2.0`, and additive runtime/type exports.

- [ ] **Step 2: Run compatibility and package tests and verify RED**

Run:

```bash
npm run build
node --test tests/compatibility.test.mjs tests/package.test.mjs
```

Expected: FAIL because package `0.2.0`, its baseline, and its artifact inventory do not exist.

- [ ] **Step 3: Bump package and add exact exports**

Set:

```json
{
  "version": "0.2.0",
  "private": true,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./compatibility/0.1.0": "./spec/compatibility/0.1.0/baseline.json",
    "./compatibility/0.2.0": "./spec/compatibility/0.2.0/baseline.json",
    "./schemas/source-record/0.1.0": "./spec/schemas/0.1.0/source-record.schema.json",
    "./schemas/portable-cognition/0.1.0": "./spec/schemas/0.1.0/portable-cognition.schema.json",
    "./conformance/portable-cognition/0.1.0/valid": "./spec/conformance/0.1.0/portable-cognition/valid.jsonl",
    "./conformance/portable-cognition/0.1.0/invalid": "./spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
    "./conformance/portable-cognition/0.1.0/cognitive-loop": "./spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl",
    "./package.json": "./package.json"
  }
}
```

Add the new normative, conformance, compatibility, and RFC files to the exact `files` allowlist. Keep SourceRecord and compatibility `0.1.0` entries unchanged.

- [ ] **Step 4: Create baseline 0.2.0 deliberately**

The new baseline must:

- identify package and baseline `0.2.0`;
- record the exact SHA-256 of baseline `0.1.0`;
- preserve SourceRecord and compatibility `0.1.0` rule identities;
- add `portableCognition` version, prose path, `PCR-001` through `PCR-022`, schema identity, package subpaths, and artifact hashes;
- record all current root runtime/type exports and emitted files;
- add `INVALID_PORTABLE_COGNITION_RECORD`;
- preserve existing policy identities and CLI contract;
- state that the package change is additive with `packageVersionEffect: "minor"`; and
- retain an empty deprecation inventory.

`change-cases.jsonl` must include an additive Portable Cognition package example and preserve one explicit breaking-process example.

- [ ] **Step 5: Generalize compatibility checks**

Historical checks validate hard-coded immutable hashes for both baselines. Current-inventory checks read only baseline `0.2.0`. Normative artifact checks iterate the current baseline while separately proving that baseline `0.1.0` bytes remain unchanged.

The package test must install the tarball and run a clean consumer that:

```ts
import {
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
} from "collective-cognition-sdk";
import { readFileSync } from "node:fs";

const schemaUrl = import.meta.resolve(
  "collective-cognition-sdk/schemas/portable-cognition/0.1.0",
);
const fixturesUrl = import.meta.resolve(
  "collective-cognition-sdk/conformance/portable-cognition/0.1.0/valid",
);
const portableSchema = JSON.parse(readFileSync(new URL(schemaUrl), "utf8"));
const validRecords = readFileSync(new URL(fixturesUrl), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

const record = createPortableCognitionRecord(validRecords[0]);
const restored = deserializePortableCognitionRecord(
  serializePortableCognitionRecord(record),
);
console.log(portableSchema.$id, restored.recordType);
```

- [ ] **Step 6: Verify package and compatibility GREEN**

Run:

```bash
npm run build
node --test tests/compatibility.test.mjs
node --test tests/package.test.mjs
```

Expected: PASS with the exact package inventory.

- [ ] **Step 7: Commit package evolution**

```bash
git add package.json package-lock.json spec/compatibility.md spec/compatibility/0.2.0 tests/compatibility.test.mjs tests/package.test.mjs
git commit -m "feat: package portable cognition contract"
```

---

### Task 5: RFC, Usage, and Roadmap Reconciliation

**Files:**
- Create: `rfcs/0003-portable-cognition-contract.md`
- Create: `examples/portable-cognition.ts`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `spec/README.md`
- Modify: `rfcs/README.md`
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-07-27-portable-cognition-contract-design.md`

**Interfaces:**
- Consumes: The verified behavior and exact commands from Tasks 1–4.
- Produces: Public documentation that distinguishes delivered Portable Cognition behavior from deferred host integration and adapters.

- [ ] **Step 1: Write the runnable example first**

The example must create and round-trip one cognitive-object record:

```ts
const portable = createPortableCognitionRecord({
  schemaVersion: "0.1.0",
  recordType: "cognitive-object",
  payload: createObject(goalInput),
});

const restored = deserializePortableCognitionRecord(
  serializePortableCognitionRecord(portable),
);

console.log(JSON.stringify(restored, null, 2));
```

Register `npm run example:portable` and add the file to `npm run check`.

- [ ] **Step 2: Run the example and verify GREEN**

Run: `npm run example:portable`

Expected: exit 0 and one Portable Cognition JSON envelope on stdout.

- [ ] **Step 3: Write RFC 0003 and reconcile documentation**

RFC 0003 must state:

- the user/interoperability problem;
- the versioned-envelope decision;
- rejected direct-stabilization, schema-only, and persistence-inclusive alternatives;
- additive package `0.2.0` compatibility effect;
- confirmation and authentication limits;
- linked schema, fixtures, runtime, conformance, package, and compatibility evidence; and
- explicit host-integration and adapter deferrals.

Update the README with current runnable behavior and a short import example. Mark the Phase 3 Portable Cognition slice delivered and verified only after final checks. Set the next active Phase 3 slice to host integration contracts. Ensure no document claims persistence, publication, production readiness, or connector packaging.

- [ ] **Step 4: Search all Markdown for stale status**

Run:

```bash
grep -RInE "Portable Cognition|Phase 3|final verification|pending|0\\.1\\.0|0\\.2\\.0" --include='*.md' .
git diff --check
```

Review every hit and correct only contradictions caused by this slice.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md docs/ROADMAP.md spec/README.md rfcs/README.md rfcs/0003-portable-cognition-contract.md examples/portable-cognition.ts package.json docs/superpowers/specs/2026-07-27-portable-cognition-contract-design.md
git commit -m "docs: document portable cognition contract"
```

---

### Task 6: Review, Final Verification, and Integration

**Files:**
- Review: all feature-branch changes
- Modify: only files required to address verified review findings

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: Reviewed, verified, merged, pushed `master` with no leftover feature branch.

- [ ] **Step 1: Run focused review gates**

Review against:

- the approved design;
- every `PCR-*` rule;
- schema/runtime parity;
- compatibility policy and baseline immutability;
- strict package allowlists;
- diagnostic secrecy;
- depth and lexical boundaries;
- storage and connector neutrality; and
- prior user corrections.

- [ ] **Step 2: Fix findings through TDD**

For every behavioral finding:

1. add a failing focused regression test;
2. run it and confirm the expected failure;
3. make the smallest implementation correction;
4. rerun the focused test; and
5. rerun the adjacent suite.

- [ ] **Step 3: Run the complete verification matrix**

Run:

```bash
npm test
npx tsc --noEmit
npm run check
npm run example
npm run example:portable
npm run pack:check
git diff --check
```

Expected:

- all source, SourceRecord schema, Portable Cognition schema, compatibility, and package tests pass;
- clean TypeScript checking;
- both examples exit 0;
- clean package installation and artifact resolution;
- no diff whitespace errors.

- [ ] **Step 4: Record final evidence**

Record in the roadmap and RFC:

- final test counts;
- current baseline and normative artifact SHA-256 values;
- package version `0.2.0`;
- retained publication guard;
- review status; and
- remaining host-integration and adapter deferrals.

- [ ] **Step 5: Commit final review corrections**

```bash
git add -A
git commit -m "docs: finalize portable cognition contract"
```

Skip this commit only if Step 4 produced no tracked change.

- [ ] **Step 6: Merge and push**

```bash
git switch master
git merge --no-ff feature/portable-cognition-contract -m "merge: portable cognition contract"
git push origin master
git branch -d feature/portable-cognition-contract
```

- [ ] **Step 7: Verify integrated state**

Run:

```bash
npm test
git diff --check
git status --short --branch
test "$(git rev-parse master)" = "$(git rev-parse origin/master)"
test -z "$(git branch --list feature/portable-cognition-contract)"
```

Expected: tests pass, `master` is clean and matches `origin/master`, and the feature branch no longer exists locally.
