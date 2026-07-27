# Compatibility, Versioning, and Deprecation Implementation Plan

**Status:** Approved for implementation.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a language-neutral compatibility policy and executable `0.1.0` baseline that prevents silent drift across normative SourceRecord artifacts, the public package, TypeScript declarations, generic CLI behavior, error codes, and policy identities.

**Architecture:** A versioned JSON baseline records the current public and normative inventories. A new internal CLI contract module supplies parser constants without widening the package root, while independent black-box CLI tests verify observable behavior. A dedicated compatibility suite compares exact inventories, hashes immutable machine artifacts, checks stable prose rule identifiers, validates additive and breaking change cases, and keeps semantic classification human-reviewed.

**Tech Stack:** Node.js 24+, TypeScript 7, ESM, Node test runner, JSON/JSONL, SHA-256, npm package dry-run and clean-install tests.

## Global Constraints

- SourceRecord `0.1.0` and compatibility baseline `0.1.0` are Normative Stable.
- Existing versioned machine-readable normative artifacts are byte-immutable.
- Normative prose is semantically immutable but may receive behavior-preserving editorial corrections.
- Root package exports, declarations, package metadata listed by the baseline, and the generic CLI are Supported Experimental.
- Patch releases remain backward compatible.
- Before `1.0.0`, a breaking Supported Experimental change requires an accepted RFC, migration notes, deprecation handling, a new baseline version, and a non-patch release.
- CognitiveObject `version` remains an instance revision counter, not a package or schema version.
- The CLI selector `neutral-evidence-v1` and SDK policy identity `{ "id": "neutral-evidence", "version": "1" }` remain distinct contracts.
- Semantic compatibility classification requires human review; tests enforce declared inventories and process consequences only.
- Connector implementations, source-specific CLIs, examples, tests, scripts, and unexported source modules remain Internal.
- No production dependency is added.
- `"private": true` remains in `package.json`.
- No document may claim npm publication, `1.0.0` stability, production readiness, standards-body status, or universal interoperability.

## File Structure

```text
src/
  cli-contract.ts                         internal machine-readable CLI registry
  cli.ts                                  generic CLI consuming registry constants
tests/
  cli-contract.test.ts                    focused registry and parser-contract checks
  compatibility.test.mjs                  baseline, digest, policy, and change-case checks
  cli.test.ts                             independent black-box CLI contract tests
  package.test.mjs                        packed and clean-installed artifact checks
  conformance.test.ts                     baseline-owned root export check
spec/
  compatibility.md                        normative language-neutral policy
  source-record.md                        stable identifiers for existing prose rules
  compatibility/0.1.0/
    baseline.json                         exact public/normative inventory
    change-cases.jsonl                    additive and breaking process fixtures
rfcs/
  0002-compatibility-versioning-and-deprecation.md
  README.md
README.md
docs/ROADMAP.md
docs/superpowers/specs/2026-07-27-compatibility-versioning-deprecation-design.md
docs/superpowers/plans/2026-07-27-compatibility-versioning-deprecation.md
package.json
```

---

### Task 1: Extract the Internal CLI Contract

**Files:**
- Create: `src/cli-contract.ts`
- Create: `tests/cli-contract.test.ts`
- Modify: `src/cli.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the existing parser behavior and constants currently embedded in `src/cli.ts`.
- Produces: `CLI_CONTRACT`, `Command`, `InputFormat`, `CliStage`, `CliOptions`, `CLI_BASE_OPTION_NAMES`, and `CLI_PROMOTION_OPTION_NAMES` for `src/cli.ts` and compatibility tests.
- Does not produce: any new root package export or public package subpath.

- [ ] **Step 1: Write the failing registry test**

Create `tests/cli-contract.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { CLI_CONTRACT } from "../src/cli-contract.ts";

test("CLI registry describes the complete current command boundary", () => {
  assert.deepEqual(Object.keys(CLI_CONTRACT.commands), [
    "validate",
    "ingest",
    "promote",
    "ingest-promote",
  ]);
  assert.deepEqual(CLI_CONTRACT.defaults, {
    maxInputBytes: 10_485_760,
    maxRecords: 10_000,
    maxRecordBytes: 1_048_576,
  });
  assert.deepEqual(CLI_CONTRACT.formats, ["json", "jsonl"]);
  assert.deepEqual(CLI_CONTRACT.policySelectors, {
    "neutral-evidence-v1": {
      sdkExport: "neutralEvidencePolicyV1",
      id: "neutral-evidence",
      version: "1",
    },
  });
  assert.deepEqual(CLI_CONTRACT.diagnostics.stages, [
    "arguments",
    "input",
    "ingestion",
    "promotion",
    "output",
  ]);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/cli-contract.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/cli-contract.ts`.

- [ ] **Step 3: Add the exact internal registry**

Create `src/cli-contract.ts` with a JSON-compatible `CLI_CONTRACT` whose exact contract is:

| Item | Exact value |
| --- | --- |
| Commands | `validate`, `ingest`, `promote`, `ingest-promote` |
| Formats | `json`, `jsonl` |
| Base options | `input`, `format`, `max-input-bytes`, `max-records`, `max-record-bytes` |
| Promotion options | `policy`, `hypothesis-id`, `context-id`, `rationale`, `initiator-id`, `executor-id`, `accountable-id`, `promoted-at` |
| Base required options | `input`, `format` |
| Promotion required options | every base required option plus every promotion option |
| Limit defaults | `10485760`, `10000`, `1048576` |
| CLI selector | `neutral-evidence-v1` |
| SDK identity | export `neutralEvidencePolicyV1`, ID `neutral-evidence`, version `"1"` |
| Diagnostic fields | `code`, `message`, `details`, `stage` |
| Diagnostic stages | `arguments`, `input`, `ingestion`, `promotion`, `output` |
| CLI-authored codes | `CLI_ERROR`, `INPUT_READ_ERROR`, `INVALID_ARGUMENT` |
| Rejected-item codes | `INVALID_SOURCE_RECORD`, `SERIALIZATION_ERROR`, `SOURCE_REVISION_COLLISION` |
| Exit statuses | success `0`; top-level failure, any rejected item, or composed promotion failure `1`; duplicates-only `0` |

Use these exact TypeScript interfaces:

```ts
export type Command =
  | "validate"
  | "ingest"
  | "promote"
  | "ingest-promote";

export type InputFormat = "json" | "jsonl";

export type CliStage =
  | "arguments"
  | "input"
  | "ingestion"
  | "promotion"
  | "output";

export interface CliLimits {
  readonly maxInputBytes: number;
  readonly maxRecords: number;
  readonly maxRecordBytes: number;
}

export interface CliOptions {
  readonly command: Command;
  readonly input: string;
  readonly format: InputFormat;
  readonly limits: CliLimits;
  readonly promotion?: EvidencePromotionContext;
}
```

Import `EvidencePromotionContext` as a type from `promotion.ts`. Define `CLI_BASE_OPTION_NAMES` and `CLI_PROMOTION_OPTION_NAMES` as readonly tuples, and derive parser sets from them. Keep `CLI_CONTRACT` internal by omitting it from `src/index.ts`.

- [ ] **Step 4: Refactor the parser to consume registry constants**

Modify `src/cli.ts` to import the new types, option tuples, defaults, command names, formats, and policy selector. Remove only the duplicated local declarations.

Preserve these behaviors exactly:

```text
collective-cognition <command> [--option value]...
```

- command is the first argument;
- options use separate values and may appear in any order;
- unknown, duplicate, missing-value, positional, `--help`, and `--version` arguments fail with `INVALID_ARGUMENT`;
- positive safe integers use current JavaScript `Number()` coercion;
- promotion options are required for `promote` and `ingest-promote` and forbidden for `validate` and `ingest`;
- `neutral-evidence-v1` remains the only accepted selector.

- [ ] **Step 5: Add registry files to static checks**

Extend the `check` script in `package.json` with:

```text
node --disable-warning=ExperimentalWarning --check src/cli-contract.ts
node --disable-warning=ExperimentalWarning --check tests/cli-contract.test.ts
```

- [ ] **Step 6: Run focused and black-box tests**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/cli-contract.test.ts tests/cli.test.ts
npm run check
```

Expected: registry tests pass, all 16 existing black-box CLI tests pass, and static checks pass.

- [ ] **Step 7: Commit the CLI registry checkpoint**

```bash
git add src/cli-contract.ts src/cli.ts tests/cli-contract.test.ts package.json
git commit -m "refactor: expose internal CLI contract"
```

---

### Task 2: Add the Normative Compatibility Baseline

**Files:**
- Create: `spec/compatibility.md`
- Create: `spec/compatibility/0.1.0/baseline.json`
- Create: `spec/compatibility/0.1.0/change-cases.jsonl`
- Create: `rfcs/0002-compatibility-versioning-and-deprecation.md`
- Create: `tests/compatibility.test.mjs`
- Modify: `spec/source-record.md`
- Modify: `tests/conformance.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `CLI_CONTRACT`, built `dist/index.js`, built declaration files, current SourceRecord artifacts, `DomainErrorCode`, and `neutralEvidencePolicyV1`.
- Produces: the normative compatibility rules `COMP-001` through `COMP-018`, SourceRecord prose rules `SR-012` through `SR-015`, baseline `0.1.0`, and executable compatibility checks.

- [ ] **Step 1: Write the failing compatibility test**

Create `tests/compatibility.test.mjs` with:

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const baselineUrl = new URL(
  "../spec/compatibility/0.1.0/baseline.json",
  import.meta.url,
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function readJsonLines(url) {
  return readFileSync(url, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("compatibility baseline has the initial version", () => {
  assert.equal(readJson(baselineUrl).baselineVersion, "0.1.0");
});
```

Add failing tests named:

```text
compatibility baseline is immutable
normative machine artifacts match exact digests
normative prose exposes every stable rule identifier
root runtime and domain error inventories match exactly
root-reachable declaration closure matches exact digest
package compatibility metadata matches exactly
CLI registry matches the exact baseline
CLI and SDK promotion policy identities remain linked
change cases exercise additive and breaking process rules
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npm run build
node --test tests/compatibility.test.mjs
```

Expected: FAIL because `spec/compatibility/0.1.0/baseline.json` does not exist.

- [ ] **Step 3: Add exact change-case fixtures**

Create `spec/compatibility/0.1.0/change-cases.jsonl` with exactly:

```jsonl
{"id":"additive-cli-command","description":"Add an independent generic CLI command without changing existing commands, options, outputs, diagnostics, or exit behavior.","surface":"supported-experimental","classification":"additive","packageVersionEffect":"minor","requiresRfc":false,"requiresMigrationNotes":false,"requiresDeprecation":false}
{"id":"breaking-remove-root-export","description":"Remove the createObject root export while an existing package consumer imports it.","surface":"supported-experimental","classification":"breaking","packageVersionEffect":"minor-before-1.0","requiresRfc":true,"requiresMigrationNotes":true,"requiresDeprecation":true}
```

Its SHA-256 MUST be:

```text
4721623574266d41f953003b918bd2cd3a19d4b7d6401a10112610e02886f425
```

- [ ] **Step 4: Add stable SourceRecord prose identifiers**

Modify `spec/source-record.md` without changing behavior:

- classify SourceRecord `0.1.0` as Normative Stable while the package remains Supported Experimental;
- make `SR-005` explicitly name `(source.system, source.instance, sourceId, revisionId)`;
- add `SR-012` for validation-before-acceptance and accepted-record immutability;
- add `SR-013` for canonical equality over literal `mediaType` plus `content`;
- add `SR-014` for `INVALID_SOURCE_RECORD` and `SOURCE_REVISION_COLLISION`;
- add `SR-015` for immutable versioned machine artifacts and new-version replacement.

Do not add `SR-012` through `SR-015` to schema-fixture coverage because they are prose/runtime rules. The compatibility test checks their presence; existing source, ingestion, and promotion tests remain their behavioral evidence.

- [ ] **Step 5: Write the normative compatibility prose**

Create `spec/compatibility.md` with these exact stable identifiers:

| Rule | Requirement |
| --- | --- |
| `COMP-001` | More stable classification controls overlapping surfaces. |
| `COMP-002` | Normative Stable behavior cannot change in place. |
| `COMP-003` | Supported Experimental patches are backward compatible; pre-1.0 breaking minors follow the full process. |
| `COMP-004` | Internal paths create no compatibility promise. |
| `COMP-005` | Package PATCH, MINOR, and MAJOR meanings follow the approved policy. |
| `COMP-006` | Normative contract versions are independent of package versions. |
| `COMP-007` | CognitiveObject revision is not a package, schema, policy, or baseline version. |
| `COMP-008` | Existing policy identifiers cannot change meaning. |
| `COMP-009` | Existing compatibility baselines are immutable; changed inventories require a new version. |
| `COMP-010` | Additive changes preserve every previous conforming use and meaning. |
| `COMP-011` | Breaking changes can fail or change meaning for an existing conforming consumer. |
| `COMP-012` | Corrections are patch-compatible only when restoring a pre-existing normative requirement. |
| `COMP-013` | Deprecation requires an RFC, replacement, migration, retained tests, public marking, and earliest removal version. |
| `COMP-014` | Before 1.0, deprecated behavior survives at least one subsequent minor and is never removed in a patch. |
| `COMP-015` | Breaking replacement introduces a parallel path or an explicitly approved equivalent migration window. |
| `COMP-016` | Post-1.0 removal requires a major; normative artifact retirement requires its own RFC and support window. |
| `COMP-017` | This slice uses documentation and declarations, not runtime warning output, for deprecation signals. |
| `COMP-018` | Baseline failures require human classification and deliberate versioned updates. |

Include the full stability tables, version-domain definitions, change matrix, deprecation lifecycle, and explicit non-guarantees from the approved design. Use `MUST`, `MUST NOT`, `SHOULD`, and `MAY` only for normative requirements.

- [ ] **Step 6: Add accepted RFC 0002**

Create `rfcs/0002-compatibility-versioning-and-deprecation.md` with:

```markdown
# RFC 0002: Compatibility, Versioning, and Deprecation

**Status:** Accepted

**Created:** 2026-07-27
**Decision owner:** Project maintainer
```

Use repository-standard sections: Problem, Proposed Semantics, Alternatives, Compatibility and Migration, Security and Human Authority, Acceptance Checks, and Explicit Deferrals.

State explicitly:

- this is the inaugural baseline for unpublished package `0.1.0`;
- no existing behavior is removed;
- there is no fictional published-user migration;
- future backward-compatible additions use a minor release after publication;
- future pre-1.0 breaking changes require accepted RFC, migration notes, deprecation, a new baseline, and a non-patch release.

- [ ] **Step 7: Create baseline `0.1.0`**

Add the baseline's stable package subpath to `package.json` before comparing package metadata:

```json
"./compatibility/0.1.0": "./spec/compatibility/0.1.0/baseline.json"
```

Create `spec/compatibility/0.1.0/baseline.json` with these exact top-level keys:

```json
{
  "baselineVersion": "0.1.0",
  "packagePolicyVersion": "0.1.0",
  "appliesToPackageVersion": "0.1.0",
  "stabilityLevels": [
    "normative-stable",
    "supported-experimental",
    "internal"
  ],
  "normative": {},
  "package": {},
  "cli": {},
  "deprecations": []
}
```

Populate the exact inventories below.

**Normative inventory**

```text
SourceRecord rules: SR-001 through SR-015
Compatibility rules: COMP-001 through COMP-018
Schema path: spec/schemas/0.1.0/source-record.schema.json
Schema $id: urn:collective-cognition:schema:source-record:0.1.0
Schema package subpath: ./schemas/source-record/0.1.0
Source revision key: SR-005
Canonical revision equality: SR-013
Stable SourceRecord errors: SR-014
```

**Normative artifact digests**

```text
56cf53c5da98dfbec19a021fbb90673beab8248c7a77df44989b535a0e155648  spec/schemas/0.1.0/source-record.schema.json
f52c212026b70bf2b339e1132b2895c91be509f250dde841319dbbb4edd3f74a  spec/conformance/0.1.0/source-record/valid.jsonl
4705f32eb5ea48ddd693759728294d2557b0a6f4a5cc666843b2e03bb03e99c0  spec/conformance/0.1.0/source-record/invalid.jsonl
4721623574266d41f953003b918bd2cd3a19d4b7d6401a10112610e02886f425  spec/compatibility/0.1.0/change-cases.jsonl
```

**Package metadata**

```json
{
  "name": "collective-cognition-sdk",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "license": "Apache-2.0",
  "engines": { "node": ">=24" },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./compatibility/0.1.0": "./spec/compatibility/0.1.0/baseline.json",
    "./schemas/source-record/0.1.0": "./spec/schemas/0.1.0/source-record.schema.json",
    "./package.json": "./package.json"
  },
  "bin": {
    "collective-cognition": "./dist/cli.js"
  }
}
```

Record these exact 20 runtime exports:

```text
DomainError
DomainErrorCode
SOURCE_RECORD_MAX_JSON_DEPTH
SOURCE_RECORD_SCHEMA_VERSION
canonicalizeJson
createObject
createSourceRecord
deserializeObject
deserializeSourceRecord
evaluateAuthorization
ingestAndPromoteEvidence
ingestSourceRecordText
ingestSourceRecords
neutralEvidencePolicyV1
promoteSourceRecordsToEvidence
serializeObject
serializeSourceRecord
sourceRevisionKey
transitionObject
validateSourceRecord
```

Record these exact 54 type exports:

```text
ActorKind
Attribution
AuthorizationDecision
AuthorizationPolicy
AutomationMode
CognitionEvent
CognitiveObject
CognitiveObjectFor
ConsequenceLevel
CreateObjectInput
CreateObjectInputFor
CreateSourceRecordInput
DataByType
DecisionData
DecisionState
EvidenceData
EvidencePromotionContext
EvidencePromotionMapping
EvidencePromotionPolicy
EvidencePromotionRequest
EvidencePromotionResult
EvidenceState
ExperimentData
ExperimentState
GoalData
GoalState
HumanConfirmation
HypothesisData
HypothesisState
IdentityData
IdentityState
IngestAndPromoteEvidenceResult
IngestionBatchResult
IngestionItemResult
IngestionMode
IngestionOptions
IngestionTextOptions
JsonArray
JsonObject
JsonPrimitive
JsonValue
ObjectType
PrincipleData
PrincipleState
PromotionFailure
ProvenanceRef
Relationship
RelationshipType
SourceRecord
SourceRecordSource
StateByType
TransitionActor
TransitionContext
TransitionResult
```

Record these exact 10 error codes:

```text
AUTHORIZATION_DENIED
CONFIRMATION_REQUIRED
INGESTION_LIMIT_EXCEEDED
INVALID_OBJECT
INVALID_RELATIONSHIP
INVALID_SOURCE_RECORD
INVALID_TRANSITION
PROMOTION_FAILED
SERIALIZATION_ERROR
SOURCE_REVISION_COLLISION
```

Identify `INVALID_SOURCE_RECORD` and `SOURCE_REVISION_COLLISION` as the Normative Stable subset.

Record this exact root-reachable declaration closure:

```text
dist/authorization.d.ts
dist/errors.d.ts
dist/events.d.ts
dist/index.d.ts
dist/ingestion.d.ts
dist/objects.d.ts
dist/promotion.d.ts
dist/source-records.d.ts
dist/transitions.d.ts
dist/types.d.ts
```

Hash sorted files using:

```text
sha256(path + NUL + UTF-8 byte length + NUL + LF-normalized content + NUL)
```

The initial declaration digest MUST be:

```text
581ac45c474927e64f636c3abf40ce96e48c6081d3bafcc03f877ca50d34dbba
```

Copy the JSON-compatible `CLI_CONTRACT` value exactly under `cli`, including `formats`, `defaults`, `baseOptionNames`, `promotionOptionNames`, all commands, options, outputs, diagnostics, exit statuses, and the policy selector mapping.

After formatting the baseline with two-space JSON indentation and one terminal newline, calculate its digest:

```bash
shasum -a 256 spec/compatibility/0.1.0/baseline.json
```

Copy the exact 64-character output into `expectedBaselineSha256` in `tests/compatibility.test.mjs`, then add:

```js
test("compatibility baseline is immutable", () => {
  assert.equal(
    sha256(readFileSync(baselineUrl)),
    expectedBaselineSha256,
  );
});
```

- [ ] **Step 8: Complete baseline enforcement tests**

In `tests/compatibility.test.mjs`:

- import `dist/index.js` and `dist/cli-contract.js`;
- compare runtime export names and `DomainErrorCode` values by exact sorted equality;
- parse `src/index.ts` with the installed TypeScript compiler API and compare every named type export to `baseline.package.typeExports`;
- compare selected `package.json` metadata structurally;
- compare `CLI_CONTRACT` to `baseline.cli` by exact deep equality;
- verify `neutralEvidencePolicyV1.id` and `.version` against the selector mapping;
- verify every normative artifact digest;
- scan `spec/source-record.md` and `spec/compatibility.md` for the exact rule-ID inventories;
- discover the relative declaration closure reachable from `dist/index.d.ts`, compare its paths exactly to the baseline list, and compute the framed digest over that closure;
- validate exactly one additive and one breaking change case and their required process consequences;
- reject unknown stability levels, classifications, or package-version effects in the change cases.

Move the duplicated runtime-export assertion in `tests/conformance.test.ts` to baseline ownership. Keep source-neutral root enforcement in `tests/compatibility.test.mjs`.

Add this script:

```json
"test:compatibility": "node --test tests/compatibility.test.mjs"
```

Insert `npm run test:compatibility` after `npm run test:schema` in `test`, `pack:check`, and `prepack`. Each parent script already builds first, so `test:compatibility` itself MUST NOT rebuild.

Add `tests/compatibility.test.mjs` to `check`.

- [ ] **Step 9: Run the normative compatibility checks**

Run:

```bash
npm run build
npm run test:compatibility
node --disable-warning=ExperimentalWarning --test tests/source-records.test.ts tests/ingestion.test.ts tests/promotion.test.ts
npm run check
```

Expected: compatibility checks and all reused SourceRecord behavioral evidence pass.

- [ ] **Step 10: Commit the normative baseline checkpoint**

```bash
git add spec/compatibility.md spec/compatibility/0.1.0 spec/source-record.md rfcs/0002-compatibility-versioning-and-deprecation.md tests/compatibility.test.mjs tests/conformance.test.ts package.json
git commit -m "feat: add compatibility baseline"
```

---

### Task 3: Package and Install the Compatibility Artifacts

**Files:**
- Modify: `package.json`
- Modify: `tests/package.test.mjs`

**Interfaces:**
- Consumes: `spec/compatibility.md`, baseline `0.1.0`, change cases, RFC 0002, and the existing package build.
- Produces: installed subpath `collective-cognition-sdk/compatibility/0.1.0` and exact tarball/clean-consumer guarantees.

- [ ] **Step 1: Write failing package assertions**

Modify `tests/package.test.mjs` to require:

```js
assert.equal(
  packageJson.exports["./compatibility/0.1.0"],
  "./spec/compatibility/0.1.0/baseline.json",
);
```

Add these exact tarball paths:

```text
rfcs/0002-compatibility-versioning-and-deprecation.md
spec/compatibility.md
spec/compatibility/0.1.0/baseline.json
spec/compatibility/0.1.0/change-cases.jsonl
```

Extend the clean consumer to:

```ts
import compatibilityBaseline from "collective-cognition-sdk/compatibility/0.1.0"
  with { type: "json" };

if (compatibilityBaseline.baselineVersion !== "0.1.0") {
  throw new Error("installed compatibility baseline is not discoverable");
}
```

Add an installed JavaScript check that resolves the baseline subpath, reads `change-cases.jsonl` relative to that resolved file, parses both lines, and confirms classifications `additive` and `breaking`.

- [ ] **Step 2: Run package tests to verify RED**

Run:

```bash
npm run build
node --test tests/package.test.mjs
```

Expected: FAIL because the package allowlist and clean-install assertions do not yet include the compatibility artifacts.

- [ ] **Step 3: Add package export and allowlist**

Add the four exact compatibility/RFC files to `package.json` `files`. Do not add source, tests, plans, examples, connectors, or local reports. Retain the `./compatibility/0.1.0` export added in Task 2.

- [ ] **Step 4: Verify packed and installed behavior**

Run:

```bash
npm run pack:check
npm run test:compatibility
```

Expected:

- package dry-run matches the exact allowlist;
- clean install imports the package root, SourceRecord schema, and compatibility baseline;
- installed executable still validates canonical SourceRecord input;
- installed change cases are readable relative to the baseline artifact.

- [ ] **Step 5: Commit the package checkpoint**

```bash
git add package.json tests/package.test.mjs
git commit -m "test: lock package compatibility artifacts"
```

---

### Task 4: Synchronize Public Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `spec/README.md`
- Modify: `rfcs/README.md`
- Modify: `rfcs/0001-universal-source-record-ingestion.md`
- Modify: `docs/superpowers/specs/2026-07-27-compatibility-versioning-deprecation-design.md`

**Interfaces:**
- Consumes: implemented baseline, tests, package subpath, RFC 0002, and the three stability levels.
- Produces: one consistent public explanation of what is stable, experimental, internal, packaged, and still deferred.

- [ ] **Step 1: Update the public README**

Document:

- SourceRecord `0.1.0` and compatibility baseline `0.1.0` are Normative Stable;
- the package root and generic CLI are Supported Experimental before `1.0.0`;
- connectors and unexported source modules are Internal;
- the baseline locks runtime/type exports, selected package metadata, declaration closure, CLI behavior, error codes, policy identities, and normative artifact hashes;
- consumers can resolve `collective-cognition-sdk/compatibility/0.1.0`;
- compatibility tests do not automatically determine semantic compatibility;
- npm publication, registry confirmation, runtime/security policy, broader schemas, and production readiness remain open.

Add:

```bash
npm run build
npm run test:compatibility
```

Link `spec/compatibility.md` and RFC 0002.

- [ ] **Step 2: Update the roadmap**

Under Phase 3:

- mark the compatibility design approved;
- add the compatibility slice as delivered pending final verification;
- list normative prose, RFC 0002, baseline, change cases, stable package subpath, exact export/CLI/error/policy/digest tests;
- mark the additive and breaking process examples complete;
- leave broader cognitive schemas, host integration, registry publication, runtime policy, and security policy open.

Reframe Phase 6 migration/deprecation work as operational governance and retirement tooling built on the Phase 3 policy, not creation of the first policy.

- [ ] **Step 3: Update specification and RFC indexes**

In `spec/README.md`:

- list SourceRecord and compatibility baseline as implemented normative contracts;
- link compatibility prose, baseline, change cases, test, design, and RFC 0002;
- remove compatibility/versioning/deprecation from planned content and publication blockers;
- retain broader schema and host-contract deferrals.

In `rfcs/README.md`:

- rename `Implemented RFCs` to `RFC Index`;
- list RFC 0001 as implemented;
- list RFC 0002 as accepted pending final verification.

In RFC 0001, add only a historical note and evidence link showing that later evolution is governed by RFC 0002 and `spec/compatibility.md`. Do not rewrite RFC 0001 semantics.

- [ ] **Step 4: Reconcile design status**

Replace the design's single status line with:

```markdown
**Architecture direction:** Approved.

**Implementation status:** Implemented; final verification pending.
```

- [ ] **Step 5: Check all Markdown**

Run:

```bash
find . -path './node_modules' -prune -o -path './dist' -prune -o -name '*.md' -type f -print | sort
grep -RniE 'compatibility.*planned|no compatibility|future compatibility' --include='*.md' --exclude-dir=node_modules --exclude-dir=dist .
git diff --check
```

Review every match and keep only explicitly historical or still-accurate statements.

- [ ] **Step 6: Commit the documentation checkpoint**

```bash
git add README.md docs/ROADMAP.md spec/README.md rfcs/README.md rfcs/0001-universal-source-record-ingestion.md docs/superpowers/specs/2026-07-27-compatibility-versioning-deprecation-design.md
git commit -m "docs: document compatibility guarantees"
```

---

### Task 5: Verify, Review, Integrate, and Push

**Files:**
- Modify after verification: `rfcs/0002-compatibility-versioning-and-deprecation.md`
- Modify after verification: `docs/ROADMAP.md`
- Modify after verification: `docs/superpowers/specs/2026-07-27-compatibility-versioning-deprecation-design.md`
- Modify after verification: `docs/superpowers/plans/2026-07-27-compatibility-versioning-deprecation.md`

**Interfaces:**
- Consumes: every implementation and documentation artifact from Tasks 1–4.
- Produces: verified status, independent review evidence, merged `master`, pushed origin, and no leftover feature branch.

- [ ] **Step 1: Run focused compatibility verification**

Run:

```bash
npm run build
node --disable-warning=ExperimentalWarning --test tests/cli-contract.test.ts tests/cli.test.ts
npm run test:compatibility
node --test tests/package.test.mjs
```

Expected: all focused suites pass.

- [ ] **Step 2: Run the complete local verification matrix**

Run:

```bash
npm test
npx tsc --noEmit
npm run check
npm run example
npm run pack:check
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 3: Request independent code review**

Use `superpowers:requesting-code-review`. Require review of:

- compatibility-policy correctness;
- exact baseline completeness;
- immutable-artifact enforcement;
- CLI behavior preservation;
- declaration digest determinism;
- package export and tarball boundaries;
- policy identity mapping;
- documentation truthfulness;
- security or secret-leak regressions.

Resolve every finding and rerun the narrowest affected test, then rerun the complete matrix.

- [ ] **Step 4: Mark final statuses**

After tests and review pass:

- set RFC 0002 to `Implemented and final-review verified`;
- set the design implementation status to `Implemented and verified`;
- mark the Phase 3 compatibility slice delivered and verified;
- set this plan status to `Complete, verified, and integrated`;
- check every plan box.

- [ ] **Step 5: Commit final verification status**

```bash
git add rfcs/0002-compatibility-versioning-and-deprecation.md docs/ROADMAP.md docs/superpowers/specs/2026-07-27-compatibility-versioning-deprecation-design.md docs/superpowers/plans/2026-07-27-compatibility-versioning-deprecation.md
git commit -m "docs: finalize compatibility contract"
```

- [ ] **Step 6: Merge and verify master**

```bash
git switch master
git merge --no-ff feature/compatibility-contract -m "merge: compatibility contract"
npm test
git status --short --branch
```

Expected: tests pass on `master` and the tree is clean.

- [ ] **Step 7: Push and remove the merged branch**

```bash
git push origin master
git branch -d feature/compatibility-contract
```

Expected: `origin/master` contains the merge commit and no unneeded local feature branch remains.
