# Public GitHub Prerelease Design

**Status:** Approved for implementation by delegated user decision

## Problem

Collective Cognition SDK is public on GitHub and its private package `0.6.0`
has a verified build, exact package allowlist, clean-consumer checks, and three
installed executables. External users still lack a durable, installable,
verifiable release artifact and the repository lacks continuous integration,
security reporting guidance, contribution guidance, support boundaries, and a
repeatable release procedure.

The npm registry currently returns `E404` for `collective-cognition-sdk`, but
this project will not claim, reserve, or publish that name in this slice. The
package manifest must retain `"private": true`.

## Decision

Create a public GitHub prerelease for the existing private package `0.6.0`.
The GitHub release tag is `v0.6.0`; the release is marked as a prerelease and
must not be marked as the latest release. The release may later be promoted in
GitHub without changing the tag or artifact bytes, but npm publication remains
separately gated.

The prerelease distributes an npm-compatible tarball through GitHub Releases.
It does not use npm authentication, `npm publish`, a registry provenance flow,
or any package-registry write.

## Alternatives

### Source-only GitHub release

Rejected because external users would have to reproduce the build and package
steps before they could evaluate the SDK.

### Ephemeral CI artifact

Rejected because CI artifacts expire, are less discoverable, and do not give
the project a stable public installation URL.

### Immediate npm publication

Rejected by explicit user direction. Registry ownership, removal of the
private guard, npm authentication, and npm provenance remain deferred.

## Release Identity

The release identity is fixed:

- repository: `xiongxhc/collective-cognition-sdk`;
- package name: `collective-cognition-sdk`;
- package version: `0.6.0`;
- Git tag: `v0.6.0`;
- GitHub release kind: prerelease;
- npm package guard: `"private": true`;
- npm publication: forbidden.

The tag must point to the exact `master` commit selected for release. The tag
workflow must reject a tag whose text is not exactly `v` followed by the
package version or whose commit is not contained in `origin/master`.

## Release Assets

The release contains exactly these downloadable assets:

1. `collective-cognition-sdk-0.6.0.tgz`
2. `collective-cognition-sdk-0.6.0.cdx.json`
3. `release-manifest.json`
4. `SHA256SUMS`

The tarball is the direct output of `npm pack` from the tagged checkout. It
must continue to satisfy the existing exact package-content and clean-consumer
tests. Release-readiness files, workflows, tests, and build scripts must not
enter the npm tarball unless a later compatibility slice explicitly changes
the package baseline.

The CycloneDX `1.6` SBOM is produced deterministically by the repository release
tool from `package.json`. The current SDK has zero runtime dependencies, so the
SBOM contains exactly the SDK component and an empty dependency edge. The
builder fails if `dependencies`, `optionalDependencies`, or `peerDependencies`
become non-empty; supporting those fields requires a reviewed generator change
rather than silently emitting an incomplete SBOM. `SHA256SUMS` contains lowercase
SHA-256 digests and exact asset filenames in lexical filename order.
`release-manifest.json` records the repository, tag, commit SHA, package name,
package version, private-package status, Node version, and each asset's exact
filename, byte length, and SHA-256 digest. Its JSON encoding is canonical for
this release tool: two-space indentation, LF line endings, and a final LF.

GitHub artifact attestations cover the tarball, SBOM, release manifest, and
checksum file. Attestation is a GitHub distribution integrity statement, not
an npm provenance or production-security certification.

## Continuous Integration

Add `.github/workflows/ci.yml` with only read permissions. It runs on pull
requests, pushes to `master`, and manual dispatch. It cancels superseded runs
for the same branch or pull request.

The supported-runtime matrix is explicit:

- Ubuntu with Node.js `24.9.0`;
- Ubuntu with Node.js `24.14.0`;
- macOS with Node.js `24.14.0`; and
- Windows with Node.js `24.14.0`.

Every matrix entry runs:

```text
npm ci --ignore-scripts
npm test
npx tsc --noEmit
npm run check
```

One Ubuntu Node.js `24.14.0` distribution job additionally runs every example,
`npm run pack:check`, the release-artifact builder, checksum verification, SBOM
JSON parsing, release-manifest validation, and a clean installation plus CLI
smoke test from the generated tarball.

CI evidence is limited to the tested runtimes and operating systems. It does
not certify future Node majors, production operation, or all filesystems.

## Release Workflow

Add `.github/workflows/github-prerelease.yml`, triggered only by tags matching
`v*`. It must:

1. check out the complete tagged history;
2. fetch `origin/master`;
3. verify the tag is exactly `v${package.version}`;
4. verify the tagged commit is contained in `origin/master`;
5. verify `package.json` still has `"private": true`;
6. run the full Ubuntu Node.js `24.14.0` verification matrix;
7. build and independently verify the four release assets;
8. attest all four assets;
9. create a GitHub prerelease with generated release notes and the four assets;
10. leave npm untouched.

The workflow permissions are closed by default and opened only where needed:

- `contents: write` to create the GitHub release;
- `id-token: write` and `attestations: write` for GitHub attestations.

The workflow must contain no npm token, registry token, package write
permission, `NODE_AUTH_TOKEN`, `.npmrc` mutation, or `npm publish` command.
All referenced GitHub Actions must be official `actions/*` projects and pinned
to full commit SHAs. Dependabot may propose updates for pinned GitHub Actions,
but may not merge them automatically.

Release creation must be idempotent. Rerunning the workflow for the same tag
must verify or replace only the named release assets and must not create a
second release or tag.

## Local Release Builder

Add `scripts/build-github-prerelease.mjs`. It accepts only:

```text
node scripts/build-github-prerelease.mjs --output <absolute-empty-directory>
```

The script must:

- snapshot options without invoking accessors;
- reject relative, missing-parent, non-directory, non-empty, or symbolic-link
  output targets before mutation;
- require package name `collective-cognition-sdk`, version `0.6.0`, and
  `private: true`;
- run `npm pack --json` into the explicit output directory;
- require exactly one tarball with the expected filename;
- generate the exact deterministic CycloneDX `1.6` document and reject
  unsupported runtime dependency fields;
- compute release asset sizes and SHA-256 digests from complete file bytes;
- write `release-manifest.json` and `SHA256SUMS` deterministically; and
- emit one sanitized JSON success object without absolute paths.

Failures use fixed public diagnostics, never arbitrary subprocess messages,
source content, environment values, credentials, or absolute paths. Temporary
files created by an invocation are removed on failure. The script never reads
npm credentials and never contacts or writes a package registry except for
normal dependency installation performed outside the script.

The script is a repository release tool, not a package runtime API. It is not
included in package exports, declarations, binaries, or the npm tarball.

## Community and Security Files

Add:

- `SECURITY.md`: supported prerelease scope, private vulnerability-reporting
  route, response expectations without an SLA, secret-safe report guidance,
  and the explicit non-certification boundary;
- `CONTRIBUTING.md`: Node setup, local checks, TDD, Conventional Commits,
  intent-based branch names, RFC triggers, compatibility requirements, and
  no `Co-Authored-By` trailers;
- `SUPPORT.md`: GitHub Issues for reproducible SDK problems, no private data,
  no production/LTS promise, and connector ownership boundaries;
- `CHANGELOG.md`: concise retained history through private package `0.6.0` and
  the GitHub prerelease distribution status;
- issue forms for bug reports and feature proposals;
- a pull-request template with tests, compatibility, security, documentation,
  and release-impact checks; and
- `.github/dependabot.yml` for weekly GitHub Actions and npm development-
  dependency update proposals, with no automatic merge behavior.

A code of conduct is deferred because the repository does not yet expose a
designated private conduct-reporting contact. The project must not invent or
publish an unverified email address merely to fill a template.

Private vulnerability reporting must be enabled in the GitHub repository
before the prerelease is created. `SECURITY.md` links to the repository's
private vulnerability-reporting page and tells users not to place secrets,
live ledgers, vault contents, or personal data in public issues.

## Documentation

Update the README and roadmap to explain:

- installation from the GitHub release tarball;
- SHA-256 verification;
- SBOM and attestation verification;
- the difference between a private npm package and a public GitHub asset;
- the prerelease and support boundaries;
- the exact tested Node/OS matrix;
- the continued npm-publication block; and
- the next interoperability requirement after distribution readiness.

The release notes must state that the SDK is experimental, the package remains
private and unpublished, Markdown acceptance used temporary vaults, SQLite is
a reference adapter, and the release is not production certification.

## Testing

Add release-readiness tests that fail if:

- package `private` is removed;
- a workflow contains `npm publish`, `NODE_AUTH_TOKEN`, package-registry write
  permissions, unpinned action references, or non-official actions;
- the CI runtime/OS matrix changes silently;
- tag and package versions can diverge;
- release assets differ from the exact four-file inventory;
- checksum order or bytes are nondeterministic;
- the manifest omits an asset, digest, length, private status, tag, or commit;
- the SBOM is not the exact supported CycloneDX `1.6` structure;
- the tarball package allowlist or installed CLI workflow changes;
- release tooling enters the npm tarball;
- release diagnostics disclose absolute paths or injected secrets; or
- documentation claims npm publication, production certification, live-vault
  acceptance, or unsupported runtimes.

The artifact builder is run twice into fresh temporary directories. The
tarball, SBOM, and checksums must be byte-identical. The release manifest may
contain the same fixed commit and runtime identity and therefore must also be
byte-identical for the same checkout and runtime.

## Release Execution

Implementation is delivered through an intent-based feature branch and pull
request. After local and GitHub CI are clean, the branch is squash-merged into
`master`. The controller then:

1. verifies `master` and `origin/master` are identical;
2. enables GitHub private vulnerability reporting;
3. creates the annotated tag `v0.6.0` on the verified merge commit;
4. pushes only that tag;
5. waits for the prerelease workflow;
6. verifies the GitHub release is marked prerelease and not latest;
7. downloads every release asset into a temporary directory;
8. verifies checksums, SBOM, attestation, tarball installation, imports, and
   all three installed CLIs; and
9. records the release URL and exact verification evidence in the roadmap.

If release verification fails, do not publish to npm, do not move the tag, and
do not silently replace evidence. Correct the workflow or assets through a new
reviewed commit; because `v0.6.0` is immutable once public, any code change
after the tag requires a new prerelease version rather than retagging.

## Explicit Deferrals

- npm package publication or name ownership;
- removal of `"private": true`;
- npm tokens, npm provenance, or registry automation;
- production certification, LTS, or response-time guarantees;
- hosted services, telemetry, update checks, or automatic network access;
- live-vault mutation, scheduling, Git automation for user vaults, or
  descriptor-relative Markdown filesystem hardening;
- an automatic dependency-update merge policy; and
- a code of conduct until a verified private reporting channel exists.

## Acceptance Criteria

The slice is complete only when:

1. the design and implementation plan are committed;
2. CI passes on the exact four-entry Node/OS matrix;
3. all existing local tests, examples, compatibility, and package checks pass;
4. release-readiness and artifact-builder tests pass;
5. the generated npm tarball remains exact and clean-consumer installable;
6. two local artifact builds are byte-identical;
7. security, contribution, support, changelog, issue, and PR guidance is
   internally consistent and contains no invented contact or private data;
8. independent review reports no unresolved Critical or Important issue;
9. the pull request is squash-merged and the feature branch is deleted;
10. GitHub private vulnerability reporting is enabled;
11. tag `v0.6.0` points to the verified `master` merge commit;
12. the GitHub prerelease exists with exactly four downloadable assets;
13. the release is marked prerelease and not latest;
14. downloaded asset checksums, SBOM, attestation, tarball installation,
    imports, and all installed CLIs verify successfully; and
15. package `0.6.0` remains private and npm-unpublished.
