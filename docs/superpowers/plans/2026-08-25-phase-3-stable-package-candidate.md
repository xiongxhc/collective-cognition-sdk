# Phase 3 Stable Package Candidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the full `1.0.0` compatibility boundary, land safe v1 release automation, and produce an exact verified `1.0.0-rc.1` archive without publishing it.

**Architecture:** Stable policy and workflow changes land while the package is still private. A final narrowly reviewed release commit changes version/publication metadata, adds candidate baseline/profile bytes, and removes the private guard atomically; it does not alter runtime or contract semantics.

**Tech Stack:** Node.js 24, npm 11.5.1+, TypeScript 7, GitHub Actions, JSON compatibility baselines, Distribution Readiness Profile JSON, tarball clean-consumer verification.

**Spec:** `docs/superpowers/specs/2026-08-25-phase-3-completion-design.md`

## Global Constraints

- Start only after the private `0.11.0` Slice A gate and independent review pass.
- Every public surface shipped in package `1.0.0` is SemVer protected; Supported Experimental describes maturity, not permission to break package `1.x`.
- Existing versioned resources remain immutable.
- The legacy GitHub prerelease workflow must never process a v1 tag.
- The protected npm publish job receives a verified archive and has no repository checkout.
- The RC release commit may not modify existing files under `src/`, `spec/schemas/`, `spec/conformance/`, or historical `spec/compatibility/` directories. Its complete change set is: `package.json` version/private flag/new resource exports, `package-lock.json`, the new RC baseline and profile directories, the tests that pin the private state and package version, the `STAB-002` surface enumeration in `spec/compatibility.md` together with the `currentBaselineUrl` repoint in `tests/compatibility.test.mjs` that binds it, and status prose in `README.md`, `docs/`, and `spec/`. The `STAB-002` enumeration is in the set because it enumerates the surfaces of the compatibility baseline this same commit records. Release Evidence Records are post-publication artifacts and are never part of it.
- The compatibility policy is Normative Stable and `COMP-002` forbids behavior-changing in-place edits, so the post-`1.0.0` policy is published as `packagePolicyVersion` `1.0.0`; historical baselines `0.1.0` through `0.11.0` keep recording policy `0.1.0`.
- Packaged Distribution Readiness Profiles use only the `DRP-002` closed status vocabulary (`available`, `satisfied`, `blocked`, `not-claimed`); no `pending` or other new value is introduced without a reviewed vocabulary amendment in the profile prose.
- The two npm registry-fact experiments (trusted publisher for a not-yet-existing name; `latest` after a first-ever `--tag next` publication) depend on nothing in this plan, may start in parallel with Task 1, and must both be recorded before the Task 5 release commit is created.
- No `collective-cognition-sdk` tag, npm publish, GitHub release, or dist-tag mutation occurs in this plan; the separately approved throwaway bootstrap experiment is the only registry side effect.
- The tag workflow builds one archive in an unprivileged job, publishes its SHA-256 and inventory to the job summary, transfers that exact archive plus manifest, and the protected job verifies and publishes those same bytes.

---

### Task 1: Post-`1.0.0` Compatibility Policy and Migration

**Files:**
- Modify: `spec/compatibility.md`
- Create: `docs/migrations/1.0.0.md`
- Modify: `docs/public-api.md`
- Modify: `tests/compatibility.test.mjs`
- Modify: `rfcs/0012-phase-3-charter-and-stable-package.md`

**Interfaces:**
- Consumes: the approved stability matrix and package `0.11.0` baseline.
- Produces: complete stable/experimental maturity classifications and post-1.0 change rules.

- [ ] Write failing tests that assert every current root export, four executables, all package subpaths, twelve root error codes, and selected package fields appear exactly once in the stable matrix; that every existing baseline `0.1.0` through `0.11.0` still records `packagePolicyVersion` `0.1.0`; and that the policy document defines `packagePolicyVersion` `1.0.0` alongside the retained `0.1.0` text.
- [ ] Run `node --test tests/compatibility.test.mjs` and verify it fails on pre-1.0 classifications.
- [ ] Publish the revised policy as `packagePolicyVersion` `1.0.0` in `spec/compatibility.md` without editing the `0.1.0` rules in place: `minor-before-1.0` applies only under policy `0.1.0`; from `1.0.0`, the listed surfaces are Stable Public API, Supported Experimental is an operational-maturity label that is SemVer protected, and an incompatible root, CLI, or existing versioned subpath change requires `2.0.0` or a new retained versioned subpath. Baseline `1.0.0-rc.1` and every later baseline record policy `1.0.0` (landed in Task 5).
- [ ] Write migration guidance stating that `0.11.0` to `1.0.0` changes support guarantees, not Portable Cognition `0.1.0` record meaning.
- [ ] Update RFC 0012 and the checked public API inventory with every root runtime/type export, all four executables, every exported subpath, both error catalogs, selected package fields, and each stable or Supported Experimental maturity classification.
- [ ] Run `node --test tests/compatibility.test.mjs && git diff --check` and commit with `docs: define stable package compatibility`.

### Task 2: Candidate Distribution Profile Contract

**Files:**
- Modify: `spec/distribution-readiness.md`
- Modify: `tests/distribution-readiness-profile.test.ts`
- Create: `scripts/verify-release-evidence.mjs`
- Create: `tests/release-evidence.test.ts`
- Create: `scripts/verify-package-archive.mjs`
- Create: `tests/package-archive.test.ts`
- Modify: `spec/README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: historical immutable profile `0.1.0` and the approved prepublication/postpublication split.
- Produces: validation rules for candidate packaged readiness profiles, release-evidence verifier, and exact-archive verifier invoked for the RC as `node scripts/verify-package-archive.mjs --archive "$first_archive" --expected-version 1.0.0-rc.1`.

- [ ] Write failing tests accepting profile versions matching `^0\.2\.0-rc\.[1-9][0-9]*$`, exact package prerelease versions, an `npm-registry` channel whose status is `blocked` with a distinct accountable-human approval blocker (`DRP-002`/`DRP-003`/`DRP-005`), expected workflow identity, intended tag, and explicit non-claims; assert that a `pending` status or any other value outside the closed vocabulary is rejected.
- [ ] In temporary directories, write synthetic candidate/stable evidence records, a byte-identical asset copy, and `SHA256SUMS`; add failing tests for the exact candidate path `docs/acceptance/releases/1.0.0-rc.1/release-evidence.json`, stable path `docs/acceptance/releases/1.0.0/release-evidence.json`, their exact asset filenames, byte equality, digest verification, replacement rejection, and `release-evidence-amendment-1.json` naming.
- [ ] Run the focused profile test and verify RED.
- [ ] Implement the verifier with Node `readFileSync`, `createHash("sha256")`, closed record-field validation, exact asset/repository byte comparison, and strict one-line `SHA256SUMS` parsing. Exit nonzero with stable secret-safe codes `invalid_record`, `asset_mismatch`, or `checksum_mismatch`.
- [ ] Write failing archive-verifier tests using one deliberately valid local package tarball and mutated archives with an extra file, missing license, wrong package version, broken export, and non-executable CLI. Implement `verify-package-archive.mjs` to unpack the supplied archive, compare its sorted paths with the package allowlist, install that exact archive into a temporary consumer, resolve every export according to its JavaScript/JSON/text type, execute all four installed CLIs with bounded synthetic inputs, and reject private paths or credential patterns.
- [ ] Amend profile prose and package syntax checks; do not alter `spec/distribution-readiness/0.1.0/profile.json`.
- [ ] Run `node --disable-warning=ExperimentalWarning --test tests/distribution-readiness-profile.test.ts tests/release-evidence.test.ts tests/package-archive.test.ts && npm run check` and commit with `feat: add release artifact verification`.

### Task 3: Safe v1 Release Workflow Routing

**Files:**
- Modify: `.github/workflows/github-prerelease.yml`
- Create: `.github/workflows/npm-publish.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/release-readiness.test.ts`
- Modify: `docs/github-prerelease.md`
- Create: `docs/npm-release.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: exact package tarball built and verified by an unprivileged job.
- Produces: historical `v0.6.0`-only routing and protected v1 artifact publication workflow.

- [ ] Write failing release-readiness tests asserting the historical workflow trigger is exactly `v0.6.0`, the new workflow accepts only `v1.0.0-rc.*` and `v1.0.0`, uses a GitHub-hosted runner, npm `>=11.5.1`, `id-token: write`, environment `npm-production`, and two-job artifact transfer.
- [ ] Assert the unprivileged job runs the complete repository gate, builds exactly one archive, writes `archive-manifest.json` containing package version, commit, filename, SHA-256, and sorted inventory, uploads both files, and appends the same digest/inventory to `$GITHUB_STEP_SUMMARY` before the protected job can start.
- [ ] Assert the privileged job has no checkout, no dependency install, no build/test step, sets `NODE_AUTH_TOKEN: ${{ secrets.NPM_BOOTSTRAP_TOKEN }}`, downloads the two-file artifact, recomputes SHA-256 and package version, and invokes `npm publish "$archive_path" --ignore-scripts --provenance --tag next` for prereleases or `npm publish "$archive_path" --ignore-scripts --provenance` only for `1.0.0`.
- [ ] Assert a prerelease immediately runs `npm dist-tag ls collective-cognition-sdk`, appends the observed dist-tags to `$GITHUB_STEP_SUMMARY`, and fails unless `next` equals the just-published RC. The workflow performs no dist-tag mutation: npm does not allow removing `latest`, and on a first-ever publication there is no other version to repoint it to. If `latest` also equals the RC, that is recorded as a known temporary state for the RC Release Evidence Record; the next publication repoints `latest`.
- [ ] Assert tag/package/main-head parity and annotated-tag checks happen before artifact construction.
- [ ] Run the focused release-readiness test and verify RED.
- [ ] Narrow the old workflow, add the new workflow, retain historical CI reconstruction only for commit `76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e`, add release-evidence binding checks to branch CI when version-keyed evidence directories exist, and document the protected environment/trusted-publisher/bootstrap-secret identity. In `docs/npm-release.md` and the README release section, state that any version under `next` is a prerelease and that `latest` may temporarily equal the first RC until the next publication.
- [ ] Run `node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts && git diff --check` and commit with `ci: add protected npm release workflow`.

### Task 4: Private Pre-Unlock Release Gate

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `README.md`
- Create: `docs/acceptance/releases/bootstrap-verification.md`

**Interfaces:**
- Consumes: Tasks 1-3 and private package `0.11.0`. The first four steps (the npm registry-fact experiments) consume nothing from Tasks 1-3 and may run in parallel with them; only their recorded outcome is required before Task 5.
- Produces: reviewed pre-release head with no semantic changes pending, and the recorded registry-fact outcomes that decide whether `1.0.0-rc.2` is mandatory.

- [ ] Recheck `https://docs.npmjs.com/trusted-publishers/` and `https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/`, set `npm_user="$(npm whoami)"`, `bootstrap_repository="collective-cognition-bootstrap-20260825"`, and `bootstrap_package="@${npm_user}/${bootstrap_repository}"`, then query `npm view "$bootstrap_package" version --json`.
- [ ] At the explicit external-side-effect gate, create public GitHub repository `${npm_user}/${bootstrap_repository}` containing only package `${bootstrap_package}@0.0.0-bootstrap.1`, Apache-2.0 metadata, and `.github/workflows/npm-publish.yml`. Configure protected environment `npm-production`; first attempt to configure npm trusted publishing for that exact repository/workflow/environment before the package exists. If the registry refuses, add short-lived `NPM_BOOTSTRAP_TOKEN`, and let the tag workflow run `npm publish "$archive_path" --access public --tag next --provenance`; then configure trusted publishing and publish `0.0.0-bootstrap.2` through OIDC. Never unpublish either version.
- [ ] In the throwaway workflow, run `npm dist-tag ls "$bootstrap_package"` after first publication and record the observed state verbatim; attempt no dist-tag mutation. After the second bootstrap publication (if any), run it again and record whether `latest` was repointed. This settles registry fact 2.
- [ ] Record URLs, retrieval time, Node/npm versions, package availability, workflow identity, publication command, provenance result, initial/final dist-tags, the registry fact 1 outcome (direct-OIDC or token-bootstrap, which decides whether `1.0.0-rc.2` with its own baseline and profile is mandatory), and the registry fact 2 outcome (`latest` state after a first `--tag next` publication) in `docs/acceptance/releases/bootstrap-verification.md`. Task 5 may not start until both outcomes are recorded.
- [ ] Run the complete repository gate:

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
npm run example:stable-host
npm run pack:check
npm audit --audit-level=high
git grep -nEi 'BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|npm_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}' -- . ':!docs/superpowers/**'
git diff --check
```

Expected: all verification commands exit `0`; the secret scan prints no matches.
- [ ] Build two private simulation archives and compare their file inventories and normalized contents.
- [ ] Compare every historical normative resource and compatibility/profile artifact against the Slice A reviewed head.
- [ ] Dispatch independent specification, API, security, and workflow reviews; resolve all Critical and Important findings.
- [ ] Record only observed evidence and commit with `docs: record stable candidate readiness`.
- [ ] Merge this reviewed workflow/policy branch to `main`, wait for the complete post-merge CI matrix, then record `PRE_RELEASE_HEAD="$(git rev-parse origin/main)"` in this plan's SDD ledger before constructing the RC release branch from that exact commit.

### Task 5: Atomic `1.0.0-rc.1` Release Commit

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `spec/compatibility/1.0.0-rc.1/baseline.json`
- Create: `spec/compatibility/1.0.0-rc.1/change-cases.jsonl`
- Create: `spec/distribution-readiness/0.2.0-rc.1/profile.json`
- Modify: `tests/package.test.mjs`
- Modify: `tests/compatibility.test.mjs` (also repoint `currentBaselineUrl` to `1.0.0-rc.1`)
- Modify: `tests/distribution-readiness-profile.test.ts`
- Modify: `README.md`
- Modify: `docs/public-api.md`
- Modify: `docs/ROADMAP.md`
- Modify: `spec/compatibility.md` (status prose and the `STAB-002` surface enumeration)
- Modify: `spec/distribution-readiness.md`
- Modify: `spec/README.md`

**Interfaces:**
- Consumes: exact ledger `PRE_RELEASE_HEAD` after Task 4 and recorded root/subpath/CLI inventories.
- Produces: publishable package metadata and immutable candidate resources for `1.0.0-rc.1`.

- [ ] Create the release branch from the ledger's exact `PRE_RELEASE_HEAD`; write failing tests expecting package `1.0.0-rc.1`, no `private` field, candidate baseline/profile exports, exact package inventory, baseline `packagePolicyVersion` `1.0.0`, and a profile `npm-registry` channel that is `blocked` with each remaining prepublication blocker (registry-name confirmation, accountable-human approval) listed distinctly.
- [ ] Verify RED on package, compatibility, and distribution profile suites.
- [ ] In one commit, bump package/lockfile, remove the private field, add candidate baseline/change cases/profile, add package exports/files, revise the `STAB-002` surface enumeration in `spec/compatibility.md` to match baseline `1.0.0-rc.1` (drop the `private` package field, classify `./compatibility/1.0.0-rc.1` and `./distribution-readiness/0.2.0-rc.1`), repoint `currentBaselineUrl` in `tests/compatibility.test.mjs` to that baseline, and update only pinned-version/private-state tests and status prose.
- [ ] Baseline the exact root exports, declarations, all historical/new subpaths, four executables, twelve root errors, eleven portable errors, package metadata, and immutable resource digests.
- [ ] Assert `git diff "$PRE_RELEASE_HEAD" -- src spec/schemas spec/conformance` is empty. Capture the pre-release list and SHA-256 of every existing file under `spec/compatibility/`; assert all remain present and byte-identical, with only the new `1.0.0-rc.1/` directory added.
- [ ] Assert `git diff --name-only "$PRE_RELEASE_HEAD"` contains only `package.json`, `package-lock.json`, the new RC baseline/profile directories, the three pinned test files, and the listed README/docs/spec status files; assert nothing under `docs/acceptance/releases/` changes in this commit.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run check`, `npm run example`, `npm run example:portable`, `npm run example:host`, `npm run example:markdown`, `npm run example:workflow`, `npm run example:interoperability`, `npm run example:stable-host`, `npm run pack:check`, `npm audit --audit-level=high`, the Task 4 exact secret-scan command, and `git diff --check` on the release commit.
- [ ] Commit the complete atomic boundary with `release: prepare 1.0.0-rc.1`.

### Task 6: Exact RC Archive Verification

**Files:**
- No tracked files; write the rehearsal report to this plan's ignored SDD workspace.

**Interfaces:**
- Consumes: exact release commit from Task 5.
- Produces: reviewed main-head RC commit and a local rehearsal report; the tag workflow later builds the exact publishable bytes and gates them with the protected environment.

- [ ] Set `first="$(mktemp -d)"` and `second="$(mktemp -d)"`; run `npm pack --json --pack-destination "$first" > "$first/pack.json"` and the same command for `second`; set `first_archive="$(find "$first" -name 'collective-cognition-sdk-1.0.0-rc.1.tgz' -print -quit)"` and `second_archive="$(find "$second" -name 'collective-cognition-sdk-1.0.0-rc.1.tgz' -print -quit)"`; compare SHA-256 digests, exact archive bytes with `cmp`, and sorted normalized unpacked path/content digests; assert both inventories match `tests/package.test.mjs`'s exact allowlist.
- [ ] Run `node scripts/verify-package-archive.mjs --archive "$first_archive" --expected-version 1.0.0-rc.1` and the same command for `second_archive`; the verifier, not repository-local package tests, must prove every root/resource/subpath/CLI behavior from each supplied archive in a clean temporary consumer.
- [ ] Run `npm audit --audit-level=high`; set `unpacked="$(mktemp -d)"`; unpack with `tar -xzf "$first_archive" -C "$unpacked"`; run `grep -RInE '/Users/|Team Vault|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|npm_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}' "$unpacked"` and require no matches.
- [ ] Verify the RC workflow at the tagged commit would select `next`, artifact-only publish, and the protected environment.
- [ ] Record commit, archive filename, SHA-256, file count, Node/npm versions, test counts, skipped capabilities, and all non-claims in `.superpowers/sdd/2026-08-25-phase-3-stable-package-candidate/rc1-rehearsal.md`.
- [ ] Dispatch a final release-candidate review and correct any blocker by creating a new reviewed candidate version rather than rewriting a published artifact.
- [ ] Merge the reviewed release branch so `origin/main` points exactly to the final atomic RC release commit, wait for post-merge CI, and make no tracked commit afterward.

## Slice B Completion Gate

- Stop before creating or pushing a v1 tag or publishing to npm.
- Present the exact RC commit and archive evidence for the separate Slice C irreversible-operation gate.
