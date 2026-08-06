# Public GitHub Prerelease Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a verifiable GitHub prerelease for private package `0.6.0` without enabling or contacting npm publication.

**Architecture:** A repository-only Node.js builder creates an npm-compatible tarball, a deterministic CycloneDX SBOM, a canonical release manifest, and ordered checksums in an explicit empty output directory. Read-only cross-platform CI verifies the SDK and distribution path. The tag-only GitHub workflow performs checkout, dependency execution, verification, and asset construction in a read-only job, then transfers exactly four assets to a separate privileged job that executes no repository package or dependency code before attestation and idempotent prerelease publication. Community, security, and release documentation state the experimental support boundary and keep npm publication explicitly blocked.

**Tech Stack:** Node.js `24`, npm, TypeScript, Node test runner, GitHub Actions, CycloneDX JSON `1.6`, GitHub artifact attestations, GitHub Releases.

## Global Constraints

- Repository is `xiongxhc/collective-cognition-sdk`; package is `collective-cognition-sdk` version `0.6.0`; tag is exactly `v0.6.0`.
- `package.json` must retain `"private": true`; do not add npm authentication, registry writes, `npm publish`, `NODE_AUTH_TOKEN`, or package write permissions.
- The release contains exactly `collective-cognition-sdk-0.6.0.tgz`, `collective-cognition-sdk-0.6.0.cdx.json`, `release-manifest.json`, and `SHA256SUMS`.
- Release-readiness files, workflows, tests, and scripts must remain outside the exact package tarball allowlist and must not change the `0.6.0` compatibility baseline. This first public artifact explicitly finalizes the current docs-inclusive private tarball and accepts native Windows absolute team-memory database paths; the public API, schema, compatibility surface, and exact file inventory remain unchanged, and final Ubuntu Node `24.14.0` tarball SHA-256 `3b50ebaa83e0a025ba49aaf81099e8de805e35e2c177a76beb4b985b575a9efe` is pinned.
- CI tests Ubuntu Node `24.9.0`, Ubuntu Node `24.14.0`, macOS Node `24.14.0`, and Windows Node `24.14.0`.
- GitHub Actions must be official `actions/*` projects pinned to exact commits: checkout `3d3c42e5aac5ba805825da76410c181273ba90b1` (`v7.0.1`), setup-node `820762786026740c76f36085b0efc47a31fe5020` (`v7.0.0`), upload-artifact `ea165f8d65b6e75b540449e92b4886f43607fa02`, download-artifact `d3f86a106a0bac45b974a628896c90dbdf5c8093`, and attest-build-provenance `0f67c3f4856b2e3261c31976d6725780e5e4c373` (`v4.1.1`).
- The builder accepts only `node scripts/build-github-prerelease.mjs --output /absolute/empty/directory` and emits sanitized diagnostics without absolute paths, secrets, source content, or arbitrary subprocess output.
- The SBOM is deterministic CycloneDX `1.6`, contains exactly the SDK component and its empty dependency edge, and rejects non-empty `dependencies`, `optionalDependencies`, or `peerDependencies`.
- The release is a GitHub prerelease, is not latest, and does not claim production certification, LTS, npm publication, live-vault acceptance, or unsupported runtimes.
- Do not invent a contact address. Defer a code of conduct until a verified private reporting channel exists.
- Do not mutate any team-memory ledger, cognition database, live Obsidian vault, scheduler, or sibling repository.

---

### Task 1: Deterministic Release Artifact Builder

**Files:**
- Create: `scripts/build-github-prerelease.mjs`
- Create: `tests/release-readiness.test.ts`
- Verify unchanged: `package.json`
- Verify unchanged: `spec/compatibility/0.6.0/baseline.json`

**Interfaces:**
- Consumes: repository `package.json`, current Git commit, `npm pack --json`, and an explicit absolute empty output directory.
- Produces: the exact four release assets and one stdout JSON object shaped as `{ "ok": true, "tag": "v0.6.0", "assets": ["SHA256SUMS", "collective-cognition-sdk-0.6.0.cdx.json", "collective-cognition-sdk-0.6.0.tgz", "release-manifest.json"] }`.

- [ ] **Step 1: Add failing builder contract tests**

Create `tests/release-readiness.test.ts` using `node:test`, `node:assert/strict`, `spawnSync`, and temporary directories. Assert all of the following with direct process invocations:

```ts
test("release builder requires an explicit safe output directory", () => {
  // Missing --output, relative paths, missing parents, files, non-empty
  // directories, and symbolic links must fail before writing an asset.
});

test("release builder creates the exact deterministic asset set", () => {
  // Run twice into fresh directories from the same checkout commit.
  // Compare each asset byte-for-byte and assert the exact four filenames.
});

test("release manifest, checksums, and SBOM are exact", () => {
  // Validate package identity, private status, tag, 40-hex commit, Node
  // version, lexical SHA256SUMS ordering, complete byte lengths/digests,
  // CycloneDX 1.6 format, one component, and one empty dependency edge.
});

test("release diagnostics do not disclose paths or injected secrets", () => {
  // Force a failure with RELEASE_TEST_SECRET and assert neither the secret,
  // absolute temp path, cwd, nor arbitrary npm stderr appears.
});
```

The test helper must derive the expected commit with `git rev-parse HEAD`; the builder must ignore caller-provided commit environment variables and derive the same identity itself.

- [ ] **Step 2: Run focused tests and confirm the missing builder fails**

Run: `node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts`

Expected: FAIL because `scripts/build-github-prerelease.mjs` does not exist or produces no assets.

- [ ] **Step 3: Implement strict argument and output-target validation**

Implement the builder with these closed rules:

```js
const EXPECTED = Object.freeze({
  repository: "xiongxhc/collective-cognition-sdk",
  packageName: "collective-cognition-sdk",
  packageVersion: "0.6.0",
  tag: "v0.6.0",
  assets: Object.freeze([
    "SHA256SUMS",
    "collective-cognition-sdk-0.6.0.cdx.json",
    "collective-cognition-sdk-0.6.0.tgz",
    "release-manifest.json",
  ]),
});
```

Snapshot `process.argv.slice(2)` into a plain frozen array; require exactly `--output` and one string value. Resolve no relative paths. Use `lstatSync` to reject symbolic links, require an existing directory with an existing parent, and require `readdirSync(output).length === 0` before mutation. On every failure, remove files created by the current invocation and print only a fixed JSON error such as `{"ok":false,"error":"INVALID_OUTPUT_TARGET"}` to stderr.

- [ ] **Step 4: Implement deterministic artifact generation**

Read and parse `package.json`; require exact name/version/private values and empty runtime dependency fields. Derive the commit with `git rev-parse HEAD`, require a full lowercase 40-hex SHA, and do not accept any caller override. Run the reviewed local `npm run --ignore-scripts build` first so a clean checkout creates `dist/`; release tests must reject forbidden publication/authentication tokens in every package script. Then run `npm pack --json --ignore-scripts --offline --pack-destination /absolute/empty/directory` with the actual validated output path substituted as one subprocess argument, plus `npm_config_ignore_scripts=true`, `npm_config_offline=true`, `npm_config_audit=false`, `npm_config_fund=false`, a sanitized environment, and captured output. Require one pack result and rename the generated tarball only if npm's filename is not already `collective-cognition-sdk-0.6.0.tgz`.

Write the SBOM using this exact structural contract with sorted object keys at every level, two-space JSON indentation, LF endings, and a final LF:

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "version": 1,
  "metadata": {
    "component": {
      "bom-ref": "pkg:npm/collective-cognition-sdk@0.6.0",
      "name": "collective-cognition-sdk",
      "purl": "pkg:npm/collective-cognition-sdk@0.6.0",
      "type": "library",
      "version": "0.6.0"
    }
  },
  "components": [],
  "dependencies": [
    {
      "ref": "pkg:npm/collective-cognition-sdk@0.6.0",
      "dependsOn": []
    }
  ]
}
```

Compute SHA-256 and byte length from complete buffers. Build `release-manifest.json` with repository, tag, commit, package `{ name, version, private }`, `nodeVersion`, and entries for the tarball and SBOM before computing checksums; then write `SHA256SUMS` in lexical filename order for tarball, SBOM, and manifest. The manifest asset inventory therefore lists the two payload files, the checksum file covers those payloads plus the completed manifest without recursively hashing itself, and the release workflow's exact inventory remains four files.

- [ ] **Step 5: Make determinism and cleanup tests pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts`

Expected: PASS with deterministic bytes, exact metadata, sanitized failures, and no residue after rejected or failed runs.

- [ ] **Step 6: Verify frozen package compatibility**

Run:

```bash
npm run test:compatibility
npm run test:package
git diff -- package.json spec/compatibility/0.6.0/baseline.json
```

Expected: both suites PASS and the final diff command emits no output.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-github-prerelease.mjs tests/release-readiness.test.ts
git commit -m "feat: build deterministic GitHub release assets"
```

### Task 2: Public Contribution and Security Boundary

**Files:**
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `SUPPORT.md`
- Create: `CHANGELOG.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`
- Create: `.github/dependabot.yml`
- Modify: `tests/release-readiness.test.ts`

**Interfaces:**
- Consumes: Apache-2.0 licensing, existing compatibility/RFC process, private GitHub vulnerability-reporting route.
- Produces: public contributor, support, vulnerability, issue, pull-request, and dependency-update contracts without an invented contact or npm publication promise.

- [ ] **Step 1: Add failing repository-policy tests**

Add tests that require every listed file, parse the YAML files as constrained text, and assert:

```ts
assert.match(security, /security\/advisories\/new/);
assert.doesNotMatch(security, /@(?:gmail|outlook|company)\./i);
assert.match(contributing, /Conventional Commits/);
assert.match(contributing, /feature\/|fix\/|docs\//);
assert.match(contributing, /Co-Authored-By/);
assert.match(support, /GitHub Issues/);
assert.match(support, /private data|personal data/i);
assert.match(changelog, /0\.6\.0/);
assert.match(changelog, /private|unpublished/i);
assert.match(dependabot, /package-ecosystem: "github-actions"/);
assert.match(dependabot, /package-ecosystem: "npm"/);
```

Also assert there is no `CODE_OF_CONDUCT.md` and no auto-merge workflow.

- [ ] **Step 2: Run focused tests and confirm missing files fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts`

Expected: FAIL on the first missing community file.

- [ ] **Step 3: Write security, contribution, support, and history documents**

`SECURITY.md` must route reports to `https://github.com/xiongxhc/collective-cognition-sdk/security/advisories/new`, prohibit secrets/live ledgers/vault data in public issues, describe maintained scope as the current experimental prerelease only, and explicitly avoid SLA, certification, or LTS promises.

`CONTRIBUTING.md` must require Node `24`, `npm ci --ignore-scripts`, local `npm test`, `npx tsc --noEmit`, `npm run check`, TDD, Conventional Commits, intent-based branches (`feature/`, `fix/`, `docs/`, `test/`, `chore/`), no `Co-Authored-By` trailers, RFC review for semantic/compatibility changes, and package-baseline updates only for intentional contract changes.

`SUPPORT.md` must direct reproducible SDK defects to Issues, private security reports to the advisory route, and state that source connectors are independently owned unless explicitly maintained here. `CHANGELOG.md` must summarize `0.1.0` through `0.6.0`, identify `0.6.0` as private/unpublished and distributed only as an experimental GitHub prerelease, and link the compatibility artifacts.

- [ ] **Step 4: Add structured issue, PR, and Dependabot configuration**

The bug form must request SDK version, Node/OS, minimal reproduction, expected/actual behavior, and safety confirmation that no private data is included. The feature form must request user problem, portable behavior, alternatives, compatibility impact, and whether an RFC is needed. Disable blank issues and link private vulnerability reporting. The PR template must cover tests, compatibility, security/privacy, documentation, release impact, and no private data. Dependabot must propose weekly npm and GitHub Actions updates with open-PR limits and no auto-merge configuration.

- [ ] **Step 5: Run policy tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts`

Expected: PASS for all community and security assertions.

- [ ] **Step 6: Commit**

```bash
git add SECURITY.md CONTRIBUTING.md SUPPORT.md CHANGELOG.md .github tests/release-readiness.test.ts
git commit -m "docs: add public project contribution policies"
```

### Task 3: Read-Only Cross-Platform CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `tests/release-readiness.test.ts`

**Interfaces:**
- Consumes: package scripts and Task 1 builder.
- Produces: a read-only four-entry runtime/OS matrix plus one distribution-verification job.

- [ ] **Step 1: Add failing CI policy tests**

Add a workflow scanner that rejects tab indentation, aliases, dynamic action expressions, any `uses:` value not matching `^actions/[a-z0-9_-]+@[0-9a-f]{40}$`, `npm publish`, `NODE_AUTH_TOKEN`, `.npmrc` mutation, and `packages: write`. Apply the same publication/authentication-token rejection to every `package.json` script. Require `permissions: contents: read`, triggers for pull requests, `master`, and manual dispatch, cancellation concurrency, and the exact four matrix entries.

Require these exact action pins:

```text
actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
```

Require every matrix run to execute `npm ci --ignore-scripts`, `npm test`, `npx tsc --noEmit`, and `npm run check`. Require the Ubuntu `24.14.0` distribution job to run every `example*` script, `npm run pack:check`, Task 1's builder, two-build byte comparison, checksum verification, SBOM/manifest validation, clean tarball installation, package import, and all three installed CLIs. Reject any builder invocation or package lifecycle path that can omit `--ignore-scripts` or `--offline`.

- [ ] **Step 2: Run focused tests and confirm the workflow is missing**

Run: `node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts`

Expected: FAIL because `.github/workflows/ci.yml` does not exist.

- [ ] **Step 3: Implement the CI workflow**

Use explicit matrix `include` entries rather than independent OS/version axes. Set workflow-level `permissions: contents: read`, `timeout-minutes`, and concurrency cancellation. Use npm caching only through pinned `setup-node`. The distribution job must create two temporary output directories, call the builder twice from the same checkout, compare all files with `cmp`, verify `sha256sum -c`, parse JSON with Node, install the tarball into a fresh temporary consumer with `npm install --ignore-scripts`, import every public package subpath already covered by package tests, and invoke `collective-cognition`, `collective-cognition-teammem`, and `collective-cognition-markdown` with their help or version-safe smoke arguments.

- [ ] **Step 4: Run release and package tests**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts
npm run test:package
```

Expected: PASS and no release-readiness file appears in the tarball.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml tests/release-readiness.test.ts
git commit -m "ci: verify supported release environments"
```

### Task 4: Tag-Only GitHub Prerelease Workflow

**Files:**
- Create: `.github/workflows/github-prerelease.yml`
- Create: `.github/release.yml`
- Modify: `tests/release-readiness.test.ts`

**Interfaces:**
- Consumes: a public immutable `v0.6.0` tag equal to `origin/master`, Task 1 assets, and verified private vulnerability reporting.
- Produces: an idempotent GitHub prerelease with exactly four attested assets and no npm operation.

- [ ] **Step 1: Add failing release-workflow policy tests**

Require a `push.tags: ["v*"]`-only trigger with no `workflow_dispatch`, checkout `fetch-depth: 0`, exact tag/package equality, exact `test "$GITHUB_SHA" = "$(git rev-parse origin/master)"`, and a `package.json` private guard. Require Node `24.14.0`, the same full validation commands as the distribution job, exact four-asset verification, and official pinned actions only. Recovery uses GitHub's rerun operation for the original immutable tag workflow, not a branch-based manual dispatch.

Require workflow-level and verification-job permissions to be exactly `contents: read`, checkout `persist-credentials: false`, and a separate dependent publish job whose permissions are exactly `contents: write`, `id-token: write`, and `attestations: write`; reject `packages: write`. Require:

```text
actions/attest-build-provenance@0f67c3f4856b2e3261c31976d6725780e5e4c373
```

Require attestation to use the four explicit subject paths. Require an idempotent `gh release view` / `gh release create --prerelease --verify-tag --generate-notes` / `gh release upload --clobber` flow and reject `--latest` or `make_latest: true`.

- [ ] **Step 2: Run focused tests and confirm the workflow is missing**

Run: `node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts`

Expected: FAIL because `.github/workflows/github-prerelease.yml` does not exist.

- [ ] **Step 3: Implement the prerelease workflow**

Validate the tag before dependency installation. Fetch `origin master`, reject a tag whose commit differs from `origin/master`, and keep all artifact work under `${{ runner.temp }}`. In the read-only job, run the full release verification and transfer the four exact paths with pinned `actions/upload-artifact`. In the dependent privileged job, use pinned `actions/download-artifact`, execute no checkout or repository package/dependency code, independently validate the transferred assets, attest them, then create or update only the release for `$GITHUB_REF_NAME`. For an existing release, assert it is a prerelease before replacing the four named assets; never create or move a tag. Set `GH_TOKEN: ${{ github.token }}` and `GH_REPO: ${{ github.repository }}` only on release API steps so the no-checkout job has explicit repository context.

`.github/release.yml` must categorize features, fixes, documentation, dependencies, and other changes without excluding contributors or inventing release claims.

- [ ] **Step 4: Run workflow policy and package tests**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts
npm run test:package
git diff -- package.json spec/compatibility/0.6.0/baseline.json
```

Expected: PASS, exact package contract unchanged, and no diff for frozen files.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/github-prerelease.yml .github/release.yml tests/release-readiness.test.ts
git commit -m "ci: automate attested GitHub prereleases"
```

### Task 5: Distribution Documentation and Release Runbook

**Files:**
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `rfcs/README.md`
- Create: `docs/github-prerelease.md`
- Modify: `tests/release-readiness.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4 repository behavior.
- Produces: exact public install/verify instructions, support boundaries, release operations, and current roadmap/RFC status.

- [ ] **Step 1: Add failing documentation assertions**

Require documentation to name all four assets, the exact tested runtime matrix, `npm install` from a downloaded GitHub tarball, `shasum -a 256 -c SHA256SUMS`, GitHub CLI attestation verification, prerelease status, package-private/npm-unpublished distinction, temporary-vault acceptance only, SQLite as a reference adapter, and the next Phase 5 interoperability work. Reject unsupported claims matching `production[- ]ready`, `npm published`, `live vault accepted`, or Node versions outside the tested matrix when presented as verified.

- [ ] **Step 2: Run focused tests and confirm current docs fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts`

Expected: FAIL because public distribution instructions and the runbook are absent.

- [ ] **Step 3: Update README, roadmap, and RFC status**

Add a `GitHub Prerelease` README section with commands that download the release assets, verify checksums and attestations, install the local tarball, import the SDK, and run each installed CLI. State that `"private": true` blocks npm publication but does not prevent a tarball installation from GitHub. Update Phase 3 distribution readiness and Phase 4 verification status in the roadmap, add a release execution checklist without claiming evidence values before the release exists, and make Phase 5 interoperability the next SDK development slice. Correct RFC 0007 from “final review remains pending” to final-review verified.

- [ ] **Step 4: Add the maintainer release runbook**

`docs/github-prerelease.md` must give exact commands for local verification, building twice, verifying assets, enabling/checking private vulnerability reporting with `gh api`, opening and squash-merging the feature PR, deleting the branch, verifying `master`, creating one annotated immutable tag, pushing only the tag, waiting for Actions, downloading the release, checking prerelease/not-latest state, verifying checksums/attestations/install/import/CLIs, recording evidence, and responding to a failed public tag by issuing a new version rather than moving it.

Do not put a real release URL, run ID, merge SHA, tag SHA, or pass result into the roadmap until observed.

- [ ] **Step 5: Run documentation and full local verification**

Run:

```bash
node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts
npm test
npx tsc --noEmit
npm run check
npm run example
npm run example:portable
npm run example:host
npm run example:teammem
npm run example:teammem:durable
npm run example:markdown
npm run pack:check
git diff --check
```

Expected: all commands PASS; the historical compatibility baseline and exact package file inventory remain unchanged, and the explicitly finalized docs-inclusive tarball matches its pinned SHA-256.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/ROADMAP.md docs/github-prerelease.md rfcs/README.md tests/release-readiness.test.ts
git commit -m "docs: document public prerelease distribution"
```

### Task 6: Review, Merge, and Publish the Prerelease

**Files:**
- Modify after verified release: `docs/ROADMAP.md`

**Interfaces:**
- Consumes: reviewed feature branch, GitHub repository administration, GitHub Actions, and GitHub Releases.
- Produces: merged `master`, enabled private vulnerability reporting, immutable `v0.6.0`, public prerelease, downloaded verification evidence, and a factual roadmap record.

- [ ] **Step 1: Run independent whole-branch review**

Review `master...feature/public-prerelease-readiness` against the approved design and this plan. Treat untrusted YAML/text as data, inspect the builder's path and failure boundaries, verify the workflow cannot publish npm, and report Critical, Important, and Minor findings separately. Resolve all Critical and Important findings, rerun focused checks, and obtain a clean scoped re-review.

- [ ] **Step 2: Re-run the complete local gate on the reviewed head**

Run the exact Task 5 Step 5 matrix plus two fresh artifact builds using the actual reviewed commit SHA. Verify all four files byte-for-byte, unpack the tarball into a clean consumer, import every public subpath, and smoke all three installed CLIs.

Expected: all checks PASS with no source-ledger, cognition database, or vault writes.

- [ ] **Step 3: Push, open, and squash-merge the feature PR**

```bash
cat > /tmp/collective-cognition-sdk-pr.md <<'EOF'
## Summary
- add deterministic GitHub prerelease assets and attestations
- add read-only cross-platform CI and public project policies
- document private-package GitHub installation and verification

## Verification
- npm test
- npx tsc --noEmit
- npm run check
- npm run pack:check
- release builder determinism and clean-consumer smoke
EOF
git push -u origin feature/public-prerelease-readiness
PR_URL="$(gh pr create --base master --head feature/public-prerelease-readiness --title "feat: add public GitHub prerelease distribution" --body-file /tmp/collective-cognition-sdk-pr.md)"
PR_NUMBER="$(gh pr view "$PR_URL" --json number --jq .number)"
gh pr checks --watch "$PR_NUMBER"
gh pr merge "$PR_NUMBER" --squash --delete-branch
git -C ~/Workspace/collective-cognition-sdk fetch origin master
git -C ~/Workspace/collective-cognition-sdk checkout master
git -C ~/Workspace/collective-cognition-sdk merge --ff-only origin/master
```

Expected: required checks pass, PR merges once, remote feature branch is deleted, and local `master` fast-forwards to exactly `origin/master`.

- [ ] **Step 4: Enable and verify private vulnerability reporting**

Run `gh api --method PUT repos/xiongxhc/collective-cognition-sdk/private-vulnerability-reporting`, then require `gh api repos/xiongxhc/collective-cognition-sdk/private-vulnerability-reporting --jq '.enabled'` to print `true`. If the setting cannot be verified, stop before creating the tag.

- [ ] **Step 5: Create and push the immutable prerelease tag**

On clean, verified `master`, require `git rev-parse master` to equal `git rev-parse origin/master`, then:

```bash
git tag -a v0.6.0 -m "Collective Cognition SDK 0.6.0 prerelease"
git push origin v0.6.0
```

Expected: one annotated tag points to the verified merge commit. Never force, delete, or move it after publication.

- [ ] **Step 6: Wait for and verify the public prerelease**

Use `gh run watch` for the tag workflow, then download the release into a fresh temporary directory. Require exactly four regular non-symbolic files; verify `gh api repos/xiongxhc/collective-cognition-sdk/releases/tags/v0.6.0` reports `prerelease: true`, `draft: false`, the exact tag, and the exact asset inventory. Fetch `origin master refs/tags/v0.6.0:refs/tags/v0.6.0`, then require `git rev-parse 'refs/tags/v0.6.0^{}'` to equal `git rev-parse origin/master`; do not use the release API's `target_commitish` as tag-target evidence. Query `gh api repos/xiongxhc/collective-cognition-sdk/releases/latest`; require either HTTP `404` or a different `tag_name`, proving `v0.6.0` is not GitHub's latest stable release. Then run `shasum -a 256 -c SHA256SUMS`; independently validate exact SBOM structure and every manifest filename, byte length, SHA-256, commit, tag, private flag, Node version, and npm version; verify every public JavaScript, JSON, and text subpath; and make an unauthenticated official-registry request that accepts only the exact HTTP `404` plus JSON `"Not Found"` response. Verify each downloaded asset with:

```bash
for asset in SHA256SUMS collective-cognition-sdk-0.6.0.cdx.json collective-cognition-sdk-0.6.0.tgz release-manifest.json; do
  gh attestation verify "$asset" \
    --repo xiongxhc/collective-cognition-sdk \
    --signer-workflow xiongxhc/collective-cognition-sdk/.github/workflows/github-prerelease.yml \
    --source-ref refs/tags/v0.6.0
done
```

Finally perform a clean tarball installation, import public subpaths, and smoke all three installed CLIs.

Expected: `isPrerelease` is true, `isLatest` is false, all asset and attestation checks pass, and npm remains unpublished.

- [ ] **Step 7: Record observed release evidence**

Update `docs/ROADMAP.md` only with observed release URL, merge SHA, tag target SHA, workflow run URL, asset names/digests, tested Node/OS result, attestation verification, clean-install/import/CLI result, private vulnerability-reporting status, and npm-unpublished status. Commit and push this documentation-only follow-up through a `docs/` branch and squash-merge after CI.

Expected: every current-state statement is tied to inspected GitHub or downloaded-asset evidence; no placeholder or unverified claim remains.
