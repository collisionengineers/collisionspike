#!/usr/bin/env node
/*
 * check-doc-links.mjs — documentation-freshness link/orphan/leakage gate.
 *
 *   Usage:
 *     node scripts/check-doc-links.mjs            # run all three checks
 *     node scripts/check-doc-links.mjs --quiet    # only print failures + summary
 *     node scripts/check-doc-links.mjs --only=links     # broken relative links only
 *     node scripts/check-doc-links.mjs --only=orphans   # unreachable docs/**.md only
 *     node scripts/check-doc-links.mjs --only=leakage   # embedded live-number leakage only
 *
 *   Exit code 0 = all selected checks passed; nonzero = at least one failed.
 *
 *   Zero npm dependencies — pure Node built-ins. Scans every git-tracked *.md
 *   (node_modules / .venv / .git / dist excluded). The three checks:
 *
 *     a. LINKS    — every relative [text](path.md[#anchor]) resolves to a real file.
 *     b. ORPHANS  — every docs/**.md is reachable by BFS from CLAUDE.md + docs/README.md.
 *     c. LEAKAGE  — no doc (other than the registry + memory/) embeds a volatile live
 *                   number (function counts, Postgres corpus tallies). Numbers live ONLY
 *                   in LIVE_FACTS.json + docs/architecture/live-environment.md.
 *
 *   Design note: this is the enforcement arm of docs/MAINTENANCE.md. It is intentionally
 *   conservative on leakage patterns (see LEAKAGE_PATTERNS) to avoid false positives on
 *   prose; tune that array as new volatile-number phrasings appear.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---- CLI args --------------------------------------------------------------
const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const onlyArg = argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice('--only='.length) : null;
const VALID_ONLY = ['links', 'orphans', 'leakage'];
if (ONLY && !VALID_ONLY.includes(ONLY)) {
  console.error(`--only must be one of: ${VALID_ONLY.join(', ')}`);
  process.exit(2);
}
const wants = (check) => !ONLY || ONLY === check;

// ---- Config ----------------------------------------------------------------

// The ONLY two files allowed to embed literal volatile live numbers (the registry).
// Plus memory/** (auto-memory is allowed to carry facts) — see EXCLUDED_FROM_LEAKAGE.
const REGISTRY_FILES = ['LIVE_FACTS.json', 'docs/architecture/live-environment.md'];

// Dirs whose unlinked docs are intentionally NOT treated as orphans.
// (These hold point-in-time / dated / out-of-band material that need not be in the
//  CLAUDE.md → docs/README.md link graph.)
const ORPHAN_ALLOWLIST = [
  'memory/',
  'docs/_audit/review-', // dated review snapshots (docs/_audit/review-2026-06-22/, etc.)
  'docs/_audit/repo-hygiene-', // this hygiene pass's own audit artefacts
  'docs/reviews/', // binding dated reviews are reached via their own index, not the main graph
  'node_modules/',
  '.venv/',
  // docs/HISTORICAL/** — FROZEN ARCHIVE: point-in-time material kept for provenance,
  // reachable via the Historical index in docs/README.md but NOT maintained in the
  // live link graph. Exempt from orphan + link + leakage checks. See docs/MAINTENANCE.md.
  'docs/HISTORICAL/',
  // Ephemeral generated design-candidate artefacts: the per-direction exploration files
  // (seed/a11y/direction/scorecard under directions*/ — both round 1 `directions/` and
  // round 2 `directions-r2/`) plus the generated `leaderboard*.md`. The real index for
  // this phase is design-brief.md, which IS wired from docs/plans/README.md (not exempt).
  'docs/plans/phase-ux-design-lab/directions',
  'docs/plans/phase-ux-design-lab/leaderboard',
];

// Files exempt from the leakage check (the registry + memory + the checker's own docs).
const EXCLUDED_FROM_LEAKAGE = (rel) =>
  REGISTRY_FILES.includes(rel) ||
  rel.startsWith('memory/') ||
  rel.startsWith('docs/HISTORICAL/') || // FROZEN ARCHIVE — point-in-time numbers, not maintained
  rel === 'docs/MAINTENANCE.md' || // documents the rule (quotes example patterns)
  rel.startsWith('docs/_audit/repo-hygiene-2026-06-28/'); // point-in-time audit artefacts (IA-MOVE-MAP, REVIEW) deliberately cite the before/after numbers they reconciled

// docs/HISTORICAL/** is a FROZEN ARCHIVE: its internal links were valid at the original
// pre-move paths and we deliberately do not rewrite them. Skip link-checking files that
// LIVE under it (links pointing INTO it from live docs are still checked — the archive
// itself is reachable via the Historical index in docs/README.md).
const isFrozenArchive = (rel) => rel.startsWith('docs/HISTORICAL/');

// KNOWN-ABSENT trees — links pointing into these resolve to paths that were intentionally
// removed (or never vendored here). They are PRE-EXISTING rot in superseded phase docs, not
// regressions this gate should fail on. Surfaced as a separate, NON-FAILING "backlog" list so
// they stay visible without blocking. Each prefix is decommissioned/out-of-band content:
const KNOWN_ABSENT_PREFIXES = [
  'raw/', // gitignored PII dropzone — never tracked
  'dataverse/', // decommissioned Power-Platform solution artefacts (removed in the Azure migration)
  'flows/', // decommissioned Power Automate flow definitions (removed in the Azure migration)
  'research/automationsresearch/', // separate research repo, not vendored into this tree
];
const KNOWN_ABSENT_PATTERNS = [
  // moved contract-parity tests under mockup-app/src/contracts/*.parity.test.ts
  /^mockup-app\/src\/contracts\/.*\.parity\.test\.ts$/,
];
// Match on BOTH the repo-relative resolved path AND the raw link token: some superseded
// phase docs reference the decommissioned trees with the wrong relative depth (e.g. a bare
// `flows/definitions/x.json` that resolves under the doc's own dir), so the raw token is the
// reliable signal that the author meant the removed top-level tree.
const isKnownAbsent = (resolved, rawPath = '') =>
  KNOWN_ABSENT_PREFIXES.some((p) => resolved.startsWith(p) || rawPath.startsWith(p)) ||
  KNOWN_ABSENT_PATTERNS.some((re) => re.test(resolved) || re.test(rawPath));

// Volatile-live-number patterns. Each entry: { re, why }. Keep these TUNABLE and
// commented — they encode "what counts as a live number that must live in the registry".
// Deliberately narrow (anchored to the specific volatile facts) to avoid prose false-positives.
const LEAKAGE_PATTERNS = [
  {
    // Function-app counts, e.g. "41 functions", "42 functions", "44 functions".
    // Volatile: orch/api counts change on every deploy → registry only.
    re: /\b4[0-9]\s+functions\b/gi,
    why: 'function count ("4N functions") — lives only in the registry',
  },
  {
    // Same fact phrased as "(NN functions)" / "deployed + wired (41 functions)".
    re: /\(\s*4[0-9]\s+functions\b/gi,
    why: 'parenthetical function count — lives only in the registry',
  },
  {
    // "registered NN functions" / "NN functions registered".
    re: /\b(?:registered\s+4[0-9]|4[0-9]\s+functions?\s+registered)\b/gi,
    why: 'registered-function count — lives only in the registry',
  },
  {
    // Postgres corpus tally: the canonical work_provider count (390) and the
    // inspection_address split "174 confirmed + 2035 suggested" / total 2209.
    // These are seed/load counts that drift → registry only.
    re: /\bwork_provider\s+3?\d{2,3}\b/gi,
    why: 'work_provider corpus count — lives only in the registry',
  },
  {
    re: /\b\d{3,4}\s+(?:confirmed|suggested)\b/gi,
    why: 'inspection_address confirmed/suggested tally — lives only in the registry',
  },
  {
    re: /\binspection_address\s+\d{3,4}\b/gi,
    why: 'inspection_address total — lives only in the registry',
  },
];

// ---- File discovery --------------------------------------------------------

// All git-tracked *.md, excluding the heavy/irrelevant trees.
function trackedMarkdown() {
  let out;
  try {
    out = execSync('git ls-files "*.md"', { cwd: ROOT, encoding: 'utf8' });
  } catch {
    console.error('git ls-files failed — run from inside the repo.');
    process.exit(2);
  }
  // .claude/ is agent/skill tooling, not project documentation — excluded from the scan entirely.
  const EXCLUDE = /(^|\/)(node_modules|\.venv|\.git|dist|\.claude)\//;
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((rel) => !EXCLUDE.test(rel));
}

const MD_FILES = trackedMarkdown();
const MD_SET = new Set(MD_FILES);

// ---- Link extraction -------------------------------------------------------

// Match [text](target) — capture the target. We then filter out external/anchor links.
const LINK_RE = /\[(?:[^\]]*)\]\(([^)]+)\)/g;

function isExternal(target) {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(target) || // http:, https:, mailto:, tel:, etc.
    target.startsWith('#') || // pure in-page anchor
    target.startsWith('//') // protocol-relative
  );
}

// Split a link target into path + anchor, strip surrounding angle-brackets/quotes.
function splitTarget(raw) {
  let t = raw.trim();
  // [text](<path with spaces>) form
  if (t.startsWith('<') && t.endsWith('>')) t = t.slice(1, -1);
  // [text](path "title") form — drop the title
  const titleMatch = t.match(/^(\S+)\s+["'].*["']$/);
  if (titleMatch) t = titleMatch[1];
  const hashIdx = t.indexOf('#');
  const path = hashIdx === -1 ? t : t.slice(0, hashIdx);
  const anchor = hashIdx === -1 ? '' : t.slice(hashIdx + 1);
  return { path, anchor };
}

// Return [{ line, target, path }] for every relative link in `relFile`.
// Links inside fenced code blocks (``` / ~~~) are SKIPPED — they are illustrative
// samples (e.g. a snippet showing what to paste elsewhere), not live navigation, so
// their paths are relative to the sample's eventual home, not this file.
function linksIn(relFile, content) {
  const links = [];
  const lines = content.split('\n');
  let inFence = false;
  let fenceMarker = '';
  for (let i = 0; i < lines.length; i++) {
    const fenceMatch = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!inFence) { inFence = true; fenceMarker = fenceMatch[1][0]; }
      else if (fenceMatch[1][0] === fenceMarker) { inFence = false; fenceMarker = ''; }
      continue; // the fence line itself carries no nav links
    }
    if (inFence) continue;
    let m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(lines[i])) !== null) {
      const raw = m[1];
      if (isExternal(raw)) continue;
      const { path } = splitTarget(raw);
      if (!path) continue; // pure anchor handled by isExternal, but guard empties
      links.push({ line: i + 1, target: raw.trim(), path });
    }
  }
  return links;
}

// Resolve a relative link path (from relFile's dir) to a repo-relative path string.
function resolveLink(relFile, linkPath) {
  const baseDir = dirname(join(ROOT, relFile));
  const abs = resolve(baseDir, linkPath);
  return relative(ROOT, abs).split('\\').join('/');
}

// ---- Check A: broken relative links ---------------------------------------

function checkLinks() {
  const failures = [];
  const backlog = []; // known-absent (decommissioned/out-of-band) — surfaced, non-failing
  for (const relFile of MD_FILES) {
    if (isFrozenArchive(relFile)) continue; // FROZEN ARCHIVE — links not maintained
    // Point-in-time audit blueprint: IA-MOVE-MAP.md tabulates illustrative destination
    // paths (pointer-stub text meant for OTHER files' locations), so they don't resolve
    // from here. The folder is already orphan/leakage-exempt; skip its links too.
    if (relFile.startsWith('docs/_audit/repo-hygiene-2026-06-28/')) continue;
    const content = readFileSync(join(ROOT, relFile), 'utf8');
    for (const { line, target, path } of linksIn(relFile, content)) {
      const resolved = resolveLink(relFile, path);
      const absResolved = join(ROOT, resolved);
      if (!existsSync(absResolved)) {
        if (isKnownAbsent(resolved, path)) backlog.push({ file: relFile, line, target, resolved });
        else failures.push({ file: relFile, line, target, resolved });
      }
    }
  }
  return { failures, backlog };
}

// ---- Check B: orphans (BFS from CLAUDE.md + docs/README.md) ----------------

function checkOrphans() {
  const roots = ['CLAUDE.md', 'docs/README.md'].filter((r) => existsSync(join(ROOT, r)));
  const reached = new Set();
  const queue = [...roots];
  while (queue.length) {
    const cur = queue.shift();
    if (reached.has(cur)) continue;
    reached.add(cur);
    const abs = join(ROOT, cur);
    if (!existsSync(abs)) continue;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (!cur.endsWith('.md')) continue;
    const content = readFileSync(abs, 'utf8');
    for (const { path } of linksIn(cur, content)) {
      const resolved = resolveLink(cur, path);
      if (resolved.endsWith('.md') && existsSync(join(ROOT, resolved)) && !reached.has(resolved)) {
        queue.push(resolved);
      }
    }
  }
  // Orphans = docs/**.md that exist, are tracked, not reached, not allowlisted.
  const orphans = MD_FILES.filter(
    (rel) =>
      rel.startsWith('docs/') &&
      !reached.has(rel) &&
      !ORPHAN_ALLOWLIST.some((p) => rel.startsWith(p)),
  );
  return orphans;
}

// ---- Check C: live-fact leakage -------------------------------------------

function checkLeakage() {
  const failures = [];
  // Sweep all tracked text docs (md) plus the registry's sibling — but exempt the
  // registry + memory + the docs that legitimately quote the patterns.
  for (const relFile of MD_FILES) {
    if (EXCLUDED_FROM_LEAKAGE(relFile)) continue;
    const content = readFileSync(join(ROOT, relFile), 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const { re, why } of LEAKAGE_PATTERNS) {
        re.lastIndex = 0;
        const m = re.exec(lines[i]);
        if (m) {
          failures.push({ file: relFile, line: i + 1, match: m[0].trim(), why });
        }
      }
    }
  }
  return failures;
}

// ---- Report ----------------------------------------------------------------

function header(s) {
  if (!QUIET) process.stdout.write(`\n=== ${s} ===\n`);
}

let failed = false;
const summary = [];

if (wants('links')) {
  header('A. Broken relative links');
  const { failures: f, backlog } = checkLinks();
  if (f.length === 0) {
    if (!QUIET) console.log('OK — all relative links resolve.');
    summary.push({ check: 'links', status: 'PASS', count: 0 });
  } else {
    failed = true;
    for (const { file, line, target, resolved } of f) {
      console.log(`  ${file}:${line}  →  ${target}   (missing: ${resolved})`);
    }
    summary.push({ check: 'links', status: 'FAIL', count: f.length });
  }
  // Known-absent backlog: PRINTED but NON-FAILING (pre-existing rot into decommissioned /
  // out-of-band trees — see KNOWN_ABSENT_PREFIXES). Visible, not hidden, doesn't gate green.
  if (backlog.length) {
    if (!QUIET) {
      console.log(
        `\n  -- known-absent backlog (${backlog.length}, non-failing: decommissioned/out-of-band targets) --`,
      );
      for (const { file, line, target } of backlog) {
        console.log(`     ${file}:${line}  →  ${target}`);
      }
    }
    summary.push({ check: 'links-backlog', status: 'INFO', count: backlog.length });
  }
}

if (wants('orphans')) {
  header('B. Orphaned docs (unreachable from CLAUDE.md + docs/README.md)');
  const f = checkOrphans();
  if (f.length === 0) {
    if (!QUIET) console.log('OK — every docs/**.md is reachable.');
    summary.push({ check: 'orphans', status: 'PASS', count: 0 });
  } else {
    failed = true;
    for (const rel of f) console.log(`  ${rel}`);
    summary.push({ check: 'orphans', status: 'FAIL', count: f.length });
  }
}

if (wants('leakage')) {
  header('C. Live-fact leakage (volatile numbers outside the registry)');
  const f = checkLeakage();
  if (f.length === 0) {
    if (!QUIET) console.log('OK — no volatile live numbers embedded outside the registry.');
    summary.push({ check: 'leakage', status: 'PASS', count: 0 });
  } else {
    failed = true;
    for (const { file, line, match, why } of f) {
      console.log(`  ${file}:${line}  "${match}"  — ${why}`);
    }
    summary.push({ check: 'leakage', status: 'FAIL', count: f.length });
  }
}

console.log('\n================ DOC-LINKS SUMMARY ================');
for (const s of summary) {
  console.log(`  ${s.status.padEnd(4)}  ${s.check.padEnd(8)}  (${s.count} issue${s.count === 1 ? '' : 's'})`);
}
console.log(
  `\n${failed ? 'FAILED' : 'OK'} — scanned ${MD_FILES.length} tracked markdown file(s).`,
);
if (failed) {
  console.log(
    'Fix: repair broken links, link or allowlist orphaned docs, and move any embedded\n' +
      'live number into LIVE_FACTS.json + docs/architecture/live-environment.md (link the registry).',
  );
}
process.exit(failed ? 1 : 0);
