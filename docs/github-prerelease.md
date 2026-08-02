# GitHub Prerelease Runbook

This maintainer runbook prepares and verifies the experimental GitHub
prerelease for private, unpublished package `0.6.0`. It does not authorize npm
publication, remove `"private": true`, or treat a planned command as observed
release evidence. The release must remain a prerelease and must not become
GitHub's latest release.

The public release, once observed, contains exactly:

- `SHA256SUMS`;
- `collective-cognition-sdk-0.6.0.cdx.json`;
- `collective-cognition-sdk-0.6.0.tgz`; and
- `release-manifest.json`.

The tested runtime matrix is Ubuntu with Node.js `24.9.0`, Ubuntu with Node.js
`24.14.0`, macOS with Node.js `24.14.0`, and Windows with Node.js `24.14.0`.
The release workflow itself uses Node.js `24.14.0`.

## 1. Verify the Feature Head Locally

Run the complete local Node 24 gate before a pull request. The examples use
only temporary fixtures; Markdown acceptance remains temporary-vault-only and
SQLite is a reference adapter rather than a production store claim.

```bash
node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts
npm test
npx tsc --noEmit
npm run check
npm run example
npm run example:portable
npm run example:host
npm run example:teammem
npm run example:teammem:durable
npm run example:markdown
npm run pack:check
git diff --check
```

Build release assets twice from the reviewed commit. Both output directories
must be new, empty, absolute directories.

```bash
first="$(mktemp -d)"
second="$(mktemp -d)"
node scripts/build-github-prerelease.mjs --output "$first"
node scripts/build-github-prerelease.mjs --output "$second"

for asset in SHA256SUMS collective-cognition-sdk-0.6.0.cdx.json collective-cognition-sdk-0.6.0.tgz release-manifest.json; do
  cmp "$first/$asset" "$second/$asset"
done
(cd "$first" && shasum -a 256 -c SHA256SUMS)
```

Verify the generated manifest and SBOM before proceeding. Preserve the reviewed
commit SHA from this verification in the eventual evidence record; do not add a
value to the roadmap until it is observed from the merged release path.

## 2. Merge the Reviewed Pull Request

Open the feature pull request only after the local gate is clean. Wait for its
required checks, squash-merge it, delete the remote branch, and fast-forward
the primary checkout to `origin/master`.

```bash
git push -u origin feature/public-prerelease-readiness
PR_URL="$(gh pr create --base master --head feature/public-prerelease-readiness --title "feat: add public GitHub prerelease distribution" --body "Release readiness verification completed locally.")"
PR_NUMBER="$(gh pr view "$PR_URL" --json number --jq .number)"
gh pr checks --watch "$PR_NUMBER"
gh pr merge "$PR_NUMBER" --squash --delete-branch
git -C /Users/cx/Workspace/collective-cognition-sdk fetch origin master
git -C /Users/cx/Workspace/collective-cognition-sdk checkout master
git -C /Users/cx/Workspace/collective-cognition-sdk merge --ff-only origin/master
test "$(git -C /Users/cx/Workspace/collective-cognition-sdk rev-parse master)" = "$(git -C /Users/cx/Workspace/collective-cognition-sdk rev-parse origin/master)"
```

## 3. Enable Private Vulnerability Reporting

Private vulnerability reporting must be enabled and confirmed before creating a
public tag. Stop if the query does not print `true`.

```bash
gh api --method PUT repos/xiongxhc/collective-cognition-sdk/private-vulnerability-reporting
gh api repos/xiongxhc/collective-cognition-sdk/private-vulnerability-reporting --jq '.enabled'
```

## 4. Create the Immutable Prerelease Tag

From clean, verified `master`, create exactly one annotated tag. Push only the
tag. Never force, delete, or move the tag after public publication.

```bash
cd /Users/cx/Workspace/collective-cognition-sdk
git fetch origin master
test "$(git rev-parse master)" = "$(git rev-parse origin/master)"
git tag -a v0.6.0 -m "Collective Cognition SDK 0.6.0 prerelease"
git push origin v0.6.0
```

## 5. Verify the Observed Public Prerelease

Wait for the tag workflow and download the release into a new directory. These
commands are release-verification steps; do not record a URL, run ID, merge
SHA, tag SHA, or pass result before their actual GitHub output is inspected.

```bash
gh run watch --repo xiongxhc/collective-cognition-sdk
release_dir="$(mktemp -d)"
gh release download v0.6.0 --dir "$release_dir" --repo xiongxhc/collective-cognition-sdk

gh api repos/xiongxhc/collective-cognition-sdk/releases/tags/v0.6.0 \
  --jq '{tag_name, prerelease, draft, assets: [.assets[].name]}'
gh api repos/xiongxhc/collective-cognition-sdk/releases/latest \
  --jq .tag_name || test "$?" = 1

cd /Users/cx/Workspace/collective-cognition-sdk
git fetch origin master refs/tags/v0.6.0:refs/tags/v0.6.0
test "$(git rev-parse 'refs/tags/v0.6.0^{}')" = "$(git rev-parse origin/master)"
cd "$release_dir"

test "$(find . -maxdepth 1 -type f | wc -l | tr -d ' ')" = 4
shasum -a 256 -c SHA256SUMS

for asset in SHA256SUMS collective-cognition-sdk-0.6.0.cdx.json collective-cognition-sdk-0.6.0.tgz release-manifest.json; do
  gh attestation verify "$asset" \
    --repo xiongxhc/collective-cognition-sdk \
    --signer-workflow xiongxhc/collective-cognition-sdk/.github/workflows/github-prerelease.yml \
    --source-ref refs/tags/v0.6.0
done

npm install --ignore-scripts --offline ./collective-cognition-sdk-0.6.0.tgz
node --input-type=module -e 'import "collective-cognition-sdk"'
./node_modules/.bin/collective-cognition --help
./node_modules/.bin/collective-cognition-teammem --help
./node_modules/.bin/collective-cognition-markdown --help
```

The release API must show `prerelease: true` and `draft: false`; the latest
release endpoint must return HTTP `404` or a different `tag_name`. Verify the
release asset names exactly, inspect the SBOM and manifest for `v0.6.0`, the
observed commit, and `private: true`, then confirm all four attestations.

## 6. Record Evidence or Correct Safely

After every check succeeds, record the observed release URL, merge SHA, tag
target SHA, workflow run URL, exact asset digests, tested Node/OS result,
attestation verification, clean-install/import/CLI result, private
vulnerability-reporting status, and npm-unpublished status in the roadmap.
Use a documentation-only `docs/` branch and squash-merge it after CI.

If any public tag verification fails, do not publish to npm and do not move or retag `v0.6.0`. Correct the reviewed implementation and issue a new prerelease version rather than moving or retagging `v0.6.0`.
