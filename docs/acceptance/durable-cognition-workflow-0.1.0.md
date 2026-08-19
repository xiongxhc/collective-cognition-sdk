# Durable Cognition Workflow 0.1.0 Acceptance Evidence

This record covers the read-only real-ledger acceptance for the source-neutral
Durable Cognition Workflow `0.1.0`. It records aggregate contract evidence only;
it contains no source path, source row, private content, or source identity value.

## Scope

- Tested implementation commit: `8d28846abfc54e9287adf66757433f6e63c96cdf`.
- Workflow runtime: bundled Node.js `v24.19.0`.
- Source classification: explicit compatible local Team Memory event ledger.
- Source access: the existing dedicated Team Memory connector CLI opened the
  explicit ledger read-only and was the only SourceRecord producer.
- Selection: project `unified-portal`, from
  `2026-07-28T17:59:00+08:00`, limit `12`.
- Export: `12` canonical SourceRecord JSONL lines with no `raw` field.
- Writable resources: one temporary acceptance root containing the request,
  schema-version-`2` cognition database, explicitly initialized Markdown
  target, and command outputs. The root was deleted after verification.

## Workflow Result

| Stage | First run | Closed-process replay |
| --- | --- | --- |
| Result | `committed` | `committed` |
| Persistence | `committed` | `already_committed` |
| Publication | `not_requested` | `not_requested` |
| Markdown projection | `projected` | `unchanged` |

The cognition database was closed between CLI processes and reopened for the
replay and semantic inspection.

## Cognition Semantics

| Check | Result |
| --- | ---: |
| Schema version | `2` |
| Cognitive-object rows | `3` |
| Cognition-event rows | `1` |
| Workflow-receipt rows | `1` |
| Version-`1` `proposed` Hypotheses | `1` |
| Version-`2` `under_review` Hypotheses | `1` |
| Neutral Evidence objects | `1` |
| Evidence provenance records | `12` |
| Decisions | `0` |
| Principles | `0` |

The Evidence used the built-in neutral SourceRecord promotion policy. The
workflow did not infer delivery readiness, a Decision, or a Principle.

## Markdown Verification

- Verification status: `passed`.
- Diagnostics: `0`.
- Managed paths: `7`.
- Exact replay projection: `unchanged`.

The Markdown target was initialized explicitly under the temporary acceptance
root. No live or personal vault was discovered, read, or written.

## Source Immutability

The source identity was captured before export, rechecked after every acceptance
operation, and compared again after the complete acceptance sequence. Only the
equality results are recorded here.

| Before/after comparison | Equal |
| --- | --- |
| Byte size | `true` |
| Modification time | `true` |
| Change time | `true` |
| Inode | `true` |
| SHA-256 | `true` |
| Complete captured identity values | `true` |

The source ledger was not copied, vacuumed, migrated, or opened writable.

## Local Verification

### Bundled Node.js `v24.19.0`

- Focused workflow matrix: `78` passed, `0` skipped, `0` failed.
- Build, TypeScript `--noEmit`, syntax checks, and `pack:check` passed.
- `pack:check`: `10` schema, `25` compatibility, and `12` package tests;
  `47` passed, `0` skipped, `0` failed.
- All `7` examples passed. The two Team Memory examples used a generated
  temporary fictional ledger and a separate temporary cognition database.
- The known Team Memory permission-model reproduction remained `9` passed and
  `2` failed. Those two failures reproduce at the tested implementation commit
  and were not changed; this runtime is therefore not used for the complete
  source-suite zero-failure claim.

### Node.js `v24.9.0`

- `npm ci --ignore-scripts` completed from available dependency state and added
  `29` locked packages without changing dependencies.
- Complete source suite: `522` total, `448` passed, `74` capability or
  release-context skipped, `0` failed.
- Schema: `10` passed; compatibility: `25` passed; package: `12` passed.
- Focused workflow compatibility gate: `78` total, `49` passed, `29` honest
  defensive-SQLite capability skips, `0` failed.
- Combined compatibility/package gate: `37` passed, `0` skipped, `0` failed.

Node.js `v24.9.0` lacks the reviewed
`DatabaseSync.prototype.enableDefensive` capability. SQLite behavior was not
shimmed or monkeypatched; full SQLite workflow acceptance used bundled Node.js
`v24.19.0` instead.

## Limitations

- Package `0.9.0` remains private and unpublished on npm.
- This acceptance is a verified local operation, not production certification,
  organizational approval, endorsement, publication authority, or an LTS claim.
- The CLI has no publisher, and Markdown remains a non-authoritative projection.
- The workflow supplies no scheduler, automatic cognition, authentication,
  encryption, durable publication outbox, or schema-version-`1` migration.
- The timestamp filter follows the compatible ledger's stored timestamp text.
- No Task 8 final independent specification or code review was performed as part
  of this acceptance-evidence change.
