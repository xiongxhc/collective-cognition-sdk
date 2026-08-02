# GitHub Prerelease Runbook

This maintainer runbook prepares and verifies the experimental GitHub
prerelease for private, unpublished package `0.6.0`. It does not authorize npm
publication, remove `"private": true`, or treat a command for a future release
as observed evidence. The [`v0.6.0` release](https://github.com/xiongxhc/collective-cognition-sdk/releases/tag/v0.6.0)
is observed; it must remain a prerelease and must not become GitHub's latest
release.

The observed public release contains exactly:

- `SHA256SUMS`;
- `collective-cognition-sdk-0.6.0.cdx.json`;
- `collective-cognition-sdk-0.6.0.tgz`; and
- `release-manifest.json`.

The core verification matrix runs only `npm test`, `npx tsc --noEmit`, and
`npm run check` on Ubuntu with Node.js `24.9.0`, Ubuntu with Node.js `24.14.0`,
macOS with Node.js `24.14.0`, and Windows with Node.js `24.14.0`.

The distribution verification environment is Ubuntu with Node.js `24.14.0`
only. It runs examples, durable SQLite, deterministic assets, clean tarball
installation, imports, and installed CLIs; the other three core-matrix
environments do not verify those paths.

The privileged no-checkout job sets `GH_REPO` from `github.repository` on its
GitHub CLI steps so release operations have explicit repository context.
After publication, branch CI reconstructs the byte-pinned `v0.6.0` assets only
at release commit `76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e`; current examples and package
checks continue on later commits without claiming that their changed
documentation bytes are the released tarball.

## 1. Verify the Feature Head Locally

Run the core gate on every core-matrix environment. Run the distribution gate
only on Ubuntu with Node.js `24.14.0`. Its examples use a synthetic temporary
ledger and a separate temporary cognition database; Markdown acceptance remains
temporary-vault-only and SQLite is a reference adapter rather than a production
store claim.

```bash
node --disable-warning=ExperimentalWarning --test tests/release-readiness.test.ts
npm test
npx tsc --noEmit
npm run check
```

On Ubuntu with Node.js `24.14.0`, run the distribution gate with the explicit
synthetic fixture. It does not read or write a live ledger, vault, or cognition
database.

```bash
set -euo pipefail
example_root="$(mktemp -d)"
trap 'rm -rf "$example_root"' EXIT
ledger="$example_root/events.db"
cognition="$example_root/cognition.db"

LEDGER_PATH="$ledger" node --input-type=module <<'NODE'
import { DatabaseSync } from "node:sqlite";

const ledgerPath = process.env.LEDGER_PATH;
if (ledgerPath === undefined) {
  throw new Error("Missing synthetic ledger path.");
}
const database = new DatabaseSync(ledgerPath);
try {
  database.exec(`
    CREATE TABLE events (
      id      INTEGER PRIMARY KEY,
      person  TEXT NOT NULL,
      project TEXT,
      ts      TEXT NOT NULL,
      source  TEXT NOT NULL,
      kind    TEXT NOT NULL,
      summary TEXT NOT NULL,
      refs    TEXT,
      raw     TEXT,
      hash    TEXT NOT NULL,
      UNIQUE(person, source, hash)
    );
  `);
  database.prepare(`
    INSERT INTO events (id, person, project, ts, source, kind, summary, refs, raw, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    1,
    "prerelease-user",
    "prerelease-synthetic",
    "2026-08-02T00:00:00.000Z",
    "prerelease:synthetic-event",
    "commit",
    "Synthetic prerelease verification event.",
    JSON.stringify({ url: "https://example.invalid/prerelease-synthetic" }),
    null,
    "prerelease-synthetic-hash-1",
  );
} finally {
  database.close();
}
NODE

npm run example
npm run example:portable
npm run example:host
npm run example:teammem -- "$ledger"
npm run example:teammem:durable -- --ledger "$ledger" --cognition-db "$cognition" --project prerelease-synthetic --from 2026-08-02T00:00:00.000Z --limit 1 --create
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

Wait for the exact `github-prerelease.yml` push run for `v0.6.0`, then download
and verify the release in a new directory. These commands are
release-verification steps; do not record a URL, run ID, merge SHA, tag SHA, or
pass result before their actual GitHub output is inspected.

```bash
set -euo pipefail
TAG=v0.6.0
cd /Users/cx/Workspace/collective-cognition-sdk
git fetch origin master refs/tags/$TAG:refs/tags/$TAG
TAG_SHA="$(git rev-parse "refs/tags/$TAG^{}")"
RUNS_JSON="$(gh run list --repo xiongxhc/collective-cognition-sdk --workflow github-prerelease.yml --branch "$TAG" --event push --limit 20 --json databaseId,headSha,headBranch,event)"
RUN_ID="$(RUNS_JSON="$RUNS_JSON" TAG="$TAG" TAG_SHA="$TAG_SHA" node --input-type=module <<'NODE'
import assert from "node:assert/strict";

const runs = JSON.parse(process.env.RUNS_JSON ?? "");
const tag = process.env.TAG;
const tagSha = process.env.TAG_SHA;
assert.equal(typeof tag, "string");
assert.equal(typeof tagSha, "string");
assert.equal(runs.length, 1);
const run = runs[0];
assert.equal(run.headBranch, tag);
assert.equal(run.headSha, tagSha);
assert.equal(run.event, "push");
assert.equal(typeof run.databaseId, "number");
process.stdout.write(`${run.databaseId}\n`);
NODE
)"
gh run watch "$RUN_ID" --exit-status

release_dir="$(mktemp -d)"
latest_response="$(mktemp)"
trap 'rm -rf "$release_dir"; rm -f "$latest_response"' EXIT
gh release download "$TAG" --dir "$release_dir" --repo xiongxhc/collective-cognition-sdk

release_json="$(gh api repos/xiongxhc/collective-cognition-sdk/releases/tags/$TAG)"
RELEASE_JSON="$release_json" TAG="$TAG" node --input-type=module <<'NODE'
import assert from "node:assert/strict";

const release = JSON.parse(process.env.RELEASE_JSON ?? "");
const tag = process.env.TAG;
const expectedAssets = [
  "SHA256SUMS",
  "collective-cognition-sdk-0.6.0.cdx.json",
  "collective-cognition-sdk-0.6.0.tgz",
  "release-manifest.json",
];
assert.equal(release.prerelease, true);
assert.equal(release.draft, false);
assert.equal(release.tag_name, tag);
const names = release.assets.map((asset) => asset.name);
assert.equal(new Set(names).size, names.length);
assert.deepEqual([...names].sort(), expectedAssets);
NODE

set +e
gh api --include repos/xiongxhc/collective-cognition-sdk/releases/latest > "$latest_response" 2>&1
latest_exit=$?
set -e
LATEST_EXIT="$latest_exit" LATEST_RESPONSE="$latest_response" TAG="$TAG" node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const exitCode = Number(process.env.LATEST_EXIT);
const tag = process.env.TAG;
const response = readFileSync(process.env.LATEST_RESPONSE ?? "", "utf8")
  .replaceAll("\r\n", "\n");
const statuses = [...response.matchAll(/^HTTP\/\S+\s+(\d{3})\b/gm)];
assert.equal(statuses.length, 1);
const statusCode = Number(statuses[0]?.[1]);
if (exitCode === 0) {
  assert.equal(statusCode, 200);
  const separator = response.indexOf("\n\n");
  assert.notEqual(separator, -1);
  const latest = JSON.parse(response.slice(separator + 2));
  assert.notEqual(latest.tag_name, tag);
} else {
  assert.equal(exitCode, 1);
  assert.equal(statusCode, 404);
}
NODE

test "$(git rev-parse "refs/tags/$TAG^{}")" = "$(git rev-parse origin/master)"

RELEASE_DIR="$release_dir" TAG="$TAG" TAG_SHA="$TAG_SHA" node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const releaseDirectory = process.env.RELEASE_DIR;
const tag = process.env.TAG;
const tagSha = process.env.TAG_SHA;
assert.equal(typeof releaseDirectory, "string");
assert.equal(tag, "v0.6.0");
assert.match(tagSha, /^[0-9a-f]{40}$/);

const checksumNames = [
  "collective-cognition-sdk-0.6.0.cdx.json",
  "collective-cognition-sdk-0.6.0.tgz",
  "release-manifest.json",
];
const checksumBytes = readFileSync(join(releaseDirectory, "SHA256SUMS"));
const checksumText = checksumBytes.toString("utf8");
assert.deepEqual(Buffer.from(checksumText, "utf8"), checksumBytes);
const checksumLines = checksumText.split("\n");
assert.equal(checksumLines.pop(), "");
assert.equal(checksumLines.length, checksumNames.length);
const checksumEntries = checksumLines.map((line) => {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/);
  assert.ok(match);
  return { sha256: match[1], name: match[2] };
});
assert.deepEqual(checksumEntries.map(({ name }) => name), checksumNames);
for (const entry of checksumEntries) {
  const bytes = readFileSync(join(releaseDirectory, entry.name));
  assert.equal(entry.sha256, createHash("sha256").update(bytes).digest("hex"));
}

const expectedAssets = [
  "SHA256SUMS",
  "collective-cognition-sdk-0.6.0.cdx.json",
  "collective-cognition-sdk-0.6.0.tgz",
  "release-manifest.json",
];
const entries = readdirSync(releaseDirectory, { withFileTypes: true });
assert.deepEqual(entries.map((entry) => entry.name).sort(), expectedAssets);
for (const entry of entries) {
  const status = lstatSync(join(releaseDirectory, entry.name));
  assert.equal(status.isFile(), true);
  assert.equal(status.isSymbolicLink(), false);
}

const manifest = JSON.parse(readFileSync(
  join(releaseDirectory, "release-manifest.json"),
  "utf8",
));
assert.deepEqual(Object.keys(manifest).sort(), [
  "assets",
  "commit",
  "nodeVersion",
  "npmVersion",
  "package",
  "repository",
  "tag",
]);
assert.equal(manifest.repository, "xiongxhc/collective-cognition-sdk");
assert.equal(manifest.tag, tag);
assert.equal(manifest.commit, tagSha);
assert.deepEqual(manifest.package, {
  name: "collective-cognition-sdk",
  version: "0.6.0",
  private: true,
});
assert.equal(manifest.nodeVersion, "v24.14.0");
assert.match(manifest.npmVersion, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
assert.deepEqual(
  manifest.assets.map((asset) => asset.name),
  [
    "collective-cognition-sdk-0.6.0.tgz",
    "collective-cognition-sdk-0.6.0.cdx.json",
  ],
);
assert.equal(
  manifest.assets.find((asset) =>
    asset.name === "collective-cognition-sdk-0.6.0.tgz"
  )?.sha256,
  "3b50ebaa83e0a025ba49aaf81099e8de805e35e2c177a76beb4b985b575a9efe",
);
for (const asset of manifest.assets) {
  assert.deepEqual(Object.keys(asset).sort(), ["bytes", "name", "sha256"]);
  const bytes = readFileSync(join(releaseDirectory, asset.name));
  assert.equal(asset.bytes, bytes.length);
  assert.equal(
    asset.sha256,
    createHash("sha256").update(bytes).digest("hex"),
  );
}

const sbom = JSON.parse(readFileSync(
  join(releaseDirectory, "collective-cognition-sdk-0.6.0.cdx.json"),
  "utf8",
));
assert.deepEqual(sbom, {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      "bom-ref": "pkg:npm/collective-cognition-sdk@0.6.0",
      name: "collective-cognition-sdk",
      purl: "pkg:npm/collective-cognition-sdk@0.6.0",
      type: "library",
      version: "0.6.0",
    },
  },
  components: [],
  dependencies: [{
    ref: "pkg:npm/collective-cognition-sdk@0.6.0",
    dependsOn: [],
  }],
});
NODE
(cd "$release_dir" && shasum -a 256 -c SHA256SUMS)

for asset in SHA256SUMS collective-cognition-sdk-0.6.0.cdx.json collective-cognition-sdk-0.6.0.tgz release-manifest.json; do
  gh attestation verify "$release_dir/$asset" \
    --repo xiongxhc/collective-cognition-sdk \
    --signer-workflow xiongxhc/collective-cognition-sdk/.github/workflows/github-prerelease.yml \
    --source-ref "refs/tags/$TAG"
done

consumer="$release_dir/consumer"
mkdir "$consumer"
printf '%s\n' '{"name":"release-consumer","private":true,"type":"module"}' > "$consumer/package.json"
(
  cd "$consumer"
  npm install --ignore-scripts --offline --no-audit --no-fund "$release_dir/collective-cognition-sdk-0.6.0.tgz"
  node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSpecifiers = [
  "collective-cognition-sdk",
  "collective-cognition-sdk/adapters/markdown/0.1.0",
  "collective-cognition-sdk/connector-conformance/0.1.0",
  "collective-cognition-sdk/connectors/team-memory/0.1.0",
  "collective-cognition-sdk/host-conformance/0.1.0",
  "collective-cognition-sdk/reference-host/0.1.0",
  "collective-cognition-sdk/stores/sqlite/0.1.0",
];
for (const specifier of moduleSpecifiers) {
  assert.ok(await import(specifier));
}

const jsonSpecifiers = [
  "collective-cognition-sdk/compatibility/0.1.0",
  "collective-cognition-sdk/compatibility/0.2.0",
  "collective-cognition-sdk/compatibility/0.3.0",
  "collective-cognition-sdk/compatibility/0.4.0",
  "collective-cognition-sdk/compatibility/0.5.0",
  "collective-cognition-sdk/compatibility/0.6.0",
  "collective-cognition-sdk/schemas/source-record/0.1.0",
  "collective-cognition-sdk/schemas/portable-cognition/0.1.0",
  "collective-cognition-sdk/package.json",
];
for (const specifier of jsonSpecifiers) {
  assert.ok(await import(specifier, { with: { type: "json" } }));
}

const textSpecifiers = [
  "collective-cognition-sdk/contracts/host-integration/0.1.0",
  "collective-cognition-sdk/conformance/portable-cognition/0.1.0/valid",
  "collective-cognition-sdk/conformance/portable-cognition/0.1.0/invalid",
  "collective-cognition-sdk/conformance/portable-cognition/0.1.0/cognitive-loop",
];
for (const specifier of textSpecifiers) {
  const content = await readFile(new URL(import.meta.resolve(specifier)), "utf8");
  assert.ok(content.length > 0);
}
NODE
  ./node_modules/.bin/collective-cognition --help
  ./node_modules/.bin/collective-cognition-teammem --help
  ./node_modules/.bin/collective-cognition-markdown --help
)

node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { get } from "node:https";

const registryResult = await new Promise((resolve, reject) => {
  const request = get(
    "https://registry.npmjs.org/collective-cognition-sdk/0.6.0",
    {
      headers: {
        accept: "application/json",
        "user-agent": "collective-cognition-sdk-release-verifier/0.6.0",
      },
    },
    (response) => {
      const chunks = [];
      let length = 0;
      response.on("data", (chunk) => {
        length += chunk.length;
        if (length > 1024) {
          response.destroy(new Error("Registry response exceeded 1024 bytes."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        contentType: response.headers["content-type"],
        statusCode: response.statusCode,
      }));
    },
  );
  assert.equal(request.getHeader("authorization"), undefined);
  request.setTimeout(15_000, () => request.destroy(new Error("Registry request timed out.")));
  request.on("error", reject);
});
const { body, contentType, statusCode } = registryResult;
assert.equal(statusCode, 404);
assert.match(contentType ?? "", /^application\/json\b/i);
const registryPayload = JSON.parse(body);
assert.equal(registryPayload, "Not Found");
NODE
```

The release API predicates above require `prerelease: true`, `draft: false`,
the exact tag, and exactly four unique asset names. The latest-release request
accepts only HTTP `404` or a successful HTTP `200` response whose tag differs
from `v0.6.0`. The npm check sends no authorization header and accepts only the
official version endpoint's exact HTTP `404`, JSON content type, and `"Not
Found"` body. Authentication, redirects, network errors, timeouts, oversized
responses, parsing errors, and every other HTTP result stop the procedure.

## 6. Record Evidence or Correct Safely

After every check succeeds, record the observed release URL, merge SHA, tag
target SHA, workflow run URL, exact asset digests, tested Node/OS result,
attestation verification, clean-install/import/CLI result, private
vulnerability-reporting status, and npm-unpublished status in the roadmap.
Use a documentation-only `docs/` branch and squash-merge it after CI.

For `v0.6.0`, the immutable-tag verification, deterministic build, transfer
verification, and all four attestations passed, but the original no-checkout
publication step lacked explicit GitHub CLI repository context. Maintainers
downloaded the exact workflow artifact, reverified its checksums and four
attestations, and published those same bytes without moving the tag. The
workflow now sets `GH_REPO` for both release API steps. Exact evidence and
digests are recorded in the [roadmap](ROADMAP.md#github-prerelease-distribution-readiness).

If any public tag verification fails, do not publish to npm and do not move or retag `v0.6.0`. Correct the reviewed implementation and issue a new prerelease version rather than moving or retagging `v0.6.0`.
