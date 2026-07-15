#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_EVIDENCE_MANIFEST,
  REPOSITORY_ROOT,
  resolveEvidence,
} from "../../tests/fixtures/resolvers/evidence-resolver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
if (ROOT !== REPOSITORY_ROOT) throw new Error("Repository-root resolution disagrees.");

const SOURCE_ROOTS = [
  "docs/tickets",
  "docs/reference",
  "tests/fixtures/cases",
  "tests/fixtures/email",
  "services/functions/parser/tests/fixtures/instructions",
  "docs/design/product-demo",
];
const STORE_ROOT = "tests/fixtures/evidence/sha256";
const MANIFEST_PATH = "tests/fixtures/manifests/evidence.json";
const LEDGER_PATH = "tests/fixtures/manifests/evidence-dispositions.json";
const RAW_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".eml",
  ".jpeg",
  ".jpg",
  ".msg",
  ".pdf",
  ".png",
  ".pptx",
  ".xlsx",
  ".zip",
]);
const MEDIA_TYPES = {
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".eml": "message/rfc822",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".msg": "application/vnd.ms-outlook",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
};

const DISPOSITION_RULES = [
  {
    category: "obsolete-assistant-export",
    prefix: "test-cases-and-data/e-mail-examinations/mems/",
    sourceLocation: "test-cases-and-data/e-mail-examinations/mems/",
    reason: "Exported assistant state is not source evidence and has no current consumer.",
    omitItemPaths: true,
  },
  {
    category: "generated-evaluation-output",
    prefix: "docs/tickets/done/TKT-017-ai-reg-ocr/evidence/harness/results/",
    sourceLocation: "docs/tickets/done/TKT-017-ai-reg-ocr/evidence/harness/results/",
    reason: "Reproducible harness output is regenerated when the benchmark runs.",
  },
  {
    category: "generated-demo-output",
    prefix: "project-demo/task-output/",
    sourceLocation: "project-demo/task-output/",
    reason: "Reproducible presentation output is not retained as source evidence.",
  },
  {
    category: "requirements-transcribed-obsolete-prototype",
    prefix: "docs/reviews/190626/",
    sourceLocation: "docs/reviews/190626/",
    extension: ".png",
    reason: "The adjacent review text preserves the requirements; obsolete prototype images are removed.",
  },
];

function posix(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function absolute(repositoryPath) {
  const resolved = path.resolve(ROOT, repositoryPath);
  const relative = path.relative(ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository: ${repositoryPath}`);
  }
  return resolved;
}

function walkFiles(repositoryPath) {
  const root = absolute(repositoryPath);
  if (!fs.existsSync(root)) return [];
  const output = [];
  const visit = (directory) => {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) output.push(posix(path.relative(ROOT, fullPath)));
    }
  };
  visit(root);
  return output;
}

function sha256File(repositoryPath) {
  return crypto.createHash("sha256").update(fs.readFileSync(absolute(repositoryPath))).digest("hex");
}

function fileRow(repositoryPath) {
  const extension = path.extname(repositoryPath).toLowerCase();
  return {
    path: repositoryPath,
    size: fs.statSync(absolute(repositoryPath)).size,
    sha256: sha256File(repositoryPath),
    extension,
    mediaType: MEDIA_TYPES[extension] ?? "application/octet-stream",
  };
}

function matchingDispositionRule(repositoryPath) {
  return DISPOSITION_RULES.find(
    (rule) =>
      repositoryPath.startsWith(rule.prefix) &&
      (!rule.extension || path.extname(repositoryPath).toLowerCase() === rule.extension),
  );
}

function dispositionRows() {
  return DISPOSITION_RULES.flatMap((rule) =>
    walkFiles(rule.prefix)
      .filter((repositoryPath) => matchingDispositionRule(repositoryPath) === rule)
      .map(fileRow)
      .map((row) => ({ ...row, rule })),
  ).sort((a, b) => a.path.localeCompare(b.path, "en"));
}

function retainedRows() {
  return SOURCE_ROOTS.flatMap(walkFiles)
    .filter((repositoryPath) => !matchingDispositionRule(repositoryPath))
    .filter((repositoryPath) => RAW_EXTENSIONS.has(path.extname(repositoryPath).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "en"))
    .map(fileRow);
}

function ownerFor(repositoryPath) {
  const ticket = repositoryPath.match(/^docs\/tickets\/[^/]+\/(TKT-\d+)[^/]*/i)?.[1];
  if (ticket) return ticket.toUpperCase();
  if (repositoryPath.startsWith("docs/reference/")) return "reference";
  if (repositoryPath.startsWith("project-demo/")) return "product-demo";
  if (repositoryPath.startsWith("tests/fixtures/email/triage/")) {
    return "evaluation:email-classification";
  }
  const caseMatch = repositoryPath.match(/^tests\/fixtures\/cases\/([^/]+)\//);
  if (caseMatch) return `case:${caseMatch[1]}`;
  if (repositoryPath.startsWith("tests/fixtures/email/examinations/")) {
    return "evaluation:email-examinations";
  }
  if (repositoryPath.startsWith("services/functions/parser/tests/fixtures/instructions/")) {
    return "parser-regression";
  }
  return "fixture-corpus";
}

function roleFor(repositoryPath, extension) {
  const kind = extension === ".eml" || extension === ".msg"
    ? "email"
    : extension === ".png" || extension === ".jpg" || extension === ".jpeg"
      ? "image"
      : extension === ".zip"
        ? "archive"
        : extension === ".xlsx"
          ? "dataset"
          : "document";
  if (repositoryPath.startsWith("project-demo/")) return `demo-${kind}`;
  if (repositoryPath.startsWith("docs/reference/")) return `reference-${kind}`;
  if (repositoryPath.startsWith("docs/tickets/")) return `ticket-${kind}`;
  if (repositoryPath.startsWith("tests/fixtures/email/triage/")) {
    return `classification-fixture-${kind}`;
  }
  if (repositoryPath.startsWith("services/functions/parser/tests/fixtures/instructions/")) {
    return `parser-fixture-${kind}`;
  }
  return `case-fixture-${kind}`;
}

function consumerMap() {
  const byPath = new Map();
  const bySha = new Map();
  const add = (repositoryPath, consumer) => {
    const key = posix(repositoryPath);
    if (!byPath.has(key)) byPath.set(key, new Set());
    byPath.get(key).add(consumer);
  };
  const addSha = (sha256, consumer) => {
    if (!/^[a-f0-9]{64}$/.test(sha256 ?? "")) return;
    if (!bySha.has(sha256)) bySha.set(sha256, new Set());
    bySha.get(sha256).add(consumer);
  };
  const jsonItems = [
    "scripts/evaluation/email/manifest.json",
    "docs/tickets/done/TKT-017-ai-reg-ocr/evidence/harness/bench-manifest.json",
  ];
  for (const manifestPath of jsonItems) {
    if (!fs.existsSync(absolute(manifestPath))) continue;
    const manifest = JSON.parse(fs.readFileSync(absolute(manifestPath), "utf8"));
    for (const item of manifest.items ?? []) {
      if (item.evidence_sha256) addSha(item.evidence_sha256, manifestPath);
      else if (item.file) add(item.file, manifestPath);
    }
  }
  const labelsPath = "tests/fixtures/email/triage/labels.json";
  if (fs.existsSync(absolute(labelsPath))) {
    const labels = JSON.parse(fs.readFileSync(absolute(labelsPath), "utf8"));
    for (const item of labels.tier_2_synthetic ?? []) {
      if (item.evidence_sha256) addSha(item.evidence_sha256, labelsPath);
      else if (item.eml) add(`test-cases-and-data/triage-corpus/${item.eml}`, labelsPath);
    }
  }
  add("docs/reference/fullevaexportinspectionaddresses.xlsx", "scripts/evaluation/inspection-corpus/build_corpus.py");
  return { byPath, bySha };
}

function storagePath(sha256, extension) {
  return `${STORE_ROOT}/${sha256.slice(0, 2)}/${sha256}${extension}`;
}

function buildManifest(rows, previousManifest = null) {
  const consumers = consumerMap();
  const previousUsages = previousManifest?.usages ?? [];
  const previousByPath = new Map(previousUsages.map((usage) => [usage.originalPath, usage]));
  const mergedUsages = [...previousUsages];

  for (const row of rows) {
    const existing = previousByPath.get(row.path);
    if (existing) {
      if (existing.sha256 !== row.sha256 || existing.size !== row.size) {
        throw new Error(`A catalogued source path changed bytes: ${row.path}`);
      }
      continue;
    }
    mergedUsages.push({
      owner: ownerFor(row.path),
      role: roleFor(row.path, row.extension),
      originalPath: row.path,
      originalFilename: path.posix.basename(row.path),
      size: row.size,
      sha256: row.sha256,
      consumers: [
        ...(consumers.byPath.get(row.path) ?? []),
        ...(consumers.bySha.get(row.sha256) ?? []),
      ].sort((a, b) => a.localeCompare(b, "en")),
    });
  }

  for (const usage of mergedUsages) {
    const currentConsumers = [
      ...(consumers.byPath.get(usage.originalPath) ?? []),
      ...(consumers.bySha.get(usage.sha256) ?? []),
    ];
    usage.consumers = [...new Set(currentConsumers.length > 0 ? currentConsumers : usage.consumers ?? [])]
      .sort((a, b) => a.localeCompare(b, "en"));
  }
  mergedUsages.sort((a, b) => a.originalPath.localeCompare(b.originalPath, "en"));

  const priorBlobBySha = new Map((previousManifest?.blobs ?? []).map((blob) => [blob.sha256, blob]));
  const rowBySha = new Map();
  for (const row of rows) {
    const existing = rowBySha.get(row.sha256);
    if (existing && existing.extension !== row.extension) {
      throw new Error(`Identical bytes use different extensions: ${existing.path} / ${row.path}`);
    }
    rowBySha.set(row.sha256, existing ?? row);
  }
  const shas = new Set([...mergedUsages.map((usage) => usage.sha256)]);
  const blobs = [...shas].sort().map((sha256) => {
    const row = rowBySha.get(sha256);
    const prior = priorBlobBySha.get(sha256);
    if (!row && !prior) throw new Error(`No metadata exists for blob ${sha256}`);
    const extension = row?.extension ?? prior.extension;
    const size = row?.size ?? prior.size;
    return {
      sha256,
      size,
      mediaType: row?.mediaType ?? prior.mediaType,
      extension,
      storagePath: storagePath(sha256, extension),
    };
  });
  const sourceBytes = mergedUsages.reduce((total, usage) => total + usage.size, 0);
  const storedBytes = blobs.reduce((total, blob) => total + blob.size, 0);
  return {
    $schema: "./evidence.schema.json",
    version: 1,
    roots: SOURCE_ROOTS,
    store: STORE_ROOT,
    summary: {
      logicalUsages: mergedUsages.length,
      uniqueBlobs: blobs.length,
      sourceBytes,
      storedBytes,
      duplicateOccurrences: mergedUsages.length - blobs.length,
      duplicateBytesEliminated: sourceBytes - storedBytes,
    },
    blobs,
    usages: mergedUsages,
  };
}

function buildDispositionLedger(rows, previousLedger = null) {
  const previousByCategory = new Map(
    (previousLedger?.groups ?? []).map((group) => [group.category, group]),
  );
  return {
    version: 1,
    policy: "Only reproducible output, obsolete exported assistant state, and transcribed prototype images are listed here. None is retained in the evidence store.",
    groups: DISPOSITION_RULES.map((rule) => {
      const members = rows.filter((row) => row.rule === rule);
      if (members.length === 0 && previousByCategory.has(rule.category)) {
        return previousByCategory.get(rule.category);
      }
      return {
        category: rule.category,
        sourceLocation: rule.sourceLocation,
        reason: rule.reason,
        logicalOccurrences: members.length,
        bytes: members.reduce((total, row) => total + row.size, 0),
        itemPathsOmitted: Boolean(rule.omitItemPaths),
        items: members.map((row) => ({
          ...(rule.omitItemPaths ? {} : { path: row.path }),
          sha256: row.sha256,
          size: row.size,
          extension: row.extension,
        })),
      };
    }),
  };
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJson(repositoryPath, value) {
  const destination = absolute(repositoryPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, jsonText(value));
  fs.renameSync(temporary, destination);
}

function copyAndVerify(rows, manifest) {
  const sourceBySha = new Map(rows.map((row) => [row.sha256, row.path]));
  for (const blob of manifest.blobs) {
    const destination = absolute(blob.storagePath);
    if (!fs.existsSync(destination)) {
      const source = sourceBySha.get(blob.sha256);
      if (!source) throw new Error(`No source available for missing blob: ${blob.sha256}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(absolute(source), destination, fs.constants.COPYFILE_EXCL);
    }
    const stat = fs.statSync(destination);
    if (stat.size !== blob.size || sha256File(blob.storagePath) !== blob.sha256) {
      throw new Error(`Copied blob failed byte verification: ${blob.storagePath}`);
    }
  }
}

function annotateJsonPathFields(repositoryPath, fieldName, prefix, shaByPath) {
  if (!fs.existsSync(absolute(repositoryPath))) return;
  let text = fs.readFileSync(absolute(repositoryPath), "utf8");
  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
  text = text.replaceAll("\r\n", "\n");
  text = text.replace(
    /^([ \t]+)"evidence_sha256": "([a-f0-9]{64})",\n\1"evidence_sha256": "\2",\n/gm,
    '$1"evidence_sha256": "$2",\n',
  );
  const pattern = new RegExp(`^(\\s*)"${fieldName}": "([^"]+)",\\n`, "gm");
  text = text.replace(pattern, (whole, indent, fieldValue, offset, sourceText) => {
    const after = sourceText.slice(offset + whole.length).match(/^[ \t]*"evidence_sha256":/);
    if (after) return whole;
    const lookup = `${prefix}${fieldValue}`;
    const sha256 = shaByPath.get(lookup);
    return sha256 ? `${whole}${indent}"evidence_sha256": "${sha256}",\n` : whole;
  });
  text = text.replace(/\n\n([ \t]+"evidence_sha256":)/g, "\n$1");
  if (lineEnding === "\r\n") text = text.replaceAll("\n", "\r\n");
  fs.writeFileSync(absolute(repositoryPath), text);
}

function annotateConsumerManifests(manifest) {
  const shaByPath = new Map(manifest.usages.map((usage) => [usage.originalPath, usage.sha256]));
  annotateJsonPathFields("scripts/evaluation/email/manifest.json", "file", "", shaByPath);
  annotateJsonPathFields(
    "docs/tickets/done/TKT-017-ai-reg-ocr/evidence/harness/bench-manifest.json",
    "file",
    "",
    shaByPath,
  );
  annotateJsonPathFields(
    "tests/fixtures/email/triage/labels.json",
    "eml",
    "test-cases-and-data/triage-corpus/",
    shaByPath,
  );
}

function localTicketManifest(ticketRoot, usages, blobsBySha) {
  const globalManifest = posix(path.relative(absolute(ticketRoot), absolute(MANIFEST_PATH)));
  const ticket = path.posix.basename(ticketRoot).match(/^(TKT-\d+)/i)?.[1]?.toUpperCase();
  return {
    version: 1,
    ticket,
    globalManifest,
    usages: usages.map((usage) => ({
      role: usage.role,
      originalPath: posix(path.posix.relative(ticketRoot, usage.originalPath)),
      originalFilename: usage.originalFilename,
      sha256: usage.sha256,
      storagePath: blobsBySha.get(usage.sha256).storagePath,
    })),
  };
}

function writeLocalTicketManifests(manifest) {
  const byTicketRoot = new Map();
  for (const usage of manifest.usages) {
    const match = usage.originalPath.match(/^(docs\/tickets\/[^/]+\/TKT-\d+[^/]*)\//i);
    if (!match) continue;
    if (!byTicketRoot.has(match[1])) byTicketRoot.set(match[1], []);
    byTicketRoot.get(match[1]).push(usage);
  }
  const blobsBySha = new Map(manifest.blobs.map((blob) => [blob.sha256, blob]));
  for (const [ticketRoot, usages] of [...byTicketRoot].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    usages.sort((a, b) => a.originalPath.localeCompare(b.originalPath, "en"));
    writeJson(`${ticketRoot}/evidence-manifest.json`, localTicketManifest(ticketRoot, usages, blobsBySha));
  }
}

function unlinkVerifiedSources(rows, manifest, dispositionRowsToDelete) {
  const blobsBySha = new Map(manifest.blobs.map((blob) => [blob.sha256, blob]));
  const candidates = [];
  for (const row of rows) {
    const blob = blobsBySha.get(row.sha256);
    if (!blob || sha256File(blob.storagePath) !== row.sha256) {
      throw new Error(`Refusing to remove unverified source: ${row.path}`);
    }
    candidates.push(row.path);
  }
  for (const row of dispositionRowsToDelete) {
    if (!row.fromBaseline && fs.existsSync(absolute(row.path))) candidates.push(row.path);
  }
  for (const repositoryPath of candidates) fs.unlinkSync(absolute(repositoryPath));
  pruneEmptyDirectories(candidates.map((repositoryPath) => path.posix.dirname(repositoryPath)));
}

function pruneEmptyDirectories(repositoryDirectories) {
  const roots = SOURCE_ROOTS.map(absolute);
  const allowed = (directory) => roots.some((root) => directory === root || directory.startsWith(`${root}${path.sep}`));
  const directories = new Set(repositoryDirectories.map(absolute));
  for (const initial of [...directories]) {
    let current = initial;
    while (allowed(current) && !roots.includes(current)) {
      if (!fs.existsSync(current) || fs.readdirSync(current).length > 0) break;
      fs.rmdirSync(current);
      current = path.dirname(current);
    }
  }
}

function expectedLocalManifests(manifest) {
  const byTicketRoot = new Map();
  for (const usage of manifest.usages) {
    const match = usage.originalPath.match(/^(docs\/tickets\/[^/]+\/TKT-\d+[^/]*)\//i);
    if (!match) continue;
    if (!byTicketRoot.has(match[1])) byTicketRoot.set(match[1], []);
    byTicketRoot.get(match[1]).push(usage);
  }
  const blobsBySha = new Map(manifest.blobs.map((blob) => [blob.sha256, blob]));
  return new Map(
    [...byTicketRoot].map(([ticketRoot, usages]) => {
      usages.sort((a, b) => a.originalPath.localeCompare(b.originalPath, "en"));
      return [`${ticketRoot}/evidence-manifest.json`, localTicketManifest(ticketRoot, usages, blobsBySha)];
    }),
  );
}

function check() {
  const errors = [];
  if (!fs.existsSync(absolute(MANIFEST_PATH))) errors.push(`Missing ${MANIFEST_PATH}`);
  if (!fs.existsSync(absolute(LEDGER_PATH))) errors.push(`Missing ${LEDGER_PATH}`);
  if (errors.length) throw new Error(errors.join("\n"));

  const manifest = JSON.parse(fs.readFileSync(absolute(MANIFEST_PATH), "utf8"));
  const ledger = JSON.parse(fs.readFileSync(absolute(LEDGER_PATH), "utf8"));
  const blobBySha = new Map();
  for (const blob of manifest.blobs) {
    if (blobBySha.has(blob.sha256)) errors.push(`Duplicate blob entry: ${blob.sha256}`);
    blobBySha.set(blob.sha256, blob);
    if (blob.storagePath !== storagePath(blob.sha256, blob.extension)) {
      errors.push(`Non-canonical storage path: ${blob.storagePath}`);
    } else if (!fs.existsSync(absolute(blob.storagePath))) {
      errors.push(`Missing blob: ${blob.storagePath}`);
    } else if (fs.statSync(absolute(blob.storagePath)).size !== blob.size || sha256File(blob.storagePath) !== blob.sha256) {
      errors.push(`Blob bytes differ from manifest: ${blob.storagePath}`);
    }
  }
  const usagePaths = new Set();
  for (const usage of manifest.usages) {
    if (usagePaths.has(usage.originalPath)) errors.push(`Duplicate logical usage: ${usage.originalPath}`);
    usagePaths.add(usage.originalPath);
    if (!blobBySha.has(usage.sha256)) errors.push(`Usage points to unknown blob: ${usage.originalPath}`);
    if (fs.existsSync(absolute(usage.originalPath))) errors.push(`Source copy remains: ${usage.originalPath}`);
  }
  const storedFiles = walkFiles(STORE_ROOT);
  const expectedStored = new Set(manifest.blobs.map((blob) => blob.storagePath));
  for (const repositoryPath of storedFiles) {
    if (!expectedStored.has(repositoryPath)) errors.push(`Unmanaged store file: ${repositoryPath}`);
  }
  const unexpectedSources = retainedRows();
  for (const row of unexpectedSources) errors.push(`Uncatalogued raw source: ${row.path}`);
  for (const group of ledger.groups ?? []) {
    for (const item of group.items ?? []) {
      if (item.path && fs.existsSync(absolute(item.path))) errors.push(`Disposed file remains: ${item.path}`);
    }
  }
  for (const rule of DISPOSITION_RULES) {
    const remaining = walkFiles(rule.prefix).filter(
      (repositoryPath) => matchingDispositionRule(repositoryPath) === rule,
    );
    for (const repositoryPath of remaining) errors.push(`Disposed file remains: ${repositoryPath}`);
  }

  const expectedLocals = expectedLocalManifests(manifest);
  for (const [repositoryPath, expected] of expectedLocals) {
    if (!fs.existsSync(absolute(repositoryPath))) errors.push(`Missing ticket evidence manifest: ${repositoryPath}`);
    else if (fs.readFileSync(absolute(repositoryPath), "utf8") !== jsonText(expected)) {
      errors.push(`Ticket evidence manifest drifted: ${repositoryPath}`);
    }
  }
  const actualLocals = walkFiles("docs/tickets").filter((value) => value.endsWith("/evidence-manifest.json"));
  for (const repositoryPath of actualLocals) {
    if (!expectedLocals.has(repositoryPath)) errors.push(`Unexpected ticket evidence manifest: ${repositoryPath}`);
  }

  const sourceBytes = manifest.usages.reduce((total, usage) => total + usage.size, 0);
  const storedBytes = manifest.blobs.reduce((total, blob) => total + blob.size, 0);
  const expectedSummary = {
    logicalUsages: manifest.usages.length,
    uniqueBlobs: manifest.blobs.length,
    sourceBytes,
    storedBytes,
    duplicateOccurrences: manifest.usages.length - manifest.blobs.length,
    duplicateBytesEliminated: sourceBytes - storedBytes,
  };
  if (JSON.stringify(manifest.summary) !== JSON.stringify(expectedSummary)) errors.push("Manifest summary is stale.");

  if (errors.length) {
    console.error(`Evidence check failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  const disposed = (ledger.groups ?? []).reduce((total, group) => total + group.logicalOccurrences, 0);
  console.log(
    `Evidence check passed: ${manifest.usages.length} logical usage(s), ` +
      `${manifest.blobs.length} unique blob(s), ${manifest.summary.duplicateOccurrences} duplicate occurrence(s), ` +
      `${manifest.summary.duplicateBytesEliminated} duplicate byte(s) removed, ${disposed} disposition(s).`,
  );
}

function migrate() {
  const rows = retainedRows();
  const dispositions = dispositionRows();
  const previous = fs.existsSync(absolute(MANIFEST_PATH))
    ? JSON.parse(fs.readFileSync(absolute(MANIFEST_PATH), "utf8"))
    : null;
  const previousLedger = fs.existsSync(absolute(LEDGER_PATH))
    ? JSON.parse(fs.readFileSync(absolute(LEDGER_PATH), "utf8"))
    : null;
  const manifest = buildManifest(rows, previous);
  copyAndVerify(rows, manifest);
  writeJson(MANIFEST_PATH, manifest);
  writeJson(LEDGER_PATH, buildDispositionLedger(dispositions, previousLedger));
  annotateConsumerManifests(manifest);
  writeLocalTicketManifests(manifest);
  unlinkVerifiedSources(rows, manifest, dispositions);
  check();
}

function usage() {
  console.error("Usage: node scripts/maintenance/evidence-catalog.mjs <migrate|check|resolve> [sha256-or-original-path]");
  process.exitCode = 2;
}

const [command, ...args] = process.argv.slice(2);
if (command === "migrate") migrate();
else if (command === "check") check();
else if (command === "resolve" && args.length > 0) {
  const selector = args.join(" ");
  const isSha = /^[a-f0-9]{64}$/i.test(selector);
  console.log(resolveEvidence(isSha ? { sha256: selector.toLowerCase() } : { originalPath: posix(selector) }).absolutePath);
} else usage();
