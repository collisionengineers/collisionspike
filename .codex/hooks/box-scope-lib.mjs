// box-scope-lib.mjs — shared logic for the Box scope guard (collisionspike).
//
// The Box integration build is scoped to ONE folder (the test folder) and its
// descendants. This library: (1) loads the allowlist config, (2) decides whether a
// shell command is a Box operation, (3) extracts every Box object id the command
// references, and (4) appends newly-created in-scope child ids. Used by the blocking
// PreToolUse guard (box-scope-guard.mjs) and the PostToolUse grower (box-scope-postcreate.mjs).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url)); // .claude/hooks
export const CONFIG_PATH = resolve(HERE, '..', '..', 'tools', 'box-scope.json');

export function loadConfig() {
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  return {
    allowedRoot: String(cfg.allowedRoot),
    allowedIds: (cfg.allowedIds || []).map(String),
    liveReady: cfg.liveReady === true,
  };
}

// Append a newly-created child id to the allowlist (downward growth only).
// Returns true if it was added (false if already present). Preserves _comment.
export function appendAllowedId(id) {
  id = String(id);
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  cfg.allowedIds = (cfg.allowedIds || []).map(String);
  if (cfg.allowedIds.includes(id)) return false;
  cfg.allowedIds.push(id);
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
  return true;
}

// A command is a Box op if it invokes the box CLI (topic:action syntax), hits a Box
// REST host, or references a Box SDK entrypoint. Paths that merely contain "box"
// (e.g. functions/box-webhook/, box-integration-pivot/) are NOT matched.
const BOX_CLI_RE = /(^|[\n;&|()`]\s*)(?:npx\s+)?box(?:\.cmd)?\s+[a-z][a-z0-9-]*\s*:\s*[a-z][a-z0-9-]*/i;
const BOX_REST_RE = /\b(?:api|upload)\.box\.com\b/i;
const BOX_SDK_RE = /\bbox[-_]sdk[-_]gen\b|\bBoxCCGAuth\b|\bBoxClient\b|\bboxsdk\b/;

export function isBoxCommand(cmd) {
  return BOX_CLI_RE.test(cmd) || BOX_REST_RE.test(cmd) || BOX_SDK_RE.test(cmd);
}

// Extract every Box object id referenced by the command, plus webhook-create intent.
export function analyze(cmd) {
  const ids = new Set();
  const targetIds = [];

  // 1. id-bearing flags: --parent-id / --target-id / --folder-id (space or = form)
  for (const m of cmd.matchAll(/--(parent|target|folder)-id[=\s]+["']?(\d+)["']?/gi)) {
    ids.add(m[2]);
    if (m[1].toLowerCase() === 'target') targetIds.push(m[2]);
  }
  // 2. box CLI positional id: `topic:action <id>` (first positional after the verb).
  //    Covers folders:create <PARENT>, folders:get/items/delete/share <id>,
  //    file-requests:copy/get/delete <id>, webhooks:get/delete <id>, shared-links:create <id>, etc.
  for (const m of cmd.matchAll(/box(?:\.cmd)?\s+([a-z][a-z0-9-]*)\s*:\s*([a-z][a-z0-9-]*)\s+["']?(\d+)["']?/gi)) {
    ids.add(m[3]);
  }
  // 3. REST URLs: /2.0/{folders|files|file_requests|webhooks}/{id}
  for (const m of cmd.matchAll(/\/2\.0\/(?:folders|files|file_requests|webhooks)\/(\d+)/gi)) {
    ids.add(m[1]);
  }
  // 4. JSON id forms in request bodies: "parent|target|folder": { "id": "<id>" }
  for (const m of cmd.matchAll(/"(?:parent|target|folder)"\s*:\s*\{[^}]*?"id"\s*:\s*"?(\d+)"?/gi)) {
    ids.add(m[1]);
    if (/"target"\s*:\s*\{/i.test(m[0])) targetIds.push(m[1]);
  }
  // 4b. CLI positional webhook target: `webhooks:create <id> <type>` (id is the target)
  for (const m of cmd.matchAll(/webhooks\s*:\s*create\s+["']?(\d+)["']?/gi)) {
    ids.add(m[1]);
    targetIds.push(m[1]);
  }

  // A help/read invocation is never a create — don't fail-closed on `webhooks:create --help`.
  const isHelp = /(^|\s)(--help|-h)(\s|$)/.test(cmd);
  const webhookCreate =
    !isHelp &&
    (/webhooks\s*:\s*create\b/i.test(cmd) ||
      (BOX_REST_RE.test(cmd) && /\/2\.0\/webhooks\b/i.test(cmd) && /(-X|--request)\s*POST/i.test(cmd)));

  const touchesFolderZero =
    ids.has('0') ||
    /--(?:parent|target|folder)-id[=\s]+["']?0["']?(\s|$|["'])/i.test(cmd) ||
    /box(?:\.cmd)?\s+[a-z-]+\s*:\s*[a-z-]+\s+0(\s|$|["'])/i.test(cmd) ||
    /\/2\.0\/(?:folders|files)\/0\b/i.test(cmd);

  return {
    ids,
    touchesFolderZero,
    webhookCreate,
    webhookTargets: webhookCreate ? [...new Set(targetIds)] : [],
  };
}
