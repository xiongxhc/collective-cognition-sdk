# Git Connector Guide

Package `0.10.0` exposes the maintained Git Connector `0.1.0` only through
its versioned subpath:

```ts
import {
  GIT_REPOSITORY_FORMAT,
  GitConnectorError,
  readGitCommitSourceRecords,
  type GitCommitSourceRecordOptions,
  type GitConnectorErrorCode,
  type GitConnectorStage,
} from "collective-cognition-sdk/connectors/git/0.1.0";
```

The package root does not export Git-specific names. There is no Git CLI.

## Requirements

The connector requires a local `git` executable and an explicit local
repository path. It invokes Git without a shell, disables optional locks,
lazy fetching, and terminal prompts, and uses only bounded read operations.

## Options

| Option | Required | Contract |
| --- | --- | --- |
| `repositoryPath` | Yes | Absolute local filesystem path. URLs, `~`, relative paths, NUL values, and implicit current-directory discovery are rejected. |
| `sourceInstance` | Yes | Public, non-secret source identity from 1 through 128 Unicode scalar values, without control characters or surrounding whitespace. |
| `tipCommitId` | Yes | Exact lowercase 40- or 64-character hexadecimal commit object ID. Branches, tags, ranges, and revision expressions are rejected. |
| `capturedAt` | Yes | Valid ISO 8601 timestamp with an explicit UTC offset. |
| `limit` | Yes | Integer from 1 through 1,000. |
| `includeMessage` | No | `includeMessage` defaults to `false`; the full commit message is omitted unless explicitly enabled. |
| `includeAuthorEmail` | No | `includeAuthorEmail` defaults to `false`; author email is omitted unless explicitly enabled. |

```ts
const records = readGitCommitSourceRecords({
  repositoryPath: "/absolute/path/to/fictional-repository",
  sourceInstance: "fictional-local-repository",
  tipCommitId: "0123456789abcdef0123456789abcdef01234567",
  capturedAt: "2026-08-21T12:00:00.000Z",
  limit: 25,
});
```

The selected ancestry window follows only the first-parent chain from the
exact tip. Records are returned oldest-to-newest. Merge commits on that chain
retain all ordered parent IDs, but secondary-parent history is not traversed.

## Errors

`GitConnectorError` has a stable `code`, `stage`, fixed public message, and
sanitized frozen `details`.

| Code | Stage | Meaning |
| --- | --- | --- |
| `invalid_options` | `options` | The closed option contract is invalid. |
| `target_unavailable` | `open` | The explicit repository path or local Git executable is unavailable. |
| `incompatible_repository` | `open` or `history` | The target is not a compatible repository or the exact tip is not a commit. |
| `invalid_commit` | `history` or `mapping` | Selected commit metadata cannot satisfy the mapping contract. |
| `read_failed` | `open` or `history` | A bounded read operation failed for another reason. |

Diagnostics never expose repository paths, Git stderr, command lines, commit
messages, author values, object contents, environment values, or credentials.

## Non-Goals

- The connector does not fetch, pull, clone, checkout, or push.
- It does not discover a repository, branch, tag, home directory, or remote.
- It does not run hooks, filters, diffs, credential helpers, or shell expansions.
- It does not schedule work, persist cursors, retry in the background, or sync.
- It does not infer Evidence, Decisions, or Principles, and does not promote,
  persist, publish, or authorize cognition.
- The SDK package remains private and unpublished. This connector is reference
  interoperability evidence, not production certification, endorsement, or an
  LTS commitment.
