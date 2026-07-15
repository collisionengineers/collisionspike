#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceExtensions = new Set([".bicep", ".cjs", ".js", ".mjs", ".py", ".sql", ".ts", ".tsx"]);
const exemptPrefixes = [
  "services/functions/parser/cedocumentmapper_v2/",
  ".agents/skills/ui-ux-pro-max/",
];

const files = execFileSync("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"], {
  encoding: "buffer",
  maxBuffer: 64 * 1024 * 1024,
})
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .map((value) => value.replaceAll("\\", "/"))
  .filter((repositoryPath) => sourceExtensions.has(path.posix.extname(repositoryPath).toLowerCase()))
  .filter((repositoryPath) => !exemptPrefixes.some((prefix) => repositoryPath.startsWith(prefix)))
  .filter((repositoryPath) => fs.existsSync(path.join(root, ...repositoryPath.split("/"))));

const failures = [];
for (const repositoryPath of files) {
  const contents = fs.readFileSync(path.join(root, ...repositoryPath.split("/")), "utf8");
  const nonblank = contents.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  if (nonblank > 800) failures.push({ repositoryPath, nonblank });
}

if (failures.length > 0) {
  failures.sort((left, right) => right.nonblank - left.nonblank || left.repositoryPath.localeCompare(right.repositoryPath));
  for (const failure of failures) process.stderr.write(`- ${failure.repositoryPath}: ${failure.nonblank} nonblank lines\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Source-size check passed for ${files.length} owned source files (limit 800 nonblank lines).\n`);
}
