import { inflateRawSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHashedSignatureMatcher } from "./hashed-signature-matcher.mjs";
import {
  listRepositoryFiles,
  resolveRepositoryPath,
} from "./repository-files.mjs";

const OFFICE_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx", ".docm", ".pptm", ".xlsm"]);
const BINARY_EXTENSIONS = new Set([
  ".7z", ".avif", ".bmp", ".doc", ".eml", ".exe", ".gif", ".gz", ".ico", ".jpeg", ".jpg",
  ".mov", ".mp3", ".mp4", ".pdf", ".png", ".ppt", ".tar", ".tgz", ".wav", ".webp",
  ".woff", ".woff2", ".xls", ".zip",
]);
const OFFICE_ENTRY_LIMIT = 16 * 1024 * 1024;
const OFFICE_TOTAL_LIMIT = 64 * 1024 * 1024;

const signatureDocument = JSON.parse(
  await readFile(new URL("./forbidden-signatures.json", import.meta.url), "utf8"),
);
const signatureIdsFor = createHashedSignatureMatcher(signatureDocument);

function decodeText(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let index = 2; index + 1 < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1];
      swapped[index - 1] = buffer[index];
    }
    return swapped.toString("utf16le");
  }
  return buffer.toString("utf8");
}

function looksTextual(repositoryPath, buffer) {
  const extension = path.posix.extname(repositoryPath).toLowerCase();
  if (BINARY_EXTENSIONS.has(extension)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.length >= 2 && ((sample[0] === 0xff && sample[1] === 0xfe) || (sample[0] === 0xfe && sample[1] === 0xff))) {
    return true;
  }
  return !sample.includes(0);
}

function matchesForText(repositoryPath, source, text) {
  const matches = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const ids = signatureIdsFor(lines[index]);
    if (ids.length > 0) {
      matches.push({ path: repositoryPath, source, line: index + 1, ids });
    }
  }
  return matches;
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function xmlAsText(xml) {
  return xml
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function officeTextEntries(buffer) {
  const endOffset = findEndOfCentralDirectory(buffer);
  if (endOffset < 0) throw new Error("ZIP central directory was not found");

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  let totalExpanded = 0;
  const entries = [];

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central-directory entry");
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const expandedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    offset = nameStart + nameLength + extraLength + commentLength;

    if (!/\.(?:xml|rels|txt)$/i.test(name)) continue;
    if ((flags & 0x1) !== 0) throw new Error(`Encrypted Office entry cannot be scanned: ${name}`);
    if (expandedSize > OFFICE_ENTRY_LIMIT) throw new Error(`Office entry exceeds scan limit: ${name}`);
    totalExpanded += expandedSize;
    if (totalExpanded > OFFICE_TOTAL_LIMIT) throw new Error("Office document exceeds total expanded scan limit");
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid local ZIP entry: ${name}`);
    }

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let expanded;
    if (compression === 0) expanded = compressed;
    else if (compression === 8) expanded = inflateRawSync(compressed);
    else throw new Error(`Unsupported Office entry compression ${compression}: ${name}`);

    const rawText = expanded.toString("utf8");
    entries.push({ name, text: `${rawText}\n${xmlAsText(rawText)}` });
  }

  return entries;
}

function parseOptions(argv) {
  const options = { json: false, limit: 200 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--limit") {
      const value = Number.parseInt(argv[index + 1] ?? "", 10);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("--limit requires a non-negative integer");
      options.limit = value;
      index += 1;
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const matches = [];
  const errors = [];
  // workingspace/ is user-owned operator material (AGENTS.md); exempt from the
  // forbidden-reference scan by repository-owner decision, alongside the evidence store.
  // The two generated repository indexes are also exempt: they merely re-list every
  // tracked path, so an owner-exempt workingspace/ filename can surface in them. Every
  // NON-exempt real file path is still scanned directly by the path scan below, so
  // exempting these derived ledgers removes no coverage.
  const EXEMPT_PREFIXES = [
    "tests/fixtures/evidence/sha256/",
    "workingspace/",
    "docs/governance/repository-inventory.json",
    "docs/governance/repository-reconciliation.json",
  ];
  const files = listRepositoryFiles().filter(
    (repositoryPath) => !EXEMPT_PREFIXES.some((prefix) => repositoryPath.startsWith(prefix)),
  );

  for (const repositoryPath of files) {
    const extension = path.posix.extname(repositoryPath).toLowerCase();
    let buffer;
    try {
      buffer = await readFile(resolveRepositoryPath(repositoryPath));
    } catch (error) {
      // During a large staged reset, cached paths may already be removed from the
      // worktree. They leave the tracked set once staged and have no bytes to scan.
      if (error?.code === "ENOENT") continue;
      errors.push({ path: repositoryPath, message: error.message });
      continue;
    }

    const pathIds = signatureIdsFor(repositoryPath);
    if (pathIds.length > 0) matches.push({ path: repositoryPath, source: "path", line: null, ids: pathIds });

    if (OFFICE_EXTENSIONS.has(extension)) {
      try {
        for (const entry of officeTextEntries(buffer)) {
          matches.push(...matchesForText(repositoryPath, `office:${entry.name}`, entry.text));
        }
      } catch (error) {
        errors.push({ path: repositoryPath, message: error.message });
      }
    } else if (looksTextual(repositoryPath, buffer)) {
      matches.push(...matchesForText(repositoryPath, "text", decodeText(buffer)));
    }
  }

  const matchedFiles = new Set(matches.map((match) => match.path)).size;
  const result = {
    scannedFiles: files.length,
    matchedFiles,
    matchLocations: matches.length,
    errors,
    matches,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`Forbidden-reference check: ${files.length} tracked files scanned.\n`);
    if (matches.length === 0) process.stdout.write("No forbidden signatures matched.\n");
    else {
      process.stderr.write(`${matches.length} location(s) in ${matchedFiles} file(s) matched.\n`);
      for (const match of matches.slice(0, options.limit)) {
        const location = match.line === null ? match.path : `${match.path}:${match.line}`;
        process.stderr.write(`- ${location} [${match.source}; ${match.ids.join(",")}]\n`);
      }
      if (matches.length > options.limit) {
        process.stderr.write(`- ... ${matches.length - options.limit} additional location(s); use --json for the complete result.\n`);
      }
    }

    for (const error of errors) {
      process.stderr.write(`- scan error: ${error.path} (${error.message})\n`);
    }
  }

  if (errors.length > 0) process.exitCode = 2;
  else if (matches.length > 0) process.exitCode = 1;
}

await main();
