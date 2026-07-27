export { DomainError, DomainErrorCode } from "./errors.ts";
export {
  canonicalizeJson,
  createSourceRecord,
  deserializeSourceRecord,
  serializeSourceRecord,
  sourceRevisionKey,
  SOURCE_RECORD_MAX_JSON_DEPTH,
  SOURCE_RECORD_SCHEMA_VERSION,
  validateSourceRecord,
} from "./source-records.ts";
export {
  ingestSourceRecordText,
  ingestSourceRecords,
} from "./ingestion.ts";
export {
  ingestAndPromoteEvidence,
  neutralEvidencePolicyV1,
  promoteSourceRecordsToEvidence,
} from "./promotion.ts";
export {
  createObject,
  deserializeObject,
  serializeObject,
} from "./objects.ts";
export {
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  PORTABLE_COGNITION_MAX_JSON_DEPTH,
  PORTABLE_COGNITION_SCHEMA_VERSION,
  serializePortableCognitionRecord,
  validatePortableCognitionRecord,
} from "./portable-cognition.ts";
export { evaluateAuthorization } from "./authorization.ts";
export { transitionObject } from "./transitions.ts";
export type {
  ActorKind,
  Attribution,
  CognitiveObject,
  CognitiveObjectFor,
  CreateObjectInput,
  CreateObjectInputFor,
  DataByType,
  DecisionData,
  DecisionState,
  EvidenceData,
  EvidenceState,
  ExperimentData,
  ExperimentState,
  GoalData,
  GoalState,
  HypothesisData,
  HypothesisState,
  IdentityData,
  IdentityState,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  ObjectType,
  PrincipleData,
  PrincipleState,
  ProvenanceRef,
  Relationship,
  RelationshipType,
  StateByType,
} from "./types.ts";
export type {
  CreateSourceRecordInput,
  SourceRecord,
  SourceRecordSource,
} from "./source-records.ts";
export type {
  IngestionBatchResult,
  IngestionItemResult,
  IngestionMode,
  IngestionOptions,
  IngestionTextOptions,
} from "./ingestion.ts";
export type {
  EvidencePromotionContext,
  EvidencePromotionMapping,
  EvidencePromotionPolicy,
  EvidencePromotionRequest,
  EvidencePromotionResult,
  IngestAndPromoteEvidenceResult,
  PromotionFailure,
} from "./promotion.ts";
export type {
  AuthorizationDecision,
  AuthorizationPolicy,
  AutomationMode,
  ConsequenceLevel,
  HumanConfirmation,
  TransitionActor,
  TransitionContext,
} from "./authorization.ts";
export type { CognitionEvent } from "./events.ts";
export type {
  CreatePortableCognitionRecordInput,
  PortableCognitionPayloadByType,
  PortableCognitionRecord,
  PortableCognitionRecordType,
  PortableDomainError,
} from "./portable-cognition.ts";
export type { TransitionResult } from "./transitions.ts";
