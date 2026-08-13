# Task 3 Report — SQLite Schema Version 2 Compatibility Boundary

## Status

DONE

## SHA

- Base: `2d5e9c5bbdfa08949c5abf08c79d0218a21299cf`
- Task commit: recorded in the final task result after this report is committed.

## RED Evidence

Command:

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts
```

Observed expected pre-implementation failure: `ERR_MODULE_NOT_FOUND` for `src/stores/sqlite-workflow.ts`.

## GREEN Evidence

Commands:

```bash
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts
PATH=/opt/homebrew/Cellar/node/24.9.0_1/bin:$PATH npx tsc --noEmit
git diff --check
```

Results:

- SQLite schema and existing-store command: `9` passed, `0` failed, `34` existing runtime-gated tests skipped.
- Typecheck: exited `0`.
- Diff check: exited `0`.

## Files Changed

- `src/stores/sqlite.ts`
- `src/stores/sqlite-workflow.ts`
- `tests/sqlite-store.test.ts`
- `tests/sqlite-workflow-schema.test.ts`
- `.superpowers/sdd/2026-08-13-durable-cognition-workflow/task-3-report.md`

## Delivered Boundary

- `SqliteCognitionStore` accepts exact reviewed schema versions `1` and `2`, while new targets created through it remain version `1`.
- `SqliteCognitionWorkflowStore` is defined only in `src/stores/sqlite-workflow.ts`, requires exact version `2`, and creates version `2` only when `createIfMissing` is true.
- Existing version-`1` files are inspected read-only and rejected by the workflow store without migration or mutation.
- Version-`2` schema identity includes the exact `cognition_workflows` table and rejects missing, malformed, hybrid, unknown, or extra schema objects with byte and nanosecond-mtime assertions.
- `src/stores/sqlite.ts` does not export `SqliteCognitionWorkflowStore`; no workflow persistence method is implemented in this task.

## Risks / Deviations

- `commitWorkflow` and atomic receipt persistence remain deferred to Task 4.

## Controller Ruling Fixes

### RED Evidence

Command:

```bash
/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc --noEmit
```

Observed expected failure before extraction: `Unused '@ts-expect-error' directive.` The public `SqliteCognitionStore` constructor accepted a second schema-selection argument.

### GREEN Evidence

Commands:

```bash
RUNTIME=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
"$RUNTIME" --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts
"$RUNTIME" node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Results:

- SQLite schema and existing-store tests: `43` passed, `0` failed, `0` skipped.
- Typecheck: exited `0`; the compile-time second-argument rejection is now consumed by the expected error.
- Diff check: exited `0`.

### Delivered Fixes

- `src/stores/sqlite-internal.ts` now holds the non-public store base, schema profiles, and exact schema targets.
- `src/stores/sqlite.ts` exports only `SqliteCognitionStoreOptions` and `SqliteCognitionStore`; its constructor takes only the original options and selects the v1 creation/v1-or-v2 opening boundary internally.
- `src/stores/sqlite-workflow.ts` directly uses the internal base with the exact v2 target.
- The test-local defensive-mode monkeypatch is deleted. All SQLite checks now run on Node `24.19.0` with real `DatabaseSync.prototype.enableDefensive` support.
- `package.json` was not changed; a package-export test confirms `./stores/sqlite-internal` remains unavailable.

## CI Runtime Gate Fix

### RED Evidence

Node `24.9.0` does not expose `DatabaseSync.prototype.enableDefensive`. Without the capability gate, the schema-boundary tests attempted to run and failed before exercising their intended runtime contract.

### GREEN Evidence

Commands:

```bash
NODE_24_9=/opt/homebrew/Cellar/node/24.9.0_1/bin/node
"$NODE_24_9" --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts

NODE_24_19=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
"$NODE_24_19" --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts
"$NODE_24_19" node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Results:

- Node `24.9.0`: `5` passed, `0` failed, `39` skipped by the real defensive-mode capability gate. Runtime-independent API and package-export tests remain active.
- Node `24.19.0`: `43` passed, `0` failed, `0` skipped.
- Typecheck and diff check: exited `0`.

### Delivered Fix

- `tests/sqlite-workflow-schema.test.ts` now uses the same real `DatabaseSync.prototype.enableDefensive` probe as `tests/sqlite-store.test.ts` and applies `test.skip` only to tests that require SQLite defensive mode.
- No defensive behavior is monkeypatched, simulated, or shimmed. The CI matrix and package exports are unchanged.
