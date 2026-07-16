#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import {
  LIFECYCLE_STATUSES,
  ROOT,
  TICKET_DIR,
  discoverTickets,
  parseFrontmatter,
  replaceFrontmatterField,
} from "./ticket-system.mjs";

const arguments_ = process.argv.slice(2);
const dryRun = arguments_.includes("--dry-run");
const migrate = arguments_.includes("--migrate");
const force = arguments_.includes("--force");
const positional = arguments_.filter((value) => !value.startsWith("--"));

const transitions = new Map([
  ["backlog", ["now", "next"]],
  ["next", ["now"]],
  ["now", ["verify", "done", "blocked"]],
  ["verify", ["done", "blocked"]],
  ["blocked", ["now"]],
  ["done", ["now"]],
]);

function usage(exitCode = 1) {
  console.log(
    "Usage: node scripts/maintenance/ticket-move.mjs TKT-NNN <backlog|now|next|verify|done|blocked> [--dry-run] [--force]",
  );
  console.log("       node scripts/maintenance/ticket-move.mjs --migrate [--dry-run]");
  process.exit(exitCode);
}

function toPosix(value) {
  return value.split(sep).join("/");
}

function absolute(repositoryPath) {
  return join(ROOT, ...repositoryPath.split("/"));
}

function repositoryPath(value) {
  return toPosix(relative(ROOT, value));
}

function run(command, commandArguments) {
  const result = spawnSync(command, commandArguments, {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${commandArguments.join(" ")} failed${details ? `:\n${details}` : ""}`);
  }
  return result.stdout.trim();
}

function assertTransition(ticket, targetStatus) {
  const allowed = transitions.get(ticket.status) ?? [];
  if (allowed.includes(targetStatus)) return;
  if (force) {
    console.warn(
      `ticket-move: WARNING: --force bypasses ${ticket.frontmatter.id} ${ticket.status} -> ${targetStatus}; ` +
        `normally allowed: ${allowed.join(", ") || "none"}.`,
    );
    return;
  }
  throw new Error(
    `${ticket.frontmatter.id}: ${ticket.status} -> ${targetStatus} is outside the lifecycle graph ` +
      `(allowed: ${allowed.join(", ") || "none"})`,
  );
}

function assertArtifacts(ticket, targetStatus) {
  if (["now", "verify", "done"].includes(targetStatus)) {
    const changes = join(ticket.directory, "changes.md");
    if (!existsSync(changes)) {
      throw new Error(`${ticket.frontmatter.id}: ${targetStatus} requires ${repositoryPath(changes)}`);
    }
  }
  if (["verify", "done"].includes(targetStatus)) {
    const verification = join(ticket.directory, "verification.md");
    if (!existsSync(verification)) {
      throw new Error(
        `${ticket.frontmatter.id}: ${targetStatus} requires ${repositoryPath(verification)}`,
      );
    }
  }
}

function splitUrl(url) {
  const cut = [url.indexOf("?"), url.indexOf("#")]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return cut === undefined
    ? { path: url, suffix: "" }
    : { path: url.slice(0, cut), suffix: url.slice(cut) };
}

function isExternal(url) {
  return /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url);
}

function normalizeRepositoryPath(value) {
  const normalized = posix.normalize(value).replace(/^\.\//, "");
  return normalized === "." ? "" : normalized;
}

function mapRepositoryPath(value, moveMap) {
  let match;
  for (const [oldPrefix, newPrefix] of moveMap) {
    if (value !== oldPrefix && !value.startsWith(`${oldPrefix}/`)) continue;
    if (!match || oldPrefix.length > match[0].length) match = [oldPrefix, newPrefix];
  }
  if (!match) return value;
  return match[1] + value.slice(match[0].length);
}

function relativeUrl(fromFile, target) {
  let value = posix.relative(posix.dirname(fromFile), target);
  if (!value) value = posix.basename(target);
  return value.startsWith(".") ? value : `./${value}`;
}

function rewriteMarkdown(raw, sourceFile, finalFile, moveMap) {
  const rewriteUrl = (url) => {
    if (!url || isExternal(url)) return url;
    const { path, suffix } = splitUrl(url);
    if (!path || isExternal(path)) return url;
    const oldTarget = path.startsWith("/")
      ? normalizeRepositoryPath(path.slice(1))
      : normalizeRepositoryPath(posix.join(posix.dirname(sourceFile), path));
    const newTarget = mapRepositoryPath(oldTarget, moveMap);
    if (newTarget === oldTarget && sourceFile === finalFile) return url;
    return `${relativeUrl(finalFile, newTarget)}${suffix}`;
  };

  let fenced = false;
  return raw
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      let next = line.replace(
        /(!?\[[^\]\n]*\]\()([^)<\s]+)(\))/g,
        (_whole, before, url, after) => `${before}${rewriteUrl(url)}${after}`,
      );
      next = next.replace(
        /(<)(\.\.?\/[^>\s]+)(>)/g,
        (_whole, before, url, after) => `${before}${rewriteUrl(url)}${after}`,
      );
      next = next.replace(
        /^(research-link:\s*)(docs\/tickets\/[^\s#]+)(.*)$/,
        (_whole, before, value, after) =>
          `${before}${mapRepositoryPath(value, moveMap)}${after}`,
      );
      return next;
    })
    .join("\n");
}

function trackedMarkdown() {
  const output = run("git", ["ls-files", "-z", "--", "*.md"]);
  return output ? output.split("\0").filter(Boolean) : [];
}

function ticketMarkdown(directory = TICKET_DIR) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const value = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...ticketMarkdown(value));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(repositoryPath(value));
  }
  return files;
}

function linkFiles() {
  return [...new Set([...trackedMarkdown(), ...ticketMarkdown()])].sort();
}

function snapshot(paths) {
  const result = new Map();
  for (const path of paths) {
    const value = absolute(path);
    result.set(path, existsSync(value) ? readFileSync(value, "utf8") : null);
  }
  return result;
}

function restore(files) {
  for (const [path, raw] of files) {
    const value = absolute(path);
    if (raw === null) {
      if (existsSync(value)) rmSync(value, { force: true });
      continue;
    }
    mkdirSync(dirname(value), { recursive: true });
    writeFileSync(value, raw);
  }
}

function moveDirectory(source, target) {
  const sourceAbsolute = absolute(source);
  const targetAbsolute = absolute(target);
  if (source === target) return;
  if (!existsSync(sourceAbsolute)) throw new Error(`source does not exist: ${source}`);
  if (existsSync(targetAbsolute)) throw new Error(`target already exists: ${target}`);
  mkdirSync(dirname(targetAbsolute), { recursive: true });
  renameSync(sourceAbsolute, targetAbsolute);
}

function rollBack(completedMoves, files) {
  const errors = [];
  for (const move of [...completedMoves].reverse()) {
    try {
      if (existsSync(absolute(move.target)) && !existsSync(absolute(move.source))) {
        moveDirectory(move.target, move.source);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
  try {
    restore(files);
  } catch (error) {
    errors.push(error.message);
  }
  if (errors.length) {
    throw new Error(`rollback was incomplete:\n${errors.join("\n")}`);
  }
}

function generatedFiles() {
  return [
    "docs/tickets/BOARD.md",
    "docs/tickets/README.md",
    "docs/operations/operator-actions.md",
    ...readdirSync(join(TICKET_DIR, "plans"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => `docs/tickets/plans/${entry.name}`),
  ];
}

function writeLinkUpdates(files, moveMap) {
  for (const sourceFile of files) {
    const finalFile = mapRepositoryPath(sourceFile, moveMap);
    const finalAbsolute = absolute(finalFile);
    if (!existsSync(finalAbsolute)) continue;
    const raw = readFileSync(finalAbsolute, "utf8");
    const next = rewriteMarkdown(raw, sourceFile, finalFile, moveMap);
    if (next !== raw) writeFileSync(finalAbsolute, next);
  }
}

if (migrate ? positional.length !== 0 : positional.length !== 2) usage();
if (!migrate && !LIFECYCLE_STATUSES.includes(positional[1])) usage();

const discovery = discoverTickets();
if (discovery.directoryIssues.length && !migrate) {
  throw new Error(discovery.directoryIssues.join("\n"));
}

const moves = [];
if (migrate) {
  for (const ticket of discovery.tickets) {
    const status = ticket.frontmatter?.status;
    if (!LIFECYCLE_STATUSES.includes(status)) {
      throw new Error(`${ticket.relativeSpec}: invalid status ${status || "(missing)"}`);
    }
    assertArtifacts(ticket, status);
    const source = repositoryPath(ticket.directory);
    const target = `docs/tickets/${status}/${ticket.directoryName}`;
    if (source !== target) moves.push({ ticket, source, target, targetStatus: status });
  }
} else {
  const [id, targetStatus] = positional;
  const ticket = discovery.tickets.find((candidate) => candidate.frontmatter?.id === id);
  if (!ticket) throw new Error(`ticket not found: ${id}`);
  if (ticket.frontmatter.status !== ticket.status) {
    throw new Error(
      `${ticket.relativeSpec}: frontmatter status ${ticket.frontmatter.status} differs from folder ${ticket.status}`,
    );
  }
  assertTransition(ticket, targetStatus);
  assertArtifacts(ticket, targetStatus);
  const source = repositoryPath(ticket.directory);
  const target = `docs/tickets/${targetStatus}/${ticket.directoryName}`;
  if (source !== target) moves.push({ ticket, source, target, targetStatus });
}

console.log(dryRun ? "ticket-move dry-run:" : "ticket-move:");
if (!moves.length) console.log("  no directory moves required");
for (const move of moves) {
  console.log(`  ${move.ticket.frontmatter.id}: ${move.source} -> ${move.target}`);
}
if (dryRun) {
  console.log("DRY RUN complete; no files changed.");
  process.exit(0);
}

const moveMap = new Map(moves.map((move) => [move.source, move.target]));
const markdownFiles = linkFiles();
const filesToRestore = [...new Set([...markdownFiles, ...generatedFiles()])];
const files = snapshot(filesToRestore);
const completedMoves = [];

try {
  for (const move of moves) {
    moveDirectory(move.source, move.target);
    completedMoves.push(move);
    const spec = join(absolute(move.target), `${move.ticket.directoryName}.md`);
    const raw = readFileSync(spec, "utf8");
    const frontmatter = parseFrontmatter(raw);
    if (!frontmatter) throw new Error(`${repositoryPath(spec)}: missing frontmatter`);
    const next = replaceFrontmatterField(raw, "status", move.targetStatus);
    if (next !== raw) writeFileSync(spec, next);
  }

  writeLinkUpdates(markdownFiles, moveMap);
  run(process.execPath, ["scripts/maintenance/ticket-generate.mjs"]);
  run(process.execPath, ["scripts/checks/check-tickets.mjs"]);
} catch (error) {
  try {
    rollBack(completedMoves, files);
  } catch (rollbackError) {
    throw new Error(`${error.message}\n${rollbackError.message}`);
  }
  throw new Error(`${error.message}\nAll ticket moves and generated-file writes were rolled back.`);
}

console.log("Done. Ticket links, board, index, and plan progress are in parity.");
