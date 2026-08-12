# Public API and Distribution Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give adopters a checked public API reference and a versioned machine-readable distribution-status contract while keeping npm publication and production-readiness claims blocked.

**Architecture:** Reuse the compatibility baseline as the exact package-surface inventory, add a closed JSON Distribution Readiness Profile plus normative prose, and verify both against `package.json`, package contents, and a human API reference. The change is additive private package `0.8.0`; no root runtime behavior changes.

**Tech Stack:** TypeScript, Node.js 24, `node:test`, ESM JSON imports, npm package exports, Markdown, JSON, JSONL.

## Global Constraints

- Preserve every historical compatibility, conformance, prerelease, and normative artifact byte-for-byte.
- Keep `package.json` at `"private": true`; add no npm publication, registry-authentication, or credential behavior.
- Keep the root runtime/type API and all existing CLI behavior unchanged.
- Treat the profile as descriptive policy data, not publication authority, production certification, endorsement, or LTS.
- Use only the existing runtime dependencies; add no production dependency.
- Update every affected public Markdown document and record explicit deferrals.

---

### Task 1: Distribution Readiness Contract

**Files:**
- Create: `tests/distribution-readiness-profile.test.ts`
- Create: `spec/distribution-readiness.md`
- Create: `spec/distribution-readiness/0.1.0/profile.json`
- Create: `rfcs/0009-public-api-and-distribution-readiness.md`

**Interfaces:**
- Consumes: current `package.json`, Runtime and Security Profile `0.1.0`, Apache-2.0 attribution files, and immutable GitHub prerelease evidence.
- Produces: closed Distribution Readiness Profile `0.1.0` with rules `DRP-001` through `DRP-012` and machine statuses for source, GitHub prerelease, npm registry, and production use.

- [ ] **Step 1: Write the failing closed-profile test**

Create a test that parses the profile through own-property checks and asserts the exact top-level keys, profile/package versions, overall `blocked` status, four closed channel IDs, unique `DRP-GATE-*` IDs, npm blockers, production `not-claimed`, exact non-claim IDs, existing repository evidence paths, and `package.json.private === true`. Include mutation fixtures for unknown keys, unknown states, duplicate IDs, false npm readiness, missing evidence, and publication-authority claims.

- [ ] **Step 2: Run the focused test and prove RED**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node --disable-warning=ExperimentalWarning --test tests/distribution-readiness-profile.test.ts
```

Expected: failure because `spec/distribution-readiness/0.1.0/profile.json` does not exist.

- [ ] **Step 3: Add the minimal closed profile and normative prose**

The JSON profile must use this closed status direction:

```json
{
  "profileVersion": "0.1.0",
  "describesPackageVersion": "0.8.0",
  "overallStatus": "blocked",
  "channels": [
    { "id": "public-source", "status": "available" },
    { "id": "github-prerelease", "status": "available" },
    { "id": "npm-registry", "status": "blocked" },
    { "id": "production-use", "status": "not-claimed" }
  ]
}
```

Complete the closed members required by the test: gates with rationale/evidence, npm blockers, immutable historical prerelease identity, and non-claims. In `spec/distribution-readiness.md`, define `DRP-001` through `DRP-012`, rule-to-check mappings, replacement/versioning behavior, channel separation, and explicit non-authority. RFC 0009 must record the selected checked-profile approach, rejected docs-only and automated-publication alternatives, compatibility impact, security/human authority, acceptance, and deferrals.

- [ ] **Step 4: Run the focused test and prove GREEN**

Run the focused command from Step 2. Expected: all profile cases pass.

- [ ] **Step 5: Review Task 1 against the design**

Verify exact closed vocabularies, no inferred online registry state, no production claim, existing evidence only, `private: true`, and no change outside Task 1 files.

### Task 2: Checked Public API Reference

**Files:**
- Create: `docs/public-api.md`
- Modify: `tests/distribution-readiness-profile.test.ts`

**Interfaces:**
- Consumes: `package.json`, built root runtime exports, and the compatibility baseline selected by the current package version; Task 3 advances both from `0.7.0` to `0.8.0` without changing the test contract.
- Produces: one human API reference that exhaustively names every supported root export, versioned package subpath, and executable with stability labels and non-guarantees.

- [ ] **Step 1: Extend the test before writing documentation**

Add assertions that load `package.json`, select `spec/compatibility/<package.version>/baseline.json`, and require `docs/public-api.md` to contain every `package.runtimeExports`, `package.typeExports`, `package.metadata.exports` key, and `package.metadata.bin` key as an exact backticked token. Require sections named `Stability`, `Root API`, `Package Subpaths`, `Executables`, and `Not Public API`, plus explicit statements that Supported Experimental is not Normative Stable and that source paths absent from `exports` are internal.

- [ ] **Step 2: Run the focused test and prove RED**

Run the Task 1 focused command. Expected: failure because the API reference does not exist.

- [ ] **Step 3: Write the public API reference**

Group runtime and type exports by SourceRecord ingestion, promotion, cognitive objects, Portable Cognition, authorization/transitions, and host integration. List every package subpath and executable. For each surface, state its stability class and link to the governing normative contract, compatibility policy, connector/adapter guide, or security profile. State that `src/`, tests, examples, plans, unexported adapters, and generated `dist/` file paths are not public import contracts.

- [ ] **Step 4: Re-run and prove GREEN against the current baseline**

Run the Task 1 focused command. Expected: all API-reference checks pass against baseline `0.7.0`. Task 3 then advances the selected baseline to `0.8.0` and proves the same check remains green after the additive package change.

- [ ] **Step 5: Review Task 2 for usability**

Confirm an adopter can answer where to import each supported surface, whether it is Normative Stable or Supported Experimental, which executable to run, and which repository paths are not package API.

### Task 3: Additive Package 0.8.0 Evidence

**Files:**
- Create: `spec/compatibility/0.8.0/baseline.json`
- Create: `spec/compatibility/0.8.0/change-cases.jsonl`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/compatibility.test.mjs`
- Modify: `tests/package.test.mjs`

**Interfaces:**
- Consumes: Task 1 profile/prose/RFC and Task 2 API reference.
- Produces: package subpath `./distribution-readiness/0.1.0`, exact package contents, and additive private package `0.8.0` compatibility baseline.

- [ ] **Step 1: Write package and compatibility expectations first**

Update tests to require package version `0.8.0`, retained private state, the JSON subpath, exact new package files, clean-consumer JSON import, a baseline profile digest, historical baseline `0.7.0` digest, and one additive change case. Do not update expected digests until the intended bytes are final.

- [ ] **Step 2: Run package and compatibility tests and prove RED**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  npm run build
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  npm run test:compatibility
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  npm run test:package
```

Expected: failures for missing `0.8.0` metadata, subpath, baseline, and package files.

- [ ] **Step 3: Add package metadata and baseline**

Bump only the package and lockfile versions to `0.8.0`. Add:

```json
"./distribution-readiness/0.1.0": "./spec/distribution-readiness/0.1.0/profile.json"
```

Add the API reference, RFC, normative prose, machine profile, baseline, and change cases to `files`. Copy baseline `0.7.0` into `0.8.0`, then deliberately update package version, historical baseline link/digest, package exports/files, profile metadata/digest, and additive change classification while preserving all prior inventories and digests.

- [ ] **Step 4: Record exact finalized digests**

Use `shasum -a 256` on the new profile, prose, public API reference, RFC, baseline `0.7.0`, and change cases. Put literal digests in baseline `0.8.0` and the tests. Never rewrite an older baseline to make a check pass.

- [ ] **Step 5: Run focused package, compatibility, and profile tests**

Run all Task 1 and Task 3 commands. Expected: all pass, including clean temporary package install and imported profile values.

- [ ] **Step 6: Review Task 3 for compatibility**

Confirm root runtime/type exports and executable mappings are unchanged, the only export-map addition is the profile subpath, package remains private, no production dependency exists, and all historical artifact hashes still match.

### Task 4: Public Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `spec/README.md`
- Modify: `spec/compatibility.md`
- Modify: `rfcs/README.md`
- Modify: `docs/superpowers/plans/2026-08-12-public-api-distribution-readiness.md`

**Interfaces:**
- Consumes: verified Tasks 1–3 artifacts and exact test counts.
- Produces: current public status, completed roadmap slice, package `0.8.0` compatibility narrative, RFC index entry, and reproducible verification evidence.

- [ ] **Step 1: Reconcile public status without overclaiming**

Update all `0.7.0` current-package references that should become `0.8.0`. Add links to `docs/public-api.md`, the Distribution Readiness Profile prose/JSON, and RFC 0009. Mark only this Phase 3 slice complete. Keep broader language-neutral object semantics, npm publication, production readiness, independently useful second connector, named exchange owner, and Phase 5 entry criteria open.

- [ ] **Step 2: Run focused and full verification**

Run:

```bash
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsc --noEmit
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example:portable
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example:host
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run example:markdown
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run pack:check
git diff --check
```

Expected: zero failures; only the immutable historical prerelease-context tests may skip on a non-release commit.

- [ ] **Step 3: Verify immutable history and exact package contents**

Compare every pre-existing file under `spec/compatibility/0.1.0` through `0.7.0`, `spec/conformance/0.1.0`, `spec/schemas/0.1.0`, and `spec/runtime-security/0.1.0` byte-for-byte against `main`. Run `npm pack --dry-run --json` with an isolated temporary cache and verify no unexpected or missing path.

- [ ] **Step 4: Run independent whole-branch review**

Give a fresh reviewer the design, plan, `main...HEAD` diff, test output, package inventory, and immutable-history comparison. Correct every Critical or Important finding, rerun affected checks, then request a residual review.

- [ ] **Step 5: Record final evidence and commit**

Update this plan's checkboxes and the roadmap with observed counts only after the final rerun. Commit the verified scope with a Conventional Commit message. Do not push without a current explicit push instruction.
