import assert from "node:assert/strict";
import test from "node:test";

import {
  gitCommitToSourceRecord,
} from "../src/adapters/git-commit.ts";
import type { GitCommitInput } from "../src/adapters/git-commit.ts";
import {
  DomainError,
  DomainErrorCode,
  validateSourceRecord,
} from "../src/index.ts";

function commitInput(
  overrides: Partial<GitCommitInput> = {},
): GitCommitInput {
  return {
    repository: { id: "github.example/acme/collective-cognition-sdk" },
    commitId: "abc123",
    author: {
      id: "human:ada",
      name: "Ada Example",
      email: "ada@example.com",
    },
    authoredAt: "2026-07-24T09:59:00.000Z",
    capturedAt: "2026-07-24T10:00:00.000Z",
    summary: "Add Git commit fixture connector",
    message: "Add Git commit fixture connector\n\nPreserve neutral provenance.",
    parents: ["parent-1", "parent-2"],
    ...overrides,
  };
}

test("maps structured Git commit input to a valid neutral SourceRecord", () => {
  const input = commitInput();
  const record = gitCommitToSourceRecord(input);

  assert.doesNotThrow(() => validateSourceRecord(record));
  assert.equal(record.source.system, "git");
  assert.equal(record.source.instance, input.repository.id);
  assert.equal(record.sourceId, `commit:${input.commitId}`);
  assert.equal(record.revisionId, input.commitId);
  assert.equal(record.observedAt, input.authoredAt);
  assert.equal(record.capturedAt, input.capturedAt);
  assert.equal(record.mediaType, "application/vnd.git.commit+json");
  assert.equal(record.actorId, input.author.id);
  assert.deepEqual(record.content, {
    repository: input.repository,
    commitId: input.commitId,
    author: input.author,
    authoredAt: input.authoredAt,
    summary: input.summary,
    message: input.message,
    parents: input.parents,
  });
  assert.equal("polarity" in (record.content as object), false);
});

test("creates deterministic immutable records without retaining mutable input", () => {
  const input = commitInput({
    repository: { id: "git.example/acme/repository" },
    parents: ["parent-1"],
  });
  const first = gitCommitToSourceRecord(input);
  const second = gitCommitToSourceRecord(input);

  (input.parents as string[]).push("mutated-parent");

  assert.equal(first.id, second.id);
  assert.deepEqual(
    (first.content as { parents: readonly string[] }).parents,
    ["parent-1"],
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.content), true);
});

test("rejects incomplete source-specific commit identity", () => {
  for (const input of [
    commitInput({ repository: { id: " " } }),
    commitInput({ commitId: " " }),
    commitInput({ author: { id: "", name: "Ada Example" } }),
    commitInput({ parents: ["parent-1", " "] }),
  ]) {
    assert.throws(
      () => gitCommitToSourceRecord(input),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_SOURCE_RECORD,
    );
  }
});
