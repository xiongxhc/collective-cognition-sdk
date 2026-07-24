import {
  cloneJsonObject,
  freezeJsonValue,
  isJsonObject,
} from "./types.ts";
import type { JsonObject } from "./types.ts";

export const DomainErrorCode = {
  INVALID_OBJECT: "INVALID_OBJECT",
  INVALID_RELATIONSHIP: "INVALID_RELATIONSHIP",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  CONFIRMATION_REQUIRED: "CONFIRMATION_REQUIRED",
  AUTHORIZATION_DENIED: "AUTHORIZATION_DENIED",
  SERIALIZATION_ERROR: "SERIALIZATION_ERROR",
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
