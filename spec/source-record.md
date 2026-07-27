# SourceRecord 0.1.0

## Status and Scope

This document defines the experimental normative serialized contract for `SourceRecord` version `0.1.0`.

A SourceRecord preserves material collected from an external source before cognitive interpretation:

```text
external material → SourceRecord → explicit promotion → CognitiveObject
```

Schema validity does not make source material evidence, truth, accepted knowledge, authority, consent, a decision, or an organizational principle. Those meanings require explicit promotion and the applicable human and governance controls.

The JSON Schema at [`schemas/0.1.0/source-record.schema.json`](schemas/0.1.0/source-record.schema.json) is normative for serialized structure. This prose is normative for lifecycle and trust-boundary behavior that JSON Schema cannot express.

## Terminology

- **Source system:** The external system or source category from which material was collected.
- **Source item:** The logical item identified by `sourceId`.
- **Source revision:** One immutable version of a source item identified by `revisionId`.
- **Source revision key:** The ordered tuple of `source.system`, optional `source.instance`, `sourceId`, and `revisionId`.
- **Accepted record:** A valid SourceRecord retained by an ingestion operation.
- **Duplicate:** A record whose source revision key and canonical `mediaType` plus `content` match a retained record.
- **Collision:** A record whose source revision key matches a retained record while canonical `mediaType` plus `content` differ.

## Serialization Boundary

A serialized SourceRecord MUST be one JSON object. JSON arrays, primitives, or non-JSON language values are not SourceRecords.

JSON Schema operates on serialized JSON. Implementations MAY additionally reject unsafe language-native inputs such as cycles, accessors, custom prototypes, symbols, or non-finite numbers before serialization. Such hardening MUST NOT change the accepted serialized JSON contract.

## Normative Rules

### SR-001 — Closed Record Object

A SourceRecord MUST be a JSON object. It MUST contain only the fields declared by the `0.1.0` schema. Implementations MUST reject unknown root fields rather than discard them.

### SR-002 — Schema Version

`schemaVersion` MUST be present and MUST equal `"0.1.0"`.

### SR-003 — Record Identity

`id` MUST be present and MUST be a string containing at least one non-whitespace character. It identifies this record, not the source item or revision.

### SR-004 — Source Identity

`source` MUST be a JSON object containing `system`. `source.system` and optional `source.instance` MUST contain at least one non-whitespace character. The source object MUST NOT contain unknown fields.

### SR-005 — Item and Revision Identity

`sourceId` and `revisionId` MUST be present and MUST each contain at least one non-whitespace character.

Collectors MUST issue a new `revisionId` when the source item's `mediaType` or `content` changes. An implementation MUST NOT overwrite an accepted record under an existing source revision key.

### SR-006 — Timestamp Profile

`capturedAt` MUST be present. Optional `observedAt`, when provided, MUST use the same profile.

Timestamps MUST:

- use an uppercase `T` date-time separator;
- use uppercase `Z` or an explicit signed offset;
- contain a valid Gregorian calendar date, including leap-year rules;
- use hours `00` through `23`, minutes `00` through `59`, and seconds `00` through `59`;
- exclude leap seconds;
- use offsets from `00:00` through `23:59`; and
- contain between one and nine fractional-second digits when a fraction is present.

The schema retains the standard `date-time` annotation for tooling, but its pattern independently asserts this complete profile.

### SR-007 — Media Type

`mediaType` MUST be present and MUST use the media-type grammar encoded by the schema. A bare type, missing subtype, or non-string value is invalid.

### SR-008 — Source Content

`content` MUST be present and MAY be any JSON value, including `null`, a primitive, an array, or an object.

Implementations MUST preserve source-authored content without silently adding cognitive interpretation.

### SR-009 — Optional Source Metadata

Optional `contentHash` and `actorId` MUST each contain at least one non-whitespace character when present.

`contentHash` is opaque caller-supplied metadata. An implementation MUST NOT claim digest validity or content binding unless an external trust boundary explicitly verifies both.

### SR-010 — Neutral Context

Optional `context` MUST be a JSON object. Its immediate properties MUST NOT be named `polarity`, `confidence`, or `authority`.

Context MAY preserve neutral source metadata. It MUST NOT be used to bypass explicit promotion or authorization.

### SR-011 — Namespaced Extensions

Optional `extensions` MUST be a JSON object. Every immediate extension key MUST contain a non-empty namespace and name separated by at least one colon or dot.

Implementations MUST NOT treat unsupported unnamespaced fields as extensions.

## Ingestion and Immutability

An implementation MUST validate a record before acceptance. Once accepted, the record MUST be immutable or treated as immutable by the implementation.

For one source revision key:

- matching canonical `mediaType` and `content` MUST classify as a duplicate;
- different canonical `mediaType` or `content` MUST fail as a collision; and
- changed content MUST use a new `revisionId`.

Ingestion MUST preserve accepted history and MUST NOT silently overwrite a collision.

## Errors

The TypeScript reference implementation reports structural failures with `INVALID_SOURCE_RECORD` and source revision collisions with `SOURCE_REVISION_COLLISION`.

Portable consumers MAY use different error representations. They SHOULD preserve stable machine-readable categories. Validator-specific messages, ordering, and schema-library paths are not portable API.

## Compatibility

The schema identifier is:

```text
urn:collective-cognition:schema:source-record:0.1.0
```

Editorial corrections that do not change accepted serialized values MAY update this prose without changing `schemaVersion`.

Any change that alters which serialized records are accepted or rejected MUST use a new schema-version artifact and matching conformance fixtures. A released versioned schema artifact MUST NOT be silently repurposed.

Namespaced extension values MAY evolve without adding fields to the core record.

## Conformance

The normative fixtures are:

- [`conformance/0.1.0/source-record/valid.jsonl`](conformance/0.1.0/source-record/valid.jsonl)
- [`conformance/0.1.0/source-record/invalid.jsonl`](conformance/0.1.0/source-record/invalid.jsonl)

Valid fixtures are direct SourceRecord values. Invalid fixtures are envelopes containing `description`, `ruleId`, `expectedCode`, and `record`. Fixture order is not normative.

| Rule | Schema location | Fixture coverage |
|---|---|---|
| `SR-001` | root `type`, `additionalProperties` | unknown root field |
| `SR-002` | `properties.schemaVersion` | unsupported schema version |
| `SR-003` | `properties.id` | whitespace-only record ID |
| `SR-004` | `properties.source` | missing/blank system, unknown source field |
| `SR-005` | `properties.sourceId`, `properties.revisionId` | missing revision, blank source ID |
| `SR-006` | `$defs.timestamp` | calendar, timezone, case, leap-second, hour, and offset failures |
| `SR-007` | `properties.mediaType` | non-string and malformed values |
| `SR-008` | root `required`, `properties.content` | missing content; valid fixtures cover every JSON value shape |
| `SR-009` | `properties.contentHash`, `properties.actorId` | blank hash and non-string actor |
| `SR-010` | `properties.context` | wrong type and forbidden interpretation keys |
| `SR-011` | `properties.extensions` | wrong type and unnamespaced key |

An implementation claiming conformance to SourceRecord `0.1.0` MUST pass every valid and invalid fixture and MUST implement the prose-only ingestion, immutability, collision, and trust-boundary requirements applicable to its role.
