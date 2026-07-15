import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";

import {
  buildReconciliation,
  collectPreResetInventory,
  PRE_RESET_COMMIT,
  validateReconciliation,
} from "./reconcile-repository-reset.mjs";

const temporaryRepositories = [];

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

afterEach(async () => {
  await Promise.all(temporaryRepositories.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function entry(path, sha256, owner = "repository") {
  return { path, mediaType: "text/plain", size: 1, sha256, category: "source", owner, lifecycle: "active" };
}

test("accounts for retained, moved, deleted and created paths", () => {
  const baseline = { entries: [entry("README.md", "a"), entry("api/a.ts", "b"), entry("gone.txt", "c")] };
  const final = { entries: [entry("README.md", "a"), entry("services/data-api/a.ts", "b"), entry("docs/new.md", "d", "documentation")] };
  const result = buildReconciliation(baseline, final);
  assert.equal(result.summary.unexplained, 0);
  assert.deepEqual(result.baselineEntries.map((item) => item.disposition), ["keep", "move", "delete"]);
  assert.deepEqual(result.finalEntries.map((item) => item.state), ["retained", "moved", "created"]);
});

test("fails an unowned final row", () => {
  const document = buildReconciliation({ entries: [] }, { entries: [entry("docs/new.md", "d", "")] });
  assert.ok(validateReconciliation(document).some((issue) => issue.includes("unexplained final entry")));
});

test("locks the permanent pre-reset main commit rather than a feature-branch baseline", () => {
  assert.equal(PRE_RESET_COMMIT, "81ae8fdf68b4fd29648d76dc77c379cd98764dbe");
});

test("reconstructs the baseline from committed tree and blob bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repository-reconciliation-"));
  temporaryRepositories.push(root);
  git(root, "init", "--quiet");
  git(root, "config", "user.email", "repository-check@example.invalid");
  git(root, "config", "user.name", "Repository Check");
  await mkdir(path.join(root, "docs", "workingspace"), { recursive: true });

  const committedBytes = Buffer.from("alpha\nbeta\n", "utf8");
  await writeFile(path.join(root, "tracked.txt"), committedBytes);
  await writeFile(path.join(root, "docs", "workingspace", "note.txt"), "private\nnotes\n");
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "pre-reset state");
  const commit = git(root, "rev-parse", "HEAD");

  // The result must be independent of current checkout bytes, paths, and branch names.
  await writeFile(path.join(root, "tracked.txt"), "changed in the checkout\r\n");
  git(root, "branch", "temporary-name", commit);
  git(root, "branch", "-D", "temporary-name");

  const baseline = await collectPreResetInventory({ root, commit });
  const byPath = new Map(baseline.entries.map((item) => [item.path, item]));
  assert.deepEqual(baseline.counts, { directories: 3, files: 2, entries: 5 });
  assert.equal(baseline.totalFileBytes, committedBytes.length + Buffer.byteLength("private\nnotes\n"));
  assert.deepEqual(
    { size: byPath.get("tracked.txt").size, sha256: byPath.get("tracked.txt").sha256 },
    { size: committedBytes.length, sha256: sha256(committedBytes) },
  );
  assert.equal(byPath.get("docs/workingspace/note.txt").owner, "user-workspace");
  assert.equal(byPath.get("docs/workingspace/note.txt").lifecycle, "working");
});

test("fails closed with an actionable error in a depth-one checkout", async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), "repository-reconciliation-source-"));
  const cloneParent = await mkdtemp(path.join(os.tmpdir(), "repository-reconciliation-clone-"));
  const shallow = path.join(cloneParent, "checkout");
  temporaryRepositories.push(source, cloneParent);
  git(source, "init", "--quiet");
  git(source, "config", "user.email", "repository-check@example.invalid");
  git(source, "config", "user.name", "Repository Check");
  await writeFile(path.join(source, "tracked.txt"), "before\n");
  git(source, "add", "tracked.txt");
  git(source, "commit", "--quiet", "-m", "pre-reset state");
  const missingCommit = git(source, "rev-parse", "HEAD");
  await writeFile(path.join(source, "tracked.txt"), "after\n");
  git(source, "commit", "--quiet", "-am", "current state");
  execFileSync("git", ["clone", "--quiet", "--depth", "1", pathToFileURL(source).href, shallow], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(git(shallow, "rev-parse", "--is-shallow-repository"), "true");

  await assert.rejects(
    collectPreResetInventory({ root: shallow, commit: missingCommit }),
    /Locked pre-reset commit .* is unavailable.*fetch-depth: 0/,
  );
});

test("treats the immutable working-folder relocation as a move across hash bases", () => {
  const before = entry("docs/workingspace/note.txt", "git-blob-hash", "user-workspace");
  before.category = "working-document";
  before.lifecycle = "working";
  const after = entry("workingspace/note.txt", "physical-checkout-hash", "user-workspace");
  after.category = "working-document";
  after.lifecycle = "working";

  const result = buildReconciliation({ entries: [before] }, { entries: [after] });
  assert.equal(result.baselineEntries[0].disposition, "move");
  assert.equal(result.finalEntries[0].state, "moved");
});
