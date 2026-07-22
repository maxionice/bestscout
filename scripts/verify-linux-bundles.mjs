#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { steamDeckNames } from "./prepare-steam-deck.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values: options } = parseArgs({
  options: {
    "bundle-root": { type: "string" },
    "native-only": { type: "boolean", default: false },
    "output-root": { type: "string" },
    "require-release-set": { type: "boolean", default: false },
    version: { type: "string" },
    "write-checksums": { type: "boolean", default: false },
  },
  strict: true,
});
const bundleRoot = resolve(options["bundle-root"] ?? resolve(root, "target/release/bundle"));
const outputRoot = resolve(options["output-root"] ?? resolve(root, "release-artifacts"));
const writeChecksums = options["write-checksums"];
const requireReleaseSet = options["require-release-set"];
const nativeOnly = options["native-only"];
if (nativeOnly && requireReleaseSet) {
  throw new Error("--native-only cannot be combined with --require-release-set");
}
const version = options.version ?? JSON.parse(
  readFileSync(resolve(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
).version;
const expected = new Map([
  [".AppImage", Buffer.from([0x7f, 0x45, 0x4c, 0x46])],
  [".deb", Buffer.from("!<arch>\n")],
  [".rpm", Buffer.from([0xed, 0xab, 0xee, 0xdb])],
]);

function walk(path) {
  const files = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...walk(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

const files = walk(bundleRoot).filter((path) => expected.has(extname(path)));
for (const [extension, magic] of expected) {
  const matches = files.filter((path) => extname(path) === extension);
  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${extension} bundle, found ${matches.length}`);
  }
  const metadata = lstatSync(matches[0]);
  const bytes = readFileSync(matches[0]);
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || bytes.length < 100_000
    || !bytes.subarray(0, magic.length).equals(magic)
  ) {
    throw new Error(`${basename(matches[0])} has an invalid signature or size`);
  }
}

const flatpaks = nativeOnly ? [] : (() => {
  try {
    return readdirSync(outputRoot)
      .filter((name) => name.endsWith(".flatpak"))
      .map((name) => resolve(outputRoot, name));
  } catch {
    return [];
  }
})();
for (const path of flatpaks) {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 100_000) {
    throw new Error(`${basename(path)} is not a bounded regular Flatpak bundle`);
  }
}
if (requireReleaseSet && flatpaks.length !== 1) {
  throw new Error(`expected exactly one Flatpak release bundle, found ${flatpaks.length}`);
}

const deckNames = Object.values(steamDeckNames(version));
const deckFiles = nativeOnly ? [] : deckNames
  .map((name) => resolve(outputRoot, name))
  .filter((path) => {
    try {
      return lstatSync(path).isFile();
    } catch {
      return false;
    }
  });
if ((deckFiles.length > 0 || requireReleaseSet) && deckFiles.length !== deckNames.length) {
  throw new Error(`Steam Deck release set is incomplete: found ${deckFiles.length} of ${deckNames.length}`);
}
if (deckFiles.length === deckNames.length) {
  const deckAppImage = readFileSync(resolve(outputRoot, deckNames[0]));
  const nativeAppImagePath = files.find((path) => extname(path) === ".AppImage");
  const nativeAppImage = readFileSync(nativeAppImagePath);
  if (
    deckAppImage.length < 100_000
    || !deckAppImage.subarray(0, expected.get(".AppImage").length).equals(expected.get(".AppImage"))
  ) {
    throw new Error("Steam Deck AppImage has an invalid signature or size");
  }
  if (!deckAppImage.equals(nativeAppImage)) {
    throw new Error("Steam Deck AppImage does not match the current native AppImage");
  }
  const launcher = readFileSync(resolve(outputRoot, deckNames[1]), "utf8");
  if (!launcher.startsWith("#!/usr/bin/env bash\n") || /@[A-Z_]+@/.test(launcher)) {
    throw new Error("Steam Deck launcher is invalid or contains placeholders");
  }
  for (const readme of deckNames.slice(2)) {
    const contents = readFileSync(resolve(outputRoot, readme), "utf8");
    if (!contents.includes(deckNames[0]) || !contents.includes(deckNames[1])) {
      throw new Error(`${readme} does not reference the exact Steam Deck artifacts`);
    }
  }
}

const releaseFiles = [...files, ...flatpaks, ...deckFiles].sort((left, right) =>
  basename(left).localeCompare(basename(right), "en"),
);
const names = releaseFiles.map((path) => basename(path));
if (new Set(names).size !== names.length) {
  throw new Error("release artifacts contain duplicate filenames");
}
const report = releaseFiles.map((path) => ({
  name: basename(path),
  bytes: lstatSync(path).size,
  sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
}));

if (writeChecksums) {
  mkdirSync(outputRoot, { recursive: true });
  for (const path of files) copyFileSync(path, resolve(outputRoot, basename(path)));
  writeFileSync(
    resolve(outputRoot, "SHA256SUMS"),
    `${report.map(({ name, sha256 }) => `${sha256}  ${name}`).join("\n")}\n`,
  );
}

process.stdout.write(`${JSON.stringify({ bundles: report }, null, 2)}\n`);
