#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(scriptDirectory, "..");

function run(command, args, cwd = repository, { allowFailure = false } = {}) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    }).trimEnd();
  } catch (error) {
    if (allowFailure) return "";
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
}

function git(args, options) {
  return run("git", args, repository, options);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function existingArchiveRefs(prefix) {
  const output = git(["for-each-ref", "--format=%(refname)%09%(objectname)", prefix]);
  if (!output) return [];
  return output.split(/\r?\n/).map((line) => {
    const [ref, sha] = line.split("\t");
    return { ref, sha };
  });
}

function unreachableCommits() {
  const result = spawnSync(
    "git",
    ["fsck", "--full", "--unreachable", "--no-reflogs"],
    {
      cwd: repository,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    throw new Error(`git fsck failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((line) => /^unreachable commit ([0-9a-f]{40})$/.exec(line)?.[1])
    .filter(Boolean)
    .sort();
}

function deriveTips(commits) {
  const unreachable = new Set(commits);
  const parents = new Set();
  for (const commit of commits) {
    for (const parent of git(["show", "-s", "--format=%P", commit]).split(" ").filter(Boolean)) {
      if (unreachable.has(parent)) parents.add(parent);
    }
  }
  return commits.filter((commit) => !parents.has(commit)).sort();
}

function proveCoverage(commits, tips) {
  const reachable = new Set(
    git(["rev-list", ...tips])
      .split(/\r?\n/)
      .filter(Boolean),
  );
  const missing = commits.filter((commit) => !reachable.has(commit));
  if (missing.length) {
    throw new Error(`archival tips do not cover ${missing.length} unreachable commits`);
  }
}

function listRequiredRefs() {
  const output = git([
    "for-each-ref",
    "--format=%(refname)%09%(objectname)",
    "refs/heads",
    "refs/remotes",
    "refs/tags",
    "refs/stash",
    "refs/archive/plan-005",
  ]);
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [ref, sha] = line.split("\t");
      return { ref, sha };
    });
}

const capsuleArg = argument("--capsule-dir");
if (!capsuleArg) {
  throw new Error("Usage: node scripts/plan-005-recovery.mjs --capsule-dir <absolute-path>");
}
const capsuleDirectory = isAbsolute(capsuleArg)
  ? capsuleArg
  : resolve(repository, capsuleArg);
if (capsuleDirectory.startsWith(`${repository}\\`) || capsuleDirectory === repository) {
  throw new Error("The recovery capsule must be outside the repository");
}
mkdirSync(capsuleDirectory, { recursive: true });

const archivePrefix = "refs/archive/plan-005/20260713";
let commits = unreachableCommits();
let tips = deriveTips(commits);
const existing = existingArchiveRefs(archivePrefix);

if (existing.length) {
  const existingShas = existing.map((entry) => entry.sha).sort();
  if (commits.length !== 0) {
    throw new Error(
      `${archivePrefix} exists but additional unreachable commits were found; audit before rerunning`,
    );
  }
  tips = existingShas;
  const exclusionRefs = git([
    "for-each-ref",
    "--format=%(refname)",
    "refs/heads",
    "refs/remotes",
    "refs/tags",
    "refs/stash",
  ])
    .split(/\r?\n/)
    .filter(Boolean);
  commits = git(["rev-list", ...tips, "--not", ...exclusionRefs])
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
} else {
  if (commits.length !== 305 || tips.length !== 69) {
    throw new Error(
      `expected PLAN-005's 305 unreachable commits/69 tips, found ${commits.length}/${tips.length}`,
    );
  }
  proveCoverage(commits, tips);
  tips.forEach((sha, index) => {
    const ref = `${archivePrefix}/tip-${String(index + 1).padStart(3, "0")}`;
    git(["update-ref", ref, sha, "0000000000000000000000000000000000000000"]);
  });
}

const anchored = existingArchiveRefs(archivePrefix).sort((left, right) =>
  left.ref.localeCompare(right.ref),
);
if (anchored.length !== 69) {
  throw new Error(`expected 69 archival refs, found ${anchored.length}`);
}

const commitRows = commits.map((sha) => {
  const [authoredAt, subject] = git(["show", "-s", "--format=%aI%x09%s", sha]).split("\t");
  return { sha, authoredAt, subject };
});
const tipRows = anchored.map(({ ref, sha }) => {
  const [authoredAt, subject] = git(["show", "-s", "--format=%aI%x09%s", sha]).split("\t");
  return { ref, sha, authoredAt, subject };
});

writeFileSync(
  resolve(capsuleDirectory, "unreachable-commits.tsv"),
  `sha\tauthored_at\tsubject\n${commitRows
    .map(({ sha, authoredAt, subject }) => `${sha}\t${authoredAt}\t${subject.replaceAll("\t", " ")}`)
    .join("\n")}\n`,
);
writeFileSync(
  resolve(capsuleDirectory, "unreachable-tips.tsv"),
  `ref\tsha\tauthored_at\tsubject\n${tipRows
    .map(
      ({ ref, sha, authoredAt, subject }) =>
        `${ref}\t${sha}\t${authoredAt}\t${subject.replaceAll("\t", " ")}`,
    )
    .join("\n")}\n`,
);

const requiredRefs = listRequiredRefs();
const bundlePath = resolve(capsuleDirectory, "collisionspike.bundle");
git(["bundle", "create", bundlePath, "--all"]);

const verify = spawnSync("git", ["bundle", "verify", bundlePath], {
  cwd: repository,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
  windowsHide: true,
});
if (verify.status !== 0) {
  throw new Error(`git bundle verify failed: ${(verify.stderr || verify.stdout).trim()}`);
}
const bundleHeadsText = git(["bundle", "list-heads", bundlePath]);
const bundleHeads = new Map(
  bundleHeadsText.split(/\r?\n/).map((line) => {
    const [sha, ref] = line.split(" ");
    return [ref, sha];
  }),
);
const missingRefs = requiredRefs.filter(({ ref, sha }) => bundleHeads.get(ref) !== sha);
if (missingRefs.length) {
  throw new Error(`bundle omitted or changed ${missingRefs.length} required refs`);
}

const bundleSha256 = sha256File(bundlePath);
writeFileSync(
  resolve(capsuleDirectory, "SHA256SUMS"),
  `${bundleSha256}  collisionspike.bundle\n`,
);
writeFileSync(resolve(capsuleDirectory, "bundle-heads.txt"), `${bundleHeadsText}\n`);

const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  repository,
  remoteUrl: git(["remote", "get-url", "origin"]),
  originMain: git(["rev-parse", "origin/main"]),
  unreachableCommitCount: commits.length,
  archivalTipCount: anchored.length,
  archivalRefs: anchored,
  requiredRefCount: requiredRefs.length,
  requiredRefs,
  bundle: {
    path: bundlePath,
    bytes: statSync(bundlePath).size,
    sha256: bundleSha256,
    verifyStdout: verify.stdout.trim(),
    verifyStderr: verify.stderr.trim(),
  },
};
writeFileSync(
  resolve(capsuleDirectory, "capsule-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

process.stdout.write(
  `${JSON.stringify(
    {
      capsuleDirectory,
      unreachableCommitCount: commits.length,
      archivalTipCount: anchored.length,
      requiredRefCount: requiredRefs.length,
      bundleBytes: manifest.bundle.bytes,
      bundleSha256,
      verified: true,
    },
    null,
    2,
  )}\n`,
);
