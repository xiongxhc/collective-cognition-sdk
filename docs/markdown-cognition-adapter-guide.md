# Markdown Cognition Adapter Guide

## Purpose

The Markdown cognition adapter creates a deterministic, read-only projection of
validated Portable Cognition records. It makes selected Goals, Hypotheses,
Experiments, Evidence, Decisions, Principles, and cognition events easy to
inspect in a Markdown directory without making Markdown the source of truth.

The authoritative record remains in the host-selected `CognitionStore` (for
example, an explicitly selected SQLite cognition database). The adapter does
not create a store, discover a vault or repository, ingest source material, or
persist changes made in Markdown. It only writes below one absolute directory
that the operator explicitly initializes.

## Who Uses It

- **SDK users** are host applications that already own validated Portable
  Cognition records and want a deterministic human-readable projection.
- **CLI users** are operators or automation authors who have a canonical
  Portable Cognition JSONL file and want to initialize, project, or verify one
  managed directory.
- **Readers** use an editor such as Obsidian or any Markdown viewer. An editor
  is optional and has no special integration or discovery privilege.

The adapter is source-neutral. A team-memory connector, another connector, or
a host application's own records can supply the Portable Cognition input; no
connector is required by this adapter.

## Initialize an Explicit Target

Choose an empty, absolute, dedicated directory. For example, a team may
deliberately select `Collective Cognition` inside its existing team vault:

```bash
collective-cognition-markdown init \
  --target "/workspace/demo-team-vault/Collective Cognition"
```

This example is only an explicit path choice. The adapter does not search for
`team-vault`, `.obsidian`, `.git`, a home directory, a repository, or a
database. The initial command writes a marker and an empty manifest; those
files establish the managed subtree boundary.

Keep the target dedicated to generated cognition even though the adapter does
not claim ownership of every later entry. Verification inspects only the
marker, manifest, and manifest-owned files. An unrelated unmanifested file is
operator-owned: it is not read, adopted, verified, or pruned. If an unmanaged
entry collides with a path required by the next projection, mismatching bytes
or an unsafe entry type fail closed. Exact desired bytes may be adopted only as
idempotent recovery from an interrupted projection.

The source checkout also supports the same closed command surface directly:

```bash
node --disable-warning=ExperimentalWarning src/markdown-cognition-cli.ts init \
  --target "/workspace/demo-team-vault/Collective Cognition"
```

Private package `0.6.0` includes the versioned adapter export and installed
`collective-cognition-markdown` executable. The source checkout command above
remains available for repository development.

## Input and Projection

`project` accepts canonical Portable Cognition `0.1.0` JSONL containing only
`cognitive-object` or `cognition-event` records. Validate, promote, and store
records through the normal host workflow before projecting them; projection
does not infer Evidence, Decisions, or Principles.

```bash
collective-cognition-markdown project \
  --input /workspace/demo-cognition/portable-cognition.jsonl \
  --target "/workspace/demo-team-vault/Collective Cognition"
```

The SDK surface is intentionally separate from the package root:

```ts
import {
  initializeMarkdownCognitionTarget,
  projectMarkdownCognition,
  verifyMarkdownCognitionTarget,
} from "collective-cognition-sdk/adapters/markdown/0.1.0";

await initializeMarkdownCognitionTarget({
  targetDirectory: "/workspace/demo-team-vault/Collective Cognition",
});

await projectMarkdownCognition({
  targetDirectory: "/workspace/demo-team-vault/Collective Cognition",
  records,
});

const verification = await verifyMarkdownCognitionTarget({
  targetDirectory: "/workspace/demo-team-vault/Collective Cognition",
});
```

That import path is the Supported Experimental package surface in private
package `0.6.0`. The source checkout exposes the same API from
`src/markdown-cognition.ts`; do not import implementation modules in an
installed consumer.

## Generated Layout

The profile uses stable SHA-256 identity directories and zero-padded revisions,
not note titles or local filenames:

```text
Collective Cognition/
├── .collective-cognition.json
├── .collective-cognition-manifest.json
├── Index.md
├── Objects/
│   ├── Goals/<sha256(object-id)>/v00000001.md
│   ├── Hypotheses/<sha256(object-id)>/v00000001.md
│   ├── Evidence/<sha256(object-id)>/v00000001.md
│   └── ...
└── Events/<sha256(object-id)>/<sha256(event-id)>.md
```

Each managed note contains readable fields, stable object-identity links into
`Index.md`, and one canonical Portable Cognition machine record. The index
anchor advances to the highest projected revision while historical note bytes
remain unchanged. `Index.md` is also managed. The marker identifies the target
format and profile; the manifest records every managed file digest and binds
record ownership to the exact generated path and immutable identity.

## Read-Only Conflict and Pruning Rules

Projection is write-if-changed. A second projection of the same records leaves
managed note bytes and modification times unchanged. If a managed note or the
managed index differs from its manifest digest, projection fails with
`managed_file_conflict` and does not overwrite the edit.

To recover from a manual edit:

1. Preserve the edit outside the managed subtree or apply the intended change
   to the authoritative cognition record.
2. Restore the exact managed bytes from a trusted copy, or remove only the
   affected managed file when the next projection can recreate it.
3. Run `verify`, then project again.

Pruning is opt-in:

```bash
collective-cognition-markdown project \
  --input /workspace/demo-cognition/portable-cognition.jsonl \
  --target "/workspace/demo-team-vault/Collective Cognition" \
  --prune-managed
```

`--prune-managed` removes only stale files whose bytes still match the prior
manifest. It preserves changed stale files by failing closed rather than
deleting them. It never recursively scans or prunes unrelated unmanifested
content in the target or elsewhere in the vault.

## Verification and Limits

Run verification before automation commits or publishes the projection:

```bash
collective-cognition-markdown verify \
  --target "/workspace/demo-team-vault/Collective Cognition"
```

Verification checks marker/manifest compatibility and the safe regular-file,
UTF-8, and complete-digest properties of manifest-owned files only. It does not
recursively inspect unrelated unmanifested entries. The first profile limits a
projection to 10,000 records, 128 MiB total managed content, 10,001 manifest
entries, four path segments, 512-byte relative paths, and 1 MiB per rendered
note or parsed Markdown record. Object revisions and cognition-event target
versions are limited to 99,999,999 so generated revision paths always use
exactly eight digits. The dedicated CLI separately limits the entire JSONL
input stream to 1 MiB.

The portable Node.js implementation assumes a stable target and ancestors:
untrusted same-privilege processes must not concurrently swap paths while an
operation is running. Static links, hard links, unexpected entry types, forged
manifest ownership, and detectable substitutions at marker, manifest, managed,
or desired paths fail closed. Unrelated unmanifested entries remain untouched.
A future descriptor-relative filesystem backend is tracked for stronger
concurrent-mutation containment.

## Git, Privacy, and Interoperability

Git automation belongs to the host or operator. This adapter does not inspect
Git state, create commits, push branches, schedule jobs, or decide review
policy. A host may verify a completed projection and then commit it using its
own explicit workflow.

The adapter renders the Portable Cognition records it receives, including their
permitted `data` and provenance fields. It does not add raw source content, but
it also cannot redact data that a caller already placed in the Portable
Cognition record. Filter secrets, private paths, personal data, and raw source
content before the host creates or exports projection input.

The output is ordinary UTF-8 Markdown with canonical JSON machine blocks, so
other tools can read it without Obsidian. Parsing a generated note proves a
record round trip; it does not authorize importing human edits or treating
Markdown as persistent cognition.

## What Is Verified and What Is Deferred

The source checkout has deterministic profile rendering/parsing, target
initialization and verification, projection conflict/pruning behavior, the
closed CLI, fixture round trips, and a temporary-directory runnable example.
The automated tests do not operate on a live team vault, personal vault, live
ledger, or live cognition database.

The private package `0.6.0` slice, including its export, executable,
compatibility baseline, package allowlist, clean-consumer verification, final
whole-branch review, and experimental GitHub prerelease delivery, is complete.
npm publication, vault synchronization, Git automation, native
descriptor-relative filesystem hardening, and any hosted collaboration service
remain deferred.
