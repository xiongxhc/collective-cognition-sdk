import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MARKDOWN_COGNITION_PROFILE_VERSION,
  MarkdownCognitionError,
  markdownCognitionRelativePath,
  parseMarkdownCognitionRecord,
  renderMarkdownCognitionIndex,
  renderMarkdownCognitionRecord,
} from "../src/markdown-cognition.ts";
import type {
  MarkdownCognitionRecord,
} from "../src/markdown-cognition.ts";

const fixtureUrl = new URL(
  "./fixtures/markdown-cognition/0.1.0/records.jsonl",
  import.meta.url,
);

function fixtureRecords(): MarkdownCognitionRecord[] {
  return readFileSync(fixtureUrl, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as MarkdownCognitionRecord);
}

function renderedMachineJson(markdown: string): string {
  const match = markdown.match(/```json collective-cognition\n([^\n]+)\n```\n$/);
  assert.notEqual(match, null);
  return match![1]!;
}

function replaceFirst(markdown: string, source: string, replacement: string): string {
  const position = markdown.indexOf(source);
  assert.notEqual(position, -1);
  return `${markdown.slice(0, position)}${replacement}${markdown.slice(position + source.length)}`;
}

function assertInvalidMarkdown(markdown: string): void {
  assert.throws(
    () => parseMarkdownCognitionRecord(markdown),
    (error: unknown) =>
      error instanceof MarkdownCognitionError &&
      error.code === "invalid_markdown_record",
  );
}

test("publishes the exact Markdown cognition profile", () => {
  assert.equal(
    MARKDOWN_COGNITION_PROFILE_VERSION,
    "portable-cognition-markdown/0.1.0",
  );
});

test("renders every supported fixture deterministically and round-trips it", () => {
  const records = fixtureRecords();
  for (const record of records) {
    const first = renderMarkdownCognitionRecord(record, { records });
    const second = renderMarkdownCognitionRecord(
      structuredClone(record),
      { records: [...records].reverse() },
    );
    assert.equal(second, first);
    assert.deepEqual(parseMarkdownCognitionRecord(first), record);
    assert.equal(first.endsWith("\n"), true);
    assert.equal(first.endsWith("\n\n"), false);
  }
});

test("uses stable digest paths instead of caller-controlled IDs", () => {
  for (const record of fixtureRecords()) {
    const path = markdownCognitionRelativePath(record);
    assert.doesNotMatch(path, /\.\.|\\|:/);
    assert.equal(path.startsWith("/"), false);
  }
});

test("renders an input-order-independent index", () => {
  const records = fixtureRecords();
  const index = renderMarkdownCognitionIndex(records);
  assert.equal(index, renderMarkdownCognitionIndex([...records].reverse()));
  assert.match(index, /- Hypotheses: 1 \(testing=1\)/);
  assert.doesNotMatch(index, /\/Users\/|localhost/);
});

test("rejects unsupported Portable Cognition families and source records", () => {
  const supported = fixtureRecords()[0]!;
  assert.throws(
    () => renderMarkdownCognitionRecord({ ...supported, recordType: "domain-error" } as never),
    (error: unknown) =>
      error instanceof MarkdownCognitionError &&
      error.code === "invalid_projection_input",
  );
  assert.throws(
    () => renderMarkdownCognitionRecord({ source: {}, observedAt: "x" } as never),
    (error: unknown) =>
      error instanceof MarkdownCognitionError &&
      error.code === "invalid_projection_input",
  );
});

test("rejects accessor-bearing records without invoking accessors", () => {
  let accessed = false;
  const record = fixtureRecords()[0]! as unknown as Record<string, unknown>;
  const malicious = { ...record };
  Object.defineProperty(malicious, "payload", {
    enumerable: true,
    get() {
      accessed = true;
      throw new Error("ACCESSOR_SECRET");
    },
  });
  assert.throws(() => renderMarkdownCognitionRecord(malicious as never));
  assert.equal(accessed, false);
});

test("rejects malformed Markdown without disclosing caller content", () => {
  for (const markdown of ["", "---\ncollective_cognition: !secret\n---\n", "x".repeat(1_048_577), "\ud800"]) {
    assert.throws(
      () => parseMarkdownCognitionRecord(markdown),
      (error: unknown) =>
        error instanceof MarkdownCognitionError &&
        error.code === "invalid_markdown_record" &&
        !error.message.includes("secret"),
    );
  }
});

test("uses the canonical record digest in the rendered frontmatter", () => {
  const record = fixtureRecords()[0]!;
  const rendered = renderMarkdownCognitionRecord(record, { records: [record] });
  const machine = renderedMachineJson(rendered);
  assert.match(
    rendered,
    new RegExp(`record_hash: "${createHash("sha256").update(machine, "utf8").digest("hex")}"`),
  );
});

test("renders every fixture against immutable expected Markdown", () => {
  const names = [
    "identity-v1",
    "goal-v2",
    "hypothesis-v2",
    "hypothesis-v3",
    "experiment-v3",
    "evidence-v3",
    "decision-v3",
    "principle-v3",
    "hypothesis-testing-event",
  ];
  const records = fixtureRecords();
  for (const [index, record] of records.entries()) {
    const expectedUrl = new URL(
      `./fixtures/markdown-cognition/0.1.0/expected/${names[index]}.md`,
      import.meta.url,
    );
    assert.equal(
      renderMarkdownCognitionRecord(record, { records }),
      readFileSync(expectedUrl, "utf8"),
    );
  }
});

test("uses an immutable object path when title and state change", () => {
  const original = fixtureRecords().find(
    (record) => record.recordType === "cognitive-object" && record.payload.type === "goal",
  )!;
  const changed = structuredClone(original) as MarkdownCognitionRecord;
  if (changed.recordType !== "cognitive-object") {
    throw new Error("fixture mismatch");
  }
  (changed.payload as { title: string; state: string }).title = "# A different [[title]]";
  (changed.payload as { title: string; state: string }).state = "achieved";
  assert.equal(markdownCognitionRelativePath(changed), markdownCognitionRelativePath(original));
});

test("links relationships to the highest projected object revision", () => {
  const records = fixtureRecords();
  const experiment = records.find(
    (record) => record.recordType === "cognitive-object" && record.payload.type === "experiment",
  )!;
  const rendered = renderMarkdownCognitionRecord(experiment, { records });
  const hypothesis = records.find(
    (record) => record.recordType === "cognitive-object" && record.payload.id === "hypothesis:loop" && record.payload.version === 3,
  )!;
  assert.match(
    rendered,
    new RegExp(`\\[\\[${markdownCognitionRelativePath(hypothesis).slice(0, -3)}\\|Loop is portable\\]\\]`),
  );
});

test("renders absent relationship targets as escaped identifiers", () => {
  const record = structuredClone(fixtureRecords().find(
    (candidate) => candidate.recordType === "cognitive-object" && candidate.payload.type === "decision",
  )!) as MarkdownCognitionRecord;
  if (record.recordType !== "cognitive-object") {
    throw new Error("fixture mismatch");
  }
  const rendered = renderMarkdownCognitionRecord(record, { records: [record] });
  assert.match(rendered, /`option:adopt`/);
  assert.doesNotMatch(rendered, /\[\[.*option:adopt/);
});

test("normalizes reordered object keys and input order", () => {
  const record = fixtureRecords()[1]!;
  const reordered = {
    payload: structuredClone(record.payload),
    recordType: record.recordType,
    schemaVersion: record.schemaVersion,
  } as MarkdownCognitionRecord;
  assert.equal(renderMarkdownCognitionRecord(reordered), renderMarkdownCognitionRecord(record));
  assert.equal(renderMarkdownCognitionIndex(fixtureRecords()), renderMarkdownCognitionIndex([...fixtureRecords()].reverse()));
});

test("accepts duplicate canonical records and rejects conflicting duplicate revisions", () => {
  const record = fixtureRecords()[2]!;
  assert.doesNotThrow(() => renderMarkdownCognitionRecord(record, { records: [record, structuredClone(record)] }));
  const conflicting = structuredClone(record) as MarkdownCognitionRecord;
  if (conflicting.recordType !== "cognitive-object") {
    throw new Error("fixture mismatch");
  }
  (conflicting.payload as { title: string }).title = "Conflicting revision";
  assert.throws(
    () => renderMarkdownCognitionRecord(record, { records: [record, conflicting] }),
    (error: unknown) => error instanceof MarkdownCognitionError && error.code === "invalid_projection_input",
  );
});

test("uses descriptor snapshots for stateful proxies and rejects hostile reflection", () => {
  const record = fixtureRecords()[0]!;
  let valueReads = 0;
  const stateful = new Proxy(structuredClone(record), {
    get() {
      valueReads += 1;
      throw new Error("STATEFUL_MARKDOWN_SECRET");
    },
  });
  const hostile = new Proxy({}, {
    ownKeys() {
      throw new Error("REFLECTION_MARKDOWN_SECRET");
    },
  });
  assert.doesNotThrow(() => renderMarkdownCognitionRecord(stateful as never));
  assert.equal(valueReads, 0);
  assert.throws(
    () => renderMarkdownCognitionRecord(hostile as never),
    (error: unknown) =>
      error instanceof MarkdownCognitionError &&
      error.code === "invalid_projection_input" &&
      !error.message.includes("SECRET"),
  );
});

test("rejects accessor-bearing render contexts without invoking accessors", () => {
  let accessed = false;
  const context = {} as { records: readonly MarkdownCognitionRecord[] };
  Object.defineProperty(context, "records", {
    enumerable: true,
    get() {
      accessed = true;
      throw new Error("CONTEXT_ACCESSOR_SECRET");
    },
  });
  assert.throws(
    () => renderMarkdownCognitionRecord(fixtureRecords()[0]!, context),
    (error: unknown) =>
      error instanceof MarkdownCognitionError &&
      error.code === "invalid_projection_input" &&
      !error.message.includes("SECRET"),
  );
  assert.equal(accessed, false);
});

test("escapes Markdown and Obsidian syntax in human-readable fields", () => {
  const record = structuredClone(fixtureRecords()[1]!) as MarkdownCognitionRecord;
  if (record.recordType !== "cognitive-object") {
    throw new Error("fixture mismatch");
  }
  (record.payload as { title: string }).title = "# heading ``` <html> [[link]] ![[embed]] \\ \u0001 café";
  const rendered = renderMarkdownCognitionRecord(record);
  assert.ok(rendered.includes("# \\# heading \\`\\`\\` \\<html\\> \\[\\[link\\]\\] \\!\\[\\[embed\\]\\] \\\\ \\u0001 café"));
});

test("rejects non-profile frontmatter grammar and field order", () => {
  const markdown = renderMarkdownCognitionRecord(fixtureRecords()[0]!);
  assertInvalidMarkdown(replaceFirst(markdown, "managed: true\n", "managed: true\nunknown: true\n"));
  assertInvalidMarkdown(replaceFirst(markdown, "managed: true\n", "managed: true\nmanaged: true\n"));
  assertInvalidMarkdown(replaceFirst(markdown, "collective_cognition:", "managed:"));
  assertInvalidMarkdown(replaceFirst(markdown, "managed: true", "managed: &anchor true"));
  assertInvalidMarkdown(replaceFirst(markdown, "managed: true", "managed: <<: true"));
  assertInvalidMarkdown(replaceFirst(markdown, "managed: true", "managed: true # comment"));
  assertInvalidMarkdown(replaceFirst(markdown, "object_id:", "object_id: |"));
});

test("rejects alternate JSON spellings of frontmatter strings", () => {
  const markdown = renderMarkdownCognitionRecord(fixtureRecords()[1]!);
  const alternateSpelling = replaceFirst(
    markdown,
    'object_id: "goal:loop"',
    'object_id: "g\\u006fal:loop"',
  );
  assertInvalidMarkdown(alternateSpelling);
});

test("uses collision-free inline-code delimiters for untrusted identifiers", () => {
  const record = structuredClone(fixtureRecords()[1]!) as MarkdownCognitionRecord;
  if (record.recordType !== "cognitive-object") {
    throw new Error("fixture mismatch");
  }
  const payload = record.payload as unknown as {
    id: string;
    attribution: { initiatorId: string };
    relationships: { type: "parent-goal"; targetId: string }[];
  };
  payload.id = "goal`````id";
  payload.attribution.initiatorId = "actor```id";
  payload.relationships = [{
    type: "parent-goal",
    targetId: "target````id",
  }];

  const rendered = renderMarkdownCognitionRecord(record, { records: [record] });
  assert.ok(rendered.includes("- ID: ``````goal`````id``````"));
  assert.ok(rendered.includes("- Initiator: ````actor```id````"));
  assert.ok(rendered.includes("- parent-goal: `````target````id`````"));
  assert.doesNotMatch(rendered, /- (?:ID|Initiator|parent-goal): `[^\n]*\\`/);
});

test("pads inline-code content that begins or ends with backticks", () => {
  const record = structuredClone(fixtureRecords()[1]!) as MarkdownCognitionRecord;
  if (record.recordType !== "cognitive-object") {
    throw new Error("fixture mismatch");
  }
  const payload = record.payload as unknown as {
    id: string;
    attribution: { initiatorId: string };
    relationships: { type: "parent-goal"; targetId: string }[];
  };
  payload.id = "`leading";
  payload.attribution.initiatorId = "trailing`";
  payload.relationships = [{ type: "parent-goal", targetId: "```" }];

  const rendered = renderMarkdownCognitionRecord(record, { records: [record] });
  assert.ok(rendered.includes("- ID: `` `leading ``"));
  assert.ok(rendered.includes("- Initiator: `` trailing` ``"));
  assert.ok(rendered.includes("- parent-goal: ```` ``` ````"));
});

test("rejects machine-block ambiguity, noncanonical JSON, and hash mismatch", () => {
  const markdown = renderMarkdownCognitionRecord(fixtureRecords()[0]!);
  assertInvalidMarkdown(markdown.replace("## Machine Record", "## Other"));
  assertInvalidMarkdown(markdown.replace("```\n", "```\n```json collective-cognition\n{}\n```\n"));
  const machine = renderedMachineJson(markdown);
  const noncanonical = machine.replace('"payload"', '"schemaVersion":"0.1.0","payload"');
  assertInvalidMarkdown(markdown.replace(machine, noncanonical));
  const hash = markdown.match(/record_hash: "([0-9a-f]{64})"/)?.[1];
  assert.notEqual(hash, undefined);
  assertInvalidMarkdown(markdown.replace(hash!, "0".repeat(64)));
});

test("enforces note and parser byte limits", () => {
  const record = structuredClone(fixtureRecords()[1]!) as MarkdownCognitionRecord;
  if (record.recordType !== "cognitive-object") {
    throw new Error("fixture mismatch");
  }
  (record.payload as { title: string }).title = "x".repeat(1_048_576);
  assert.throws(
    () => renderMarkdownCognitionRecord(record),
    (error: unknown) => error instanceof MarkdownCognitionError && error.code === "projection_limit_exceeded",
  );
  assertInvalidMarkdown("x".repeat(1_048_577));
});

test("returns detached recursively frozen parsed records", () => {
  const original = fixtureRecords()[3]!;
  const parsed = parseMarkdownCognitionRecord(renderMarkdownCognitionRecord(original));
  assert.deepEqual(parsed, original);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.payload), true);
  if (parsed.recordType === "cognitive-object") {
    assert.equal(Object.isFrozen(parsed.payload.data), true);
    assert.equal(Object.isFrozen(parsed.payload.relationships), true);
  }
  assert.notEqual(parsed, original);
});
