import type { TransitionContext } from "../authorization.ts";
import type {
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
} from "../host-integration.ts";
import type { IngestionOptions } from "../ingestion.ts";
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
