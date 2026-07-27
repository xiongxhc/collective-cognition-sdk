# Collective Cognition SDK Package Stabilization Implementation Plan

**Status:** Complete and verified

**Historical note:** This execution plan records the initial package slice. SourceRecord fixtures were later promoted into `spec/conformance/0.1.0/source-record/`, the package subsequently added the versioned SourceRecord schema subpath, and Apache-2.0 licensing plus attribution and citation artifacts were added later.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce verified ESM JavaScript, declaration files, a source-neutral package root, and an installed `collective-cognition` CLI while keeping npm publication blocked.

**Architecture:** TypeScript emits `src/` into ignored `dist/` with rewritten `.js` import specifiers. `package.json` exposes only the root SDK and `collective-cognition` executable, includes an explicit file allowlist, and retains `"private": true`. A package smoke suite imports built output, runs the built CLI, and audits the npm tarball manifest.

**Tech Stack:** Node.js 24+, TypeScript 7, Node ESM, `node:test`, npm 11, and dependency-free runtime source.

## Global Constraints

- The package has zero production dependencies.
- The root API remains source-neutral.
- Team-memory and Git connector modules are not package entrypoints.
- Source material never becomes Evidence implicitly.
- `"private": true` remains until license, package name, security policy, and explicit publication approval are complete.
- Build output is generated under `dist/` and is never committed.
- Every relative TypeScript source import is emitted as a JavaScript import.
- Every behavior change follows RED → GREEN TDD.
- All repository Markdown remains synchronized with implementation status.

---

### Task 1: Package Contract Smoke Test

**Files:**
- Create: `tests/package.test.mjs`

**Interfaces:**
- Consumes: built `dist/index.js`, `dist/index.d.ts`, `dist/cli.js`, `package.json`, and `spec/fixtures/source-records/valid.jsonl`
- Produces: executable package-contract verification used by `npm run test:package`

- [x] **Step 1: Write the failing package test**

Create Node tests that:

```js
const expectedRuntimeExports = [
  "DomainError",
  "DomainErrorCode",
  "SOURCE_RECORD_SCHEMA_VERSION",
  "canonicalizeJson",
  "createObject",
  "createSourceRecord",
  "deserializeObject",
  "deserializeSourceRecord",
  "evaluateAuthorization",
  "ingestAndPromoteEvidence",
  "ingestSourceRecordText",
  "ingestSourceRecords",
  "neutralEvidencePolicyV1",
  "promoteSourceRecordsToEvidence",
  "serializeObject",
  "serializeSourceRecord",
  "sourceRevisionKey",
  "transitionObject",
  "validateSourceRecord",
];
```

Assert that built files exist, importing `dist/index.js` yields exactly this sorted export list, emitted `.js` and `.d.ts` files contain no relative `.ts` specifiers, the built CLI accepts the first canonical valid SourceRecord, and `npm pack --dry-run --json --ignore-scripts` exactly matches the approved file allowlist. Pack and install the artifact into a clean temporary consumer, compile a strict TypeScript consumer with `skipLibCheck: false` and default optional-property semantics, then verify a package-name import and the installed `collective-cognition` executable.

- [x] **Step 2: Run RED**

Run: `node --test tests/package.test.mjs`

Expected: FAIL because `dist/index.js`, `dist/index.d.ts`, and `dist/cli.js` do not exist.

- [x] **Step 3: Keep package diagnostics actionable**

Every assertion message names the missing artifact, leaked path, unexpected export, or failing packaged command. The tarball audit rejects paths beginning with `src/`, `tests/`, `examples/`, `docs/`, `.superpowers/`, or `node_modules/`.

- [x] **Step 4: Commit boundary**

Do not commit yet; the test is intentionally red and belongs in the same logical package-stabilization commit as Task 2.

### Task 2: Build and Manifest Contract

**Files:**
- Create: `tsconfig.build.json`
- Create: `scripts/rewrite-declaration-imports.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Modify: `src/cli.ts`

**Interfaces:**
- Produces: `npm run build`
- Produces: `npm run test:source`
- Produces: `npm run test:package`
- Produces: ESM package root `dist/index.js`
- Produces: declaration root `dist/index.d.ts`
- Produces: executable `dist/cli.js`

- [x] **Step 1: Add the build configuration**

Create:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "rewriteRelativeImportExtensions": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/adapters/**/*.ts", "src/teammem-cli.ts"]
}
```

The connector source remains tested in the repository but is not emitted in this root package slice. After TypeScript emit, `scripts/rewrite-declaration-imports.mjs` rewrites relative `.ts` specifiers that TypeScript preserves in declaration files to `.js`.

- [x] **Step 2: Define manifest entrypoints and scripts**

Keep `"private": true`. Add `description`, `keywords`, `repository`, `bugs`, `homepage`, `main`, `types`, `exports`, `bin`, `files`, and `"sideEffects": false`. Add:

```json
{
  "scripts": {
    "build": "node --eval \"import { rmSync } from 'node:fs'; rmSync('dist', { recursive: true, force: true })\" && tsc -p tsconfig.build.json && node scripts/rewrite-declaration-imports.mjs",
    "test:source": "node --disable-warning=ExperimentalWarning --test tests/*.test.ts",
    "test:package": "node --test tests/package.test.mjs",
    "test": "npm run build && npm run test:source && npm run test:package",
    "pack:check": "npm run build && npm run test:package"
  }
}
```

Retain the existing check, example, connector-development, and generic CLI scripts.

- [x] **Step 3: Add executable and ignore rules**

Add `#!/usr/bin/env node` as the first line of `src/cli.ts`. Add `dist/` and `.DS_Store` to `.gitignore`.

- [x] **Step 4: Refresh lock metadata**

Run: `npm install --package-lock-only --ignore-scripts`

Expected: root package metadata in `package-lock.json` matches the manifest and no production dependencies are added.

- [x] **Step 5: Run GREEN**

Run:

```bash
npm run build
node --test tests/package.test.mjs
npm test
npx tsc --noEmit
npm run check
npm run example
node --test tests/conformance.test.ts
```

Expected: all commands pass; package smoke tests report no leaked files or exports.

### Task 3: Public Documentation and Phase Status

**Files:**
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `spec/README.md`
- Modify: `docs/superpowers/specs/2026-07-27-package-stabilization-design.md`
- Modify: `docs/superpowers/plans/2026-07-27-package-stabilization.md`

**Interfaces:**
- Consumes: verified package commands and artifacts from Task 2
- Produces: accurate public usage, status, limits, and publication-gate documentation

- [x] **Step 1: Document package development usage**

Document:

```bash
npm run build
npm run test:package
npm run pack:check
```

State that build artifacts are locally consumable but the package remains unpublished and guarded by `"private": true`.

- [x] **Step 2: Correct repository licensing language**

Describe this as a public source repository, not an open-source package, until a license exists. Add license selection and final package-name confirmation to the Phase 3 roadmap.

- [x] **Step 3: Mark the delivered slice**

Mark package build artifacts, root exports, installed CLI, package-content verification, and compatibility smoke tests complete. Keep normative schemas, final compatibility rules, license, security policy, external distribution, and publication planned.

- [x] **Step 4: Run documentation checks**

Run:

```bash
git diff --check
grep -RInE "private local reference source|public open-source repository" README.md docs spec rfcs --exclude-dir=plans
```

Expected: `git diff --check` passes and the stale wording search returns no matches.

- [x] **Step 5: Review and commit**

Review the complete diff for public/private boundary leaks, package overclaims, connector exports, and publication claims. Commit the logical slice with:

```bash
git add .gitignore package.json package-lock.json tsconfig.build.json scripts/rewrite-declaration-imports.mjs src/cli.ts src/types.ts tests/package.test.mjs README.md docs/ROADMAP.md spec/README.md rfcs/0001-universal-source-record-ingestion.md docs/superpowers/specs/2026-07-27-package-stabilization-design.md docs/superpowers/plans/2026-07-27-package-stabilization.md
git commit -m "feat: add verified package build contract"
```
