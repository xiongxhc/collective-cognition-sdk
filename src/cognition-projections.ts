import type { CognitionEvent } from "./events.ts";
import {
  deserializePortableCognitionRecord,
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

export function validateCognitiveObjectProjection(
  value: unknown,
): asserts value is CognitiveObject {
  validatePortableCognitionRecord(wrapProjection("cognitive-object", value));
}

export function deserializeCognitiveObjectProjection(text: string): CognitiveObject {
  const envelopeText = `{"schemaVersion":"0.1.0","recordType":"cognitive-object","payload":${text}}`;
  return deserializePortableCognitionRecord(envelopeText)
    .payload as CognitiveObject;
}

export function validateCognitionEventProjection(
  value: unknown,
): asserts value is CognitionEvent {
  validatePortableCognitionRecord(wrapProjection("cognition-event", value));
}

export function deserializeCognitionEventProjection(text: string): CognitionEvent {
  const envelopeText = `{"schemaVersion":"0.1.0","recordType":"cognition-event","payload":${text}}`;
  return deserializePortableCognitionRecord(envelopeText)
    .payload as CognitionEvent;
}
