import assert from "node:assert/strict";
import test from "node:test";

import {
  createSourceRecord,
  promoteSourceRecordsToEvidence,
} from "../src/index.ts";
import { teamMemoryActivityEvidencePolicyV1 } from "../src/adapters/team-memory-activity.ts";
import type { CreateSourceRecordInput, SourceRecord } from "../src/index.ts";

const firstCapturedAt = "2026-07-28T17:59:40.952+08:00";
const lastCapturedAt = "2026-07-28T20:17:51.910+08:00";

function recordFor(
  index: number,
  overrides: Partial<CreateSourceRecordInput> = {},
): SourceRecord {
  return createSourceRecord({
    id: `source-record:team-memory:${index}`,
    source: { system: "team-memory-agent" },
    sourceId: `gitlab:merge-request:${index}`,
    revisionId: `revision-${index}`,
    capturedAt: `2026-07-28T18:${String(index).padStart(2, "0")}:00.000+08:00`,
    mediaType: "application/vnd.team-memory.event+json",
    content: {
      project: "Unified Portal",
      kind: "mr",
      summary: "[merged] Activity record.",
    },
    actorId: index % 2 === 0 ? "person:alex" : "person:blair",
    ...overrides,
  });
}

function activityRecords(): SourceRecord[] {
  const statuses = [
    "merged",
    "merged",
    "merged",
    "merged",
    "merged",
    "merged",
    "merged",
    "merged",
    "merged",
    "opened",
    "opened",
    "closed",
  ];
  return statuses.map((status, index) =>
    recordFor(index + 1, {
      capturedAt: index === 0
        ? firstCapturedAt
        : index === statuses.length - 1
          ? lastCapturedAt
          : `2026-07-28T18:${String(index).padStart(2, "0")}:00.000+08:00`,
      content: {
        project: "Unified Portal",
        kind: "mr",
        summary: `[${status}] Activity record ${index + 1}.`,
      },
    }),
  );
}

function mixedActivityRecords(): SourceRecord[] {
  const activities = [
    {
      kind: "message",
      summary: "[approved] Message prefixes are not merge-request statuses.",
    },
    {
      kind: "commit",
      summary: "Commit 8f22e6d updated the delivery workflow.",
    },
    {
      kind: "mr",
      summary: "[merged] Activity record 3.",
    },
    {
      kind: "message",
      summary: "Delivery coordination continued.",
    },
    {
      kind: "mr",
      summary: "[opened] Activity record 5.",
    },
    {
      kind: "mr",
      summary: "[closed] Activity record 6.",
    },
  ];
  return activities.map((activity, index) =>
    recordFor(index + 1, {
      capturedAt: index === 0
        ? firstCapturedAt
        : index === activities.length - 1
          ? lastCapturedAt
          : `2026-07-28T18:${String(index).padStart(2, "0")}:00.000+08:00`,
      content: {
        project: "Unified Portal",
        ...activity,
      },
    }),
  );
}

function promotionRequest(records: readonly SourceRecord[]) {
  return {
    records,
    hypothesisId: "hypothesis:delivery-readiness",
    contextId: "organization:unified-portal",
    rationale: "The selected records describe project activity.",
    promotedAt: lastCapturedAt,
    attribution: {
      initiatorId: "human:owner",
      executorId: "agent:team-memory-example",
      accountableId: "human:owner",
    },
  };
}

test("maps explicit merge-request activity into deterministic neutral evidence", () => {
  const mapping = teamMemoryActivityEvidencePolicyV1.map(activityRecords());

  assert.equal(mapping.title, "Unified Portal activity (12 records)");
  assert.equal(
    mapping.statement,
    [
      "12 activity records from 2026-07-28T17:59:40.952+08:00 to 2026-07-28T20:17:51.910+08:00.",
      "Actors: 2. Activity: 12 merge requests.",
      "Merge-request status: 9 merged, 2 opened, 1 closed.",
      "Unresolved status signal: opened and closed changes are both present; source review is required.",
    ].join("\n"),
  );
  assert.equal(mapping.evidenceKind, "team-memory-activity");
  assert.equal(mapping.polarity, "neutral");
  assert.doesNotMatch(
    mapping.statement,
    /\b(ready|successful|supports|challenges|decision)\b/i,
  );
});

test("sorts activity records by captured timestamp and source-record ID", () => {
  const records = activityRecords();

  assert.deepEqual(
    teamMemoryActivityEvidencePolicyV1.map([...records].reverse()),
    teamMemoryActivityEvidencePolicyV1.map(records),
  );
});

test(
  "counts exact mixed activity kinds in stable order and parses only merge-request statuses",
  () => {
    const records = mixedActivityRecords();
    const expected = {
      title: "Unified Portal activity (6 records)",
      statement: [
        "6 activity records from 2026-07-28T17:59:40.952+08:00 to 2026-07-28T20:17:51.910+08:00.",
        "Actors: 2. Activity: 2 messages, 1 commit, 3 merge requests.",
        "Merge-request status: 1 merged, 1 opened, 1 closed.",
        "Unresolved status signal: opened and closed changes are both present; source review is required.",
      ].join("\n"),
      evidenceKind: "team-memory-activity",
      polarity: "neutral",
    };

    assert.deepEqual(
      teamMemoryActivityEvidencePolicyV1.map(records),
      expected,
    );
    assert.deepEqual(
      teamMemoryActivityEvidencePolicyV1.map([...records].reverse()),
      expected,
    );

    const evidence = promoteSourceRecordsToEvidence(
      promotionRequest(records),
      teamMemoryActivityEvidencePolicyV1,
    );
    assert.equal(evidence.data.polarity, "neutral");
    assert.equal(evidence.provenance.length, records.length);
    assert.deepEqual(
      evidence.provenance.map((entry) => entry.sourceId),
      records.map((record) => record.id),
    );
    const statement = evidence.data.statement;
    assert.ok(typeof statement === "string");
    assert.doesNotMatch(
      statement,
      /\b(ready|successful|supports|challenges|decision)\b/i,
    );
  },
);

test("names a mixed-project selection as a team-memory activity set", () => {
  const first = recordFor(1, { capturedAt: firstCapturedAt });
  const second = recordFor(2, {
    capturedAt: lastCapturedAt,
    content: {
      project: "BCM",
      kind: "commit",
      summary: "Commit 6ac1b0f updated the release.",
    },
  });

  assert.equal(
    teamMemoryActivityEvidencePolicyV1.map([first, second]).title,
    "Team-memory activity (2 records)",
  );
});

test("orders nanosecond timestamps before SourceRecord IDs", () => {
  const later = recordFor(1, {
    id: "source-record:team-memory:a",
    capturedAt: "2026-07-28T18:00:00.000000002Z",
  });
  const earlier = recordFor(2, {
    id: "source-record:team-memory:z",
    capturedAt: "2026-07-28T18:00:00.000000001Z",
  });

  const mapping = teamMemoryActivityEvidencePolicyV1.map([later, earlier]);

  assert.match(
    mapping.statement,
    /^2 activity records from 2026-07-28T18:00:00\.000000001Z to 2026-07-28T18:00:00\.000000002Z\./,
  );
});

test("leaves duplicate source-record revisions to the promotion layer", () => {
  const record = recordFor(1, {
    capturedAt: firstCapturedAt,
    content: {
      project: "Unified Portal",
      kind: "mr",
      summary: "[merged] Single activity.",
    },
  });

  const evidence = promoteSourceRecordsToEvidence(
    promotionRequest([record, structuredClone(record) as SourceRecord]),
    teamMemoryActivityEvidencePolicyV1,
  );

  assert.equal(evidence.title, "Unified Portal activity (1 record)");
  assert.equal(evidence.provenance.length, 1);
});

test("fails closed for non-team-memory records and malformed activities", () => {
  const incompatible = recordFor(1, { mediaType: "application/json" });
  const malformedContent = recordFor(2, { content: [] });
  const unknownKind = recordFor(3, {
    content: {
      project: "Unified Portal",
      kind: "journal-highlight",
      summary: "Journal highlights remain outside this policy.",
    },
  });
  const missingTimestamp = {
    ...recordFor(4),
    capturedAt: undefined,
  } as unknown as SourceRecord;

  for (const record of [
    incompatible,
    malformedContent,
    unknownKind,
    missingTimestamp,
  ]) {
    assert.throws(
      () => teamMemoryActivityEvidencePolicyV1.map([record]),
      /Team-memory activity/i,
    );
  }
});

test("rejects unsupported merge-request status prefixes", () => {
  const record = recordFor(1, {
    content: {
      project: "Unified Portal",
      kind: "mr",
      summary: "[approved] Approval is not an accepted source status.",
    },
  });

  assert.throws(
    () => teamMemoryActivityEvidencePolicyV1.map([record]),
    /explicit merge-request status/i,
  );
});

test("rejects inherited required activity fields", () => {
  const content = Object.assign(
    Object.create({ project: "Unified Portal" }) as Record<string, unknown>,
    {
      kind: "message",
      summary: "Inherited project metadata must not be trusted.",
    },
  );
  const record = {
    ...recordFor(1),
    content,
  } as SourceRecord;

  assert.throws(
    () => teamMemoryActivityEvidencePolicyV1.map([record]),
    /own enumerable data property/i,
  );
});

test("rejects required summary accessors without invoking them", () => {
  let accessorReads = 0;
  const content = {
    project: "Unified Portal",
    kind: "message",
  } as Record<string, unknown>;
  Object.defineProperty(content, "summary", {
    enumerable: true,
    get() {
      accessorReads += 1;
      return "Accessor-backed activity summary.";
    },
  });
  const record = {
    ...recordFor(1),
    content,
  } as SourceRecord;

  assert.throws(
    () => teamMemoryActivityEvidencePolicyV1.map([record]),
    /own enumerable data property/i,
  );
  assert.equal(accessorReads, 0);
});

test("counts explicit reopened merge requests without inferring another status", () => {
  const mapping = teamMemoryActivityEvidencePolicyV1.map([
    recordFor(1, {
      capturedAt: firstCapturedAt,
      content: {
        project: "Unified Portal",
        kind: "mr",
        summary: "[reopened] Activity resumed.",
      },
    }),
  ]);

  assert.equal(
    mapping.statement,
    [
      "1 activity record from 2026-07-28T17:59:40.952+08:00 to 2026-07-28T17:59:40.952+08:00.",
      "Actors: 1. Activity: 1 merge request.",
      "Merge-request status: 1 reopened.",
    ].join("\n"),
  );
});

test("ignores raw content without invoking its accessor", () => {
  const content = {
    project: "Unified Portal",
    kind: "mr",
    summary: "[merged] Activity record.",
  } as Record<string, unknown>;
  Object.defineProperty(content, "raw", {
    enumerable: true,
    get() {
      throw new Error("raw content must not be read");
    },
  });
  const record = {
    ...recordFor(1, { capturedAt: firstCapturedAt }),
    content,
  } as SourceRecord;

  assert.equal(
    teamMemoryActivityEvidencePolicyV1.map([record]).statement,
    [
      "1 activity record from 2026-07-28T17:59:40.952+08:00 to 2026-07-28T17:59:40.952+08:00.",
      "Actors: 1. Activity: 1 merge request.",
      "Merge-request status: 1 merged.",
    ].join("\n"),
  );
});
