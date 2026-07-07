#!/usr/bin/env node
/*
 * check-skills-sync.mjs — ensure duplicated skills stay byte-identical.
 *
 * Skills may exist only in .agents/skills or only in .claude/skills. When the
 * same skill/file exists in both trees, the file content must match exactly.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS = join(ROOT, '.agents', 'skills');
const CLAUDE = join(ROOT, '.claude', 'skills');

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const failures = [];
const agentsFiles = new Map(walk(AGENTS).map((p) => [relative(AGENTS, p).split(sep).join('/'), p]));
const claudeFiles = new Map(walk(CLAUDE).map((p) => [relative(CLAUDE, p).split(sep).join('/'), p]));
const shared = [...agentsFiles.keys()].filter((rel) => claudeFiles.has(rel)).sort();

for (const rel of shared) {
  const a = agentsFiles.get(rel);
  const c = claudeFiles.get(rel);
  if (statSync(a).size !== statSync(c).size || readFileSync(a, 'utf8') !== readFileSync(c, 'utf8')) {
    failures.push(rel);
  }
}

if (failures.length) {
  console.log('\n--- skill sync failures ---');
  for (const rel of failures) console.log(`  .agents/.claude shared skill file differs: ${rel}`);
}
console.log('\n================ SKILLS SYNC SUMMARY ================');
console.log(`  compared ${shared.length} shared file(s); ${failures.length} failure(s).`);
console.log(failures.length ? 'FAILED' : 'OK');
process.exit(failures.length ? 1 : 0);
