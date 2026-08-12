# Task 3 Report — Additive Package 0.8.0 Evidence

## Status

DONE

## Result

Implemented the additive private package `0.8.0` evidence slice by:

- bumping package metadata and lockfile version from `0.7.0` to `0.8.0` while keeping `private: true`;
- exporting `./distribution-readiness/0.1.0` from `package.json`;
- adding `spec/compatibility/0.8.0/baseline.json`;
- adding `spec/compatibility/0.8.0/change-cases.jsonl`;
- extending package and compatibility tests to require the `0.8.0` baseline, the new JSON subpath, the exact package contents, and a clean consumer JSON import;
- preserving all `0.1.0`–`0.7.0` compatibility artifacts byte-for-byte;
- making the smallest necessary carry-forward update to `docs/public-api.md` so the checked public API reference enumerates the additive `./compatibility/0.8.0` and `./distribution-readiness/0.1.0` subpaths already required by the existing Task 1 API-reference test.

## Files Touched

- `docs/public-api.md`
- `package-lock.json`
- `package.json`
- `spec/compatibility/0.8.0/baseline.json`
- `spec/compatibility/0.8.0/change-cases.jsonl`
- `tests/compatibility.test.mjs`
- `tests/package.test.mjs`

## RED → GREEN

### RED

After writing the Task 3 expectations first:

- `npm run test:compatibility` failed because `spec/compatibility/0.8.0/baseline.json` and `spec/compatibility/0.8.0/change-cases.jsonl` did not exist.
- `npm run test:package` failed because the new baseline was missing and `./distribution-readiness/0.1.0` was not exported.

### GREEN

After the minimal implementation:

- the package version, lockfile version, and retained private state matched `0.8.0`;
- the export map gained only `./distribution-readiness/0.1.0` and `./compatibility/0.8.0`;
- the packed artifact included the expected additive evidence files;
- the clean consumer imported both `collective-cognition-sdk/runtime-security/0.1.0` and `collective-cognition-sdk/distribution-readiness/0.1.0` as JSON;
- the `0.8.0` compatibility baseline recorded the exact `0.7.0` historical digest and the new additive evidence digests.

## Exact Digests

- `docs/public-api.md` — `f731b0e776977ef3461a20f8ce0ddcb8badbbef09c5ef1ec1dafb277d01b5ca3`
- `rfcs/0009-public-api-and-distribution-readiness.md` — `1af6ec6f193d07e572d207024c41d6a5118e313fa73416364e834a0c8cb200bf`
- `spec/distribution-readiness.md` — `9c88e7fdce4dbcbfae2a27cf40d76dea7e7e7cefa84f43ad4aef7e848d5e6f78`
- `spec/distribution-readiness/0.1.0/profile.json` — `5d1d236c946820be65d04648b66ca215073810a908ad8d44da8f04f800909af9`
- `spec/compatibility/0.7.0/baseline.json` — `732dad2f2aff303c0b80cfcf1474e64b71648d82256e2ba5c9efcf9e6575e50f`
- `spec/compatibility/0.8.0/change-cases.jsonl` — `9cb7bd259d2b84e7fb1f8839263bfae0d54eb2ba8aaa07de9f15957660244572`
- `spec/compatibility/0.8.0/baseline.json` — `e50b5b74e4f65fa63314a7ee8aeb271a878fde5bc15531c20c6336cbd6d0d592`

## Verification

- `PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build`
- `PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test:compatibility`
  - Result: `21/21` tests passed
- `PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test:package`
  - Result: `10/10` tests passed
- `PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/distribution-readiness-profile.test.ts`
  - Result: `8/8` tests passed
- `git diff --check`
  - Result: clean

## Self-Review

- Confirmed `package.json.private === true`.
- Confirmed no production dependency fields were introduced.
- Confirmed root runtime exports, root type exports, CLI registry, and promotion policy identities remain unchanged from the `0.7.0` baseline.
- Confirmed the additive export-map changes are limited to `./compatibility/0.8.0` and `./distribution-readiness/0.1.0`.
- Confirmed all historical `0.1.0`–`0.7.0` compatibility digests still match their frozen expectations.

## Concerns

- `node_modules` is pre-existing and remains untracked in this worktree; it was not added or modified intentionally.
- The checked API reference needed a minimal additive update in `docs/public-api.md` so the existing Task 1 verification could stay green against package `0.8.0`.

## Fix Round 1

- Replaced the `0.8.0` distribution-readiness digest checks in `tests/compatibility.test.mjs` with independent literal constants for:
  - `docs/public-api.md`
  - `rfcs/0009-public-api-and-distribution-readiness.md`
  - `spec/distribution-readiness.md`
  - `spec/distribution-readiness/0.1.0/profile.json`
  - `spec/compatibility/0.8.0/change-cases.jsonl`
- Added assertions that both:
  - the file bytes hash to the exact pinned literals; and
  - the corresponding baseline fields equal those same literals.
- Kept the existing frozen `0.7.0` digest pins unchanged.

### Fix Round 1 Verification

- `PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build`
- `PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test:compatibility`
  - Result: `21/21` tests passed
- `PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test:package`
  - Result: `10/10` tests passed
- `PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/distribution-readiness-profile.test.ts`
  - Result: `8/8` tests passed
- `git diff --check`
  - Result: clean
