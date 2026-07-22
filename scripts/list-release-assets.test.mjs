import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import test from "node:test";

import { listReleaseAssets } from "./list-release-assets.mjs";

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("lists only checksummed subjects, their manifest and the provenance bundle", () => {
  const root = mkdtempSync(resolve(tmpdir(), "bestscout-release-assets-"));
  try {
    const first = resolve(root, "BestScout_1.0.0_amd64.AppImage");
    const second = resolve(root, "BestScout_1.0.0_amd64.deb");
    const provenance = resolve(root, "BestScout_1.0.0_provenance.sigstore.json");
    writeFileSync(first, "appimage");
    writeFileSync(second, "deb");
    writeFileSync(provenance, '{"mediaType":"application/vnd.dev.sigstore.bundle.v0.3+json"}');
    writeFileSync(resolve(root, "unexpected.txt"), "must not be uploaded");
    writeFileSync(
      resolve(root, "SHA256SUMS"),
      `${hash(first)}  ${basename(first)}\n${hash(second)}  ${basename(second)}\n`,
    );

    assert.deepEqual(listReleaseAssets({
      artifactRoot: root,
      provenance,
      expectedSubjects: 2,
    }), [first, second, resolve(root, "SHA256SUMS"), provenance]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects tampered, unsafe and incomplete release manifests", () => {
  const root = mkdtempSync(resolve(tmpdir(), "bestscout-release-assets-invalid-"));
  try {
    const subject = resolve(root, "BestScout_1.0.0_amd64.deb");
    const provenance = resolve(root, "BestScout_1.0.0_provenance.sigstore.json");
    writeFileSync(subject, "deb");
    writeFileSync(provenance, "{}");
    writeFileSync(resolve(root, "SHA256SUMS"), `${"0".repeat(64)}  ${basename(subject)}\n`);
    assert.throws(
      () => listReleaseAssets({ artifactRoot: root, provenance, expectedSubjects: 1 }),
      /hash mismatch/,
    );

    writeFileSync(resolve(root, "SHA256SUMS"), `${hash(subject)}  ../escape\n`);
    assert.throws(
      () => listReleaseAssets({ artifactRoot: root, provenance, expectedSubjects: 1 }),
      /invalid checksum manifest entry/,
    );

    writeFileSync(resolve(root, "SHA256SUMS"), `${hash(subject)}  ${basename(subject)}\n`);
    assert.throws(
      () => listReleaseAssets({ artifactRoot: root, provenance, expectedSubjects: 2 }),
      /expected 2 checksummed release subjects/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
