import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const portableSchemaUrl = new URL(
  "../spec/schemas/0.1.0/portable-cognition.schema.json",
  import.meta.url,
);
const cognitiveObjectSchemaUrl = new URL(
  "../spec/schemas/0.1.0/cognitive-object.schema.json",
  import.meta.url,
);
const cognitionEventSchemaUrl = new URL(
  "../spec/schemas/0.1.0/cognition-event.schema.json",
  import.meta.url,
);

const fixtureUrls = {
  cognitiveObject: {
    valid: new URL(
      "../spec/conformance/0.1.0/cognitive-object/valid.jsonl",
      import.meta.url,
    ),
    invalid: new URL(
      "../spec/conformance/0.1.0/cognitive-object/invalid.jsonl",
      import.meta.url,
    ),
  },
  cognitionEvent: {
    valid: new URL(
      "../spec/conformance/0.1.0/cognition-event/valid.jsonl",
      import.meta.url,
    ),
    invalid: new URL(
      "../spec/conformance/0.1.0/cognition-event/invalid.jsonl",
      import.meta.url,
    ),
    lifecycle: new URL(
      "../spec/conformance/0.1.0/cognition-event/lifecycle.jsonl",
      import.meta.url,
    ),
  },
};

const allowedLifecycleEdges = [
  "identity:active->inactive:IdentityInactive",
  "identity:inactive->active:IdentityActive",
  "goal:draft->active:GoalActive",
  "goal:active->at_risk:GoalAtRisk",
  "goal:active->paused:GoalPaused",
  "goal:active->achieved:GoalAchieved",
  "goal:active->abandoned:GoalAbandoned",
  "goal:active->revised:GoalRevised",
  "hypothesis:proposed->under_review:HypothesisUnderReview",
  "hypothesis:under_review->testing:HypothesisTesting",
  "hypothesis:testing->supported:HypothesisSupported",
  "hypothesis:testing->refuted:HypothesisRefuted",
  "hypothesis:testing->inconclusive:HypothesisInconclusive",
  "experiment:planned->active:ExperimentActive",
  "experiment:planned->cancelled:ExperimentCancelled",
  "experiment:active->completed:ExperimentCompleted",
  "experiment:active->cancelled:ExperimentCancelled",
  "evidence:collected->assessed:EvidenceAssessed",
  "evidence:assessed->accepted:EvidenceAccepted",
  "evidence:assessed->disputed:EvidenceDisputed",
  "evidence:assessed->rejected:EvidenceRejected",
  "evidence:assessed->expired:EvidenceExpired",
  "decision:draft->proposed:DecisionProposed",
  "decision:proposed->approved:DecisionApproved",
  "decision:proposed->rejected:DecisionRejected",
  "decision:approved->active:DecisionActive",
  "decision:active->superseded:DecisionSuperseded",
  "decision:superseded->archived:DecisionArchived",
  "principle:proposed->trial:PrincipleTrial",
  "principle:proposed->rejected:PrincipleRejected",
  "principle:trial->adopted:PrincipleAdopted",
  "principle:trial->rejected:PrincipleRejected",
  "principle:adopted->revised:PrincipleRevised",
  "principle:adopted->retired:PrincipleRetired",
];

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function readJsonLines(url) {
  return readFileSync(url, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function compile(schema) {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv, { mode: "full" });
  return ajv.compile(schema);
}

function envelope(recordType, payload) {
  return { schemaVersion: "0.1.0", recordType, payload };
}

function lifecycleEdge(event) {
  return `${event.objectType}:${event.previousState}->${event.nextState}:${event.type}`;
}

test("standalone cognitive projections preserve Portable Cognition definitions", () => {
  const portableSchema = readJson(portableSchemaUrl);
  const cognitiveObjectSchema = readJson(cognitiveObjectSchemaUrl);
  const cognitionEventSchema = readJson(cognitionEventSchemaUrl);

  assert.equal(cognitiveObjectSchema.$ref, "#/$defs/cognitiveObject");
  assert.equal(cognitionEventSchema.$ref, "#/$defs/cognitionEvent");
  assert.deepEqual(cognitiveObjectSchema.$defs, portableSchema.$defs);
  assert.deepEqual(cognitionEventSchema.$defs, portableSchema.$defs);
  assert.equal(typeof compile(cognitiveObjectSchema), "function");
  assert.equal(typeof compile(cognitionEventSchema), "function");
});

for (const [projection, recordType, schemaUrl] of [
  ["cognitiveObject", "cognitive-object", cognitiveObjectSchemaUrl],
  ["cognitionEvent", "cognition-event", cognitionEventSchemaUrl],
]) {
  test(`${projection} valid fixtures satisfy both projection and envelope`, () => {
    const validateProjection = compile(readJson(schemaUrl));
    const validatePortable = compile(readJson(portableSchemaUrl));
    for (const payload of readJsonLines(fixtureUrls[projection].valid)) {
      assert.equal(
        validateProjection(payload),
        true,
        JSON.stringify(validateProjection.errors),
      );
      assert.equal(
        validatePortable(envelope(recordType, payload)),
        true,
        JSON.stringify(validatePortable.errors),
      );
    }
  });

  test(`${projection} schema invalid fixtures fail both projection and envelope`, () => {
    const validateProjection = compile(readJson(schemaUrl));
    const validatePortable = compile(readJson(portableSchemaUrl));
    const schemaFixtures = readJsonLines(fixtureUrls[projection].invalid).filter(
      (fixture) => fixture.validationLayer === "schema",
    );
    assert.ok(schemaFixtures.length > 0);
    for (const fixture of schemaFixtures) {
      assert.deepEqual(Object.keys(fixture).sort(), [
        "description",
        "expectedCode",
        "payload",
        "ruleId",
        "validationLayer",
      ]);
      assert.equal(validateProjection(fixture.payload), false, fixture.description);
      assert.equal(
        validatePortable(envelope(recordType, fixture.payload)),
        false,
        fixture.description,
      );
    }
  });
}

test("projection invalid fixtures declare lexical and runtime boundaries", () => {
  for (const projection of ["cognitiveObject", "cognitionEvent"]) {
    const fixtures = readJsonLines(fixtureUrls[projection].invalid);
    for (const fixture of fixtures) {
      assert.equal(fixture.expectedCode, "INVALID_PORTABLE_COGNITION_RECORD");
      assert.ok(["schema", "lexical", "runtime"].includes(fixture.validationLayer));
      if (fixture.validationLayer === "lexical") {
        assert.equal(typeof fixture.payloadJson, "string");
        assert.equal(fixture.payload, undefined);
      }
      if (fixture.validationLayer === "runtime") {
        assert.notEqual(fixture.payload, undefined);
        assert.equal(fixture.payloadJson, undefined);
      }
    }
  }
});

test("lifecycle fixtures cover every allowed edge and every object family", () => {
  const fixtures = readJsonLines(fixtureUrls.cognitionEvent.lifecycle);
  const validEdges = fixtures
    .filter((fixture) => fixture.expected.valid)
    .map((fixture) => lifecycleEdge(fixture.event))
    .sort();
  const invalidFamilies = new Set(
    fixtures
      .filter((fixture) => !fixture.expected.valid)
      .map((fixture) => fixture.event.objectType),
  );

  assert.deepEqual(validEdges, [...allowedLifecycleEdges].sort());
  assert.deepEqual(
    [...invalidFamilies].sort(),
    [
      "decision",
      "evidence",
      "experiment",
      "goal",
      "hypothesis",
      "identity",
      "principle",
    ],
  );
  for (const fixture of fixtures) {
    assert.equal(typeof fixture.description, "string");
    assert.ok(Array.isArray(fixture.objects));
    assert.equal(typeof fixture.event, "object");
    assert.equal(typeof fixture.expected.valid, "boolean");
    assert.equal(typeof fixture.expected.code, "string");
  }
});
