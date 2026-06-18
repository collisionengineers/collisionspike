// codeapp-flow-guard.mjs — non-blocking PreToolUse reminders for collisionspike.
// Surfaces the two runtime gotchas that have repeatedly bitten this project:
//   (1) build-before-push + hard-refresh when running `pac code push`
//   (2) Code App CSP connect-src 'none' -> use connectors, not raw fetch()
// ALWAYS exits 0 (purely informational; never blocks a tool call). See AGENTS.md.
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const ev = JSON.parse(raw || '{}');
    const tool = ev.tool_name || '';
    const ti = ev.tool_input || {};
    const msgs = [];
    if (tool === 'Bash' && typeof ti.command === 'string' && /pac\s+code\s+push/.test(ti.command)) {
      msgs.push(
        '[collisionspike guard] Before `pac code push`: run `npm run build` first (it ships dist/), ' +
        'then hard-refresh the player (Ctrl+Shift+R) — the Code App player caches builds.'
      );
    }
    if ((tool === 'Edit' || tool === 'Write') && typeof ti.file_path === 'string' && /mockup-app[\\/]+src/.test(ti.file_path)) {
      const body = String(ti.new_string || '') + String(ti.content || '');
      if (/fetch\s*\(|azurewebsites\.net|XMLHttpRequest/.test(body)) {
        msgs.push(
          '[collisionspike guard] Code App CSP is connect-src "none" — reach external services through a ' +
          'Power Platform CONNECTOR via the @microsoft/power-apps SDK, NOT a raw fetch()/XHR. ' +
          'A direct call works on localhost but fails on the deployed player. See AGENTS.md / memory codeapp-csp-use-connectors.'
        );
      }
    }
    if (msgs.length) process.stderr.write(msgs.join('\n') + '\n');
  } catch {
    /* never block on hook errors */
  }
  process.exit(0);
});
