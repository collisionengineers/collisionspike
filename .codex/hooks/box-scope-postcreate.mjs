// box-scope-postcreate.mjs — PostToolUse allowlist grower for the Box scope guard.
//
// After a successful Box create (folders:create, files:upload, file-requests:copy,
// webhooks:create) the new child id is appended to tools/box-scope.json so subsequent
// in-scope ops on that child pass the guard. Downward growth only: an id is tracked
// only when its parent (if the response carries one) is already allowed. Pure
// bookkeeping — always exits 0, never blocks.
import { loadConfig, appendAllowedId } from './box-scope-lib.mjs';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const ev = JSON.parse(raw || '{}');
    if ((ev.tool_name || '') !== 'Bash') process.exit(0);
    const cmd = String((ev.tool_input || {}).command || '');
    if (!/box(?:\.cmd)?\s+(?:folders:create|files:upload|file-requests:copy|webhooks:create)\b/i.test(cmd)) {
      process.exit(0);
    }

    // stdout location varies by harness shape (string vs object)
    const resp = ev.tool_response;
    let out = '';
    if (typeof resp === 'string') out = resp;
    else if (resp && typeof resp === 'object') out = String(resp.stdout || resp.output || resp.stderr || '');
    if (!out.trim()) process.exit(0);

    let obj;
    try {
      obj = JSON.parse(out);
    } catch {
      process.exit(0); // not --json output — nothing to track
    }

    // box --json returns an object, an array, or an { entries: [...] } wrapper (uploads/lists)
    const items = Array.isArray(obj) ? obj : Array.isArray(obj.entries) ? obj.entries : [obj];
    const cfg = loadConfig();
    const added = [];
    for (const it of items) {
      const id = it && it.id != null ? String(it.id) : '';
      if (!id || id === '0') continue;
      const parentId = it && it.parent && it.parent.id != null ? String(it.parent.id) : '';
      const parentOk = !parentId || parentId === cfg.allowedRoot || cfg.allowedIds.includes(parentId);
      if (!parentOk) continue; // never track something hanging off an out-of-scope parent
      if (appendAllowedId(id)) added.push(id);
    }
    if (added.length) {
      process.stderr.write('[box-scope-guard] now tracking in-scope Box id(s): ' + added.join(', ') + '\n');
    }
  } catch {
    /* bookkeeping only — never block */
  }
  process.exit(0);
});
