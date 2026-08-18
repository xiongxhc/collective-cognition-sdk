import {
  cloneJsonObject,
  freezeJsonValue,
  isJsonObject,
} from "./types.ts";
import type { JsonObject } from "./types.ts";

export const DomainErrorCode = {
  INVALID_OBJECT: "INVALID_OBJECT",
  INVALID_SOURCE_RECORD: "INVALID_SOURCE_RECORD",
  INVALID_RELATIONSHIP: "INVALID_RELATIONSHIP",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  CONFIRMATION_REQUIRED: "CONFIRMATION_REQUIRED",
  AUTHORIZATION_DENIED: "AUTHORIZATION_DENIED",
  SERIALIZATION_ERROR: "SERIALIZATION_ERROR",
  SOURCE_REVISION_COLLISION: "SOURCE_REVISION_COLLISION",
  INGESTION_LIMIT_EXCEEDED: "INGESTION_LIMIT_EXCEEDED",
  PROMOTION_FAILED: "PROMOTION_FAILED",
  INVALID_PORTABLE_COGNITION_RECORD: "INVALID_PORTABLE_COGNITION_RECORD",
  INVALID_HOST_INTEGRATION_REQUEST: "INVALID_HOST_INTEGRATION_REQUEST",
} as const;

export type DomainErrorCode =
  (typeof DomainErrorCode)[keyof typeof DomainErrorCode];

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: JsonObject;

  constructor(
    code: DomainErrorCode,
    message: string,
    details: JsonObject = {},
  ) {
    if (!isJsonObject(details)) {
      throw new TypeError("DomainError details must be JSON-compatible.");
    }
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = freezeJsonValue(cloneJsonObject(details));
  }
}
