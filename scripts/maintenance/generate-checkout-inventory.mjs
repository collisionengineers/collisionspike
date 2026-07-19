#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, readlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Bytes, sha256File } from "../checks/content-hash.mjs";
import { normalizeRepositoryPath } from "../checks/repository-files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUTPUT = ".artifacts/audit/repository-checkout-inventory.json";

function topLevel(repositoryPath) {
  return repositoryPath === "." ? "." : repositoryPath.split("/")[0];
}

function classification(repositoryPath, kind) {
  if (repositoryPath === "." || kind === "directory") return "structure";
  if (repositoryPath.startsWith(".git/")) return "repository-internal";
  if (repositoryPath.includes("/node_modules/") || repositoryPath.startsWith("node_modules/")) return "dependency";
  if (/(^|\/)(?:dist|coverage|\.artifacts|\.pytest_cache|__pycache__)(\/|$)/.test(repositoryPath)) return "generated";
  if (repositoryPath.startsWith("workingspace/")) return "user-working-file";
  if (repositoryPath.startsWith("tests/fixtures/evidence/")) return "source-evidence";
  return "repository-content";
}

function owner(repositoryPath) {
  const root = topLevel(repositoryPath);
  if (root === ".git") return "git";
  if (root === "node_modules") return "dependency-manager";
  if (root === "workingspace") return "user";
  if (["apps", "services", "packages"].includes(root)) return "runtime";
  if (["docs", "contracts"].includes(root)) return "documentation";
  if (["scripts", "tools", ".github"].includes(root)) return "engineering-automation";
  return "repository";
}

async function walk() {
  const entries = [{ path: ".", absolutePath: ROOT, kind: "directory" }];
  async function visit(directory, relativeDirectory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const child of children) {
      const relativePath = normalizeRepositoryPath(path.posix.join(relativeDirectory, child.name));
      const absolutePath = path.join(directory, child.name);
      const kind = child.isDirectory() ? "directory" : child.isSymbolicLink() ? "symlink" : "file";
      entries.push({ path: relativePath, absolutePath, kind });
      if (child.isDirectory()) await visit(absolutePath, relativePath);
    }
  }
  await visit(ROOT, "");
  return entries;
}

function trackedPaths() {
  return new Set(execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0").filter(Boolean).map(normalizeRepositoryPath));
}

function ignoredPaths(paths) {
  const input = `${paths.filter((value) => value !== ".").join("\0")}\0`;
  const result = spawnSync("git", ["check-ignore", "-z", "--stdin"], {
    cwd: ROOT,
    input,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (![0, 1].includes(result.status)) throw new Error(result.stderr || "git check-ignore failed");
  return new Set((result.stdout ?? "").split("\0").filter(Boolean).map(normalizeRepositoryPath));
}

async function enrich(item, tracked, ignored, outputPath) {
  const stat = await lstat(item.absolutePath);
  let size = item.kind === "directory" ? 0 : stat.size;
  let sha256 = null;
  let hashPolicy = item.kind === "directory" ? "not-applicable" : "sha256";
  if (item.path === outputPath) {
    hashPolicy = "null-self-hash";
  } else if (item.path.startsWith(".git/")) {
    hashPolicy = item.path.startsWith(".git/objects/") ? "excluded-object-database" : "excluded-mutable-repository-metadata";
  } else if (item.kind === "symlink") {
    const target = await readlink(item.absolutePath, "utf8");
    const bytes = Buffer.from(target, "utf8");
    size = bytes.length;
    sha256 = sha256Bytes(bytes);
  } else if (item.kind === "file") {
    sha256 = await sha256File(item.absolutePath);
  }
  return {
    path: item.path,
    kind: item.kind,
    tracked: tracked.has(item.path),
    ignored: ignored.has(item.path) || item.path === ".git" || item.path.startsWith(".git/"),
    size,
    sha256,
    hashPolicy,
    topLevelOwner: owner(item.path),
    purpose: classification(item.path, item.kind),
    sourceAuthority: item.path.startsWith("workingspace/") ? "non-authoritative-user-work" : item.path.startsWith("tests/fixtures/evidence/") ? "hash-preserved-evidence" : "repository-or-checkout-material",
  };
}

function documentFor(entries, outputPath) {
  const files = entries.filter((entry) => entry.kind !== "directory");
  return {
    schemaVersion: 1,
    scope: "Complete physical checkout including tracked, untracked, ignored, dependency, generated, empty-directory, symlink and repository-internal paths",
    output: outputPath,
    counts: {
      entries: entries.length,
      directories: entries.length - files.length,
      files: files.filter((entry) => entry.kind === "file").length,
      symlinks: files.filter((entry) => entry.kind === "symlink").length,
      tracked: entries.filter((entry) => entry.tracked).length,
      ignored: entries.filter((entry) => entry.ignored).length,
    },
    totalBytes: files.reduce((sum, entry) => sum + entry.size, 0),
    entries,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const outputPath = normalizeRepositoryPath(outputIndex >= 0 ? args[outputIndex + 1] : DEFAULT_OUTPUT);
  if (outputIndex >= 0 && !args[outputIndex + 1]) throw new Error("--output requires a path");
  const ephemeral = args.includes("--ephemeral") || !process.env.CI;
  const outputAbsolute = path.join(ROOT, ...outputPath.split("/"));
  await mkdir(path.dirname(outputAbsolute), { recursive: true });
  await unlink(outputAbsolute).catch((error) => { if (error.code !== "ENOENT") throw error; });

  const physical = await walk();
  physical.push({ path: outputPath, absolutePath: outputAbsolute, kind: "file" });
  physical.sort((left, right) => left.path.localeCompare(right.path, "en"));
  const tracked = trackedPaths();
  const ignored = ignoredPaths(physical.map((entry) => entry.path));
  const entries = [];
  const self = physical.find((entry) => entry.path === outputPath);
  self.absolutePath = outputAbsolute;
  for (let index = 0; index < physical.length; index += 16) {
    const batch = physical.slice(index, index + 16).filter((entry) => entry.path !== outputPath);
    entries.push(...await Promise.all(batch.map((entry) => enrich(entry, tracked, ignored, outputPath))));
  }
  entries.push({
    path: outputPath,
    kind: "file",
    tracked: false,
    ignored: true,
    size: 0,
    sha256: null,
    hashPolicy: "null-self-hash",
    topLevelOwner: "engineering-automation",
    purpose: "generated",
    sourceAuthority: "repository-or-checkout-material",
  });
  entries.sort((left, right) => left.path.localeCompare(right.path, "en"));

  let serialized = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const selfEntry = entries.find((entry) => entry.path === outputPath);
    selfEntry.size = Buffer.byteLength(serialized, "utf8");
    const next = `${JSON.stringify(documentFor(entries, outputPath), null, 2)}\n`;
    if (Buffer.byteLength(next, "utf8") === selfEntry.size) {
      serialized = next;
      break;
    }
    serialized = next;
  }
  await writeFile(outputAbsolute, serialized, "utf8");
  const document = JSON.parse(await readFile(outputAbsolute, "utf8"));
  console.log(
    `Checkout inventory passed: ${document.counts.entries} entries, ${document.counts.files} files, `
      + `${document.counts.directories} directories, ${document.counts.ignored} ignored.`,
  );
  if (ephemeral) await unlink(outputAbsolute);
}

await main();
