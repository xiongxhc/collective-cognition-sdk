# RFC 0007: Markdown Cognition Adapter

**Status:** Implemented and packaged; final whole-branch review pending

**Created:** 2026-07-30

## Problem

Teams need a reviewable, portable presentation of governed cognitive objects
without turning an editor directory into an uncontrolled persistence layer.
Plain Markdown is broadly useful, but implicit vault discovery, title-derived
paths, automatic Git actions, and silent overwrites would make a projection
unsafe and difficult to reproduce.

## Proposed Semantics

The adapter projects validated Portable Cognition `0.1.0` cognitive-object and
cognition-event records into a strict Markdown profile. SQLite or another
host-selected `CognitionStore` remains authoritative. The projection is
read-only: parsing generated Markdown supports validation and round trips, not
importing human edits or persisting them back to a host.

An operator supplies one absolute target directory and initializes it before
projection. The adapter never discovers a vault, repository, `.obsidian`,
`.git`, home directory, source store, or cognition store. Initialization adds a
format marker and empty manifest. Subsequent operations only address files
under that marked subtree.

The target should be dedicated to generated cognition. Verification is
manifest-closed: it inspects only the marker, manifest, and manifest-owned
files. Unrelated unmanifested entries remain operator-owned and are not read,
adopted, verified, or pruned. Mismatching collisions or unsafe substitutions at
managed or newly desired paths fail closed; exact desired bytes may be adopted
only as idempotent interrupted-write recovery.

Generated paths use stable SHA-256 identifiers and explicit revisions.
Rendered notes contain canonical Portable Cognition machine records. A
canonical manifest records every managed path and complete file digest. An
identical projection is write-if-changed and does not rewrite unchanged files.
Relationships target deterministic object-identity anchors in `Index.md`.
Each anchor points to the highest projected revision, so adding a referenced
successor changes only the successor note, index, and manifest rather than
rewriting historical notes.

If a manifest-managed file differs from its recorded digest, the adapter fails
with `managed_file_conflict` rather than overwriting a manual edit. Optional
pruning removes only stale managed files that still match their prior digest.

## Git and Obsidian Boundaries

Git and Obsidian are non-dependencies. The output is standard Markdown and can
be read by either tool, but the adapter does not bind to, discover, configure,
or modify either. Git commits, pushes, schedules, review workflow, and vault
layout remain host or operator responsibilities.

## Privacy and Authority

Projection preserves the data in validated Portable Cognition records; it does
not create, infer, promote, or authorize cognition. Callers remain responsible
for excluding secrets, personal data, raw source content, and private paths
before records reach the projection. Reading a note is not an authorization
decision, and editing one is not an approved cognitive transition.

## Compatibility and Package Status

The intended public surface is the Supported Experimental subpath
`collective-cognition-sdk/adapters/markdown/0.1.0` plus the dedicated
`collective-cognition-markdown` executable. This is an additive private package
`0.6.0` change: it does not alter package-root exports, the generic CLI,
SourceRecord `0.1.0`, Portable Cognition `0.1.0`, Host Integration `0.1.0`, or
existing connector behavior.

The `0.6.0` compatibility baseline, versioned export, dedicated executable,
exact package allowlist, and clean-consumer workflow are implemented and
verified. The package remains private and unpublished; no registry or
publication commitment follows from this RFC.

## Security Model

At marker, manifest, manifest-owned, and desired paths, the runtime rejects
static links, hard links, unexpected entry types, unsafe paths, invalid UTF-8,
forged manifest namespaces or identities, incompatible metadata, and
detectable substitutions. It does not recursively inspect unrelated
unmanifested entries. Portable Node.js 24 does not expose descriptor-relative
child operations, so the initial implementation assumes untrusted
same-privilege processes do not concurrently mutate the target or its
ancestors. Final-window swap-back mutation is outside this implementation's
containment guarantee. A descriptor-relative native or platform backend is
deferred.

## Acceptance Checks

- profile fixtures render deterministically and parse back to Portable
  Cognition records;
- target initialization and verification require one explicit managed target;
- projection preserves unchanged files, fails on manual edits, and prunes only
  unchanged stale managed files when explicitly requested;
- verification leaves an unrelated unmanifested file untouched and does not
  report it as managed;
- CLI tests prove closed argument grammar, absolute explicit paths, a 1 MiB
  aggregate JSONL input limit, no discovery, and sanitized diagnostics;
- profile and projection tests prove object revisions and cognition-event
  target versions accept `99,999,999`, reject `100,000,000`, and reject before
  target access;
- a runnable temporary-directory example initializes, projects, round-trips,
  reprojects without updates, verifies, and cleans up;
- package compatibility is complete and final whole-branch review remains a
  separate gate.

## Alternatives

### Make Markdown Authoritative

Rejected. Free-form edits cannot preserve the Portable Cognition lifecycle,
attribution, provenance, conflict semantics, or host-owned persistence
guarantees without a separate governed import protocol.

### Discover an Existing Vault

Rejected. Ambient discovery is ambiguous, violates explicit-target safety, and
would couple a public SDK to private local layout.

### Require Obsidian or Git

Rejected. Both are useful optional consumers, but neither is required for a
portable Markdown profile or should control host persistence.

## Explicit Deferrals

- importing or reconciling human Markdown edits;
- automatic source collection, promotion, or cognition persistence;
- Git automation, scheduler integration, vault synchronization, or repository
  discovery;
- live-vault, live-ledger, or live-cognition-database automated tests;
- package publication, registry confirmation, production certification, or
  long-term support;
- descriptor-relative filesystem operations and concurrent same-privilege
  swap-back containment;
- hosted collaboration, merge, search, or user-interface services.
