import { DomainError, DomainErrorCode } from "./errors.ts";
import type { CognitionEvent } from "./events.ts";
import { JsonTextProfileError, parseProfiledJson } from "./json-text.ts";
import {
  createPortableCognitionRecord,
  validatePortableCognitionRecord,
} from "./portable-cognition.ts";
import type { PortableCognitionRecord } from "./portable-cognition.ts";
import type { CognitiveObject } from "./types.ts";

export const COGNITIVE_OBJECT_PROJECTION_VERSION = "0.1.0";
export const COGNITION_EVENT_PROJECTION_VERSION = "0.1.0";
export const COGNITION_PROJECTION_MAX_JSON_DEPTH = 255;

function wrapProjection(
  recordType: "cognitive-object" | "cognition-event",
  payload: unknown,
): PortableCognitionRecord {
  return {
    schemaVersion: "0.1.0",
    recordType,
    payload,
  } as PortableCognitionRecord;
}

function deserializeProjection(
  recordType: "cognitive-object" | "cognition-event",
  text: string,
): unknown {
  let payload: unknown;
  try {
    payload = parseProfiledJson(text);
  } catch (error) {
    if (error instanceof JsonTextProfileError) {
      throw new DomainError(
        DomainErrorCode.INVALID_PORTABLE_COGNITION_RECORD,
        "Serialized Portable Cognition record violates the JSON interoperability profile.",
      );
    }
    throw new DomainError(
      DomainErrorCode.SERIALIZATION_ERROR,
      "Serialized Portable Cognition record is not valid JSON.",
    );
  }
  return createPortableCognitionRecord(wrapProjection(recordType, payload)).payload;
}

export function validateCognitiveObjectProjection(
  value: unknown,
): asserts value is CognitiveObject {
  validatePortableCognitionRecord(wrapProjection("cognitive-object", value));
}

export function deserializeCognitiveObjectProjection(text: string): CognitiveObject {
  return deserializeProjection("cognitive-object", text) as CognitiveObject;
}

export function validateCognitionEventProjection(
  value: unknown,
): asserts value is CognitionEvent {
  validatePortableCognitionRecord(wrapProjection("cognition-event", value));
}

export function deserializeCognitionEventProjection(text: string): CognitionEvent {
  return deserializeProjection("cognition-event", text) as CognitionEvent;
}
