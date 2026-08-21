# RFC 0011: Cross-Connector Interoperability

**Status:** Accepted for private `0.10.0` implementation

## Decision

The SDK maintains a local, read-only Git repository connector alongside the
existing compatible team-memory ledger connector. The maintained Git connector
is independently useful, vendor-neutral, and operates only on an explicit
local repository snapshot. Both connectors produce SourceRecords for the same
generic ingestion and explicit-promotion boundaries.

The SDK does not export the historical Git commit mapper as an interoperability
API. A mapper over already-materialized commits does not own repository
selection, traversal, process safety, privacy controls, or diagnostics. The
SDK also does not add a connector registry or plugin runtime: discovery,
dynamic loading, credentials, network policy, scheduling, and certification
are deferred until evidence shows a need beyond two maintained connectors.

## Resource Boundary

The maintained Git connector's exact public subpath is
`collective-cognition-sdk/connectors/git/0.1.0`. Profile resources are planned
for these exact file-resource subpaths:

- `collective-cognition-sdk/interoperability/0.1.0/profile`
- `collective-cognition-sdk/interoperability/0.1.0/source-records`
- `collective-cognition-sdk/interoperability/0.1.0/portable-cognition`
- `collective-cognition-sdk/interoperability/0.1.0/errors`

These resources are UTF-8 files resolved by consumers; they are not JavaScript
modules. Task 3 defines their normative source artifacts only. Task 5 owns
package metadata and the export map, so this RFC does not package or export a
resource yet.

`collective-cognition-sdk-maintainers` own the reference exchange fixtures,
profile, conformance evidence, and compatibility inventory. External connector
owners retain responsibility for source access, authentication, privacy,
support, and their releases.

## Compatibility and Boundaries

The private unpublished `0.10.0` change is additive with a
minor-before-`1.0.0` compatibility effect. It leaves the package root
source-neutral and does not change SourceRecord or Portable Cognition schemas.

The Git connector uses a local Git executable through a bounded argument-array
process call, but this release adds no Git CLI executable to the package. It
does not fetch, pull, push, clone, authenticate, invoke credential helpers, or
perform repository, current-directory, environment, or service discovery.
Collection does not imply interpretation, promotion, persistence, publication,
Decision, Principle, truth, confidence, readiness, belief, or authorization.

## Acceptance

Acceptance requires both maintained connectors to pass source-specific and
generic conformance, mixed-source generic ingestion to retain source-local
duplicate and collision behavior, explicit neutral promotion to preserve both
provenances, and canonical SourceRecord and Portable Cognition round trips.
Unknown valid namespaced extensions must survive exactly or reject explicitly;
invalid extensions must produce declared stable errors without silent loss.
The reference evidence uses only temporary fictional sources and does not
certify unlisted connectors or production behavior.

## Explicit Deferrals

This RFC defers a connector registry, plugins, marketplaces, dynamic loading,
remote Git access, hosting-provider APIs, credentials, webhooks, scheduling,
polling, cursors, background synchronization, retry/outbox delivery,
connector-to-connector APIs, shared private connector implementations,
automatic promotion or interpretation, persistence, Markdown projection,
publication, consensus, real-time collaboration, ecosystem guarantees,
production certification, npm publication, endorsement, and LTS commitments.
