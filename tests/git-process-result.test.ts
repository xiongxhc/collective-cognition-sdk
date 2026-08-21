import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyGitProcessResult,
  validGitObjectByteLength,
} from "../src/connectors/git-process-result.ts";

test("classifies Git process results without platform process mechanics", () => {
  const successOutput = Buffer.from("commit\n", "ascii");
  const cases = [
    {
      expected: { kind: "target_unavailable" },
      label: "missing executable",
      result: {
        error: { code: "ENOENT" },
        signal: null,
        status: null,
        stdout: null,
      },
    },
    {
      expected: { kind: "read_failed" },
      label: "timeout",
      result: {
        error: { code: "ETIMEDOUT" },
        signal: null,
        status: null,
        stdout: Buffer.alloc(0),
      },
    },
    {
      expected: { kind: "read_failed" },
      label: "output overflow",
      result: {
        error: { code: "ENOBUFS" },
        signal: null,
        status: null,
        stdout: Buffer.alloc(0),
      },
    },
    {
      expected: { kind: "read_failed" },
      label: "signal",
      result: {
        signal: "SIGKILL",
        status: null,
        stdout: Buffer.alloc(0),
      },
    },
    {
      expected: { kind: "command_failed" },
      label: "nonzero exit",
      result: {
        signal: null,
        status: 1,
        stdout: Buffer.alloc(0),
      },
    },
    {
      expected: { kind: "read_failed" },
      label: "invalid stdout",
      result: {
        signal: null,
        status: 0,
        stdout: "not-a-buffer",
      },
    },
    {
      expected: { kind: "success", stdout: successOutput },
      label: "success",
      result: {
        signal: null,
        status: 0,
        stdout: successOutput,
      },
    },
  ] as const;

  for (const processCase of cases) {
    assert.deepEqual(
      classifyGitProcessResult(processCase.result),
      processCase.expected,
      processCase.label,
    );
  }
});

test("checks declared Git object sizes at exact platform-independent bounds", () => {
  assert.equal(validGitObjectByteLength("0", 1024 * 1024), true);
  assert.equal(validGitObjectByteLength("1048576", 1024 * 1024), true);
  assert.equal(validGitObjectByteLength("1048577", 1024 * 1024), false);
  assert.equal(validGitObjectByteLength("9007199254740992", 1024 * 1024), false);
  assert.equal(validGitObjectByteLength("-1", 1024 * 1024), false);
  assert.equal(validGitObjectByteLength("not-a-size", 1024 * 1024), false);
});
