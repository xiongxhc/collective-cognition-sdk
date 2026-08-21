# Task 4 Report — Atomic Durable SQLite Persistence

## Status

DONE

## SHA

- Base: `90c9f4dedb3154328736ef34d70bed22dc9baa6b`
- Task commit: recorded in the final task result after this report is committed.

## RED Evidence

Initial focused command on Node `24.19.0`:

```bash
/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-store.test.ts
```

Observed expected failure: `TypeError: store.commitWorkflow is not a function`.

The first SQLite conformance run then reported the missing conflict behavior. After atomic commit and exact replay were green, the matrix still failed workflow-ID, object, event, version, and incomplete-workflow conflict cases. A later cross-record validation RED proved that individually valid but forged Evidence or reviewed-Hypothesis records reached a transaction instead of being rejected during preparation.

## GREEN Evidence

Node `24.19.0` focused SQLite, conformance, and existing-store command:

```bash
/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-store.test.ts tests/durable-workflow-conformance.test.ts tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts
```

Result: `66` passed, `0` failed, `0` skipped.

Node `24.9.0` capability command:

```bash
/opt/homebrew/Cellar/node/24.9.0_1/bin/node --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-store.test.ts tests/durable-workflow-conformance.test.ts tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts
```

Result: `14` passed, `0` failed, `53` skipped by the real defensive-mode capability gate. No shim or monkeypatch supplied missing runtime behavior.

Also passed:

```bash
/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc --noEmit
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build
git diff --check
```

The built runtime inventories remain `SqliteCognitionStore` for `stores/sqlite` and `SqliteCognitionWorkflowStore` for `stores/sqlite-workflow`. The built workflow declaration exposes the original options, inherited store reads, idempotent close, and `commitWorkflow`; no failure hook or constructor option is emitted.

## Delivered Behavior

- Validates and snapshots the complete prepared workflow before `BEGIN IMMEDIATE`, including cross-record Hypothesis, Evidence, transition, context, and attribution correlations.
- Executes fixed conflict precedence in one immediate transaction and propagates unexpected transaction errors without success-shaped conversion.
- Validates stored receipt, object, event, row identity, and Portable Cognition semantics before canonical comparison.
- Persists three object rows, one event row, and one receipt atomically; exact replay after close/reopen returns `already_committed`.
- Forces failure after each of five insert boundaries and proves full rollback, including the receipt, followed by successful retry and exact replay.
- Produces `committed` plus `already_committed` for identical two-store writers and one complete winner plus `workflow_id_collision` for conflicting writers without mixed rows.
- Runs all ten Task 2 conformance cases against isolated SQLite version-2 databases, including explicit version-conflict setup and deterministic one-shot rollback setup.
- Preserves version-1/version-2 opening behavior, the existing `src/stores/sqlite.ts` export inventory, and the unexported package-internal SQLite module.

## Files Changed

- `src/stores/sqlite-internal.ts`
- `src/stores/sqlite-workflow.ts`
- `tests/sqlite-workflow-store.test.ts`
- `tests/durable-workflow-conformance.test.ts`
- `tests/sqlite-workflow-schema.test.ts`
- `.superpowers/sdd/2026-08-13-durable-cognition-workflow/task-4-report.md`

`src/stores/sqlite.ts` required no edit; preserving it byte-for-byte is the narrowest way to retain its public export inventory and v1/v2 behavior.

## Risks / Deviations

- The full Node `24.19.0` source run reported `485` passed, `9` skipped, and `3` failed. The exact base commit reproduces the same three failures: one public-API documentation/package-export mismatch and two durable team-memory permission-model acceptance failures. They are outside Task 4 and were not changed.
- The Task 2 conformance contract requires an occupied reviewed-Hypothesis revision to classify as `object_revision_collision` before event collision. The SQLite implementation follows that reusable contract while retaining the brief's remaining fixed precedence.
- No private ledger path was accessed, no subagent was used, and no package, compatibility, documentation, CLI, or unrelated runtime behavior was changed.

## Important-Finding Identity Validation Fix

### RED Evidence

Node `24.19.0` regression command:

```bash
/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --disable-warning=ExperimentalWarning --test --test-name-pattern='duplicate prepared storage keys|complete stored receipt' tests/sqlite-workflow-store.test.ts
```

Result: `0` passed and `2` failed. Evidence reusing the initial Hypothesis storage key escaped preparation and raised a raw `UNIQUE constraint failed` SQLite error. A same-workflow receipt with an alternate valid digest and dangling Evidence reference returned a conflict instead of rejecting the corrupt stored workflow.

### GREEN Evidence

Node `24.19.0` focused SQLite, reusable conformance, and existing-store command:

```bash
/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-store.test.ts tests/durable-workflow-conformance.test.ts tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts
```

Result: `68` passed, `0` failed, `0` skipped. This includes duplicate object-key and incoherent event-occupancy rejection before `BEGIN IMMEDIATE`, all five forced rollback boundaries, identical and conflicting concurrency, and four receipt-corruption cases with unchanged row snapshots.

Node `24.9.0` capability command:

```bash
/opt/homebrew/Cellar/node/24.9.0_1/bin/node --disable-warning=ExperimentalWarning --test tests/sqlite-workflow-store.test.ts tests/durable-workflow-conformance.test.ts tests/sqlite-workflow-schema.test.ts tests/sqlite-store.test.ts
```

Result: `14` passed, `0` failed, `55` skipped by the existing runtime capability gate; no shim was used.

Also passed:

```bash
/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc --noEmit
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build
git diff --check
```

Built export inventories remain exactly `SqliteCognitionStore` from `stores/sqlite` and `SqliteCognitionWorkflowStore` from `stores/sqlite-workflow`; `src/stores/sqlite.ts` and `package.json` are unchanged.

### Fix Scope

- `src/stores/sqlite-workflow.ts`: validates distinct prepared object storage keys and event occupancy before transaction entry; validates the receipt row and its complete referenced canonical workflow before digest classification.
- `tests/sqlite-workflow-store.test.ts`: adds adversarial prepared-key/event values and fail-closed, no-mutation receipt corruption coverage.
- `.superpowers/sdd/2026-08-13-durable-cognition-workflow/task-4-report.md`: appends this RED/GREEN evidence and final counts.

No Task 5 work, public hook/export, production constructor widening, private ledger access, subagent use, or unrelated change was introduced.
