#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const budgetPath = path.join(root, "scripts", "checks", "source-size-budget.json");
const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
const limit = Number(budget.limit);
const ratchets = new Map(Object.entries(budget.ratchets ?? {}));
if (!Number.isInteger(limit) || limit < 1) throw new Error("source-size budget limit must be a positive integer");
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
const observed = new Map();
for (const repositoryPath of files) {
  const contents = fs.readFileSync(path.join(root, ...repositoryPath.split("/")), "utf8");
  const nonblank = contents.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  observed.set(repositoryPath, nonblank);
  if (nonblank <= limit) continue;
  const ceiling = ratchets.get(repositoryPath);
  if (!Number.isInteger(ceiling)) {
    failures.push({ repositoryPath, nonblank, reason: `exceeds ${limit} with no ratchet` });
  } else if (nonblank > ceiling) {
    failures.push({ repositoryPath, nonblank, reason: `grew beyond ratchet ${ceiling}` });
  }
}

for (const [repositoryPath, ceiling] of ratchets) {
  const nonblank = observed.get(repositoryPath);
  if (nonblank === undefined) {
    failures.push({ repositoryPath, nonblank: 0, reason: "ratchet points to a missing source file" });
  } else if (nonblank <= limit) {
    failures.push({ repositoryPath, nonblank, reason: `is now within ${limit}; remove its stale ratchet` });
  } else if (!Number.isInteger(ceiling) || ceiling <= limit) {
    failures.push({ repositoryPath, nonblank, reason: "ratchet ceiling must be an integer above the default limit" });
  }
}

if (failures.length > 0) {
  failures.sort((left, right) => right.nonblank - left.nonblank || left.repositoryPath.localeCompare(right.repositoryPath));
  for (const failure of failures) {
    process.stderr.write(`- ${failure.repositoryPath}: ${failure.nonblank} nonblank lines (${failure.reason})\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Source-size check passed for ${files.length} owned source files ` +
    `(default limit ${limit}; ${ratchets.size} explicit no-growth ratchets).\n`,
  );
}
