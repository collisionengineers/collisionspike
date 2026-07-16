import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { collectFileEntries } from "./generate-repository-inventory.mjs";

const temporaryRepositories = [];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

async function fixtureRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "repository-inventory-"));
  temporaryRepositories.push(root);
  git(root, "init", "--quiet");
  git(root, "config", "core.autocrlf", "false");
  await mkdir(path.join(root, "workingspace"));
  await writeFile(
    path.join(root, ".gitattributes"),
    "*.txt text eol=lf\nworkingspace/** text eol=crlf\n",
  );

  const trackedIndexBytes = Buffer.from("alpha\nbeta\n", "utf8");
  const trackedCheckoutBytes = Buffer.from("alpha\r\nbeta\r\n", "utf8");
  const workingspaceBytes = Buffer.from("private\r\nnotes\r\n", "utf8");
  const workingspacePath = path.join(root, "workingspace", "note.txt");
  await writeFile(path.join(root, "tracked.txt"), trackedIndexBytes);
  await writeFile(workingspacePath, workingspaceBytes);
  git(root, "add", ".gitattributes", "tracked.txt", "workingspace/note.txt");

  // Simulate the platform-dependent checkout representation that caused the CI mismatch.
  await writeFile(path.join(root, "tracked.txt"), trackedCheckoutBytes);
  const untrackedBytes = Buffer.from("untracked\r\n", "utf8");
  await writeFile(path.join(root, "untracked.txt"), untrackedBytes);

  return {
    root,
    trackedIndexBytes,
    trackedCheckoutBytes,
    workingspaceBytes,
    untrackedBytes,
    immutableWorkingFiles: new Map([
      ["workingspace/note.txt", {
        size: workingspaceBytes.length,
        sha256: sha256(workingspaceBytes),
      }],
    ]),
  };
}

afterEach(async () => {
  await Promise.all(temporaryRepositories.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("uses index blob bytes for tracked rows and physical bytes for untracked and immutable working files", async () => {
  const fixture = await fixtureRepository();
  const entries = await collectFileEntries({
    root: fixture.root,
    includeUntracked: true,
    outputPath: "inventory.json",
    immutableWorkingFiles: fixture.immutableWorkingFiles,
  });
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));

  assert.notEqual(sha256(fixture.trackedIndexBytes), sha256(fixture.trackedCheckoutBytes));
  assert.deepEqual(
    { size: byPath.get("tracked.txt").size, sha256: byPath.get("tracked.txt").sha256 },
    { size: fixture.trackedIndexBytes.length, sha256: sha256(fixture.trackedIndexBytes) },
  );
  assert.deepEqual(
    { size: byPath.get("workingspace/note.txt").size, sha256: byPath.get("workingspace/note.txt").sha256 },
    { size: fixture.workingspaceBytes.length, sha256: sha256(fixture.workingspaceBytes) },
  );
  assert.deepEqual(
    { size: byPath.get("untracked.txt").size, sha256: byPath.get("untracked.txt").sha256 },
    { size: fixture.untrackedBytes.length, sha256: sha256(fixture.untrackedBytes) },
  );

  await writeFile(path.join(fixture.root, "tracked.txt"), "unstaged replacement\r\n");
  const repeated = await collectFileEntries({
    root: fixture.root,
    outputPath: "inventory.json",
    immutableWorkingFiles: fixture.immutableWorkingFiles,
  });
  const repeatedTracked = repeated.find((entry) => entry.path === "tracked.txt");
  assert.equal(repeatedTracked.size, fixture.trackedIndexBytes.length);
  assert.equal(repeatedTracked.sha256, sha256(fixture.trackedIndexBytes));
});

test("rejects a physical-byte change to an immutable workingspace file", async () => {
  const fixture = await fixtureRepository();
  await writeFile(path.join(fixture.root, "workingspace", "note.txt"), "changed\r\n");

  await assert.rejects(
    collectFileEntries({
      root: fixture.root,
      outputPath: "inventory.json",
      immutableWorkingFiles: fixture.immutableWorkingFiles,
    }),
    /Immutable workingspace bytes changed: workingspace\/note\.txt/,
  );
});
