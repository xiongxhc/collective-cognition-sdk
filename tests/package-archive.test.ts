import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";

type PackageArchiveResult =
  | { ok: true; packageVersion: string }
  | { ok: false; error: string };

type PackageArchiveVerifier = (input: {
  archivePath: string;
  expectedVersion: string;
}) => Promise<PackageArchiveResult>;

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const verifierPath = fileURLToPath(
  new URL("../scripts/verify-package-archive.mjs", import.meta.url),
);
const { verifyPackageArchive } = (await import(
  new URL("../scripts/verify-package-archive.mjs", import.meta.url).href
)) as { verifyPackageArchive: PackageArchiveVerifier };

const packageVersion = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;

let workspace: string;
let baselineArchive: string;
let stagedPackage: string;

before(() => {
  workspace = mkdtempSync(join(tmpdir(), "ccsdk-package-archive-"));
  const packDestination = join(workspace, "packed");
  const npmCache = join(workspace, "npm-cache");
  mkdirSync(packDestination, { recursive: true });
  mkdirSync(npmCache, { recursive: true });

  const packed = spawnSync(
    "npm",
    [
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      packDestination,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: npmCache },
      shell: process.platform === "win32",
    },
  );
  assert.equal(packed.status, 0, packed.stderr);
  const results = JSON.parse(packed.stdout) as Array<{ filename: string }>;
  assert.equal(results.length, 1);
  baselineArchive = join(packDestination, results[0]!.filename);

  const stagingRoot = join(workspace, "staged");
  mkdirSync(stagingRoot, { recursive: true });
  const extracted = spawnSync(
    "tar",
    ["-xpf", baselineArchive, "-C", stagingRoot],
    { encoding: "utf8" },
  );
  assert.equal(extracted.status, 0, extracted.stderr);
  stagedPackage = join(stagingRoot, "package");
});

after(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function mutatedArchive(
  name: string,
  mutate: (packageRoot: string) => void,
): string {
  const mutationRoot = join(workspace, "mutations", name);
  mkdirSync(mutationRoot, { recursive: true });
  const packageRoot = join(mutationRoot, "package");
  cpSync(stagedPackage, packageRoot, { recursive: true, preserveTimestamps: true });
  mutate(packageRoot);
  const archivePath = join(mutationRoot, `${name}.tgz`);
  const created = spawnSync(
    "tar",
    ["-czf", archivePath, "-C", mutationRoot, "package"],
    { encoding: "utf8", env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
  assert.equal(created.status, 0, created.stderr);
  return archivePath;
}

test("package archive verifier accepts one deliberately valid local tarball", async () => {
  assert.deepEqual(
    await verifyPackageArchive({
      archivePath: baselineArchive,
      expectedVersion: packageVersion,
    }),
    { ok: true, packageVersion },
  );
});

test("package archive verifier rejects contents outside the declared package", async () => {
  const extraFile = mutatedArchive("extra-file", (packageRoot) => {
    mkdirSync(join(packageRoot, "docs", "acceptance"), { recursive: true });
    writeFileSync(
      join(packageRoot, "docs", "acceptance", "internal-notes.md"),
      "# Internal notes\n",
    );
  });
  assert.deepEqual(
    await verifyPackageArchive({
      archivePath: extraFile,
      expectedVersion: packageVersion,
    }),
    { ok: false, error: "unexpected_package_path" },
  );

  const privatePath = mutatedArchive("private-path", (packageRoot) => {
    writeFileSync(
      join(packageRoot, ".npmrc"),
      "//registry.npmjs.org/:_authToken=placeholder\n",
    );
  });
  assert.deepEqual(
    await verifyPackageArchive({
      archivePath: privatePath,
      expectedVersion: packageVersion,
    }),
    { ok: false, error: "private_path_detected" },
  );
});

test("package archive verifier rejects a missing license", async () => {
  const missingLicense = mutatedArchive("missing-license", (packageRoot) => {
    rmSync(join(packageRoot, "LICENSE"));
  });
  assert.deepEqual(
    await verifyPackageArchive({
      archivePath: missingLicense,
      expectedVersion: packageVersion,
    }),
    { ok: false, error: "missing_required_path" },
  );
});

test("package archive verifier rejects a package version mismatch", async () => {
  assert.deepEqual(
    await verifyPackageArchive({
      archivePath: baselineArchive,
      expectedVersion: "1.0.0-rc.1",
    }),
    { ok: false, error: "version_mismatch" },
  );

  const rewrittenVersion = mutatedArchive("wrong-version", (packageRoot) => {
    const manifestPath = join(packageRoot, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    manifest.version = "1.0.0-rc.1";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  });
  assert.deepEqual(
    await verifyPackageArchive({
      archivePath: rewrittenVersion,
      expectedVersion: packageVersion,
    }),
    { ok: false, error: "version_mismatch" },
  );
});

test("package archive verifier rejects a non-executable installed CLI", async () => {
  const nonExecutable = mutatedArchive("non-executable-cli", (packageRoot) => {
    chmodSync(join(packageRoot, "dist", "workflow-cli.js"), 0o644);
  });
  assert.deepEqual(
    await verifyPackageArchive({
      archivePath: nonExecutable,
      expectedVersion: packageVersion,
    }),
    { ok: false, error: "executable_mode_invalid" },
  );
});

test("package archive verifier rejects credential patterns in packaged text", async () => {
  const secret = `npm_${"s".repeat(36)}`;
  const leaked = mutatedArchive("leaked-credential", (packageRoot) => {
    const readmePath = join(packageRoot, "README.md");
    writeFileSync(
      readmePath,
      `${readFileSync(readmePath, "utf8")}\nPublish with ${secret}.\n`,
    );
  });
  assert.deepEqual(
    await verifyPackageArchive({
      archivePath: leaked,
      expectedVersion: packageVersion,
    }),
    { ok: false, error: "credential_pattern_detected" },
  );

  const rejected = spawnSync(
    process.execPath,
    [
      verifierPath,
      "--archive",
      leaked,
      "--expected-version",
      packageVersion,
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(rejected.status, 0);
  assert.equal(rejected.stdout, "");
  assert.deepEqual(JSON.parse(rejected.stderr), {
    ok: false,
    error: "credential_pattern_detected",
  });
  assert.equal(rejected.stderr.includes(secret), false);
  assert.equal(rejected.stderr.includes(leaked), false);
});

test("package archive verifier rejects a workstation absolute path", async () => {
  const workstationPath = "/Users/example/.cache/runtimes/node/bin";
  const leakedPath = mutatedArchive("workstation-path", (packageRoot) => {
    const readmePath = join(packageRoot, "README.md");
    writeFileSync(
      readmePath,
      `${readFileSync(readmePath, "utf8")}\nRun with PATH=${workstationPath}:$PATH\n`,
    );
  });
  assert.deepEqual(
    await verifyPackageArchive({
      archivePath: leakedPath,
      expectedVersion: packageVersion,
    }),
    { ok: false, error: "credential_pattern_detected" },
  );

  const rejected = spawnSync(
    process.execPath,
    [verifierPath, "--archive", leakedPath, "--expected-version", packageVersion],
    { encoding: "utf8" },
  );
  assert.notEqual(rejected.status, 0);
  assert.equal(rejected.stderr.includes(workstationPath), false);
});

test("package archive verifier rejects a broken export", async () => {
  const brokenExport = mutatedArchive("broken-export", (packageRoot) => {
    const indexPath = join(packageRoot, "dist", "index.js");
    writeFileSync(
      indexPath,
      `${readFileSync(indexPath, "utf8")}\nexport const = ;\n`,
    );
  });
  assert.deepEqual(
    await verifyPackageArchive({
      archivePath: brokenExport,
      expectedVersion: packageVersion,
    }),
    { ok: false, error: "export_resolution_failed" },
  );
});

test("package archive command line reports the verified version", () => {
  const verified = spawnSync(
    process.execPath,
    [
      verifierPath,
      "--archive",
      baselineArchive,
      "--expected-version",
      packageVersion,
    ],
    { encoding: "utf8" },
  );
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(JSON.parse(verified.stdout), {
    ok: true,
    packageVersion,
  });

  const missingArgument = spawnSync(
    process.execPath,
    [verifierPath, "--archive", baselineArchive],
    { encoding: "utf8" },
  );
  assert.notEqual(missingArgument.status, 0);
  assert.deepEqual(JSON.parse(missingArgument.stderr), {
    ok: false,
    error: "invalid_arguments",
  });
});
