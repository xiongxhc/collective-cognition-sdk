# Markdown Cognition Adapter Design

**Status:** Proposed; design direction approved, written review pending

**Date:** 2026-07-30

## Problem

Collective Cognition SDK can collect source activity, promote selected records
into Portable Cognition, and persist cognition through a host-selected store.
The current SQLite reference store is durable and testable, but its records are
not directly useful to a team that reviews shared knowledge in an Obsidian vault
or Git repository.

The team needs cognition to be:

- readable as ordinary Markdown;
- linkable and browsable in Obsidian;
- reviewable through Git;
- attributable to its source records and human authorities;
- deterministic enough for clean diffs and repeatable generation; and
- isolated from personal notes and arbitrary vault content.

The SDK must not make one team's `team-vault` repository a universal SDK
concept. It must not discover vaults, treat arbitrary Markdown as trusted
cognition, turn Obsidian into a required runtime dependency, or make generated
files a second unsynchronized source of truth.

## Decision

Add a versioned, optional Markdown cognition adapter:

```text
collective-cognition-sdk/adapters/markdown/0.1.0
```

The adapter has two layers:

1. a pure deterministic codec between supported Portable Cognition records and
   a managed Markdown profile; and
2. an explicit-target projection writer that maintains only an initialized
   adapter-owned directory.

The first version is a read-only projection. It renders cognition for people
and tools but does not accept human Markdown edits as cognition transitions.
The authoritative records remain in the host-selected `CognitionStore`.

For the current team deployment, a host may explicitly configure:

```text
<team-vault>/Collective Cognition
```

The SDK never knows the repository name, locates it automatically, commits Git
changes, pushes a branch, opens Obsidian, or writes outside that configured
subtree.

## User Workflow

The intended team flow is:

```text
explicit source ledger
  → source connector
  → SourceRecord
  → explicit promotion
  → Portable Cognition
  → host-selected CognitionStore
  → host-selected record set
  → Markdown cognition adapter
  → explicit managed directory
  → Git and Obsidian
```

The Markdown output is not a dump of all source activity. Only cognition that a
host explicitly supplies to the adapter is projected.

In the current team architecture:

1. `team-memory-agent` remains the source-activity system.
2. The maintained team-memory connector reads its ledger without mutation.
3. A caller explicitly promotes selected records into cognition.
4. A separate cognition host persists approved cognition.
5. A future `team-cognition-agent` or another host application selects records
   and projects them into the team vault.
6. Existing Git automation may commit and distribute the changed Markdown.

Steps 4 through 6 are host responsibilities. The adapter performs no source
collection, promotion, scheduling, Git, or network operations.

## Alternatives

### Implement Markdown as a `CognitionStore`

Rejected for the first version. A writable Markdown store would need to define
concurrent edits, optimistic version checks, object-plus-event atomicity,
collision precedence, deletion, malformed partial files, and recovery from Git
merges. That is a separate persistence adapter, not a safe projection feature.

### Provide Only a String Renderer

Rejected as the complete slice. A pure renderer is useful, but it does not
protect an explicit vault target, avoid unnecessary rewrites, detect human
edits, maintain stable paths, or provide a runnable team workflow.

### Build an Obsidian Plugin

Rejected. An Obsidian plugin would couple the SDK to one UI runtime and plugin
security model. The portable boundary is Markdown files in an explicit
directory. Obsidian is one consumer of those files.

### Pure Codec Plus Managed Projection

Selected. It keeps record conversion independently testable, supplies a safe
filesystem workflow, works with Obsidian and ordinary Git clients, and leaves
future editable-store behavior as a deliberate later design.

## Scope

### Included

- Managed Markdown profile `portable-cognition-markdown/0.1.0`.
- Portable Cognition `cognitive-object` and `cognition-event` records.
- Deterministic record-to-Markdown rendering.
- Strict parsing of adapter-generated Markdown back to Portable Cognition.
- Stable cross-platform relative paths.
- Deterministic Obsidian wiki-links for projected relationships.
- A generated index grouped by cognitive-object type.
- Explicit target initialization.
- A target marker and adapter-owned manifest.
- Write-if-changed projection.
- Manual-edit and unsafe-entry conflict detection.
- Optional explicit pruning of unchanged adapter-owned stale files.
- A dedicated `collective-cognition-markdown` CLI.
- Package version `0.6.0` compatibility and clean-consumer evidence.
- Fixture-only and temporary-repository acceptance tests.

### Excluded

- Arbitrary Markdown-to-cognition interpretation.
- Human-authored cognition transitions.
- A Markdown implementation of `CognitionStore`.
- SourceRecord collection or promotion.
- Automatic cognition selection.
- LLM summarization or rewriting.
- Vault discovery, `.obsidian` modification, or Obsidian process control.
- Git add, commit, pull, merge, push, or conflict resolution.
- Background synchronization, scheduling, or filesystem watching.
- Changes to `team-memory-agent`, MemberKit, or `teammem-bundle/v1`.
- Writes to a source ledger or cognition SQLite database.
- Personal-vault integration or home-directory search.
- Attachments, images, canvases, databases, or non-Markdown Obsidian formats.
- Package publication or removal of `"private": true`.

## Public Package Boundary

The adapter is exported only through:

```text
collective-cognition-sdk/adapters/markdown/0.1.0
```

The root export remains unchanged.

The subpath conceptually exposes:

```ts
export const MARKDOWN_COGNITION_PROFILE_VERSION =
  "portable-cognition-markdown/0.1.0";

export type MarkdownCognitionRecord =
  | PortableCognitionRecord<"cognitive-object">
  | PortableCognitionRecord<"cognition-event">;

export interface MarkdownCognitionTargetOptions {
  readonly targetDirectory: string;
}

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

export interface MarkdownCognitionRenderContext {
  readonly records: readonly MarkdownCognitionRecord[];
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

export function renderMarkdownCognitionRecord(
  record: MarkdownCognitionRecord,
  context?: MarkdownCognitionRenderContext,
): string;

export function parseMarkdownCognitionRecord(
  markdown: string,
): MarkdownCognitionRecord;

export function initializeMarkdownCognitionTarget(
  options: MarkdownCognitionTargetOptions,
): Promise<void>;

export function projectMarkdownCognition(
  options: MarkdownCognitionProjectionOptions,
): Promise<MarkdownCognitionProjectionReport>;

export function verifyMarkdownCognitionTarget(
  options: MarkdownCognitionTargetOptions,
): Promise<MarkdownCognitionVerificationReport>;
```

These names and closed result shapes are the proposed public `0.1.0` surface.
Any implementation-driven change requires updating and re-approving this
design before the compatibility baseline is created.

## Supported Records

The adapter accepts only valid Portable Cognition records whose `recordType`
is:

- `cognitive-object`; or
- `cognition-event`.

Transition contexts, authorization decisions, and domain errors remain valid
Portable Cognition records but are not projected in version `0.1.0`. They are
operational inputs and outcomes rather than shared team cognition.

A SourceRecord is never accepted by this adapter. Collection and promotion
must remain explicit earlier steps.

## Managed Target

### Explicit Selection

`targetDirectory` is mandatory, non-empty, absolute, and captured from an own
enumerable data property before filesystem access.

The adapter rejects:

- relative paths;
- home-directory expansion;
- environment-derived defaults;
- URLs;
- the filesystem root;
- a path containing an existing symbolic-link component; and
- hostile or accessor-bearing option objects.

The adapter never searches parent or sibling directories for `.git`,
`.obsidian`, vault metadata, package configuration, or a known repository name.

### Initialization

Projection requires an initialized target. Initialization is a separate
explicit operation.

If the target does not exist, initialization creates it only when its parent
exists and the caller supplied the exact target path. If the target already
exists, it must be an empty directory.

Initialization writes:

```text
.collective-cognition.json
.collective-cognition-manifest.json
```

The marker records:

- format: `collective-cognition-markdown-target/1`;
- Markdown profile version;
- a cryptographically random 128-bit target identifier encoded as lowercase
  hexadecimal; and
- the SDK package version that initialized the target.

The target identifier distinguishes two managed directories. It is not a
secret, identity credential, or tenant authorization mechanism.

Projection rejects an unmarked directory, an incompatible marker, duplicate or
unknown marker fields, malformed JSON, or marker files that are symbolic links.

### Team-Vault Deployment

The recommended deployment is:

```text
team-vault/
├── People/
├── Projects/
├── Daily/
├── Weekly/
└── Collective Cognition/
    ├── .collective-cognition.json
    ├── .collective-cognition-manifest.json
    ├── Index.md
    ├── Objects/
    └── Events/
```

Only `Collective Cognition/` is initialized as the adapter target. The adapter
does not receive the vault root and cannot modify existing team-vault folders.

## Stable Paths

Paths must be valid on supported Windows, macOS, and Linux filesystems and must
not contain caller-controlled path separators.

Object revision notes use:

```text
Objects/<Type>/<object-key>/v<eight-digit-version>.md
```

Event notes use:

```text
Events/<object-key>/<event-key>.md
```

Where:

- `<Type>` is one of the fixed object-family directory names;
- `<object-key>` is the lowercase hexadecimal SHA-256 digest of the UTF-8
  object ID;
- `<event-key>` is the lowercase hexadecimal SHA-256 digest of the UTF-8 event
  ID; and
- object versions are zero-padded positive safe integers.

The path does not use a mutable title. Renaming an object or changing its state
therefore does not move earlier revisions.

The full IDs remain visible in frontmatter and the machine record. Hashes are
path-safe locators, not identity replacements or integrity claims.

## Markdown Profile

Every generated note:

- is UTF-8 without a byte-order mark;
- uses line feed separators;
- ends with exactly one line feed;
- uses deterministic section and field order;
- contains no generation timestamp;
- contains strict adapter-owned frontmatter;
- includes a human-readable body; and
- embeds the exact canonical Portable Cognition record.

### Frontmatter

The adapter emits a deliberately small frontmatter subset rather than a
general YAML serialization.

Conceptual object frontmatter:

```yaml
---
collective_cognition: "portable-cognition-markdown/0.1.0"
managed: true
record_type: "cognitive-object"
record_hash: "<sha256-of-canonical-record>"
object_id: "goal:reliable-delivery"
object_type: "goal"
object_version: 1
object_state: "active"
---
```

Event frontmatter replaces object state with the matching event identity and
target-version fields.

All string scalars use JSON string escaping. The parser accepts only the exact
known keys, order, scalar forms, and delimiters emitted by the adapter.
General YAML tags, aliases, merge keys, multiline scalars, comments, duplicate
keys, and unknown properties are rejected.

### Human-Readable Body

A cognitive-object note contains these sections in order:

1. title;
2. managed-note notice;
3. type, state, ID, and version;
4. relationships;
5. attribution;
6. provenance;
7. structured data;
8. revision metadata; and
9. machine record.

A cognition-event note contains:

1. event title;
2. managed-note notice;
3. target object and version;
4. previous and next state;
5. actor, time, reason, and confirmation references;
6. related object note; and
7. machine record.

Human-readable values are escaped so that caller data cannot create unintended
frontmatter, headings, fences, wiki-links, HTML, or Obsidian embeds.

### Machine Record

The final section contains one fenced block with the canonical serialized
Portable Cognition envelope:

````text
## Machine Record

```json collective-cognition
{"payload":{...},"recordType":"cognitive-object","schemaVersion":"0.1.0"}
```
````

The canonical record is the only normative cognition payload in the note.
Frontmatter and human-readable sections are deterministic projections.

`record_hash` is SHA-256 over the exact UTF-8 canonical record bytes. The
parser validates the record, canonical form, and hash before returning it.

## Relationships and Obsidian Links

The renderer accepts an optional immutable render context describing the
records included in the same projection.

For a relationship target present in the projection:

- the link targets the highest projected version for that object ID;
- the display text uses the target title when available; and
- the machine record continues to preserve only the normative relationship.

For a relationship target absent from the projection, the note displays the
escaped target ID without inventing a file path.

Link generation is deterministic and independent of input record order.
Duplicate object ID and version records must be canonically identical.
Conflicting duplicates fail the entire preflight.

## Generated Index

`Index.md` is a managed derived document, not a Portable Cognition record.

It contains:

- the target profile;
- counts by object type and state;
- links to the highest projected revision of each object;
- a separate audit-events link section; and
- deterministic ordering by object type, normalized title, object ID, and
  version.

The index contains no current time, machine hostname, absolute path, Git branch,
or operator identity.

## Parsing and Round Trips

`parseMarkdownCognitionRecord` accepts only the managed profile. It:

1. bounds UTF-8 input size;
2. parses the fixed frontmatter grammar without a general YAML loader;
3. locates exactly one machine-record block;
4. requires canonical serialized JSON;
5. validates the Portable Cognition record;
6. checks frontmatter mirrors against the record;
7. checks the canonical record hash; and
8. returns a detached deeply immutable record.

The parser exists for conformance, verification, migration, and recovery. It
does not authorize a Markdown edit or commit it to a `CognitionStore`.

The required round trip is:

```text
validated Portable Cognition
  → deterministic Markdown
  → parsed Portable Cognition
  → canonical equality
```

Human editing of derived prose does not change the embedded cognition. A
future editable Markdown store must define a separate profile and host
contract rather than silently repurposing this parser.

## Manifest

`.collective-cognition-manifest.json` is a strict canonical JSON document. It
records:

- target format and target identifier;
- Markdown profile version;
- each adapter-owned relative path;
- the SHA-256 digest of the complete generated file bytes;
- record type and immutable record identity where applicable; and
- the canonical record hash.

It contains no absolute target path.

The manifest allows projection to distinguish:

- unchanged generated files;
- safe updates from prior generated bytes;
- adapter-owned stale files;
- manually changed managed files; and
- untracked files that the adapter must not touch.

## Projection Algorithm

Projection follows these stages:

1. Snapshot and validate options without invoking accessors.
2. Validate all records before target mutation.
3. Canonically deduplicate exact record identities.
4. Reject changed content under the same immutable identity.
5. Compute every relative path, link, note, index, and desired digest in memory.
6. Open and validate the target marker and manifest.
7. Inspect every affected existing path without following symbolic links.
8. Build a complete deterministic projection plan.
9. Abort before writes if any managed-file conflict or unsafe entry exists.
10. Write changed files through same-directory temporary files and atomic
    rename.
11. Optionally prune only unchanged files owned by the previous manifest.
12. Write the new manifest last through atomic replacement.
13. Return a detached deeply immutable report.

There is no filesystem-wide transaction. An operating-system failure may occur
after some files are replaced but before the manifest is replaced.

Recovery is idempotent:

- a newly written unmanifested file is adopted only when its complete bytes
  equal the desired bytes;
- a mismatching unmanifested path is a conflict;
- temporary files use a reserved adapter prefix and are ignored only when their
  shape is valid for interrupted adapter work; and
- rerunning the same projection converges without rewriting correct files.

## Write-if-Changed

If the desired complete bytes equal the existing file bytes, the adapter:

- does not open the file for writing;
- does not replace its directory entry;
- reports the relative path as unchanged; and
- preserves filesystem modification time.

The same record set projected twice must produce:

- byte-identical notes, index, and manifest;
- no created, updated, or pruned files on the second run; and
- unchanged modification times for every managed Markdown file.

## Manual-Edit Conflicts

The first version is read-only.

If an existing adapter-owned file differs from the digest recorded in the
previous manifest, projection fails with `managed_file_conflict` unless the
current bytes already equal the newly desired bytes.

The adapter never silently overwrites a manually edited managed file.

Conflict diagnostics may identify a target-relative path but must not expose
the absolute vault path. The host decides whether to restore generated content,
move the human edit elsewhere, or adopt a future editable workflow.

## Pruning

Pruning defaults to `false`.

When `pruneManaged: true`, the adapter may remove a path only when:

- the previous manifest owns it;
- it is absent from the desired projection;
- its current complete bytes still match the previous manifest digest;
- it is a regular file below the target; and
- no path component is a symbolic link.

A changed stale file is a conflict and is never deleted.

The adapter never prunes untracked files, directories, `.git`, `.obsidian`, or
content outside the initialized target.

## CLI

The package installs:

```text
collective-cognition-markdown
```

The closed interface is:

```text
collective-cognition-markdown init \
  --target /absolute/path/to/Collective-Cognition

collective-cognition-markdown project \
  --input /absolute/path/to/portable-cognition.jsonl \
  --target /absolute/path/to/Collective-Cognition

collective-cognition-markdown project \
  --input /absolute/path/to/portable-cognition.jsonl \
  --target /absolute/path/to/Collective-Cognition \
  --prune-managed

collective-cognition-markdown verify \
  --target /absolute/path/to/Collective-Cognition
```

`project` accepts bounded JSONL containing only supported Portable Cognition
records. Standard input may be selected explicitly with `--input -`.

The CLI:

- validates all input before target mutation;
- emits one canonical JSON summary on success;
- emits one sanitized JSON diagnostic on failure;
- never prints an absolute target path;
- never invokes Git or Obsidian;
- never accepts SourceRecord input;
- never discovers a store or vault; and
- never performs promotion.

Unknown, duplicate, missing, conflicting, or extra arguments are closed parser
errors. Help and version do not touch an input or target.

## Limits

The API and CLI define bounded defaults for:

- input bytes;
- record count;
- Markdown bytes per note;
- total generated bytes;
- manifest entries;
- path depth; and
- target-relative path length.

Exact limits are exported through the adapter subpath and pinned in the package
compatibility baseline.

Limits are enforced before recursive parsing, hashing, rendering, or target
mutation where possible.

## Error Model

The adapter exposes stable error codes:

```text
invalid_markdown_record
invalid_projection_input
projection_limit_exceeded
invalid_target
target_not_initialized
incompatible_target
unsafe_target_entry
managed_file_conflict
projection_io_failed
```

Public errors use fixed messages and structured non-secret details. Details may
include a target-relative path, record index, record type, or immutable public
record ID. They never include:

- an absolute path;
- environment variables;
- arbitrary filesystem exception text;
- note contents;
- source raw content;
- credentials; or
- stack traces.

Library failures do not claim global rollback after filesystem writes begin.
The caller reruns the identical projection and uses verification to establish
the resulting state.

## Security and Privacy

The adapter treats records, option objects, existing target files, marker data,
manifest data, and Markdown as untrusted.

Required protections include:

- own-descriptor snapshots before validation;
- no getter, proxy ordinary-read, `toJSON`, or inherited-property execution;
- strict canonical JSON parsing;
- fixed frontmatter grammar;
- bounded input before deep processing;
- safe Markdown and wiki-link escaping;
- path derivation from fixed names and cryptographic digests;
- rejection of symbolic-link target components and managed entries;
- atomic replacement instead of in-place writes;
- no absolute paths in generated artifacts or diagnostics;
- no ambient configuration or home-directory discovery; and
- no raw source content unless it was already explicitly present in the
  supplied Portable Cognition record.

The adapter does not authenticate Git authors, Obsidian users, cognition actors,
or provenance claims. Those remain host and repository-governance concerns.

## Git and Obsidian Behavior

The generated directory is ordinary repository content.

Obsidian may open the repository root as a vault and index the generated notes.
The adapter does not require an Obsidian plugin.

Git sees only deterministic file changes. The adapter intentionally does not:

- stage files;
- create commits;
- select branches;
- pull or merge;
- push;
- resolve conflicts; or
- modify `.gitignore`.

A deployment may run Git automation after a successful projection report, but
that automation is outside the SDK and requires its own ownership and policy.

## Package and Compatibility

The implementation is an additive package `0.6.0` slice before `1.0.0`.

It adds:

- `collective-cognition-sdk/adapters/markdown/0.1.0`;
- `collective-cognition-markdown`;
- a `0.6.0` compatibility baseline and change case;
- an independently hashed declaration closure; and
- exact package-content and clean-consumer tests.

It does not change:

- the package root;
- SourceRecord `0.1.0`;
- Portable Cognition `0.1.0`;
- Host Integration `0.1.0`;
- the generic CLI;
- the team-memory connector or CLI;
- the SQLite store subpath; or
- historical compatibility artifacts.

The package remains `"private": true` and unpublished.

## Testing

### Codec

- Every supported cognitive-object type renders deterministically.
- Cognition events render deterministically.
- Render → parse preserves canonical Portable Cognition semantics.
- Reordered input object keys produce the same Markdown.
- Malformed frontmatter, duplicate fields, unknown fields, extra machine
  blocks, noncanonical JSON, hash mismatches, and invalid records fail closed.
- Markdown metacharacters, fences, HTML, wiki-links, Unicode, and lone
  surrogates cannot escape generated sections.
- Hostile descriptors and proxies are never invoked.

### Paths and Links

- Paths are stable across title and state changes.
- Object and event IDs cannot inject path components.
- Relationship links resolve to the highest projected target version.
- Missing relationship targets remain explicit unresolved IDs.
- Input order does not change paths, links, notes, index, or manifest.
- Duplicate immutable identities accept only canonical equality.

### Target Safety

- Relative, root, uninitialized, incompatible, and symbolic-link targets are
  rejected before mutation.
- Initialization never adopts a non-empty arbitrary directory.
- Projection never reads or writes outside the explicit target.
- Existing `.git` and `.obsidian` directories outside the target are untouched.
- Symlink and unexpected entry races fail closed.
- Absolute paths and arbitrary I/O errors never appear in diagnostics.

### Projection

- First projection reports created files.
- Identical second projection reports only unchanged files and preserves
  modification times.
- Adding a successor object revision creates one revision note and updates only
  the index and manifest.
- Manual changes produce conflicts without overwrite.
- `pruneManaged: false` preserves stale managed files.
- `pruneManaged: true` removes only unchanged stale manifest-owned files.
- Interrupted manifest replacement converges on identical retry.
- Result and returned parsed records are detached and deeply immutable.

### Package and CLI

- The versioned adapter import works from the packed package.
- The root export remains byte-for-byte compatible with `0.5.0`.
- The CLI initializes, projects, verifies, and optionally prunes a temporary
  managed directory.
- CLI parsing is closed and diagnostics are sanitized.
- The tarball includes only approved runtime, declarations, license, notice,
  citation, compatibility, and documentation artifacts.
- A clean consumer installs, typechecks, imports, and runs the executable.

### Team-Vault Acceptance

Acceptance uses a temporary Git repository shaped like a team vault, never a
personal or live vault.

The test:

1. creates unrelated `People`, `Projects`, `Daily`, and `.obsidian` fixtures;
2. initializes only `Collective Cognition`;
3. projects a complete Goal → Hypothesis → Evidence → Decision chain and audit
   events;
4. verifies Obsidian-compatible links and canonical round trips;
5. repeats projection and proves no rewrite;
6. adds one successor cognition revision and verifies the bounded diff;
7. injects a manual edit and proves conflict without overwrite;
8. proves unrelated files and repository metadata are byte-identical; and
9. removes the temporary repository after the test.

No live team vault is changed during automated acceptance.

## Documentation

Implementation updates:

- root README architecture and runnable commands;
- `docs/ROADMAP.md`;
- `spec/README.md`;
- the compatibility policy and baseline index;
- package documentation;
- a Markdown adapter author and operator guide; and
- an RFC recording projection versus persistence boundaries.

Public examples use fictional repository and identity values. They contain no
operator-local paths, private team data, or production artifacts.

## Acceptance Criteria

The slice is complete only when:

1. the pure codec round-trips every supported Portable Cognition fixture;
2. generated Markdown is byte-deterministic and Obsidian-readable;
3. all paths and relationship links are stable and input-order independent;
4. the adapter writes only to an explicitly initialized managed target;
5. identical projection performs no Markdown rewrites;
6. manual edits and unsafe entries fail without overwrite;
7. optional pruning touches only unchanged manifest-owned files;
8. temporary team-vault acceptance leaves unrelated content unchanged;
9. the package root and historical compatibility artifacts remain unchanged;
10. package, declaration, tarball, and clean-consumer checks pass;
11. the full supported-runtime matrix passes; and
12. independent final review has no unresolved Critical or Important finding.

## Explicit Deferrals

- Editable Markdown cognition.
- Markdown as a `CognitionStore`.
- Git merge semantics for cognition.
- Automatic source collection or promotion.
- Automatic projection scheduling.
- Live team-vault mutation during tests.
- Obsidian plugins, Sync integration, or UI automation.
- Connector registry or marketplace integration.
- Remote stores, hosted collaboration, or multi-tenant policy.
- Production certification, LTS, or npm publication.
