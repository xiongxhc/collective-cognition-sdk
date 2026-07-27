import { DomainError, DomainErrorCode } from "../errors.ts";
import { createSourceRecord } from "../source-records.ts";
import type { SourceRecord } from "../source-records.ts";

export interface GitRepositoryIdentity {
  readonly id: string;
}

export interface GitCommitAuthor {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
}

export interface GitCommitInput {
  readonly repository: GitRepositoryIdentity;
  readonly commitId: string;
  readonly author: GitCommitAuthor;
  readonly authoredAt: string;
  readonly capturedAt: string;
  readonly summary: string;
  readonly message: string;
  readonly parents: readonly string[];
}

function invalidCommit(field: string, message: string): never {
  throw new DomainError(
    DomainErrorCode.INVALID_SOURCE_RECORD,
    message,
    { field },
  );
}

function requireNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidCommit(field, `Git commit ${field} must be a non-empty string.`);
  }
}

function validateGitCommitInput(
  value: unknown,
): asserts value is GitCommitInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidCommit("input", "Git commit input must be an object.");
  }

  const input = value as Record<string, unknown>;
  if (
    typeof input.repository !== "object" ||
    input.repository === null ||
    Array.isArray(input.repository)
  ) {
    invalidCommit("repository", "Git commit repository must be an object.");
  }
  const repository = input.repository as Record<string, unknown>;
  requireNonEmptyString(repository.id, "repository.id");

  if (
    typeof input.author !== "object" ||
    input.author === null ||
    Array.isArray(input.author)
  ) {
    invalidCommit("author", "Git commit author must be an object.");
  }
  const author = input.author as Record<string, unknown>;
  requireNonEmptyString(author.id, "author.id");
  requireNonEmptyString(author.name, "author.name");
  if (author.email !== undefined) {
    requireNonEmptyString(author.email, "author.email");
  }

  for (const field of [
    "commitId",
    "authoredAt",
    "capturedAt",
    "summary",
    "message",
  ] as const) {
    requireNonEmptyString(input[field], field);
  }

  if (!Array.isArray(input.parents)) {
    invalidCommit("parents", "Git commit parents must be an array.");
  }
  input.parents.forEach((parent, index) => {
    requireNonEmptyString(parent, `parents[${index}]`);
  });
}

function recordIdFor(input: GitCommitInput): string {
  return [
    "source-record",
    "git-commit",
    encodeURIComponent(input.repository.id),
    encodeURIComponent(input.commitId),
  ].join(":");
}

export function gitCommitToSourceRecord(
  input: GitCommitInput,
): SourceRecord {
  validateGitCommitInput(input);

  return createSourceRecord({
    id: recordIdFor(input),
    source: { system: "git", instance: input.repository.id },
    sourceId: `commit:${input.commitId}`,
    revisionId: input.commitId,
    capturedAt: input.capturedAt,
    observedAt: input.authoredAt,
    mediaType: "application/vnd.git.commit+json",
    content: {
      repository: { id: input.repository.id },
      commitId: input.commitId,
      author: {
        id: input.author.id,
        name: input.author.name,
        ...(input.author.email === undefined
          ? {}
          : { email: input.author.email }),
      },
      authoredAt: input.authoredAt,
      summary: input.summary,
      message: input.message,
      parents: [...input.parents],
    },
    actorId: input.author.id,
  });
}
