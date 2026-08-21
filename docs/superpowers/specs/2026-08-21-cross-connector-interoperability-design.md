# Cross-Connector Interoperability Design

**Status:** Proposed for implementation
**Date:** 2026-08-21
**Target package:** private, unpublished `0.10.0`

## User Problem

A public SDK cannot credibly claim cross-connector interoperability while
team-memory-compatible SQLite is its only maintained collector and Git is only
an internal mapper for already-materialized commits. Other teams need a second
independently useful, vendor-neutral connector and portable fixtures proving
that different sources can enter the same cognition workflow without depending
on one another's private behavior.

## Decision Summary

Phase 5 will add:

1. a maintained, read-only local Git repository connector at
   `collective-cognition-sdk/connectors/git/0.1.0`;
2. a versioned Cross-Connector Interoperability Profile `0.1.0` containing
   language-neutral fixtures and expected outcomes;
3. one maintained exchange scenario that collects from a temporary Git
   repository and a structurally compatible temporary team-memory ledger,
   ingests both through the same generic path, promotes only through an
   explicit neutral policy, and round-trips the result through Portable
   Cognition; and
4. additive private package and compatibility baseline `0.10.0`.

The package root remains source-neutral. Git and team-memory remain independent
connectors. Neither connector imports, configures, discovers, or calls the
other. Collection still does not imply interpretation, promotion, persistence,
publication, a Decision, a Principle, truth, or organizational acceptance.

The existing roadmap text lists two independently useful connectors as a Phase
5 entry criterion even though Phase 5 is the phase that adds and verifies the
second connector. This approved design corrects that circular gate: the second
maintained connector is Phase 5's first deliverable and two independently
useful conforming connectors are a Phase 5 completion criterion. The roadmap
will be updated without changing the substantive acceptance requirement.

## Considered Approaches

### 1. Maintained local Git connector plus interoperability profile

**Selected.** An explicit local repository is broadly useful, vendor-neutral,
works without network credentials, and supplies a real second source boundary.
It allows the SDK to prove source safety, deterministic mapping, generic
ingestion, extension handling, and portable exchange with two concrete
connectors.

### 2. Export the existing structured Git mapper

Rejected as insufficient for Phase 5. A mapper for an already-materialized
commit still requires every consumer to implement repository selection,
history traversal, process safety, diagnostics, bounds, and source-mutation
checks. It is useful internally but is not an independently useful maintained
collector.

### 3. Add a connector registry or plugin runtime

Deferred. Discovery, dynamic loading, credentials, network policy, scheduling,
and certification would create a new platform subsystem before two maintained
connectors have produced evidence that such a subsystem is needed.

## Architecture

```text
explicit local Git repository                 explicit compatible ledger
             |                                           |
             v                                           v
  maintained Git connector                 maintained team-memory connector
             |                                           |
             +--------------- SourceRecord[] ------------+
                                     |
                                     v
                         generic source ingestion
                                     |
                                     v
                      explicit neutral promotion policy
                                     |
                                     v
                        Portable Cognition records
                                     |
                                     v
                     host-selected persistence or export
```

The interoperability profile tests the shared contracts and expected semantic
outcomes. It does not introduce connector-to-connector calls, a common
connector superclass, a registry, or a transport protocol.

## Maintained Git Connector `0.1.0`

### Public package boundary

The connector is exported only from:

```text
collective-cognition-sdk/connectors/git/0.1.0
```

No Git-specific runtime or type name is added to the package root. The existing
internal `src/adapters/git-commit.ts` mapper may be refactored or replaced, but
it remains internal and creates no independent compatibility promise.

### Public API

```ts
export const GIT_REPOSITORY_FORMAT = "git-repository/1";

export interface GitCommitSourceRecordOptions {
  readonly repositoryPath: string;
  readonly sourceInstance: string;
  readonly tipCommitId: string;
  readonly capturedAt: string;
  readonly limit: number;
  readonly includeMessage?: boolean;
  readonly includeAuthorEmail?: boolean;
}

export type GitConnectorErrorCode =
  | "invalid_options"
  | "target_unavailable"
  | "incompatible_repository"
  | "invalid_commit"
  | "read_failed";

export type GitConnectorStage =
  | "options"
  | "open"
  | "history"
  | "mapping";

export class GitConnectorError extends Error {
  readonly code: GitConnectorErrorCode;
  readonly stage: GitConnectorStage;
  readonly details: Readonly<Record<string, string | number | boolean>>;
}

export function readGitCommitSourceRecords(
  options: GitCommitSourceRecordOptions,
): readonly SourceRecord[];
```

The function is synchronous to match the existing local SQLite connector and
Node's synchronous process boundary. The package adds no npm runtime
dependency. This optional subpath requires an available `git` executable; the
root package and every non-Git subpath do not.

### Closed option semantics

- `repositoryPath` MUST be an explicit absolute filesystem path. Relative
  paths, `~`, URLs, NUL values, an omitted path, and implicit current-working-
  directory or environment discovery are rejected.
- `sourceInstance` MUST satisfy the same public, non-secret identity rules as
  the team-memory connector: 1 through 128 Unicode scalar values, no control
  characters, and no surrounding whitespace. It MUST NOT contain a credential,
  private path, access token, or sensitive tenant label.
- `tipCommitId` MUST be one exact lowercase hexadecimal Git object ID of 40 or
  64 characters. Branch names, tag names, revision expressions,
  ranges, and values beginning with an option marker are rejected. The object
  MUST resolve to a commit in the selected repository.
- `capturedAt` MUST be a valid ISO 8601 timestamp with an explicit UTC offset.
  The caller supplies it so repeated collection of an unchanged snapshot can
  remain canonically deterministic.
- `limit` MUST be an integer from 1 through 1,000. The selected set is the
  bounded ancestry window ending at `tipCommitId`.
- `includeMessage` defaults to `false`. The full commit message is omitted
  unless explicitly requested. The neutral summary remains present.
- `includeAuthorEmail` defaults to `false`. Author email is omitted unless
  explicitly requested. The author name remains present as source metadata.
- Unknown, inherited, accessor-backed, symbol, or otherwise non-closed option
  fields are rejected before repository access. Duplicate keys in serialized
  configuration are a parser-layer concern because JavaScript object creation
  resolves them before this API receives a value.

### Selection and order

The connector selects the exact tip and at most `limit - 1` commits by following
only the first-parent chain. This produces one deterministic ancestry window
ending at `tipCommitId`. The selected chain is returned oldest-to-newest. A
merge commit is included when it lies on that chain, and its record preserves
all ordered parent IDs, but the connector does not traverse secondary-parent
history in `0.1.0`.

The connector does not fetch, pull, checkout, switch branches, resolve remote
references, follow a network URL, or mutate the selected repository. A caller
that needs pagination, remote APIs, webhooks, or credentials owns that behavior
outside this connector.

### SourceRecord mapping

Each commit maps to one immutable `SourceRecord`:

```text
source.system   = git-repository
source.instance = caller-supplied sourceInstance
sourceId        = commit:<commit object ID>
revisionId      = commit object ID
capturedAt      = caller-supplied capturedAt
observedAt      = commit authored timestamp
mediaType       = application/vnd.git.commit+json
```

The record ID is a collision-safe canonical identity over `sourceInstance` and
the commit object ID. Content contains the commit ID, ordered parent IDs,
authored timestamp, committed timestamp, author name, and summary. Full message
and author email appear only under their explicit privacy opt-ins.

The connector does not synthesize an `actorId` from a name or email. Identity
resolution belongs to the caller or a separate identity layer. It does not add
polarity, confidence, readiness, authority, truth, Evidence classification,
Decisions, Principles, or beliefs.

### Process and filesystem safety

- Invoke the `git` executable with an argument array and `shell: false`.
- Pass the repository only through the explicit `-C` argument.
- Use read-only history and object-inspection commands only.
- Set `GIT_OPTIONAL_LOCKS=0` for every child process.
- Set `GIT_NO_LAZY_FETCH=1` and `GIT_TERMINAL_PROMPT=0` for every child
  process.
- Inspect repository configuration before history traversal and reject
  partial/promisor repositories as `incompatible_repository`. Missing objects
  fail locally; the connector never asks Git to retrieve them.
- Do not execute hooks, filters, diffs, checkout operations, credential
  helpers, network commands, or shell expansions.
- Bound child-process duration, output bytes, commit count, and per-commit
  parsed content before allocating the final record collection.
- Validate every selected commit and map every record before returning any
  result. A malformed commit fails the complete collection.
- Source-specific tests snapshot refs, `HEAD`, index, worktree status, config,
  and filesystem identity before and after successful and failed collection.

### Errors and diagnostics

`GitConnectorError` is detached and frozen. Public messages are fixed per error
code. `details` contains only closed fields such as `field`, `limit`, or
`commitIndex`; it never contains repository paths, object contents, commit
messages, author values, Git stderr, command lines, environment values,
credentials, or arbitrary exception text.

Error meaning:

| Code | Stage | Meaning |
| --- | --- | --- |
| `invalid_options` | `options` | The closed option contract is invalid. |
| `target_unavailable` | `open` | The explicit repository path or Git executable is unavailable. |
| `incompatible_repository` | `open` or `history` | The target is not a compatible repository or the exact tip is not a commit. |
| `invalid_commit` | `history` or `mapping` | Selected commit metadata cannot satisfy the mapping contract. |
| `read_failed` | `open` or `history` | A bounded read operation failed for another reason. |

## Cross-Connector Interoperability Profile `0.1.0`

### Purpose

The profile supplies language-neutral evidence that independent connectors can
share SourceRecord, ingestion, promotion, and Portable Cognition contracts
without sharing private code. It is a fixture and semantic-outcome contract,
not a registry, certification program, wire service, or claim about untested
connectors.

### Normative artifacts

Create immutable versioned artifacts under:

```text
spec/interoperability.md
spec/interoperability/0.1.0/profile.json
spec/interoperability/0.1.0/source-records.jsonl
spec/interoperability/0.1.0/portable-cognition.jsonl
spec/interoperability/0.1.0/error-cases.jsonl
```

The package exposes versioned resource subpaths for the profile and each
fixture file. These are file resources, not JavaScript modules. Consumers use
`import.meta.resolve(specifier)` and read the resolved file as UTF-8; tests do
not treat JSONL as an ESM import. Existing SourceRecord and Portable Cognition
schemas remain unchanged and continue validating their respective records.

```text
collective-cognition-sdk/interoperability/0.1.0/profile
collective-cognition-sdk/interoperability/0.1.0/source-records
collective-cognition-sdk/interoperability/0.1.0/portable-cognition
collective-cognition-sdk/interoperability/0.1.0/errors
```

The profile identifies its owner as
`collective-cognition-sdk-maintainers`. Ownership means maintaining the
reference fixtures, tests, report, and compatibility inventory. It does not
mean ownership of external connectors or their source systems.

### Required fixture coverage

The fixtures contain:

- at least one team-memory-compatible event record;
- at least one Git commit record;
- mixed-source ingestion containing source-local duplicates and a
  source-local revision collision without creating a false collision between
  the two source systems;
- an explicit Goal and Hypothesis;
- neutral Evidence promoted from records contributed by both connectors;
- one transitioned Hypothesis and matching Cognition Event;
- attributed identities, relationships, source provenance, and timestamps;
- one supported unknown namespaced extension preserved byte-semantically;
- invalid unnamespaced or malformed extension cases with exact stable error
  classification; and
- explicit absence of inferred Decisions and Principles.

Fixtures use fictional public identities and contain no real repository path,
ledger path, email address, credential, private source content, or production
data.

### Semantic equivalence rules

Two exchange records are semantically equivalent when their normalized,
validated contract values are canonically equal. JSON member order,
insignificant formatting, and detached runtime object identity do not affect
equivalence.

The reference exchange MUST prove:

1. both connectors independently pass Source Connector Conformance `0.1.0`;
2. both connectors' output enters the same `ingestSourceRecords` call without
   connector-specific branches;
3. serialization and deserialization preserve each SourceRecord's normative
   meaning and revision identity;
4. explicit neutral promotion preserves provenance from both source systems;
5. Portable Cognition serialization and deserialization preserve objects,
   versions, transitions, events, relationships, attribution, and provenance;
6. a supported unknown namespaced extension is preserved opaquely and exactly;
7. an unsupported or invalid extension is rejected with a declared stable
   error rather than silently discarded; and
8. no collection or exchange step infers a Decision, Principle, truth,
   readiness, confidence, organizational belief, or authorization.

Consumers MAY preserve an unknown namespaced extension opaquely or reject it
explicitly when their declared profile does not support it. They MUST NOT
silently remove or reinterpret it. The reference SDK preserves valid
namespaced extensions through its normative codecs.

## Owned Reference Exchange

Add a runnable example using only temporary fictional sources:

```text
temporary Git repository
  -> maintained Git connector

temporary compatible SQLite event ledger
  -> maintained team-memory connector

both SourceRecord collections
  -> generic ingestion
  -> explicit neutral promotion linked to a caller-created Hypothesis
  -> Portable Cognition serialization
  -> Portable Cognition deserialization
  -> canonical semantic comparison
```

The example creates and deletes its own temporary root, does not inspect the
user's repositories or vaults, and does not require `team-memory-agent`. It
reports counts and stable fictional IDs only. It does not persist cognition,
project Markdown, publish events, schedule work, or touch a live source.

The repository maintainers own this reference exchange. External connector
owners remain responsible for their own source access, authentication,
privacy, support, and release policy.

## Package and Compatibility

This slice advances the private unpublished package from `0.9.0` to `0.10.0`.
The change is additive and has a minor-before-`1.0.0` package effect.

Add:

- the Git connector runtime and declaration subpath;
- Cross-Connector Interoperability Profile `0.1.0` resource subpaths;
- RFC 0011;
- the interoperability report and connector documentation;
- the owned reference exchange example;
- immutable compatibility baseline `0.10.0` and change cases; and
- exact package, declaration-closure, clean-consumer, and tarball inventories.

Preserve byte-for-byte every normative artifact and compatibility baseline from
`0.1.0` through `0.9.0`. Preserve every existing root export, versioned
subpath, executable, CLI mode, policy identity, schema, error code, and package
artifact. No Git CLI is added in this slice.

Package `0.10.0` remains private and unpublished. This profile does not change
the historical Distribution Readiness Profile `0.1.0`, authorize publication,
or claim production readiness, certification, endorsement, or LTS support.

## Testing and Acceptance

### Git connector acceptance

- Real temporary repositories cover root commits, linear history, merge
  commits, Unicode, multiline messages, absent author email, 40-character
  object IDs, a supported 64-character object-ID repository or fixture,
  privacy opt-ins, exact tips, deterministic limits, and stable topological
  ordering.
- Invalid options fail before process or filesystem access.
- Missing Git, missing targets, non-repositories, non-commit tips, malformed
  commit metadata, process failure, timeout, and output-limit failures produce
  exact sanitized codes and stages.
- Repeated reads of an unchanged exact tip produce canonically equal records.
- Identical commits under distinct `sourceInstance` values remain distinct.
- Successful and failed reads leave refs, `HEAD`, index, config, worktree
  status, byte sizes, and modification times unchanged.
- The connector passes generic conformance without importing team-memory code.

### Interoperability acceptance

- Team-memory and Git pass their own source-specific tests and the same generic
  connector conformance boundary.
- The owned exchange consumes both through one generic ingestion call.
- Shared fixtures validate under the existing SourceRecord and Portable
  Cognition schemas and runtime validators.
- Canonical round trips preserve all normative semantics.
- Valid unknown namespaced extensions are preserved; invalid extensions fail
  with stable declared errors; no case silently drops extension data.
- Neutral Evidence includes attributable provenance from both source systems.
- Decisions and Principles remain absent unless explicitly supplied by a
  caller outside this exchange.
- Neither connector imports or calls the other connector's implementation.

### Distribution acceptance

- Package and compatibility tests preserve historical artifacts and prove the
  exact additive `0.10.0` inventory.
- Runtime and TypeScript consumers import the Git connector. Clean consumers
  resolve every profile resource through its declared package subpath and read
  the resolved UTF-8 file; JSONL resources are not imported as modules.
- Packed-tarball installation, declaration closure, syntax checks, typecheck,
  full tests, examples, and deterministic package contents pass.
- Node.js `24.9.0` remains the honest capability-limited package/core lane.
  Supported workflow and full SQLite coverage remain verified on Node.js
  `24.14.0` and `24.19.0` according to the existing matrix.
- Independent specification, code, security, and whole-branch reviews report
  no unresolved Critical or Important finding before merge.

## Explicit Deferrals

- No connector registry, plugin discovery, dynamic loading, marketplace, or
  certification program.
- No remote Git URL, clone, fetch, pull, push, authentication, credential
  helper, webhook, or hosting-provider API.
- No Git CLI executable in package `0.10.0`.
- No implicit repository, current-working-directory, home-directory, vault,
  ledger, environment, or running-service discovery.
- No scheduling, polling, incremental cursor store, background synchronization,
  retries, or durable delivery outbox.
- No connector-to-connector API, shared private implementation, or requirement
  that external connectors live in this repository.
- No automatic interpretation, promotion, Evidence polarity, persistence,
  Markdown projection, publication, Decision, Principle, or belief extraction.
- No distributed consensus, real-time collaboration, arbitrary ecosystem
  guarantee, production certification, npm publication, endorsement, or LTS
  commitment.

## Success Boundary

Phase 5 is complete only when two independently useful maintained connectors
pass source-specific and generic conformance tests, the owned reference exchange
proves semantic portability across both source systems, the profile's extension
rules fail or preserve explicitly without silent loss, package `0.10.0` passes
its complete compatibility and distribution gates, independent review is clean,
and the result is merged with passing post-merge CI.
