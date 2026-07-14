#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(scriptDirectory, "..");

function run(command, args, cwd = repository, { allowFailure = false, encoding = "utf8" } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding,
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    if (allowFailure) return encoding ? "" : Buffer.alloc(0);
    throw new Error(
      `${command} ${args.join(" ")} failed: ${String(result.stderr || result.stdout).trim()}`,
    );
  }
  return encoding ? result.stdout.trimEnd() : result.stdout;
}

function git(args, cwd = repository, options) {
  return run("git", args, cwd, options);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function safeName(path) {
  return `${basename(path).replace(/[^a-zA-Z0-9._-]+/g, "-")}-${createHash("sha256")
    .update(path)
    .digest("hex")
    .slice(0, 12)}`;
}

function worktreePaths() {
  return git(["worktree", "list", "--porcelain"])
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

function copyUntrackedFile(worktree, relativePath, destinationRoot) {
  const source = join(worktree, relativePath);
  if (!existsSync(source)) return { path: relativePath, missing: true };
  const stat = lstatSync(source);
  if (!stat.isFile()) return { path: relativePath, type: "directory" };
  const destination = join(destinationRoot, "files", relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return {
    path: relativePath,
    bytes: stat.size,
    sha256: sha256(destination),
    capsulePath: destination,
  };
}

function preserveWorktree(worktree, root) {
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"], worktree, {
    allowFailure: true,
  })
    .split(/\r?\n/)
    .filter(Boolean);
  if (!status.length) return null;

  const destination = join(root, "worktrees", safeName(worktree));
  mkdirSync(destination, { recursive: true });
  const untracked = status
    .filter((line) => line.startsWith("?? "))
    .map((line) => copyUntrackedFile(worktree, line.slice(3), destination));
  const patch = git(["diff", "--binary", "--no-ext-diff", "HEAD"], worktree, {
    allowFailure: true,
  });
  let trackedPatch = null;
  if (patch) {
    const patchPath = join(destination, "tracked.patch");
    writeFileSync(patchPath, `${patch}\n`);
    trackedPatch = {
      capsulePath: patchPath,
      bytes: lstatSync(patchPath).size,
      sha256: sha256(patchPath),
    };
  }
  const record = {
    worktree,
    head: git(["rev-parse", "HEAD"], worktree, { allowFailure: true }),
    branch: git(["symbolic-ref", "--short", "-q", "HEAD"], worktree, {
      allowFailure: true,
    }),
    status,
    untracked,
    trackedPatch,
  };
  writeFileSync(join(destination, "metadata.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function stashFiles(ref) {
  return git(["stash", "show", "--name-only", "--include-untracked", ref], repository, {
    allowFailure: true,
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

function extractStashFile(ref, path) {
  for (const revision of [`${ref}^3:${path}`, `${ref}:${path}`]) {
    const result = spawnSync("git", ["show", revision], {
      cwd: repository,
      encoding: null,
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    });
    if (result.status === 0) return result.stdout;
  }
  throw new Error(`could not extract ${path} from ${ref}`);
}

function preserveStashes(root) {
  const list = git(["stash", "list", "--format=%gd%x09%H%x09%P%x09%aI%x09%gs"]);
  if (!list) return [];
  return list.split(/\r?\n/).map((line) => {
    const [ref, sha, parents, authoredAt, subject] = line.split("\t");
    const destination = join(root, "stashes", safeName(ref));
    const files = stashFiles(ref).map((path) => {
      const output = join(destination, "files", path);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, extractStashFile(ref, path));
      return {
        path,
        capsulePath: output,
        bytes: lstatSync(output).size,
        sha256: sha256(output),
      };
    });
    const record = {
      ref,
      sha,
      parents: parents.split(" ").filter(Boolean),
      authoredAt,
      subject,
      files,
    };
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, "metadata.json"), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  });
}

function allPreservedFiles(records, stashes) {
  const files = [];
  for (const record of records) {
    if (record.trackedPatch) files.push(record.trackedPatch);
    files.push(...record.untracked.filter((file) => file.capsulePath));
  }
  for (const stash of stashes) files.push(...stash.files);
  return files;
}

const capsuleArg = argument("--capsule-dir");
if (!capsuleArg) {
  throw new Error("Usage: node scripts/plan-005-preserve-dirty.mjs --capsule-dir <absolute-path>");
}
const capsuleDirectory = isAbsolute(capsuleArg)
  ? capsuleArg
  : resolve(repository, capsuleArg);
if (!existsSync(join(capsuleDirectory, "capsule-manifest.json"))) {
  throw new Error("capsule-manifest.json is missing; create and verify the Git recovery capsule first");
}

const dirtyRoot = join(capsuleDirectory, "dirty-state");
mkdirSync(dirtyRoot, { recursive: true });
const worktrees = worktreePaths().map((path) => preserveWorktree(path, dirtyRoot)).filter(Boolean);
const stashes = preserveStashes(dirtyRoot);
const files = allPreservedFiles(worktrees, stashes).sort((left, right) =>
  left.capsulePath.localeCompare(right.capsulePath),
);
writeFileSync(
  join(dirtyRoot, "SHA256SUMS"),
  `${files
    .map((file) => `${file.sha256}  ${file.capsulePath.slice(dirtyRoot.length + 1).replaceAll("\\", "/")}`)
    .join("\n")}\n`,
);
const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  repository,
  worktreeCount: worktrees.length,
  stashCount: stashes.length,
  preservedFileCount: files.length,
  worktrees,
  stashes,
};
writeFileSync(join(dirtyRoot, "dirty-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

process.stdout.write(
  `${JSON.stringify(
    {
      dirtyRoot,
      worktreeCount: worktrees.length,
      stashCount: stashes.length,
      preservedFileCount: files.length,
    },
    null,
    2,
  )}\n`,
);
