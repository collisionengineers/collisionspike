// azure-guard-lib.mjs — shared logic for the Azure routing + anti-churn guards (collisionspike).
//
// The point: when an Azure task hits friction, route to the purpose-built skill/agent/tool
// (docs/operations/) instead of hand-rolling `az`/`func`/`psql`/KQL and churning. This library:
//   (1) decides whether a shell command is a high-value Azure op,
//   (2) returns the one-line route hint (which skill/playbook to reach for),
//   (3) detects a failed tool result + tracks repeated failures (the two-strikes rule).
// Used by the non-blocking PreToolUse reminder (azure-route-guard.mjs) and the PostToolUse
// churn escalator (azure-churn-guard.mjs). Both fail OPEN — a guard error never blocks a tool.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Trivial read-only / auth commands we never nag about.
const TRIVIAL_RE =
  /(^|\s)(--help|-h)(\s|$)|\baz\s+(account|version|login|logout|upgrade|config|extension)\b|\baz\s+(resource|group)\s+list\b/i;

// Already-routed: the command (or a nearby note) already names a playbook/skill — stay quiet.
const ROUTED_RE = /docs[\\/]operations|azure:azure-|azure-diagnostician/i;

// Ordered, specific routing rules. First match wins (one hint per command — low noise).
const RULES = [
  {
    test: /\baz\s+role\b/i,
    hint:
      'RBAC/identity → use the `azure:azure-rbac` skill + `mcp__azure__role` (docs/operations/identity-and-access.md). ' +
      'Here `az role assignment` returns MissingSubscription — grant via ARM template, and pass ' +
      '`--assignee-object-id <oid> --assignee-principal-type ServicePrincipal`.',
  },
  {
    test: /\baz\s+keyvault\b/i,
    hint:
      'Key Vault/secrets → `azure:azure-compliance` + the KV-reference pattern via `mcp__azure__keyvault` ' +
      '(docs/operations/secrets.md). After rotating a secret, pin a VERSIONED SecretUri or the previous ' +
      'value stays cached.',
  },
  {
    test: /--analytics-query|app-?insights|\baz\s+monitor\b/i,
    hint:
      'App Insights / KQL → use the `azure:azure-kusto` skill or `mcp__azure__monitor` (docs/operations/diagnostics.md). ' +
      'On Windows pass KQL via `--analytics-query "@q.kql"` (inline KQL mangles) and avoid `length(@)`.',
  },
  {
    test: /func\s+azure\s+functionapp\s+publish|\bswa\s+deploy\b|\baz\s+staticwebapp\b|az\s+functionapp\s+\S*\s*(deployment|deploy|zip)/i,
    hint:
      'Deploy → run `azure:azure-validate` then `azure:azure-deploy`, and call ' +
      '`mcp__azure__get_azure_bestpractices` (docs/operations/deployment.md). Build bundles in ' +
      '`.artifacts/deploy/` and keep the esbuild import.meta.url banner or the host registers 0 functions.',
  },
  {
    test: /\baz\s+(functionapp|webapp)\b/i,
    hint:
      'Live Function App issue → use the `azure:azure-diagnostics` skill (+ dispatch the **azure-diagnostician** ' +
      'agent) before hand-rolling (docs/operations/diagnostics.md).',
  },
  {
    test: /\bpsql\b|\baz\s+postgres\b/i,
    hint:
      'Postgres → `mcp__azure__postgres` / psql (docs/operations/database.md). RLS only bites as the non-owner ' +
      'login `cespk_app`; the DB role is set per-connection via libpq `-c app.role=staff`.',
  },
  {
    test: /\baz\s+ad\b|graph\.microsoft\.com|graph-renew|grant-exo-rbac|New-(ServicePrincipal|ManagementScope|ManagementRoleAssignment)/i,
    hint:
      'Entra / Graph / Exchange-RBAC → `azure:entra-app-registration` + `microsoft-docs` (docs/operations/identity-and-access.md). ' +
      'After an Exchange-RBAC grant, leave the app IDLE ≥30 min before the first Graph call — polling keeps the ' +
      'permission cache stale (the 403 that wasted ~50 min).',
  },
];

// The first matching route hint for a command, or null.
export function routeHint(cmd) {
  if (!cmd || TRIVIAL_RE.test(cmd) || ROUTED_RE.test(cmd)) return null;
  for (const r of RULES) if (r.test.test(cmd)) return r.hint;
  return null;
}

// Broad: is this any Azure-ish op worth tracking for churn? (Wider than routeHint.)
export function isAzureOp(cmd) {
  if (!cmd || TRIVIAL_RE.test(cmd)) return false;
  return /\baz\s+\w|func\s+azure|\bswa\b|\bpsql\b|graph\.microsoft\.com|New-(ServicePrincipal|ManagementRoleAssignment)/i.test(
    cmd,
  );
}

// Normalize a command so "the same op" matches across runs (collapse whitespace, lowercase).
export function normalizeCmd(cmd) {
  return String(cmd || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 400);
}

// Best-effort: does a Bash/PowerShell tool_response look like a failure? (Conservative signals.)
export function looksFailed(toolResponse) {
  const s = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse || '');
  return /\b(ERROR|FAILED|Forbidden|Unauthorized|AuthorizationFailed|MissingSubscription|ResourceNotFound|ExtensionError|Access is denied|is not recognized|ERR_[A-Z_]+|Traceback|exit code [1-9])\b/i.test(
    s,
  );
}

// --- repeated-failure state (the two-strikes rule) -------------------------------------------
const STATE_PATH = join(tmpdir(), 'cs-azure-churn-state.json');
const WINDOW_MS = 15 * 60 * 1000; // a failure "counts" if it recurs within 15 min

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function writeState(st) {
  try {
    writeFileSync(STATE_PATH, JSON.stringify(st));
  } catch {
    /* best-effort; never block */
  }
}

// Record a failure for `cmd`; return the running count within the window. Prunes stale keys.
export function recordFailure(cmd, now) {
  const key = normalizeCmd(cmd);
  const st = readState();
  for (const k of Object.keys(st)) if (now - (st[k].ts || 0) > WINDOW_MS) delete st[k];
  const prev = st[key] && now - st[key].ts <= WINDOW_MS ? st[key].count : 0;
  st[key] = { count: prev + 1, ts: now };
  writeState(st);
  return st[key].count;
}

// Clear the failure counter for `cmd` (call on success so a fixed op stops nagging).
export function clearFailure(cmd) {
  const key = normalizeCmd(cmd);
  const st = readState();
  if (st[key]) {
    delete st[key];
    writeState(st);
  }
}
