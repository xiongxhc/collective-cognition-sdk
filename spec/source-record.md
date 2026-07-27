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

Every JSON object in the serialized record MUST contain unique member names. Every member name and string value MUST contain only Unicode scalar values; lone UTF-16 surrogates are invalid. Implementations MUST enforce these lexical rules before ordinary parsing erases duplicate names or preserves implementation-specific surrogate values.

JSON Schema operates on an already-parsed JSON value and cannot detect duplicate lexical member names. The schema reinforces scalar-string behavior where validator string semantics permit it; the normative lexical fixtures remain authoritative for the pre-schema boundary.

Implementations MAY additionally reject unsafe language-native inputs such as cycles, accessors, custom prototypes, symbols, or non-finite numbers before serialization. Such hardening MUST NOT change the accepted serialized JSON contract.

Before validation, JSON numbers MUST be interpreted as IEEE 754 binary64 values. A number that overflows to positive or negative infinity is invalid. Lexically different JSON numbers that produce the same binary64 value are the same SourceRecord value. Sources requiring exact decimal or integer precision beyond binary64 MUST encode that value as a JSON string with an application-defined media type or namespaced extension.

## Normative Rules

### SR-001 — Closed Record Object

A SourceRecord MUST be a JSON object. It MUST contain only the fields declared by the `0.1.0` schema. Implementations MUST reject unknown root fields rather than discard them. Serialized objects MUST contain unique member names at the root and every nested level.

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

Every number nested in `content`, `context`, or `extensions` MUST remain within the finite binary64 range. NaN and infinity are invalid. This numeric rule applies recursively.

Every nested string and object member name MUST contain only Unicode scalar values. Lone surrogate code units are invalid.

The complete SourceRecord value MUST contain at most 256 nested JSON containers. The root SourceRecord object has depth 1; each nested object or array increases depth by 1, while primitive values do not increase depth. Implementations MUST reject a deeper record with `INVALID_SOURCE_RECORD` before recursive cloning, freezing, canonicalization, or other processing. This limit is normative prose because JSON Schema Draft 2020-12 cannot express a general recursive depth bound.

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

### Canonical Equality

Duplicate and collision classification MUST compare the canonical JSON value:

```json
{"mediaType":"the literal mediaType string","content":"the content value"}
```

Canonicalization MUST apply these rules recursively:

1. Emit no whitespace between JSON tokens.
2. Preserve `null`, boolean, and array element order.
3. Serialize Unicode-scalar strings with JSON escaping, without Unicode normalization.
4. Serialize finite binary64 numbers exactly as required by [RFC 8785 section 3.2.2.3](https://www.rfc-editor.org/rfc/rfc8785.html#section-3.2.2.3), including its ECMAScript number-serialization procedure and Note 2 enhancement. This procedure serializes negative zero as `0` and preserves forms such as `1e+21` when required by that algorithm.
5. Sort object property names by ascending UTF-16 code units before serialization.
6. Preserve the literal, case-sensitive `mediaType` string and its parameter spelling.

These rules match the relevant primitive serialization and property-ordering behavior of [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html). This specification defines equality over parsed SourceRecord values; it does not preserve insignificant input whitespace, object-member order, or alternate numeric spellings.

For example:

- `{"alpha":1,"beta":2}` and `{"beta":2,"alpha":1}` are equal content;
- `9007199254740992` and `9007199254740993` are equal after binary64 conversion;
- `9007199254740992` and `9007199254740994` are different; and
- `application/json` and `Application/JSON` are different literal media types.

For one source revision key:

- matching canonical `mediaType` and `content` MUST classify as a duplicate;
- different canonical `mediaType` or `content` MUST fail as a collision; and
- changed content MUST use a new `revisionId`.

Ingestion MUST preserve accepted history and MUST NOT silently overwrite a collision.

## Errors

Conforming validators and ingestion implementations MUST expose `INVALID_SOURCE_RECORD` for SourceRecord structural failures. Conforming ingestion implementations MUST expose `SOURCE_REVISION_COLLISION` when an existing source revision key has different canonical media type or content.

Implementations MAY use different error envelopes, exception types, or result structures, but the applicable stable code MUST remain machine-readable. Human-readable messages, ordering, and validator-library paths are not portable API.

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

Valid fixtures are direct SourceRecord values. Invalid fixtures are envelopes containing `description`, `ruleId`, `expectedCode`, and exactly one of:

- `record`, for ordinary invalid values; or
- `recordJson`, for a serialized record whose lexical form must reach the parser unchanged.

Cases set `validationLayer` to `"lexical"` when duplicate member names or invalid surrogate sequences MUST be rejected before ordinary parsing. They set it to `"runtime"` when a normative rule, such as recursive depth, cannot be expressed by JSON Schema. Fixtures without `validationLayer` are schema assertions. `expectedCode` is normative. Fixture order is not normative.

| Rule | Schema location | Fixture coverage |
|---|---|---|
| `SR-001` | root `type`, `additionalProperties`; lexical profile | unknown root field, duplicate root member |
| `SR-002` | `properties.schemaVersion` | unsupported schema version |
| `SR-003` | `properties.id` | whitespace-only record ID |
| `SR-004` | `properties.source` | missing/blank system, unknown source field |
| `SR-005` | `properties.sourceId`, `properties.revisionId` | missing revision, blank source ID |
| `SR-006` | `$defs.timestamp` | calendar, timezone, case, leap-second, hour, and offset failures |
| `SR-007` | `properties.mediaType` | non-string and malformed values |
| `SR-008` | root `required`, `properties.content`, `$defs.jsonValue`; lexical and runtime profiles | missing content, binary64 overflow, duplicate nested member, lone surrogate value/key, valid depth 256, invalid depth 257; valid fixtures cover every JSON value shape |
| `SR-009` | `properties.contentHash`, `properties.actorId` | blank hash and non-string actor |
| `SR-010` | `properties.context` | wrong type and forbidden interpretation keys |
| `SR-011` | `properties.extensions` | wrong type and unnamespaced key |

An implementation claiming conformance to SourceRecord `0.1.0` MUST pass every valid and invalid fixture, expose each invalid fixture's `expectedCode`, and implement the prose-only depth, numeric, canonicalization, ingestion, immutability, collision, and trust-boundary requirements applicable to its role.
