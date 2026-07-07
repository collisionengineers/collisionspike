#!/usr/bin/env node
/*
 * ticket-move.mjs — sanctioned ticket status transition and one-time migration.
 *
 * Usage:
 *   node scripts/ticket-move.mjs TKT-108 done
 *   node scripts/ticket-move.mjs TKT-108 done --dry-run
 *   node scripts/ticket-move.mjs --migrate [--dry-run]
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep, posix } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TICKET_DIR = join(ROOT, "docs", "tickets");
const STATUSES = ["backlog", "now", "next", "verify", "done", "blocked"];
const STATUS_ORDER = ["now", "verify", "done", "next", "backlog", "blocked"];
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const MIGRATE = args.includes("--migrate");
const POSITIONAL = args.filter((a) => !a.startsWith("--"));

function toPosix(p) {
  return p.split(sep).join("/");
}
function fromRoot(abs) {
  return toPosix(relative(ROOT, abs));
}
function repoAbs(repoRel) {
  return join(ROOT, ...repoRel.split("/"));
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
function setStatus(raw, status) {
  if (!raw.startsWith("---")) throw new Error("missing frontmatter");
  const end = raw.indexOf("\n---", 3);
  const head = raw.slice(0, end);
  const tail = raw.slice(end);
  if (/^status:\s*.*$/m.test(head))
    return head.replace(/^status:\s*.*$/m, `status: ${status}`) + tail;
  return head + `\nstatus: ${status}` + tail;
}
function discoverTickets() {
  const out = [];
  const dirs = [];
  for (const entry of readdirSync(TICKET_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && /^TKT-\d{3}-/.test(entry.name))
      dirs.push({
        statusDir: null,
        dirName: entry.name,
        abs: join(TICKET_DIR, entry.name),
      });
  }
  for (const status of STATUSES) {
    const sd = join(TICKET_DIR, status);
    if (!existsSync(sd)) continue;
    for (const entry of readdirSync(sd, { withFileTypes: true })) {
      if (entry.isDirectory() && /^TKT-\d{3}-/.test(entry.name))
        dirs.push({
          statusDir: status,
          dirName: entry.name,
          abs: join(sd, entry.name),
        });
    }
  }
  for (const d of dirs) {
    const spec = join(d.abs, `${d.dirName}.md`);
    if (!existsSync(spec)) continue;
    const fm = parseFrontmatter(readFileSync(spec, "utf8")) || {};
    out.push({
      ...d,
      id: fm.id || d.dirName.slice(0, 7),
      status: fm.status,
      spec,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
function gitLsFiles() {
  const res = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr || "git ls-files failed");
  return res.stdout.split(/\r?\n/).filter(Boolean);
}
function ensureStatusDirs() {
  for (const status of STATUSES) {
    const dir = join(TICKET_DIR, status);
    if (!DRY && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
function movePath(oldRel, newRel) {
  if (oldRel === newRel) return;
  if (DRY) return;
  mkdirSync(dirname(repoAbs(newRel)), { recursive: true });
  const git = spawnSync("git", ["mv", oldRel, newRel], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (git.status !== 0) {
    renameSync(repoAbs(oldRel), repoAbs(newRel));
  }
}
function rewriteSpecStatus(specRel, status) {
  const abs = repoAbs(specRel);
  const raw = readFileSync(abs, "utf8");
  const next = setStatus(raw, status);
  if (next !== raw && !DRY) writeFileSync(abs, next);
}
function isExternal(url) {
  return /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(url) || url.startsWith("//");
}
function splitUrl(url) {
  const hashAt = url.indexOf("#");
  const queryAt = url.indexOf("?");
  const cut = [hashAt, queryAt].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  if (cut == null) return { path: url, suffix: "" };
  return { path: url.slice(0, cut), suffix: url.slice(cut) };
}
function normalizeRepoPath(p) {
  const normalized = posix.normalize(p).replace(/^\.\//, "");
  return normalized === "." ? "" : normalized;
}
function mapRepoPath(repoPath, moveMap) {
  let best = null;
  for (const [oldPrefix, newPrefix] of moveMap) {
    if (repoPath === oldPrefix || repoPath.startsWith(`${oldPrefix}/`)) {
      if (!best || oldPrefix.length > best[0].length)
        best = [oldPrefix, newPrefix];
    }
  }
  if (!best) return repoPath;
  return best[1] + repoPath.slice(best[0].length);
}
function sourcePathFor(finalRel, reverseMoveMap) {
  return mapRepoPath(finalRel, reverseMoveMap);
}
function relativeUrl(fromFileRepoRel, targetRepoRel) {
  let rel = posix.relative(posix.dirname(fromFileRepoRel), targetRepoRel);
  if (!rel) rel = posix.basename(targetRepoRel);
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}
function rewriteMarkdown(raw, finalRel, moveMap, reverseMoveMap) {
  const oldSourceRel = sourcePathFor(finalRel, reverseMoveMap);
  const rewriteOne = (url) => {
    if (!url || isExternal(url)) return url;
    const { path, suffix } = splitUrl(url);
    if (!path || isExternal(path)) return url;
    let oldTarget;
    if (path.startsWith("/")) oldTarget = normalizeRepoPath(path.slice(1));
    else
      oldTarget = normalizeRepoPath(
        posix.join(posix.dirname(oldSourceRel), path),
      );
    const newTarget = mapRepoPath(oldTarget, moveMap);
    if (newTarget === oldTarget && oldSourceRel === finalRel) return url;
    return relativeUrl(finalRel, newTarget) + suffix;
  };

  const lines = raw.split("\n");
  let fenced = false;
  return lines
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      let out = line.replace(
        /(!?\[[^\]\n]*\]\()([^)<\s]+)(\))/g,
        (_m, a, url, c) => a + rewriteOne(url) + c,
      );
      out = out.replace(
        /(<)(\.\.?\/[^>\s]+)(>)/g,
        (_m, a, url, c) => a + rewriteOne(url) + c,
      );
      out = out.replace(
        /^(research-link:\s*)(docs\/tickets\/[^\s#]+)(.*)$/m,
        (_m, a, p, c) => a + mapRepoPath(p, moveMap) + c,
      );
      return out;
    })
    .join("\n");
}
function rewriteManifest(raw, moveMap) {
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return raw;
  }
  let changed = false;
  for (const item of manifest.items || []) {
    if (
      typeof item.file === "string" &&
      item.file.startsWith("docs/tickets/")
    ) {
      const next = mapRepoPath(item.file, moveMap);
      if (next !== item.file) {
        item.file = next;
        changed = true;
      }
    }
  }
  return changed ? `${JSON.stringify(manifest, null, 2)}\n` : raw;
}
function rewriteLinks(moveMap) {
  const reverse = new Map(
    [...moveMap.entries()].map(([oldPath, newPath]) => [newPath, oldPath]),
  );
  const files = gitLsFiles()
    .filter(
      (p) => p.endsWith(".md") || p === "scripts/eval-email/manifest.json",
    )
    .concat(
      ["docs/tickets/ai-mcp-hardening-plan.md"].filter((p) =>
        existsSync(repoAbs(p)),
      ),
    );
  const finalFiles = new Set(files.map((p) => mapRepoPath(p, moveMap)));
  for (const finalRel of [...finalFiles].sort()) {
    const abs = repoAbs(finalRel);
    if (!existsSync(abs)) continue;
    const raw = readFileSync(abs, "utf8");
    const next =
      finalRel === "scripts/eval-email/manifest.json"
        ? rewriteManifest(raw, moveMap)
        : rewriteMarkdown(raw, finalRel, moveMap, reverse);
    if (next !== raw && !DRY) writeFileSync(abs, next);
  }
}
function boardSectionFor(status) {
  return new RegExp(
    `^##\\s+${status[0].toUpperCase()}${status.slice(1)}\\b`,
    "i",
  );
}
function rewriteBoard(moveMap, ticketStatuses) {
  const boardRel = "docs/tickets/BOARD.md";
  const abs = repoAbs(boardRel);
  if (!existsSync(abs)) return;
  let raw = readFileSync(abs, "utf8");
  raw = rewriteMarkdown(
    raw,
    boardRel,
    moveMap,
    new Map([...moveMap.entries()].map(([a, b]) => [b, a])),
  );
  const lines = raw.split("\n");
  const preamble = [];
  const sections = new Map(STATUS_ORDER.map((s) => [s, []]));
  const sectionHeaders = new Map();
  let current = null;
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = null;
      for (const status of STATUS_ORDER)
        if (boardSectionFor(status).test(line)) current = status;
      if (current) sectionHeaders.set(current, line);
      else preamble.push(line);
      continue;
    }
    if (!current) {
      preamble.push(line);
      continue;
    }
    const row = line.match(/^\|\s*\[?(TKT-\d{3})\]?\(/);
    if (row) {
      const status = ticketStatuses.get(row[1]) || current;
      if (!sections.has(status)) sections.set(status, []);
      sections.get(status).push(line);
    }
  }
  const tableHeader = ["| ID | Title | State |", "|---|---|---|"];
  const output =
    preamble.join("\n").replace(/\n*$/, "") +
    "\n\n" +
    STATUS_ORDER.map((status) => {
      const title =
        sectionHeaders.get(status) ||
        (status === "verify"
          ? "## Verify — deployed / code-complete, awaiting live proof"
          : `## ${status[0].toUpperCase()}${status.slice(1)}`);
      const rows = sections.get(status) || [];
      return [title, "", ...tableHeader, ...rows].join("\n");
    }).join("\n\n") +
    "\n";
  if (!DRY) writeFileSync(abs, output);
}

function usage(exitCode = 1) {
  console.log(
    "Usage: node scripts/ticket-move.mjs TKT-NNN <backlog|now|next|verify|done|blocked> [--dry-run]",
  );
  console.log("       node scripts/ticket-move.mjs --migrate [--dry-run]");
  process.exit(exitCode);
}

if (!MIGRATE && POSITIONAL.length !== 2) usage();
if (MIGRATE && POSITIONAL.length) usage();
if (!MIGRATE && !STATUSES.includes(POSITIONAL[1])) usage();

ensureStatusDirs();
const tickets = discoverTickets();
const moves = [];
if (MIGRATE) {
  for (const t of tickets) {
    if (!STATUSES.includes(t.status))
      throw new Error(`${t.id}: invalid/missing status ${t.status}`);
    const oldRel = fromRoot(t.abs);
    const newRel = `docs/tickets/${t.status}/${t.dirName}`;
    moves.push({ ...t, oldRel, newRel, newStatus: t.status });
  }
} else {
  const [id, newStatus] = POSITIONAL;
  const t = tickets.find((x) => x.id === id);
  if (!t) {
    console.error(`ticket-move: ticket not found: ${id}`);
    process.exit(1);
  }
  const oldRel = fromRoot(t.abs);
  const newRel = `docs/tickets/${newStatus}/${t.dirName}`;
  moves.push({ ...t, oldRel, newRel, newStatus });
}

const moveMap = new Map();
const ticketStatuses = new Map(tickets.map((t) => [t.id, t.status]));
for (const m of moves) {
  moveMap.set(m.oldRel, m.newRel);
  ticketStatuses.set(m.id, m.newStatus);
}

console.log(DRY ? "ticket-move dry-run:" : "ticket-move:");
for (const m of moves) console.log(`  ${m.id}: ${m.oldRel} -> ${m.newRel}`);

// Move folders first, then update content at final locations.
for (const m of moves) movePath(m.oldRel, m.newRel);
if (!DRY) {
  for (const m of moves)
    rewriteSpecStatus(`${m.newRel}/${m.dirName}.md`, m.newStatus);
  rewriteLinks(moveMap);
  rewriteBoard(moveMap, ticketStatuses);
}

console.log(
  DRY
    ? "DRY RUN complete; no files changed."
    : "Done. Run node scripts/check-tickets.mjs and node scripts/check-doc-links.mjs.",
);
