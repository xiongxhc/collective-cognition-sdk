# Task 5 Report — Closed Durable Workflow CLI

Status: DONE

Commit: `a0fe80746fdd8f9de0bf56030d107b436c36f76e`

## Files

- `src/workflow-cli-contract.ts`
- `src/workflow-cli.ts`
- `tests/workflow-cli-contract.test.ts`
- `tests/workflow-cli.test.ts`
- `package.json`

## Implemented Contract

- Added only `collective-cognition-workflow run` and the exact reviewed options, formats, defaults, and `neutral-evidence-v1` serialized policy identity.
- Added incremental bounded request, JSON, JSONL, and stdin reads with independent request, input, record-count, and record-size limits.
- Added closed own-data request parsing, duplicate-member rejection, fail-fast SourceRecord normalization, and explicit preparation before deferred SQLite opening.
- Added canonical-path, realpath, symbolic-link, hard-link, SQLite main/sidecar, request/input, and Markdown marker/manifest alias preflight before mutation.
- Added fixed single-line stage diagnostics, zero stdout for pre-output failures, one result line for completed workflow results, and sanitized output-write failure handling.
- Added no publisher. Optional explicit Markdown projection runs only after persistence and reports downstream failure through the durable result model.
- Preserved root exports and all three historical executable mappings while adding the requested executable.

## RED

Command:

`PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/workflow-cli-contract.test.ts tests/workflow-cli.test.ts`

Observed expected failure before production code:

- `ERR_MODULE_NOT_FOUND` for `src/workflow-cli-contract.ts`.
- CLI behavior tests failed because `src/workflow-cli.ts` did not exist.
- SQLite persistence cases capability-skipped because Node 24.9 does not enforce the required defensive mode.

## GREEN

Node 24.9.0 focused matrix:

- 45 tests total.
- 25 passed.
- 20 capability-skipped.
- 0 failed.
- The 20 skips are the 15 SQLite workflow-store tests and 5 CLI persistence/output behavior tests requiring enforced defensive mode.

Node 24.19.0 focused matrix:

- Official Darwin arm64 archive verified against the release `SHASUMS256.txt` before execution.
- 45 tests total.
- 45 passed.
- 0 skipped.
- 0 failed.

Both runtimes passed `npx tsc --noEmit`.

Additional passing checks on Node 24.19.0:

- `npm run build`
- `npm run check`
- emitted `dist/workflow-cli.js` syntax and executable-mode checks
- built CLI closed-failure smoke check
- package export-map equality with base
- historical executable-map preservation
- exact five-file Task 5 scope check
- `git diff --check`

## Risks and Deviations

- Node 24.9 cannot execute honest SQLite persistence behavior because its `node:sqlite` runtime lacks enforced defensive mode; no shim or downgrade was added. Full behavior passed on Node 24.19.
- Task 6's temporary end-to-end example, Markdown recovery acceptance, CI example wiring, and related documentation were intentionally not implemented.
- Package compatibility baseline and final package inventory updates remain Task 7; Task 5 changes only the executable map and build/check wiring required for this CLI.
- No source ledger, home-directory default, repository discovery, vault discovery, environment-selected data source, or event publisher was added.

## Review Correction — Regular stdin identity

The `--input -` preflight now captures only fd 0's device/inode identity when it is a regular file. It rejects aliases against the request, cognition main database and all sidecars, and Markdown marker/manifest candidates before any database or Markdown mutation. Pipes and terminals remain bounded stdin sources without ambient-path resolution.

### RED

Command:

`/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --disable-warning=ExperimentalWarning --test tests/workflow-cli-contract.test.ts tests/workflow-cli.test.ts`

Observed expected failure before the production correction:

- `rejects regular stdin aliases before database or Markdown mutation` failed because the CLI returned `WORKFLOW_INVALID_INPUT` instead of the required `WORKFLOW_PATH_CONFLICT` at stage `input`.
- 18 tests passed and 1 failed; the new pipe-stdin success coverage passed.

### GREEN

Node 24.19.0 full matrix:

- `47` tests passed, `0` skipped, `0` failed for `tests/workflow-cli-contract.test.ts`, `tests/workflow-cli.test.ts`, `tests/durable-workflow-prepare.test.ts`, and `tests/sqlite-workflow-store.test.ts`.

Node 24.9.0 capability matrix:

- `26` tests passed, `21` SQLite defensive-mode capability tests skipped, and `0` failed for the same matrix.

Both runtimes passed `npx tsc --noEmit`. Node 24.19.0 also passed `npm run build`, `npm run check`, and `git diff --check`.
