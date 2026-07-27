# SourceRecord Normative Conformance Implementation Plan

**Status:** Implementation complete; final review pending.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a versioned, language-neutral SourceRecord JSON Schema and normative fixture suite that remains behaviorally aligned with the TypeScript SDK, generic CLI, and packed artifact.

**Architecture:** JSON Schema Draft 2020-12 is the portable serialized contract. Ajv validates the schema only in development tests; the existing TypeScript validator remains the runtime implementation. Versioned fixtures drive both validators and the CLI, while package tests guarantee consumers receive the same normative artifacts.

**Tech Stack:** Node.js 24+, TypeScript 7, JSON Schema Draft 2020-12, Ajv 8, ajv-formats 3, Node test runner, npm package dry-run and clean-install tests.

## Global Constraints

- The serialized JSON contract is normative and language-neutral.
- `schemaVersion` remains exactly `"0.1.0"` in this slice.
- The schema `$id` is `urn:collective-cognition:schema:source-record:0.1.0`.
- Ajv and ajv-formats are development dependencies only.
- The SDK runtime must not depend on a schema validator.
- Source collection remains separate from cognitive interpretation.
- `contentHash` remains opaque caller-supplied metadata.
- Runtime-only JavaScript hardening is not represented as cross-language JSON.
- `"private": true` remains in `package.json`.
- No document may claim publication, licensing, production readiness, or cross-language-standard status.

## Deferred Work

- Cognitive-object, relationship, transition, authorization, event, and error schemas.
- Host persistence and event-publication contracts.
- Complete compatibility, deprecation, migration, licensing, registry-name, security, and publication policies.
- Connector packaging and marketplace behavior.

---

### Task 1: Add the Versioned Schema and Normative Fixtures

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/schema-conformance.test.mjs`
- Create: `spec/schemas/0.1.0/source-record.schema.json`
- Create: `spec/conformance/0.1.0/source-record/valid.jsonl`
- Create: `spec/conformance/0.1.0/source-record/invalid.jsonl`

**Interfaces:**
- Consumes: the serialized `SourceRecord` behavior defined by `src/source-records.ts`.
- Produces: a Draft 2020-12 schema and versioned fixture files consumed by runtime, CLI, and package tests.

- [x] **Step 1: Install schema-test dependencies**

Run:

```bash
npm install --save-dev ajv@^8.17.1 ajv-formats@^3.0.1
```

Expected: `package.json` and `package-lock.json` add both packages under `devDependencies`; no runtime `dependencies` section is added.

- [x] **Step 2: Write the failing schema conformance test**

Create `tests/schema-conformance.test.mjs` with helpers that:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaUrl = new URL(
  "../spec/schemas/0.1.0/source-record.schema.json",
  import.meta.url,
);
const validFixtureUrl = new URL(
  "../spec/conformance/0.1.0/source-record/valid.jsonl",
  import.meta.url,
);
const invalidFixtureUrl = new URL(
  "../spec/conformance/0.1.0/source-record/invalid.jsonl",
  import.meta.url,
);

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

function compileSchema() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv, { mode: "full" });
  return ajv.compile(readJson(schemaUrl));
}
```

Add tests that assert:

```js
test("SourceRecord schema compiles in strict Draft 2020-12 mode", () => {
  assert.equal(typeof compileSchema(), "function");
});

test("every normative valid fixture satisfies the schema", () => {
  const validate = compileSchema();
  for (const record of readJsonLines(validFixtureUrl)) {
    assert.equal(validate(record), true, JSON.stringify(validate.errors));
  }
});

test("every normative invalid fixture violates the schema", () => {
  const validate = compileSchema();
  for (const fixture of readJsonLines(invalidFixtureUrl)) {
    assert.equal(validate(fixture.record), false, fixture.description);
  }
});

test("invalid fixtures cover every machine-checkable rule", () => {
  const expectedRuleIds = [
    "SR-001",
    "SR-002",
    "SR-003",
    "SR-004",
    "SR-005",
    "SR-006",
    "SR-007",
    "SR-008",
    "SR-009",
    "SR-010",
    "SR-011",
  ];
  const actualRuleIds = [
    ...new Set(
      readJsonLines(invalidFixtureUrl).map((fixture) => fixture.ruleId),
    ),
  ].sort();
  assert.deepEqual(actualRuleIds, expectedRuleIds);
});
```

- [x] **Step 3: Run the test to verify RED**

Run:

```bash
node --test tests/schema-conformance.test.mjs
```

Expected: FAIL because `spec/schemas/0.1.0/source-record.schema.json` does not exist.

- [x] **Step 4: Add the minimal Draft 2020-12 schema**

Create `spec/schemas/0.1.0/source-record.schema.json` with:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:collective-cognition:schema:source-record:0.1.0",
  "title": "Collective Cognition SourceRecord 0.1.0",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "source",
    "sourceId",
    "revisionId",
    "capturedAt",
    "mediaType",
    "content"
  ],
  "properties": {
    "schemaVersion": { "const": "0.1.0" },
    "id": { "$ref": "#/$defs/nonWhitespaceString" },
    "source": {
      "type": "object",
      "additionalProperties": false,
      "required": ["system"],
      "properties": {
        "system": { "$ref": "#/$defs/nonWhitespaceString" },
        "instance": { "$ref": "#/$defs/nonWhitespaceString" }
      }
    },
    "sourceId": { "$ref": "#/$defs/nonWhitespaceString" },
    "revisionId": { "$ref": "#/$defs/nonWhitespaceString" },
    "capturedAt": { "$ref": "#/$defs/timestamp" },
    "observedAt": { "$ref": "#/$defs/timestamp" },
    "mediaType": {
      "type": "string",
      "pattern": "^[!#$%&'*+\\\\-.^_`|~0-9A-Za-z]+/[!#$%&'*+\\\\-.^_`|~0-9A-Za-z]+(?:\\\\s*;\\\\s*[!#$%&'*+\\\\-.^_`|~0-9A-Za-z]+=(?:[!#$%&'*+\\\\-.^_`|~0-9A-Za-z]+|\\\"(?:[^\\\"\\\\\\\\\\\\r\\\\n]|\\\\\\\\.)*\\\"))*$"
    },
    "content": true,
    "contentHash": { "$ref": "#/$defs/nonWhitespaceString" },
    "actorId": { "$ref": "#/$defs/nonWhitespaceString" },
    "context": {
      "type": "object",
      "propertyNames": {
        "not": { "enum": ["polarity", "confidence", "authority"] }
      }
    },
    "extensions": {
      "type": "object",
      "propertyNames": {
        "pattern": "^[^:.\\\\s]+(?:[:.][^:.\\\\s]+)+$"
      }
    }
  },
  "$defs": {
    "nonWhitespaceString": {
      "type": "string",
      "pattern": "\\\\S"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "pattern": "^\\\\d{4}-\\\\d{2}-\\\\d{2}T\\\\d{2}:\\\\d{2}:\\\\d{2}(?:\\\\.\\\\d{1,9})?(?:Z|[+-]\\\\d{2}:\\\\d{2})$"
    }
  }
}
```

- [x] **Step 5: Add exact normative fixtures**

Create valid JSONL records covering:

1. minimal string content;
2. all optional fields with structured object content;
3. `null`, boolean, number, and array content values;
4. timestamp offsets and fractional seconds accepted by the runtime;
5. both colon- and dot-namespaced extension keys.

Create invalid JSONL envelopes covering these exact rule IDs and cases:

| Rule | Required invalid cases |
|---|---|
| `SR-001` | unknown root field |
| `SR-002` | unsupported `schemaVersion` |
| `SR-003` | whitespace-only `id` |
| `SR-004` | missing `source.system`, whitespace `source.system`, unknown source field |
| `SR-005` | missing `revisionId`, whitespace `sourceId` |
| `SR-006` | impossible calendar date, missing timezone, lowercase separator |
| `SR-007` | non-string and malformed `mediaType` |
| `SR-008` | missing `content` |
| `SR-009` | whitespace-only `contentHash`, non-string `actorId` |
| `SR-010` | non-object context, each forbidden interpretation key |
| `SR-011` | non-object extensions, unnamespaced extension key |

Every envelope must contain non-empty `description`, one listed `ruleId`, `expectedCode: "INVALID_SOURCE_RECORD"`, and `record`.

- [x] **Step 6: Run the schema test to verify GREEN**

Run:

```bash
node --test tests/schema-conformance.test.mjs
```

Expected: 4 tests pass.

- [x] **Step 7: Commit the schema checkpoint**

```bash
git add package.json package-lock.json tests/schema-conformance.test.mjs spec/schemas/0.1.0/source-record.schema.json spec/conformance/0.1.0/source-record
git commit -m "feat: add normative SourceRecord schema"
```

---

### Task 2: Enforce Differential Runtime and CLI Parity

**Files:**
- Modify: `tests/conformance.test.ts`
- Modify: `tests/package.test.mjs`
- Modify: `package.json`
- Delete: `spec/fixtures/source-records/valid.jsonl`
- Delete: `spec/fixtures/source-records/invalid.jsonl`

**Interfaces:**
- Consumes: versioned schema and fixtures from Task 1.
- Produces: one fixture corpus enforced consistently by schema, SDK, CLI, and package tests.

- [x] **Step 1: Point runtime conformance tests at normative fixtures**

Change the fixture URLs in `tests/conformance.test.ts` to:

```ts
const validFixtureUrl = new URL(
  "../spec/conformance/0.1.0/source-record/valid.jsonl",
  import.meta.url,
);
const invalidFixtureUrl = new URL(
  "../spec/conformance/0.1.0/source-record/invalid.jsonl",
  import.meta.url,
);
```

Extend `InvalidFixture` with:

```ts
readonly ruleId: string;
```

Add an assertion that every fixture has a non-empty `description`, `ruleId`, and expected code before checking SDK and CLI outcomes.

- [x] **Step 2: Run runtime conformance to verify RED**

Run:

```bash
node --test tests/conformance.test.ts
```

Expected: FAIL on any intentional schema/runtime mismatch exposed by the expanded corpus.

- [x] **Step 3: Correct only proven runtime/schema differences**

For each RED mismatch:

1. confirm the approved design's normative behavior;
2. retain the failing fixture;
3. make the smallest correction in `src/source-records.ts` or the schema;
4. do not alter validator error messages unless the behavior requires it.

Expected likely alignment targets:

- whitespace-only strings reject in both paths;
- uppercase `T` and `Z` timestamp profile remains aligned;
- impossible dates reject in both paths;
- root and source unknown fields reject;
- forbidden context fields reject only at the immediate context level;
- extension keys require at least one colon or dot namespace separator.

- [x] **Step 4: Add the schema test to normal verification**

Update scripts in `package.json`:

```json
{
  "test": "npm run build && npm run test:source && npm run test:schema && npm run test:package",
  "test:schema": "node --test tests/schema-conformance.test.mjs",
  "pack:check": "npm run build && npm run test:schema && npm run test:package",
  "prepack": "npm run build && npm run test:schema && npm run test:package"
}
```

Append `node --check tests/schema-conformance.test.mjs` to the existing `check` script.

- [x] **Step 5: Update package tests to require the new paths**

Change `tests/package.test.mjs` to read the valid fixture from:

```js
new URL(
  "../spec/conformance/0.1.0/source-record/valid.jsonl",
  import.meta.url,
);
```

Change the exact tarball path allowlist to require:

```text
spec/conformance/0.1.0/source-record/invalid.jsonl
spec/conformance/0.1.0/source-record/valid.jsonl
spec/schemas/0.1.0/source-record.schema.json
spec/source-record.md
```

Remove the two old `spec/fixtures/source-records/` paths.

- [x] **Step 6: Run package verification to verify RED**

Run:

```bash
npm run pack:check
```

Expected: FAIL because `package.json` does not yet ship the normative files or expose the schema subpath.

- [x] **Step 7: Remove superseded fixture files**

Delete:

```text
spec/fixtures/source-records/valid.jsonl
spec/fixtures/source-records/invalid.jsonl
```

No duplicate implementation-only corpus remains.

- [x] **Step 8: Run focused parity checks**

Run:

```bash
node --test tests/schema-conformance.test.mjs
node --test tests/conformance.test.ts
npx tsc --noEmit
```

Expected: schema tests, runtime/CLI conformance tests, and type checking all pass.

- [x] **Step 9: Commit the parity checkpoint**

```bash
git add package.json tests/conformance.test.ts tests/package.test.mjs src/source-records.ts spec/fixtures spec/conformance
git commit -m "test: enforce SourceRecord schema parity"
```

Omit `src/source-records.ts` if no runtime correction was required.

---

### Task 3: Ship the Normative Contract and Synchronize Documentation

**Files:**
- Create: `spec/source-record.md`
- Modify: `package.json`
- Modify: `tests/package.test.mjs`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `spec/README.md`
- Modify: `rfcs/0001-universal-source-record-ingestion.md`
- Modify: `docs/superpowers/specs/2026-07-27-source-record-normative-conformance-design.md`
- Modify: `docs/superpowers/plans/2026-07-27-source-record-normative-conformance.md`

**Interfaces:**
- Consumes: schema, fixtures, and parity tests from Tasks 1 and 2.
- Produces: packaged normative assets, stable schema discovery, and synchronized public status documentation.

- [x] **Step 1: Write normative SourceRecord prose**

Create `spec/source-record.md` containing:

1. scope and the neutral ingestion boundary;
2. terminology and JSON-only serialization boundary;
3. rules `SR-001` through `SR-011`;
4. field-by-field requirements matching the schema;
5. immutable source revision and collision semantics;
6. opaque `contentHash` trust boundary;
7. extension naming behavior;
8. error portability rule: stable code, non-portable message;
9. schema/version compatibility behavior;
10. a rule matrix mapping each rule to schema location and fixture cases.

State explicitly that schema validity does not promote source material to evidence, truth, authority, or a decision.

- [x] **Step 2: Add a stable package schema subpath**

Update `package.json`:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./schemas/source-record/0.1.0": "./spec/schemas/0.1.0/source-record.schema.json",
    "./package.json": "./package.json"
  },
  "files": [
    "dist/",
    "README.md",
    "rfcs/README.md",
    "rfcs/0001-universal-source-record-ingestion.md",
    "spec/README.md",
    "spec/source-record.md",
    "spec/schemas/0.1.0/source-record.schema.json",
    "spec/conformance/0.1.0/source-record/valid.jsonl",
    "spec/conformance/0.1.0/source-record/invalid.jsonl"
  ]
}
```

Keep `"private": true`.

- [x] **Step 3: Verify schema discovery from a clean consumer**

Extend the generated consumer in `tests/package.test.mjs` to:

```js
import sourceRecordSchema from "collective-cognition-sdk/schemas/source-record/0.1.0"
  with { type: "json" };

if (
  sourceRecordSchema.$id !==
  "urn:collective-cognition:schema:source-record:0.1.0"
) {
  throw new Error("installed SourceRecord schema is not discoverable");
}
```

Assert the consumer process exits successfully.

- [x] **Step 4: Run package verification to verify GREEN**

Run:

```bash
npm run pack:check
```

Expected: schema tests and all 5 package tests pass; the exact tarball contains only approved files.

- [x] **Step 5: Synchronize all affected Markdown**

Update:

- `README.md` to describe the normative SourceRecord schema, versioned fixtures, schema import path, and remaining Phase 3 gates;
- `spec/README.md` to replace planned-language with implemented-language for SourceRecord only;
- `docs/ROADMAP.md` to check off the active SourceRecord slice while leaving Phase 3 in progress;
- RFC 0001 to point to the versioned normative fixture and schema paths;
- the design status to `Implemented and verified`;
- this plan's task checkboxes and status after verification.

Preserve these statements:

- package publication remains blocked;
- no license is selected;
- broader cognitive-object schemas remain planned;
- the repository does not claim a cross-language standard.

- [x] **Step 6: Run complete local verification**

Run:

```bash
npm test
npx tsc --noEmit
npm run check
npm run example
node --test tests/conformance.test.ts
npm run pack:check
git diff --check
```

Expected:

- all source tests pass;
- all schema tests pass;
- all package tests pass;
- type checking and syntax checks pass;
- the example completes;
- no whitespace errors exist.

- [ ] **Step 7: Run independent code review**

Review the full branch diff against:

- the approved design;
- schema/runtime acceptance parity;
- package allowlist safety;
- schema subpath usability;
- public documentation accuracy;
- absence of runtime Ajv dependencies;
- no publication or standards overclaims.

Resolve every correctness, compatibility, security, packaging, and documentation finding, then rerun the complete verification command.

- [ ] **Step 8: Commit the completed slice**

```bash
git add README.md docs/ROADMAP.md docs/superpowers spec rfcs package.json package-lock.json tests src
git commit -m "docs: publish SourceRecord conformance contract"
```

- [ ] **Step 9: Merge and publish after authorization**

After final verification and explicit push authorization:

```bash
git switch master
git merge --no-ff feature/source-record-schema -m "merge: SourceRecord normative conformance"
git push origin master
git branch -d feature/source-record-schema
```

Verify local and remote `master` resolve to the same commit and no unnecessary feature branch remains.
