# npm Registry Bootstrap Verification

This record covers the throwaway-package experiment run to settle two npm
registry facts before the Slice B `1.0.0-rc.1` release commit. It records
only observed evidence. It authorizes no publication of
`collective-cognition-sdk` and confers no production status on the throwaway
package.

## Purpose

Two facts about the npm registry needed verification against current npm
documentation before the stable release path could be planned:

1. Whether a trusted publisher can be configured for a package name that does
   not yet exist on the registry, which decides whether the token-bootstrap
   step and its mandatory follow-up `1.0.0-rc.2` are required.
2. Whether the first-ever publication of a package with `--tag next` leaves
   `latest` unset, which decides how the release workflow and public
   documentation describe the temporary `latest` state.

## Documentation Rechecked

- [`https://docs.npmjs.com/trusted-publishers/`](https://docs.npmjs.com/trusted-publishers/),
  retrieved 2026-09-02. The page places trusted-publisher configuration under
  Packages -> YOUR_PACKAGE -> Settings -> Trusted publishing, which implies
  the package must already exist on the registry. It states the requirements
  as npm CLI `>=11.5.1`, GitHub-hosted runners, `id-token: write`, an exact
  workflow filename match, an optional environment, and automatic provenance.
- [`https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/`](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/),
  retrieved 2026-09-02. It states: "Publishing a package sets the `latest`
  tag to the published version unless the `--tag` option is used." It says
  nothing about removing or unsetting the `latest` tag once a package exists.

## Throwaway Identities

- GitHub repository:
  [`xiongxhc/collective-cognition-bootstrap-20260825`](https://github.com/xiongxhc/collective-cognition-bootstrap-20260825).
- Package name: `@xiongxhc/collective-cognition-bootstrap-20260825`.
- Protected GitHub environment `npm-production`: required reviewer `xiongxhc`,
  tag policy `v0.0.0-bootstrap.*`.
- Workflow shape (`.github/workflows/npm-publish.yml` in the throwaway repo):
  two jobs, a token credential guarded so it is inert when unset, publication
  via `npm publish "$archive_path" --access public --tag next --provenance`,
  `npm dist-tag ls` recorded immediately after publication, and no dist-tag
  mutation attempted.
- Job runtime: Node.js `24.14.0`, npm `11.9.0`.

## Publication Timeline

| Step | Tag / commit | Run | Credential | Result |
| --- | --- | --- | --- | --- |
| Publication 1, first attempt | `v0.0.0-bootstrap.1` / `0375f02` | [`33674774713`](https://github.com/xiongxhc/collective-cognition-bootstrap-20260825/actions/runs/33674774713) | granular token, no bypass-2FA | FAILED: `E403` "Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages." Nothing published. |
| Publication 1, rerun | `v0.0.0-bootstrap.1` / `0375f02` | `33674774713` rerun | granular token with bypass-2FA (secret replaced 2026-09-02T20:34:04Z) | SUCCESS. Published `0.0.0-bootstrap.1` ~2026-09-02T20:35Z via `--access public --tag next --provenance`. |
| Publication 2 | `v0.0.0-bootstrap.2` / `d959bcc` | [`33680749368`](https://github.com/xiongxhc/collective-cognition-bootstrap-20260825/actions/runs/33680749368) | OIDC (`id-token: write`); no trusted publisher configured yet | FAILED: `ENEEDAUTH` on npm `11.9.0` / Node `24.14.0`; npm obtained no OIDC credential. Never published; tag retained, never moved. |
| Publication 3, first attempt | `v0.0.0-bootstrap.3` | [`33732523012`](https://github.com/xiongxhc/collective-cognition-bootstrap-20260825/actions/runs/33732523012) (verbose) | OIDC | FAILED: `ENEEDAUTH`. GitHub OIDC ID token obtained (`200`, audience `npm:registry.npmjs.org`); registry exchange `POST /-/npm/v1/oidc/token/exchange/package/@xiongxhc%2fcollective-cognition-bootstrap-20260825` returned `404` "OIDC token exchange error - package not found," even though the package already existed, indicating no matching trusted-publisher entry was saved. |
| Publication 3, rerun | `v0.0.0-bootstrap.3` | `33732523012` rerun, approved ~2026-09-03T08:53Z | OIDC | SUCCESS. Registry exchange returned `201`; npm reported "oidc Successfully retrieved and set token." Published `0.0.0-bootstrap.3` at `2026-09-03T08:54:07Z`. No token present in the environment (`0` secrets). |

## Registry Observations

**Distribution tags:**

- After publication 1 (observed 2026-09-02T20:35:25Z):
  `{"latest":"0.0.0-bootstrap.1","next":"0.0.0-bootstrap.1"}`.
- After publication 3 (fetched 2026-09-03 against
  `https://registry.npmjs.org/-/package/@xiongxhc%2fcollective-cognition-bootstrap-20260825/dist-tags`
  and the full packument):
  `{"latest":"0.0.0-bootstrap.1","next":"0.0.0-bootstrap.3"}`.

**Packument for `0.0.0-bootstrap.1`** (propagated ~2026-09-02T20:47Z, roughly
10 minutes after the dist-tags endpoint already reflected the publish):

- Publish time: `2026-09-02T20:35:01.772Z`.
- Tarball: `https://registry.npmjs.org/@xiongxhc/collective-cognition-bootstrap-20260825/-/collective-cognition-bootstrap-20260825-0.0.0-bootstrap.1.tgz`.
- Integrity: `sha512-KShW6KKd+HJM2ITwnjJuCcvI/JTjwyDC9d0+bjsUq123Lf1SamCLSD9knCOboKFJzDC7rn3fud6Gftp3u6/lhA==`.
- Attestations: `https://registry.npmjs.org/-/npm/v1/attestations/@xiongxhc%2fcollective-cognition-bootstrap-20260825@0.0.0-bootstrap.1` (SLSA provenance v1).
- Sigstore transparency log: [logIndex `2690284666`](https://search.sigstore.dev/?logIndex=2690284666), written for the failed `E403` first attempt even though that version was never published; [logIndex `2690412542`](https://search.sigstore.dev/?logIndex=2690412542) for the successful publish.

**Packument for `0.0.0-bootstrap.3`** (fetched directly for this record via
`curl -s https://registry.npmjs.org/@xiongxhc%2fcollective-cognition-bootstrap-20260825`,
first attempt, already propagated, no retry needed):

- Publish time: `2026-09-03T08:54:06.529Z`.
- Tarball: `https://registry.npmjs.org/@xiongxhc/collective-cognition-bootstrap-20260825/-/collective-cognition-bootstrap-20260825-0.0.0-bootstrap.3.tgz`.
- Integrity: `sha512-5Na9gMfCvqW3kulEkZfYBbwGXrzZdIGT4E3n8JRv9gXwdrYcwtqUBIYgZnTPS/KNuW3WU9n9q0WrNGJ+Ia6RvA==`.
- Attestations: `https://registry.npmjs.org/-/npm/v1/attestations/@xiongxhc%2fcollective-cognition-bootstrap-20260825@0.0.0-bootstrap.3`, containing two entries: an npm publish attestation at Sigstore [logIndex `2697525192`](https://search.sigstore.dev/?logIndex=2697525192) and a SLSA provenance v1 attestation at Sigstore [logIndex `2697524793`](https://search.sigstore.dev/?logIndex=2697524793), matching the log index recorded at publication time.

## Trusted-Publisher Configuration

Saved on npmjs.com 2026-09-03 (~08:3xZ) through the user's browser session
with a security-key confirmation:

| Field | Value |
| --- | --- |
| Owner / repository | `xiongxhc/collective-cognition-bootstrap-20260825` |
| Workflow filename | `npm-publish.yml` |
| Environment | `npm-production` |
| Permissions granted | "npm publish, npm stage publish" |

Observed UI fact: the trusted-publisher form defaults to staged publishing
only. The "Allow npm publish" option (labeled "Not recommended" by npm) must
be ticked explicitly, or a workflow's `npm publish` step is rejected even
after the trusted publisher otherwise matches.

## Decisions

- **Fact 1 result:** a trusted publisher cannot be configured for a package
  name that does not yet exist; the npmjs.com package settings/access page
  returned `404` before the first publication. **Consequence:** the
  token-bootstrap path is used exactly once, and an OIDC-published
  `1.0.0-rc.2`, with its own baseline and Distribution Readiness Profile, is
  mandatory.
- **Fact 2 result:** the first-ever publication of a package, even with
  `--tag next`, sets `latest` to that version; `latest` was not left unset.
  **Fact 2b result:** a later publication also made with `--tag next` does
  not repoint `latest`; only a publication made without `--tag` would.
  **Consequence:** `latest` will continue to resolve to `0.0.0-bootstrap.1`
  (by analogy, the first `1.0.0-rc.N` for the real release) through every
  further `--tag next` candidate; only a stable `1.0.0` publication made
  without `--tag` repoints it. This is the observed rule now recorded in the
  spec, the npm release runbook, and the affected plans (see Ruling R10 in
  the controller ledger).

## Hygiene State

- The bootstrap token was deleted from the `npm-production` GitHub
  environment before publication 2 was attempted (environment held `0`
  secrets at that point, per the controller ledger).
- npm package publishing-access hardening (requiring two-factor
  authentication and disallowing token publication for the throwaway
  package) and granular-token revocation: pending at the time of this
  record.

## Non-Claims

- Nothing in this record publishes, authorizes, or otherwise affects
  `collective-cognition-sdk` on the npm registry.
- The throwaway package `@xiongxhc/collective-cognition-bootstrap-20260825`
  is not intended for use, is not a dependency of any project, and carries
  no compatibility or support commitment.
- No published version, on either package, was or will be unpublished.
  Version `0.0.0-bootstrap.2` was never published; its tag was retained and
  never moved.
