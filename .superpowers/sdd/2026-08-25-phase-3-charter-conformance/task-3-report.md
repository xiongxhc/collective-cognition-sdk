# Task 3 Report: TypeScript Reference Projection Validators

## Status

Implemented and committed as `ddc60ed feat: add cognition projection validators`.
No push or merge was performed.

## Files

- `src/cognition-projections.ts`
- `src/index.ts`
- `tests/cognition-projections.test.ts`
- `package.json`

## Implementation

- Added versioned cognitive-object and cognition-event projection validators and
  deserializers as thin adapters over Portable Cognition `0.1.0`.
- In-memory validation wraps an unknown projection payload in one canonical
  Portable Cognition envelope and delegates to
  `validatePortableCognitionRecord`.
- Deserialization embeds raw standalone payload text directly in the canonical
  envelope and delegates to `deserializePortableCognitionRecord`; it never
  parses standalone JSON before delegation.
- The public projection depth is therefore `255`, preserving Portable
  Cognition's `256`-container limit after the envelope's added root container.
- Exported all seven required projection API names from the package root and
  added both new source and test files to `npm run check`.

## RED

Command:

```sh
PATH=/opt/homebrew/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/cognition-projections.test.ts
```

Result: exit `1`. The new test file failed during module loading because
`src/index.ts` did not yet export
`COGNITION_EVENT_PROJECTION_VERSION`. This was the expected absent-API
failure before implementation.

## GREEN

Command:

```sh
PATH=/opt/homebrew/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/cognition-projections.test.ts
```

Result: exit `0`; `12` tests passed and `0` failed. The suite covers every
Task 2 valid and invalid fixture, lifecycle classification, malformed JSON
versus lexical error-code split, duplicate members, lone surrogates, runtime
depth precedence, deep freezing, caller isolation, accessor safety, and
canonical envelope equivalence.

## Validation

Focused and adjacent command:

```sh
PATH=/opt/homebrew/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/cognition-projections.test.ts tests/portable-cognition.test.ts tests/objects.test.ts tests/transitions.test.ts && PATH=/opt/homebrew/bin:$PATH npx tsc --noEmit && PATH=/opt/homebrew/bin:$PATH npm run check
```

Result: exit `0`; `102` tests passed with `0` failures. TypeScript checking
and repository syntax checking passed.

Full-suite command, run once:

```sh
PATH=/opt/homebrew/bin:$PATH npm test
```

Result: exit `1` after the source-test stage: `483` passed, `2` failed, and
`76` expected skips. The command built `dist/` successfully but stopped before
the schema, compatibility, and package phases because of the two failures
listed under Concerns.

## Self-review

- Confirmed deserializers preserve raw standalone JSON text and delegate all
  lexical, structural, depth, and semantic handling to Portable Cognition.
- Confirmed malformed JSON remains `SERIALIZATION_ERROR`; all closed-profile
  and record failures remain `INVALID_PORTABLE_COGNITION_RECORD`.
- Confirmed event depth-256 fails at Portable Cognition's runtime boundary
  before closed-schema processing.
- Confirmed the staged commit contained exactly the four Task 3 files and
  `git diff --cached --check` passed before commit.

## Concerns

- The complete source test stage detects the intentional new root exports while
  the package remains at `0.10.0`. Task 6 owns the atomic private `0.11.0`
  package transition: it must create the new `0.11.0` compatibility baseline
  and synchronize `docs/public-api.md`; the immutable
  `spec/compatibility/0.10.0/baseline.json` bytes must not change. Task 6 also
  owns one final reviewed `package.json` script-map hash pin in
  `tests/release-readiness.test.ts`, after every Task 3-5 script addition.
- No Task 3 runtime, typecheck, syntax, focused, or adjacent validation
  concern remains.

## Fix Round 1

Corrected the Phase 3 plan and this report after Task 3 review:

- Task 6 now owns `tests/release-readiness.test.ts`, including a single final
  canonical `package.json` script-map SHA-256 pin after all Task 3-5 script
  additions.
- The plan and report consistently identify seven projection root exports.
- The transient distribution-readiness mismatch is deferred only to Task 6's
  atomic private `0.11.0` baseline and public API documentation update;
  `0.10.0` compatibility baseline bytes remain immutable.

Validation command:

```sh
PATH=/opt/homebrew/bin:$PATH node --disable-warning=ExperimentalWarning --test tests/cognition-projections.test.ts && PATH=/opt/homebrew/bin:$PATH npm run check && PATH=/opt/homebrew/bin:$PATH npx tsc --noEmit && git diff --check
```

Result: exit `0`; the projection suite reported `12` passes and `0` failures,
and `npm run check`, TypeScript checking, and `git diff --check` completed
without errors.
