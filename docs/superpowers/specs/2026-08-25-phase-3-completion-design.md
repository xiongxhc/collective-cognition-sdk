# Phase 3 Completion Design

**Status:** Approved for implementation
**Date:** 2026-08-25
**Target package:** public `1.0.0`, preceded by `1.0.0-rc.1`

## User Problem

The SDK already has a tested TypeScript cognition runtime, portable records,
host contracts, persistence references, adapters, connectors, and durable
workflows, but another team still cannot treat it as a stable universal SDK.
The broader cognition semantics are not yet defined in one language-neutral
charter, cognitive objects and events lack dedicated standalone schema
projections and fixtures, the package API has no post-`1.0.0` stability
baseline, and npm publication is deliberately blocked.

Phase 3 must close those gaps without turning the SDK into a hosted product,
making Team Memory or Obsidian normative, selecting a mandatory database, or
claiming production certification.

## Decision Summary

Phase 3 will finish through a contract-first, layered design:

1. a language-neutral Collective Cognition Charter `1.0.0` defines shared
   primitives, the seven cognitive object families, relationships, lifecycle
   transitions, events, authorization boundaries, and stable errors;
2. modular JSON Schema Draft 2020-12 artifacts and normative fixtures project
   the cognitive-object and cognition-event payloads already defined by
   Portable Cognition Contract `0.1.0`, without creating a parallel record
   version;
3. the existing TypeScript SDK remains the reference implementation and is
   aligned only where it contradicts the approved contract;
4. the release candidate and stable package receive separate immutable
   compatibility baselines and Distribution Readiness Profiles, plus complete
   stable API guarantees and migration guidance;
5. a verified `1.0.0-rc.1` release candidate precedes npm publication of
   `1.0.0`; and
6. adapters, connectors, stores, conformance harnesses, and workflows may
   remain Supported Experimental even though the core contracts and runtime
   become stable.

The result is a stable language-neutral cognition contract and TypeScript
reference SDK. It is not a cognition service, team agent, scheduler, policy engine,
security certification, or long-term support commitment.

## Considered Approaches

### 1. Contract-first stable core

**Selected.** Preserve working runtime semantics, define their portable meaning
normatively, add schemas and conformance evidence, freeze the core public API,
then publish a verified stable package. This makes the SDK reusable from other
languages and hosts without expanding Phase 3 into a platform rewrite.

### 2. Schema every runtime and adapter surface

Rejected. Store interfaces, policies, connectors, workflows, and filesystem
adapters include behavioral and host-owned concerns that JSON Schema cannot
express. Schematizing every surface would create false portability claims and
couple the charter to Node-specific reference implementations.

### 3. Publish the current package with minimal documentation

Rejected. Removing the npm guard without completing the broader semantics,
schemas, stable API boundary, release checks, and migration policy would satisfy
distribution mechanically while leaving Phase 3 substantively incomplete.

## Layered Architecture

```text
      host applications such as team-cognition-agent
      persistence, authorization, automation, UI, policy
                         |
              chooses an implementation
                         |
             +-----------+-----------+
             |                       |
             v                       v
 TypeScript reference SDK       other-language SDK
 maintained adapters, stores,   independent adapters,
 connectors, and workflows      connectors, and stores
             |                       |
             +-----------+-----------+
                         |
                         v conforms directly to
 portable schemas, fixtures, and existing contracts 0.1.0
                         |
                         v governed by
language-neutral Collective Cognition Charter 1.0.0
```

Dependency direction is downward from hosts to optional SDK components and
from every implementation to the portable contracts. The charter does not
depend on Team Memory, Git, Markdown, Obsidian, SQLite, TypeScript, or a host
application. Connectors produce SourceRecords; they do not call one another or
become cognition hosts. Individual-memory collection remains outside this SDK
until a connector explicitly maps it into the portable source boundary.

## Contract Boundary

### Preserved normative contracts

The following existing Normative Stable `0.1.0` resources remain byte-immutable:

- SourceRecord Contract and schema;
- Portable Cognition Contract and schema;
- Host Integration Contract;
- existing versioned SourceRecord and Portable Cognition fixtures; and
- every historical compatibility baseline and versioned profile.

The Charter `1.0.0` composes and clarifies these resources. It does not silently
rewrite their historical bytes or change their versioned meanings. If an
irreconcilable contradiction is discovered, implementation must stop and use
the compatibility and RFC process rather than modifying a historical artifact.

Portable Cognition `0.1.0` already normatively defines cognitive-object and
cognition-event payloads inside its envelope. The new standalone schemas are
exact `0.1.0` projections of those payloads for consumers that need direct
validation. They do not introduce Portable Cognition `1.0.0`, change event
`schemaVersion`, widen accepted values, or reinterpret an existing fixture.

### Charter contents

The Collective Cognition Charter `1.0.0` defines:

- normative terms and requirement keywords;
- JSON-compatible primitive, object, array, string, number, timestamp, and
  extension rules shared by the new serialized contracts;
- the distinction among source observations, Evidence, Decisions, Principles,
  and host-owned acceptance or publication;
- actor kinds, attribution roles, provenance references, context boundaries,
  versioning, immutability, and identity;
- seven cognitive object families: Identity, Goal, Hypothesis, Experiment,
  Evidence, Decision, and Principle;
- allowed states, initial states, required relationships, relationship
  direction, duplicate handling, and reference integrity expectations;
- lifecycle transition tables and event correlation rules;
- manual, automated, routine, and consequential authorization boundaries;
- human-confirmation binding and the distinction between confirmation data and
  host authentication;
- stable domain-error codes, safe serialized error expectations, and the
  boundary between domain failure and host/runtime failure; and
- rule identifiers mapped to schema assertions, fixtures, tests, or an explicit
  prose-only rationale.

### Non-claims

The charter does not define organizational truth, consensus, endorsement,
belief, confidence calibration, automatic classification, automatic promotion,
mandatory retention, a global identity provider, or universal source quality.
Conformance means contract compatibility, not security or production
certification.

## Cognitive Object Projection `0.1.0`

### Shared envelope

One discriminated cognitive-object envelope carries:

- `id`, `type`, `version`, `state`, and `title`;
- type-specific `data`;
- `createdAt` and `updatedAt`;
- initiator, executor, and accountable attribution IDs;
- one or more provenance references;
- `contextId`;
- explicit directed relationships; and
- optional namespaced extensions.

The top-level `type` discriminator selects exactly one of the seven object
families. The standalone schema uses one public cognitive-object artifact with
internal `$defs`, rather than seven unrelated top-level formats. This keeps
shared rules identical and permits independent implementations to dispatch by
object type while accepting exactly the cognitive-object payloads accepted by
Portable Cognition `0.1.0`.

Standalone acceptance is defined through an implicit canonical Portable
Cognition envelope:

```json
{
  "schemaVersion": "0.1.0",
  "recordType": "cognitive-object",
  "payload": "<the standalone payload>"
}
```

The cognition-event projection substitutes `cognition-event` as the record
type. A standalone payload conforms if and only if this canonical envelope
conforms. Because Portable Cognition `PCR-004` allows at most 256 nested JSON
containers counting the envelope object as depth 1, the payload object sits at
depth 2 inside the envelope. A standalone payload therefore MUST contain at most
255 nested JSON containers, counting the standalone payload root object as
depth 1; a standalone payload whose deepest container is at depth 256 is
invalid. Fixtures include the depth-255 valid boundary and a depth-256 invalid
runtime-layer case for each projection. Reference validators apply the existing
lossless lexical profile to standalone JSON text, wrap the parsed payload
without semantic transformation, and preserve the existing error split:
malformed JSON text reports `SERIALIZATION_ERROR`; invalid structure, depth, or
semantics reports `INVALID_PORTABLE_COGNITION_RECORD`. Schema-only consumers
validate structure but must apply these prose rules to claim full conformance.

### Type semantics

The schema reproduces Portable Cognition's already-closed state and relationship
enumerations. It also defines the currently supported well-known fields in each
`data` object while retaining Portable Cognition `0.1.0`'s existing open JSON-
compatible `data` boundary. The projection must not add required fields or
reject any payload accepted by the immutable Portable Cognition `0.1.0`
contract.

Required relationship groups preserve the current runtime meaning:

- a Hypothesis supports at least one Goal;
- an Experiment tests a Hypothesis;
- Evidence relates to a Hypothesis or Experiment using a declared evidence
  relationship;
- a Decision has a `supports-goal` relationship, at least one justification
  relationship of type `justified-by-evidence` or `informs-decision`, a
  `considers-option` relationship, and an `accountable-identity` relationship;
  and
- a Principle is justified by a Decision or Evidence.

Schema validation proves local shape and declared relationship requirements.
Resolution of `targetId` values, target-type compatibility, and cross-record
referential integrity are conformance and host checks because a standalone
JSON document may not contain the target object.

## Cognition Event Projection `0.1.0`

A separate Cognition Event `0.1.0` schema projects the append-only audit payload
already defined by Portable Cognition `0.1.0`. It includes:

- event identity and schema version;
- correlated object identity, type, and resulting object version;
- previous and next state;
- occurrence time and context;
- initiator, executor, and accountable actors;
- automation mode and consequence level;
- rationale and provenance; and
- optional human confirmation bound to the same object, target state, event,
  and timeline.

The event schema validates serialized data. Conformance checks additionally
prove that the event matches the resulting cognitive object, increments the
object version exactly once, represents an allowed transition, and cannot be
used to mutate historical event records.

Phase 3 does not add a generic event bus, transport protocol, webhook,
scheduler, outbox, or hosted publication service. Existing host and durable
workflow contracts continue to own storage and publication boundaries.

## Authorization and Promotion

Authorization is divided into portable evidence and host-owned enforcement:

- the charter normatively defines transition context, authorization outcomes,
  consequence classes, and when human confirmation is required;
- schemas cover serializable actors, transition context, confirmation, and
  event evidence;
- the TypeScript reference policy and conformance suite demonstrate the
  normative behavior; and
- hosts remain responsible for authentication, authorization-policy selection,
  credential handling, tenant or workspace isolation, and proof that a claimed
  human actor is authentic.

SourceRecord ingestion never implies Evidence, and Evidence never implies a
Decision or Principle. Promotion into attributable neutral Evidence remains an
explicit policy action. Decisions and Principles require explicit creation and
their declared relationship, attribution, provenance, authorization, and
confirmation rules. No connector may infer them from collected activity.

## Stable Errors

The stable root `DomainErrorCode` catalog contains exactly:

```text
INVALID_OBJECT
INVALID_SOURCE_RECORD
INVALID_RELATIONSHIP
INVALID_TRANSITION
CONFIRMATION_REQUIRED
AUTHORIZATION_DENIED
SERIALIZATION_ERROR
SOURCE_REVISION_COLLISION
INGESTION_LIMIT_EXCEEDED
PROMOTION_FAILED
INVALID_PORTABLE_COGNITION_RECORD
INVALID_HOST_INTEGRATION_REQUEST
```

Portable Cognition `0.1.0` domain-error payloads retain their immutable eleven-
code allowlist and do not add `INVALID_HOST_INTEGRATION_REQUEST`. The host-only
code remains part of the stable root runtime catalog, not the historical
portable payload contract. Each code has a normative condition category,
compatibility meaning, and secret-safe serialization rule. Human-readable
messages and safe `details` remain descriptive unless a rule explicitly
promotes a field to normative status.

Adapter-, connector-, store-, workflow-, operating-system-, and transport-
specific errors remain owned by their respective Supported Experimental
contracts. They do not expand the stable root-domain catalog accidentally.

## Machine-Readable Resources

The implementation is expected to add the following versioned resources:

```text
spec/
  collective-cognition-charter.md
  schemas/0.1.0/
    cognitive-object.schema.json
    cognition-event.schema.json
  conformance/0.1.0/
    cognitive-object/
      valid.jsonl
      invalid.jsonl
    cognition-event/
      valid.jsonl
      invalid.jsonl
      lifecycle.jsonl
```

Stable package resource subpaths are expected to be:

```text
collective-cognition-sdk/charter/1.0.0
collective-cognition-sdk/schemas/cognitive-object/0.1.0
collective-cognition-sdk/schemas/cognition-event/0.1.0
collective-cognition-sdk/conformance/cognitive-object/0.1.0/valid
collective-cognition-sdk/conformance/cognitive-object/0.1.0/invalid
collective-cognition-sdk/conformance/cognition-event/0.1.0/valid
collective-cognition-sdk/conformance/cognition-event/0.1.0/invalid
collective-cognition-sdk/conformance/cognition-event/0.1.0/lifecycle
```

The existing convention also exposes every compatibility baseline at
`collective-cognition-sdk/compatibility/<version>` and every Distribution
Readiness Profile at `collective-cognition-sdk/distribution-readiness/<version>`.
The release sequence below therefore adds these subpaths, and stable package
`1.0.0` ships all of them permanently:

```text
collective-cognition-sdk/compatibility/1.0.0-rc.1
collective-cognition-sdk/compatibility/1.0.0-rc.N   (one per later candidate)
collective-cognition-sdk/compatibility/1.0.0
collective-cognition-sdk/distribution-readiness/0.2.0-rc.1
collective-cognition-sdk/distribution-readiness/0.2.0-rc.N   (one per later candidate)
collective-cognition-sdk/distribution-readiness/0.2.0
```

Each release candidate permanently adds one immutable baseline and one
immutable profile to every later `1.x` package. This is accepted; the
implementation plan must keep the candidate count small rather than dropping
candidate artifacts from the stable package. Before Slice B starts, the plan
must confirm that the baseline and profile JSON version fields, their schema
patterns, and the compatibility tests accept Semantic Versioning prerelease
identifiers such as `1.0.0-rc.1` and `0.2.0-rc.1`; if they do not, the
additive change is made in Slice A.

The implementation plan may refine internal file placement, but it must not
multiply public subpaths beyond the two lists above without a demonstrated
consumer. All normative resources are UTF-8 file resources resolved explicitly
by consumers; they are not JavaScript modules.

## Compatibility and Stability

### Stable `1.0.0` boundary

Package `1.0.0` establishes the first stable public package baseline. Semantic
Versioning protects every package surface shipped in `1.0.0`; an experimental
maturity label is not a compatibility exemption.

The complete stability matrix is:

| Surface | `1.0.0` classification | Compatibility rule |
| --- | --- | --- |
| Root runtime and type exports recorded by the `1.0.0` baseline | Stable Public API | Removal or incompatible behavior/type change requires package `2.0.0`. |
| `DomainErrorCode` twelve-code root catalog | Stable Public API | Removal or changed meaning requires package `2.0.0`; Portable Cognition keeps its separate immutable eleven-code allowlist. |
| Generic `collective-cognition` executable | Stable Public API | Command names, machine-readable success output, diagnostics, and exit behavior are SemVer protected. |
| Charter, historical contracts, schemas, fixtures, profiles, compatibility baselines, and new normative resource subpaths | Normative Stable | Published versioned bytes and meanings are immutable; changed contracts use new resource versions. |
| Markdown adapter; connector conformance; Team Memory and Git connectors; host conformance; reference host; SQLite stores; durable workflow | Supported Experimental maturity, SemVer protected | Existing versioned subpaths remain import-compatible through package `1.x`; incompatible replacements use a new versioned subpath or package `2.0.0`. |
| `collective-cognition-teammem`, `collective-cognition-markdown`, and `collective-cognition-workflow` executables | Supported Experimental maturity, SemVer protected | Installed names and documented behavior remain compatible through package `1.x`; incompatible replacement requires package `2.0.0`. |
| `./package.json` export and selected package metadata | Stable introspection surface | Baseline-selected fields follow the compatibility policy. |
| Repository source, tests, examples, generated file paths, and unexported modules | Internal | No compatibility promise. |

The root baseline includes every runtime and type export currently declared by
the current private package (`0.11.0` after Slice A); implementation may add
the minimum new charter validation
exports, but it may not remove or relocate an existing root export before
`1.0.0`. The final baseline and public API reference enumerate every name.

This matrix changes the compatibility policy itself. `spec/compatibility.md`
currently classifies root exports, root declarations, the four executables, CLI
behavior, and non-SourceRecord domain error codes as Supported Experimental
that "can evolve under this policy before `1.0.0`", and `COMP-003` permits
reviewed breaking Supported Experimental changes in a pre-`1.0.0` minor
release. The stability table classifies the policy itself as Normative Stable,
and `COMP-002` forbids behavior-changing in-place edits to a Normative Stable
resource, so this change cannot be an unversioned in-place amendment. Slice B
instead revises the policy through its existing version mechanism: every
compatibility baseline records a `packagePolicyVersion` (currently `0.1.0`),
so the revised policy is published as `packagePolicyVersion` `1.0.0`, recorded
by compatibility baseline `1.0.0-rc.1` and every later baseline, while
historical baselines `0.1.0` through `0.11.0` keep recording policy `0.1.0`
and the rules that governed them remain recoverable from those immutable
baselines and the Phase 3 RFC. The revised policy moves the surfaces listed
above into Stable Public API, redefines Supported Experimental as an
operational-maturity label that is SemVer protected from `1.0.0` onward, and
adds a post-`1.0.0` rule stating that an incompatible Supported Experimental
change requires a new versioned subpath or a major package release. The
`minor-before-1.0` mechanism applies only under policy `0.1.0` and is not
available at or after `1.0.0`. The revision is recorded in the Phase 3 RFC
and migration guidance.

Semantic Versioning applies to:

- the package root's documented core runtime and type exports;
- declared stable package resource subpaths;
- installed core CLI behavior classified as stable by the final public API
  inventory;
- normative schemas, fixtures, error codes, and contract meaning; and
- selected package metadata and declaration closure recorded by compatibility
  baseline `1.0.0`.

After `1.0.0`, removal, incompatible signature changes, newly required data,
changed normative meaning, invalidation of previously valid stable records, or
changed stable CLI output requires a major package version unless an existing
versioned contract explicitly defines another migration mechanism.

Additive optional fields, additive stable subpaths, additive object-contract
versions, and bug fixes that only reject inputs already invalid under the
normative contract may use minor or patch releases as classified by the
compatibility policy.

### Experimental maturity boundary

Connectors, adapters, stores, reference hosts, conformance harness APIs, and
durable workflows remain Supported Experimental in operational maturity. This
does not certify their host dependencies, behavior, or production suitability,
and it does not permit breaking them in package `1.x`. Incompatible evolution
uses a new versioned subpath while retaining the old path, or waits for package
`2.0.0`.

Existing records remain readable through explicit contract-version dispatch.
No `1.0.0` implementation may reinterpret an existing `0.1.0` record as if it
were authored against a new schema.

## Distribution Readiness

Distribution Readiness Profile candidate `0.2.0-rc.1` describes the first
release-candidate artifact before publication. Final profile `0.2.0` describes
stable `1.0.0` before publication. They are separate immutable packaged
resources, and both supersede only the descriptive status of historical profile
`0.1.0` without modifying it. Each packaged profile records:

- source repository and license availability;
- exact package version and supported runtime;
- registry-name verification and expected publication identity;
- the npm publication state, expressed in the existing `DRP-002` closed
  vocabulary — `blocked` until the accountable-human publication gate is
  approved; the profile introduces no `pending` or other new status value
  without an explicit reviewed vocabulary amendment in its own prose — and
  the approved provenance mechanism;
- package-content, clean-install, compatibility, test, and security gates;
- the intended immutable Git tag and release workflow identity;
- stable and experimental support boundaries; and
- production-readiness, certification, and LTS status as separate non-claims.

Observed facts that cannot exist before the package bytes are finalized belong
to a separate, non-packaged immutable Release Evidence Record for each RC and
stable release. That record contains the registry publication time, registry
archive digest, npm provenance identity and verification, dist-tags, Git tag
and tag-object identity, GitHub release and workflow run, and post-publication
clean-consumer results. It is attached to the GitHub release and reconciled in
the repository after publication without changing the released package or tag.

Each canonical JSON record uses the version-keyed repository path
`docs/acceptance/releases/<version>/release-evidence.json` and the GitHub asset
name `collective-cognition-sdk-<version>-release-evidence.json`. The repository
copy and downloaded release asset must be byte-identical. Their SHA-256 is
recorded in the GitHub release notes and in
`docs/acceptance/releases/<version>/SHA256SUMS`, and CI rechecks the binding.
Neither asset nor repository record may be replaced. A correction is an
append-only numbered amendment that retains and references the original bytes.

Apache-2.0, `NOTICE`, and `CITATION.cff` remain included in the package. Package
inspection must find no private Team Vault data, real team-memory records,
credentials, local absolute paths, internal configuration, planning artifacts,
or unapproved source and test files.

## Release Sequence

Phase 3 implementation is divided into three sequential slices.

### Slice A: charter and conformance

- add the Charter, schemas, fixtures, rule mapping, and conformance tests;
- align the TypeScript runtime only where contract evidence requires it;
- add package resource exports and compatibility evidence without enabling
  publication; and
- update all public Markdown and the roadmap to describe the candidate state.

### Slice B: stable package candidate

- implement and verify the approved stability matrix for every root export,
  subpath, executable, error catalog, and selected package field;
- draft and review immutable compatibility baseline `1.0.0-rc.1`, migration
  guidance, and Distribution Readiness Profile `0.2.0-rc.1` candidate evidence;
  the baseline and profile files themselves land in the release commit below,
  because they name the candidate version that the tests pin;
- give every later `1.0.0-rc.N` its own immutable compatibility baseline and
  Distribution Readiness Profile candidate version, landed the same way in
  that candidate's release commit;
- pass all private-package pre-unlock tests, compatibility checks,
  documentation checks, security checks, and package-inventory simulation;
- land the release workflow change described at the start of Slice C on `main`
  before the release commit, so that the commit later tagged already contains
  `npm-publish.yml` and no longer matches the retired prerelease trigger;
- create one reviewed release commit on `main` that, together, sets
  `1.0.0-rc.1`, removes `"private": true`, adds the new
  `spec/compatibility/1.0.0-rc.1/` and `spec/distribution-readiness/0.2.0-rc.1/`
  directories with their package exports, and flips the publication guards
  that assert the private state and the pinned package version: the
  `test:package`, compatibility, and distribution-readiness tests that require
  `private === true` or the current pinned pre-release version, and the
  "private and unpublished"
  status prose in `README.md`, `docs/`, and `spec/`. These land in one commit
  because the tests pin the package version, so a baseline naming `1.0.0-rc.1`
  cannot pass before the bump, and `prepack` runs `test:package`, so a release
  commit that leaves the guards untouched cannot be packed. The release commit
  changes nothing else: no existing file under `src/`, `spec/schemas/`,
  `spec/conformance/`, or `spec/compatibility/` is modified, so contract and
  runtime semantics are byte-identical to the reviewed pre-release head;
- build the exact publishable `1.0.0-rc.1` archive from that commit; and
- verify that exact archive in a clean external consumer and CI matrix before
  requesting publication approval.

### Slice C: release bootstrap and stable publication

Two facts about the npm registry must be verified against current npm
documentation and a throwaway scoped test package, and the outcome recorded in
the RC Release Evidence Record. The experiments depend on nothing from Slices
A or B, so they run as early as possible — in parallel with remaining Slice B
work at the latest — and both outcomes must be known before the Slice B
release commit is created, because fact 1 decides whether a mandatory extra
candidate (with its own permanent baseline and profile) exists:

1. whether a trusted publisher can be configured for a package name that does
   not yet exist on the registry. If it can, the token bootstrap below is
   skipped entirely and `1.0.0-rc.1` is published through OIDC; if it cannot,
   the bootstrap is used once and the OIDC-published `1.0.0-rc.2` is mandatory.
2. whether the first-ever publication of a package with `--tag next` leaves
   `latest` unset. If it does not, no automated correction exists at that
   point: npm does not allow removing the `latest` tag, and with a single
   published version there is nothing to repoint it to. The condition is
   recorded in the RC Release Evidence Record as a known temporary state, the
   README and release notes state that the `next` version is a prerelease, and
   the next publication (the following candidate or stable `1.0.0`) repoints
   `latest`, with the stable verification step confirming the final dist-tag
   state.

Ordering within the slice:

- the first step already landed on `main` during Slice B: narrow
  `.github/workflows/github-prerelease.yml`, which currently triggers on every
  `v*` tag and asserts the immutable `v0.6.0` manifest, so that it never
  processes a `v1` tag, and add the dedicated protected
  `.github/workflows/npm-publish.yml` path. GitHub Actions evaluates workflow
  files at the pushed tag's commit, so this change must precede the release
  commit rather than follow it;
- the release workflow runs only on GitHub-hosted runners with npm CLI
  `11.5.1` or later, `id-token: write`, and a protected GitHub environment
  whose name and the `npm-publish.yml` filename match the npm trusted-publisher
  configuration exactly;
- create and push an approved annotated `v1.0.0-rc.1` tag on the exact verified
  RC commit, which must be the current `main` head, triggering only the new
  protected workflow;
- if the bootstrap is required: publish the first registry package from the
  protected GitHub environment with a short-lived granular npm token and
  explicit provenance, using `--tag next`; then configure npm trusted
  publishing for the exact public repository, `npm-publish.yml` workflow
  filename, protected GitHub environment, and `npm publish` action; then set
  the package to require two-factor authentication and disallow tokens, and
  revoke the bootstrap token;
- if the bootstrap was required, publish a newly tagged `1.0.0-rc.2` through
  OIDC. The trusted-publisher path is proven only when at least one release
  candidate has been published through it; a token-published candidate does
  not satisfy completion criterion 4. Never overwrite an RC or move its tag;
- verify registry bytes, installation, imports, CLIs, metadata, provenance,
  license, citation, and `next`/`latest` dist-tags from an unauthenticated clean
  consumer;
- create the RC GitHub prerelease from its existing tag, attach the canonical
  RC Release Evidence Record, reconcile the exact repository copy and digest,
  and pass its binding check before any stable promotion work begins;
- promote unchanged contract/runtime semantics plus explicitly reviewed
  release-metadata changes to `1.0.0`, creating new immutable compatibility
  baseline `1.0.0` and Distribution Readiness Profile `0.2.0` artifacts;
- rebuild and recheck the exact final archive;
- present the final version, commit, archive inventory, digest, and gate results
  for accountable-human approval immediately before stable publication;
- create and push the annotated immutable `v1.0.0` tag on the approved commit,
  which must be the current `main` head,
  triggering the protected trusted-publisher workflow;
- publish `1.0.0` through trusted publishing, verify that `latest` resolves to
  `1.0.0` and `next` remains explicit or is intentionally removed, then verify
  registry and clean-consumer behavior again;
- create the GitHub release from that existing tag; and
- attach and later repository-record the immutable stable Release Evidence
  Record without changing the published package or tag.

The trusted-publisher workflow follows npm's current
[OIDC requirements](https://docs.npmjs.com/trusted-publishers/) and uses a
GitHub environment approval. npm's documented
[distribution-tag default](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/)
is to move `latest` unless `--tag` is supplied, so every prerelease command
names `next` explicitly. The privileged publish job receives the exact verified
archive and does not run repository dependency or lifecycle code after
approval: it runs `npm publish <archive>.tgz --ignore-scripts` from a directory
containing no repository checkout, because the repository's `prepack` script
builds and tests and must not execute inside the privileged job.

Public tags and published registry versions are immutable. A failed candidate
is corrected in a new prerelease version; tags and published versions are never
moved or overwritten.

## Verification Strategy

### Schema and conformance

- valid and invalid fixtures cover every cognitive object family and event;
- lexical checks reject duplicate JSON member names and lone surrogates before
  schema parsing where JSON Schema cannot observe them;
- runtime depth, finite-number, Unicode scalar, timestamp, extension, and
  immutability boundaries have differential tests;
- relationship fixtures cover requirements, duplicates, unknown types, broken
  references, and incompatible targets;
- lifecycle fixtures cover every allowed and representative forbidden
  transition, version correlation, event correlation, and confirmation binding;
- error fixtures prove stable codes and safe details; and
- every normative Charter rule maps to an assertion, fixture, test, or an
  explicit prose-only rationale.

### Regression and integration

- existing SourceRecord, Portable Cognition, host, persistence, connector,
  Markdown, durable workflow, CLI, and interoperability tests continue to pass;
- TypeScript type checking, syntax checks, package-export checks, exact package
  inventory, and clean consumer installation pass;
- an external sample host ingests records, creates a Hypothesis, promotes
  selected records to attributable neutral Evidence, records a Decision,
  persists and reloads the objects and events, and exports Portable Cognition;
- the sample uses temporary fictional sources and a separate cognition store;
  it never reads or mutates a real Team Vault; and
- independent specification, API, security, and release reviews find no
  release-blocking issue.

### Release gates

Before either npm publication:

- the private candidate passes the supported Node matrix locally where
  reproducible and in CI before the publication guard is removed;
- the reviewed release commit removes the guard and changes only the approved
  release-commit change set defined in Slice B: the `package.json` version,
  private flag, and new resource exports; the new RC baseline and profile
  directories; the tests that pin the private state and package version; the
  `STAB-002` surface enumeration in `spec/compatibility.md`, together with the
  `currentBaselineUrl` repoint in `tests/compatibility.test.mjs` that binds it,
  because that enumeration lists the surfaces of the compatibility baseline
  this same commit records; and the status prose in `README.md`, `docs/`, and
  `spec/`. Release Evidence Records are post-publication artifacts and are
  never part of this commit.
  A diff against the pre-release head shows new files only under
  `spec/compatibility/` and `spec/distribution-readiness/`, modifications only
  to `package.json`, the named guard tests, the `STAB-002` enumeration, and
  status prose, and no change to
  any file under `src/`, `spec/schemas/`, `spec/conformance/`, or an existing
  `spec/compatibility/<version>/` directory;
- `npm test`, `npx tsc --noEmit`, repository syntax checks, examples, package
  checks, and whitespace checks pass again on that release commit;
- dependency audit and secret scanning report no unresolved release blocker;
- two package builds from the same reviewed source produce the expected
  deterministic inventory and digest behavior;
- a clean temporary project installs the exact archive and exercises every
  stable import and installed executable; and
- the public-boundary review confirms no private data or unsupported claim.

Automated checks do not replace accountable-human approval for stable npm
publication or subjective downstream acceptance.

## Documentation Deliverables

Implementation keeps the following synchronized:

- `README.md` with a stable-package quick start, architecture boundary, current
  capabilities, explicit non-claims, and links to normative resources;
- `docs/ROADMAP.md` with accurate slice and Phase 3 status;
- `docs/public-api.md` with final stable and experimental classifications;
- the compatibility policy and `1.0.0` migration guidance;
- Distribution Readiness Profile `0.2.0` prose and JSON;
- non-packaged Release Evidence Records for every published RC and stable
  release;
- an adapter-author guide explaining contract boundaries and conformance;
- security and host-responsibility documentation;
- `spec/README.md` and RFC indexes; and
- a Phase 3 RFC recording the charter, schema, stability, and publication
  decisions.

Stale implementation-status text in accepted RFCs, including RFC 0011, is
reconciled without rewriting historical decisions.

## Completion Criteria

Phase 3 is complete only when:

1. the Charter `1.0.0`, cognitive-object projection `0.1.0`, event projection
   `0.1.0`, normative fixtures, and rule mappings are published in the package;
2. the TypeScript implementation passes the complete published conformance
   suite and all existing regressions;
3. separate immutable RC and stable compatibility baselines, migration
   guidance, public API inventory, and Distribution Readiness Profiles are
   final;
4. at least one `1.0.0-rc.N` is published under `next` through npm trusted
   publishing (OIDC), independently verified from the registry, before stable
   publication; a token-published candidate alone does not satisfy this
   criterion;
5. the accountable-human stable-publication gate approves the exact final
   archive and commit;
6. `collective-cognition-sdk@1.0.0` is published and verified from a clean
   consumer;
7. the corresponding immutable Release Evidence Record captures the Git tag,
   GitHub release, CI evidence, archive digest, registry provenance, dist-tags,
   and post-publication verification; and
8. the roadmap marks Phase 3 complete without claiming production
   certification, hosted operation, ecosystem adoption, or LTS.

## Explicit Deferrals

- hosted cognition database or service;
- mandatory database, transport, event bus, or cloud architecture;
- connector registry, plugin discovery, marketplace, or certification;
- scheduler, automatic ingestion, automatic classification, or automatic
  promotion;
- authentication provider, encryption implementation, tenant system, or
  runtime policy engine;
- consensus, truth adjudication, belief modeling, or organizational acceptance;
- production certification, security certification, SLA, or LTS;
- real-team operational acceptance beyond separately authorized downstream
  testing; and
- Phase 6 governance operations and Phase 7 ecosystem validation.
