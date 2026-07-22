import assert from "node:assert/strict";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const documentationRoot = resolve(root, "docs");
const expectedTopics = [
  "safety", "packages", "first-start", "scouting", "workspaces", "editing",
  "live", "facepacks", "data", "verification", "troubleshooting", "limitations",
];

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && extname(entry.name) === ".md" ? [path] : [];
  });
}

function withoutCodeFences(markdown) {
  return markdown.replaceAll(/```[\s\S]*?```/g, "");
}

test("German and English user guides cover the same required topics", () => {
  for (const name of ["user-guide.en.md", "user-guide.de.md"]) {
    const guide = readFileSync(resolve(documentationRoot, name), "utf8");
    const topics = [...guide.matchAll(/<!-- bestscout-topic:([a-z-]+) -->/g)]
      .map((match) => match[1]);
    assert.deepEqual(topics, expectedTopics, `${name} topic sequence differs`);
    assert.equal((guide.match(/^## \d+\./gm) ?? []).length, expectedTopics.length);
    assert.doesNotMatch(guide, /\b(?:TODO|TBD|PLACEHOLDER)\b/i);
  }
});

test("local Markdown links resolve to regular non-symlink files", () => {
  const files = [resolve(root, "README.md"), resolve(root, "SECURITY.md"), ...markdownFiles(documentationRoot)];
  for (const file of files) {
    const markdown = withoutCodeFences(readFileSync(file, "utf8"));
    for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const rawTarget = match[1].trim().replace(/^<|>$/g, "");
      if (!rawTarget || rawTarget.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) {
        continue;
      }
      const relativeTarget = decodeURIComponent(rawTarget.split("#", 1)[0]);
      const target = resolve(dirname(file), relativeTarget);
      assert.ok(target.startsWith(root), `${file} links outside the repository: ${rawTarget}`);
      const metadata = lstatSync(target);
      assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), `${file} has invalid link: ${rawTarget}`);
    }
  }
});
