import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { prepareSteamDeck, renderTemplate, steamDeckNames } from "./prepare-steam-deck.mjs";

const temporary = () => mkdtempSync(resolve(tmpdir(), "bestscout-deck-"));

test("prepares a bounded Steam Deck edition with bilingual instructions", () => {
  const root = temporary();
  try {
    const bundleRoot = resolve(root, "bundle");
    const outputRoot = resolve(root, "out");
    mkdirSync(bundleRoot);
    const appImage = Buffer.alloc(100_001);
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(appImage);
    writeFileSync(resolve(bundleRoot, "bestscout.AppImage"), appImage, { mode: 0o755 });
    const result = prepareSteamDeck({
      version: "1.0.0",
      bundleRoot,
      outputRoot,
      templates: resolve(import.meta.dirname, "../packaging/steam-deck"),
    });
    const names = steamDeckNames("1.0.0");
    assert.deepEqual(result.files, Object.values(names));
    assert.equal(readFileSync(resolve(outputRoot, names.appImage)).length, 100_001);
    assert.match(readFileSync(resolve(outputRoot, names.englishReadme), "utf8"), /Gaming Mode/);
    assert.match(readFileSync(resolve(outputRoot, names.germanReadme), "utf8"), /Gaming-Modus/);
    assert.doesNotMatch(readFileSync(resolve(outputRoot, names.launcher), "utf8"), /@[A-Z_]+@/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("launcher resolves paths with spaces, forwards arguments and enables the opt-in FUSE fallback", () => {
  const root = temporary();
  try {
    const directory = resolve(root, "Deck Package With Spaces");
    mkdirSync(directory);
    const appImageName = "BestScout Test.AppImage";
    const capture = resolve(root, "capture.txt");
    writeFileSync(
      resolve(directory, appImageName),
      `#!/usr/bin/env bash\nprintf '%s\\n' "$PWD" "$APPIMAGE_EXTRACT_AND_RUN" "$1" "$2" > "$CAPTURE"\n`,
      { mode: 0o755 },
    );
    chmodSync(resolve(directory, appImageName), 0o755);
    const template = readFileSync(
      resolve(import.meta.dirname, "../packaging/steam-deck/launch-bestscout.sh"),
      "utf8",
    );
    const launcher = resolve(directory, "launch.sh");
    writeFileSync(launcher, renderTemplate(template, { APPIMAGE: appImageName }), { mode: 0o755 });
    chmodSync(launcher, 0o755);
    const result = spawnSync(launcher, ["alpha beta", "--touch"], {
      env: {
        ...process.env,
        BESTSCOUT_APPIMAGE_EXTRACT_AND_RUN: "1",
        CAPTURE: capture,
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(capture, "utf8").trim().split("\n"), [
      process.cwd(),
      "1",
      "alpha beta",
      "--touch",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects unsafe versions and unresolved templates", () => {
  assert.throws(() => steamDeckNames("1.0.0/../../escape"), /invalid/);
  assert.throws(() => renderTemplate("@MISSING@", {}), /unresolved/);
});
