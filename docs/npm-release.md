# npm Release Runbook

This maintainer runbook covers the `1.0.0` release candidates and the stable
`1.0.0` npm publication. It replaces the
[GitHub prerelease runbook](github-prerelease.md), which applies only to the
immutable `v0.6.0` prerelease and never to a `v1` tag.

Nothing in this document authorizes a publication on its own. Publication
happens only after an accountable human approves the protected GitHub
environment for a specific tag.

## Release routing

Two workflows exist and their triggers do not overlap.

| Workflow | Trigger | Publishes |
| --- | --- | --- |
| `.github/workflows/github-prerelease.yml` | tag `v0.6.0` only | GitHub prerelease assets |
| `.github/workflows/npm-publish.yml` | tags `v1.0.0-rc.*` and `v1.0.0` | npm registry package |

GitHub Actions evaluates a workflow file at the commit the tag points to, so
both files must already be on `main` before the release commit is created. A
tag pushed against an older commit runs that commit's workflow definitions.

## Trusted publisher identity

The npm trusted-publisher configuration must match these values exactly.
Changing any one of them breaks OIDC publication.

| Field | Value |
| --- | --- |
| Repository | `xiongxhc/collective-cognition-sdk` |
| Workflow filename | `npm-publish.yml` |
| Environment | `npm-production` |
| Action | `npm publish` |

The publish job runs on GitHub-hosted runners only, requires
npm CLI `11.5.1` or later, and requests `id-token: write` so npm can exchange
the GitHub OIDC token for a short-lived publication credential. The job
asserts the runner environment and the npm version before it touches the
registry.

`npm-production` is a protected GitHub environment. Its reviewer approval is
the accountable-human gate; automated checks never replace it.

## One-time bootstrap credential

npm may not allow configuring a trusted publisher for a package name that does
not yet exist. If that is the case, the first candidate is published with a
short-lived granular npm token stored as the `NPM_BOOTSTRAP_TOKEN` secret on
the `npm-production` environment.

The workflow maps that secret to `NODE_AUTH_TOKEN` only when it is non-empty.
When the secret is absent, no user config and no `NODE_AUTH_TOKEN` are written,
so an empty credential cannot shadow trusted publishing.

The secret exists only for that one bootstrap publication and is revoked
immediately afterwards:

1. configure npm trusted publishing with the identity table above;
2. set the package to require two-factor authentication and disallow tokens;
3. delete the `NPM_BOOTSTRAP_TOKEN` environment secret and revoke the token on
   npm; and
4. publish a newly tagged `1.0.0-rc.2` through OIDC.

The trusted-publisher path is proven only once a candidate has been published
through it. A token-published candidate does not prove it.

## Two-job separation

The unprivileged `verify` job holds all repository code execution:

- it checks out the tag with `persist-credentials: false` and full history;
- it asserts tag type, tag/package-name/version parity, the removed private
  flag, the `v1.0.0` or `v1.0.0-rc.<n>` tag shape, and that the annotated tag's
  commit is both `GITHUB_SHA` and the current `origin/main` head, all before any
  archive is built;
- it installs dependencies with `--ignore-scripts`, runs `npm test`,
  `npx tsc --noEmit`, `npm run check`, and the same examples and package checks
  as branch CI;
- it builds exactly one archive with `npm pack`, whose `prepack` script builds
  and re-tests the package;
- it verifies that archive with `scripts/verify-package-archive.mjs`;
- it writes `archive-manifest.json` recording the package name, version, tag,
  commit, filename, byte count, SHA-256 digest, and sorted archive inventory;
- it appends the digest and the inventory to the job summary; and
- it uploads the archive and the manifest as the single `verified-package`
  artifact.

The privileged `publish` job holds no repository code. It has no checkout, no
dependency install, and no build or test step, because `prepack` builds and
tests and must never run after approval. It downloads the two-file artifact
into `${RUNNER_TEMP}/verified-package`, recomputes the SHA-256 digest, the
inventory, and the packed package version, and then publishes the exact
verified bytes from a directory that contains no repository checkout:

```bash
# release candidate
npm publish "$archive_path" --ignore-scripts --provenance --tag next

# stable 1.0.0
npm publish "$archive_path" --ignore-scripts --provenance
```

## Distribution tags

npm moves `latest` unless `--tag` is supplied, so every prerelease names `next`
explicitly. Any version published under `next` is a prerelease and is not the
recommended install.

After publication the job records the observed tags:

```bash
npm dist-tag ls collective-cognition-sdk
```

The output is appended to the job summary, and a prerelease fails unless `next`
resolves to the version just published. The workflow performs no distribution
tag mutation. npm does not allow removing `latest`, and on a first-ever
publication there is no other version to repoint it to, so
`latest` may temporarily resolve to the first release candidate. Record that as
a known temporary state in the candidate's Release Evidence Record. Only
stable `1.0.0`, published without `--tag`, repoints `latest`; further
`--tag next` release candidates leave it unchanged.

## Immutability

Public tags and published registry versions are immutable. A failed candidate
is corrected in a new prerelease version. Tags and published versions are
never moved, retagged, or overwritten.

## Release evidence binding

Release Evidence Records are post-publication artifacts and are never part of a
release commit. Once a record is committed under
`docs/acceptance/releases/<version>/`, branch CI downloads the matching
`collective-cognition-sdk-<version>-release-evidence.json` release asset and
runs `scripts/verify-release-evidence.mjs` against the committed record and its
`SHA256SUMS`. With no version directory present the check is a no-op that
passes.

## Publication checklist

1. Confirm both workflow files are on `main` and this runbook matches them.
2. Confirm the reviewed release commit is the `main` head and passes the full
   gate locally.
3. Create and push the annotated tag on that exact commit.
4. Watch the `verify` job and read the archive digest and inventory from its
   summary.
5. Approve the `npm-production` environment only after the digest matches the
   locally verified archive.
6. Read the observed distribution tags from the publish job summary.
7. Verify registry bytes, installation, imports, executables, metadata,
   provenance, and dist-tags from an unauthenticated clean consumer.
8. Create the GitHub release from the existing tag and attach the Release
   Evidence Record.
