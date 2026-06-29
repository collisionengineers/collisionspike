/**
 * orchestration/src/index.ts — app-level entry point.
 *
 * Imports each function module for side-effect registration.
 * The Azure Functions v4 + durable-functions v3 programming model registers
 * triggers via app.http / app.timer / app.storageQueue / df.app.orchestration /
 * df.app.activity calls in each module.
 */

// Graph webhook + lifecycle + renewal (timer backstop + HTTP route + durable monitor)
import './functions/graph-webhook.js';
import './functions/graph-lifecycle.js';
import './functions/graph-renew.js';
import './functions/graph-renew-http.js';
import './functions/subscriptionMonitor.js';

// Queue intake starter → Durable orchestrator + activities
import './functions/intake-starter.js';
import './functions/intakeOrchestrator.js';
import './functions/activities/fetchMessage.js';
import './functions/activities/providerMatch.js';
import './functions/activities/classifyInbound.js';
import './functions/activities/linkReply.js';
import './functions/activities/caseResolve.js';
import './functions/activities/classifyPersist.js';
import './functions/activities/parse.js';
import './functions/activities/statusEvaluate.js';
import './functions/activities/enrich.js';

// The 9 gated orchestrations (plan 22 §C) — all wired off behind their gates, no-op when invoked
import './functions/gated/finalize-eva-box.js';
import './functions/gated/chaser.js';
import './functions/gated/triage-classify.js';
import './functions/gated/box-folder-create.js';
import './functions/gated/box-file-request-copy.js';
import './functions/gated/box-blob-purge.js';
import './functions/gated/case-disposition.js';
import './functions/gated/jobsheet-import.js';
