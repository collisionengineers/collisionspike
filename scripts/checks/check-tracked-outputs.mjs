import path from "node:path";
import { pathToFileURL } from "node:url";

import { generatedDirectorySegment, listRepositoryFiles } from "./repository-files.mjs";

const GENERATED_EXTENSIONS = new Set([
  ".bak",
  ".log",
  ".pyc",
  ".pyo",
  ".tmp",
  ".tsbuildinfo",
]);

function isEvidenceArchive(repositoryPath) {
  const value = repositoryPath.toLowerCase();
  return value.startsWith("qdos-email-corpus/")
    || value.startsWith("tests/fixtures/evidence/")
    || (value.startsWith("docs/tickets/") && value.includes("/evidence/"))
    || value.startsWith("docs/reviews/");
}

export function violationFor(repositoryPath) {
  const value = repositoryPath.toLowerCase();
  const generatedSegment = generatedDirectorySegment(repositoryPath);
  if (generatedSegment) return `generated directory: ${generatedSegment}`;

  if (value.startsWith("deploy/")) return "deployment staging tree";
  if (value.startsWith("scripts/") && value.includes("/local/")) return "local run output";
  if (value.includes(".generated.")) return "generated source artifact";

  const extension = path.posix.extname(value);
  if (GENERATED_EXTENSIONS.has(extension)) return `generated extension: ${extension}`;
  if (extension === ".zip" && !isEvidenceArchive(value)) return "generated or unexplained archive";
  return null;
}

function main() {
  const violations = listRepositoryFiles()
    .map((repositoryPath) => ({ path: repositoryPath, reason: violationFor(repositoryPath) }))
    .filter((entry) => entry.reason);

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ violations }, null, 2)}\n`);
  } else if (violations.length === 0) {
    process.stdout.write("Tracked-output check passed.\n");
  } else {
    process.stderr.write(`Tracked-output check failed: ${violations.length} file(s).\n`);
    for (const violation of violations) {
      process.stderr.write(`- ${violation.path} (${violation.reason})\n`);
    }
  }

  if (violations.length > 0) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
