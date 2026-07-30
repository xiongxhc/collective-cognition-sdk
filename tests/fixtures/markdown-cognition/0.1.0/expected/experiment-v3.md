---
collective_cognition: "portable-cognition-markdown/0.1.0"
managed: true
record_type: "cognitive-object"
record_hash: "ba87c9bd1755f1f570e2179ce04ce3e26b5a11dc961653225916d6e130a25788"
object_id: "experiment:loop"
object_type: "experiment"
object_version: 3
object_state: "completed"
---

# Run schema test

> [!warning] Managed note
> This note is a deterministic read-only projection. Edit the authoritative cognition record, then project again.

## Record

- Type: experiment
- State: completed
- ID: `experiment:loop`
- Version: 3

## Relationships

- tests-hypothesis: [[Objects/Hypotheses/a4b9682b8ceeac7087c231567b4797ac84b9c7e2bc0cfd21783c2af4a0af6852/v00000003|Loop is portable]]

## Attribution

- Initiator: `human:owner`
- Executor: `agent:fixture`
- Accountable: `identity:owner`

## Provenance

- source=fixture; source_id=experiment-loop; captured_at=2026-07-27T10:00:00Z

## Structured Data

```json
{"action":"Run schema test"}
```

## Revision

- Created: 2026-07-27T10:00:00Z
- Updated: 2026-07-27T10:05:00Z
- Context: `context:loop`

## Machine Record

```json collective-cognition
{"payload":{"attribution":{"accountableId":"identity:owner","executorId":"agent:fixture","initiatorId":"human:owner"},"contextId":"context:loop","createdAt":"2026-07-27T10:00:00Z","data":{"action":"Run schema test"},"id":"experiment:loop","provenance":[{"capturedAt":"2026-07-27T10:00:00Z","source":"fixture","sourceId":"experiment-loop"}],"relationships":[{"targetId":"hypothesis:loop","type":"tests-hypothesis"}],"state":"completed","title":"Run schema test","type":"experiment","updatedAt":"2026-07-27T10:05:00Z","version":3},"recordType":"cognitive-object","schemaVersion":"0.1.0"}
```
