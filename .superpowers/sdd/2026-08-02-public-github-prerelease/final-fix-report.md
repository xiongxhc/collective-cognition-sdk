# Final Release-Readiness Correction Report

**Date:** 2026-08-02
**Branch:** `feature/public-prerelease-readiness`
**Correction parent:** `43d8d2e796c49db9e2503d58d646c138251a69f7`
**Review source:** `.superpowers/sdd/2026-08-02-public-github-prerelease/final-review.md`
**Status:** All I-1 through I-6, M-1/M-2, and scoped residual R-1 through R-3 corrections are implemented and locally verified. Public GitHub/CI/release evidence remains intentionally unobserved.

## Scope and Safety

This was the one authorized whole-branch correction round. Changes are limited to the release builder, release-readiness tests, prerelease workflow, public release/support/changelog guidance, and necessary design/plan/roadmap reconciliation. No package runtime API, `package.json`, compatibility baseline, source implementation, live ledger, vault, database, credential, tag, remote branch, or public release was changed.

The correction contains one explicit package-artifact decision: because `0.6.0` has no prior public artifact, the current docs-inclusive private tarball is the first finalized public artifact candidate. The stale README was not restored. Runtime, declaration, CLI, schema, RFC compatibility surface, and the exact 91-entry package inventory remain unchanged.

## Scoped Residual Closure

The same authorized correction round continued only for the three residuals in the scoped re-review. No additional feature, runtime, compatibility, package-inventory, live-data, publication, or remote-operation scope was added.

### R-1 — Closed reviewed release command surfaces

- Arbitrary shell interpretation is no longer the proof boundary. The semantic npm scanner remains as defense in depth for directly visible npm invocations, without attempting recursive shell/evaluation interpretation.
- Before resolving tools or invoking any package script, the builder canonicalizes the complete package script map as lexically sorted `[name, value]` pairs and requires SHA-256 `574c12e5cc890227a58b16939ef1e0e861b9a011c4b8040f6df03ee4044534e3`.
- Release-readiness tests require the exact reviewed bytes of `.github/workflows/ci.yml` at SHA-256 `9d88b4a258164ec8311f1e4952845cac61ecdc9bab68f771075cc794a0940119` and `.github/workflows/github-prerelease.yml` at SHA-256 `c96c8879f9c350caf115831c51ac340fb8a502e469dcf2e7d8006776d67b43e1`.
- Any package-script-map or workflow-byte drift now fails until a reviewer intentionally updates the corresponding digest.
- Builder, CI-workflow, prerelease-workflow, and package-script mutations include `sh -c 'npm "$@"' -- --silent publish`; all are rejected by the closed contract even though positional expansion is intentionally outside semantic interpretation.
- A marker-script mutation verifies that an unreviewed replacement of the reviewed `build` script is rejected with `INVALID_PACKAGE` before the marker can execute.

### R-2 — Canonical checksum inventory at both trust boundaries

- The privileged transfer verifier and downloaded runbook verifier parse `SHA256SUMS` before relying on the platform checksum utility.
- Both require exact UTF-8 bytes ending in one newline, exactly three lines, lowercase 64-character SHA-256 values, exactly two separator spaces, and the exact lexical filename order `collective-cognition-sdk-0.6.0.cdx.json`, `collective-cognition-sdk-0.6.0.tgz`, `release-manifest.json`.
- Exact names reject omissions, extras, reordering, absolute paths, traversal paths, and option-like names before any checksum-selected path is opened.
- Each parsed digest is independently recomputed from the downloaded/transferred bytes.
- Policy mutations delete an entry, reorder entries, and add `../../etc/passwd`; executable simulations ran both embedded verifiers against the valid inventory and rejected all six malformed verifier/inventory combinations.

### R-3 — Download-directory attestation operands

- Every downloaded runbook attestation now verifies `"$release_dir/$asset"`; the checksum subshell cannot leave later operands relative to the repository working directory.
- A runbook mutation that removes the `"$release_dir/"` prefix is rejected.

## Finding Resolution

### I-1 — Bundled Node npm resolution and trust

Resolved in `scripts/build-github-prerelease.mjs` and `tests/release-readiness.test.ts`.

- Preserved the closed subprocess `PATH`; caller `PATH` is never used to discover npm.
- Added closed adjacent layouts plus the reviewed system layouts, including `/usr/local/lib/node_modules/npm/bin/npm-cli.js`.
- Resolve real files and require the exact `npm/bin/npm-cli.js` package shape.
- Require package metadata `name: "npm"`, a valid version, `bin.npm: "bin/npm-cli.js"`, and a matching declared CLI realpath.
- On POSIX, require trusted root/current-user ownership and reject group/other-writable Node, npm CLI, npm package, npm `bin`, and Git entries.
- Invoke `npm-cli.js` shell-free through the already trusted Node executable.
- Execute `npm --version` in the isolated environment and require it to equal package metadata.
- Record `npmVersion` in `release-manifest.json`.
- Added actual separate-layout coverage, hostile caller-`PATH` rejection, forged identity, malformed metadata version, reported-version mismatch, and POSIX writable-mode rejection.

Verified local tool identity:

```text
Node: /Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
Node version: v24.14.0
npm CLI: /usr/local/lib/node_modules/npm/bin/npm-cli.js
npm package: npm@9.6.7
POSIX identity: root:wheel, mode 0755 for the reviewed CLI layout
```

### I-2 — First public artifact and immutable digest

Resolved in the builder, release tests, README, roadmap, design, and plan.

- Finalized the docs-inclusive private `0.6.0` tarball as the first public artifact candidate.
- Kept the exact 91-entry package inventory and all compatibility surfaces unchanged.
- Pinned the complete tarball SHA-256 in executable builder logic:

```text
3ece9dfe61b3407722451ab541d1d43c5e12ec4ef1c155ad5c5b0d1df9d03978
```

- The builder now fails with fixed code `PACKAGE_ARTIFACT_DRIFT` before publication when any packaged byte changes.
- Added a mutation test that changes packaged README bytes, observes the fixed drift failure, and restores the file.
- Two final local builds were byte-identical, each contained exactly four release assets, and each tarball contained exactly 91 entries.

Frozen-file evidence:

```text
package.json changed in this correction: no
src runtime API changed in this correction: no
spec/compatibility changed in this correction: no
package.json SHA-256: b99cb507d9b235ac7a749b592779b7448f89d6b2cb0bbfa2db6faf3726f6a1b8
0.6.0 baseline SHA-256: 5549845df16c610d3b418220ebe895941ffcbb1f9dbe849d0a231e51e17d7289
```

### I-3 — Non-throwing cleanup and publication ordering

Resolved in the builder and failure-injection tests.

- Runtime cleanup is non-throwing and reports success/failure instead of escaping the fixed diagnostic boundary.
- A primary build failure remains the sole reported error even if cleanup also fails.
- A cleanup failure after otherwise successful construction becomes the single fixed `CLEANUP_FAILED` diagnostic.
- Runtime cleanup completes successfully before stage publication and before success JSON is emitted.
- Stage cleanup remains identity-checked and non-throwing.
- Injected mode-000 runtime content verifies both primary-failure preservation and cleanup-changes-outcome behavior.
- Both injected cases produce no stdout, one parseable fixed stderr object, no stage publication, and no path or secret disclosure.

### I-4 — Read-only verification and minimal privileged publication

Resolved in `.github/workflows/github-prerelease.yml` and structural mutation tests.

- Top-level and `verify` job permissions are `contents: read` only.
- Checkout uses the pinned action and `persist-credentials: false`.
- Checkout, dependency installation, tests, examples, package checks, two deterministic builds, and clean installation all run in `verify`.
- `verify` uploads exactly four explicit files with pinned `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02`.
- The dependent `publish` job has only `contents: write`, `id-token: write`, and `attestations: write`.
- `publish` downloads with pinned `actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093`.
- The privileged job performs no checkout, setup-node, npm/npx invocation, package script, dependency, repository Git operation, or repository package-code execution.
- Before attestation/publication it independently requires four regular non-symlink files, checksum validity, exact manifest semantics, pinned tarball digest, every declared asset byte length/digest, and the exact SBOM.
- The privileged checksum parser requires the exact canonical three-entry checksum bytes and recomputes every digest before platform checksum verification.
- Mutation tests reject missing/changed permissions, persisted credentials, missing dependency ordering, floating action pins, transfer weakening, repository checkout, and package execution in the privileged job.

Local workflow evidence:

```text
Ruby/Psych YAML parse: passed
Read-only job equivalent: passed through full tests, examples, package checks, two builds, and clean install
Privileged transfer simulation: passed with repositoryCodeExecuted=false
```

### I-5 — Structural npm publication rejection

Resolved in builder and workflow/package policy scanners.

- The primary release-command proof is closed: one canonical digest pins the exact package script map, and exact raw-byte digests pin both executable workflows.
- npm command strings are tokenized across whitespace, quoting, escapes, command separators, and newlines.
- Once an `npm`, `npm.cmd`, or `npm.exe` invocation is found, forbidden publication/account verbs are rejected after global options and workspace/prefix options.
- The semantic scanners remain defense in depth for directly visible npm commands; they do not claim to interpret arbitrary shell expansion, evaluation, substitution, or stdin.
- Added builder, CI, prerelease-workflow, and package-script mutations for:

```text
npm --silent publish
npm --workspace package-a publish
npm --workspace=package-a publish
npm -w package-a publish
npm --prefix /tmp/package-a publish
sh -c 'npm --silent publish'
bash -c 'npm --silent publish'
eval 'npm --silent publish'
sh -c 'npm "$@"' -- --silent publish
```

- Existing registry-configuration and authentication-token rejection remains enforced.

### I-6 — Executable downloaded-artifact runbook

Resolved in `docs/github-prerelease.md`, the plan, roadmap, and release-readiness mutation tests.

The post-download procedure now fails closed unless it verifies:

- exactly four regular, non-symbolic downloaded files;
- exact canonical three-entry checksum bytes, recomputed digest validity, and all four GitHub attestations addressed under the download directory;
- exact manifest keys, repository, tag, peeled exact-master commit, private package identity, Node version, npm version, ordered asset inventory, pinned tarball digest, every byte length, and every SHA-256;
- exact CycloneDX 1.6 SBOM structure and dependency edge;
- clean offline installation from the downloaded tarball;
- all 7 public JavaScript module specifiers;
- all 9 public JSON specifiers;
- all 4 public text specifiers;
- all 3 installed CLIs;
- an unauthenticated official-registry request with a 15-second timeout and 1 KiB response cap that accepts only HTTP `404`, JSON content type, parseable JSON, and exact payload `"Not Found"`.

Deletion/substitution mutations now cover commit, private state, Node/npm versions, pinned digest, declared byte length, digest recomputation, exact SBOM identity/version, JavaScript/JSON/text subpaths, absent Authorization, timeout, JSON parsing, content type, HTTP status, and exact not-found body.

The exact live read-only registry predicate was run with bundled Node and returned:

```json
{"statusCode":404,"contentType":"application/json","registryPayload":"Not Found","authorization":null}
```

### M-1 — Support boundary

`SUPPORT.md` now states that the experimental prerelease provides no production support and no long-term-support/LTS promise. The policy test enforces both statements.

### M-2 — Conditional changelog claim

`CHANGELOG.md` now says GitHub distribution is conditional on observing the `v0.6.0` prerelease and remains planned until then. Tests reject the previous present-tense `it is distributed` claim.

## TDD and Debugging Evidence

The correction followed the recorded red/green sequence:

1. Bundled Node baseline reproduced `11/14` focused passes and three exact `NPM_UNAVAILABLE` failures.
2. Closed system-layout npm trust changed the focused result to green under the actual bundled Node.
3. Injected cleanup failure initially produced fixed JSON followed by an uncontrolled stack/path leak; the non-throwing cleanup boundary made both failure cases green.
4. `npm --silent publish` was initially accepted by the builder/workflow scanner; structural tokenization made all option/workspace mutations fail closed.
5. The original single privileged job failed the split-job structural test; the read-only transfer design made it green.
6. Missing runbook/support/changelog predicates failed documentation tests; executable checks and policy text made them green.
7. Packaged README mutation initially built successfully; literal tarball pinning made it fail with `PACKAGE_ARTIFACT_DRIFT`.
8. A final audit found present-but-not-mutation-locked private/SBOM/registry-parser predicates; added substitutions/deletions pass only against the complete runbook.
9. The first residual literal-wrapper mutations initially passed both policy scanners and reached package-artifact drift in the builder; literal recursive inspection closed only those concrete forms and exposed the need for a stronger architecture boundary.
10. The residual checksum mutation initially showed that an incomplete inventory passed platform checksum verification; exact parsing in both embedded verifiers now rejects deletion, reordering, and an extra traversal path.
11. The downloaded attestation simulation found every bare operand outside `$release_dir`; prefixed operands plus a prefix-removal mutation close that path error.
12. The positional-expansion mutation `sh -c 'npm "$@"' -- --silent publish` reproduced four red failures: both builders reached package-artifact drift instead of early package rejection, and workflow/package policies accepted the executable form.
13. Canonical package-script and exact workflow-byte digests changed that selected result to `6/6` green; the marker-script case confirms rejection occurs before package-script execution. Recursive shell interpretation was then removed while direct semantic npm checks remained green.

One local clean-install attempt encountered the existing inaccessible home npm cache. The same validation was rerun with a new temporary `npm_config_cache`; it passed. No repository change was made for that harness/environment condition.

The first residual full-gate command used a deliberately reduced `PATH` that omitted the `npm` launcher required by nested package scripts, so it exited before running tests with `sh: npm: command not found`. The gate was rerun with bundled Node first and trusted `/usr/local/bin` present; all tests passed. This was a test-harness invocation correction, not a product failure.

## Final Verification

All commands used the bundled Node `v24.14.0` unless a platform parser/shell utility is named explicitly.

| Gate | Result |
| --- | --- |
| `npm test` | PASS: source 426 pass/1 supported skip, schema 10/10, compatibility 19/19, package 9/9; 464 passes total, 0 failures |
| Focused release readiness | PASS: 20/20, 0 failures; closed-contract selection 6/6 |
| `tsc --noEmit` | PASS |
| `npm run check` | PASS |
| Six examples, including synthetic team-memory and durable SQLite fixture | PASS |
| `npm run pack:check` | PASS |
| Two independent release builds | PASS, byte-identical four-asset output |
| Pinned tarball | PASS, 91 entries, SHA-256 `3ece9dfe61b3407722451ab541d1d43c5e12ec4ef1c155ad5c5b0d1df9d03978` |
| Reviewed command surfaces | PASS: package scripts `574c12e5...4534e3`, CI workflow `9d88b4a2...40119`, prerelease workflow `c96c8879...b43e1` |
| Manifest/SBOM/checksum verification | PASS; `npmVersion` is `9.6.7` locally |
| Clean offline install and public subpaths | PASS: 7 JavaScript, 9 JSON, 4 text |
| Installed CLIs | PASS: 3/3 |
| Workflow YAML parse and policy simulations | PASS |
| Canonical checksum verifier simulations | PASS: 2 valid verifier runs; 6/6 deletion/reorder/extra-path mutations rejected |
| Privileged transfer verifier simulation | PASS, including exact canonical checksum inventory |
| Exact unauthenticated npm-registry absence check | PASS: HTTP 404, JSON `"Not Found"` |
| Package/runtime/compatibility frozen checks | PASS: no correction-round changes |
| `git diff --check` | PASS |

## Remaining External Evidence

No local defect or unresolved Critical/Important finding remains in the authorized correction scope. The following acceptance items remain intentionally pending because performing them would exceed this correction round and requires the later operator-controlled release flow:

- remote four-entry GitHub Actions matrix observation;
- pull request creation and squash merge;
- private vulnerability reporting enablement on GitHub;
- annotated `v0.6.0` tag creation/push;
- public prerelease URL, workflow run, attestations, and downloaded release observation.

No push, pull request, tag, public release, or live-data mutation was performed.
