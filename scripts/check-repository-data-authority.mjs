#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = 'docs/architecture/repository-data-authority.md';
const REQUIRED = [
  'Repository data authority — 2026-07-14',
  'complete internal project use',
  'Raw image bytes may',
  'unapproved external transmission',
];
const DENY_PATTERNS = [
  { id: 'direct-model-byte-ban', re: /bytes?\s+(?:are|is)\s+never\s+sent\s+to\s+(?:aoai|the\s+model|the\s+assistant)/i },
  { id: 'names-only-model-ban', re: /names?[- ]only.{0,100}(?:model|assistant)|(?:model|assistant).{0,100}names?[- ]only/i },
  { id: 'pii-only-raw-ban', re: /(?:pii|personal data|client data|real case).{0,120}(?:must not|cannot|do not|never).{0,120}(?:raw|bytes?|images?|documents?)/i },
];
const SURFACES = [
  'AGENTS.md', 'CLAUDE.md', '.claude/agents', '.agents/skills', 'docs/adr', 'docs/plans',
  'docs/runbooks', 'docs/tickets/README.md', 'docs/tickets/BOARD.md',
  'docs/tickets/now/TKT-068-assistant-attach-evidence', 'scripts',
];

function trackedFiles(root = ROOT) {
  return execSync('git ls-files', { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean)
    .filter((file) => SURFACES.some((surface) => file === surface || file.startsWith(`${surface}/`)))
    .filter((file) => /\.(?:md|mjs|json)$/i.test(file))
    .filter((file) => ![
      'scripts/check-repository-data-authority.mjs',
      'scripts/check-repository-data-authority.test.mjs',
    ].includes(file));
}

export function scanText(file, text) {
  const issues = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (/\b(?:historical|superseded)\b/i.test(line)) return;
    for (const { id, re } of DENY_PATTERNS) {
      if (re.test(line)) issues.push({ file, line: index + 1, id, text: line.trim() });
    }
  });
  return issues;
}

export function validateAllowlist(entries, files) {
  const errors = [];
  for (const entry of entries) {
    if (!entry?.file || !entry?.line || !entry?.text || !entry?.reason || !entry?.authority) {
      errors.push('allowlist entry needs file, line, text, reason and authority');
      continue;
    }
    if (/[.*+?()[\]{}|\\]/.test(entry.text)) errors.push(`allowlist text must be literal: ${entry.file}:${entry.line}`);
    const body = files.get(entry.file);
    if (!body || body.split(/\r?\n/)[entry.line - 1] !== entry.text) errors.push(`stale allowlist entry: ${entry.file}:${entry.line}`);
  }
  return errors;
}

export function run(root = ROOT) {
  const canonicalPath = resolve(root, CANONICAL);
  const errors = [];
  if (!existsSync(canonicalPath)) errors.push(`missing canonical authority: ${CANONICAL}`);
  else {
    const canonical = readFileSync(canonicalPath, 'utf8');
    for (const marker of REQUIRED) if (!canonical.includes(marker)) errors.push(`canonical authority missing marker: ${marker}`);
  }
  const files = new Map(trackedFiles(root).map((file) => [file, readFileSync(resolve(root, file), 'utf8')]));
  const configPath = resolve(root, 'scripts/repository-data-authority-allowlist.json');
  const allowlist = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')).allowlist ?? [] : [];
  errors.push(...validateAllowlist(allowlist, files));
  const allowed = new Set(allowlist.map((entry) => `${entry.file}:${entry.line}`));
  for (const [file, text] of files) {
    for (const issue of scanText(file, text)) if (!allowed.has(`${issue.file}:${issue.line}`)) errors.push(`${issue.file}:${issue.line} ${issue.id}: ${issue.text}`);
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = run();
  if (errors.length) {
    console.error('Repository data-authority check failed:');
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  console.log('Repository data-authority check passed.');
}
