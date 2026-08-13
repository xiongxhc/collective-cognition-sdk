import type { TransitionContext } from "../authorization.ts";
import type {
  CognitionEventPublisher,
  CognitionPersistenceStatus,
  CognitionStore,
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
} from "../host-integration.ts";
import type { IngestionOptions } from "../ingestion.ts";
import type { MarkdownCognitionRecord } from "../markdown-cognition.ts";
import type { EvidencePromotionContext, EvidencePromotionPolicy } from "../promotion.ts";
import type { SourceRecord } from "../source-records.ts";
import type { CognitiveObject } from "../types.ts";

export const DURABLE_COGNITION_WORKFLOW_VERSION = "0.1.0";

export interface DurableCognitionWorkflowRequest {
  readonly workflowVersion: "0.1.0";
  readonly workflowId: string;
  readonly records: readonly SourceRecord[];
  readonly hypothesis: CognitiveObject<"hypothesis">;
  readonly promotion: EvidencePromotionContext;
  readonly reviewTransition: TransitionContext;
  readonly policy: EvidencePromotionPolicy;
}

export interface PreparedDurableCognitionCommit {
  readonly workflowId: string;
  readonly requestDigest: string;
  readonly initialHypothesis: PortableCognitiveObjectRecord;
  readonly evidence: PortableCognitiveObjectRecord;
  readonly expectedHypothesisVersion: 1;
  readonly reviewedHypothesis: PortableCognitiveObjectRecord;
  readonly event: PortableCognitionEventRecord;
}

export type DurableWorkflowConflictCode =
  | "workflow_id_collision"
  | "object_revision_collision"
  | "event_id_collision"
  | "version_conflict"
  | "incomplete_workflow";

export type DurableCognitionCommitResult =
  | { readonly status: "committed" | "already_committed" }
  | {
      readonly status: "conflict";
      readonly conflict: {
        readonly code: DurableWorkflowConflictCode;
        readonly workflowId: string;
      };
    };

export interface CognitionWorkflowStore extends CognitionStore {
  commitWorkflow(
    request: PreparedDurableCognitionCommit,
  ): Promise<DurableCognitionCommitResult>;
}

export interface DurableCognitionProjector {
  project(
    records: readonly MarkdownCognitionRecord[],
  ): Promise<"projected" | "unchanged">;
}

export interface DurableCognitionWorkflowHost {
  readonly store: CognitionWorkflowStore;
  readonly publisher?: CognitionEventPublisher;
  readonly projector?: DurableCognitionProjector;
}

export type DurableCognitionPublicationStatus =
  | "not_requested"
  | "published"
  | "already_published"
  | "failed";

export type DurableCognitionProjectionStatus =
  | "not_requested"
  | "projected"
  | "unchanged"
  | "failed";

type DurableCognitionWorkflowBase = {
  readonly persistence: CognitionPersistenceStatus;
  readonly workflowId: string;
  readonly requestDigest: string;
  readonly records: readonly MarkdownCognitionRecord[];
};

export interface DurableCognitionWorkflowCommitted
  extends DurableCognitionWorkflowBase {
  readonly status: "committed";
  readonly publication: Exclude<DurableCognitionPublicationStatus, "failed">;
  readonly projection: Exclude<DurableCognitionProjectionStatus, "failed">;
}

export interface DurableCognitionWorkflowUnpublished
  extends DurableCognitionWorkflowBase {
  readonly status: "committed_but_unpublished";
  readonly publication: "failed";
  readonly projection: Exclude<DurableCognitionProjectionStatus, "failed">;
}

export interface DurableCognitionWorkflowUnprojected
  extends DurableCognitionWorkflowBase {
  readonly status: "committed_but_unprojected";
  readonly publication: Exclude<DurableCognitionPublicationStatus, "failed">;
  readonly projection: "failed";
}

export interface DurableCognitionWorkflowUnpublishedAndUnprojected
  extends DurableCognitionWorkflowBase {
  readonly status: "committed_but_unpublished_and_unprojected";
  readonly publication: "failed";
  readonly projection: "failed";
}

export type DurableCognitionWorkflowCompletion =
  | DurableCognitionWorkflowCommitted
  | DurableCognitionWorkflowUnpublished
  | DurableCognitionWorkflowUnprojected
  | DurableCognitionWorkflowUnpublishedAndUnprojected;

export interface DurableCognitionWorkflowConflict {
  readonly status: "conflict";
  readonly conflict: {
    readonly code: DurableWorkflowConflictCode;
    readonly workflowId: string;
  };
}

export interface DurableCognitionWorkflowFailure {
  readonly status: "failed";
  readonly error: {
    readonly code: "DURABLE_WORKFLOW_FAILED";
    readonly message: "Durable workflow failed.";
  };
}

export type DurableCognitionWorkflowResult =
  | DurableCognitionWorkflowCompletion
  | DurableCognitionWorkflowConflict
  | DurableCognitionWorkflowFailure;

export interface DurableWorkflowConformanceCaseResult {
  readonly id: string;
  readonly status: "passed" | "failed";
  readonly message?: "Durable workflow conformance case failed.";
}

export interface DurableWorkflowConformanceReport {
  readonly contractVersion: "0.1.0";
  readonly passed: boolean;
  readonly cases: readonly DurableWorkflowConformanceCaseResult[];
}

export type DurableWorkflowStoreFactory =
  () => Promise<CognitionWorkflowStore> | CognitionWorkflowStore;

export interface DurableWorkflowStoreConformanceScenario {
  readonly kind: "version-conflict" | "rollback";
  readonly workflow: PreparedDurableCognitionCommit;
}

export interface DurableWorkflowStoreConformanceFactory {
  readonly createStore: DurableWorkflowStoreFactory;
  readonly configureStore?: (
    store: CognitionWorkflowStore,
    scenario: DurableWorkflowStoreConformanceScenario,
  ) => Promise<void> | void;
}

export const durableWorkflowRequestFields = new Set([
  "workflowVersion",
  "workflowId",
  "records",
  "hypothesis",
  "promotion",
  "reviewTransition",
  "policy",
]);

export const durableWorkflowPolicyFields = new Set(["id", "version", "map"]);

export const durableWorkflowIngestionOptionFields = new Set([
  "existingRecords",
  "maxRecords",
  "maxRecordBytes",
  "mode",
]);
