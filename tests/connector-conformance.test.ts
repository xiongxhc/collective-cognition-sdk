import assert from "node:assert/strict";
import test from "node:test";

import { createSourceRecord } from "../src/index.ts";
import {
  runSourceConnectorConformance,
} from "../src/connector-conformance.ts";
import type {
  SourceConnectorConformanceCase,
} from "../src/connector-conformance.ts";
import type { SourceRecord } from "../src/source-records.ts";

function record(
  id = "source-record:fictional:entry-1:revision-1",
  revisionId = "revision-1",
): SourceRecord {
  return createSourceRecord({
    id,
    source: {
      system: "fictional-ledger",
      instance: "public-demo",
    },
    sourceId: "entry-1",
    revisionId,
    capturedAt: "2026-07-29T10:00:00.000Z",
    mediaType: "application/json",
    content: {
      summary: "A fictional source entry.",
      nested: { tags: ["fictional", "conformance"] },
    },
  });
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) &&
    Object.values(value).every(isDeepFrozen);
}

test("passes valid synchronous and asynchronous connector cases", async () => {
  const syncRecord = record();
  const asyncRecord = record(
    "source-record:fictional:entry-2:revision-1",
    "revision-2",
  );

  const results = await runSourceConnectorConformance([
    {
      name: "fictional sync connector",
      collect: () => [syncRecord],
    },
    {
      name: "fictional async connector",
      collect: async () => [asyncRecord],
    },
  ]);

  assert.deepEqual(results, [
    {
      name: "fictional sync connector",
      status: "passed",
      diagnostics: [],
    },
    {
      name: "fictional async connector",
      status: "passed",
      diagnostics: [],
    },
  ]);
  assert.equal(isDeepFrozen(results), true);
});

test("accepts canonically deterministic repeated collection", async () => {
  const results = await runSourceConnectorConformance([{
    name: "deterministic connector",
    collect: () => [
      createSourceRecord({
        id: "source-record:fictional:entry-1:revision-1",
        source: {
          system: "fictional-ledger",
          instance: "public-demo",
        },
        sourceId: "entry-1",
        revisionId: "revision-1",
        capturedAt: "2026-07-29T10:00:00.000Z",
        mediaType: "application/json",
        content: { alpha: 1, beta: 2 },
      }),
    ],
    collectAgain: () => [
      createSourceRecord({
        id: "source-record:fictional:entry-1:revision-1",
        source: {
          instance: "public-demo",
          system: "fictional-ledger",
        },
        sourceId: "entry-1",
        revisionId: "revision-1",
        capturedAt: "2026-07-29T10:00:00.000Z",
        mediaType: "application/json",
        content: { beta: 2, alpha: 1 },
      }),
    ],
  }]);

  assert.equal(results[0].status, "passed");
  assert.deepEqual(results[0].diagnostics, []);
});

test("reports invalid collections and records without aborting later cases", async () => {
  const results = await runSourceConnectorConformance([
    {
      name: "not an array",
      collect: () => ({}) as never,
    },
    {
      name: "invalid source record",
      collect: () => [{ schemaVersion: "9" }] as never,
    },
    {
      name: "later valid connector",
      collect: () => [record()],
    },
  ]);

  assert.equal(results[0].status, "failed");
  assert.deepEqual(
    results[0].diagnostics.map(({ code }) => code),
    ["invalid_collection"],
  );
  assert.equal(results[1].status, "failed");
  assert.deepEqual(results[1].diagnostics, [{
    code: "invalid_source_record",
    message: "Connector returned an invalid SourceRecord.",
    itemIndex: 0,
  }]);
  assert.equal(results[2].status, "passed");
  assert.equal(isDeepFrozen(results), true);
});

test("reports duplicate revision keys", async () => {
  const first = record();
  const duplicate = createSourceRecord({
    id: "source-record:fictional:alternate-id",
    source: first.source,
    sourceId: first.sourceId,
    revisionId: first.revisionId,
    capturedAt: first.capturedAt,
    mediaType: first.mediaType,
    content: first.content,
  });

  const results = await runSourceConnectorConformance([{
    name: "duplicate connector",
    collect: () => [first, duplicate],
  }]);

  assert.deepEqual(results[0].diagnostics, [{
    code: "duplicate_revision",
    message: "Connector returned a duplicate source revision.",
    itemIndex: 1,
  }]);
});

test("reports nondeterministic repeated output", async () => {
  const results = await runSourceConnectorConformance([{
    name: "changing connector",
    collect: () => [record()],
    collectAgain: () => [
      record("source-record:fictional:entry-1:revision-2", "revision-2"),
    ],
  }]);

  assert.deepEqual(results[0].diagnostics, [{
    code: "nondeterministic_output",
    message: "Connector output was not deterministic.",
  }]);
});

test("sanitizes connector exceptions and continues", async () => {
  const results = await runSourceConnectorConformance([
    {
      name: "throwing connector",
      collect: () => {
        throw new Error("secret-token at /tmp/private-ledger.db");
      },
    },
    {
      name: "later valid connector",
      collect: () => [record()],
    },
  ]);

  assert.deepEqual(results[0].diagnostics, [{
    code: "connector_exception",
    message: "Connector collection failed.",
  }]);
  assert.doesNotMatch(JSON.stringify(results), /secret-token|private-ledger/);
  assert.equal(results[1].status, "passed");
});

test("rejects accessor, inherited, extra, and proxy case fields without invoking them", async () => {
  let accessorInvocations = 0;
  const accessorCase = Object.create(null);
  Object.defineProperty(accessorCase, "name", {
    enumerable: true,
    get() {
      accessorInvocations += 1;
      return "accessor connector";
    },
  });
  Object.defineProperty(accessorCase, "collect", {
    enumerable: true,
    value: () => [record()],
  });

  const collectAccessorCase = {
    name: "collect accessor connector",
  } as Record<string, unknown>;
  Object.defineProperty(collectAccessorCase, "collect", {
    enumerable: true,
    get() {
      accessorInvocations += 1;
      return () => [record()];
    },
  });

  const collectAgainAccessorCase = {
    name: "collect again accessor connector",
    collect: () => [record()],
  } as Record<string, unknown>;
  Object.defineProperty(collectAgainAccessorCase, "collectAgain", {
    enumerable: true,
    get() {
      accessorInvocations += 1;
      return () => [record()];
    },
  });

  const inheritedCase = Object.create({
    name: "inherited connector",
    collect: () => [record()],
  });

  const extraFieldCase = {
    name: "extra field connector",
    collect: () => [record()],
    credential: "must-not-be-read",
  };

  const proxyCase = new Proxy({}, {
    ownKeys() {
      throw new Error("proxy secret");
    },
  });

  const results = await runSourceConnectorConformance([
    accessorCase,
    collectAccessorCase,
    collectAgainAccessorCase,
    inheritedCase,
    extraFieldCase,
    proxyCase,
    {
      name: "later valid connector",
      collect: () => [record()],
    },
  ] as unknown as readonly SourceConnectorConformanceCase[]);

  assert.equal(accessorInvocations, 0);
  assert.deepEqual(
    results.map(({ status }) => status),
    ["failed", "failed", "failed", "failed", "failed", "failed", "passed"],
  );
  assert.equal(
    results.slice(0, 6).every(({ diagnostics }) =>
      diagnostics[0]?.code === "invalid_collection"
    ),
    true,
  );
  assert.doesNotMatch(
    JSON.stringify(results),
    /credential|must-not-be-read|proxy secret/,
  );
});

test("rejects malformed case arrays without reading indexed accessors", async () => {
  let accessorInvocations = 0;
  const accessorArray: SourceConnectorConformanceCase[] = [];
  accessorArray.length = 1;
  Object.defineProperty(accessorArray, "0", {
    enumerable: true,
    get() {
      accessorInvocations += 1;
      return {
        name: "array accessor connector",
        collect: () => [record()],
      };
    },
  });

  const sparseCases = new Array(1) as SourceConnectorConformanceCase[];
  const oversizedSparseCases =
    new Array(0xffff_ffff) as SourceConnectorConformanceCase[];

  const accessorResults = await runSourceConnectorConformance(accessorArray);
  const sparseResults = await runSourceConnectorConformance(sparseCases);
  const oversizedSparseResults =
    await runSourceConnectorConformance(oversizedSparseCases);
  const nonArrayResults = await runSourceConnectorConformance(
    {} as readonly SourceConnectorConformanceCase[],
  );

  assert.equal(accessorInvocations, 0);
  assert.equal(accessorResults[0].status, "failed");
  assert.equal(sparseResults[0].status, "failed");
  assert.equal(oversizedSparseResults[0].status, "failed");
  assert.deepEqual(nonArrayResults, [{
    name: "connector case 1",
    status: "failed",
    diagnostics: [{
      code: "invalid_collection",
      message: "Connector conformance case is invalid.",
    }],
  }]);
});

test("snapshots hostile record proxies without ordinary property reads", async () => {
  let propertyReads = 0;
  const proxiedRecord = new Proxy(record(), {
    get() {
      propertyReads += 1;
      throw new Error("record proxy get trap must not run");
    },
  });

  const results = await runSourceConnectorConformance([{
    name: "descriptor-safe record connector",
    collect: () => [proxiedRecord],
  }]);

  assert.equal(propertyReads, 0);
  assert.equal(results[0].status, "passed");
});

test("rejects record accessors without invoking them", async () => {
  let accessorInvocations = 0;
  const hostileRecord = {
    ...record(),
  } as Record<string, unknown>;
  Object.defineProperty(hostileRecord, "content", {
    enumerable: true,
    get() {
      accessorInvocations += 1;
      return { summary: "must not be read" };
    },
  });

  const results = await runSourceConnectorConformance([{
    name: "hostile record connector",
    collect: () => [hostileRecord as unknown as SourceRecord],
  }]);

  assert.equal(accessorInvocations, 0);
  assert.deepEqual(results[0].diagnostics, [{
    code: "invalid_source_record",
    message: "Connector returned an invalid SourceRecord.",
    itemIndex: 0,
  }]);
});

test("returns detached results that cannot be changed through connector-owned arrays", async () => {
  const connectorRecords = [record()];
  const results = await runSourceConnectorConformance([{
    name: "detached connector",
    collect: () => connectorRecords,
  }]);

  connectorRecords.length = 0;

  assert.deepEqual(results, [{
    name: "detached connector",
    status: "passed",
    diagnostics: [],
  }]);
  assert.equal(isDeepFrozen(results), true);
});
