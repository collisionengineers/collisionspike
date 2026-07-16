#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import {
  listRepositoryFiles,
  repositoryRoot,
  resolveRepositoryPath,
} from "../checks/repository-files.mjs";

const write = process.argv.includes("--write");
const unexpected = process.argv.slice(2).filter((argument) => argument !== "--write" && argument !== "--check");
if (unexpected.length > 0) throw new Error(`Unknown option(s): ${unexpected.join(", ")}`);

const paths = listRepositoryFiles({ includeUntracked: true });
const attributes = execFileSync(
  "git",
  ["-C", repositoryRoot, "check-attr", "-z", "--stdin", "text", "eol"],
  {
    input: Buffer.from(`${paths.join("\0")}\0`, "utf8"),
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  },
).toString("utf8").split("\0");

const explicitText = new Set();
const explicitCrlf = new Set();
for (let index = 0; index + 2 < attributes.length; index += 3) {
  const [repositoryPath, attribute, value] = attributes.slice(index, index + 3);
  const normalizedPath = repositoryPath.replaceAll("\\", "/");
  if (attribute === "text" && value === "set") explicitText.add(normalizedPath);
  if (attribute === "eol" && value === "crlf") explicitCrlf.add(normalizedPath);
}

const changed = [];
for (const repositoryPath of paths) {
  if (!explicitText.has(repositoryPath) || explicitCrlf.has(repositoryPath)) continue;
  const absolutePath = resolveRepositoryPath(repositoryPath);
  let before;
  try {
    before = await readFile(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  if (!before.includes(Buffer.from("\r\n"))) continue;
  const after = Buffer.from(before.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
  if (write) await writeFile(absolutePath, after);
  changed.push(repositoryPath);
}

if (changed.length === 0) {
  process.stdout.write("Line-ending check passed.\n");
} else if (write) {
  process.stdout.write(`Normalized ${changed.length} explicit text file(s) to LF.\n`);
} else {
  process.stderr.write(`${changed.length} explicit text file(s) contain CRLF. Run scripts/maintenance/normalize-line-endings.mjs --write.\n`);
  for (const repositoryPath of changed.slice(0, 100)) process.stderr.write(`- ${repositoryPath}\n`);
  process.exitCode = 1;
}
