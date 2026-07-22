import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  findOpenReleaseGates,
  uncheckedMarkdownTasks,
  validateProductionTag,
  verifyReleaseReadiness,
} from "./verify-release-readiness.mjs";

test("accepts stable production tags from 1.0.0 onward", () => {
  assert.deepEqual(validateProductionTag("v1.0.0"), { major: 1, minor: 0, patch: 0 });
  assert.deepEqual(validateProductionTag("v12.34.56"), { major: 12, minor: 34, patch: 56 });
  for (const tag of ["v0.9.9", "1.0.0", "v1.0", "v1.0.0-rc.1", "v01.0.0"]) {
    assert.throws(() => validateProductionTag(tag), /production/);
  }
});

test("finds unchecked tasks but ignores checked tasks and fenced examples", () => {
  const gates = uncheckedMarkdownTasks(
    "- [x] complete\n- [ ] real gate\n```text\n- [ ] example\n```\n  - [ ] nested gate\n",
    "docs/gates.md",
  );
  assert.deepEqual(gates, [
    { path: "docs/gates.md", line: 2, description: "real gate" },
    { path: "docs/gates.md", line: 6, description: "nested gate" },
  ]);
});

test("requires every roadmap, parity and acceptance gate for production", () => {
  const root = mkdtempSync(resolve(tmpdir(), "bestscout-release-readiness-"));
  try {
    mkdirSync(resolve(root, "docs/acceptance"), { recursive: true });
    writeFileSync(resolve(root, "docs/roadmap.md"), "- [x] roadmap complete\n");
    writeFileSync(resolve(root, "docs/feature-parity.md"), "- [x] parity complete\n");
    writeFileSync(resolve(root, "docs/acceptance/live.md"), "- [ ] real FM acceptance\n");

    assert.deepEqual(findOpenReleaseGates(root), [{
      path: "docs/acceptance/live.md",
      line: 1,
      description: "real FM acceptance",
    }]);
    assert.throws(
      () => verifyReleaseReadiness({ root, tag: "v1.0.0", requireComplete: true }),
      /blocked by 1 open gate/,
    );

    writeFileSync(resolve(root, "docs/acceptance/live.md"), "- [x] real FM acceptance\n");
    assert.equal(
      verifyReleaseReadiness({ root, tag: "v1.0.0", requireComplete: true }).ready,
      true,
    );

    const linkedGate = resolve(root, "docs/acceptance/linked.md");
    symlinkSync(resolve(root, "docs/roadmap.md"), linkedGate);
    assert.throws(() => findOpenReleaseGates(root), /regular non-symlink file/);
    unlinkSync(linkedGate);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
