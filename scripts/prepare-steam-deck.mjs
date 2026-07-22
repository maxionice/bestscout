#!/usr/bin/env node

import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");
const defaultBundleRoot = resolve(root, "target/release/bundle/appimage");
const defaultOutputRoot = resolve(root, "release-artifacts");
const templateRoot = resolve(root, "packaging/steam-deck");
const appImageMagic = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

export function findSingleAppImage(bundleRoot) {
  const matches = readdirSync(bundleRoot)
    .filter((name) => name.endsWith(".AppImage"))
    .map((name) => resolve(bundleRoot, name));
  if (matches.length !== 1) {
    throw new Error(`expected exactly one AppImage for Steam Deck, found ${matches.length}`);
  }
  const metadata = lstatSync(matches[0]);
  const bytes = readFileSync(matches[0]);
  if (!metadata.isFile() || metadata.isSymbolicLink() || bytes.length < 100_000) {
    throw new Error("Steam Deck AppImage must be a bounded regular file");
  }
  if (!bytes.subarray(0, appImageMagic.length).equals(appImageMagic)) {
    throw new Error("Steam Deck AppImage has no ELF signature");
  }
  return matches[0];
}

export function renderTemplate(template, replacements) {
  let rendered = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`@${placeholder}@`, value);
  }
  if (/@[A-Z_]+@/.test(rendered)) {
    throw new Error("Steam Deck template contains an unresolved placeholder");
  }
  return rendered;
}

export function steamDeckNames(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`invalid Steam Deck package version: ${version}`);
  }
  const prefix = `BestScout_${version}_SteamDeck_x86_64`;
  return {
    appImage: `${prefix}.AppImage`,
    launcher: `${prefix}.sh`,
    englishReadme: `${prefix}.en.md`,
    germanReadme: `${prefix}.de.md`,
  };
}

export function prepareSteamDeck({
  version,
  bundleRoot = defaultBundleRoot,
  outputRoot = defaultOutputRoot,
  templates = templateRoot,
}) {
  const source = findSingleAppImage(bundleRoot);
  const names = steamDeckNames(version);
  mkdirSync(outputRoot, { recursive: true });
  const appImagePath = resolve(outputRoot, names.appImage);
  const launcherPath = resolve(outputRoot, names.launcher);
  copyFileSync(source, appImagePath);
  chmodSync(appImagePath, 0o755);

  const replacements = {
    VERSION: version,
    APPIMAGE: names.appImage,
    LAUNCHER: names.launcher,
  };
  const launcher = renderTemplate(
    readFileSync(resolve(templates, "launch-bestscout.sh"), "utf8"),
    replacements,
  );
  writeFileSync(launcherPath, launcher, { mode: 0o755 });
  chmodSync(launcherPath, 0o755);
  for (const [template, output] of [
    ["README-DECK.en.md", names.englishReadme],
    ["README-DECK.de.md", names.germanReadme],
  ]) {
    writeFileSync(
      resolve(outputRoot, output),
      renderTemplate(readFileSync(resolve(templates, template), "utf8"), replacements),
      { mode: 0o644 },
    );
  }
  return {
    source: basename(source),
    files: Object.values(names),
  };
}

function main() {
  const tauri = JSON.parse(
    readFileSync(resolve(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
  );
  const result = prepareSteamDeck({ version: tauri.version });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main();
}
