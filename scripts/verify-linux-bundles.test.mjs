import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { prepareSteamDeck } from "./prepare-steam-deck.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verifier = resolve(root, "scripts/verify-linux-bundles.mjs");
const templates = resolve(root, "packaging/steam-deck");

function boundedFile(magic) {
  return Buffer.concat([magic, Buffer.alloc(100_000)]);
}

function prepareNativeBundles(fixtureRoot) {
  const bundleRoot = resolve(fixtureRoot, "bundle");
  const outputRoot = resolve(fixtureRoot, "release");
  for (const directory of ["appimage", "deb", "rpm"]) {
    mkdirSync(resolve(bundleRoot, directory), { recursive: true });
  }
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(
    resolve(bundleRoot, "appimage/BestScout.AppImage"),
    boundedFile(Buffer.from([0x7f, 0x45, 0x4c, 0x46])),
    { mode: 0o755 },
  );
  writeFileSync(
    resolve(bundleRoot, "deb/BestScout.deb"),
    boundedFile(Buffer.from("!<arch>\n")),
  );
  writeFileSync(
    resolve(bundleRoot, "rpm/BestScout.rpm"),
    boundedFile(Buffer.from([0xed, 0xab, 0xee, 0xdb])),
  );
  return { bundleRoot, outputRoot };
}

test("verifies and checksums the complete release set", () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "bestscout-release-set-"));
  try {
    const { bundleRoot, outputRoot } = prepareNativeBundles(fixtureRoot);
    writeFileSync(resolve(outputRoot, "BestScout_1.0.0_x86_64.flatpak"), Buffer.alloc(100_001));
    prepareSteamDeck({
      version: "1.0.0",
      bundleRoot: resolve(bundleRoot, "appimage"),
      outputRoot,
      templates,
    });

    const output = execFileSync(
      process.execPath,
      [
        verifier,
        "--bundle-root", bundleRoot,
        "--output-root", outputRoot,
        "--version", "1.0.0",
        "--write-checksums",
        "--require-release-set",
      ],
      { encoding: "utf8" },
    );
    const report = JSON.parse(output);
    assert.equal(report.bundles.length, 8);
    const checksums = readFileSync(resolve(outputRoot, "SHA256SUMS"), "utf8")
      .trim()
      .split("\n");
    assert.equal(checksums.length, 8);
    assert.ok(checksums.every((line) => /^[a-f0-9]{64}  [^/]+$/.test(line)));
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("native-only checksums exclude pre-existing optional artifacts", () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "bestscout-native-only-"));
  try {
    const { bundleRoot, outputRoot } = prepareNativeBundles(fixtureRoot);
    writeFileSync(resolve(outputRoot, "BestScout_1.0.0_x86_64.flatpak"), Buffer.alloc(100_001));
    prepareSteamDeck({
      version: "1.0.0",
      bundleRoot: resolve(bundleRoot, "appimage"),
      outputRoot,
      templates,
    });

    const output = execFileSync(
      process.execPath,
      [
        verifier,
        "--bundle-root", bundleRoot,
        "--output-root", outputRoot,
        "--version", "1.0.0",
        "--write-checksums",
        "--native-only",
      ],
      { encoding: "utf8" },
    );
    const report = JSON.parse(output);
    const names = report.bundles.map(({ name }) => name);
    assert.deepEqual(names, ["BestScout.AppImage", "BestScout.deb", "BestScout.rpm"]);
    const checksums = readFileSync(resolve(outputRoot, "SHA256SUMS"), "utf8")
      .trim()
      .split("\n");
    assert.equal(checksums.length, 3);
    assert.ok(checksums.every((line) => !/flatpak|SteamDeck/.test(line)));
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("native-only rejects the complete release-set gate", () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "bestscout-native-conflict-"));
  try {
    const { bundleRoot, outputRoot } = prepareNativeBundles(fixtureRoot);
    assert.throws(
      () => execFileSync(
        process.execPath,
        [
          verifier,
          "--bundle-root", bundleRoot,
          "--output-root", outputRoot,
          "--native-only",
          "--require-release-set",
        ],
        { encoding: "utf8", stdio: "pipe" },
      ),
      /--native-only cannot be combined with --require-release-set/,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
