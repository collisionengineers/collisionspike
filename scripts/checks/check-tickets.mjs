#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import {
  LIFECYCLE_STATUSES,
  PLAN_STATUSES,
  PRIORITIES,
  ROOT,
  discoverPlans,
  discoverTickets,
  listFilesRecursively,
  parseFrontmatter,
  repoRelative,
  ticketsByPlan,
} from "../maintenance/ticket-system.mjs";

const QUIET = process.argv.slice(2).includes("--quiet");
const unknown = process.argv.slice(2).filter((argument) => argument !== "--quiet");
if (unknown.length > 0) throw new Error(`Unknown option(s): ${unknown.join(", ")}`);

const REQUIRED_FIELDS = [
  "id",
  "title",
  "status",
  "priority",
  "area",
  "tickets-it-relates-to",
  "research-link",
];
const BINARY_EVIDENCE_EXTENSIONS = new Set([
  ".bmp",
  ".doc",
  ".docx",
  ".eml",
  ".gif",
  ".jpeg",
  ".jpg",
  ".msg",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".tif",
  ".tiff",
  ".webp",
  ".xls",
  ".xlsx",
  ".zip",
]);
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function repositoryPathExists(value) {
  const pathOnly = String(value).split(/[?#]/, 1)[0];
  if (!pathOnly || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(pathOnly)) return true;
  return existsSync(resolve(ROOT, pathOnly));
}

function readJson(absolute, label) {
  try {
    return JSON.parse(readFileSync(absolute, "utf8"));
  } catch (error) {
    fail(`${label}: invalid JSON (${error.message})`);
    return null;
  }
}

const { tickets, directoryIssues } = discoverTickets();
failures.push(...directoryIssues);
const byId = new Map();

for (const ticket of tickets) {
  const label = ticket.relativeSpec;
  const values = ticket.frontmatter;
  if (!values) {
    fail(`${label}: missing frontmatter`);
    continue;
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in values) || values[field] === "") fail(`${label}: missing ${field}`);
  }
  if (!/^TKT-\d{3}$/.test(values.id ?? "")) fail(`${label}: invalid id ${values.id}`);
  if (byId.has(values.id)) fail(`${label}: duplicate id ${values.id}`);
  else byId.set(values.id, ticket);
  if (!ticket.directoryName.startsWith(`${values.id}-`)) {
    fail(`${label}: directory name does not start with ${values.id}-`);
  }
  if (values.status !== ticket.status) {
    fail(`${label}: frontmatter status ${values.status} does not match folder ${ticket.status}`);
  }
  if (!LIFECYCLE_STATUSES.includes(values.status)) fail(`${label}: invalid status ${values.status}`);
  if (!PRIORITIES.includes(values.priority)) fail(`${label}: invalid priority ${values.priority}`);
  if (!Array.isArray(values["tickets-it-relates-to"])) {
    fail(`${label}: tickets-it-relates-to must be a list`);
  }
  if (!repositoryPathExists(values["research-link"])) {
    fail(`${label}: research-link does not resolve -> ${values["research-link"]}`);
  }

  const changes = join(ticket.directory, "changes.md");
  const verification = join(ticket.directory, "verification.md");
  if (["now", "verify", "done"].includes(ticket.status) && !existsSync(changes)) {
    fail(`${label}: ${ticket.status} requires changes.md`);
  }
  if (["verify", "done"].includes(ticket.status) && !existsSync(verification)) {
    fail(`${label}: ${ticket.status} requires verification.md`);
  }

  for (const absolute of listFilesRecursively(ticket.directory)) {
    if (BINARY_EVIDENCE_EXTENSIONS.has(extname(absolute).toLowerCase())) {
      fail(`${repoRelative(absolute)}: raw binary evidence must use the content-addressed store`);
    }
  }
}

for (const ticket of tickets) {
  const relations = ticket.frontmatter?.["tickets-it-relates-to"];
  if (!Array.isArray(relations)) continue;
  for (const relation of relations) {
    if (!byId.has(relation)) {
      warnings.push(`${ticket.relativeSpec}: related ticket is not in this tree: ${relation}`);
    }
  }
}

const plans = discoverPlans();
const planById = new Map();
const byPlan = ticketsByPlan(tickets);
for (const plan of plans) {
  const label = plan.relative;
  const values = plan.frontmatter;
  if (!values) {
    fail(`${label}: missing frontmatter`);
    continue;
  }
  const fileId = plan.fileName.match(/^(PLAN-\d{3})-/)?.[1];
  if (values.id !== fileId) fail(`${label}: id ${values.id} does not match ${fileId}`);
  if (!values.title) fail(`${label}: missing title`);
  if (!PLAN_STATUSES.includes(values.status)) fail(`${label}: invalid status ${values.status}`);
  if (!Array.isArray(values.tickets)) fail(`${label}: tickets must be a list`);
  if (planById.has(values.id)) fail(`${label}: duplicate plan id ${values.id}`);
  planById.set(values.id, plan);

  const expected = (byPlan.get(values.id) ?? []).map((ticket) => ticket.frontmatter.id);
  const actual = Array.isArray(values.tickets) ? values.tickets : [];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label}: generated membership drift; expected [${expected.join(", ")}]`);
  }
  if (values.status === "done") {
    const notDone = (byPlan.get(values.id) ?? []).filter((ticket) => ticket.status !== "done");
    if (notDone.length > 0) {
      fail(`${label}: done plan has open members ${notDone.map((ticket) => ticket.frontmatter.id).join(", ")}`);
    }
  }
}

for (const ticket of tickets) {
  const plan = ticket.frontmatter?.plan;
  if (plan && !planById.has(plan)) fail(`${ticket.relativeSpec}: unknown plan ${plan}`);
}

const evidenceManifestPath = join(ROOT, "tests", "fixtures", "manifests", "evidence.json");
const evidenceManifest = existsSync(evidenceManifestPath)
  ? readJson(evidenceManifestPath, "tests/fixtures/manifests/evidence.json")
  : (fail("missing tests/fixtures/manifests/evidence.json"), null);
const evidenceBlobs = new Map(
  (evidenceManifest?.blobs ?? []).map((blob) => [String(blob.sha256).toLowerCase(), blob]),
);
const evidenceUsesByOriginalPath = new Map(
  (evidenceManifest?.usages ?? []).map((usage) => [usage.originalPath, usage]),
);

for (const ticket of tickets) {
  const absolute = join(ticket.directory, "evidence-manifest.json");
  if (!existsSync(absolute)) continue;
  const label = repoRelative(absolute);
  const local = readJson(absolute, label);
  if (!local) continue;
  if (local.ticket !== ticket.frontmatter.id) fail(`${label}: ticket must equal ${ticket.frontmatter.id}`);
  if (!Array.isArray(local.usages) || local.usages.length === 0) {
    fail(`${label}: manifest is allowed only when at least one evidence use exists`);
    continue;
  }
  if (local.globalManifest) {
    const target = resolve(dirname(absolute), local.globalManifest);
    if (!existsSync(target)) fail(`${label}: globalManifest does not resolve`);
  }
  for (const [index, usage] of local.usages.entries()) {
    const prefix = `${label}: usages[${index}]`;
    for (const field of ["role", "originalPath", "originalFilename", "sha256", "storagePath"]) {
      if (!usage[field]) fail(`${prefix}: missing ${field}`);
    }
    const hash = String(usage.sha256 ?? "").toLowerCase();
    const blob = evidenceBlobs.get(hash);
    if (!blob) fail(`${prefix}: SHA-256 not in global catalog: ${hash}`);
    else if (blob.storagePath !== usage.storagePath) fail(`${prefix}: storagePath differs from global catalog`);
    if (usage.storagePath && !existsSync(resolve(ROOT, usage.storagePath))) {
      fail(`${prefix}: stored blob does not resolve: ${usage.storagePath}`);
    }
  }
}

const evaluationManifestPath = join(ROOT, "scripts", "evaluation", "email", "manifest.json");
if (existsSync(evaluationManifestPath)) {
  const evaluation = readJson(evaluationManifestPath, "scripts/evaluation/email/manifest.json");
  for (const [index, item] of (evaluation?.items ?? []).entries()) {
    const label = `scripts/evaluation/email/manifest.json: items[${index}] ${item.id ?? "(no id)"}`;
    const hash = String(item.evidence_sha256 ?? "").toLowerCase();
    if (hash) {
      const blob = evidenceBlobs.get(hash);
      if (!blob) fail(`${label}: evidence_sha256 is not catalogued`);
      const use = evidenceUsesByOriginalPath.get(item.file);
      const isStoredBlob = blob?.storagePath === item.file;
      const isLogicalUse = use && String(use.sha256).toLowerCase() === hash;
      if (!isStoredBlob && !isLogicalUse) {
        fail(`${label}: file/evidence_sha256 pair does not match a catalogued logical use`);
      }
    } else if (item.tracked === false) {
      // Overlay examples intentionally document absent local samples and are not scored.
      continue;
    } else if (!item.file || !repositoryPathExists(item.file)) {
      fail(`${label}: file does not resolve and no evidence_sha256 is supplied`);
    }
  }
}

const generation = spawnSync(process.execPath, ["scripts/maintenance/ticket-generate.mjs", "--check"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (generation.status !== 0) {
  fail(`generated ticket views are stale:\n${generation.stderr || generation.stdout}`.trim());
}

if (!QUIET && warnings.length > 0) {
  console.log("\n--- warnings ---");
  for (const warning of warnings) console.log(`  ${warning}`);
}
if (failures.length > 0) {
  console.log("\n--- failures ---");
  for (const failure of failures) console.log(`  ${failure}`);
}

console.log("\n================ TICKETS SUMMARY ================");
console.log(
  `  scanned ${tickets.length} ticket(s); ${plans.length} plan(s); ${failures.length} failure(s), ${warnings.length} warning(s).`,
);
console.log(failures.length === 0 ? "OK" : "FAILED");
process.exit(failures.length === 0 ? 0 : 1);
