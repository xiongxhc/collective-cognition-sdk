# Runtime and Security Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a versioned, machine-readable Runtime and Security Profile that distinguishes SDK enforcement, conformance evidence, host obligations, and explicit non-claims.

**Architecture:** Normative prose defines stable `RSP-*` controls while a closed JSON profile exposes the same ordered inventory to tools and package consumers. The slice adds no runtime policy engine and no root API; it is an additive private package `0.7.0` subpath protected by compatibility, package, documentation, and clean-consumer tests.

**Tech Stack:** Node.js 24.14.0, native Node test runner, TypeScript 7, JSON modules, npm package exports, Markdown normative specifications.

## Global Constraints

- Use `/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` first in `PATH` for every Node or npm command.
- Keep `package.json` `"private": true`; npm publication is excluded.
- Add no production dependency field and no install lifecycle hook (`preinstall`, `install`, or `postinstall`).
- Preserve every `0.1.0` through `0.6.0` compatibility and normative artifact byte-for-byte.
- Add no root runtime export, root type export, executable, authentication provider, encryption implementation, policy language, service, worker, scheduler, or remote API.
- Use the exact package subpath `./runtime-security/0.1.0` and profile identity `collective-cognition-runtime-security` version `0.1.0`.
- Use exactly four enforcement classes in this order: `sdk-enforced`, `conformance-verified`, `host-required`, `out-of-scope`.
- Use the exact `RSP-001` through `RSP-022` control inventory and `RSP-NC-001` through `RSP-NC-005` non-claim inventory from the approved design.
- All examples and documentation must remain source-neutral, backend-neutral, fictional, and free of local paths, credentials, or private source content.
- Historical `v0.6.0` prerelease records describe immutable historical bytes and must not be rewritten as package `0.7.0` evidence.
- Commit only complete task scopes with Conventional Commit messages and no `Co-Authored-By` trailer.

---

### Task 1: Normative Profile and Conformance

**Files:**
- Create: `spec/runtime-security.md`
- Create: `spec/runtime-security/0.1.0/profile.json`
- Create: `tests/runtime-security-profile.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the exact inventories and classifications in `docs/superpowers/specs/2026-08-10-runtime-security-policy-design.md`.
- Produces: a closed JSON profile with top-level fields `profile`, `version`, `status`, `enforcementClasses`, `controls`, and `nonClaims`; each control has `id`, `title`, `enforcementClass`, `requirement`, `normativeAnchor`, and `evidence`; each non-claim has `id`, `title`, `enforcementClass`, `statement`, and `normativeAnchor`.

- [ ] **Step 1: Write the failing identity and inventory test**

Create `tests/runtime-security-profile.test.ts` using `node:assert/strict`, `node:fs`, and `node:test`. Read the future profile and normative prose relative to `import.meta.url`. Pin these exact arrays:

```ts
const enforcementClasses = [
  "sdk-enforced",
  "conformance-verified",
  "host-required",
  "out-of-scope",
] as const;

const expectedControls = [
  ["RSP-001", "sdk-enforced"],
  ["RSP-002", "sdk-enforced"],
  ["RSP-003", "sdk-enforced"],
  ["RSP-004", "sdk-enforced"],
  ["RSP-005", "sdk-enforced"],
  ["RSP-006", "sdk-enforced"],
  ["RSP-007", "sdk-enforced"],
  ["RSP-008", "sdk-enforced"],
  ["RSP-009", "sdk-enforced"],
  ["RSP-010", "conformance-verified"],
  ["RSP-011", "conformance-verified"],
  ["RSP-012", "conformance-verified"],
  ["RSP-013", "conformance-verified"],
  ["RSP-014", "conformance-verified"],
  ["RSP-015", "host-required"],
  ["RSP-016", "host-required"],
  ["RSP-017", "host-required"],
  ["RSP-018", "host-required"],
  ["RSP-019", "host-required"],
  ["RSP-020", "host-required"],
  ["RSP-021", "host-required"],
  ["RSP-022", "host-required"],
] as const;

const expectedNonClaims = [
  "RSP-NC-001",
  "RSP-NC-002",
  "RSP-NC-003",
  "RSP-NC-004",
  "RSP-NC-005",
] as const;
```

Assert exact top-level keys, identity, version, status `normative-stable`, class order, control ID/class pairs, and non-claim IDs. Every non-claim must have `enforcementClass: "out-of-scope"`.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/runtime-security-profile.test.ts
```

Expected: FAIL because `spec/runtime-security/0.1.0/profile.json` does not exist.

- [ ] **Step 3: Add closed-shape, anchor, and evidence assertions**

In the same test, require exact control keys and exact non-claim keys, unique IDs, non-empty single-line titles and requirements, kebab-case `#rsp-*` anchors, and repository-relative evidence paths. For every control, resolve `normativeAnchor` against a Markdown heading in `spec/runtime-security.md`. For every evidence item, require this closed shape and an existing regular file:

```ts
{
  kind: "test" | "contract" | "workflow" | "package",
  path: string,
}
```

Require non-empty evidence for `sdk-enforced` and `conformance-verified`; require an empty evidence array for `host-required`. Require all non-claims to resolve to headings and carry no implementation evidence.

- [ ] **Step 4: Write the normative prose**

Create `spec/runtime-security.md` with:

```markdown
# Runtime and Security Profile 0.1.0

## Status and Scope
## Terms
## Enforcement Classes
## SDK-Enforced Controls
### RSP-001 — Explicit External Selection
...
### RSP-009 — Secret-Safe Boundary Diagnostics
## Conformance-Verified Controls
### RSP-010 — Package Install Surface
...
### RSP-014 — Deterministic Reference Behavior
## Host-Required Controls
### RSP-015 — Authenticated Human Authority
...
### RSP-022 — Sensitive Connector Review
## Explicit Non-Claims
### RSP-NC-001 — Source Truth and Semantic Quality
...
### RSP-NC-005 — Production Security Certification
## Conformance and Certification Boundary
## Versioning
```

Each control section must state one normative requirement using `MUST` or `MUST NOT`, explain its exact boundary, and avoid claiming more than current code or tests provide. Define `sdk-enforced`, `conformance-verified`, `host-required`, and `out-of-scope` exactly as the approved design. State that conformance is not certification and that host-required controls remain unsatisfied until a host implements and verifies them.

- [ ] **Step 5: Write the machine-readable profile**

Create `spec/runtime-security/0.1.0/profile.json` with two-space indentation and a trailing newline. Use the exact top-level and item shapes from the tests. `normativeAnchor` values must be the generated lowercase heading anchors, for example `#rsp-001--explicit-external-selection`.

Use existing evidence paths only. The minimum evidence mapping is:

```json
{
  "RSP-001": ["tests/team-memory-connector.test.ts", "tests/markdown-cognition-target.test.ts"],
  "RSP-002": ["tests/sqlite-store.test.ts", "spec/host-integration.md"],
  "RSP-003": ["tests/ingestion.test.ts", "tests/connector-conformance.test.ts"],
  "RSP-004": ["tests/source-records.test.ts", "tests/host-integration.test.ts"],
  "RSP-005": ["tests/ingestion.test.ts", "tests/cli.test.ts"],
  "RSP-006": ["tests/team-memory-connector.test.ts", "tests/team-memory-cli.test.ts"],
  "RSP-007": ["tests/promotion.test.ts", "tests/team-memory-cli.test.ts"],
  "RSP-008": ["tests/transitions.test.ts"],
  "RSP-009": ["tests/cli.test.ts", "tests/team-memory-cli.test.ts", "tests/host-integration.test.ts"],
  "RSP-010": ["package.json", "tests/package.test.mjs"],
  "RSP-011": ["package.json", "tests/package.test.mjs"],
  "RSP-012": [".github/workflows/ci.yml", "tests/release-readiness.test.ts"],
  "RSP-013": ["tests/team-memory-connector.test.ts"],
  "RSP-014": ["tests/conformance.test.ts", "tests/host-conformance.test.ts", "tests/markdown-cognition-projection.test.ts"]
}
```

Assign evidence `kind` from the referenced artifact: tests are `test`, Markdown contracts are `contract`, workflows are `workflow`, and `package.json` is `package`.

- [ ] **Step 6: Include the test in syntax verification**

Append this exact segment to `package.json` script `check` beside the other test files:

```text
node --disable-warning=ExperimentalWarning --check tests/runtime-security-profile.test.ts
```

Do not add a new npm script or alter the existing test order; `tests/*.test.ts` already includes the new test in `test:source`.

- [ ] **Step 7: Run focused GREEN checks**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/runtime-security-profile.test.ts
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  npm run check
git diff --check
```

Expected: all pass.

- [ ] **Step 8: Commit the normative profile**

```bash
git add spec/runtime-security.md spec/runtime-security/0.1.0/profile.json tests/runtime-security-profile.test.ts package.json
git commit -m "feat: add runtime security profile"
```

### Task 2: Package and Compatibility Surface

**Files:**
- Create: `spec/compatibility/0.7.0/baseline.json`
- Create: `spec/compatibility/0.7.0/change-cases.jsonl`
- Create: `rfcs/0008-runtime-security-profile.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/package.test.mjs`
- Modify: `tests/compatibility.test.mjs`
- Modify: `spec/compatibility.md`

**Interfaces:**
- Consumes: `spec/runtime-security.md` and `spec/runtime-security/0.1.0/profile.json` from Task 1.
- Produces: private package `0.7.0`, JSON export `./runtime-security/0.1.0`, and compatibility baseline `0.7.0`; root exports, types, binaries, and prior subpaths remain identical.

- [ ] **Step 1: Write failing package assertions**

Update `tests/package.test.mjs` first to expect:

```js
assert.equal(packageJson.version, "0.7.0");
assert.equal(packageLock.version, "0.7.0");
assert.equal(packageLock.packages[""].version, "0.7.0");
assert.equal(
  packageJson.exports["./runtime-security/0.1.0"],
  "./spec/runtime-security/0.1.0/profile.json",
);
```

Add the `0.7.0` compatibility files, `spec/runtime-security.md`, `spec/runtime-security/0.1.0/profile.json`, and `rfcs/0008-runtime-security-profile.md` to the exact package/tarball file inventory expectation. Require the packed clean consumer to import:

```js
import profile from "collective-cognition-sdk/runtime-security/0.1.0" with { type: "json" };
assert.equal(profile.profile, "collective-cognition-runtime-security");
assert.equal(profile.version, "0.1.0");
```

Also assert that `preinstall`, `install`, and `postinstall` are absent from both source and packed manifests.

- [ ] **Step 2: Write failing compatibility assertions**

Update `tests/compatibility.test.mjs` so `0.6.0` becomes the newest immutable historical baseline and `0.7.0` becomes current. Add exact checks for:

- `baselineVersion` and `appliesToPackageVersion` equal `0.7.0`;
- package change is `{ classification: "additive", packageVersionEffect: "minor" }`;
- root runtime exports, root type exports, all declaration closures, binaries, and existing CLI contracts equal `0.6.0`;
- `normative.runtimeSecurity.version` equals `0.1.0`;
- its prose path, profile path, profile package subpath, rule IDs, non-claim IDs, and SHA-256 digests match the actual artifacts; and
- the one change case has ID `additive-runtime-security-profile` and exact package subpath `./runtime-security/0.1.0`.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  npm run build
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/package.test.mjs tests/compatibility.test.mjs
```

Expected: FAIL because package `0.7.0`, its export, RFC, and compatibility files do not yet exist.

- [ ] **Step 4: Write RFC 0008**

Create `rfcs/0008-runtime-security-profile.md` with status `Implemented`,
created date `2026-08-10`, and these sections:

```markdown
# RFC 0008: Runtime and Security Profile
## Problem
## Proposed Semantics
## Enforcement Classes
## Machine-Readable Profile
## Alternatives
## Compatibility and Migration
## Security and Human Authority
## Acceptance Checks
## Explicit Deferrals
```

Record the four exact enforcement classes, the versioned package subpath,
the absence of a runtime policy engine, the private package `0.7.0` additive
classification, and the distinction between conformance and certification.

- [ ] **Step 5: Advance the private package and lockfile**

Set `package.json` version to `0.7.0`; add:

```json
"./compatibility/0.7.0": "./spec/compatibility/0.7.0/baseline.json",
"./runtime-security/0.1.0": "./spec/runtime-security/0.1.0/profile.json"
```

Add the new normative, RFC, and compatibility artifacts to `files`. Preserve `"private": true`, every existing export, every executable, and all dependency fields. Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  npm install --package-lock-only --ignore-scripts
```

- [ ] **Step 6: Create baseline `0.7.0` deliberately**

Copy `spec/compatibility/0.6.0/baseline.json` to `0.7.0`, then make only deliberate additive changes:

- identifiers and package version become `0.7.0`;
- `historicalBaselines` adds `0.6.0` with its literal computed SHA-256;
- `normative.artifacts` adds the profile JSON, normative prose, and `0.7.0` change-case digests;
- `normative.runtimeSecurity` records version, prose path/hash, profile path/hash/package subpath, `RSP-001` through `RSP-022`, and `RSP-NC-001` through `RSP-NC-005`;
- package metadata includes the new compatibility and runtime-security exports and new files; and
- all root, declaration, CLI, connector, SQLite, and Markdown inventories remain unchanged.

Create `spec/compatibility/0.7.0/change-cases.jsonl` as one canonical JSON line:

```json
{"id":"additive-runtime-security-profile","description":"Add Runtime and Security Profile 0.1.0 as normative prose and a versioned machine-readable package subpath while preserving every existing runtime, type, CLI, connector, adapter, and host contract.","surface":"normative-stable","classification":"additive","packageVersionEffect":"minor","requiresRfc":true,"requiresMigrationNotes":false,"requiresDeprecation":false,"rationale":"Existing imports and behavior remain unchanged; the new JSON subpath classifies SDK-enforced, conformance-verified, host-required, and out-of-scope controls without adding a runtime policy engine or production dependency."}
```

Compute every new digest with `shasum -a 256`; insert literal results. Never rewrite earlier baselines to make a test pass.

- [ ] **Step 7: Reconcile compatibility prose**

Update `spec/compatibility.md` to describe `0.6.0` as historical and `0.7.0` as the current additive private baseline. Add Runtime and Security Profile `0.1.0` to the Normative Stable surface and state that the machine profile is data, not certification or a host security implementation.

- [ ] **Step 8: Run focused GREEN checks**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/compatibility.test.mjs
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/package.test.mjs
git diff --check
```

Expected: all pass. If the package test remains red only because RFC 0008 is absent, keep that assertion and record the expected dependency for Task 3 rather than weakening it.

- [ ] **Step 9: Commit the package surface**

```bash
git add package.json package-lock.json rfcs/0008-runtime-security-profile.md spec/compatibility.md spec/compatibility/0.7.0 tests/package.test.mjs tests/compatibility.test.mjs
git commit -m "feat: package runtime security profile"
```

### Task 3: RFC and Public Documentation

**Files:**
- Modify: `rfcs/README.md`
- Modify: `spec/README.md`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `CHANGELOG.md`
- Modify: `tests/package.test.mjs`

**Interfaces:**
- Consumes: implemented Runtime and Security Profile `0.1.0` and private package `0.7.0` from Tasks 1-2.
- Produces: one public navigation path explaining how adopters use the profile and what remains host-owned.

- [ ] **Step 1: Write failing public-documentation assertions**

Extend the existing public-documentation test in `tests/package.test.mjs`. Require the README, specification index, RFC index, roadmap, RFC 0008, and normative profile to contain or link all of:

```text
Runtime and Security Profile 0.1.0
sdk-enforced
conformance-verified
host-required
out-of-scope
collective-cognition-sdk/runtime-security/0.1.0
conformance is not certification
authentication
encryption
tenant or workspace isolation
durable publication recovery
private and unpublished
```

Assert README does not claim `secure`, `production-ready`, or `certified` without a nearby negation. Require all new repository-relative Markdown links to resolve.

- [ ] **Step 2: Run the documentation test and verify RED**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --test tests/package.test.mjs
```

Expected: FAIL because RFC 0008 and reconciled public guidance are absent.

- [ ] **Step 3: Verify RFC 0008 against the public contract**

Read `rfcs/0008-runtime-security-profile.md` and require these sections to
remain present through the public-documentation test:

```markdown
# RFC 0008: Runtime and Security Profile
## Problem
## Proposed Semantics
## Enforcement Classes
## Machine-Readable Profile
## Alternatives
## Compatibility and Migration
## Security and Human Authority
## Acceptance Checks
## Explicit Deferrals
```

The RFC must retain the four exact enforcement classes, the versioned package
subpath, the absence of a runtime policy engine, the private package `0.7.0`
additive classification, and the distinction between conformance and
certification. Correct the RFC in this task only if reconciliation exposes a
contradiction.

- [ ] **Step 4: Reconcile public navigation and usage**

Update:

- `rfcs/README.md` with RFC 0008;
- `spec/README.md` with Runtime and Security Profile `0.1.0` in the current architecture and start-here list;
- `README.md` with a short “Runtime and Security Profile” section, JSON import example, four-class explanation, and host checklist link;
- `docs/ROADMAP.md` by marking the runtime/security implementation item complete and adding delivered/verification bullets without marking all Phase 3 complete;
- `CHANGELOG.md` under `Unreleased` with the normative profile, package subpath, compatibility baseline, and explicit no-certification boundary.

Use this import exactly:

```js
import runtimeSecurityProfile from "collective-cognition-sdk/runtime-security/0.1.0"
  with { type: "json" };
```

State explicitly that the JSON tells a host what remains unimplemented; importing it does not enforce host-required controls.

- [ ] **Step 5: Run focused GREEN checks**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/runtime-security-profile.test.ts
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --test tests/package.test.mjs tests/compatibility.test.mjs
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Commit the public documentation**

```bash
git add README.md CHANGELOG.md docs/ROADMAP.md rfcs/0008-runtime-security-profile.md rfcs/README.md spec/README.md tests/package.test.mjs
git commit -m "docs: publish runtime security guidance"
```

### Task 4: Whole-Slice Verification and Review

**Files:**
- Modify only files required by verified review findings.

**Interfaces:**
- Consumes: the complete branch from Tasks 1-3.
- Produces: a review-clean, merge-ready private package `0.7.0` with no unresolved Critical or Important finding.

- [ ] **Step 1: Run the complete local gate**

Run every command with the Node 24 path prefix:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm ci
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm_config_update_notifier=false npm test
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsc --noEmit
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example:portable
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example:host
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example:markdown
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run pack:check
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm audit --audit-level=high
git diff --check
```

Expected: all pass and audit reports zero high-or-greater vulnerabilities.

- [ ] **Step 2: Verify historical immutability and package contents**

Compare all tracked files under `spec/compatibility/0.1.0` through `0.6.0` and the existing normative SourceRecord, Portable Cognition, and Host Integration artifacts against `main`. Run `npm pack --dry-run --json` and confirm only the exact allowlisted files appear.

- [ ] **Step 3: Run independent whole-branch review**

Provide the merge-base-to-head diff, approved design, implementation plan, and test evidence to a fresh reviewer. Require separate spec-compliance and code-quality verdicts. Fix every Critical or Important finding test-first, rerun the covering checks, and obtain a scoped clean re-review.

- [ ] **Step 4: Record final documentation evidence**

Update `docs/ROADMAP.md` verification evidence only with observed counts and commands from the final gate. Do not claim npm publication, production readiness, deployment security, external adoption, or cross-language implementation.

- [ ] **Step 5: Commit final verified corrections**

If verification or review required changes:

```bash
git status --short
git add --update
git commit -m "fix: complete runtime security verification"
```

If no files changed, do not create an empty commit.
