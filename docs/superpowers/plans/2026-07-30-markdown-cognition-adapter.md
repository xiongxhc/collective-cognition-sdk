# Markdown Cognition Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, read-only Portable Cognition-to-Markdown adapter that safely projects validated cognition into an explicitly initialized Git/Obsidian directory without discovering or modifying any other vault content.

**Architecture:** Keep SQLite or another host-selected `CognitionStore` authoritative. Add a pure Markdown profile codec, a separate managed-target projection layer, and a dedicated closed CLI through the optional `collective-cognition-sdk/adapters/markdown/0.1.0` package subpath. The adapter writes only under an explicit marked directory, tracks complete file digests in a canonical manifest, preserves unchanged files, and fails rather than overwriting manual edits.

**Tech Stack:** TypeScript 7, Node.js 24 built-ins, native `node:test`, canonical Portable Cognition JSON, SHA-256, filesystem temporary-file plus rename operations, npm package/clean-consumer tests.

## Global Constraints

- Work only in this repository checkout on `feature/markdown-cognition-adapter`.
- Do not create a `codex/` branch.
- Follow the approved design in `docs/superpowers/specs/2026-07-30-markdown-cognition-adapter-design.md`.
- Keep the package runtime-dependency-free; Node built-ins are allowed.
- Keep `"private": true`; do not publish the package.
- Do not change the package root export, SourceRecord `0.1.0`, Portable Cognition `0.1.0`, Host Integration `0.1.0`, the generic CLI, the team-memory connector/CLI, or SQLite store behavior.
- Do not modify `team-memory-agent`, MemberKit, `teammem-bundle/v1`, a live ledger, a live cognition database, a live team vault, or a personal vault.
- Never discover a vault, repository, store, home directory, `.git`, or `.obsidian` location from ambient configuration.
- The only filesystem target is an absolute, explicitly supplied, separately initialized managed directory.
- Filesystem containment assumes that untrusted same-privilege processes do not
  concurrently mutate the target or its ancestors. Static links, hard links,
  unexpected entry types, and persistent or detectable substitutions at
  marker, manifest, manifest-owned, or desired paths must fail closed.
  Verification inspects only marker, manifest, and manifest-owned files;
  unrelated unmanifested entries remain operator-owned and untouched. Use a
  dedicated target. Final-window swap-back mutation is explicitly excluded
  because portable Node.js 24 has no descriptor-relative child operations.
- The first profile is read-only. Parsing generated Markdown does not authorize or persist human edits.
- Use descriptor-safe snapshots for untrusted API input and fixed sanitized public errors.
- Commit once per completed task boundary with Conventional Commit messages and no `Co-Authored-By`.
- Run tests locally before each commit and the complete supported-runtime matrix before opening or merging a pull request.

## File Structure

Create focused modules rather than one filesystem monolith:

```text
src/
├── markdown-cognition.ts             # public adapter entrypoint and re-exports
├── markdown-cognition-profile.ts     # pure paths, rendering, parsing, index
├── markdown-cognition-target.ts      # marker, manifest, init, verify
├── markdown-cognition-projection.ts  # preflight, write-if-changed, pruning
└── markdown-cognition-cli.ts         # closed executable

tests/
├── fixtures/markdown-cognition/0.1.0/
│   ├── records.jsonl
│   └── expected/                     # checked deterministic Markdown fixtures
├── markdown-cognition-profile.test.ts
├── markdown-cognition-target.test.ts
├── markdown-cognition-projection.test.ts
├── markdown-cognition-cli.test.ts
└── markdown-cognition-team-vault.test.ts

examples/
└── markdown-cognition.ts

docs/
└── markdown-cognition-adapter-guide.md

rfcs/
└── 0007-markdown-cognition-adapter.md

spec/compatibility/0.6.0/
├── baseline.json
└── change-cases.jsonl
```

`src/markdown-cognition.ts` is the only module referenced by the public package
subpath. The profile, target, and projection files remain implementation
modules reachable only through that entrypoint. Do not add Markdown exports to
`src/index.ts`.

---

### Task 1: Deterministic Markdown Profile Codec

**Files:**
- Create: `src/markdown-cognition-profile.ts`
- Create: `src/markdown-cognition.ts`
- Create: `tests/markdown-cognition-profile.test.ts`
- Create: `tests/fixtures/markdown-cognition/0.1.0/records.jsonl`
- Create: `tests/fixtures/markdown-cognition/0.1.0/expected/`
- Modify: `package.json` only to add the new source/test files to the existing `check` command; do not bump the version yet.

**Interfaces:**
- Consumes:
  - `PortableCognitionRecord`, `createPortableCognitionRecord`, `deserializePortableCognitionRecord`, and `serializePortableCognitionRecord` from `src/portable-cognition.ts`.
  - `canonicalizeJson` from `src/source-records.ts`.
- Produces:

```ts
export const MARKDOWN_COGNITION_PROFILE_VERSION =
  "portable-cognition-markdown/0.1.0";

export const MARKDOWN_COGNITION_MAX_INPUT_BYTES = 1_048_576;
export const MARKDOWN_COGNITION_MAX_NOTE_BYTES = 1_048_576;

export type MarkdownCognitionRecord =
  | PortableCognitionRecord<"cognitive-object">
  | PortableCognitionRecord<"cognition-event">;

export interface MarkdownCognitionRenderContext {
  readonly records: readonly MarkdownCognitionRecord[];
}

export type MarkdownCognitionErrorCode =
  | "invalid_markdown_record"
  | "invalid_projection_input"
  | "projection_limit_exceeded"
  | "invalid_target"
  | "target_not_initialized"
  | "incompatible_target"
  | "unsafe_target_entry"
  | "managed_file_conflict"
  | "projection_io_failed";

export class MarkdownCognitionError extends Error {
  readonly code: MarkdownCognitionErrorCode;
  readonly relativePath?: string;
}

export function markdownCognitionRelativePath(
  record: MarkdownCognitionRecord,
): string;

export function renderMarkdownCognitionRecord(
  record: MarkdownCognitionRecord,
  context?: MarkdownCognitionRenderContext,
): string;

export function parseMarkdownCognitionRecord(
  markdown: string,
): MarkdownCognitionRecord;

export function renderMarkdownCognitionIndex(
  records: readonly MarkdownCognitionRecord[],
): string;
```

- `src/markdown-cognition.ts` re-exports exactly these Task 1 symbols. Later tasks add target and projection symbols to the same entrypoint.

- [ ] **Step 1: Add failing profile-contract tests**

Create `tests/markdown-cognition-profile.test.ts` with fixture loading and these
exact first tests:

```ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MARKDOWN_COGNITION_PROFILE_VERSION,
  MarkdownCognitionError,
  markdownCognitionRelativePath,
  parseMarkdownCognitionRecord,
  renderMarkdownCognitionIndex,
  renderMarkdownCognitionRecord,
} from "../src/markdown-cognition.ts";
import type {
  MarkdownCognitionRecord,
} from "../src/markdown-cognition.ts";

const fixtureUrl = new URL(
  "./fixtures/markdown-cognition/0.1.0/records.jsonl",
  import.meta.url,
);

function fixtureRecords(): MarkdownCognitionRecord[] {
  return readFileSync(fixtureUrl, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as MarkdownCognitionRecord);
}

test("publishes the exact Markdown cognition profile", () => {
  assert.equal(
    MARKDOWN_COGNITION_PROFILE_VERSION,
    "portable-cognition-markdown/0.1.0",
  );
});

test("renders every supported fixture deterministically and round-trips it", () => {
  const records = fixtureRecords();
  for (const record of records) {
    const first = renderMarkdownCognitionRecord(record, { records });
    const second = renderMarkdownCognitionRecord(
      structuredClone(record),
      { records: [...records].reverse() },
    );
    assert.equal(second, first);
    assert.deepEqual(parseMarkdownCognitionRecord(first), record);
    assert.equal(first.endsWith("\n"), true);
    assert.equal(first.endsWith("\n\n"), false);
  }
});

test("uses stable digest paths instead of caller-controlled IDs", () => {
  for (const record of fixtureRecords()) {
    const path = markdownCognitionRelativePath(record);
    assert.doesNotMatch(path, /\.\.|\\|:/);
    assert.equal(path.startsWith("/"), false);
  }
});

test("renders an input-order-independent index", () => {
  const records = fixtureRecords();
  assert.equal(
    renderMarkdownCognitionIndex(records),
    renderMarkdownCognitionIndex([...records].reverse()),
  );
});
```

Populate `records.jsonl` from the existing Portable Cognition cognitive-loop
fixtures with:

- one revision of each object type;
- a second version of one Hypothesis; and
- at least one cognition event.

Every line must be one complete valid Portable Cognition envelope.

- [ ] **Step 2: Run the profile test and confirm the missing module failure**

Run:

```bash
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-profile.test.ts
```

Expected: FAIL because `src/markdown-cognition.ts` does not exist.

- [ ] **Step 3: Implement closed public types and record snapshots**

Create `src/markdown-cognition.ts` as a pure re-export:

```ts
export {
  MARKDOWN_COGNITION_MAX_INPUT_BYTES,
  MARKDOWN_COGNITION_MAX_NOTE_BYTES,
  MARKDOWN_COGNITION_PROFILE_VERSION,
  MarkdownCognitionError,
  markdownCognitionRelativePath,
  parseMarkdownCognitionRecord,
  renderMarkdownCognitionIndex,
  renderMarkdownCognitionRecord,
} from "./markdown-cognition-profile.ts";

export type {
  MarkdownCognitionErrorCode,
  MarkdownCognitionRecord,
  MarkdownCognitionRenderContext,
} from "./markdown-cognition-profile.ts";
```

In `src/markdown-cognition-profile.ts`:

1. define the exact Task 1 exports;
2. accept only `cognitive-object` and `cognition-event`;
3. snapshot through own enumerable data-property descriptors before validation;
4. call `createPortableCognitionRecord` to detach and freeze accepted records;
5. reject SourceRecord-shaped and other Portable Cognition record families with
   `invalid_projection_input`; and
6. use fixed public messages without arbitrary exception text.

Use this validation boundary:

```ts
function snapshotMarkdownRecord(
  value: MarkdownCognitionRecord,
): MarkdownCognitionRecord {
  const accepted = createPortableCognitionRecord(value);
  if (
    accepted.recordType !== "cognitive-object" &&
    accepted.recordType !== "cognition-event"
  ) {
    throw new MarkdownCognitionError(
      "invalid_projection_input",
      "Markdown cognition projection input is invalid.",
    );
  }
  return accepted;
}
```

Do not use `JSON.stringify` on unsnapshotted input.

- [ ] **Step 4: Implement stable paths, escaping, rendering, and parsing**

Use:

```ts
function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function objectRevisionPath(
  objectType: CognitiveObjectType,
  objectId: string,
  version: number,
): string {
  const directory = OBJECT_TYPE_DIRECTORIES[objectType];
  return `Objects/${directory}/${sha256(objectId)}/v${
    String(version).padStart(8, "0")
  }.md`;
}

function eventPath(objectId: string, eventId: string): string {
  return `Events/${sha256(objectId)}/${sha256(eventId)}.md`;
}
```

Define a closed `OBJECT_TYPE_DIRECTORIES` map:

```ts
{
  identity: "Identities",
  goal: "Goals",
  hypothesis: "Hypotheses",
  experiment: "Experiments",
  evidence: "Evidence",
  decision: "Decisions",
  principle: "Principles",
}
```

Render exact ordered frontmatter, human sections, and one final
```` ```json collective-cognition ```` block. Encode frontmatter strings with
JSON string escaping. Escape Markdown headings, links, HTML, fences, and
Obsidian embeds from caller strings.

The parser must:

- reject input above `MARKDOWN_COGNITION_MAX_INPUT_BYTES`;
- accept only LF UTF-8 profile text with one trailing LF;
- parse the fixed frontmatter grammar without a YAML dependency;
- require exactly one machine block;
- require canonical serialized Portable Cognition JSON;
- validate frontmatter mirrors and SHA-256;
- return a detached deeply frozen record; and
- map every malformed shape to `invalid_markdown_record`.

Use canonical equality:

```ts
const record = deserializePortableCognitionRecord(machineJson);
const canonical = serializePortableCognitionRecord(record);
if (canonical !== machineJson) {
  invalidMarkdownRecord();
}
```

`renderMarkdownCognitionIndex` must choose the highest supplied version per
object ID, resolve relationships only to projected objects, and sort by object
type, normalized title, object ID, then version. It must not include current
time, hostnames, absolute paths, or Git state.

- [ ] **Step 5: Add exact adversarial and fixture assertions**

Extend `tests/markdown-cognition-profile.test.ts` with individually named tests
covering:

- every object family and cognition event;
- title/state changes preserving object directory identity;
- relationship links selecting the highest projected version;
- missing relationship targets remaining escaped IDs;
- reordered object keys and input arrays;
- duplicate canonical records;
- duplicate identity with changed content;
- unsupported Portable Cognition families;
- SourceRecord-shaped runtime input;
- accessor-bearing fields without invocation;
- stateful and reflection-hostile proxies;
- Markdown headings, fences, HTML, wiki-links, embeds, backslashes, control
  characters, Unicode, and lone surrogates;
- unknown/duplicate/reordered frontmatter keys;
- general YAML tags, aliases, merge keys, comments, and multiline values;
- multiple/missing machine blocks;
- noncanonical JSON and hash mismatch;
- over-limit input and note output; and
- detached recursively frozen parser results.

Check every fixture file under
`tests/fixtures/markdown-cognition/0.1.0/expected/` byte-for-byte:

```ts
const expectedUrl = new URL(
  `./fixtures/markdown-cognition/0.1.0/expected/${fixtureName}.md`,
  import.meta.url,
);
assert.equal(
  renderMarkdownCognitionRecord(record, { records }),
  readFileSync(expectedUrl, "utf8"),
);
```

Generate fixture files once from the reviewed renderer, inspect them manually,
then keep them immutable. Tests must read them; tests must not regenerate them.

- [ ] **Step 6: Run focused checks**

Run:

```bash
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-profile.test.ts
npx tsc --noEmit
npm run check
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit the profile codec**

```bash
git add \
  package.json \
  src/markdown-cognition.ts \
  src/markdown-cognition-profile.ts \
  tests/markdown-cognition-profile.test.ts \
  tests/fixtures/markdown-cognition/0.1.0
git commit -m "feat: add markdown cognition profile"
```

---

### Task 2: Explicit Managed Target Initialization and Verification

**Files:**
- Create: `src/markdown-cognition-target.ts`
- Create: `tests/markdown-cognition-target.test.ts`
- Modify: `src/markdown-cognition.ts`
- Modify: `package.json` `check` command.

**Interfaces:**
- Consumes:
  - Task 1 `MarkdownCognitionError` and error-code union.
  - `canonicalizeJson` for strict marker and manifest output.
- Produces:

```ts
export const MARKDOWN_COGNITION_TARGET_FORMAT =
  "collective-cognition-markdown-target/1";

export const MARKDOWN_COGNITION_MARKER_FILE =
  ".collective-cognition.json";

export const MARKDOWN_COGNITION_MANIFEST_FILE =
  ".collective-cognition-manifest.json";

export interface MarkdownCognitionTargetOptions {
  readonly targetDirectory: string;
}

export interface MarkdownCognitionVerificationDiagnostic {
  readonly code: MarkdownCognitionErrorCode;
  readonly message: string;
  readonly relativePath?: string;
}

export interface MarkdownCognitionVerificationReport {
  readonly status: "passed" | "failed";
  readonly diagnostics: readonly MarkdownCognitionVerificationDiagnostic[];
  readonly managedPaths: readonly string[];
}

export async function initializeMarkdownCognitionTarget(
  options: MarkdownCognitionTargetOptions,
): Promise<void>;

export async function verifyMarkdownCognitionTarget(
  options: MarkdownCognitionTargetOptions,
): Promise<MarkdownCognitionVerificationReport>;
```

- Internal target identity:

```ts
interface MarkdownTargetMarker {
  readonly format: "collective-cognition-markdown-target/1";
  readonly profileVersion: "portable-cognition-markdown/0.1.0";
  readonly targetId: string;
  readonly initializedByPackageVersion: string;
}

interface MarkdownTargetManifest {
  readonly format: "collective-cognition-markdown-manifest/1";
  readonly profileVersion: "portable-cognition-markdown/0.1.0";
  readonly targetId: string;
  readonly entries: readonly MarkdownManifestEntry[];
}

interface MarkdownManifestEntry {
  readonly relativePath: string;
  readonly digest: string;
  readonly recordType: "cognitive-object" | "cognition-event" | "index";
  readonly recordIdentity?: string;
  readonly recordHash?: string;
}
```

- [ ] **Step 1: Write failing target-safety tests**

Create `tests/markdown-cognition-target.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MARKDOWN_COGNITION_MANIFEST_FILE,
  MARKDOWN_COGNITION_MARKER_FILE,
  initializeMarkdownCognitionTarget,
  verifyMarkdownCognitionTarget,
} from "../src/markdown-cognition.ts";

test("initializes only an explicit empty absolute directory", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "ccsdk-markdown-target-")),
  );
  const target = join(root, "Collective Cognition");
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(lstatSync(target).isDirectory(), true);
    assert.doesNotThrow(() =>
      JSON.parse(readFileSync(join(target, MARKDOWN_COGNITION_MARKER_FILE), "utf8"))
    );
    assert.doesNotThrow(() =>
      JSON.parse(readFileSync(join(target, MARKDOWN_COGNITION_MANIFEST_FILE), "utf8"))
    );
    assert.equal(
      (await verifyMarkdownCognitionTarget({ targetDirectory: target })).status,
      "passed",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

Add separate failing tests for:

- relative path;
- filesystem root;
- missing parent;
- existing non-directory;
- existing non-empty directory;
- symbolic-link target and symbolic-link parent component;
- inherited/accessor-bearing options;
- duplicate/unknown marker or manifest fields;
- marker/manifest target-ID mismatch;
- incompatible profile or format;
- malformed canonical JSON;
- symlink marker/manifest; and
- sanitized diagnostics without absolute paths.

- [ ] **Step 2: Run and confirm missing exports**

Run:

```bash
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-target.test.ts
```

Expected: FAIL because target exports do not exist.

- [ ] **Step 3: Implement descriptor-safe target snapshots**

In `src/markdown-cognition-target.ts`, capture exactly one own enumerable data
property:

```ts
function snapshotTargetOptions(
  value: MarkdownCognitionTargetOptions,
): MarkdownCognitionTargetOptions {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== 1 ||
    keys[0] !== "targetDirectory" ||
    descriptors.targetDirectory?.enumerable !== true ||
    !("value" in descriptors.targetDirectory) ||
    typeof descriptors.targetDirectory.value !== "string"
  ) {
    invalidTarget();
  }
  return Object.freeze({
    targetDirectory: descriptors.targetDirectory.value,
  });
}
```

Use reflection in a guarded block so revoked proxies and reflection failures
become fixed `invalid_target` errors.

- [ ] **Step 4: Implement safe initialization**

Initialization must:

1. require a normalized absolute non-root path;
2. inspect every existing path component with `lstat`, never `stat`;
3. reject symbolic links;
4. require the existing target to be exactly empty;
5. create a missing target only below an existing regular directory;
6. generate `randomBytes(16).toString("hex")`;
7. write strict canonical marker and empty manifest through exclusive temporary
   files;
8. rename them into place; and
9. remove only temporary files created by this invocation on failure.

Use target, ancestor, leaf, and descriptor identity checks around path-based
operations. These checks cover static and persistent/detectable substitutions;
they do not claim containment against concurrent same-privilege swap-back
mutation. Initialization and verification tests must state that operational
boundary explicitly.

Use:

```ts
const marker: MarkdownTargetMarker = {
  format: MARKDOWN_COGNITION_TARGET_FORMAT,
  profileVersion: MARKDOWN_COGNITION_PROFILE_VERSION,
  targetId: randomBytes(16).toString("hex"),
  initializedByPackageVersion: packageVersion(),
};
```

Do not write a timestamp, absolute path, repository name, or operator identity.

- [ ] **Step 5: Implement strict verification**

Verification must:

- reopen marker and manifest without following symlinks;
- parse canonical JSON with closed exact descriptors;
- require target ID and profile agreement;
- validate every manifest entry path as target-relative and normalized;
- reject duplicate manifest paths and identities;
- inspect only marker, manifest, and manifest-owned files;
- enforce the remaining aggregate raw-byte budget from `fstat` before each
  managed-file read and stop at the first limit violation;
- report fixed diagnostics rather than throw for target-content mismatches;
- throw only for invalid API options; and
- deep-freeze the report and nested arrays/diagnostics.

Implement one private recursive JSON-value freezer in the target module; do
not depend on an internal helper from another SDK boundary.

Use exact status derivation:

```ts
return deepFreeze({
  status: diagnostics.length === 0 ? "passed" : "failed",
  diagnostics,
  managedPaths: [...managedPaths].sort(),
});
```

Update `src/markdown-cognition.ts` to re-export every Task 2 constant,
interface, initializer, and verifier from `src/markdown-cognition-target.ts`.

- [ ] **Step 6: Run focused target checks**

Run:

```bash
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-target.test.ts
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-profile.test.ts
npx tsc --noEmit
npm run check
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit managed target support**

```bash
git add \
  package.json \
  src/markdown-cognition.ts \
  src/markdown-cognition-target.ts \
  tests/markdown-cognition-target.test.ts
git commit -m "feat: add markdown cognition target"
```

---

### Task 3: Projection, Conflict Detection, and Team-Vault Acceptance

**Files:**
- Create: `src/markdown-cognition-projection.ts`
- Create: `tests/markdown-cognition-projection.test.ts`
- Create: `tests/markdown-cognition-team-vault.test.ts`
- Modify: `src/markdown-cognition.ts`
- Modify: `src/markdown-cognition-target.ts` to expose internal validated marker/manifest helpers only to the projection module.
- Modify: `package.json` `check` command.

**Interfaces:**
- Consumes:
  - Task 1 rendering, index, record paths, record error boundary.
  - Task 2 strict target marker and manifest validation.
- Produces:

```ts
export const MARKDOWN_COGNITION_MAX_RECORDS = 10_000;
export const MARKDOWN_COGNITION_MAX_TOTAL_BYTES = 128 * 1024 * 1024;
export const MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES = 10_001;
export const MARKDOWN_COGNITION_MAX_PATH_SEGMENTS = 4;
export const MARKDOWN_COGNITION_MAX_RELATIVE_PATH_BYTES = 512;

export interface MarkdownCognitionProjectionOptions
  extends MarkdownCognitionTargetOptions {
  readonly records: readonly MarkdownCognitionRecord[];
  readonly pruneManaged?: boolean;
}

export interface MarkdownCognitionProjectionReport {
  readonly created: readonly string[];
  readonly updated: readonly string[];
  readonly unchanged: readonly string[];
  readonly pruned: readonly string[];
}

export async function projectMarkdownCognition(
  options: MarkdownCognitionProjectionOptions,
): Promise<MarkdownCognitionProjectionReport>;
```

- [ ] **Step 1: Write failing deterministic-projection tests**

Create `tests/markdown-cognition-projection.test.ts` with a temporary initialized
target:

```ts
test("projects records once and performs no writes on identical replay", async () => {
  const fixture = await temporaryInitializedTarget();
  try {
    const records = fixtureRecords();
    const first = await projectMarkdownCognition({
      targetDirectory: fixture.target,
      records,
    });
    assert.ok(first.created.length > 0);

    const before = managedFileStats(fixture.target);
    const second = await projectMarkdownCognition({
      targetDirectory: fixture.target,
      records: [...records].reverse(),
    });
    const after = managedFileStats(fixture.target);

    assert.deepEqual(second.created, []);
    assert.deepEqual(second.updated, []);
    assert.deepEqual(second.pruned, []);
    assert.deepEqual(after, before);
  } finally {
    fixture.remove();
  }
});
```

Add exact tests for:

- deterministic files, index, and manifest independent of record order;
- exact duplicate records collapsing;
- changed content under one immutable identity failing before writes;
- adding a successor revision creating one note and updating index/manifest;
- existing unmanifested desired bytes being adopted;
- mismatching unmanifested path conflict;
- manual changes to note/index/manifest-owned file conflict without overwrite;
- unsafe directories, FIFOs where supported, and symlinks;
- hard-linked managed files being replaced without mutating the peer link;
- no writes before complete preflight;
- partial write recovery when manifest replacement fails;
- `pruneManaged: false` preserving stale files;
- `pruneManaged: true` deleting only unchanged stale manifest-owned files;
- changed stale files conflicting rather than deleting;
- untracked files are never selected for reads, changes, or deletion under the
  documented stable-target filesystem threat model;
- limits for records, individual notes, total bytes, and manifest entries;
- limits for target-relative UTF-8 path bytes and segment count;
- report path ordering and deep immutability; and
- public errors containing relative paths but no absolute target.

- [ ] **Step 2: Run and confirm missing projection export**

Run:

```bash
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-projection.test.ts
```

Expected: FAIL because `projectMarkdownCognition` does not exist.

- [ ] **Step 3: Implement projection option snapshots and preflight**

Snapshot exact own fields without invoking accessors:

```ts
interface ProjectionOptionsSnapshot {
  readonly targetDirectory: string;
  readonly records: readonly MarkdownCognitionRecord[];
  readonly pruneManaged: boolean;
}
```

Reject unknown fields, inherited fields, sparse/accessor arrays, mutable
connector-owned records, unsupported record families, duplicate identity
collisions, and limits before filesystem writes.

Define immutable identity:

```ts
function projectionIdentity(record: MarkdownCognitionRecord): string {
  return record.recordType === "cognitive-object"
    ? canonicalizeJson([
        "cognitive-object",
        record.payload.id,
        record.payload.version,
      ])
    : canonicalizeJson(["cognition-event", record.payload.id]);
}
```

Exact duplicate identities are accepted only when canonical record bytes are
equal.

- [ ] **Step 4: Build the complete desired snapshot in memory**

Create internal structures:

```ts
interface DesiredFile {
  readonly relativePath: string;
  readonly bytes: Buffer;
  readonly digest: string;
  readonly recordType: "cognitive-object" | "cognition-event" | "index";
  readonly recordIdentity?: string;
  readonly recordHash?: string;
}

interface ProjectionPlan {
  readonly create: readonly DesiredFile[];
  readonly update: readonly DesiredFile[];
  readonly unchanged: readonly DesiredFile[];
  readonly prune: readonly MarkdownManifestEntry[];
  readonly manifest: MarkdownTargetManifest;
}
```

Generate all record notes plus `Index.md`, sort by relative path, enforce total
limits, and build the desired canonical manifest. The manifest itself is
written last and is not listed as one of its own entries.

- [ ] **Step 5: Implement safe inspection and apply**

For every affected path:

- join only a previously validated normalized relative path;
- reject any symlink path component;
- use `lstat` and require regular files;
- read current bytes only for marker, manifest, and affected managed paths;
- compare current complete-file SHA-256 against previous manifest;
- abort the entire plan before writes on any conflict; and
- use same-directory reserved temporary files plus rename.

Reuse the Task 2 identity-checking safety layer. Do not describe path-based
operations as a descriptor-relative containment boundary. Static links,
unexpected entry types, and persistent/detectable substitutions at managed or
desired paths fail closed. Unrelated unmanifested entries are not recursively
inspected, adopted, or pruned. Concurrent same-privilege swap-back mutation is
excluded and requires a future native or platform-specific backend.

Apply in deterministic path order. Write the manifest last.
If the complete existing manifest bytes already equal the desired canonical
manifest bytes, do not replace it or change its modification time.

If a write fails after mutation begins, throw
`projection_io_failed` without claiming rollback. An identical retry must
adopt exact desired bytes and converge.

Update `src/markdown-cognition.ts` to re-export every Task 3 limit,
projection option/report type, and `projectMarkdownCognition`.

- [ ] **Step 6: Add temporary team-vault acceptance**

Create `tests/markdown-cognition-team-vault.test.ts`:

```ts
test("projects only into the initialized team-vault subtree", async () => {
  const vault = createTemporaryTeamVault({
    "People/Ada.md": "# Ada\n",
    "Projects/Atlas.md": "# Atlas\n",
    "Daily/2026-07-30.md": "# Daily\n",
    ".obsidian/app.json": "{}\n",
    ".git/HEAD": "ref: refs/heads/master\n",
  });
  const before = hashTreeExcluding(vault.root, ["Collective Cognition"]);
  try {
    await initializeMarkdownCognitionTarget({
      targetDirectory: vault.cognitionTarget,
    });
    await projectMarkdownCognition({
      targetDirectory: vault.cognitionTarget,
      records: completeCognitiveLoopRecords(),
    });
    const verification = await verifyMarkdownCognitionTarget({
      targetDirectory: vault.cognitionTarget,
    });
    assert.equal(verification.status, "passed");
    assert.deepEqual(
      hashTreeExcluding(vault.root, ["Collective Cognition"]),
      before,
    );
  } finally {
    vault.remove();
  }
});
```

`createTemporaryTeamVault` must call `realpathSync` on the `mkdtempSync`
result before deriving `vault.root` and `vault.cognitionTarget`. This avoids
platform temporary-directory aliases while still allowing dedicated symlink
rejection tests to construct explicit hostile paths.

Also assert:

- Goal → Hypothesis → Evidence → Decision links resolve;
- every generated record note parses back canonically;
- second projection changes no managed modification time;
- one successor revision yields a bounded expected Git-like byte diff;
- a manual note edit fails without overwrite; and
- all temporary data is removed.

Do not use a real `.git` repository implementation; fixed fixture files are
enough to prove path isolation without running Git commands.

- [ ] **Step 7: Run focused projection checks**

Run:

```bash
node --disable-warning=ExperimentalWarning \
  --test \
  tests/markdown-cognition-profile.test.ts \
  tests/markdown-cognition-target.test.ts \
  tests/markdown-cognition-projection.test.ts \
  tests/markdown-cognition-team-vault.test.ts
npx tsc --noEmit
npm run check
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 8: Commit projection behavior**

```bash
git add \
  package.json \
  src/markdown-cognition.ts \
  src/markdown-cognition-target.ts \
  src/markdown-cognition-projection.ts \
  tests/markdown-cognition-projection.test.ts \
  tests/markdown-cognition-team-vault.test.ts
git commit -m "feat: project cognition to managed markdown"
```

---

### Task 4: Closed Markdown Projection CLI

**Files:**
- Create: `src/markdown-cognition-cli.ts`
- Create: `tests/markdown-cognition-cli.test.ts`
- Modify: `package.json` `check` command only; defer `bin`, version, and build-mode changes to Task 6.

**Interfaces:**
- Consumes:
  - `initializeMarkdownCognitionTarget`
  - `projectMarkdownCognition`
  - `verifyMarkdownCognitionTarget`
  - `MarkdownCognitionError`
- Produces executable behavior:

```text
collective-cognition-markdown init \
  --target /absolute/path/to/Collective-Cognition
collective-cognition-markdown project \
  --input /absolute/path/to/portable-cognition.jsonl \
  --target /absolute/path/to/Collective-Cognition
collective-cognition-markdown project \
  --input - \
  --target /absolute/path/to/Collective-Cognition \
  --prune-managed
collective-cognition-markdown verify \
  --target /absolute/path/to/Collective-Cognition
collective-cognition-markdown --help
collective-cognition-markdown --version
```

- [ ] **Step 1: Write failing closed-parser and workflow tests**

Create `tests/markdown-cognition-cli.test.ts` using `spawnSync` with the current
Node executable:

```ts
function runCli(args: readonly string[], input?: string) {
  return spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      fileURLToPath(new URL("../src/markdown-cognition-cli.ts", import.meta.url)),
      ...args,
    ],
    { encoding: "utf8", input },
  );
}

test("initializes, projects, and verifies one explicit target", () => {
  const fixture = temporaryCliFixture();
  try {
    const initialized = runCli(["init", "--target", fixture.target]);
    assert.equal(initialized.status, 0, initialized.stderr);

    const projected = runCli([
      "project",
      "--input",
      fixture.input,
      "--target",
      fixture.target,
    ]);
    assert.equal(projected.status, 0, projected.stderr);
    assert.deepEqual(Object.keys(JSON.parse(projected.stdout)).sort(), [
      "created",
      "pruned",
      "unchanged",
      "updated",
    ]);

    const verified = runCli(["verify", "--target", fixture.target]);
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).status, "passed");
  } finally {
    fixture.remove();
  }
});
```

Add parser-table tests for every combination of:

- unknown command;
- unknown, duplicate, missing-value, and extra flags;
- `--prune-managed` on non-project commands;
- missing target or input;
- relative target;
- `--help` and `--version` mixed with invalid flags;
- stdin selected only by exact `--input -`;
- bounded input bytes and record count;
- malformed JSONL;
- unsupported Portable Cognition families;
- target conflicts;
- closed stdout and stderr; and
- distinctive secrets in input, paths, and thrown errors.

- [ ] **Step 2: Run and confirm missing CLI**

Run:

```bash
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-cli.test.ts
```

Expected: FAIL because `src/markdown-cognition-cli.ts` does not exist.

- [ ] **Step 3: Implement the exact parser**

Follow the existing `src/team-memory-cli.ts` style:

- shebang;
- closed `Set` of value flags;
- duplicate rejection;
- help/version syntax validation without target access;
- one command discriminated union; and
- no inline generic CLI reuse that would weaken the closed interface.

Use:

```ts
type ParsedCommand =
  | { readonly mode: "help" }
  | { readonly mode: "version" }
  | { readonly mode: "init"; readonly targetDirectory: string }
  | {
      readonly mode: "project";
      readonly input: string;
      readonly targetDirectory: string;
      readonly pruneManaged: boolean;
    }
  | { readonly mode: "verify"; readonly targetDirectory: string };
```

Do not access a target or input for help/version.

- [ ] **Step 4: Implement bounded JSONL and output handling**

Read files and stdin incrementally with the exact exported adapter limits.
Reject an oversized line before `JSON.parse`. Parse each line as unknown and
let the projection boundary validate the records.

Write one canonical JSON object plus LF on successful `init`, `project`, or
`verify`.

Map failures to:

```ts
interface CliDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly stage: "arguments" | "input" | "target" | "projection" | "output";
  readonly relativePath?: string;
}
```

Public diagnostics must never contain absolute paths, arbitrary exceptions,
record content, or stack traces.

Use the proven asynchronous stream writer from `src/team-memory-cli.ts` so
closed output produces one fixed `output_failed` diagnostic when possible.

- [ ] **Step 5: Run focused CLI checks**

Run:

```bash
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-cli.test.ts
node --disable-warning=ExperimentalWarning \
  --test \
  tests/markdown-cognition-profile.test.ts \
  tests/markdown-cognition-target.test.ts \
  tests/markdown-cognition-projection.test.ts \
  tests/markdown-cognition-team-vault.test.ts
npx tsc --noEmit
npm run check
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit the CLI**

```bash
git add \
  package.json \
  src/markdown-cognition-cli.ts \
  tests/markdown-cognition-cli.test.ts
git commit -m "feat: add markdown cognition CLI"
```

---

### Task 5: Public Documentation, RFC, and Runnable Example

**Files:**
- Create: `docs/markdown-cognition-adapter-guide.md`
- Create: `rfcs/0007-markdown-cognition-adapter.md`
- Create: `examples/markdown-cognition.ts`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `rfcs/README.md`
- Modify: `spec/README.md`
- Modify: `spec/compatibility.md`
- Modify: `package.json` scripts `example:markdown` and `check`.
- Create: `tests/markdown-cognition-example.test.ts`

**Interfaces:**
- Consumes the Task 1 through Task 4 public API.
- Produces one runnable temporary-directory example and complete public
  operator guidance.

- [ ] **Step 1: Write the failing public example test**

Create `tests/markdown-cognition-example.test.ts`:

```ts
test("markdown cognition example runs without a pre-existing target", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      fileURLToPath(new URL("../examples/markdown-cognition.ts", import.meta.url)),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.verification, "passed");
  assert.equal(output.secondRunUpdated, 0);
  assert.equal(output.roundTripEqual, true);
});
```

Run:

```bash
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-example.test.ts
```

Expected: FAIL because the example does not exist.

- [ ] **Step 2: Implement the self-cleaning example**

`examples/markdown-cognition.ts` must:

1. create a temporary root under the operating-system temporary directory;
2. create one valid Goal and one related Hypothesis Portable Cognition record
   using public package-root APIs;
3. initialize `Collective Cognition` below the root returned by `mkdtemp`;
4. project both records;
5. parse one generated note back;
6. project the same records again;
7. verify the target;
8. print one JSON summary; and
9. remove the temporary root in `finally`.

It must not reference a real repository, vault, ledger, home directory, or
operator identity.

- [ ] **Step 3: Write the RFC and operator guide**

`rfcs/0007-markdown-cognition-adapter.md` must record:

- projection versus persistence;
- explicit managed target;
- deterministic profile and paths;
- marker/manifest ownership;
- read-only conflict behavior;
- optional safe pruning;
- Git/Obsidian non-dependencies;
- package status; and
- explicit deferrals.

`docs/markdown-cognition-adapter-guide.md` must include:

- who uses the API versus CLI;
- initializing `team-vault/Collective Cognition` as an example only;
- required Portable Cognition input;
- CLI commands;
- generated directory layout;
- manual-edit conflict recovery;
- Git automation ownership;
- privacy and raw-content boundary;
- verification and pruning guidance; and
- no live-vault automated-test claim.

Use fictional paths and identities only.

- [ ] **Step 4: Update every status document**

Update:

- `README.md`: architecture, current status, API/CLI example, explicit limits,
  and private/unpublished status.
- `docs/ROADMAP.md`: mark codec, adapter, round-trip fixtures,
  no-rewrite behavior, and implicit-vault-discovery tests complete only after
  their tests pass.
- `rfcs/README.md`: index RFC 0007 with its current status.
- `spec/README.md`: list the implemented Supported Experimental Markdown
  adapter without calling it Normative Stable.
- `spec/compatibility.md`: explain the additive `0.6.0` package process.

Do not claim final-review verification until Task 7 completes.

- [ ] **Step 5: Run example and documentation-sensitive checks**

Add:

```json
"example:markdown": "node --disable-warning=ExperimentalWarning examples/markdown-cognition.ts"
```

to `package.json`.

Run:

```bash
npm run example:markdown
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-example.test.ts
npm run test:package
npx tsc --noEmit
npm run check
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit docs and example**

```bash
git add \
  README.md \
  docs/ROADMAP.md \
  docs/markdown-cognition-adapter-guide.md \
  examples/markdown-cognition.ts \
  package.json \
  rfcs/0007-markdown-cognition-adapter.md \
  rfcs/README.md \
  spec/README.md \
  spec/compatibility.md \
  tests/markdown-cognition-example.test.ts
git commit -m "docs: explain markdown cognition projection"
```

---

### Task 6: Package 0.6.0 and Compatibility Baseline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.build.json` only if the emitted module inventory requires an include/exclude correction.
- Modify: `tests/package.test.mjs`
- Modify: `tests/compatibility.test.mjs`
- Create: `spec/compatibility/0.6.0/baseline.json`
- Create: `spec/compatibility/0.6.0/change-cases.jsonl`

**Interfaces:**
- Adds package subpath:

```json
"./adapters/markdown/0.1.0": {
  "types": "./dist/markdown-cognition.d.ts",
  "import": "./dist/markdown-cognition.js"
}
```

- Adds executable:

```json
"collective-cognition-markdown": "./dist/markdown-cognition-cli.js"
```

- Keeps root exports and all historical baselines byte-identical.

- [ ] **Step 1: Write failing package 0.6 assertions**

Update `tests/package.test.mjs` before changing package metadata:

- current version must be `0.6.0`;
- root runtime/type exports equal `0.5.0`;
- package exports include only the approved Markdown subpath and
  compatibility `0.6.0` addition;
- bin adds only `collective-cognition-markdown`;
- emitted additions are exactly:

```text
dist/markdown-cognition.d.ts
dist/markdown-cognition.js
dist/markdown-cognition-cli.d.ts
dist/markdown-cognition-cli.js
dist/markdown-cognition-profile.d.ts
dist/markdown-cognition-profile.js
dist/markdown-cognition-projection.d.ts
dist/markdown-cognition-projection.js
dist/markdown-cognition-target.d.ts
dist/markdown-cognition-target.js
```

- tarball adds only approved Markdown runtime, RFC, guide, and `0.6.0`
  compatibility files;
- packed Markdown CLI has executable mode;
- clean consumer imports every public runtime/type export and runs the CLI;
- no production dependency fields exist; and
- `"private": true` remains.

Run:

```bash
npm run build
node --test tests/package.test.mjs
```

Expected: FAIL on package `0.5.0` metadata and missing package surfaces.

- [ ] **Step 2: Write failing compatibility 0.6 assertions**

Update `tests/compatibility.test.mjs`:

```ts
import * as markdownCognitionApi from "../dist/markdown-cognition.js";
```

Add tests requiring:

- exact historical `0.1.0` through `0.5.0` baseline/change-case SHA-256 values;
- baseline version and package version `0.6.0`;
- additive/minor classification;
- unchanged root runtime/type exports;
- exact Markdown runtime exports;
- exact direct Markdown declaration exports;
- independent declaration closure digest;
- exact CLI registry/bin metadata;
- exact package metadata;
- exact limits and profile constants;
- one additive change case; and
- immutable historical artifact hashes.

Run:

```bash
npm run build
node --test tests/compatibility.test.mjs
```

Expected: FAIL because `0.6.0` artifacts and metadata do not exist.

- [ ] **Step 3: Update package metadata and build behavior**

Change package and lock versions to `0.6.0`.

Add:

- `./compatibility/0.6.0`;
- `./adapters/markdown/0.1.0`;
- `collective-cognition-markdown`;
- RFC 0007 and the Markdown guide to `files`;
- `0.6.0` baseline and change cases to `files`; and
- executable `chmod` for `dist/markdown-cognition-cli.js`.

Extend `check` with every new source, test, and example file.

Do not add source, test, fixture, design, database, environment, log, key, or
credential files to the tarball.

- [ ] **Step 4: Create the additive change case**

Create this exact canonical JSONL line in
`spec/compatibility/0.6.0/change-cases.jsonl`:

```json
{"id":"additive-markdown-cognition-adapter-surfaces","description":"Add optional Markdown cognition adapter 0.1.0, compatibility 0.6.0, and a dedicated Markdown projection binary while preserving root exports and existing CLI contracts.","surface":"supported-experimental","classification":"additive","packageVersionEffect":"minor","requiresRfc":false,"requiresMigrationNotes":false,"requiresDeprecation":false,"rationale":"Existing root and versioned imports remain unchanged, Markdown APIs are isolated under a new versioned subpath, the dedicated binary has a distinct name, and the package adds no production dependency fields."}
```

Do not add a speculative breaking case. Version `0.6.0` records the actual
additive package change; future incompatible changes require their own
versioned surface and change case.

- [ ] **Step 5: Build and create the literal baseline**

Start from the `0.5.0` baseline:

```bash
mkdir -p spec/compatibility/0.6.0
cp spec/compatibility/0.5.0/baseline.json \
  spec/compatibility/0.6.0/baseline.json
npm run build
```

Then update the copied baseline with:

- baseline/package version `0.6.0`;
- historical `0.5.0` path and SHA-256;
- additive/minor change classification;
- exact unchanged root exports;
- exact Markdown subpath runtime/type exports;
- exact emitted files;
- exact package files;
- exact package metadata;
- exact CLI/bin inventory;
- exact Markdown constants and error codes;
- exact direct declaration exports; and
- exact independent declaration closure digest.

Calculate literal hashes from actual bytes:

```bash
shasum -a 256 \
  spec/compatibility/0.5.0/baseline.json \
  spec/compatibility/0.5.0/change-cases.jsonl \
  spec/compatibility/0.6.0/change-cases.jsonl \
  dist/markdown-cognition.d.ts \
  dist/markdown-cognition-profile.d.ts \
  dist/markdown-cognition-target.d.ts \
  dist/markdown-cognition-projection.d.ts
```

Copy the command output exactly into the baseline and independent test
constants. Do not compute historical digests dynamically during tests.

- [ ] **Step 6: Complete clean-consumer coverage**

In the packed consumer TypeScript fixture, import:

```ts
import {
  MARKDOWN_COGNITION_MANIFEST_FILE,
  MARKDOWN_COGNITION_MARKER_FILE,
  MARKDOWN_COGNITION_MAX_INPUT_BYTES,
  MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES,
  MARKDOWN_COGNITION_MAX_NOTE_BYTES,
  MARKDOWN_COGNITION_MAX_PATH_SEGMENTS,
  MARKDOWN_COGNITION_MAX_RECORDS,
  MARKDOWN_COGNITION_MAX_RELATIVE_PATH_BYTES,
  MARKDOWN_COGNITION_MAX_TOTAL_BYTES,
  MARKDOWN_COGNITION_PROFILE_VERSION,
  MARKDOWN_COGNITION_TARGET_FORMAT,
  MarkdownCognitionError,
  initializeMarkdownCognitionTarget,
  markdownCognitionRelativePath,
  parseMarkdownCognitionRecord,
  projectMarkdownCognition,
  renderMarkdownCognitionIndex,
  renderMarkdownCognitionRecord,
  verifyMarkdownCognitionTarget,
  type MarkdownCognitionErrorCode,
  type MarkdownCognitionProjectionOptions,
  type MarkdownCognitionProjectionReport,
  type MarkdownCognitionRecord,
  type MarkdownCognitionRenderContext,
  type MarkdownCognitionTargetOptions,
  type MarkdownCognitionVerificationDiagnostic,
  type MarkdownCognitionVerificationReport,
} from "collective-cognition-sdk/adapters/markdown/0.1.0";
```

Typecheck calls to every public function and run:

```bash
node node_modules/.bin/collective-cognition-markdown --help
```

Assert help succeeds without a target.

- [ ] **Step 7: Run package and compatibility checks**

Run:

```bash
npm run build
node --test tests/compatibility.test.mjs
node --test tests/package.test.mjs
npm run pack:check
npx tsc --noEmit
npm run check
git diff --check
```

Expected:

- compatibility: all tests pass;
- package/clean consumer: all tests pass;
- no historical digest changes;
- root declarations remain identical to `0.5.0`; and
- all commands exit `0`.

- [ ] **Step 8: Commit package 0.6**

```bash
git add \
  package.json \
  package-lock.json \
  spec/compatibility/0.6.0 \
  tests/compatibility.test.mjs \
  tests/package.test.mjs \
  tsconfig.build.json
git commit -m "feat: package markdown cognition adapter"
```

If `tsconfig.build.json` is unchanged, omit it from `git add`.

---

### Task 7: Final Review, Status Reconciliation, and Delivery

**Files:**
- Modify only status/evidence wording in:
  - `README.md`
  - `docs/ROADMAP.md`
  - `docs/superpowers/specs/2026-07-30-markdown-cognition-adapter-design.md`
  - `rfcs/0007-markdown-cognition-adapter.md`
  - `spec/README.md`
- Modify implementation/tests only when final review identifies an in-scope defect.

**Interfaces:**
- Consumes the complete Tasks 1 through 6 implementation.
- Produces a verified, reviewed, merge-ready package `0.6.0` slice.

- [ ] **Step 1: Run the complete supported-runtime matrix**

Verify Node first:

```bash
node --version
```

Requirement: Node satisfies `>=24` and provides the repository's supported
SQLite behavior.

Run:

```bash
npm test
npx tsc --noEmit
npm run check
npm run example
npm run example:portable
npm run example:host
npm run example:markdown
npm run pack:check
git diff --check
```

Record exact test counts from the fresh output. Do not copy historical counts.

- [ ] **Step 2: Run focused temporary-vault acceptance twice**

Run:

```bash
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-team-vault.test.ts
node --disable-warning=ExperimentalWarning \
  --test tests/markdown-cognition-team-vault.test.ts
```

Both runs must pass using newly created temporary roots. Confirm the test
deletes them and no repository file outside expected build output changed.

- [ ] **Step 3: Audit public-repository hygiene**

Search the complete branch diff:

```bash
git diff master...HEAD --check
git diff --name-only master...HEAD
grep -R -n -E \
  '/Users/|/home/|team-memory-agent/ledger\.db|credential|BEGIN .*PRIVATE KEY' \
  README.md docs examples rfcs spec src tests package.json package-lock.json \
  || true
```

Classify every match. Remove operator-local paths, private data, copied live
artifacts, and accidental credentials. Do not remove legitimate generic words
such as “credential policy” from public documentation.

- [ ] **Step 4: Request independent code review**

Use the `superpowers:requesting-code-review` skill or a read-only reviewer.
Review against:

- the approved design;
- every acceptance criterion;
- hostile input, static links, persistent/detectable path substitutions, and
  truthful treatment of the excluded same-privilege swap-back boundary;
- no implicit vault/store discovery;
- no manual-edit overwrite;
- complete-file digest and manifest recovery;
- package root and historical-baseline immutability;
- CLI parser/output failure behavior;
- public documentation truthfulness; and
- live data/vault isolation.

Fix all Critical and Important findings within the authorized scope. Rerun the
focused failing tests after each correction and the full matrix after the final
correction.

- [ ] **Step 5: Reconcile final status documents**

Only after fresh tests and independent review are clean:

- set the design status to `Implemented and final-review verified`;
- set RFC 0007 to the matching implemented status;
- mark the Phase 4 Markdown deliverables and acceptance checks complete;
- record exact current test counts;
- state that acceptance used temporary vaults only;
- state that package `0.6.0` remains private and unpublished; and
- retain deferrals for editable Markdown, scheduling, Git automation, live
  vault mutation, production certification, and publication.

Run:

```bash
git diff --check
npm run test:package
```

- [ ] **Step 6: Commit verification closeout**

```bash
git add \
  README.md \
  docs/ROADMAP.md \
  docs/superpowers/specs/2026-07-30-markdown-cognition-adapter-design.md \
  rfcs/0007-markdown-cognition-adapter.md \
  spec/README.md
git commit -m "docs: record markdown adapter verification"
```

- [ ] **Step 7: Push and integrate**

Before pushing:

```bash
git status --short --branch
git log --oneline master..HEAD
```

Push `feature/markdown-cognition-adapter`, create a ready pull request with a
Conventional Commit title, and include:

- deterministic profile and round-trip behavior;
- explicit target and conflict protections;
- temporary team-vault acceptance;
- exact current test counts;
- package `0.6.0` compatibility evidence; and
- private/unpublished status.

Squash-merge only when the pull request is mergeable and required checks pass.
Delete the merged feature branch and verify `master` with:

```bash
git status --short --branch
git log -1 --oneline
npm test
```

Do not force-push, bypass checks, or publish the package.
