# Public API Reference

This reference is checked against the compatibility baseline selected by the current `package.json` version. It names every exported surface that the package promises to keep visible.

## Stability

- `Normative Stable` means a versioned contract or immutable policy artifact that downstream code may rely on across compatible releases.
- `Supported Experimental` means a public package entrypoint or executable that is exported and tested but can still change before `1.0.0`.
- `Internal` means a repository path that does not appear in `exports` and has no package compatibility promise.
- Supported Experimental is not Normative Stable.
- source paths absent from `exports` are internal.

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

- Stability: Supported Experimental root-package support for a Normative Stable promotion contract; governed by [RFC 0003: Portable Cognition Contract](../rfcs/0003-portable-cognition-contract.md), [Portable Cognition](../spec/portable-cognition.md), and [Compatibility Policy](../spec/compatibility.md).
- Runtime exports: `ingestAndPromoteEvidence`, `neutralEvidencePolicyV1`, `promoteSourceRecordsToEvidence`
- Type exports: `EvidencePromotionContext`, `EvidencePromotionMapping`, `EvidencePromotionPolicy`, `EvidencePromotionRequest`, `EvidencePromotionResult`, `IngestAndPromoteEvidenceResult`, `PromotionFailure`

### Cognitive Objects

- Stability: Supported Experimental root-package support for a Normative Stable object model; governed by [RFC 0003: Portable Cognition Contract](../rfcs/0003-portable-cognition-contract.md), [Portable Cognition](../spec/portable-cognition.md), and [Compatibility Policy](../spec/compatibility.md).
- Runtime exports: `createObject`, `deserializeObject`, `serializeObject`
- Type exports: `ActorKind`, `Attribution`, `CognitiveObject`, `CognitiveObjectFor`, `CreateObjectInput`, `CreateObjectInputFor`, `DataByType`, `DecisionData`, `DecisionState`, `EvidenceData`, `EvidenceState`, `ExperimentData`, `ExperimentState`, `GoalData`, `GoalState`, `HypothesisData`, `HypothesisState`, `IdentityData`, `IdentityState`, `ObjectType`, `PrincipleData`, `PrincipleState`, `ProvenanceRef`, `Relationship`, `RelationshipType`, `StateByType`

### Portable Cognition

- Stability: Supported Experimental root-package support for a Normative Stable serialized envelope; governed by [Portable Cognition](../spec/portable-cognition.md) and [Compatibility Policy](../spec/compatibility.md).
- Runtime exports: `PORTABLE_COGNITION_MAX_JSON_DEPTH`, `PORTABLE_COGNITION_SCHEMA_VERSION`, `createPortableCognitionRecord`, `deserializePortableCognitionRecord`, `serializePortableCognitionRecord`, `validatePortableCognitionRecord`
- Type exports: `CreatePortableCognitionRecordInput`, `PortableCognitionPayloadByType`, `PortableCognitionRecord`, `PortableCognitionRecordType`, `PortableDomainError`

### Authorization and Transitions

- Stability: Supported Experimental root-package support for a Normative Stable authorization and transition contract; governed by [Portable Cognition](../spec/portable-cognition.md), [Host Integration](../spec/host-integration.md), and [Compatibility Policy](../spec/compatibility.md).
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
- `./contracts/host-integration/0.1.0` — Host integration prose contract.
- `./conformance/portable-cognition/0.1.0/valid` — Portable Cognition valid conformance corpus.
- `./conformance/portable-cognition/0.1.0/invalid` — Portable Cognition invalid conformance corpus.
- `./conformance/portable-cognition/0.1.0/cognitive-loop` — Portable Cognition cognitive-loop conformance corpus.
- `./distribution-readiness/0.1.0` — Distribution Readiness Profile JSON inventory.
- `./runtime-security/0.1.0` — Runtime and Security Profile JSON inventory.
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
- `./host-conformance/0.1.0` — Host conformance checks.
- `./reference-host/0.1.0` — Reference host implementation.
- `./stores/sqlite/0.1.0` — SQLite cognition-store adapter.
- `./package.json` — Package manifest export for introspection only.

## Executables

- `collective-cognition` — Supported Experimental root CLI for validate, ingest, promote, and ingest-promote operations; governed by [README](../README.md) and [Compatibility Policy](../spec/compatibility.md).
- `collective-cognition-teammem` — Supported Experimental team-memory export CLI; governed by [docs/connector-author-guide](../docs/connector-author-guide.md) and [RFC 0006: Maintained Source Connectors](../rfcs/0006-maintained-source-connectors.md).
- `collective-cognition-markdown` — Supported Experimental Markdown cognition projection CLI; governed by [docs/markdown-cognition-adapter-guide](../docs/markdown-cognition-adapter-guide.md) and [RFC 0007: Markdown Cognition Adapter](../rfcs/0007-markdown-cognition-adapter.md).

## Not Public API

- `src/` implementation files are internal, including adapter, connector, and store source files that are not exported through `exports`.
- `tests/` files are internal verification code and are not import contracts.
- `examples/` files are repository examples, not package API.
- `docs/superpowers/plans/` files are planning artifacts, not package API.
- generated `dist/` file paths are build outputs, not source-of-truth import contracts.
- any source path absent from `exports` is internal, including unexported adapter and connector implementation paths under `src/`.
