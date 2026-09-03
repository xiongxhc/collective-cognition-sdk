import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const RECORD_CONTRACT_VERSION = "0.1.0";
const ASSET_NAME_PREFIX = "collective-cognition-sdk-";
const RELEASE_WORKFLOW_PATH = ".github/workflows/npm-publish.yml";
const BASE_RECORD_FILE = "release-evidence.json";
const RECORD_DIRECTORY_SEGMENTS = ["docs", "acceptance", "releases"];
const AMENDMENT_FILE_PATTERN = /^release-evidence-amendment-([1-9][0-9]*)\.json$/;
const RECORD_KEYS = [
  "evidenceRecordVersion",
  "packageVersion",
  "registryPublication",
  "npmProvenance",
  "gitTag",
  "githubRelease",
  "cleanConsumer",
];
const AMENDMENT_KEYS = [...RECORD_KEYS, "amendsRecord", "amendmentNumber"];
const VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;
const PUBLISHED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ARCHIVE_DIGEST_PATTERN = /^sha512-[A-Za-z0-9+/]{86}==$/;
const OBJECT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const WORKFLOW_RUN_PATTERN = /^[1-9][0-9]*$/;
const NODE_VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;
const DIST_TAG_PATTERN = /^[a-z][a-z0-9-]*$/;
const CHECKSUM_LINE_PATTERN = /^([0-9a-f]{64})  ([^ ].*)$/;

function failure(code) {
  return { ok: false, error: code };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  if (!isPlainObject(value)) {
    return false;
  }
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function isSingleLineText(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("\n")
  );
}

function matches(pattern, value) {
  return typeof value === "string" && pattern.test(value);
}

function recordDirectoryMatches(recordPath, packageVersion) {
  const segments = resolve(recordPath).split(sep);
  const parents = segments.slice(-5, -1);
  return (
    parents.length === 4 &&
    parents[0] === RECORD_DIRECTORY_SEGMENTS[0] &&
    parents[1] === RECORD_DIRECTORY_SEGMENTS[1] &&
    parents[2] === RECORD_DIRECTORY_SEGMENTS[2] &&
    parents[3] === packageVersion &&
    basename(dirname(recordPath)) === packageVersion
  );
}

function isValidRegistryPublication(publication) {
  if (!hasExactKeys(publication, ["publishedAt", "archiveDigest", "distTags"])) {
    return false;
  }
  if (!matches(PUBLISHED_AT_PATTERN, publication.publishedAt)) {
    return false;
  }
  if (Number.isNaN(Date.parse(publication.publishedAt))) {
    return false;
  }
  if (!matches(ARCHIVE_DIGEST_PATTERN, publication.archiveDigest)) {
    return false;
  }
  const distTags = publication.distTags;
  return (
    Array.isArray(distTags) &&
    distTags.length > 0 &&
    new Set(distTags).size === distTags.length &&
    distTags.every((tag) => matches(DIST_TAG_PATTERN, tag))
  );
}

function isValidGitTag(gitTag, packageVersion) {
  return (
    hasExactKeys(gitTag, ["name", "tagObjectSha", "commitSha"]) &&
    gitTag.name === `v${packageVersion}` &&
    matches(OBJECT_SHA_PATTERN, gitTag.tagObjectSha) &&
    matches(OBJECT_SHA_PATTERN, gitTag.commitSha) &&
    gitTag.tagObjectSha !== gitTag.commitSha
  );
}

function isValidRecord(record, recordFile, recordPath) {
  const amendment = AMENDMENT_FILE_PATTERN.exec(recordFile);
  if (recordFile !== BASE_RECORD_FILE && amendment === null) {
    return false;
  }
  if (!hasExactKeys(record, amendment === null ? RECORD_KEYS : AMENDMENT_KEYS)) {
    return false;
  }
  if (record.evidenceRecordVersion !== RECORD_CONTRACT_VERSION) {
    return false;
  }
  if (!isSingleLineText(record.packageVersion) || !VERSION_PATTERN.test(record.packageVersion)) {
    return false;
  }
  if (!recordDirectoryMatches(recordPath, record.packageVersion)) {
    return false;
  }
  if (
    amendment !== null &&
    (record.amendsRecord !== BASE_RECORD_FILE ||
      record.amendmentNumber !== Number(amendment[1]))
  ) {
    return false;
  }
  if (!isValidRegistryPublication(record.registryPublication)) {
    return false;
  }
  if (
    !hasExactKeys(record.npmProvenance, ["identity", "verified"]) ||
    !isSingleLineText(record.npmProvenance.identity) ||
    record.npmProvenance.verified !== true
  ) {
    return false;
  }
  if (!isValidGitTag(record.gitTag, record.packageVersion)) {
    return false;
  }
  if (
    !hasExactKeys(record.githubRelease, ["tag", "workflowPath", "workflowRunId"]) ||
    record.githubRelease.tag !== record.gitTag.name ||
    record.githubRelease.workflowPath !== RELEASE_WORKFLOW_PATH ||
    !matches(WORKFLOW_RUN_PATTERN, record.githubRelease.workflowRunId)
  ) {
    return false;
  }
  return (
    hasExactKeys(record.cleanConsumer, ["status", "nodeVersion"]) &&
    record.cleanConsumer.status === "passed" &&
    matches(NODE_VERSION_PATTERN, record.cleanConsumer.nodeVersion)
  );
}

function parseChecksums(text) {
  if (text.length === 0 || !text.endsWith("\n") || text.includes("\r")) {
    return null;
  }
  const digests = new Map();
  for (const line of text.slice(0, -1).split("\n")) {
    const entry = CHECKSUM_LINE_PATTERN.exec(line);
    if (entry === null || digests.has(entry[2])) {
      return null;
    }
    digests.set(entry[2], entry[1]);
  }
  return digests;
}

export function verifyReleaseEvidence({ recordPath, assetPath, checksumsPath }) {
  if (
    ![recordPath, assetPath, checksumsPath].every(
      (path) => typeof path === "string" && path.length > 0,
    )
  ) {
    return failure("invalid_record");
  }

  let recordBytes;
  let record;
  try {
    recordBytes = readFileSync(recordPath);
    record = JSON.parse(recordBytes.toString("utf8"));
  } catch {
    return failure("invalid_record");
  }

  const recordFile = basename(recordPath);
  if (!isValidRecord(record, recordFile, recordPath)) {
    return failure("invalid_record");
  }

  let assetBytes;
  try {
    assetBytes = readFileSync(assetPath);
  } catch {
    return failure("asset_mismatch");
  }
  if (
    basename(assetPath) !== `${ASSET_NAME_PREFIX}${record.packageVersion}-${recordFile}` ||
    !recordBytes.equals(assetBytes)
  ) {
    return failure("asset_mismatch");
  }

  let checksumsText;
  try {
    checksumsText = readFileSync(checksumsPath, "utf8");
  } catch {
    return failure("checksum_mismatch");
  }
  const digests = parseChecksums(checksumsText);
  if (digests === null) {
    return failure("checksum_mismatch");
  }
  if (digests.get(recordFile) !== createHash("sha256").update(recordBytes).digest("hex")) {
    return failure("checksum_mismatch");
  }

  return { ok: true, packageVersion: record.packageVersion, recordFile };
}

function parseArguments(argv) {
  const flags = ["--record", "--asset", "--checksums"];
  if (argv.length !== flags.length * 2) {
    return null;
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flags.includes(flag) || values.has(flag) || typeof value !== "string" || value.length === 0) {
      return null;
    }
    values.set(flag, value);
  }
  return {
    recordPath: values.get("--record"),
    assetPath: values.get("--asset"),
    checksumsPath: values.get("--checksums"),
  };
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const parsed = parseArguments(process.argv.slice(2));
  const result = parsed === null ? failure("invalid_record") : verifyReleaseEvidence(parsed);
  if (result.ok) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stderr.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 1;
  }
}
