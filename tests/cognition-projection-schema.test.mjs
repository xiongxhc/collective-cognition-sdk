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

function maximumContainerDepth(value, depth = 1) {
  if (value === null || typeof value !== "object") return depth - 1;
  return Math.max(
    depth,
    ...Object.values(value).map((child) => maximumContainerDepth(child, depth + 1)),
  );
}

test("projection fixtures close the required category and depth matrix", () => {
  const objects = readJsonLines(fixtureUrls.cognitiveObject.valid);
  const objectInvalid = readJsonLines(fixtureUrls.cognitiveObject.invalid);
  const eventValid = readJsonLines(fixtureUrls.cognitionEvent.valid);
  const eventInvalid = readJsonLines(fixtureUrls.cognitionEvent.invalid);
  assert.ok(objects.some((payload) => payload.version === Number.MAX_SAFE_INTEGER));
  assert.equal(Math.max(...objects.map((payload) => maximumContainerDepth(payload))), 255);
  assert.equal(maximumContainerDepth(objectInvalid.find((x) => x.description === "cognitive object depth-256 runtime boundary").payload), 256);
  assert.deepEqual(objectInvalid.map((x) => x.description).sort(), ["cognitive object depth-256 runtime boundary", "cognitive object duplicate payload member name", "cognitive object lone surrogate data string", "cognitive object version zero", "hypothesis missing supports-goal"].sort());
  assert.deepEqual(eventInvalid.map((x) => x.description).sort(), ["cognition event duplicate payload member name", "cognition event future human confirmation", "cognition event lone surrogate rationale", "cognition event mismatched confirmation event binding", "cognition event mismatched confirmation object binding", "cognition event mismatched confirmation target state binding", "cognition event same-state transition", "cognition event state and type mismatch", "cognition event version zero", "cognition event forbidden transition", "cognition event depth-256 runtime-before-schema precedence"].sort());
  assert.deepEqual(
    [...objectInvalid, ...eventInvalid].map(({ description, ruleId, validationLayer }) => ({ description, ruleId, validationLayer })).sort((left, right) => left.description.localeCompare(right.description)),
    [
      ["cognitive object depth-256 runtime boundary", "CCC-002", "runtime"],
      ["cognitive object duplicate payload member name", "CCC-002", "lexical"],
      ["cognitive object lone surrogate data string", "CCC-002", "lexical"],
      ["cognitive object version zero", "CCC-004", "schema"],
      ["hypothesis missing supports-goal", "CCC-014", "schema"],
      ["cognition event depth-256 runtime-before-schema precedence", "CCC-002", "runtime"],
      ["cognition event duplicate payload member name", "CCC-002", "lexical"],
      ["cognition event forbidden transition", "CCC-015", "schema"],
      ["cognition event future human confirmation", "CCC-018", "runtime"],
      ["cognition event lone surrogate rationale", "CCC-002", "lexical"],
      ["cognition event mismatched confirmation event binding", "CCC-018", "runtime"],
      ["cognition event mismatched confirmation object binding", "CCC-018", "runtime"],
      ["cognition event mismatched confirmation target state binding", "CCC-018", "runtime"],
      ["cognition event same-state transition", "CCC-015", "schema"],
      ["cognition event state and type mismatch", "CCC-016", "schema"],
      ["cognition event version zero", "CCC-016", "schema"],
    ].map(([description, ruleId, validationLayer]) => ({ description, ruleId, validationLayer })).sort((left, right) => left.description.localeCompare(right.description)),
  );
  assert.ok(eventValid.some((x) => x.automationMode === "manual"));
  assert.ok(eventValid.some((x) => x.automationMode === "automated"));
  assert.ok(eventValid.some((x) => x.consequenceLevel === "routine"));
  assert.ok(eventValid.some((x) => x.consequenceLevel === "consequential" && x.humanConfirmation));
  const overDepthEvent = eventInvalid.find((x) => x.description === "cognition event depth-256 runtime-before-schema precedence");
  assert.equal(maximumContainerDepth(overDepthEvent.payload), 256);
  assert.equal(compile(readJson(cognitionEventSchemaUrl))(overDepthEvent.payload), false);
  for (const fixture of [...objectInvalid, ...eventInvalid]) assert.ok(["CCC-002", "CCC-004", "CCC-014", "CCC-015", "CCC-016", "CCC-018"].includes(fixture.ruleId));
});

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
  const validEdges = [...new Set(
    fixtures
      .filter((fixture) => fixture.expected.valid)
      .map((fixture) => lifecycleEdge(fixture.event)),
  )].sort();
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
