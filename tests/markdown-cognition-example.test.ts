import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("markdown cognition example runs without a pre-existing target", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      fileURLToPath(new URL("../examples/markdown-cognition.ts", import.meta.url)),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as {
    readonly verification: string;
    readonly secondRunUpdated: number;
    readonly roundTripEqual: boolean;
  };
  assert.equal(output.verification, "passed");
  assert.equal(output.secondRunUpdated, 0);
  assert.equal(output.roundTripEqual, true);
});
