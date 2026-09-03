# Phase 3 npm Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish and verify an OIDC-authenticated release candidate and stable `collective-cognition-sdk@1.0.0`, then record immutable release evidence and close Phase 3 truthfully.

**Architecture:** Every publication uses an immutable annotated tag on current `main`, a preverified archive, and a protected artifact-only GitHub Actions publish job. Packaged Distribution Readiness Profiles contain only prepublication facts; observed registry, provenance, tag, release, and clean-consumer facts live in byte-bound non-packaged Release Evidence Records.

**Tech Stack:** npm registry, npm trusted publishing/OIDC, GitHub Actions and protected environments, GitHub Releases, SHA-256, Node.js 24, npm 11.5.1+.

**Spec:** `docs/superpowers/specs/2026-08-25-phase-3-completion-design.md`

## Global Constraints

- This plan contains irreversible external operations; stop at each named publication gate and present exact evidence before acting.
- Never move, delete, or overwrite a public tag, npm version, GitHub release asset, or Release Evidence Record.
- Every prerelease publishes with `--tag next`; stable `1.0.0` owns `latest`.
- At least one RC must be published through npm trusted publishing with OIDC before stable publication.
- A token-published bootstrap RC does not satisfy the OIDC gate.
- The privileged publish job sets `archive_path="${RUNNER_TEMP}/verified-package/collective-cognition-sdk-${PACKAGE_VERSION}.tgz"` and runs `npm publish "$archive_path" --ignore-scripts --provenance --tag next` for prereleases or `npm publish "$archive_path" --ignore-scripts --provenance` for stable without a repository checkout.
- The RC Release Evidence Record must be complete and byte-bound before stable promotion begins.
- Stable publication requires a separate accountable-human approval of the exact commit and archive.

---

### Task 1: Confirm Bootstrap Decision and Release State

**Files:**
- No tracked files.

**Interfaces:**
- Consumes: committed `docs/acceptance/releases/bootstrap-verification.md`, current npm registry state, and the exact RC main commit.
- Produces: a go/no-go release-state entry in this plan's ignored SDD ledger.

- [ ] Recheck official npm documentation and compare it with the committed bootstrap record, including both recorded registry-fact outcomes (trusted publisher for a not-yet-existing name; `latest` after a first `--tag next` publication); if requirements changed, stop because the reviewed release workflow is stale.
- [ ] Run `git rev-parse origin/main`, `git status --short`, `npm view collective-cognition-sdk versions --json`, and `npm dist-tag ls collective-cognition-sdk`; record exact outputs in the SDD ledger.
- [ ] Verify `package.json` at `origin/main` is `1.0.0-rc.1`, has no `private` field, and `.github/workflows/npm-publish.yml` at that commit matches the configured environment/workflow identity.
- [ ] Select exactly one recorded path: direct OIDC RC1, or token-bootstrap RC1 followed by OIDC RC2.

### Task 2: Publish an OIDC Release Candidate

**Files:**
- Bootstrap path only: modify `package.json`, `package-lock.json`, `tests/package.test.mjs`, `tests/compatibility.test.mjs`, `tests/distribution-readiness-profile.test.ts`, `README.md`, `docs/ROADMAP.md`, `docs/public-api.md`, `spec/compatibility.md`, `spec/distribution-readiness.md`, and `spec/README.md`.
- Bootstrap path only: create `spec/compatibility/1.0.0-rc.2/baseline.json`, `spec/compatibility/1.0.0-rc.2/change-cases.jsonl`, and `spec/distribution-readiness/0.2.0-rc.2/profile.json`.

**Interfaces:**
- Consumes: verified RC archive/commit and Task 1 decision.
- Produces: OIDC-published `1.0.0-rc.1` under the direct path, or token-bootstrap `1.0.0-rc.1` followed by OIDC-published `1.0.0-rc.2` under the bootstrap path.

- [ ] Configure the npm trusted publisher for GitHub user `xiongxhc`, repository `collective-cognition-sdk`, workflow filename `npm-publish.yml`, environment `npm-production`, and allowed action `npm publish` when registry state permits. If direct OIDC is available, confirm no `NPM_BOOTSTRAP_TOKEN` exists, push annotated `v1.0.0-rc.1` only after its commit equals `origin/main`, wait for its unprivileged build job, download and verify `archive-manifest.json` plus the exact archive, present those bytes at the protected-environment gate, and approve the OIDC publish job.
- [ ] If bootstrap is required, create one short-lived granular secret named exactly `NPM_BOOTSTRAP_TOKEN` in environment `npm-production`; the workflow maps it only to `NODE_AUTH_TOKEN` in the no-checkout publish job. Confirm the bootstrap path in the committed decision record, push annotated `v1.0.0-rc.1` only after its commit equals `origin/main`, wait for its unprivileged build job, download and verify `archive-manifest.json` plus the exact archive, present those bytes at the protected-environment gate, and approve the bootstrap-only publish job.
- [ ] The protected job recomputes the manifest SHA-256 before `npm publish "$archive_path" --ignore-scripts --provenance --tag next`, then runs `npm dist-tag ls collective-cognition-sdk`, records the observed state, and fails unless `next` equals the RC. It performs no dist-tag mutation. If `latest` also equals the RC (first-ever publication), record it as a known temporary state for the RC Release Evidence Record; the README and release notes already state that `next` is a prerelease, and only stable `1.0.0`, published without `--tag`, repoints `latest` — further `--tag next` candidates (including RC2) leave it unchanged.
- [ ] If RC1 was token-published, configure trusted publishing, set publishing access to require 2FA and disallow tokens, revoke `NPM_BOOTSTRAP_TOKEN`, and prepare RC2 in one atomic release commit: bump package/lockfile to `1.0.0-rc.2`, add the three exact RC2 artifact paths above, update the three pinned tests and listed status prose, and change no runtime/schema/conformance/historical artifact bytes.
- [ ] For RC2, run `npm test`, `npx tsc --noEmit`, `npm run check`, `npm run pack:check`, `npm audit --audit-level=high`, and `git diff --check`; independently review, merge to `main`, wait for CI, then push annotated `v1.0.0-rc.2` on exact `origin/main`.
- [ ] For RC2, wait for the unprivileged build job, inspect the exact manifest/digest/inventory, approve only those exact bytes in the protected OIDC publish job, and verify the published version used OIDC rather than token fallback. Under the direct path, the corresponding RC1 build, approval, and publication already occurred in the first step.
- [ ] Verify RC1 with `npm view collective-cognition-sdk@1.0.0-rc.1 --json`, `npm pack collective-cognition-sdk@1.0.0-rc.1`, and `npm dist-tag ls collective-cognition-sdk`. On the bootstrap path also run `npm view collective-cognition-sdk@1.0.0-rc.2 --json` and `npm pack collective-cognition-sdk@1.0.0-rc.2`. For each downloaded archive, compare registry SRI/archive bytes to its workflow manifest, install into a clean temporary project, run the package test's complete import/resource/CLI assertions, and run `npm audit signatures`.
- [ ] If publication or verification fails, create a new RC version and tag after correction; never move the failed tag or overwrite the npm version.

### Task 3: Bind Every Published RC Release Evidence

**Files:**
- Direct path: create `docs/acceptance/releases/1.0.0-rc.1/release-evidence.json` and `docs/acceptance/releases/1.0.0-rc.1/SHA256SUMS`.
- Bootstrap path: create the RC1 files above plus `docs/acceptance/releases/1.0.0-rc.2/release-evidence.json` and `docs/acceptance/releases/1.0.0-rc.2/SHA256SUMS`.
- Modify: `tests/release-evidence.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/ROADMAP.md`

**Interfaces:**
- Consumes: observed registry, provenance, tag, workflow, GitHub prerelease, and clean-consumer evidence.
- Produces: canonical immutable evidence for every registry-published RC, with the OIDC RC identified explicitly.

- [ ] Create one GitHub prerelease from each existing annotated published RC tag.
- [ ] Generate canonical sorted JSON containing package/version, publication time, registry tarball URL and digest, npm provenance identity, dist-tags (including any temporary `latest` state and the outcome of both registry-fact experiments), commit, tag object, workflow run, GitHub release URL, Node/npm versions, archive inventory summary, verification commands, and non-claims.
- [ ] Attach exact bytes using `collective-cognition-sdk-1.0.0-rc.1-release-evidence.json` and, on the bootstrap path, `collective-cognition-sdk-1.0.0-rc.2-release-evidence.json`.
- [ ] Compute each SHA-256 and publish it in release notes and `SHA256SUMS`. Always run `node scripts/verify-release-evidence.mjs --record docs/acceptance/releases/1.0.0-rc.1/release-evidence.json --asset /private/tmp/collective-cognition-sdk-1.0.0-rc.1-release-evidence.json --checksums docs/acceptance/releases/1.0.0-rc.1/SHA256SUMS`; on the bootstrap path run the corresponding exact command for `1.0.0-rc.2`.
- [ ] Extend tests and branch CI to discover each version directory and run the verifier. Corrections use `release-evidence-amendment-1.json` while retaining original bytes.
- [ ] Commit evidence and observed roadmap state, push, and wait for post-merge CI.
- [ ] Do not start stable promotion until this gate passes.

### Task 4: Prepare Stable `1.0.0`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `spec/compatibility/1.0.0/baseline.json`
- Create: `spec/compatibility/1.0.0/change-cases.jsonl`
- Create: `spec/distribution-readiness/0.2.0/profile.json`
- Modify: `tests/package.test.mjs`
- Modify: `tests/compatibility.test.mjs` (also repoint `currentBaselineUrl` to `1.0.0`)
- Modify: `tests/distribution-readiness-profile.test.ts`
- Modify: `README.md`
- Modify: `docs/public-api.md`
- Modify: `docs/ROADMAP.md`
- Modify: `spec/compatibility.md` (status prose and the `STAB-002` surface enumeration)
- Modify: `spec/distribution-readiness.md`
- Modify: `spec/README.md`

**Interfaces:**
- Consumes: OIDC-verified RC semantics and RC evidence.
- Produces: stable release commit on current `main` and a local rehearsal report in this plan's ignored SDD workspace.

- [ ] Write failing tests for package `1.0.0`, stable baseline/profile exports, baseline `packagePolicyVersion` `1.0.0`, a profile `npm-registry` channel that is `blocked` with each remaining prepublication blocker listed distinctly (`DRP-002` closed vocabulary, no `pending`), intended tag `v1.0.0`, and stable `latest` workflow routing.
- [ ] In one release commit, change version/release metadata and add stable baseline/profile bytes without changing existing runtime, schemas, conformance fixtures, or historical baseline/profile bytes. The `STAB-002` surface enumeration in `spec/compatibility.md` and the `currentBaselineUrl` repoint in `tests/compatibility.test.mjs` belong to this same commit, because that enumeration lists the surfaces of the compatibility baseline the commit records.
- [ ] Capture `OIDC_RC_HEAD` from the OIDC RC tag and compare root declarations, runtime outputs, contract bytes, and every pre-existing package file; only package/release metadata and newly added stable baseline/profile bytes may differ.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run check`, `npm run example`, `npm run example:portable`, `npm run example:host`, `npm run example:markdown`, `npm run example:workflow`, `npm run example:interoperability`, `npm run example:stable-host`, `npm run pack:check`, `npm audit --audit-level=high`, and `git diff --check`.
- [ ] Set `first="$(mktemp -d)"` and `second="$(mktemp -d)"`; build twice with isolated caches using `npm pack --json --pack-destination "$first" > "$first/pack.json"` and `npm pack --json --pack-destination "$second" > "$second/pack.json"`; set `first_archive="$(find "$first" -name 'collective-cognition-sdk-1.0.0.tgz' -print -quit)"` and `second_archive="$(find "$second" -name 'collective-cognition-sdk-1.0.0.tgz' -print -quit)"`; compare SHA-256 digests, exact bytes with `cmp`, and sorted normalized unpacked path/content digests.
- [ ] Run `node scripts/verify-package-archive.mjs --archive "$first_archive" --expected-version 1.0.0` and the same command for `second_archive`; unpack `first_archive` and scan for `/Users/`, `Team Vault`, private keys, npm/GitHub tokens, and AWS access keys.
- [ ] Write the rehearsal packet to `.superpowers/sdd/2026-08-25-phase-3-npm-release/stable-rehearsal.md`; do not add a tracked prepublication document after the release commit.
- [ ] Independently review, merge the stable release commit to `main`, wait for post-merge CI, confirm it remains current `origin/main`, and make no tracked commit before tagging.

### Task 5: Publish Stable `1.0.0`

**Files:** None before publication.

**Interfaces:**
- Consumes: exact stable main commit, workflow-built archive manifest, and accountable-human approvals.
- Produces: immutable npm `1.0.0`, `latest`, annotated tag, and GitHub release.

- [ ] At the stable tag gate, present the exact `origin/main` commit, local rehearsal inventory, verification matrix, OIDC publisher identity, intended annotated tag, and current `next`/`latest` state.
- [ ] After explicit tag approval, create and push annotated tag `v1.0.0` on exact `origin/main`; do not create the tag on any other commit.
- [ ] Wait for the unprivileged workflow build. Download `archive-manifest.json` and the archive, recompute SHA-256, inspect sorted inventory, and present those exact tag-built bytes at the separate protected-environment publication gate.
- [ ] After explicit exact-byte publication approval, approve environment `npm-production`; the no-checkout job verifies the manifest and publishes that same archive through OIDC.
- [ ] Verify with `npm view collective-cognition-sdk@1.0.0 --json`, `npm dist-tag ls collective-cognition-sdk`, `npm pack collective-cognition-sdk@1.0.0`, clean installation/import/CLI checks, archive/SRI comparison, and `npm audit signatures`; require `latest === 1.0.0`, confirm any temporary RC `latest` state recorded in the RC evidence is now resolved, and record the intentional `next` state.
- [ ] Create the GitHub release from the existing tag only after npm verification passes.
- [ ] If stable publication fails before npm accepts the version, diagnose without moving the tag; if npm accepted the version but verification fails, preserve all evidence and plan `1.0.1` rather than rewriting `1.0.0`.

### Task 6: Bind Stable Evidence and Close Phase 3

**Files:**
- Create: `docs/acceptance/releases/1.0.0/release-evidence.json`
- Create: `docs/acceptance/releases/1.0.0/SHA256SUMS`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/public-api.md`
- Modify: `spec/distribution-readiness.md`
- Modify: `tests/release-evidence.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: observed stable registry/release evidence.
- Produces: immutable stable evidence binding and truthful Phase 3 completion status.

- [ ] Generate canonical stable evidence with the same closed fields as the RC record and attach exact bytes to the GitHub release.
- [ ] Record SHA-256 in release notes and repository `SHA256SUMS`; download the asset to `/private/tmp/collective-cognition-sdk-1.0.0-release-evidence.json` and run `node scripts/verify-release-evidence.mjs --record docs/acceptance/releases/1.0.0/release-evidence.json --asset /private/tmp/collective-cognition-sdk-1.0.0-release-evidence.json --checksums docs/acceptance/releases/1.0.0/SHA256SUMS`.
- [ ] Extend tests and CI binding checks for stable evidence and retain append-only amendment rules.
- [ ] Update public docs from the prepublication `blocked` state to observed publication only outside immutable packaged profile bytes; keep production certification, hosted operation, ecosystem adoption, and LTS unclaimed.
- [ ] Mark Phase 3 complete only after registry, provenance, clean-consumer, release, evidence-binding, and post-merge CI checks pass.
- [ ] Dispatch final specification, code, security, package, and release-evidence reviews; correct repository-only issues without altering released bytes.
- [ ] Commit the closeout evidence, push its feature branch, merge it to `main`, wait for CI, and verify local/remote main plus immutable RC/stable tags.

## Phase 3 Completion Gate

- `collective-cognition-sdk@1.0.0` is installable from npm and verified from a clean consumer.
- At least one RC and stable `1.0.0` have npm OIDC provenance.
- RC and stable Release Evidence Records are byte-bound to GitHub assets.
- The roadmap claims no production certification, hosted service, adoption, SLA, or LTS.
