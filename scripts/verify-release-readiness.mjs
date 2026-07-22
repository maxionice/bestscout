#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function validateProductionTag(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag ?? "");
  if (!match) {
    throw new Error(`production tag must be stable semantic version vMAJOR.MINOR.PATCH: ${tag ?? "missing"}`);
  }
  if (Number(match[1]) < 1) {
    throw new Error(`production releases start at v1.0.0: ${tag}`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function regularMarkdown(path) {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`release gate document must be a regular non-symlink file: ${path}`);
  }
  return readFileSync(path, "utf8");
}

export function uncheckedMarkdownTasks(contents, path) {
  const gates = [];
  let fence = null;
  for (const [index, line] of contents.split("\n").entries()) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === marker ? null : fence ?? marker;
      continue;
    }
    if (fence !== null) continue;
    const task = /^\s*-\s+\[ \]\s+(.+?)\s*$/.exec(line);
    if (task) gates.push({ path, line: index + 1, description: task[1] });
  }
  return gates;
}

export function findOpenReleaseGates(root = repositoryRoot) {
  const acceptanceRoot = resolve(root, "docs/acceptance");
  const documents = [
    resolve(root, "docs/roadmap.md"),
    resolve(root, "docs/feature-parity.md"),
    ...readdirSync(acceptanceRoot, { withFileTypes: true })
      .filter((entry) => entry.name.endsWith(".md"))
      .map((entry) => resolve(acceptanceRoot, entry.name)),
  ].sort();

  return documents.flatMap((document) => {
    const path = relative(root, document);
    return uncheckedMarkdownTasks(regularMarkdown(document), path);
  });
}

export function verifyReleaseReadiness({ root = repositoryRoot, tag, requireComplete = false } = {}) {
  const version = tag ? validateProductionTag(tag) : null;
  if (requireComplete && !tag) {
    throw new Error("--require-complete requires an explicit production --tag");
  }
  const openGates = findOpenReleaseGates(root);
  const report = {
    tag: tag ?? null,
    version,
    open_gate_count: openGates.length,
    ready: openGates.length === 0,
    open_gates: openGates,
  };
  if (requireComplete && openGates.length > 0) {
    const details = openGates
      .map((gate) => `${gate.path}:${gate.line}: ${gate.description}`)
      .join("\n");
    throw new Error(`production release is blocked by ${openGates.length} open gate(s):\n${details}`);
  }
  return report;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        root: { type: "string" },
        tag: { type: "string" },
        "require-complete": { type: "boolean", default: false },
      },
      strict: true,
    });
    const report = verifyReleaseReadiness({
      root: values.root ? resolve(values.root) : repositoryRoot,
      tag: values.tag,
      requireComplete: values["require-complete"],
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
