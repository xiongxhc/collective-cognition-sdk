import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

type ReleaseEvidenceResult =
  | { ok: true; packageVersion: string; recordFile: string }
  | { ok: false; error: "invalid_record" | "asset_mismatch" | "checksum_mismatch" };

type ReleaseEvidenceVerifier = (input: {
  recordPath: string;
  assetPath: string;
  checksumsPath: string;
}) => ReleaseEvidenceResult;

const verifierPath = fileURLToPath(
  new URL("../scripts/verify-release-evidence.mjs", import.meta.url),
);
const { verifyReleaseEvidence } = (await import(
  new URL("../scripts/verify-release-evidence.mjs", import.meta.url).href
)) as { verifyReleaseEvidence: ReleaseEvidenceVerifier };

interface EvidenceWorkspaceOptions {
  recordFileName?: string;
  record?: Record<string, unknown>;
  recordBytes?: string;
  assetFileName?: string;
  assetBytes?: string;
  checksums?: string;
}

function releaseEvidenceRecord(
  packageVersion: string,
  distTag: string,
): Record<string, unknown> {
  return {
    evidenceRecordVersion: "0.1.0",
    packageVersion,
    registryPublication: {
      publishedAt: "2026-09-02T10:15:30.000Z",
      archiveDigest: `sha512-${"A".repeat(86)}==`,
      distTags: [distTag],
    },
    npmProvenance: {
      identity:
        `xiongxhc/collective-cognition-sdk/.github/workflows/npm-publish.yml@refs/tags/v${packageVersion}`,
      verified: true,
    },
    gitTag: {
      name: `v${packageVersion}`,
      tagObjectSha: "1".repeat(40),
      commitSha: "2".repeat(40),
    },
    githubRelease: {
      tag: `v${packageVersion}`,
      workflowPath: ".github/workflows/npm-publish.yml",
      workflowRunId: "32950251966",
    },
    cleanConsumer: { status: "passed", nodeVersion: "v24.14.0" },
  };
}

function createEvidenceWorkspace(
  root: string,
  packageVersion: string,
  options: EvidenceWorkspaceOptions = {},
): { recordPath: string; assetPath: string; checksumsPath: string } {
  const recordFileName = options.recordFileName ?? "release-evidence.json";
  const record =
    options.record ??
    releaseEvidenceRecord(
      packageVersion,
      packageVersion.includes("-") ? "rc" : "latest",
    );
  const recordBytes = options.recordBytes ?? `${JSON.stringify(record, null, 2)}\n`;
  const recordDirectory = join(
    root,
    "docs",
    "acceptance",
    "releases",
    packageVersion,
  );
  mkdirSync(recordDirectory, { recursive: true });
  const recordPath = join(recordDirectory, recordFileName);
  writeFileSync(recordPath, recordBytes);

  const assetDirectory = join(root, "downloaded-assets");
  mkdirSync(assetDirectory, { recursive: true });
  const assetFileName =
    options.assetFileName ??
    `collective-cognition-sdk-${packageVersion}-${recordFileName}`;
  const assetPath = join(assetDirectory, assetFileName);
  writeFileSync(assetPath, options.assetBytes ?? recordBytes);

  const checksumsPath = join(recordDirectory, "SHA256SUMS");
  const digest = createHash("sha256").update(recordBytes).digest("hex");
  writeFileSync(
    checksumsPath,
    options.checksums ?? `${digest}  ${recordFileName}\n`,
  );

  return { recordPath, assetPath, checksumsPath };
}

function withWorkspace(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "ccsdk-release-evidence-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("release evidence verifier accepts the candidate and stable records", () => {
  withWorkspace((root) => {
    const candidate = createEvidenceWorkspace(root, "1.0.0-rc.1");
    assert.equal(
      candidate.recordPath.endsWith(
        join("docs", "acceptance", "releases", "1.0.0-rc.1", "release-evidence.json"),
      ),
      true,
    );
    assert.equal(
      candidate.assetPath.endsWith(
        "collective-cognition-sdk-1.0.0-rc.1-release-evidence.json",
      ),
      true,
    );
    assert.deepEqual(verifyReleaseEvidence(candidate), {
      ok: true,
      packageVersion: "1.0.0-rc.1",
      recordFile: "release-evidence.json",
    });
  });

  withWorkspace((root) => {
    const stable = createEvidenceWorkspace(root, "1.0.0");
    assert.equal(
      stable.recordPath.endsWith(
        join("docs", "acceptance", "releases", "1.0.0", "release-evidence.json"),
      ),
      true,
    );
    assert.equal(
      stable.assetPath.endsWith(
        "collective-cognition-sdk-1.0.0-release-evidence.json",
      ),
      true,
    );
    assert.deepEqual(verifyReleaseEvidence(stable), {
      ok: true,
      packageVersion: "1.0.0",
      recordFile: "release-evidence.json",
    });
  });
});

test("release evidence verifier requires the exact asset name and bytes", () => {
  withWorkspace((root) => {
    const misnamed = createEvidenceWorkspace(root, "1.0.0-rc.1", {
      assetFileName: "release-evidence.json",
    });
    assert.deepEqual(verifyReleaseEvidence(misnamed), {
      ok: false,
      error: "asset_mismatch",
    });
  });

  withWorkspace((root) => {
    const record = releaseEvidenceRecord("1.0.0-rc.1", "rc");
    const divergent = createEvidenceWorkspace(root, "1.0.0-rc.1", {
      record,
      assetBytes: `${JSON.stringify(record, null, 2)}`,
    });
    assert.deepEqual(verifyReleaseEvidence(divergent), {
      ok: false,
      error: "asset_mismatch",
    });
  });
});

test("release evidence verifier rejects a replaced record and a broken digest line", () => {
  withWorkspace((root) => {
    const replaced = createEvidenceWorkspace(root, "1.0.0-rc.1", {
      checksums: `${"0".repeat(64)}  release-evidence.json\n`,
    });
    assert.deepEqual(verifyReleaseEvidence(replaced), {
      ok: false,
      error: "checksum_mismatch",
    });
  });

  const digestOf = (packageVersion: string): string =>
    createHash("sha256")
      .update(
        `${JSON.stringify(releaseEvidenceRecord(packageVersion, "rc"), null, 2)}\n`,
      )
      .digest("hex");

  const brokenChecksumFiles = [
    "",
    `${digestOf("1.0.0-rc.1")} release-evidence.json\n`,
    `${digestOf("1.0.0-rc.1")}  release-evidence.json`,
    `${digestOf("1.0.0-rc.1")}  release-evidence.json\r\n`,
    `${digestOf("1.0.0-rc.1").toUpperCase()}  release-evidence.json\n`,
    `${digestOf("1.0.0-rc.1")}  other-file.json\n`,
    `${digestOf("1.0.0-rc.1")}  release-evidence.json\n${digestOf("1.0.0-rc.1")}  release-evidence.json\n`,
  ];

  for (const checksums of brokenChecksumFiles) {
    withWorkspace((root) => {
      const workspace = createEvidenceWorkspace(root, "1.0.0-rc.1", { checksums });
      assert.deepEqual(
        verifyReleaseEvidence(workspace),
        { ok: false, error: "checksum_mismatch" },
        JSON.stringify(checksums),
      );
    });
  }
});

test("release evidence verifier rejects records outside the closed shape", () => {
  const mutations: Array<[string, (record: Record<string, any>) => void]> = [
    ["unknown member", (record) => {
      record.publishedBy = "release-manager";
    }],
    ["missing member", (record) => {
      delete record.cleanConsumer;
    }],
    ["reordered members", (record) => {
      const { packageVersion, ...rest } = record;
      for (const key of Object.keys(record)) {
        delete record[key];
      }
      Object.assign(record, rest, { packageVersion });
    }],
    ["unknown nested member", (record) => {
      record.gitTag.signed = true;
    }],
    ["wrong record contract version", (record) => {
      record.evidenceRecordVersion = "0.2.0";
    }],
    ["tag that does not match the package version", (record) => {
      record.gitTag.name = "v1.0.0";
    }],
    ["release tag that does not match the git tag", (record) => {
      record.githubRelease.tag = "v1.0.0-rc.2";
    }],
    ["tag object identical to the commit", (record) => {
      record.gitTag.tagObjectSha = record.gitTag.commitSha;
    }],
    ["unverified provenance", (record) => {
      record.npmProvenance.verified = false;
    }],
    ["empty dist-tags", (record) => {
      record.registryPublication.distTags = [];
    }],
    ["malformed archive digest", (record) => {
      record.registryPublication.archiveDigest = "sha256-deadbeef";
    }],
    ["malformed publication time", (record) => {
      record.registryPublication.publishedAt = "2026-09-02 10:15:30";
    }],
    ["unexpected workflow path", (record) => {
      record.githubRelease.workflowPath = ".github/workflows/ci.yml";
    }],
    ["failed clean consumer", (record) => {
      record.cleanConsumer.status = "failed";
    }],
  ];

  for (const [description, mutate] of mutations) {
    withWorkspace((root) => {
      const record = releaseEvidenceRecord("1.0.0-rc.1", "rc");
      mutate(record);
      const workspace = createEvidenceWorkspace(root, "1.0.0-rc.1", { record });
      assert.deepEqual(
        verifyReleaseEvidence(workspace),
        { ok: false, error: "invalid_record" },
        description,
      );
    });
  }

  withWorkspace((root) => {
    const workspace = createEvidenceWorkspace(root, "1.0.0-rc.1", {
      recordBytes: "{ not json }\n",
    });
    assert.deepEqual(verifyReleaseEvidence(workspace), {
      ok: false,
      error: "invalid_record",
    });
  });

  withWorkspace((root) => {
    const workspace = createEvidenceWorkspace(root, "1.0.0-rc.1", {
      record: releaseEvidenceRecord("1.0.0-rc.2", "rc"),
    });
    assert.deepEqual(verifyReleaseEvidence(workspace), {
      ok: false,
      error: "invalid_record",
    });
  });
});

test("release evidence corrections are append-only numbered amendments", () => {
  const amendment = (packageVersion: string): Record<string, unknown> => ({
    ...releaseEvidenceRecord(packageVersion, "rc"),
    amendsRecord: "release-evidence.json",
    amendmentNumber: 1,
  });

  withWorkspace((root) => {
    const workspace = createEvidenceWorkspace(root, "1.0.0-rc.1", {
      recordFileName: "release-evidence-amendment-1.json",
      record: amendment("1.0.0-rc.1"),
    });
    assert.equal(
      workspace.assetPath.endsWith(
        "collective-cognition-sdk-1.0.0-rc.1-release-evidence-amendment-1.json",
      ),
      true,
    );
    assert.deepEqual(verifyReleaseEvidence(workspace), {
      ok: true,
      packageVersion: "1.0.0-rc.1",
      recordFile: "release-evidence-amendment-1.json",
    });
  });

  const rejectedRecordFiles: Array<[string, Record<string, unknown>]> = [
    ["release-evidence-v2.json", amendment("1.0.0-rc.1")],
    ["release-evidence-amendment-01.json", amendment("1.0.0-rc.1")],
    ["release-evidence-amendment-0.json", amendment("1.0.0-rc.1")],
    ["release-evidence-amendment-1.json", releaseEvidenceRecord("1.0.0-rc.1", "rc")],
    ["release-evidence.json", amendment("1.0.0-rc.1")],
  ];

  for (const [recordFileName, record] of rejectedRecordFiles) {
    withWorkspace((root) => {
      const workspace = createEvidenceWorkspace(root, "1.0.0-rc.1", {
        recordFileName,
        record,
      });
      assert.deepEqual(
        verifyReleaseEvidence(workspace),
        { ok: false, error: "invalid_record" },
        recordFileName,
      );
    });
  }

  withWorkspace((root) => {
    const workspace = createEvidenceWorkspace(root, "1.0.0-rc.1", {
      recordFileName: "release-evidence-amendment-2.json",
      record: { ...amendment("1.0.0-rc.1"), amendmentNumber: 1 },
    });
    assert.deepEqual(verifyReleaseEvidence(workspace), {
      ok: false,
      error: "invalid_record",
    });
  });
});

test("release evidence command line exits with secret-safe stable codes", () => {
  withWorkspace((root) => {
    const workspace = createEvidenceWorkspace(root, "1.0.0-rc.1");
    const verified = spawnSync(
      process.execPath,
      [
        verifierPath,
        "--record",
        workspace.recordPath,
        "--asset",
        workspace.assetPath,
        "--checksums",
        workspace.checksumsPath,
      ],
      { encoding: "utf8" },
    );
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(verified.stderr, "");
    assert.deepEqual(JSON.parse(verified.stdout), {
      ok: true,
      packageVersion: "1.0.0-rc.1",
      recordFile: "release-evidence.json",
    });
  });

  withWorkspace((root) => {
    const secret = `npm_${"s".repeat(36)}`;
    const record = releaseEvidenceRecord("1.0.0-rc.1", "rc");
    (record as Record<string, unknown>).publisherToken = secret;
    const workspace = createEvidenceWorkspace(root, "1.0.0-rc.1", { record });
    const rejected = spawnSync(
      process.execPath,
      [
        verifierPath,
        "--record",
        workspace.recordPath,
        "--asset",
        workspace.assetPath,
        "--checksums",
        workspace.checksumsPath,
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(rejected.status, 0);
    assert.equal(rejected.stdout, "");
    assert.deepEqual(JSON.parse(rejected.stderr), {
      ok: false,
      error: "invalid_record",
    });
    assert.equal(rejected.stderr.includes(secret), false);
    assert.equal(rejected.stderr.includes(workspace.recordPath), false);
  });

  withWorkspace((root) => {
    const workspace = createEvidenceWorkspace(root, "1.0.0-rc.1");
    const missingArgument = spawnSync(
      process.execPath,
      [verifierPath, "--record", workspace.recordPath],
      { encoding: "utf8" },
    );
    assert.notEqual(missingArgument.status, 0);
    assert.deepEqual(JSON.parse(missingArgument.stderr), {
      ok: false,
      error: "invalid_record",
    });
  });
});
