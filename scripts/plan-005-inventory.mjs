#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(scriptDirectory, "..");

function run(command, args, cwd = repository, { allowFailure = false } = {}) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    }).trimEnd();
  } catch (error) {
    if (allowFailure) return "";
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
}

function git(args, cwd = repository, options) {
  return run("git", args, cwd, options);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseRefLines() {
  const format = [
    "%(refname)",
    "%(objectname)",
    "%(upstream:short)",
    "%(upstream:track)",
  ].join("%09");
  return git([
    "for-each-ref",
    `--format=${format}`,
    "refs/heads",
    "refs/remotes/origin",
  ])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [ref, sha, upstream = "", tracking = ""] = line.split("\t");
      return { ref, sha, upstream, tracking };
    });
}

function parseWorktreeBlocks() {
  const text = git(["worktree", "list", "--porcelain"]);
  return text
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((block) => {
      const record = {};
      for (const line of block.split(/\r?\n/)) {
        const [key, ...rest] = line.split(" ");
        record[key] = rest.length ? rest.join(" ") : true;
      }
      return record;
    });
}

function intendedDisposition({ branch, detached, path, dirty }) {
  const shortBranch = branch?.replace(/^refs\/heads\//, "") ?? "";
  if (shortBranch === "main") {
    return "retain as the sole canonical worktree; fast-forward to origin/main";
  }
  if ([
    "codex/guided-capture-server",
    "codex/tkt-034-archive-adoption",
    "codex/tkt-154-mcp-image-ingestion",
    "codex/tkt-160-delete-case-image",
  ].includes(shortBranch)) {
    return "retain until its open implementation PR is rebuilt, integrated, verified, and closed";
  }
  if ([
    "codex/tkt-150-claimant-extraction",
    "codex/tkt-150-live-proof",
    "codex/tkt-150-live-remediation",
  ].includes(shortBranch)) {
    return "retain until TKT-150 is semantically consolidated onto current main";
  }
  if (shortBranch) {
    return "remove after recovery-bundle proof and semantic/ancestry disposition is recorded";
  }
  if (detached && dirty && /deploy/i.test(path)) {
    return "preserve useful evidence and tracked diff first; then remove after recovery-bundle proof";
  }
  if (detached && dirty) {
    return "archive dirty artifact in the recovery capsule; then remove after semantic review";
  }
  if (detached) {
    return "remove after recovery-bundle proof and detached-head disposition is recorded";
  }
  return "pending semantic audit";
}

function inventoryWorktree(raw) {
  const path = raw.worktree;
  const exists = existsSync(path);
  if (!exists) {
    return {
      path,
      exists: false,
      head: raw.HEAD ?? "",
      branch: raw.branch ?? "",
      detached: Boolean(raw.detached),
      dirty: false,
      status: [],
      intendedDisposition: "prune missing worktree metadata after recovery-bundle proof",
    };
  }

  const status = git(["status", "--porcelain=v1", "--untracked-files=all"], path, {
    allowFailure: true,
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const untrackedArtifacts = status
    .filter((line) => line.startsWith("?? "))
    .map((line) => {
      const relativePath = line.slice(3);
      const absolutePath = join(path, relativePath);
      if (!existsSync(absolutePath)) return { path: relativePath, missing: true };
      const stat = lstatSync(absolutePath);
      if (!stat.isFile()) return { path: relativePath, type: "directory" };
      return {
        path: relativePath,
        bytes: stat.size,
        sha256: sha256File(absolutePath),
      };
    });
  const trackedDiff = git(["diff", "--binary", "--no-ext-diff", "HEAD"], path, {
    allowFailure: true,
  });
  const branch = raw.branch ?? "";
  const detached = Boolean(raw.detached);
  const dirty = status.length > 0;

  return {
    path,
    exists,
    head: git(["rev-parse", "HEAD"], path, { allowFailure: true }) || raw.HEAD || "",
    branch,
    detached,
    locked: raw.locked ?? false,
    prunable: raw.prunable ?? false,
    dirty,
    status,
    trackedDiffSha256: trackedDiff ? sha256Text(trackedDiff) : null,
    untrackedArtifacts,
    intendedDisposition: intendedDisposition({ branch, detached, path, dirty }),
  };
}

function parseStashes() {
  const list = git([
    "stash",
    "list",
    "--format=%gd%x09%H%x09%P%x09%aI%x09%an%x09%gs",
  ]);
  if (!list) return [];
  return list.split(/\r?\n/).map((line) => {
    const [ref, sha, parents, authoredAt, author, subject] = line.split("\t");
    const files = git(["stash", "show", "--name-status", "--include-untracked", ref], repository, {
      allowFailure: true,
    })
      .split(/\r?\n/)
      .filter(Boolean);
    return {
      ref,
      sha,
      parents: parents.split(" ").filter(Boolean),
      authoredAt,
      author,
      subject,
      files,
      intendedDisposition:
        "retain in recovery bundle; compare with current migrations/runbooks; drop only after proof",
    };
  });
}

function pullRequests() {
  const fields = [
    "number",
    "state",
    "title",
    "headRefName",
    "headRefOid",
    "baseRefName",
    "mergeCommit",
    "mergedAt",
    "closedAt",
    "isDraft",
    "url",
    "reviewDecision",
    "mergeable",
    "mergeStateStatus",
  ].join(",");
  const output = run("gh", [
    "pr",
    "list",
    "--state",
    "all",
    "--limit",
    "250",
    "--json",
    fields,
  ]);
  return JSON.parse(output).sort((left, right) => left.number - right.number);
}

const refs = parseRefLines();
const worktrees = parseWorktreeBlocks().map(inventoryWorktree);
const prs = pullRequests();
const inventory = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repository,
  remoteUrl: git(["remote", "get-url", "origin"]),
  originMain: git(["rev-parse", "origin/main"]),
  currentHead: git(["rev-parse", "HEAD"]),
  currentBranch: git(["symbolic-ref", "--short", "-q", "HEAD"], repository, {
    allowFailure: true,
  }),
  summary: {
    localBranches: refs.filter((ref) => ref.ref.startsWith("refs/heads/")).length,
    remoteBranches: refs.filter(
      (ref) => ref.ref.startsWith("refs/remotes/origin/") && ref.ref !== "refs/remotes/origin/HEAD",
    ).length,
    worktrees: worktrees.length,
    detachedWorktrees: worktrees.filter((worktree) => worktree.detached).length,
    dirtyWorktrees: worktrees.filter((worktree) => worktree.dirty).length,
    openPullRequests: prs.filter((pr) => pr.state === "OPEN").length,
    totalPullRequests: prs.length,
  },
  refs,
  worktrees,
  stashes: parseStashes(),
  pullRequests: prs,
};

const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) {
  const requested = process.argv[outputIndex + 1];
  if (!requested) throw new Error("--output requires a path");
  const outputPath = isAbsolute(requested) ? requested : resolve(repository, requested);
  writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);
  process.stdout.write(`${outputPath}\n`);
} else {
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
}
