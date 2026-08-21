import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";

import {
  runCrossConnectorInteroperabilityExample,
} from "../examples/cross-connector-interoperability.ts";
import type {
  CrossConnectorInteroperabilityExampleEvent,
  CrossConnectorInteroperabilityExampleResult,
} from "../examples/cross-connector-interoperability.ts";

const expectedExtension = {
  "example.invalid/connector-note": {
    preservation: "opaque",
    values: ["fictional", 1, true, null],
  },
};

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path.length > 0 && path !== ".." && !path.startsWith(`..${sep}`);
}

function runObservedExample(): {
  readonly result: CrossConnectorInteroperabilityExampleResult;
  readonly events: readonly CrossConnectorInteroperabilityExampleEvent[];
} {
  const events: CrossConnectorInteroperabilityExampleEvent[] = [];
  const result = runCrossConnectorInteroperabilityExample({
    observe(event) {
      events.push(event);
    },
  });
  return { result, events };
}

test("runs two maintained connectors through one owned portable exchange", () => {
  const externalDirectory = mkdtempSync(join(tmpdir(), "cc-interoperability-test-"));
  const sentinelPath = join(externalDirectory, "external-sentinel.txt");
  const sentinelContents = "external fictional sentinel\n";
  writeFileSync(sentinelPath, sentinelContents);
  const originalWorkingDirectory = process.cwd();
  const sentinelBefore = statSync(sentinelPath, { bigint: true });

  try {
    const runs = [runObservedExample(), runObservedExample()];

    assert.deepEqual(runs[0]?.result, runs[1]?.result);
    assert.deepEqual(runs[0]?.result, {
      sourceRecordCount: 2,
      sourceSystems: ["git-repository", "teammem-event-ledger"],
      acceptedRecordCount: 2,
      evidenceId:
        "evidence:promotion:sha256:232909c3ebfadf4bbdf07f4b780542e6f21739c132b85c343aba49bfa9fa5966",
      hypothesisId: "hypothesis:fictional-interoperability",
      portableRecordCount: 5,
      semanticRoundTrip: true,
      decisionsInferred: 0,
      principlesInferred: 0,
    });
    assert.match(
      runs[0]?.result.evidenceId ?? "",
      /^evidence:promotion:sha256:[0-9a-f]{64}$/,
    );
    assert.equal(process.cwd(), originalWorkingDirectory);
    assert.equal(readFileSync(sentinelPath, "utf8"), sentinelContents);
    const sentinelAfter = statSync(sentinelPath, { bigint: true });
    assert.equal(sentinelAfter.size, sentinelBefore.size);
    assert.equal(sentinelAfter.mtimeNs, sentinelBefore.mtimeNs);

    for (const run of runs) {
      const sources = run.events.filter((event) => event.type === "temporary-sources");
      const ingestions = run.events.filter((event) => event.type === "ingestion");
      const exchanges = run.events.filter((event) => event.type === "exchange");

      assert.equal(sources.length, 1);
      assert.equal(ingestions.length, 1);
      assert.equal(exchanges.length, 1);

      const source = sources[0];
      assert.ok(source?.type === "temporary-sources");
      assert.ok(isWithin(tmpdir(), source.temporaryRoot));
      assert.ok(isWithin(source.temporaryRoot, source.repositoryPath));
      assert.ok(isWithin(source.temporaryRoot, source.databasePath));
      assert.equal(existsSync(source.temporaryRoot), false);
      assert.notEqual(dirname(sentinelPath), source.temporaryRoot);

      const ingestion = ingestions[0];
      assert.ok(ingestion?.type === "ingestion");
      assert.deepEqual(
        ingestion.records.map((record) => record.source.system),
        ["git-repository", "teammem-event-ledger"],
      );
      assert.deepEqual(
        ingestion.result.items.map((item) => item.status),
        ["accepted", "accepted"],
      );

      const exchange = exchanges[0];
      assert.ok(exchange?.type === "exchange");
      const evidence = exchange.cognitiveObjects.find(
        (object) => object.type === "evidence",
      );
      assert.ok(evidence?.type === "evidence");
      assert.equal(evidence.data.polarity, "neutral");
      const recordSystemsById = new Map(
        ingestion.records.map((record) => [record.id, record.source.system]),
      );
      assert.deepEqual(
        evidence.provenance.map((item) => recordSystemsById.get(item.sourceId)),
        ["git-repository", "teammem-event-ledger"],
      );

      assert.equal(exchange.portableRecords.length, 5);
      assert.deepEqual(exchange.restoredPortableRecords, exchange.portableRecords);
      const restoredGoal = exchange.restoredPortableRecords.find(
        (record) =>
          record.recordType === "cognitive-object" &&
          record.payload.type === "goal",
      );
      assert.ok(restoredGoal?.recordType === "cognitive-object");
      assert.deepEqual(restoredGoal.payload.extensions, expectedExtension);
      assert.equal(
        JSON.stringify(restoredGoal.payload.extensions),
        JSON.stringify(expectedExtension),
      );
      assert.equal(
        exchange.cognitiveObjects.filter((object) => object.type === "decision").length,
        0,
      );
      assert.equal(
        exchange.cognitiveObjects.filter((object) => object.type === "principle").length,
        0,
      );
    }
  } finally {
    rmSync(externalDirectory, { force: true, recursive: true });
  }
});

test("removes the temporary root when observation interrupts the exchange", () => {
  let temporaryRoot: string | undefined;
  try {
    assert.throws(
      () =>
        runCrossConnectorInteroperabilityExample({
          observe(event) {
            if (event.type === "temporary-sources") {
              temporaryRoot = event.temporaryRoot;
              throw new Error("fictional observer interruption");
            }
          },
        }),
      /fictional observer interruption/,
    );
    assert.ok(temporaryRoot !== undefined);
    assert.equal(existsSync(temporaryRoot), false);
  } finally {
    if (temporaryRoot !== undefined) {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  }
});

test("direct execution prints one sanitized deterministic JSON line", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "examples/cross-connector-interoperability.ts",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim().split("\n").length, 1);
  const output = JSON.parse(result.stdout) as CrossConnectorInteroperabilityExampleResult;
  assert.equal(result.stdout, `${JSON.stringify(output)}\n`);
  assert.deepEqual(output.sourceSystems, [
    "git-repository",
    "teammem-event-ledger",
  ]);
  assert.equal(output.semanticRoundTrip, true);
  assert.doesNotMatch(
    result.stdout,
    /(?:\/Users\/|ledger\.db|\/repository(?:["/])|Fictional Author|Fictional ledger observation|\.git)/,
  );
});
