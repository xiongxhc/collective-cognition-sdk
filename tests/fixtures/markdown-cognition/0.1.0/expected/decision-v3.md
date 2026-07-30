---
collective_cognition: "portable-cognition-markdown/0.1.0"
managed: true
record_type: "cognitive-object"
record_hash: "b570a1aedb49d6971dd78755880782addb27d2052b11113d14c475ad63e75686"
object_id: "decision:loop"
object_type: "decision"
object_version: 3
object_state: "approved"
---

# Adopt loop

> [!warning] Managed note
> This note is a deterministic read-only projection. Edit the authoritative cognition record, then project again.

## Record

- Type: decision
- State: approved
- ID: `decision:loop`
- Version: 3

## Relationships

- supports-goal: [[Index#^cc-object-5154134b109ab35801082d752e2105f0b95ac50f31b1223ddf76efbf84730d48|goal:loop]]
- justified-by-evidence: [[Index#^cc-object-4e4f652efc845b65514e245c5cfa87458da853551d7b6c7ccebbabb8c8e7deb8|evidence:loop]]
- considers-option: `option:adopt`
- accountable-identity: [[Index#^cc-object-951c1289f7e23520a2d8ca135da3e2e951690798c2aac1e412e81da3c7c328fd|identity:owner]]

## Attribution

- Initiator: `human:owner`
- Executor: `agent:fixture`
- Accountable: `identity:owner`

## Provenance

- source=fixture; source_id=decision-loop; captured_at=2026-07-27T10:00:00Z

## Structured Data

```json
{"selectedOption":"Adopt"}
```

## Revision

- Created: 2026-07-27T10:00:00Z
- Updated: 2026-07-27T10:09:00Z
- Context: `context:loop`

## Machine Record

```json collective-cognition
{"payload":{"attribution":{"accountableId":"identity:owner","executorId":"agent:fixture","initiatorId":"human:owner"},"contextId":"context:loop","createdAt":"2026-07-27T10:00:00Z","data":{"selectedOption":"Adopt"},"id":"decision:loop","provenance":[{"capturedAt":"2026-07-27T10:00:00Z","source":"fixture","sourceId":"decision-loop"}],"relationships":[{"targetId":"goal:loop","type":"supports-goal"},{"targetId":"evidence:loop","type":"justified-by-evidence"},{"targetId":"option:adopt","type":"considers-option"},{"targetId":"identity:owner","type":"accountable-identity"}],"state":"approved","title":"Adopt loop","type":"decision","updatedAt":"2026-07-27T10:09:00Z","version":3},"recordType":"cognitive-object","schemaVersion":"0.1.0"}
```
