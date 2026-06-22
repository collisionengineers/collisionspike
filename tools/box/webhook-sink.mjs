// webhook-sink.mjs — minimal logging receiver for the Phase-B FILE.UPLOADED de-risk.
//
// Answers ONE question cheaply: does Box deliver a webhook (esp. for a File-Request
// upload) to a public endpoint? Logs every request's method/headers/body to console
// and tools/box/.sink-events.log (JSON lines), and returns 200 so Box marks it
// delivered. NOT the production receiver (that's functions/box-webhook/) — this has no
// HMAC/Dataverse; it just proves delivery + shows the event shape. Run via run-receiver.mjs.
//   node tools/box/webhook-sink.mjs [port]      (default 7077)
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG = resolve(HERE, '.sink-events.log');
const PORT = Number(process.argv[2] || process.env.SINK_PORT || 7077);

function stamp() {
  // Date is fine here (standalone process, not a workflow script)
  return new Date().toISOString();
}

const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      /* leave raw */
    }
    const boxHeaders = Object.fromEntries(
      Object.entries(req.headers).filter(([k]) => k.toLowerCase().startsWith('box-') || k === 'content-type')
    );
    const trigger = parsed && parsed.trigger ? parsed.trigger : '(none)';
    const src = parsed && parsed.source ? parsed.source : {};
    const entry = {
      at: stamp(),
      method: req.method,
      url: req.url,
      trigger,
      source_type: src.type,
      source_id: src.id,
      source_name: src.name,
      parent_id: src.parent && src.parent.id,
      box_headers: boxHeaders,
      body: parsed || raw.slice(0, 2000),
    };
    try {
      appendFileSync(LOG, JSON.stringify(entry) + '\n');
    } catch {
      /* ignore log errors */
    }
    const flag = trigger === 'FILE.UPLOADED' ? '  <<< FILE.UPLOADED' : '';
    console.log(`[${entry.at}] ${req.method} ${req.url} trigger=${trigger} src=${src.type}:${src.id} parent=${entry.parent_id || '-'}${flag}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"received":true}');
  });
});

server.listen(PORT, () => {
  console.log(`webhook-sink listening on http://localhost:${PORT} (events -> ${LOG})`);
  console.log('Pair with a public HTTPS tunnel (run-receiver.mjs starts cloudflared for you).');
});
