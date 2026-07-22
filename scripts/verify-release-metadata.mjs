#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const json = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const text = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const rootPackage = json("package.json");
const desktopPackage = json("apps/desktop/package.json");
const tauri = json("apps/desktop/src-tauri/tauri.conf.json");
const workspaceCargo = text("Cargo.toml");
const rustToolchain = text("rust-toolchain.toml");
const flatpakManifest = text("packaging/flatpak/io.github.maxionice.bestscout.yml");
const flatpakMetadata = text("packaging/flatpak/io.github.maxionice.bestscout.metainfo.xml");
const desktopEntry = text("packaging/flatpak/io.github.maxionice.bestscout.desktop");
const workspaceVersion = workspaceCargo.match(/\[workspace\.package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1];
const versions = new Set([
  rootPackage.version,
  desktopPackage.version,
  tauri.version,
  workspaceVersion,
]);

if (versions.size !== 1 || versions.has(undefined)) {
  fail(`release versions differ: ${[...versions].join(", ")}`);
}
if (tauri.identifier !== "io.github.maxionice.bestscout") {
  fail(`unexpected application identifier: ${tauri.identifier}`);
}
if (!tauri.bundle?.active) fail("Tauri bundling is disabled");
const targets = new Set(tauri.bundle.targets ?? []);
for (const target of ["appimage", "deb", "rpm"]) {
  if (!targets.has(target)) fail(`missing Linux bundle target: ${target}`);
}
if (!tauri.app?.security?.csp) fail("release CSP is not configured");
if (tauri.app?.windows?.[0]?.decorations !== false) {
  fail("the custom title bar requires native window decorations to stay disabled");
}
if (tauri.bundle?.license !== "GPL-3.0-or-later") {
  fail(`unexpected bundle license: ${tauri.bundle?.license}`);
}

const icon = readFileSync(resolve(root, "apps/desktop/src-tauri/icons/icon.png"));
if (icon.length < 1024 || icon.subarray(1, 4).toString("ascii") !== "PNG") {
  fail("release icon is missing or invalid");
}
if (!text("LICENSE").includes("GNU GENERAL PUBLIC LICENSE")) {
  fail("GPL license file is missing or invalid");
}
if (!rustToolchain.includes('channel = "1.97.1"')) {
  fail("the release Rust toolchain is not pinned to 1.97.1");
}
if (!flatpakManifest.includes("id: io.github.maxionice.bestscout")) {
  fail("the Flatpak manifest has an unexpected application identifier");
}
if (flatpakManifest.includes("--filesystem=host") || flatpakManifest.includes("--pid=host")) {
  fail("the offline Flatpak must not request unrestricted host or process access");
}
if (!flatpakMetadata.includes(`<release version="${[...versions][0]}"`)) {
  fail("the Flatpak release metadata version differs from the application version");
}
if (!desktopEntry.includes("Exec=bestscout") || !desktopEntry.includes("Terminal=false")) {
  fail("the Flatpak desktop entry is incomplete");
}

const version = [...versions][0];
const tag = process.argv.find((argument) => argument.startsWith("--tag="))?.slice(6);
if (tag && tag !== `v${version}`) {
  fail(`tag ${tag} does not match application version v${version}`);
}

process.stdout.write(`${JSON.stringify({ version, identifier: tauri.identifier, targets: [...targets] }, null, 2)}\n`);
