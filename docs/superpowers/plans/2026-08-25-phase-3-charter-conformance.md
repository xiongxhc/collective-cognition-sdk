# Phase 3 Charter and Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the language-neutral Charter, exact standalone cognition payload projections, reference validators, conformance fixtures, and a private testable `0.11.0` package.

**Architecture:** Portable Cognition `0.1.0` remains immutable and authoritative. Standalone cognitive-object and cognition-event resources reuse its complete `$defs` graph and validate through an implicit canonical Portable Cognition envelope; the TypeScript reference wrappers delegate to the existing portable runtime rather than duplicating semantic rules.

**Tech Stack:** TypeScript 7, Node.js 24, Node test runner, JSON Schema Draft 2020-12, Ajv 8, JSONL fixtures, npm package exports.

**Spec:** `docs/superpowers/specs/2026-08-25-phase-3-completion-design.md`

## Global Constraints

- Preserve every existing `0.1.0` contract, schema, fixture, profile, and historical compatibility baseline byte-for-byte.
- Package `0.11.0` remains private and unpublished; do not remove `"private": true` or contact npm publication endpoints.
- Standalone payloads use contract version `0.1.0`; the Charter uses `1.0.0`; neither version is the npm package version.
- A standalone payload conforms if and only if the implicit Portable Cognition `0.1.0` envelope conforms.
- Standalone payload-relative maximum JSON container depth is exactly `255`.
- Malformed standalone JSON text reports `SERIALIZATION_ERROR`; invalid payload structure, depth, or semantics reports `INVALID_PORTABLE_COGNITION_RECORD`.
- The twelve-code root domain-error catalog and eleven-code Portable Cognition catalog remain distinct.
- Source collection never implies Evidence, Decision, Principle, truth, belief, or organizational acceptance.
- No Team Memory, Git, Markdown, Obsidian, SQLite, TypeScript, or host-specific behavior becomes normative.
- Use test-first development for every runtime or verification behavior.

## File Structure

```text
src/
  cognition-projections.ts              standalone TypeScript reference wrappers
spec/
  collective-cognition-charter.md       normative Charter 1.0.0 and rule mapping
  schemas/0.1.0/
    cognitive-object.schema.json         exact standalone payload projection
    cognition-event.schema.json          exact standalone event projection
  conformance/0.1.0/
    cognitive-object/
      valid.jsonl                        seven valid object families and boundaries
      invalid.jsonl                      structural, lexical, depth, relationship cases
    cognition-event/
      valid.jsonl                        valid events and confirmation variants
      invalid.jsonl                      event, correlation, and lexical failures
      lifecycle.jsonl                    linked objects/events and expected outcomes
  compatibility/0.11.0/
    baseline.json                        private additive package baseline
    change-cases.jsonl                   compatibility classifications
tests/
  charter.test.ts                        Charter inventory and rule mapping
  cognition-projection-schema.test.mjs   schema and fixture equivalence
  cognition-projections.test.ts          runtime wrappers and lexical/depth behavior
  cognition-projection-conformance.test.ts linked lifecycle/reference checks
rfcs/
  0012-phase-3-charter-and-stable-package.md
```

---

### Task 1: Charter Rule Inventory and RFC

**Files:**
- Create: `tests/charter.test.ts`
- Create: `spec/collective-cognition-charter.md`
- Create: `rfcs/0012-phase-3-charter-and-stable-package.md`
- Modify: `spec/README.md`
- Modify: `rfcs/README.md`

**Interfaces:**
- Consumes: existing SourceRecord, Portable Cognition, Host Integration, Runtime and Security, and compatibility prose.
- Produces: normative Charter rule IDs `CCC-001` through `CCC-025`, each mapped to `schema`, `fixture`, `test`, or `prose-only` evidence.

- [ ] **Step 1: Write the failing Charter inventory test**

Create `tests/charter.test.ts` with a fixed rule list and evidence check:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const charter = readFileSync(
  new URL("../spec/collective-cognition-charter.md", import.meta.url),
  "utf8",
);
const expectedRules = Array.from(
  { length: 25 },
  (_, index) => `CCC-${String(index + 1).padStart(3, "0")}`,
);

test("publishes one mapped definition for every Charter rule", () => {
  const headings = [...charter.matchAll(/^### (CCC-\d{3}) /gm)].map((match) => match[1]);
  const mappings = [...charter.matchAll(/^\| (CCC-\d{3}) \| (schema|fixture|test|prose-only) \|/gm)]
    .map((match) => match[1]);
  assert.deepEqual(headings, expectedRules);
  assert.deepEqual(mappings.sort(), [...expectedRules].sort());
  for (const ruleId of expectedRules) {
    assert.equal((charter.match(new RegExp(`^### ${ruleId} `, "gm")) ?? []).length, 1);
    assert.match(charter, new RegExp(`^\\| ${ruleId} \\| (schema|fixture|test|prose-only) \\|`, "m"));
  }
  const firstRule = charter.indexOf("### CCC-001 ");
  assert.equal(/\b(?:MUST|MUST NOT|SHOULD|SHOULD NOT)\b/.test(charter.slice(0, firstRule)), false);
});

test("states the non-claims and split portable error catalog", () => {
  assert.match(charter, /does not define organizational truth/i);
  assert.match(charter, /INVALID_HOST_INTEGRATION_REQUEST/);
  assert.match(charter, /Portable Cognition.*eleven-code/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --disable-warning=ExperimentalWarning --test tests/charter.test.ts`

Expected: FAIL because `spec/collective-cognition-charter.md` does not exist.

- [ ] **Step 3: Write the normative Charter**

Create exactly one section for each rule:

```text
CCC-001 version domains
CCC-002 JSON and lexical profile
CCC-003 source observation boundary
CCC-004 cognitive-object envelope
CCC-005 attribution roles
CCC-006 provenance references
CCC-007 Identity semantics
CCC-008 Goal semantics
CCC-009 Hypothesis semantics
CCC-010 Experiment semantics
CCC-011 Evidence semantics
CCC-012 Decision semantics
CCC-013 Principle semantics
CCC-014 relationships and reference integrity
CCC-015 lifecycle transitions
CCC-016 cognition events
CCC-017 authorization decisions
CCC-018 human confirmation
CCC-019 explicit promotion
CCC-020 stable domain errors
CCC-021 host security boundary
CCC-022 persistence and publication boundary
CCC-023 namespaced extensions
CCC-024 conformance claims
CCC-025 explicit non-claims
```

Use RFC 2119 requirement terms, link every composed existing contract, include the twelve-code root and eleven-code portable error tables, and finish with the rule-to-evidence table asserted by the test.

- [ ] **Step 4: Record the Phase 3 decision**

Create RFC 0012 with status `Accepted for Phase 3 implementation`, the contract-first architecture, immutable Portable Cognition projection decision, stable/experimental maturity distinction, release sequence, and explicit deferrals. Update both indexes with exact links.

- [ ] **Step 5: Run focused tests and syntax checks**

Run: `node --disable-warning=ExperimentalWarning --test tests/charter.test.ts && git diff --check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/charter.test.ts spec/collective-cognition-charter.md spec/README.md rfcs/0012-phase-3-charter-and-stable-package.md rfcs/README.md
git commit -m "docs: add collective cognition charter"
```

### Task 2: Standalone Projection Schemas and Fixtures

**Files:**
- Create: `tests/cognition-projection-schema.test.mjs`
- Create: `spec/schemas/0.1.0/cognitive-object.schema.json`
- Create: `spec/schemas/0.1.0/cognition-event.schema.json`
- Create: `spec/conformance/0.1.0/cognitive-object/valid.jsonl`
- Create: `spec/conformance/0.1.0/cognitive-object/invalid.jsonl`
- Create: `spec/conformance/0.1.0/cognition-event/valid.jsonl`
- Create: `spec/conformance/0.1.0/cognition-event/invalid.jsonl`
- Create: `spec/conformance/0.1.0/cognition-event/lifecycle.jsonl`

**Interfaces:**
- Consumes: `spec/schemas/0.1.0/portable-cognition.schema.json` and its `$defs.cognitiveObject` and `$defs.cognitionEvent` definitions.
- Produces: independently compilable schemas whose `$defs` graph is byte-semantic-equivalent to Portable Cognition `0.1.0`, plus language-neutral fixtures.

- [ ] **Step 1: Write the failing schema equivalence test**

The test must load all three schemas, assert each standalone `$defs` value deeply equals the Portable Cognition `$defs`, and compile these roots:

```js
assert.equal(cognitiveObjectSchema.$ref, "#/$defs/cognitiveObject");
assert.equal(cognitionEventSchema.$ref, "#/$defs/cognitionEvent");
assert.deepEqual(cognitiveObjectSchema.$defs, portableSchema.$defs);
assert.deepEqual(cognitionEventSchema.$defs, portableSchema.$defs);
```

Compile with Ajv 2020 and `ajv-formats`. For every valid fixture, assert the direct standalone schema and an implicit Portable Cognition envelope both accept. For every schema-layer invalid fixture, assert both reject.

- [ ] **Step 2: Run the schema test and verify RED**

Run: `node --test tests/cognition-projection-schema.test.mjs`

Expected: FAIL because the standalone schemas and fixture files do not exist.

- [ ] **Step 3: Add exact standalone schemas**

Each schema must have Draft 2020-12 metadata, a distinct stable `$id`, the exact root `$ref`, and a deep copy of the complete immutable Portable Cognition `$defs` object:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://collective-cognition-sdk.dev/schemas/cognitive-object/0.1.0",
  "title": "Collective Cognition Cognitive Object Projection 0.1.0",
  "$ref": "#/$defs/cognitiveObject",
  "$defs": {}
}
```

Populate `$defs` from the existing portable schema without changing key order or values. The event schema uses `$id` ending `/cognition-event/0.1.0` and `$ref` `#/$defs/cognitionEvent`.

- [ ] **Step 4: Add normative valid and invalid fixtures**

Valid cognitive-object JSONL contains all seven object types and includes extension, optional-data, maximum-version, and relationship variants. Invalid entries use this closed metadata shape:

```json
{"description":"hypothesis missing supports-goal","ruleId":"CCC-014","expectedCode":"INVALID_PORTABLE_COGNITION_RECORD","validationLayer":"schema","payload":{}}
```

Lexical entries use `payloadJson`; runtime depth entries use `validationLayer: "runtime"`. Include depth-255 valid and depth-256 invalid fixtures for each projection. Event valid fixtures include manual, automated, routine, consequential, and human-confirmed cases. Event invalid fixtures cover state/type mismatch, forbidden transition, same-state transition, version zero, future confirmation, mismatched object/event/state binding, duplicate members, lone surrogates, and depth.

Lifecycle JSONL entries contain `description`, `objects`, `event`, and `expected` with `valid`, `code`, and optional `reason`. Cover every allowed lifecycle edge and representative forbidden edges for all seven families.

- [ ] **Step 5: Run projection and existing schema tests**

Run: `node --test tests/cognition-projection-schema.test.mjs tests/portable-cognition-schema.test.mjs tests/schema-conformance.test.mjs`

Expected: PASS with historical Portable Cognition files unchanged.

- [ ] **Step 6: Commit**

```bash
git add tests/cognition-projection-schema.test.mjs spec/schemas/0.1.0/cognitive-object.schema.json spec/schemas/0.1.0/cognition-event.schema.json spec/conformance/0.1.0/cognitive-object spec/conformance/0.1.0/cognition-event
git commit -m "feat: add standalone cognition schemas"
```

### Task 3: TypeScript Reference Projection Validators

**Files:**
- Create: `tests/cognition-projections.test.ts`
- Create: `src/cognition-projections.ts`
- Modify: `src/index.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `deserializePortableCognitionRecord`, `validatePortableCognitionRecord`, `CognitiveObject`, and `CognitionEvent`.
- Produces:

```ts
export const COGNITIVE_OBJECT_PROJECTION_VERSION = "0.1.0";
export const COGNITION_EVENT_PROJECTION_VERSION = "0.1.0";
export const COGNITION_PROJECTION_MAX_JSON_DEPTH = 255;
export function validateCognitiveObjectProjection(value: unknown): asserts value is CognitiveObject;
export function deserializeCognitiveObjectProjection(text: string): CognitiveObject;
export function validateCognitionEventProjection(value: unknown): asserts value is CognitionEvent;
export function deserializeCognitionEventProjection(text: string): CognitionEvent;
```

- [ ] **Step 1: Write failing runtime tests**

Load the new JSONL fixtures. Assert constants, all valid payloads, schema/runtime invalid payloads, lexical duplicate/lone-surrogate rejection, exact error-code split, depth 255/256, returned deep freezing, caller-reference isolation, no accessor invocation, and equivalence with canonical Portable Cognition envelopes.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --disable-warning=ExperimentalWarning --test tests/cognition-projections.test.ts`

Expected: FAIL because `src/cognition-projections.ts` and root exports do not exist.

- [ ] **Step 3: Implement the minimal wrapper module**

Use one private in-memory wrapper function:

```ts
function wrapProjection(
  recordType: "cognitive-object" | "cognition-event",
  payload: unknown,
): PortableCognitionRecord {
  return { schemaVersion: "0.1.0", recordType, payload } as PortableCognitionRecord;
}
```

In-memory validators call `validatePortableCognitionRecord` on the wrapper. Deserializers preserve the standalone text byte semantics by embedding the raw text in a canonical envelope and delegating to `deserializePortableCognitionRecord`:

```ts
const envelopeText = `{"schemaVersion":"0.1.0","recordType":"${recordType}","payload":${text}}`;
return deserializePortableCognitionRecord(envelopeText).payload;
```

This keeps the immutable error split: malformed JSON syntax is `SERIALIZATION_ERROR`, while duplicate members, lone surrogates, structure, depth, and semantic failures are `INVALID_PORTABLE_COGNITION_RECORD`. Return the already isolated and deeply frozen payload. Do not duplicate state, relationship, transition, timestamp, or confirmation tables.

- [ ] **Step 4: Export the reference API and include syntax checks**

Export all seven names from `src/index.ts`. Add `src/cognition-projections.ts` and `tests/cognition-projections.test.ts` to the repository `check` script.

- [ ] **Step 5: Run focused and adjacent tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/cognition-projections.test.ts tests/portable-cognition.test.ts tests/objects.test.ts tests/transitions.test.ts && npx tsc --noEmit && npm run check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cognition-projections.ts src/index.ts tests/cognition-projections.test.ts package.json
git commit -m "feat: add cognition projection validators"
```

### Task 4: Linked Conformance and Reference Integrity

**Files:**
- Create: `tests/cognition-projection-conformance.test.ts`
- Modify: `spec/collective-cognition-charter.md`
- Modify: `spec/conformance/0.1.0/cognition-event/lifecycle.jsonl`
- Modify: `package.json`

**Interfaces:**
- Consumes: projection validators, lifecycle fixtures, object relationship types, and transition tables.
- Produces: reusable language-neutral expected outcomes for target existence, target-type compatibility, event/object correlation, and append-only history.

- [ ] **Step 1: Write failing linked-conformance tests**

For each lifecycle fixture, build an object map and assert:

```ts
assert.equal(event.objectVersion, resultingObject.version);
assert.equal(event.objectId, resultingObject.id);
assert.equal(event.objectType, resultingObject.type);
assert.equal(event.nextState, resultingObject.state);
assert.equal(resultingObject.version, previousObject.version + 1);
```

Resolve every relationship `targetId` except `considers-option`, whose `targetId` is an opaque external option symbol such as `option:adopt`. Reject missing cognitive-object targets and target object types incompatible with the Charter's relationship table: `parent-goal`/`supports-goal` target Goal; `tests-hypothesis`/`supports-hypothesis`/`challenges-hypothesis`/`relates-hypothesis` target Hypothesis; `observed-in-experiment` targets Experiment; `informs-decision`/`justified-by-decision` target Decision; `accountable-identity` targets Identity; and `justified-by-evidence` targets Evidence. Clone fixtures before validation and assert no historical object or event is mutated.

- [ ] **Step 2: Run and verify RED**

Run: `node --disable-warning=ExperimentalWarning --test tests/cognition-projection-conformance.test.ts`

Expected: FAIL on the first deliberately incomplete lifecycle/reference fixture.

- [ ] **Step 3: Complete fixtures and Charter tables**

Add the relationship source/target compatibility table and lifecycle transition table to the Charter. Complete lifecycle fixtures so every declared allowed edge passes and each invalid case reports `INVALID_RELATIONSHIP`, `INVALID_TRANSITION`, or `INVALID_PORTABLE_COGNITION_RECORD` according to its validation layer.

- [ ] **Step 4: Add the test to syntax verification and run conformance**

Run: `node --disable-warning=ExperimentalWarning --test tests/cognition-projection-conformance.test.ts tests/cognition-projections.test.ts tests/cognitive-loop.test.ts tests/host-conformance.test.ts && npm run check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/cognition-projection-conformance.test.ts spec/collective-cognition-charter.md spec/conformance/0.1.0/cognition-event/lifecycle.jsonl package.json
git commit -m "test: add cognition lifecycle conformance"
```

### Task 5: Fictional External Host Acceptance

**Files:**
- Create: `examples/stable-external-host.ts`
- Create: `tests/stable-external-host.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: SourceRecord creation/ingestion, explicit neutral Evidence promotion, cognitive-object creation/transitions, SQLite cognition store, Host Integration, and Portable Cognition export.
- Produces: one end-to-end fictional external-host result with persisted/reloaded Identity, Goal, Hypothesis, Evidence, Decision, and cognition events.

- [ ] **Step 1: Write the failing end-to-end test**

Run the example in a child process with an explicit temporary cognition database and two fictional SourceRecords. Assert JSON output exactly reports:

```json
{
  "sourceRecords": 2,
  "ingestedSourceRecords": 2,
  "identities": 1,
  "goals": 1,
  "hypotheses": 1,
  "evidence": 2,
  "decisions": 1,
  "persistedObjects": 6,
  "reloadedObjects": 6,
  "persistedEvents": 3,
  "reloadedEvents": 3,
  "portableRecords": 9
}
```

Also assert the temporary source fixtures and cognition database are separate paths and no Team Vault path or real identity appears.

- [ ] **Step 2: Run and verify RED**

Run: `node --disable-warning=ExperimentalWarning --test tests/stable-external-host.test.ts`

Expected: FAIL because `examples/stable-external-host.ts` does not exist.

- [ ] **Step 3: Implement the minimal host example**

Create one Identity, one Goal, one Hypothesis linked by `supports-goal`, two neutral Evidence objects promoted from two ingested fictional SourceRecords, and one Decision with `supports-goal`, `justified-by-evidence`, `considers-option`, and `accountable-identity` pointing to the created Identity. Persist through an explicitly supplied temporary SQLite cognition store, reload all six objects and all three events using object reads plus `listObjectEvents`, and serialize all six objects plus three events as Portable Cognition. Do not discover a source ledger or vault.

- [ ] **Step 4: Run focused and durable integration tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/stable-external-host.test.ts tests/sqlite-store.test.ts tests/host-integration.test.ts tests/portable-cognition.test.ts`

Expected: PASS with the exact summary above.

- [ ] **Step 5: Add syntax/example scripts and commit**

Add `examples/stable-external-host.ts` and its test to `npm run check`. Add `example:stable-host` for the explicit-path example and `example:stable-host:acceptance` for the self-contained no-argument test harness.

```bash
git add examples/stable-external-host.ts tests/stable-external-host.test.ts package.json
git commit -m "test: add stable external host acceptance"
```

### Task 6: Private `0.11.0` Package and Documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `spec/compatibility/0.11.0/baseline.json`
- Create: `spec/compatibility/0.11.0/change-cases.jsonl`
- Modify: `tests/compatibility.test.mjs`
- Modify: `tests/package.test.mjs`
- Modify: `tests/distribution-readiness-profile.test.ts`
- Modify: `tests/release-readiness.test.ts`
- Modify: `README.md`
- Modify: `docs/public-api.md`
- Modify: `docs/ROADMAP.md`
- Modify: `spec/README.md`
- Modify: `rfcs/0011-cross-connector-interoperability.md`
- Modify: `docs/connector-author-guide.md`
- Modify: `docs/markdown-cognition-adapter-guide.md`
- Modify: `SECURITY.md`
- Modify: `SUPPORT.md`

**Interfaces:**
- Consumes: all Task 1-5 resources, exports, and external-host evidence.
- Produces: private package `0.11.0`, compatibility baseline `0.11.0`, eight stable resource subpaths, and documentation that marks only Slice A complete.

- [ ] **Step 1: Write failing package and compatibility expectations**

Add exact expected subpaths:

```text
./charter/1.0.0
./schemas/cognitive-object/0.1.0
./schemas/cognition-event/0.1.0
./conformance/cognitive-object/0.1.0/valid
./conformance/cognitive-object/0.1.0/invalid
./conformance/cognition-event/0.1.0/valid
./conformance/cognition-event/0.1.0/invalid
./conformance/cognition-event/0.1.0/lifecycle
```

Assert package version `0.11.0`, `private === true`, new root declarations, exact tarball files, clean consumer resource resolution, and historical resource digests unchanged. Add explicit parsing tests proving compatibility/profile version fields accept `1.0.0-rc.1` and `0.2.0-rc.1` without creating those release artifacts yet.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/compatibility.test.mjs tests/package.test.mjs && node --disable-warning=ExperimentalWarning --test tests/distribution-readiness-profile.test.ts`

Expected: FAIL on package version, missing baseline, subpaths, files, and prerelease-version cases.

- [ ] **Step 3: Add the private package baseline**

Bump package and lockfile to `0.11.0`, retain `"private": true`, add all eight exports and allowlisted files, then record:

- complete root runtime/type export inventories including the seven projection exports;
- all historical and new package subpaths;
- all four executable contracts unchanged;
- declaration closure digests;
- Charter/schema/fixture digests; and
- additive change cases for the Charter, projections, validators, and package resources.

After all Task 3-5 `package.json` script additions are present, review the
complete final script map and pin its canonical SHA-256 in
`tests/release-readiness.test.ts` exactly once. Do not modify older baseline
or profile bytes.

- [ ] **Step 4: Synchronize public Markdown**

Document the four-layer architecture, projection quick start, resource resolution, external-host example, private `0.11.0` status, exact remaining Phase 3 gates, stable-vs-experimental maturity policy, adapter/connector conformance boundaries, host security responsibilities, support policy, and no production claim. Mark RFC 0011 implementation and verification accurately instead of leaving its old pending packaging text.

- [ ] **Step 5: Run the complete Slice A gate**

Run:

```bash
npm test
npx tsc --noEmit
npm run check
npm run example
npm run example:portable
npm run example:host
npm run example:markdown
npm run example:workflow
npm run example:interoperability
npm run example:stable-host:acceptance
npm run pack:check
git diff --check
```

Expected: all commands pass; package remains private and unpublished.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json spec/compatibility/0.11.0 tests/compatibility.test.mjs tests/package.test.mjs tests/distribution-readiness-profile.test.ts tests/release-readiness.test.ts README.md docs/public-api.md docs/ROADMAP.md spec/README.md rfcs/0011-cross-connector-interoperability.md docs/connector-author-guide.md docs/markdown-cognition-adapter-guide.md SECURITY.md SUPPORT.md
git commit -m "feat: package Phase 3 contract candidate"
```

## Slice A Completion Gate

- Run an independent specification review and an independent code/security review over the full Slice A diff.
- Correct every Critical and Important finding, rerun the complete gate, and record observed test counts and immutable-resource comparisons in `docs/ROADMAP.md`.
- Slice A is complete only when private `0.11.0` installs cleanly and resolves all eight new resources from its exact tarball.
