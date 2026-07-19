import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { afterEach, test } from "node:test";

import { generateAdapters } from "./generate-agent-adapters.mjs";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const realManifest = path.join(here, "..", "..", ".agents", "adapter-manifest.json");
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

// A controlled fixture: the real, committed adapter manifest driving a minimal canonical source tree,
// so every parity failure mode is exercised against the actual generator without touching the repo.
function freshGenerated() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-adapters-"));
  temporaryRoots.push(root);

  fs.mkdirSync(path.join(root, ".agents", "agents"), { recursive: true });
  fs.copyFileSync(realManifest, path.join(root, ".agents", "adapter-manifest.json"));
  fs.writeFileSync(
    path.join(root, ".agents", "agents", "roles.json"),
    JSON.stringify({
      schemaVersion: 1,
      roles: [{
        name: "fixture-agent",
        description: "Fixture role for parity tests.",
        scope: "fixtures only",
        instructions: "Do fixture work.",
      }],
    }),
  );

  const skillDir = path.join(root, ".agents", "skills", "fixture-skill");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    "---\nname: fixture-skill\ndescription: Fixture skill.\n---\n\nBody.\n",
  );
  fs.writeFileSync(path.join(root, "skills-lock.json"), JSON.stringify({ version: 1, skills: {} }));

  const result = generateAdapters({ root, checkOnly: false });
  assert.equal(result.roleCount, 1);
  assert.equal(result.skillCount, 1);
  return root;
}

function check(root) {
  return generateAdapters({ root, checkOnly: true }).mismatches;
}

test("clean generation passes parity and is byte-deterministic", () => {
  const root = freshGenerated();
  assert.deepEqual(check(root), []);

  const sample = [
    ".claude/agents/fixture-agent.md",
    ".codex/agents/fixture-agent.toml",
    ".cursor/skills/fixture-skill/SKILL.md",
  ].map((relative) => fs.readFileSync(path.join(root, relative), "utf8"));

  generateAdapters({ root, checkOnly: false });
  const repeat = [
    ".claude/agents/fixture-agent.md",
    ".codex/agents/fixture-agent.toml",
    ".cursor/skills/fixture-skill/SKILL.md",
  ].map((relative) => fs.readFileSync(path.join(root, relative), "utf8"));
  assert.deepEqual(repeat, sample);
  assert.deepEqual(check(root), []);
});

test("reports a MISSING adapter with source and target paths", () => {
  const root = freshGenerated();
  fs.rmSync(path.join(root, ".claude", "agents", "fixture-agent.md"));
  const mismatches = check(root);
  assert.ok(
    mismatches.some((message) =>
      /^Missing generated adapter: \.claude\/agents\/fixture-agent\.md \(canonical source: \.agents\/agents\/roles\.json\)$/.test(message)),
    mismatches.join("\n"),
  );
});

test("reports a MISSING skill adapter with source and target paths", () => {
  const root = freshGenerated();
  fs.rmSync(path.join(root, ".claude", "skills", "fixture-skill", "SKILL.md"));
  const mismatches = check(root);
  assert.ok(
    mismatches.some((message) =>
      /^Missing generated skill adapter: \.claude\/skills\/fixture-skill\/SKILL\.md \(canonical source: \.agents\/skills\/fixture-skill\/SKILL\.md\)$/.test(message)),
    mismatches.join("\n"),
  );
});

test("reports a STALE adapter after the canonical source changes", () => {
  const root = freshGenerated();
  fs.writeFileSync(
    path.join(root, ".agents", "agents", "roles.json"),
    JSON.stringify({
      schemaVersion: 1,
      roles: [{
        name: "fixture-agent",
        description: "Fixture role for parity tests.",
        scope: "fixtures only",
        instructions: "Changed instructions make every generated adapter stale.",
      }],
    }),
  );
  const mismatches = check(root);
  assert.ok(
    mismatches.some((message) =>
      /^Stale or hand-edited generated adapter: \.claude\/agents\/fixture-agent\.md \(canonical source: \.agents\/agents\/roles\.json\)$/.test(message)),
    mismatches.join("\n"),
  );
});

test("reports an EXTRA adapter that has no canonical source", () => {
  const root = freshGenerated();
  fs.writeFileSync(path.join(root, ".codex", "agents", "orphan.toml"), "name = \"orphan\"\n");
  const mismatches = check(root);
  assert.ok(
    mismatches.some((message) =>
      /^Extra generated adapter \(no canonical source\): \.codex\/agents\/orphan\.toml$/.test(message)),
    mismatches.join("\n"),
  );
});

test("reports a HAND-EDITED adapter whose bytes were changed in place", () => {
  const root = freshGenerated();
  const handEdited = path.join(root, ".cursor", "agents", "fixture-agent.md");
  fs.appendFileSync(handEdited, "\nlocal hand edit\n");
  const mismatches = check(root);
  assert.ok(
    mismatches.some((message) =>
      /^Stale or hand-edited generated adapter: \.cursor\/agents\/fixture-agent\.md \(canonical source: \.agents\/agents\/roles\.json\)$/.test(message)),
    mismatches.join("\n"),
  );
});
