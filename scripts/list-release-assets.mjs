#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");
const safeName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function requireRegularFile(path, description) {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${description} must be a regular non-symlink file`);
  }
}

export function listReleaseAssets({
  artifactRoot,
  provenance,
  expectedSubjects,
}) {
  const root = resolve(artifactRoot);
  const checksumPath = resolve(root, "SHA256SUMS");
  requireRegularFile(checksumPath, "checksum manifest");
  const lines = readFileSync(checksumPath, "utf8").trim().split("\n");
  if (lines.length === 1 && lines[0] === "") {
    throw new Error("checksum manifest must contain at least one release subject");
  }
  if (expectedSubjects !== undefined && lines.length !== expectedSubjects) {
    throw new Error(`expected ${expectedSubjects} checksummed release subjects, found ${lines.length}`);
  }

  const names = new Set();
  const subjects = lines.map((line) => {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
    if (!match) throw new Error(`invalid checksum manifest entry: ${line}`);
    const [, expectedHash, name] = match;
    if (!safeName.test(name) || name === "SHA256SUMS" || names.has(name)) {
      throw new Error(`unsafe or duplicate release subject: ${name}`);
    }
    names.add(name);
    const path = resolve(root, name);
    if (dirname(path) !== root) throw new Error(`release subject escapes artifact root: ${name}`);
    requireRegularFile(path, `release subject ${name}`);
    const actualHash = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (actualHash !== expectedHash) throw new Error(`release subject hash mismatch: ${name}`);
    return path;
  });

  const provenancePath = resolve(provenance);
  if (dirname(provenancePath) !== root || !safeName.test(basename(provenancePath))) {
    throw new Error("provenance bundle must be a safe top-level artifact filename");
  }
  if (!basename(provenancePath).endsWith("_provenance.sigstore.json")) {
    throw new Error("provenance bundle has an unexpected filename");
  }
  if (names.has(basename(provenancePath))) {
    throw new Error("provenance bundle must not be a checksummed release subject");
  }
  requireRegularFile(provenancePath, "provenance bundle");
  const bundle = JSON.parse(readFileSync(provenancePath, "utf8"));
  if (bundle === null || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw new Error("provenance bundle must contain a JSON object");
  }

  return [...subjects, checksumPath, provenancePath];
}

function main() {
  const { values } = parseArgs({
    options: {
      "artifact-root": { type: "string", default: resolve(repositoryRoot, "release-artifacts") },
      provenance: { type: "string" },
      "expected-subjects": { type: "string" },
    },
    strict: true,
  });
  if (!values.provenance) throw new Error("--provenance is required");
  const expectedSubjects = values["expected-subjects"] === undefined
    ? undefined
    : Number(values["expected-subjects"]);
  if (expectedSubjects !== undefined && (!Number.isSafeInteger(expectedSubjects) || expectedSubjects < 1)) {
    throw new Error("--expected-subjects must be a positive integer");
  }
  const assets = listReleaseAssets({
    artifactRoot: values["artifact-root"],
    provenance: values.provenance,
    expectedSubjects,
  });
  process.stdout.write(`${assets.join("\n")}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
