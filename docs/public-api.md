# Public API Reference

This reference is checked against the compatibility baseline selected by the current `package.json` version. It names every exported surface that the package promises to keep visible.

Current package `0.11.0` is private and unpublished. This inventory does not
authorize npm publication, certify a deployment, or claim production use.

The private, unpublished `0.11.0` Slice A is integrated on `main` at merge commit `669b3ed3a30cccee098730fe6cf558bc37e18ac5` via PR #15; its PR checks all passed. Post-merge CI run `32950251966` passed all eight jobs, including Node `24.14.0` Ubuntu job `98119822963`, which passed "runs a fictional external host through an explicit source fixture and SQLite target". This records supported-runtime CI acceptance only; real-device acceptance, public RC/stable publication, npm OIDC/bootstrap work, production readiness, adoption, certification, SLA, and LTS remain pending or unclaimed.

## Stability

- `Normative Stable` means a versioned contract or immutable policy artifact that downstream code may rely on across compatible releases.
- `Supported Experimental` means a public package entrypoint or executable that is exported and tested but can still change before `1.0.0`.
- `Internal` means a repository path that does not appear in `exports` and has no package compatibility promise.
- Supported Experimental is not Normative Stable.
- source paths absent from `exports` are internal.

These are the private pre-`1.0.0` maturity labels that `packagePolicyVersion`
`0.1.0` defines. The stable boundary is published separately as
`packagePolicyVersion` `1.0.0` and is summarized in Stable `1.0.0`
Classification below. It takes effect only when a compatibility baseline records
that policy version, so no Supported Experimental `0.11.0` surface is promoted
here.

### Durable Workflow Runtime

Supported Experimental workflow execution requires Node.js `>=24.14.0` and
`DatabaseSync.prototype.enableDefensive`. Node.js `24.9.0` remains a
package/core compatibility lane with honest workflow and SQLite capability
skips; it is not a full workflow runtime. The root package engine remains
Node.js `>=24`. `WORKFLOW_CLI_CONTRACT.runtime` records this workflow-specific
minimum and capability in machine-readable form.

## Root API

Import the root package from `collective-cognition-sdk`. The root export `.` is Supported Experimental, and each group below links the exported names to the contract that governs them.

### Shared runtime support

- Stability: Supported Experimental root-package support; governed by [Compatibility Policy](../spec/compatibility.md).
- Runtime exports: `DomainError`, `DomainErrorCode`, `canonicalizeJson`
- Type exports: `JsonArray`, `JsonObject`, `JsonPrimitive`, `JsonValue`

### SourceRecord Ingestion

- Stability: Supported Experimental root-package support for a Normative Stable SourceRecord contract; governed by [RFC 0001: Universal SourceRecord Ingestion](../rfcs/0001-universal-source-record-ingestion.md), [SourceRecord](../spec/source-record.md), and [Compatibility Policy](../spec/compatibility.md).
- Runtime exports: `SOURCE_RECORD_MAX_JSON_DEPTH`, `SOURCE_RECORD_SCHEMA_VERSION`, `createSourceRecord`, `deserializeSourceRecord`, `ingestSourceRecordText`, `ingestSourceRecords`, `serializeSourceRecord`, `sourceRevisionKey`, `validateSourceRecord`
- Type exports: `CreateSourceRecordInput`, `IngestionBatchResult`, `IngestionItemResult`, `IngestionMode`, `IngestionOptions`, `IngestionTextOptions`, `SourceRecord`, `SourceRecordSource`

### Promotion

- Stability: Supported Experimental only. The related Normative Stable Portable Cognition serialized envelope is documented separately; promotion semantics remain Supported Experimental. Governed by [RFC 0003: Portable Cognition Contract](../rfcs/0003-portable-cognition-contract.md), [Portable Cognition](../spec/portable-cognition.md), and [Compatibility Policy](../spec/compatibility.md).
- Runtime exports: `ingestAndPromoteEvidence`, `neutralEvidencePolicyV1`, `promoteSourceRecordsToEvidence`
- Type exports: `EvidencePromotionContext`, `EvidencePromotionMapping`, `EvidencePromotionPolicy`, `EvidencePromotionRequest`, `EvidencePromotionResult`, `IngestAndPromoteEvidenceResult`, `PromotionFailure`

### Cognitive Objects

- Stability: the root cognitive-object API is Supported Experimental. The Portable Cognition `0.1.0` serialized envelope is Normative Stable; type-specific cognitive-object semantics and additional schemas remain open. Governed by [RFC 0003: Portable Cognition Contract](../rfcs/0003-portable-cognition-contract.md), [Portable Cognition](../spec/portable-cognition.md), and [Compatibility Policy](../spec/compatibility.md).
- Runtime exports: `createObject`, `deserializeObject`, `serializeObject`
- Type exports: `ActorKind`, `Attribution`, `CognitiveObject`, `CognitiveObjectFor`, `CreateObjectInput`, `CreateObjectInputFor`, `DataByType`, `DecisionData`, `DecisionState`, `EvidenceData`, `EvidenceState`, `ExperimentData`, `ExperimentState`, `GoalData`, `GoalState`, `HypothesisData`, `HypothesisState`, `IdentityData`, `IdentityState`, `ObjectType`, `PrincipleData`, `PrincipleState`, `ProvenanceRef`, `Relationship`, `RelationshipType`, `StateByType`

### Portable Cognition

- Stability: Supported Experimental root-package support for a Normative Stable serialized envelope; governed by [Portable Cognition](../spec/portable-cognition.md) and [Compatibility Policy](../spec/compatibility.md).
- Runtime exports: `PORTABLE_COGNITION_MAX_JSON_DEPTH`, `PORTABLE_COGNITION_SCHEMA_VERSION`, `createPortableCognitionRecord`, `deserializePortableCognitionRecord`, `serializePortableCognitionRecord`, `validatePortableCognitionRecord`
- Type exports: `CreatePortableCognitionRecordInput`, `PortableCognitionPayloadByType`, `PortableCognitionRecord`, `PortableCognitionRecordType`, `PortableDomainError`

### Standalone Cognition Projections

- Stability: Supported Experimental root-package reference wrappers for Normative Stable cognitive-object and cognition-event resource projections `0.1.0`; governed by [Collective Cognition Charter `1.0.0`](../spec/collective-cognition-charter.md), [Portable Cognition](../spec/portable-cognition.md), [RFC 0012](../rfcs/0012-phase-3-charter-and-stable-package.md), and [Compatibility Policy](../spec/compatibility.md).
- Runtime exports: `COGNITIVE_OBJECT_PROJECTION_VERSION`, `COGNITION_EVENT_PROJECTION_VERSION`, `COGNITION_PROJECTION_MAX_JSON_DEPTH`, `deserializeCognitiveObjectProjection`, `deserializeCognitionEventProjection`, `validateCognitiveObjectProjection`, `validateCognitionEventProjection`
- Type exports: none.
- Boundary: the wrappers delegate to the immutable Portable Cognition `0.1.0` runtime. Malformed JSON reports `SERIALIZATION_ERROR`; invalid structure, depth, or semantics reports `INVALID_PORTABLE_COGNITION_RECORD`. Standalone payload depth is at most `255` containers.

### Authorization and Transitions

- Stability: Supported Experimental only. Related Normative Stable Portable Cognition and Host Integration envelopes are documented separately; authorization and transition semantics remain Supported Experimental. Governed by [Portable Cognition](../spec/portable-cognition.md), [Host Integration](../spec/host-integration.md), and [Compatibility Policy](../spec/compatibility.md).
- Runtime exports: `evaluateAuthorization`, `transitionObject`
- Type exports: `AuthorizationDecision`, `AuthorizationPolicy`, `AutomationMode`, `ConsequenceLevel`, `HumanConfirmation`, `TransitionActor`, `TransitionContext`, `TransitionResult`

### Host Integration

- Stability: Supported Experimental root-package support for a Normative Stable host contract; governed by [Host Integration](../spec/host-integration.md), [RFC 0004: Host Integration Contract](../rfcs/0004-host-integration-contract.md), [Runtime and Security Profile](../spec/runtime-security.md), and [Compatibility Policy](../spec/compatibility.md).
- Runtime exports: `HOST_INTEGRATION_CONTRACT_VERSION`, `HostFailureCode`, `commitCognitionTransition`, `commitInitialCognition`
- Type exports: `CognitionEvent`, `CognitionEventPublisher`, `CognitionHost`, `CognitionPersistenceStatus`, `CognitionPublicationStatus`, `CognitionStore`, `CognitionStoreCommitResult`, `HostConflict`, `HostConflictCode`, `HostFailure`, `InitialCognitionCommit`, `InitialCommitOutcome`, `PortableCognitionEventRecord`, `PortableCognitiveObjectRecord`, `TransitionCognitionCommit`, `TransitionCommitOutcome`

## Package Subpaths

### Normative Stable subpaths

- `./compatibility/0.1.0` — Compatibility baseline for package `0.1.0`.
- `./compatibility/0.2.0` — Compatibility baseline for package `0.2.0`.
- `./compatibility/0.3.0` — Compatibility baseline for package `0.3.0`.
- `./compatibility/0.4.0` — Compatibility baseline for package `0.4.0`.
- `./compatibility/0.5.0` — Compatibility baseline for package `0.5.0`.
- `./compatibility/0.6.0` — Compatibility baseline for package `0.6.0`.
- `./compatibility/0.7.0` — Compatibility baseline for package `0.7.0`.
- `./compatibility/0.8.0` — Compatibility baseline for package `0.8.0`.
- `./compatibility/0.9.0` — Compatibility baseline for package `0.9.0`.
- `./compatibility/0.10.0` — Compatibility baseline for package `0.10.0`.
- `./compatibility/0.11.0` — Compatibility baseline for private package `0.11.0`.
- `./charter/1.0.0` — Collective Cognition Charter `1.0.0` UTF-8 prose.
- `./schemas/cognitive-object/0.1.0` — Standalone cognitive-object JSON Schema projection.
- `./schemas/cognition-event/0.1.0` — Standalone cognition-event JSON Schema projection.
- `./conformance/cognitive-object/0.1.0/valid` — Standalone cognitive-object valid JSONL fixtures.
- `./conformance/cognitive-object/0.1.0/invalid` — Standalone cognitive-object invalid JSONL fixtures.
- `./conformance/cognition-event/0.1.0/valid` — Standalone cognition-event valid JSONL fixtures.
- `./conformance/cognition-event/0.1.0/invalid` — Standalone cognition-event invalid JSONL fixtures.
- `./conformance/cognition-event/0.1.0/lifecycle` — Linked cognition-event lifecycle JSONL fixtures.
- `./contracts/host-integration/0.1.0` — Host integration prose contract.
- `./conformance/portable-cognition/0.1.0/valid` — Portable Cognition valid conformance corpus.
- `./conformance/portable-cognition/0.1.0/invalid` — Portable Cognition invalid conformance corpus.
- `./conformance/portable-cognition/0.1.0/cognitive-loop` — Portable Cognition cognitive-loop conformance corpus.
- `./distribution-readiness/0.1.0` — Distribution Readiness Profile JSON inventory.
- `./runtime-security/0.1.0` — Runtime and Security Profile JSON inventory.
- `./interoperability/0.1.0/profile` — Cross-Connector Interoperability Profile JSON.
- `./interoperability/0.1.0/source-records` — SourceRecord JSONL fixtures.
- `./interoperability/0.1.0/portable-cognition` — Portable Cognition JSONL fixtures.
- `./interoperability/0.1.0/errors` — Interoperability error-case JSONL fixtures.
- `./schemas/source-record/0.1.0` — SourceRecord JSON Schema.
- `./schemas/portable-cognition/0.1.0` — Portable Cognition JSON Schema.

### Supported Experimental subpaths

- `.` — Root package export for `collective-cognition-sdk`.
- `./adapters/markdown/0.1.0` — Markdown cognition adapter.
  - Stability: Supported Experimental adapter surface; governed by [docs/markdown-cognition-adapter-guide](../docs/markdown-cognition-adapter-guide.md), [RFC 0007: Markdown Cognition Adapter](../rfcs/0007-markdown-cognition-adapter.md), and [Compatibility Policy](../spec/compatibility.md).
  - Runtime exports: `MARKDOWN_COGNITION_MANIFEST_FILE`, `MARKDOWN_COGNITION_MARKER_FILE`, `MARKDOWN_COGNITION_MAX_INPUT_BYTES`, `MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES`, `MARKDOWN_COGNITION_MAX_NOTE_BYTES`, `MARKDOWN_COGNITION_MAX_OBJECT_VERSION`, `MARKDOWN_COGNITION_MAX_PATH_SEGMENTS`, `MARKDOWN_COGNITION_MAX_RECORDS`, `MARKDOWN_COGNITION_MAX_RELATIVE_PATH_BYTES`, `MARKDOWN_COGNITION_MAX_TOTAL_BYTES`, `MARKDOWN_COGNITION_PROFILE_VERSION`, `MARKDOWN_COGNITION_TARGET_FORMAT`, `MarkdownCognitionError`, `initializeMarkdownCognitionTarget`, `markdownCognitionRelativePath`, `parseMarkdownCognitionRecord`, `projectMarkdownCognition`, `renderMarkdownCognitionIndex`, `renderMarkdownCognitionRecord`, `verifyMarkdownCognitionTarget`
  - Type exports: `MarkdownCognitionErrorCode`, `MarkdownCognitionProjectionOptions`, `MarkdownCognitionProjectionReport`, `MarkdownCognitionRecord`, `MarkdownCognitionRenderContext`, `MarkdownCognitionTargetOptions`, `MarkdownCognitionVerificationDiagnostic`, `MarkdownCognitionVerificationReport`
- `./connector-conformance/0.1.0` — Source connector conformance checks.
  - Stability: Supported Experimental connector-conformance surface; governed by [RFC 0006: Maintained Source Connectors](../rfcs/0006-maintained-source-connectors.md) and [Compatibility Policy](../spec/compatibility.md).
  - Runtime exports: `runSourceConnectorConformance`
  - Type exports: `SourceConnectorConformanceCase`, `SourceConnectorConformanceDiagnostic`, `SourceConnectorConformanceDiagnosticCode`, `SourceConnectorConformanceResult`
- `./connectors/team-memory/0.1.0` — Maintained team-memory connector.
  - Stability: Supported Experimental connector surface; governed by [docs/connector-author-guide](../docs/connector-author-guide.md), [RFC 0006: Maintained Source Connectors](../rfcs/0006-maintained-source-connectors.md), and [Compatibility Policy](../spec/compatibility.md).
  - Runtime exports: `TEAM_MEMORY_LEDGER_FORMAT`, `TeamMemoryConnectorError`, `readTeamMemorySourceRecords`
  - Type exports: `TeamMemoryConnectorErrorCode`, `TeamMemorySourceRecordOptions`
- `./connectors/git/0.1.0` — Maintained explicit local Git repository connector.
  - Stability: Supported Experimental connector surface; governed by the [Git Connector Guide](git-connector-guide.md), [Interoperability Profile `0.1.0`](../spec/interoperability.md), [RFC 0011](../rfcs/0011-cross-connector-interoperability.md), and [Compatibility Policy](../spec/compatibility.md).
  - Runtime exports: `GIT_REPOSITORY_FORMAT`, `GitConnectorError`, `readGitCommitSourceRecords`
  - Type exports: `GitCommitSourceRecordOptions`, `GitConnectorErrorCode`, `GitConnectorStage`
  - Requirements: an explicit absolute local repository path and an available local Git executable. Collection is read-only, follows first-parent history from the exact tip, and keeps full messages and author email behind privacy defaults that are disabled unless explicitly opted in.

```ts
import {
  readGitCommitSourceRecords,
} from "collective-cognition-sdk/connectors/git/0.1.0";

const records = readGitCommitSourceRecords({
  repositoryPath: "/absolute/path/to/fictional-repository",
  sourceInstance: "fictional-local-repository",
  tipCommitId: "0123456789abcdef0123456789abcdef01234567",
  capturedAt: "2026-08-21T12:00:00.000Z",
  limit: 25,
});
```

Interoperability resources are UTF-8 file resources, not JavaScript modules.
Resolve and read them explicitly:

```ts
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const sourceRecordsUrl = import.meta.resolve(
  "collective-cognition-sdk/interoperability/0.1.0/source-records",
);
const sourceRecordsJsonl = readFileSync(
  fileURLToPath(sourceRecordsUrl),
  "utf8",
);
```

The Charter, standalone schemas, and conformance corpora use the same explicit
file-resource pattern. For example:

```ts
import { readFile } from "node:fs/promises";

const lifecycleUrl = import.meta.resolve(
  "collective-cognition-sdk/conformance/cognition-event/0.1.0/lifecycle",
);
const lifecycleJsonl = await readFile(new URL(lifecycleUrl), "utf8");
```

`collective-cognition-sdk-maintainers` owns the profile fixtures, tests,
report, and compatibility inventory. Package `0.10.0` introduced two maintained
connectors but no Git CLI, connector registry, plugin discovery or runtime,
network connector, scheduler, or automatic cognition. The package remains
unchanged in current private package `0.11.0`; the profile does not claim
production readiness, broad adoption, certification, endorsement, or LTS support.
- `./host-conformance/0.1.0` — Host conformance checks.
  - Stability: Supported Experimental host-conformance surface; governed by [Host Integration](../spec/host-integration.md), [RFC 0004: Host Integration Contract](../rfcs/0004-host-integration-contract.md), and [Compatibility Policy](../spec/compatibility.md).
  - Runtime exports: `runCognitionHostConformance`
  - Type exports: `CognitionHostConformanceCaseResult`, `CognitionHostConformanceFactory`, `CognitionHostConformanceReport`
- `./reference-host/0.1.0` — Reference host implementation.
  - Stability: Supported Experimental reference-host surface; governed by [Host Integration](../spec/host-integration.md), [RFC 0004: Host Integration Contract](../rfcs/0004-host-integration-contract.md), and [Compatibility Policy](../spec/compatibility.md).
  - Runtime exports: `InMemoryCognitionEventPublisher`, `InMemoryCognitionStore`
  - Type exports: none.
- `./stores/sqlite/0.1.0` — SQLite cognition-store adapter.
  - Stability: Supported Experimental store surface; governed by [RFC 0005: SQLite Cognition Store](../rfcs/0005-sqlite-cognition-store.md), [Host Integration](../spec/host-integration.md), and [Compatibility Policy](../spec/compatibility.md).
  - Runtime exports: `SqliteCognitionStore`
  - Type exports: `SqliteCognitionStoreOptions`
- `./stores/sqlite-workflow/0.1.0` — SQLite durable workflow-store adapter.
  - Stability: Supported Experimental Node-specific store surface; governed by [RFC 0010: Durable Cognition Workflow](../rfcs/0010-durable-cognition-workflow.md), [Durable Cognition Workflow Guide](durable-cognition-workflow-guide.md), and [Compatibility Policy](../spec/compatibility.md).
  - Runtime exports: `SqliteCognitionWorkflowStore`
  - Type exports: `SqliteCognitionWorkflowStoreOptions`
- `./workflows/durable/0.1.0` — Source-neutral durable Evidence-review workflow.
  - Stability: Supported Experimental workflow surface; governed by [RFC 0010: Durable Cognition Workflow](../rfcs/0010-durable-cognition-workflow.md), [Durable Cognition Workflow Guide](durable-cognition-workflow-guide.md), and [Compatibility Policy](../spec/compatibility.md).
  - Runtime exports: `DURABLE_COGNITION_WORKFLOW_VERSION`, `prepareDurableCognitionWorkflow`, `runDurableCognitionWorkflow`, `runDurableWorkflowStoreConformance`
  - Type exports: `CognitionWorkflowStore`, `DurableCognitionCommitResult`, `DurableCognitionProjectionStatus`, `DurableCognitionProjector`, `DurableCognitionPublicationStatus`, `DurableCognitionWorkflowCommitted`, `DurableCognitionWorkflowCompletion`, `DurableCognitionWorkflowConflict`, `DurableCognitionWorkflowFailure`, `DurableCognitionWorkflowHost`, `DurableCognitionWorkflowRequest`, `DurableCognitionWorkflowResult`, `DurableCognitionWorkflowUnprojected`, `DurableCognitionWorkflowUnpublished`, `DurableCognitionWorkflowUnpublishedAndUnprojected`, `DurableWorkflowConflictCode`, `DurableWorkflowConformanceCaseResult`, `DurableWorkflowConformanceReport`, `DurableWorkflowStoreConformanceScenario`, `DurableWorkflowStoreFactory`, `PreparedDurableCognitionCommit`
- `./package.json` — Package manifest export for introspection only.

## Executables

- `collective-cognition` — Supported Experimental root CLI for validate, ingest, promote, and ingest-promote operations; governed by [README](../README.md) and [Compatibility Policy](../spec/compatibility.md).
- `collective-cognition-teammem` — Supported Experimental team-memory export CLI; governed by [docs/connector-author-guide](../docs/connector-author-guide.md) and [RFC 0006: Maintained Source Connectors](../rfcs/0006-maintained-source-connectors.md).
- `collective-cognition-markdown` — Supported Experimental Markdown cognition projection CLI; governed by [docs/markdown-cognition-adapter-guide](../docs/markdown-cognition-adapter-guide.md) and [RFC 0007: Markdown Cognition Adapter](../rfcs/0007-markdown-cognition-adapter.md).
- `collective-cognition-workflow` — Supported Experimental closed durable workflow CLI; governed by the [Durable Cognition Workflow Guide](durable-cognition-workflow-guide.md) and [RFC 0010: Durable Cognition Workflow](../rfcs/0010-durable-cognition-workflow.md). It has no publisher option.

## Error Catalogs

The root catalog and the Portable Cognition allowlist are separate. Root
`DomainErrorCode` has twelve values. The immutable Portable Cognition `0.1.0`
allowlist has eleven; `INVALID_HOST_INTEGRATION_REQUEST` is root-only and never
appears in a portable record.

| Code | Root `DomainErrorCode` | Portable Cognition `0.1.0` |
| --- | --- | --- |
| `AUTHORIZATION_DENIED` | yes | yes |
| `CONFIRMATION_REQUIRED` | yes | yes |
| `INGESTION_LIMIT_EXCEEDED` | yes | yes |
| `INVALID_HOST_INTEGRATION_REQUEST` | yes | no |
| `INVALID_OBJECT` | yes | yes |
| `INVALID_PORTABLE_COGNITION_RECORD` | yes | yes |
| `INVALID_RELATIONSHIP` | yes | yes |
| `INVALID_SOURCE_RECORD` | yes | yes |
| `INVALID_TRANSITION` | yes | yes |
| `PROMOTION_FAILED` | yes | yes |
| `SERIALIZATION_ERROR` | yes | yes |
| `SOURCE_REVISION_COLLISION` | yes | yes |

`INVALID_HOST_INTEGRATION_REQUEST`, `INVALID_PORTABLE_COGNITION_RECORD`,
`INVALID_SOURCE_RECORD`, and `SOURCE_REVISION_COLLISION` are the Normative
Stable contract error codes.

## Selected Package Fields

`./package.json` is exported for introspection only. The compatibility baseline
records these `package.json` fields exactly, and they are the fields the
compatibility policy covers.

| Field | Recorded value or shape |
| --- | --- |
| `name` | `collective-cognition-sdk` |
| `version` | The installable package version, currently `0.11.0`. |
| `private` | `true` while the package is unpublished. |
| `type` | `module` |
| `main` | `./dist/index.js` |
| `types` | `./dist/index.d.ts` |
| `license` | `Apache-2.0` |
| `engines` | `{ "node": ">=24" }` |
| `exports` | Every declared subpath and its condition targets. |
| `bin` | The four installed executable names and their targets. |
| `productionDependencyFields` | The production dependency fields present in the manifest; currently none. |

## Stable `1.0.0` Classification

Package `0.11.0` is governed by `packagePolicyVersion` `0.1.0`, so the labels in
the sections above are its pre-`1.0.0` maturity labels. Policy `1.0.0` of the
[Compatibility Policy](../spec/compatibility.md) publishes the classification
that applies from compatibility baseline `1.0.0-rc.1` onward, and its `STAB-002`
classification names every surface individually. The groups are:

| Surface group | `1.0.0` classification |
| --- | --- |
| The thirty-seven root runtime exports and seventy-four root type exports above | Stable Public API |
| The twelve root `DomainErrorCode` values | Stable Public API |
| The `.` root export | Stable Public API |
| `collective-cognition` | Stable Public API |
| The thirty-one versioned normative resource subpaths above | Normative Stable |
| `./adapters/markdown/0.1.0`, `./connector-conformance/0.1.0`, `./connectors/team-memory/0.1.0`, `./connectors/git/0.1.0`, `./host-conformance/0.1.0`, `./reference-host/0.1.0`, `./stores/sqlite/0.1.0`, `./stores/sqlite-workflow/0.1.0`, `./workflows/durable/0.1.0` | Supported Experimental maturity, SemVer protected |
| `collective-cognition-teammem`, `collective-cognition-markdown`, `collective-cognition-workflow` | Supported Experimental maturity, SemVer protected |
| `./package.json` and the selected package fields above | Stable introspection surface |
| Repository source, tests, examples, generated file paths, and unexported modules | Internal |

Under policy `1.0.0`, Supported Experimental is an operational-maturity label
that is SemVer protected. It does not certify host dependencies, behavior, or
production suitability, and it is not permission to break a package `1.x`
consumer. An incompatible change to a root export, to the generic executable, or
to an existing versioned subpath requires package `2.0.0` or a new retained
versioned subpath.

This classification takes effect when a baseline records
`packagePolicyVersion` `1.0.0`. It does not promote any `0.11.0` surface today,
authorize an npm publication, or claim production readiness. See
[Migrating from package `0.11.0` to `1.0.0`](migrations/1.0.0.md).

## Not Public API

- `src/` implementation files are internal, including adapter, connector, and store source files that are not exported through `exports`.
- `tests/` files are internal verification code and are not import contracts.
- `examples/` files are repository examples, not package API.
- `docs/superpowers/plans/` files are planning artifacts, not package API.
- generated `dist/` file paths are build outputs, not source-of-truth import contracts.
- any source path absent from `exports` is internal, including unexported adapter and connector implementation paths under `src/`.
- The package tarball contains no `sqlite-internal` JavaScript or declaration file. The historical SQLite store and the SQLite workflow store are self-contained modules with independent declaration closures.
