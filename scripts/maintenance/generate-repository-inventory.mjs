import { execFileSync, spawn } from "node:child_process";
import { lstat, mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createContentHash, sha256Bytes, sha256File } from "../checks/content-hash.mjs";
import {
  comparePaths,
  normalizeRepositoryPath,
  repositoryDirectoriesForFiles,
  repositoryRoot,
} from "../checks/repository-files.mjs";

const DEFAULT_OUTPUT = "docs/governance/repository-inventory.json";

// These are physical-checkout contracts, not Git-blob contracts. Git stores normalized LF bytes for
// these text files, while .gitattributes deliberately materializes CRLF bytes in every checkout.
// Keeping the locks here makes the user-owned byte invariant independent from the portable tracked
// inventory, whose other rows are derived from stage-0 index blobs.
const IMMUTABLE_WORKINGSPACE_FILES = new Map([
  ["workingspace/aifirstplan.txt", { size: 10932, sha256: "1e092f72364e78ba05aeaeae022e73ac83d89f76122e131fb17743ab03a3126c" }],
  ["workingspace/model-evaluation-plan.md", { size: 19691, sha256: "46e5795937fae4741b6fd7f778e1ffe1a7515ad39884a0128abb4e784fa4558d" }],
  ["workingspace/proposedparserchanges.md", { size: 13668, sha256: "768893ff9be0f8790f642336f77ec4ff4b33077994cbfae2c8c993534b3d2566" }],
  ["workingspace/smallmodels.md", { size: 4517, sha256: "f02a84860aa71ad4c3980a7634fe05d539895b642319ea15ee5814dcd97c6f1e" }],
]);

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

export function mediaTypeFor(repositoryPath, kind = "file") {
  if (kind === "directory") return "inode/directory";
  const basename = path.posix.basename(repositoryPath);
  if (TEXT_BASENAMES.has(basename)) return "text/plain";
  return MEDIA_TYPES.get(path.posix.extname(repositoryPath).toLowerCase()) ?? "application/octet-stream";
}

export function categoryFor(repositoryPath, kind = "file") {
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

export function ownerFor(repositoryPath) {
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

export function lifecycleFor(repositoryPath, kind = "file") {
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

function resolveWithinRoot(root, repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  const absolute = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(root, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository root: ${repositoryPath}`);
  }
  return absolute;
}

export function gitOutput(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function indexEntries(root) {
  const output = gitOutput(root, ["ls-files", "--cached", "--stage", "-z"]);
  const byPath = new Map();
  for (const record of output.toString("utf8").split("\0").filter(Boolean)) {
    const tab = record.indexOf("\t");
    const match = record.slice(0, tab).match(/^(\d+) ([0-9a-f]+) ([0-3])$/);
    if (tab < 0 || !match) throw new Error(`Could not parse Git index record: ${record}`);
    const repositoryPath = normalizeRepositoryPath(record.slice(tab + 1));
    const [, mode, objectId, stage] = match;
    if (stage !== "0") {
      throw new Error(`Cannot inventory an unmerged Git index path at stage ${stage}: ${repositoryPath}`);
    }
    if (byPath.has(repositoryPath)) throw new Error(`Duplicate Git index path: ${repositoryPath}`);
    if (mode === "160000") throw new Error(`Gitlink inventory is not supported: ${repositoryPath}`);
    if (!mode.match(/^(?:100644|100755|120000)$/)) {
      throw new Error(`Unsupported Git index mode ${mode}: ${repositoryPath}`);
    }
    byPath.set(repositoryPath, { path: repositoryPath, mode, objectId });
  }
  return [...byPath.values()].sort((left, right) => comparePaths(left.path, right.path));
}

function untrackedPaths(root) {
  return gitOutput(root, ["ls-files", "--others", "--exclude-standard", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizeRepositoryPath)
    .sort(comparePaths);
}

export async function readGitBlobMetadata(root, objectIds) {
  const uniqueObjectIds = [...new Set(objectIds)];
  if (uniqueObjectIds.length === 0) return new Map();

  const child = spawn("git", ["-C", root, "cat-file", "--batch"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git cat-file --batch exited ${code}: ${stderr.trim()}`));
    });
  });
  child.stdin.end(`${uniqueObjectIds.join("\n")}\n`);

  const iterator = child.stdout[Symbol.asyncIterator]();
  let buffered = Buffer.alloc(0);
  let ended = false;
  async function pull() {
    const next = await iterator.next();
    if (next.done) {
      ended = true;
      return false;
    }
    buffered = buffered.length === 0 ? next.value : Buffer.concat([buffered, next.value]);
    return true;
  }
  async function readLine() {
    while (true) {
      const newline = buffered.indexOf(0x0a);
      if (newline >= 0) {
        const line = buffered.subarray(0, newline).toString("utf8");
        buffered = buffered.subarray(newline + 1);
        return line;
      }
      if (!await pull()) throw new Error("Unexpected end of git cat-file header stream");
    }
  }
  async function consumeBytes(length, onChunk) {
    let remaining = length;
    while (remaining > 0) {
      if (buffered.length === 0 && !await pull()) {
        throw new Error("Unexpected end of git cat-file content stream");
      }
      const count = Math.min(remaining, buffered.length);
      onChunk(buffered.subarray(0, count));
      buffered = buffered.subarray(count);
      remaining -= count;
    }
  }

  const metadata = new Map();
  for (const expectedObjectId of uniqueObjectIds) {
    const header = await readLine();
    const match = header.match(/^([0-9a-f]+) (\S+) (\d+)$/);
    if (!match) throw new Error(`Could not parse git cat-file header: ${header}`);
    const [, actualObjectId, objectType, sizeText] = match;
    if (actualObjectId !== expectedObjectId || objectType !== "blob") {
      throw new Error(`Expected blob ${expectedObjectId}, received ${header}`);
    }
    const size = Number(sizeText);
    const hash = createContentHash();
    await consumeBytes(size, (chunk) => hash.update(chunk));
    let separator = null;
    await consumeBytes(1, (chunk) => { separator = chunk[0]; });
    if (separator !== 0x0a) throw new Error(`Missing git cat-file separator after ${expectedObjectId}`);
    metadata.set(expectedObjectId, { size, sha256: hash.digestHex() });
  }

  if (!ended) {
    const next = await iterator.next();
    if (!next.done || buffered.length > 0) throw new Error("Unexpected trailing git cat-file output");
  }
  await closed;
  return metadata;
}

async function physicalFileEntry(root, repositoryPath) {
  const absolutePath = resolveWithinRoot(root, repositoryPath);
  const before = await lstat(absolutePath);

  let size;
  let sha256;
  let mediaType = mediaTypeFor(repositoryPath);

  if (before.isSymbolicLink()) {
    const target = await readlink(absolutePath, "utf8");
    const bytes = Buffer.from(target, "utf8");
    size = bytes.length;
    sha256 = sha256Bytes(bytes);
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

function indexedFileEntry(repositoryPath, indexEntry, metadata) {
  return {
    path: repositoryPath,
    mediaType: indexEntry.mode === "120000" ? "inode/symlink" : mediaTypeFor(repositoryPath),
    size: metadata.size,
    sha256: metadata.sha256,
    category: categoryFor(repositoryPath),
    owner: ownerFor(repositoryPath),
    lifecycle: lifecycleFor(repositoryPath),
  };
}

export async function collectFileEntries({
  root = repositoryRoot,
  includeUntracked = false,
  outputPath = DEFAULT_OUTPUT,
  immutableWorkingFiles = IMMUTABLE_WORKINGSPACE_FILES,
} = {}) {
  const normalizedOutput = normalizeRepositoryPath(outputPath);
  const indexed = indexEntries(root).filter((entry) => entry.path !== normalizedOutput);
  const immutablePaths = new Set(immutableWorkingFiles.keys());
  const indexedByPath = new Map(indexed.map((entry) => [entry.path, entry]));

  for (const repositoryPath of immutablePaths) {
    if (!indexedByPath.has(repositoryPath)) {
      throw new Error(`Immutable workingspace path is absent from the Git index: ${repositoryPath}`);
    }
  }

  const blobMetadata = await readGitBlobMetadata(
    root,
    indexed.filter((entry) => !immutablePaths.has(entry.path)).map((entry) => entry.objectId),
  );
  const files = [];
  for (const entry of indexed) {
    if (immutablePaths.has(entry.path)) {
      const physical = await physicalFileEntry(root, entry.path);
      const expected = immutableWorkingFiles.get(entry.path);
      if (physical.size !== expected.size || physical.sha256 !== expected.sha256) {
        throw new Error(
          `Immutable workingspace bytes changed: ${entry.path} `
          + `(expected ${expected.size}/${expected.sha256}, received ${physical.size}/${physical.sha256})`,
        );
      }
      files.push(physical);
    } else {
      files.push(indexedFileEntry(entry.path, entry, blobMetadata.get(entry.objectId)));
    }
  }

  if (includeUntracked) {
    const indexedPaths = new Set(indexed.map((entry) => entry.path));
    for (const repositoryPath of untrackedPaths(root)) {
      if (repositoryPath !== normalizedOutput && !indexedPaths.has(repositoryPath)) {
        files.push(await physicalFileEntry(root, repositoryPath));
      }
    }
  }

  return files.sort((left, right) => comparePaths(left.path, right.path));
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
      schemaVersion: 2,
      scope: includeUntracked
        ? "Stage-0 Git index files and unignored working-tree additions"
        : "Stage-0 Git index files",
      pathStyle: "repository-relative POSIX",
      ordering: "path ascending with directories before files",
      hashAlgorithm: "sha256",
      hashPolicy: {
        directories: "null because directories have no repository byte stream",
        tracked: "size and sha256 use staged Git blob bytes from the stage-0 index, independent of checkout filters and line endings",
        immutableWorkingspace: "workingspace files use separately locked physical checkout bytes because their exact user-owned bytes are contractual",
        untracked: "when requested, untracked additions use physical working-tree bytes because no Git blob exists",
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

export async function main(argv = process.argv.slice(2), root = repositoryRoot) {
  const options = parseOptions(argv);
  const outputPath = normalizeRepositoryPath(options.output);
  const outputAbsolute = resolveWithinRoot(root, outputPath);
  const files = await collectFileEntries({
    root,
    includeUntracked: options.includeUntracked,
    outputPath,
  });

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

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) await main();
