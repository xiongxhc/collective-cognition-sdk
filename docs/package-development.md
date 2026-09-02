# Package Development

Build and verification notes for working on the package itself. The
[CLI reference](cli-reference.md) lists every repository script; this page
explains what the packaging gates check and how consumers resolve the shipped
artifacts.

## Build and verification gates

The package build emits source-neutral ESM JavaScript and declarations under
ignored `dist/`:

```bash
npm run build
npm run test:schema
npm run test:compatibility
npm run test:package
npm run pack:check
```

`npm run test:schema` compiles the SourceRecord, Portable Cognition, standalone
cognitive-object, and standalone cognition-event schemas in strict Draft 2020-12
mode and checks their normative fixture corpora plus linked lifecycle coverage.
`npm run pack:check` and npm prepack inherit this combined schema gate.

`npm run test:compatibility` checks the compatibility baseline's exact
inventories, independent public declaration closures and digests, policy
identities, CLI contracts, and declared additive and breaking change cases; it
does not decide semantic compatibility automatically.

`npm run test:package` imports the built root and versioned subpaths, checks
exact runtime and tarball allowlists, runs the installed CLIs, and installs the
packed artifact into a clean temporary project to verify runtime and TypeScript
imports. npm operations use an isolated temporary cache.

## Resolving shipped resources

Installed consumers can import the schema through the versioned package subpath:

```js
import sourceRecordSchema from "collective-cognition-sdk/schemas/source-record/0.1.0"
  with { type: "json" };
```

Consumers can resolve the versioned compatibility baseline through:

```js
import compatibilityBaseline from "collective-cognition-sdk/compatibility/0.11.0"
  with { type: "json" };
```

The Charter, schemas, and JSONL corpora are UTF-8 file resources rather than
JavaScript modules. Resolve them explicitly; the same pattern applies to all
eight `charter`, `schemas`, and `conformance` subpaths listed in the [public API
reference](public-api.md):

```ts
import { readFile } from "node:fs/promises";

const charterUrl = import.meta.resolve(
  "collective-cognition-sdk/charter/1.0.0",
);
const charter = await readFile(new URL(charterUrl), "utf8");
```

## Root runtime surfaces

Validate standalone payloads through the package root without inventing a new
Portable Cognition record version:

```ts
import {
  deserializeCognitionEventProjection,
  deserializeCognitiveObjectProjection,
  validateCognitionEventProjection,
  validateCognitiveObjectProjection,
} from "collective-cognition-sdk";

validateCognitiveObjectProjection(objectPayload);
validateCognitionEventProjection(eventPayload);
const object = deserializeCognitiveObjectProjection(objectJson);
const event = deserializeCognitionEventProjection(eventJson);
```

The package also exposes the Portable Cognition runtime and versioned artifacts
for local or packed consumers:

```ts
import {
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
} from "collective-cognition-sdk";
```

Package `0.2.0` allowed a package-wide `DomainErrorCode` value to be assigned
directly to `PortableDomainError.code`. Package `0.3.0` requires callers to
narrow first because Portable Cognition `0.1.0` deliberately excludes host-only
and future package errors. Use a type guard returning
`code is PortableDomainError["code"]`; [RFC
0004](../rfcs/0004-host-integration-contract.md#portable-domain-error-migration)
contains the complete migration example.

## Optional subpaths excluded from the root

The optional SQLite reference adapter is not exported from the root. Import it
from `collective-cognition-sdk/stores/sqlite/0.1.0` and provide an absolute
cognition-database path. It creates a missing target only when
`createIfMissing: true`, rejects unmarked or source-ledger databases without
mutation, stores canonical Portable Cognition records and audit events
atomically, and provides no durable event-publication outbox.

The durable workflow is also excluded from the root. Import workflow contracts
from `collective-cognition-sdk/workflows/durable/0.1.0` and the SQLite workflow
store from `collective-cognition-sdk/stores/sqlite-workflow/0.1.0`. Clean
consumers can typecheck both versioned entrypoints and execute the packed
`collective-cognition-workflow` binary. Both SQLite modules are self-contained;
the tarball contains no `sqlite-internal` JavaScript or declaration file.

## Repository examples

Run [`examples/portable-cognition.ts`](../examples/portable-cognition.ts) for one
complete cognitive-object round trip. Its schema and fixtures are available at
`collective-cognition-sdk/schemas/portable-cognition/0.1.0` and
`collective-cognition-sdk/conformance/portable-cognition/0.1.0/cognitive-loop`.

Host applications import the coordinators from the package root and the
in-memory reference host from
`collective-cognition-sdk/reference-host/0.1.0`. Run
[`examples/host-integration.ts`](../examples/host-integration.ts) to create an
object, persist a transition, observe its first publication fail, and show the
identical retry succeed without generating a new event ID.

[`examples/stable-external-host.ts`](../examples/stable-external-host.ts) is the
Slice A fictional external-host acceptance path. Supply one absolute JSONL source
path containing exactly two fictional SourceRecords and a different absolute
SQLite cognition path:

```bash
npm run example:stable-host -- \
  --source-records /absolute/path/to/fictional-source-records.jsonl \
  --cognition-db /absolute/path/to/fictional-cognition.db
```

The example explicitly ingests, promotes neutral Evidence, persists and reloads
six objects and three events, and serializes nine Portable Cognition records. It
never discovers Team Memory, a vault, a ledger, `HOME`, or a source target. Hosts
still own authentication, authorization-policy selection, secrets, tenant and
workspace isolation, persistence durability, publication recovery, and
real-device acceptance.

## SQLite verification evidence

The SQLite `0.4.0` slice and maintained connector package `0.5.0` slice were
final-review verified on the supported bundled Node.js runtime. Publication
readiness remains a separate unfinished gate.

The [recorded read-only acceptance
evidence](acceptance/durable-cognition-workflow-0.1.0.md) used an explicitly
supplied compatible team-memory ledger and temporary writable targets only. It
persisted a Hypothesis at version `2` in state `under_review`, one neutral
Evidence from `12` source records, and one event; it inferred `0` Decisions and
`0` Principles, completed close and reopen replay, and passed Markdown
verification. Source size, modification time, change time, inode, and SHA-256
were equal before and after. No live vault was accessed. The historical SQLite
store slice and Durable Cognition Workflow are final-review verified; this
acceptance evidence is not a production-readiness claim.

## Publication guard

The package manifest intentionally retains `"private": true` as an npm
publication guard. The package is unpublished. Removing the guard still requires
registry-name confirmation, completion of every mandatory distribution gate,
final verification, and explicit accountable-human publication approval.
