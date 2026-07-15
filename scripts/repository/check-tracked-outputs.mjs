import path from "node:path";
import { listRepositoryFiles } from "./repository-files.mjs";

const GENERATED_DIRECTORY_SEGMENTS = new Set([
  ".cache",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".venv",
  ".vite",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules",
]);

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
  return value.startsWith("test-cases-and-data/")
    || (value.startsWith("docs/tickets/") && value.includes("/evidence/"))
    || value.startsWith("docs/reviews/");
}

function violationFor(repositoryPath) {
  const value = repositoryPath.toLowerCase();
  const segments = value.split("/");
  const generatedSegment = segments.find((segment) => GENERATED_DIRECTORY_SEGMENTS.has(segment));
  if (generatedSegment) return `generated directory: ${generatedSegment}`;

  if (value.startsWith("deploy/")) return "deployment staging tree";
  if (value.startsWith("scripts/") && value.includes("/local/")) return "local run output";
  if (value.includes(".generated.")) return "generated source artifact";

  const extension = path.posix.extname(value);
  if (GENERATED_EXTENSIONS.has(extension)) return `generated extension: ${extension}`;
  if (extension === ".zip" && !isEvidenceArchive(value)) return "generated or unexplained archive";
  return null;
}

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
