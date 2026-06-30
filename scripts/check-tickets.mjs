#!/usr/bin/env node
/*
 * check-tickets.mjs — ticket-frontmatter validator for docs/tickets/.
 *
 *   Usage:
 *     node scripts/check-tickets.mjs            # validate every ticket
 *     node scripts/check-tickets.mjs --quiet    # only print failures + summary
 *
 *   Exit code 0 = all tickets valid; nonzero = at least one problem.
 *
 *   Zero npm dependencies — pure Node built-ins. Scans docs/tickets/ for the ticket
 *   spec file in each per-ticket subfolder — docs/tickets/TKT-NNN-slug/TKT-NNN-slug.md —
 *   and still accepts a legacy flat docs/tickets/TKT-*.md if one is present. The
 *   per-ticket changes.md / verification.md / evidence/* artifacts are NOT tickets and
 *   are skipped (only the TKT-*.md spec is validated). README.md / BOARD.md are skipped.
 *   For each ticket it checks:
 *
 *     - a YAML frontmatter block is present (--- … ---),
 *     - every required field is present: id, title, status, priority, area,
 *       tickets-it-relates-to, research-link,
 *     - status ∈ {backlog, now, next, done, blocked},
 *     - priority ∈ {P0, P1, P2, P3},
 *     - research-link resolves to a real repo file,
 *     - ids are unique across all tickets,
 *     - (warning only) tickets-it-relates-to references known ids.
 *
 *   Companion to scripts/check-doc-links.mjs — see docs/MAINTENANCE.md and
 *   docs/tickets/README.md.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TICKET_DIR = join(ROOT, 'docs', 'tickets');

const QUIET = process.argv.slice(2).includes('--quiet');

const REQUIRED = ['id', 'title', 'status', 'priority', 'area', 'tickets-it-relates-to', 'research-link'];
const STATUSES = ['backlog', 'now', 'next', 'done', 'blocked'];
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];

// ---- minimal frontmatter parser (scalars + inline [a, b] arrays) ------------
function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = raw.slice(raw.indexOf('\n') + 1, end);
  const fm = {};
  for (const line of block.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    // strip an inline "# comment"
    const hash = val.indexOf(' #');
    if (hash !== -1) val = val.slice(0, hash).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    fm[key] = val;
  }
  return fm;
}

// ---- discover ticket files --------------------------------------------------
if (!existsSync(TICKET_DIR)) {
  console.error(`No docs/tickets/ directory found at ${TICKET_DIR}`);
  process.exit(2);
}
// Discover the ticket spec file in each per-ticket subfolder
// (docs/tickets/TKT-NNN-slug/TKT-NNN-slug.md), plus any legacy flat TKT-*.md.
// Returns paths relative to TICKET_DIR so error messages show the subfolder.
function discoverTickets(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!/^TKT-/.test(entry.name)) continue; // only TKT-* subfolders
      for (const inner of readdirSync(join(dir, entry.name))) {
        if (/^TKT-.*\.md$/.test(inner)) out.push(join(entry.name, inner));
      }
    } else if (/^TKT-.*\.md$/.test(entry.name)) {
      out.push(entry.name); // legacy flat layout (still accepted)
    }
  }
  return out.sort();
}
const files = discoverTickets(TICKET_DIR);

if (files.length === 0) {
  console.error('No TKT-*.md ticket spec files found under docs/tickets/ (expected docs/tickets/TKT-NNN-slug/TKT-NNN-slug.md).');
  process.exit(2);
}

// ---- validate ---------------------------------------------------------------
const failures = [];
const warnings = [];
const seenIds = new Map(); // id -> file
const allIds = new Set();

const parsed = [];
for (const file of files) {
  const raw = readFileSync(join(TICKET_DIR, file), 'utf8');
  const fm = parseFrontmatter(raw);
  if (!fm) {
    failures.push(`${file}: no YAML frontmatter block (--- … ---) at top of file`);
    continue;
  }
  parsed.push({ file, fm });
  if (fm.id) allIds.add(fm.id);
}

for (const { file, fm } of parsed) {
  for (const key of REQUIRED) {
    if (!(key in fm) || fm[key] === '' || fm[key] == null) {
      failures.push(`${file}: missing required field "${key}"`);
    }
  }
  if (fm.status && !STATUSES.includes(fm.status)) {
    failures.push(`${file}: invalid status "${fm.status}" (allowed: ${STATUSES.join(', ')})`);
  }
  if (fm.priority && !PRIORITIES.includes(fm.priority)) {
    failures.push(`${file}: invalid priority "${fm.priority}" (allowed: ${PRIORITIES.join(', ')})`);
  }
  if (fm.id) {
    if (seenIds.has(fm.id)) {
      failures.push(`${file}: duplicate id "${fm.id}" (also in ${seenIds.get(fm.id)})`);
    } else {
      seenIds.set(fm.id, file);
    }
  }
  if (fm['research-link']) {
    const link = String(fm['research-link']);
    if (!existsSync(join(ROOT, link))) {
      failures.push(`${file}: research-link does not resolve → ${link}`);
    }
  }
  const rel = fm['tickets-it-relates-to'];
  if (Array.isArray(rel)) {
    for (const r of rel) {
      if (r && !allIds.has(r)) {
        warnings.push(`${file}: tickets-it-relates-to references unknown id "${r}"`);
      }
    }
  } else if (rel && rel !== '[]') {
    failures.push(`${file}: tickets-it-relates-to must be a list (e.g. [TKT-002] or [])`);
  }
}

// ---- report -----------------------------------------------------------------
if (!QUIET && warnings.length) {
  console.log('\n--- warnings (non-failing) ---');
  for (const w of warnings) console.log(`  ${w}`);
}
if (failures.length) {
  console.log('\n--- failures ---');
  for (const f of failures) console.log(`  ${f}`);
}

console.log('\n================ TICKETS SUMMARY ================');
console.log(`  scanned ${parsed.length} ticket(s); ${failures.length} failure(s), ${warnings.length} warning(s).`);
console.log(failures.length ? 'FAILED' : 'OK');
process.exit(failures.length ? 1 : 0);
