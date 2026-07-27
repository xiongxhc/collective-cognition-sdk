import {
  createObject,
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
} from "../src/index.ts";

const createdAt = "2026-07-27T10:00:00.000Z";
const goalInput = {
  id: "goal:portable-cognition",
  type: "goal" as const,
  version: 1,
  state: "draft" as const,
  title: "Exchange a portable cognitive object",
  data: {
    objective: "Round-trip one cognitive object through the portable contract.",
  },
  createdAt,
  updatedAt: createdAt,
  attribution: {
    initiatorId: "human:example-owner",
    executorId: "human:example-owner",
    accountableId: "human:example-owner",
  },
  provenance: [
    {
      source: "example",
      sourceId: "portable-cognition",
      capturedAt: createdAt,
    },
  ],
  contextId: "organization:example-team",
  relationships: [],
};

const portable = createPortableCognitionRecord({
  schemaVersion: "0.1.0",
  recordType: "cognitive-object",
  payload: createObject(goalInput),
});

const restored = deserializePortableCognitionRecord(
  serializePortableCognitionRecord(portable),
);

console.log(JSON.stringify(restored, null, 2));
