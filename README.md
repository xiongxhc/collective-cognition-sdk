# Collective Cognition SDK

> The source-neutral core integrates through portable contracts. Optional
> connectors and adapters operate only on explicitly supplied sources or
> managed Markdown targets; they never discover another system's internals.

Collective Cognition SDK is an experimental, runtime-dependency-free TypeScript
reference implementation for attributed, versioned collaborative reasoning. It
models a portable `Goal → Hypothesis → Experiment → Evidence → Decision →
Principle` loop without prescribing storage, UI, agent runtime, source system, or
organizational beliefs. It is not a database, a hosted service, an agent
platform, or a policy engine, and it never decides what an organization believes.

## Status

The current package is `0.11.0`. It is private and unpublished on npm. Its
source, emitted ESM build, declarations, CLIs, Charter, standalone schemas, and
conformance fixtures are runnable or directly resolvable. The [checked public API
reference](docs/public-api.md) describes the supported surface, and
[capabilities](docs/capabilities.md) lists what runs today and what is still
missing.

The experimental [`v0.6.0` GitHub
prerelease](https://github.com/xiongxhc/collective-cognition-sdk/releases/tag/v0.6.0)
remains the first and only observed public package artifact. Distribution
Readiness Profile `0.1.0` remains the immutable package-`0.8.0` assessment and
does not authorize publication of `0.11.0`. Public source is `available`, the
GitHub prerelease channel is `available` only for immutable historical `v0.6.0`,
the npm registry channel is `blocked`, and production use is `not-claimed`.
`"private": true` blocks npm publication. It does not prevent installing a
downloaded GitHub tarball locally; npm registry publication remains forbidden.

The private, unpublished `0.11.0` Slice A is integrated on `main` at merge commit `669b3ed3a30cccee098730fe6cf558bc37e18ac5` via PR #15; its PR checks all passed. Post-merge CI run `32950251966` passed all eight jobs, including Node `24.14.0` Ubuntu job `98119822963`, which passed "runs a fictional external host through an explicit source fixture and SQLite target". This records supported-runtime CI acceptance only; real-device acceptance, public RC/stable publication, npm OIDC/bootstrap work, production readiness, adoption, certification, SLA, and LTS remain pending or unclaimed.

Slice B Tasks 1-3 are delivered and final-reviewed on branch
`feature/phase-3-stable-package-candidate`, and the npm registry bootstrap
experiment described in the [npm release runbook](docs/npm-release.md) is
complete, proving trusted-publisher OIDC publication end to end on a
throwaway package. The `1.0.0-rc.1` release commit, the merge to `main`, and
all of Slice C remain open; see the [roadmap](docs/ROADMAP.md) for the
complete pre-unlock evidence.

The [roadmap](docs/ROADMAP.md) holds phase status and verification evidence,
including
completed adapter ecosystem foundations with Durable Cognition Workflow `0.1.0` final-review verified.
Nothing in this repository claims production readiness, adoption, certification,
a service-level agreement, or long-term support. Conformance is not
certification, does not imply endorsement, and is not an LTS commitment.

## Requirements and Install

- Node.js 24 or newer. The examples rely on Node 24 native TypeScript execution.
- `npm install` for development-only TypeScript, Node type, and schema-validation packages.
- No production dependencies.

Supported Experimental workflow execution requires Node.js `>=24.14.0` and
`DatabaseSync.prototype.enableDefensive`. Node.js `24.9.0` remains a
package/core compatibility lane with honest workflow and SQLite capability
skips; it is not a full workflow runtime. The root package engine remains
Node.js `>=24`.

The package is unpublished, so installation uses a downloaded prerelease tarball
offline. [GitHub Prerelease](#github-prerelease) explains how to obtain and
verify one.

```bash
npm install --ignore-scripts --offline ./collective-cognition-sdk-0.6.0.tgz
node --input-type=module -e 'import "collective-cognition-sdk"'
./node_modules/.bin/collective-cognition --help
./node_modules/.bin/collective-cognition-teammem --help
./node_modules/.bin/collective-cognition-markdown --help
```

Package `0.11.0` installs a fourth executable, `collective-cognition-workflow`,
with one closed `run` command. The [CLI reference](docs/cli-reference.md)
documents every command and flag.

## Quick Start

```bash
npm ci --ignore-scripts
npm run example
```

`npm run example` runs
[`examples/cognitive-loop.ts`](examples/cognitive-loop.ts). It prints an
attributed complete chain, a rejected unconfirmed decision approval, a successful
human-confirmed approval, and the successful event count. It touches no database,
ledger, or vault.

## How It Fits Together

Collection remains separate from interpretation:

```text
explicit source
  → maintained or external connector
  → SourceRecord
  → generic ingestion
  → explicit caller-selected promotion
  → Portable Cognition
  → host-selected CognitionStore and CognitionEventPublisher
```

Collection does not imply interpretation, promotion, or persistence. Canonical
JSON and JSONL remain the minimum no-code integration path. A source connector
does not choose whether material becomes Evidence, what it means, or where
cognition is stored. The [architecture notes](docs/architecture.md) describe the
four layers, the host storage boundary, and the semantic limits.

### Connectors

`SourceRecord` is the universal boundary.
Team-memory is one maintained compatible connector, not SDK root behavior.
External connectors may live in separate repositories and packages, importing
only the root SDK and optional source-neutral conformance subpath. Read the
[connector author guide](docs/connector-author-guide.md) and
[RFC 0006: Maintained Source Connectors](rfcs/0006-maintained-source-connectors.md).

Package `0.11.0` ships two maintained connectors. The [team-memory
connector](docs/team-memory-connector-guide.md) accepts any explicitly supplied
structural `teammem-event-ledger/1` SQLite database and does not require
`team-memory-agent`. `sourceInstance` is public, non-secret identity for one
logical ledger. Ledger `raw` content is omitted by default.
`--include-raw` is an explicit privacy-sensitive opt-in that authorizes
inclusion in output for that invocation only.

The [Git connector](docs/git-connector-guide.md) reads only an explicit local
repository through an available local Git executable, follows first-parent
history from an exact tip, returns the bounded window oldest-to-newest, and does
not mutate the repository. Message and author-email privacy defaults are off
unless the caller explicitly opts in. There is no Git CLI.

```ts
import {
  readGitCommitSourceRecords,
} from "collective-cognition-sdk/connectors/git/0.1.0";
```

### Durable workflow and Markdown projection

```text
connector or canonical JSONL
  -> explicit durable workflow request
  -> atomic cognition database
  -> optional event publisher
  -> optional managed Markdown projection
```

Private package `0.9.0` added the source-neutral durable workflow at
`collective-cognition-sdk/workflows/durable/0.1.0` and the separate Node-specific
`SqliteCognitionWorkflowStore` at
`collective-cognition-sdk/stores/sqlite-workflow/0.1.0`, which requires a new,
explicitly selected SQLite schema-version-`2` cognition database. The installed
`collective-cognition-workflow` CLI has one closed `run` command and no
publisher, and Markdown is non-authoritative. The
[Durable Cognition Workflow Guide](docs/durable-cognition-workflow-guide.md)
covers the request shape, replay, and limits.

The Markdown adapter is a projection, not a persistence backend. A host keeps an
explicitly selected `CognitionStore` authoritative, then chooses whether to
render selected validated Portable Cognition records into a separately
initialized, dedicated directory. It discovers no vault or repository and binds
to no editor. See the
[Markdown cognition adapter guide](docs/markdown-cognition-adapter-guide.md) and
[RFC 0007](rfcs/0007-markdown-cognition-adapter.md).

## Runtime and Security Profile

Adopters can import the Runtime and Security Profile `0.1.0` as descriptive JSON:

```js
import runtimeSecurityProfile from "collective-cognition-sdk/runtime-security/0.1.0"
  with { type: "json" };
```

The JSON tells a host what remains unimplemented; importing it does not enforce host-required controls.

- `sdk-enforced` means the reference SDK rejects or constrains unsafe behavior.
- `conformance-verified` means repository checks verify a documented property without turning it into a universal runtime guarantee.
- `host-required` means the production host must implement and verify the control itself.
- `out-of-scope` means the SDK explicitly makes no claim or guarantee.

See the [normative Runtime and Security Profile `0.1.0`](spec/runtime-security.md), [RFC 0008](rfcs/0008-runtime-security-profile.md), and the [host-required controls checklist](spec/runtime-security.md#host-required-controls). That checklist covers authentication, encryption, tenant or workspace isolation, durable publication recovery, and related host-owned controls. Conformance is not certification, and the profile does not certify a deployment as secure.

## GitHub Prerelease

The repository provides an experimental
[`v0.6.0` GitHub prerelease](https://github.com/xiongxhc/collective-cognition-sdk/releases/tag/v0.6.0)
for the private, npm-unpublished `0.6.0` package. Confirm that the release is
still listed as a prerelease and is not GitHub's latest release before using
the commands. It contains exactly four assets: `SHA256SUMS`,
`collective-cognition-sdk-0.6.0.cdx.json`,
`collective-cognition-sdk-0.6.0.tgz`, and `release-manifest.json`.

The core verification matrix runs only `npm test`, `npx tsc --noEmit`, and
`npm run check` on:

- Ubuntu with Node.js `24.9.0`;
- Ubuntu with Node.js `24.14.0`;
- Ubuntu with Node.js `24.19.0`;
- macOS with Node.js `24.14.0`;
- macOS with Node.js `24.19.0`;
- Windows with Node.js `24.14.0`; and
- Windows with Node.js `24.19.0`.

The distribution verification environment is Ubuntu with Node.js `24.14.0`
only. It runs examples, durable SQLite, deterministic assets, clean tarball
installation, imports, and installed CLIs; those checks are not verified on
the other six core-matrix environments.

Download and verify the assets before installing:

```bash
TAG=v0.6.0
RELEASE_DIR="$(mktemp -d)"
cd "$RELEASE_DIR"

for asset in SHA256SUMS collective-cognition-sdk-0.6.0.cdx.json collective-cognition-sdk-0.6.0.tgz release-manifest.json; do
  curl -fLO "https://github.com/xiongxhc/collective-cognition-sdk/releases/download/$TAG/$asset"
done

shasum -a 256 -c SHA256SUMS

for asset in SHA256SUMS collective-cognition-sdk-0.6.0.cdx.json collective-cognition-sdk-0.6.0.tgz release-manifest.json; do
  gh attestation verify "$asset" \
    --repo xiongxhc/collective-cognition-sdk \
    --signer-workflow xiongxhc/collective-cognition-sdk/.github/workflows/github-prerelease.yml \
    --source-ref "refs/tags/$TAG"
done
```

The release manifest records the private package state, tag, commit, trusted
Node and npm versions, and asset metadata; the CycloneDX SBOM and GitHub
attestations add distribution integrity evidence. They are not npm provenance
or production certification. Markdown acceptance used temporary vaults only and
did not accept or mutate a live vault.
SQLite remains an optional reference adapter, not a mandatory store or
certification claim.

The `v0.6.0` prerelease is the only tag that workflow accepts. Version `1.0.0`
release candidates and the stable `1.0.0` publish to npm through a separate
protected workflow described in the
[npm release runbook](docs/npm-release.md). Any version
published under `next` is a prerelease and is not the recommended install.
Because npm does not allow removing `latest`,
`latest` may temporarily resolve to the first release candidate. Only the
stable `1.0.0` publish, made without `--tag`, repoints it; further `next`
release candidates leave it unchanged.

This root README records post-release evidence, so it differs from the README
embedded in the immutable `v0.6.0` tarball. Do not treat a fresh `0.6.0` pack
from a later commit as the released artifact. Any future package artifact
requires a new package version. The
[GitHub prerelease runbook](docs/github-prerelease.md) holds the maintainer
procedure and the evidence recorded after a release.

## Where to Go Next

| Document | Covers |
| --- | --- |
| [Public API reference](docs/public-api.md) | Supported root exports, subpaths, executables, and stability classes |
| [Capabilities](docs/capabilities.md) | What runs today and what is not implemented yet |
| [Architecture](docs/architecture.md) | Layers, system position, storage ownership, SourceRecord rules, semantic limits |
| [CLI reference](docs/cli-reference.md) | Every command, flag, limit, diagnostic, and repository script |
| [Connector author guide](docs/connector-author-guide.md) | Building an external connector against the SourceRecord boundary |
| [Team-memory connector guide](docs/team-memory-connector-guide.md) | Accepted ledger shape, source identity, privacy defaults |
| [Git connector guide](docs/git-connector-guide.md) | Options, errors, and non-goals of the local Git connector |
| [Markdown cognition adapter guide](docs/markdown-cognition-adapter-guide.md) | Target layout, conflict and pruning rules, verification and limits |
| [Durable Cognition Workflow Guide](docs/durable-cognition-workflow-guide.md) | Explicit inputs, SDK and CLI usage, replay and recovery |
| [Compatibility status](docs/compatibility-status.md) | Stability classes and per-version classification |
| [Package development](docs/package-development.md) | Build gates, resource resolution, examples, publication guard |
| [GitHub prerelease runbook](docs/github-prerelease.md) | Maintainer release and evidence procedure |
| [Roadmap](docs/ROADMAP.md) | Phase status and recorded verification evidence |
| [Specifications](spec/README.md) | Normative language-neutral contracts and conformance corpora |
| [RFCs](rfcs/README.md) | Semantic change proposals and their decisions |

Semantic changes use [RFCs](rfcs/README.md). Language-neutral specification
contributions start in [spec](spec/README.md). See
[CONTRIBUTING](CONTRIBUTING.md), [SUPPORT](SUPPORT.md), and
[SECURITY](SECURITY.md).

## Safety and Authorization Boundaries

`transitionObject` accepts an optional public `AuthorizationPolicy`; without one
it uses the built-in structural evaluator. Before invoking any policy, it clones,
validates, and deeply freezes the `TransitionContext`. Only exact closed
`AuthorizationDecision` objects are accepted, and execution proceeds only for
`{ status: "allowed" }`; policy exceptions, mutation attempts, invalid statuses,
extra fields, and malformed decisions fail closed with a stable
`AUTHORIZATION_DENIED` error. The default evaluator validates shape, chronology,
human actor assertion, and `objectId`/`targetState`/`eventId` binding. It does not
authenticate the actor, prove consent, or verify that an approval record exists.

Production callers must inject a policy backed by authenticated identity and
trusted approval records. Acceptance by the default evaluator is not proof that a
person actually approved a transition.

Connectors read only the source a caller supplies. Ledger and repository reads
are read-only, privacy-sensitive fields stay behind explicit opt-ins, and
collection never persists cognition. The durable SQLite adapter is a reference
implementation, not a production certification. It requires a host-selected
database path and provides no encryption, network-database support, durable
outbox, authentication, or multi-process scale guarantees.

## License, Attribution, and Citation

Collective Cognition SDK is a public open-source repository licensed under
[Apache License 2.0](LICENSE). Distributions and derivative works must preserve
the license and applicable attribution notices, including the project
[`NOTICE`](NOTICE), as required by the license.

If the SDK supports research, documentation, or another public work, please
credit Collective Cognition SDK and link to this repository. Machine-readable
citation metadata is available in [`CITATION.cff`](CITATION.cff); GitHub exposes
it through the repository's **Cite this repository** action.
