import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  comparePaths,
  listRepositoryFiles,
  normalizeRepositoryPath,
  repositoryDirectoriesForFiles,
  repositoryRoot,
  resolveRepositoryPath,
} from "../checks/repository-files.mjs";

const DEFAULT_OUTPUT = "docs/governance/repository-inventory.json";

const MEDIA_TYPES = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".cjs", "text/javascript"],
  [".csv", "text/csv"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".eml", "message/rfc822"],
  [".gif", "image/gif"],
  [".htm", "text/html"],
  [".html", "text/html"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".jsonl", "application/x-ndjson"],
  [".jsx", "text/jsx"],
  [".lock", "text/plain"],
  [".log", "text/plain"],
  [".md", "text/markdown"],
  [".mjs", "text/javascript"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".ppt", "application/vnd.ms-powerpoint"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".ps1", "text/x-powershell"],
  [".py", "text/x-python"],
  [".rels", "application/vnd.openxmlformats-package.relationships+xml"],
  [".sh", "text/x-shellscript"],
  [".sql", "application/sql"],
  [".svg", "image/svg+xml"],
  [".toml", "application/toml"],
  [".ts", "text/typescript"],
  [".tsx", "text/tsx"],
  [".txt", "text/plain"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".xml", "application/xml"],
  [".yaml", "application/yaml"],
  [".yml", "application/yaml"],
  [".zip", "application/zip"],
]);

const TEXT_BASENAMES = new Set([
  ".editorconfig",
  ".env.example",
  ".gitattributes",
  ".gitignore",
  "AGENTS.md",
  "CLAUDE.md",
  "Dockerfile",
  "LICENSE",
]);

function parseOptions(argv) {
  const options = {
    check: false,
    includeUntracked: false,
    output: DEFAULT_OUTPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.check = true;
    } else if (argument === "--include-untracked") {
      options.includeUntracked = true;
    } else if (argument === "--output") {
      const value = argv[index + 1];
      if (!value) throw new Error("--output requires a repository-relative path");
      options.output = normalizeRepositoryPath(value);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

function mediaTypeFor(repositoryPath, kind = "file") {
  if (kind === "directory") return "inode/directory";
  const basename = path.posix.basename(repositoryPath);
  if (TEXT_BASENAMES.has(basename)) return "text/plain";
  return MEDIA_TYPES.get(path.posix.extname(repositoryPath).toLowerCase()) ?? "application/octet-stream";
}

function categoryFor(repositoryPath, kind = "file") {
  const value = repositoryPath.toLowerCase();
  if (kind === "directory") return "directory";
  if (value.startsWith("tests/fixtures/evidence/")) return "evidence";
  if (value.startsWith("docs/tickets/")) return "ticket";
  if (value.startsWith("workingspace/")) return "working-document";
  if (value.startsWith("docs/")) return "documentation";
  if (value.startsWith("contracts/") || value.includes("/contracts/")) return "contract";
  if (value.includes("/tests/") || /(?:^|\/)test[^/]*\.[^/]+$/.test(value)) return "test";
  if (value.includes("/fixtures/") || value.includes("/fixture/")) return "fixture";
  if (value.includes("/vendor/") || value.includes("/vendor_")) return "vendored-source";
  if (value.startsWith("scripts/") || value.startsWith(".github/")) return "automation";
  if (value.startsWith("infrastructure/") || value.includes("/infra/")) return "infrastructure";
  if (value.endsWith("package-lock.json") || /(?:^|\/)(?:package|tsconfig|vite\.config|vitest\.config)[^/]*\.json$/.test(value)) return "configuration";
  if (value.match(/\.(?:md|txt)$/)) return "documentation";
  if (value.match(/\.(?:png|jpe?g|gif|svg|webp|ico|woff2?)$/)) return "asset";
  return "source";
}

function ownerFor(repositoryPath) {
  const value = repositoryPath.toLowerCase();
  if (value === ".") return "repository-governance";
  if (value.startsWith(".agents/") || value.startsWith(".claude/") || value === "agents.md" || value === "claude.md") return "agent-governance";
  if (value.startsWith("workingspace/")) return "user-workspace";
  if (value.startsWith("docs/tickets/")) return "ticket-system";
  if (value.startsWith("docs/")) return "documentation";
  if (value.startsWith("scripts/checks/") || value.startsWith("scripts/maintenance/") || value.startsWith(".github/")) return "repository-governance";
  if (value.startsWith("scripts/")) return "engineering-automation";
  if (value.startsWith("services/data-api/")) return "data-api";
  if (value.startsWith("services/orchestration/")) return "orchestration";
  if (value.startsWith("apps/web/")) return "web-app";
  if (value.startsWith("packages/domain/")) return "domain-model";
  if (value.startsWith("contracts/")) return "contracts";
  if (value.startsWith("services/functions/parser/")) return "document-parsing";
  if (value.startsWith("services/functions/vehicle-enrichment/")) return "vehicle-enrichment";
  if (value.startsWith("services/functions/eva-sentry/")) return "eva-integration";
  if (value.startsWith("services/functions/location-assist/")) return "location-suggestions";
  if (value.startsWith("services/functions/box-webhook/")) return "archive-integration";
  if (value.startsWith("services/functions/ocr/")) return "image-analysis";
  if (value.startsWith("tests/")) return "quality-and-evaluation";
  if (value.startsWith("database/")) return "data-platform";
  return "repository";
}

function lifecycleFor(repositoryPath, kind = "file") {
  const value = repositoryPath.toLowerCase();
  if (kind === "directory") {
    if (value.startsWith("workingspace")) return "working";
    if (value.startsWith(".artifacts")) return "generated";
    return "structural";
  }
  if (value === DEFAULT_OUTPUT) return "generated";
  if (value.startsWith("workingspace/")) return "working";
  if (value.startsWith("tests/fixtures/evidence/")) return "evidence";
  if (value.includes("/vendor/") || value.includes("/vendor_")) return "vendored";
  if (value.startsWith(".artifacts/") || value.match(/(?:^|\/)(?:dist|build|coverage)\//) || value.includes(".generated.")) return "generated";
  return "active";
}

async function sha256File(absolutePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function fileEntry(repositoryPath) {
  const absolutePath = resolveRepositoryPath(repositoryPath);
  const before = await lstat(absolutePath);

  let size;
  let sha256;
  let mediaType = mediaTypeFor(repositoryPath);

  if (before.isSymbolicLink()) {
    const target = await readlink(absolutePath, "utf8");
    const bytes = Buffer.from(target, "utf8");
    size = bytes.length;
    sha256 = createHash("sha256").update(bytes).digest("hex");
    mediaType = "inode/symlink";
  } else if (before.isFile()) {
    size = before.size;
    sha256 = await sha256File(absolutePath);
  } else {
    throw new Error(`Inventory path is not a regular file or symbolic link: ${repositoryPath}`);
  }

  const after = await lstat(absolutePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error(`File changed while inventory was generated: ${repositoryPath}`);
  }

  return {
    path: repositoryPath,
    mediaType,
    size,
    sha256,
    category: categoryFor(repositoryPath),
    owner: ownerFor(repositoryPath),
    lifecycle: lifecycleFor(repositoryPath),
  };
}

function directoryEntry(repositoryPath) {
  return {
    path: repositoryPath,
    mediaType: mediaTypeFor(repositoryPath, "directory"),
    size: 0,
    sha256: null,
    category: categoryFor(repositoryPath, "directory"),
    owner: ownerFor(repositoryPath),
    lifecycle: lifecycleFor(repositoryPath, "directory"),
  };
}

function serializeInventory({ directories, files, includeUntracked, outputPath }) {
  const selfEntry = files.find((entry) => entry.path === outputPath);
  const otherBytes = files
    .filter((entry) => entry.path !== outputPath)
    .reduce((total, entry) => total + entry.size, 0);

  let serialized = "";
  let priorSize = -1;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const selfSize = Buffer.byteLength(serialized, "utf8");
    selfEntry.size = selfSize;

    const document = {
      schemaVersion: 1,
      scope: includeUntracked
        ? "Git-tracked files and unignored working-tree additions"
        : "Git-tracked files",
      pathStyle: "repository-relative POSIX",
      ordering: "path ascending with directories before files",
      hashAlgorithm: "sha256",
      hashPolicy: {
        directories: "null because directories have no repository byte stream",
        self: `${outputPath} has sha256 null because embedding its own digest cannot produce a stable file`,
      },
      classificationPolicy: "Deterministic path-based defaults; owner and lifecycle are navigation metadata and must be reviewed when responsibilities change",
      counts: {
        directories: directories.length,
        files: files.length,
        entries: directories.length + files.length,
      },
      totalFileBytes: otherBytes + selfSize,
      entries: [...directories, ...files],
    };

    serialized = `${JSON.stringify(document, null, 2)}\n`;
    const nextSize = Buffer.byteLength(serialized, "utf8");
    if (nextSize === selfSize && nextSize === priorSize) return serialized;
    priorSize = nextSize;
  }

  throw new Error("Inventory self-size did not converge");
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const outputPath = normalizeRepositoryPath(options.output);
  const outputAbsolute = resolveRepositoryPath(outputPath);
  const repositoryFiles = listRepositoryFiles({ includeUntracked: options.includeUntracked })
    .filter((repositoryPath) => repositoryPath !== outputPath);

  const files = [];
  const concurrency = 8;
  for (let start = 0; start < repositoryFiles.length; start += concurrency) {
    const batch = repositoryFiles.slice(start, start + concurrency);
    files.push(...await Promise.all(batch.map(fileEntry)));
  }

  files.push({
    path: outputPath,
    mediaType: mediaTypeFor(outputPath),
    size: 0,
    sha256: null,
    category: "repository-inventory",
    owner: "repository-governance",
    lifecycle: "generated",
  });
  files.sort((left, right) => comparePaths(left.path, right.path));

  const directoryPaths = repositoryDirectoriesForFiles(files.map((entry) => entry.path));
  const directories = directoryPaths.map(directoryEntry);
  const serialized = serializeInventory({
    directories,
    files,
    includeUntracked: options.includeUntracked,
    outputPath,
  });

  if (options.check) {
    const current = await readFile(outputAbsolute, "utf8").catch(() => null);
    if (current !== serialized) {
      process.stderr.write(`${outputPath} is stale; regenerate it with scripts/maintenance/generate-repository-inventory.mjs.\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`Repository inventory is current: ${directories.length} directories, ${files.length} files.\n`);
    return;
  }

  await mkdir(path.dirname(outputAbsolute), { recursive: true });
  await writeFile(outputAbsolute, serialized, "utf8");
  process.stdout.write(`Wrote ${outputPath}: ${directories.length} directories, ${files.length} files.\n`);
}

await main();
