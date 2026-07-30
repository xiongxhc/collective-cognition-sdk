---
collective_cognition: "portable-cognition-markdown/0.1.0"
managed: true
record_type: "cognitive-object"
record_hash: "ac1d0d6a2ac1bca71d8d5d773b9eb10fd93e2963a2cd0eeceb697b97766bedba"
object_id: "evidence:loop"
object_type: "evidence"
object_version: 3
object_state: "accepted"
---

# Schema test result

> [!warning] Managed note
> This note is a deterministic read-only projection. Edit the authoritative cognition record, then project again.

## Record

- Type: evidence
- State: accepted
- ID: `evidence:loop`
- Version: 3

## Relationships

- supports-hypothesis: [[Index#^cc-object-a4b9682b8ceeac7087c231567b4797ac84b9c7e2bc0cfd21783c2af4a0af6852|hypothesis:loop]]

## Attribution

- Initiator: `human:owner`
- Executor: `agent:fixture`
- Accountable: `identity:owner`

## Provenance

- source=fixture; source_id=evidence-loop; captured_at=2026-07-27T10:00:00Z

## Structured Data

```json
{"polarity":"supports","statement":"The schema accepted the loop."}
```

## Revision

- Created: 2026-07-27T10:00:00Z
- Updated: 2026-07-27T10:07:00Z
- Context: `context:loop`

## Machine Record

```json collective-cognition
{"payload":{"attribution":{"accountableId":"identity:owner","executorId":"agent:fixture","initiatorId":"human:owner"},"contextId":"context:loop","createdAt":"2026-07-27T10:00:00Z","data":{"polarity":"supports","statement":"The schema accepted the loop."},"id":"evidence:loop","provenance":[{"capturedAt":"2026-07-27T10:00:00Z","source":"fixture","sourceId":"evidence-loop"}],"relationships":[{"targetId":"hypothesis:loop","type":"supports-hypothesis"}],"state":"accepted","title":"Schema test result","type":"evidence","updatedAt":"2026-07-27T10:07:00Z","version":3},"recordType":"cognitive-object","schemaVersion":"0.1.0"}
```
