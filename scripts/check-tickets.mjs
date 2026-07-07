#!/usr/bin/env node
/*
 * check-tickets.mjs — validator for the Markdown ticket system.
 *
 * Validates:
 *   - ticket folders live under docs/tickets/<status>/TKT-NNN-<slug>/,
 *   - folder status equals frontmatter status,
 *   - required frontmatter fields and enums,
 *   - research-link paths resolve,
 *   - BOARD rows cover every ticket exactly once and in the matching section,
 *   - plans/PLAN-*.md frontmatter and ticket membership links,
 *   - scripts/eval-email/manifest.json docs/tickets paths resolve.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TICKET_DIR = join(ROOT, "docs", "tickets");
const BOARD = join(TICKET_DIR, "BOARD.md");
const MANIFEST = join(ROOT, "scripts", "eval-email", "manifest.json");

const QUIET = process.argv.slice(2).includes("--quiet");

const REQUIRED = [
  "id",
  "title",
  "status",
  "priority",
  "area",
  "tickets-it-relates-to",
  "research-link",
];
const STATUSES = ["backlog", "now", "next", "verify", "done", "blocked"];
const PLAN_STATUSES = ["active", "done", "superseded"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const STATUS_HEADINGS = new Map([
  ["now", /^Now\b/i],
  ["verify", /^Verify\b/i],
  ["done", /^Done\b/i],
  ["next", /^Next\b/i],
  ["backlog", /^Backlog\b/i],
  ["blocked", /^Blocked\b/i],
]);

function toPosix(p) {
  return p.split(sep).join("/");
}

function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = raw.slice(raw.indexOf("\n") + 1, end);
  const fm = {};
  for (const line of block.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    const hash = val.indexOf(" #");
    if (hash !== -1) val = val.slice(0, hash).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      val = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      val = val.replace(/^['"]|['"]$/g, "");
    }
    fm[key] = val;
  }
  return fm;
}

function discoverTickets() {
  const files = [];
  const failures = [];
  if (!existsSync(TICKET_DIR))
    failures.push(`No docs/tickets/ directory found at ${TICKET_DIR}`);
  for (const entry of readdirSync(TICKET_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && /^TKT-/.test(entry.name)) {
      failures.push(
        `legacy top-level ticket folder is not allowed after migration: docs/tickets/${entry.name}`,
      );
    }
  }
  for (const status of STATUSES) {
    const statusDir = join(TICKET_DIR, status);
    if (!existsSync(statusDir)) {
      failures.push(`missing status directory: docs/tickets/${status}`);
      continue;
    }
    for (const entry of readdirSync(statusDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!/^TKT-\d{3}-/.test(entry.name)) {
        failures.push(
          `unexpected directory under docs/tickets/${status}: ${entry.name}`,
        );
        continue;
      }
      const spec = join(statusDir, entry.name, `${entry.name}.md`);
      if (!existsSync(spec)) {
        failures.push(
          `missing ticket spec: docs/tickets/${status}/${entry.name}/${entry.name}.md`,
        );
      } else {
        files.push({
          status,
          dirName: entry.name,
          abs: spec,
          rel: toPosix(relative(ROOT, spec)),
        });
      }
    }
  }
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  return { files, failures };
}

function linkExists(repoRel) {
  return existsSync(join(ROOT, repoRel));
}

function parseBoardRows() {
  const rows = [];
  if (!existsSync(BOARD)) return rows;
  const raw = readFileSync(BOARD, "utf8");
  let currentStatus = null;
  for (const line of raw.split("\n")) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      currentStatus = null;
      for (const [status, re] of STATUS_HEADINGS) {
        if (re.test(h[1])) currentStatus = status;
      }
      continue;
    }
    if (!currentStatus) continue;
    const m = line.match(/^\|\s*\[?(TKT-\d{3})\]?\(([^)]+)\)/);
    if (!m) continue;
    rows.push({ id: m[1], href: m[2], status: currentStatus, line });
  }
  return rows;
}

function validatePlans(ticketById) {
  const failures = [];
  const warnings = [];
  const plans = new Map();
  const planDir = join(TICKET_DIR, "plans");
  if (!existsSync(planDir)) return { failures, warnings, plans };
  for (const entry of readdirSync(planDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^PLAN-\d{3}-.*\.md$/.test(entry.name)) continue;
    const abs = join(planDir, entry.name);
    const rel = toPosix(relative(ROOT, abs));
    const fm = parseFrontmatter(readFileSync(abs, "utf8"));
    if (!fm) {
      failures.push(`${rel}: no YAML frontmatter block`);
      continue;
    }
    const idFromName = entry.name.match(/^(PLAN-\d{3})-/)?.[1];
    if (!fm.id) failures.push(`${rel}: missing required field "id"`);
    if (!fm.title) failures.push(`${rel}: missing required field "title"`);
    if (!fm.status) failures.push(`${rel}: missing required field "status"`);
    if (!Array.isArray(fm.tickets))
      failures.push(`${rel}: missing or invalid required field "tickets"`);
    if (fm.id && idFromName && fm.id !== idFromName)
      failures.push(
        `${rel}: id "${fm.id}" does not match filename id "${idFromName}"`,
      );
    if (fm.status && !PLAN_STATUSES.includes(fm.status))
      failures.push(
        `${rel}: invalid plan status "${fm.status}" (allowed: ${PLAN_STATUSES.join(", ")})`,
      );
    if (plans.has(fm.id)) failures.push(`${rel}: duplicate plan id "${fm.id}"`);
    else if (fm.id) plans.set(fm.id, { rel, fm });
    for (const id of Array.isArray(fm.tickets) ? fm.tickets : []) {
      if (!ticketById.has(id))
        failures.push(`${rel}: tickets lists unknown id "${id}"`);
    }
    for (const id of Array.isArray(fm["depends-on"]) ? fm["depends-on"] : []) {
      if (!plans.has(id) && !/^PLAN-\d{3}$/.test(id))
        warnings.push(
          `${rel}: depends-on value does not look like a plan id: ${id}`,
        );
    }
  }
  for (const [ticketId, ticket] of ticketById) {
    const plan = ticket.fm.plan;
    if (!plan) continue;
    if (!plans.has(plan))
      failures.push(
        `${ticket.rel}: plan "${plan}" does not resolve to docs/tickets/plans/${plan}-*.md`,
      );
    else if (!plans.get(plan).fm.tickets?.includes(ticketId))
      warnings.push(
        `${ticket.rel}: lists plan ${plan}, but ${plans.get(plan).rel} omits ${ticketId}`,
      );
  }
  return { failures, warnings, plans };
}

function validateManifest() {
  const failures = [];
  if (!existsSync(MANIFEST)) return failures;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch (err) {
    return [`scripts/eval-email/manifest.json: invalid JSON: ${err.message}`];
  }
  for (const item of manifest.items || []) {
    if (
      typeof item.file === "string" &&
      item.file.startsWith("docs/tickets/") &&
      !linkExists(item.file)
    ) {
      failures.push(
        `scripts/eval-email/manifest.json: ${item.id || "(unknown item)"} file does not resolve → ${item.file}`,
      );
    }
  }
  return failures;
}

const failures = [];
const warnings = [];
const { files, failures: discoveryFailures } = discoverTickets();
failures.push(...discoveryFailures);

if (files.length === 0) {
  failures.push(
    "No TKT-*.md ticket spec files found under docs/tickets/<status>/",
  );
}

const parsed = [];
const seenIds = new Map();
const ticketById = new Map();
for (const file of files) {
  const raw = readFileSync(file.abs, "utf8");
  const fm = parseFrontmatter(raw);
  if (!fm) {
    failures.push(
      `${file.rel}: no YAML frontmatter block (--- … ---) at top of file`,
    );
    continue;
  }
  parsed.push({ ...file, fm });
  if (fm.id) {
    if (seenIds.has(fm.id))
      failures.push(
        `${file.rel}: duplicate id "${fm.id}" (also in ${seenIds.get(fm.id)})`,
      );
    else seenIds.set(fm.id, file.rel);
    ticketById.set(fm.id, { ...file, fm });
  }
}

for (const ticket of parsed) {
  const { rel, status: folderStatus, fm } = ticket;
  for (const key of REQUIRED) {
    if (!(key in fm) || fm[key] === "" || fm[key] == null)
      failures.push(`${rel}: missing required field "${key}"`);
  }
  if (fm.status && !STATUSES.includes(fm.status))
    failures.push(
      `${rel}: invalid status "${fm.status}" (allowed: ${STATUSES.join(", ")})`,
    );
  if (fm.status && fm.status !== folderStatus)
    failures.push(
      `${rel}: folder status "${folderStatus}" does not match frontmatter status "${fm.status}"`,
    );
  if (fm.priority && !PRIORITIES.includes(fm.priority))
    failures.push(
      `${rel}: invalid priority "${fm.priority}" (allowed: ${PRIORITIES.join(", ")})`,
    );
  if (fm.id && !/^TKT-\d{3}$/.test(fm.id))
    failures.push(`${rel}: invalid id "${fm.id}"`);
  if (fm.id && !ticket.dirName.startsWith(`${fm.id}-`))
    failures.push(`${rel}: folder name does not start with id "${fm.id}-"`);
  if (fm["research-link"] && !linkExists(String(fm["research-link"])))
    failures.push(
      `${rel}: research-link does not resolve → ${fm["research-link"]}`,
    );
  const rels = fm["tickets-it-relates-to"];
  if (Array.isArray(rels)) {
    for (const id of rels)
      if (id && !ticketById.has(id))
        warnings.push(
          `${rel}: tickets-it-relates-to references unknown id "${id}"`,
        );
  } else if (rels && rels !== "[]") {
    failures.push(
      `${rel}: tickets-it-relates-to must be a list (e.g. [TKT-002] or [])`,
    );
  }
}

// BOARD parity.
const boardRows = parseBoardRows();
const rowsById = new Map();
for (const row of boardRows) {
  if (!rowsById.has(row.id)) rowsById.set(row.id, []);
  rowsById.get(row.id).push(row);
}
for (const [id, ticket] of ticketById) {
  const rows = rowsById.get(id) || [];
  if (rows.length !== 1) {
    failures.push(
      `BOARD.md: ${id} must appear exactly once in status tables (found ${rows.length})`,
    );
    continue;
  }
  const row = rows[0];
  if (row.status !== ticket.fm.status)
    failures.push(
      `BOARD.md: ${id} row is under ${row.status}, but ticket status is ${ticket.fm.status}`,
    );
  const expected = toPosix(relative(TICKET_DIR, ticket.abs));
  const normalizedHref = row.href.replace(/^\.\//, "");
  if (normalizedHref !== expected)
    failures.push(
      `BOARD.md: ${id} link points to ${row.href}, expected ./${expected}`,
    );
  if (!existsSync(resolve(TICKET_DIR, row.href)))
    failures.push(`BOARD.md: ${id} link does not resolve → ${row.href}`);
}
for (const [id, rows] of rowsById) {
  if (!ticketById.has(id))
    failures.push(`BOARD.md: row references unknown ticket id ${id}`);
  if (rows.length > 1)
    failures.push(`BOARD.md: duplicate row for ${id} (${rows.length} rows)`);
}

const planResult = validatePlans(ticketById);
failures.push(...planResult.failures);
warnings.push(...planResult.warnings);
failures.push(...validateManifest());

if (!QUIET && warnings.length) {
  console.log("\n--- warnings (non-failing) ---");
  for (const w of warnings) console.log(`  ${w}`);
}
if (failures.length) {
  console.log("\n--- failures ---");
  for (const f of failures) console.log(`  ${f}`);
}

console.log("\n================ TICKETS SUMMARY ================");
console.log(
  `  scanned ${parsed.length} ticket(s); ${planResult.plans.size} plan(s); ${failures.length} failure(s), ${warnings.length} warning(s).`,
);
console.log(failures.length ? "FAILED" : "OK");
process.exit(failures.length ? 1 : 0);
