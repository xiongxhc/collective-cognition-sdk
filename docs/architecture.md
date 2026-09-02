# Architecture

## Layers

The approved architecture has four downward-dependent layers: host applications
own persistence, authorization, automation, UI, and policy; the TypeScript
reference SDK or another-language implementation supplies optional runtime
components; portable contracts, schemas, and fixtures define interoperable
records and conformance; and the language-neutral Charter governs shared
meaning. The Charter does not depend on TypeScript, Team Memory, Git, Markdown,
Obsidian, SQLite, or any host.

## System position

Collective Cognition SDK is a semantic and governance layer used by host
applications. It sits above systems that capture activity, documents,
conversations, measurements, or other source material. It does not replace those
systems, operate an organization-wide service, or require every participant to
install the SDK directly.

```text
source systems and memory stores
  → connectors or canonical SourceRecords
  → host application using Collective Cognition SDK
  → governed cognitive objects and events
  → review interfaces, agents, reports, or knowledge projections
```

Applications, agent platforms, and organizational tools embed the SDK or invoke
its CLI. Individual participants interact with those products; they need the SDK
only when building or operating an integration themselves.

## Storage ownership

The SDK defines cognitive objects, validation, transitions, provenance, and
authorization boundaries. It does not own a database or silently persist
application data.

A deployed host normally has two logically distinct stores:

1. a **source store**, owned by the originating system, containing captured
   material such as activity records, documents, messages, or measurements;
2. a **cognition store**, owned by the host application, containing governed
   Goals, Hypotheses, Experiments, Evidence, Decisions, Principles, and their
   audit events.

These stores may use separate databases, separate schemas in one database,
files, or another host-selected persistence model. Keeping them logically
separate is important: source material may be replayed or regenerated, while
approved decisions, rationale, authority, and history are durable organizational
records. A host can begin with a dedicated SQLite database and later move to
PostgreSQL or another backend without changing the core model.

The SDK supplies the host-port contract, an in-memory reference implementation,
and an optional Node-specific SQLite `CognitionStore` reference adapter. A host
chooses and owns its `CognitionStore` and `CognitionEventPublisher`; a
publication failure is observable as `committed_but_unpublished` and retryable
with the exact same transition request. The example's identical retry succeeds,
but the contract does not guarantee that every retry will succeed. Hosted
services and durable publication remain planned ecosystem work.

## SourceRecord boundary rules

A `SourceRecord` accepts only the documented top-level and `source` fields.
Every `extensions` key must contain a namespace separator (`:` or `.`) with
non-empty sides. The interpretation keys `polarity`, `confidence`, and
`authority` are also rejected directly in `context`; source-authored raw
`content` may preserve fields with those names. The complete record is limited to
256 nested JSON containers, counting the root object as depth 1, so every SDK and
CLI entry point rejects deeper values with `INVALID_SOURCE_RECORD` before
recursive processing. `contentHash` is opaque caller-supplied integrity metadata,
and this SDK does not verify that it is a digest or that it matches `content`.

A convenience workflow may ingest and promote in one operation, but it must
preserve and expose both artifacts. Successful parsing never means that material
is true, accepted evidence, or authorized for a consequential decision.

Read the [normative SourceRecord contract](../spec/source-record.md), the
[universal ingestion
design](https://github.com/xiongxhc/collective-cognition-sdk/blob/main/docs/superpowers/specs/2026-07-24-universal-ingestion-design.md),
and the [implemented
RFC](../rfcs/0001-universal-source-record-ingestion.md).

## Semantic limits

Charter `1.0.0`, SourceRecord `0.1.0`, Portable Cognition `0.1.0`, and the
standalone cognitive-object and cognition-event projections `0.1.0` have
normative language-neutral prose, schemas, or fixtures. Portable Cognition
provides an exchange record only: it neither persists nor publishes a record, and
it does not authenticate a confirmation or execute authorization policy. Host
Integration `0.1.0` defines the separate host-owned persistence and publication
boundary without selecting a mandatory database or delivery system.

The optional SQLite adapters are Node-specific reference implementations; they do
not make SQLite normative or alter the source-neutral root API. Durable workflow
SQLite schema version `2` requires a new explicit database in this slice and
provides no migration from version `1`. No scheduler, automatic cognition,
Obsidian discovery, authentication, encryption, durable outbox, or production
certification is supplied.

Domain-error shapes have no dedicated stack, cause, exception-name, or path
fields, and runtime boundary failures do not automatically project caught
exceptions; `message` and `details` are caller supplied, so hosts must filter
secrets, paths, and operational details before creating records. Type-specific
cognitive-object `data` payloads retain Portable Cognition's permissive
JSON-compatible boundary; incompatible semantic tightening requires a new
resource version.

The project does not claim universal compatibility, production readiness, or
broad adoption. Connector conformance is not certification, does not imply
endorsement, and is not an LTS commitment. Stronger claims require a published
stable package, independently implemented connectors, final verification, and
real-team evidence.
