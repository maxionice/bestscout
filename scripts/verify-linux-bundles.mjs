#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundleRoot = resolve(root, "target/release/bundle");
const outputRoot = resolve(root, "release-artifacts");
const writeChecksums = process.argv.includes("--write-checksums");
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
  const bytes = readFileSync(matches[0]);
  if (bytes.length < 100_000 || !bytes.subarray(0, magic.length).equals(magic)) {
    throw new Error(`${basename(matches[0])} has an invalid signature or size`);
  }
}

const flatpaks = (() => {
  try {
    return readdirSync(outputRoot)
      .filter((name) => name.endsWith(".flatpak"))
      .map((name) => resolve(outputRoot, name));
  } catch {
    return [];
  }
})();
const releaseFiles = [...files, ...flatpaks];
const report = releaseFiles.map((path) => ({
  name: basename(path),
  bytes: statSync(path).size,
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
