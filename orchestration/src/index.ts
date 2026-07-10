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
// TKT-095 detector (a) — gated SentItems surface (DONE_SENT_EMAIL_ENABLED, default off/dark):
// the sent-items webhook + lifecycle endpoints and the 'sent-messages' queue processor.
// Deploying these registers the handlers only — no Graph subscription is created until the
// gate is flipped and subscription maintenance bootstraps the SentItems subs.
import './functions/graph-webhook-sent.js';
import './functions/sent-items-processor.js';

// Queue intake starter → Durable orchestrator + activities
import './functions/intake-starter.js';
// Gated Outlook filing mover (TKT-054 / 020726 E6; OUTLOOK_MOVE_ENABLED)
import './functions/outlook-move.js';
// case_link evidence backfill consumer (TKT-145; enqueued by the Data API accept seam)
import './functions/evidence-backfill.js';
import './functions/intakeOrchestrator.js';
import './functions/activities/fetchMessage.js';
import './functions/activities/providerMatch.js';
import './functions/activities/classifyInbound.js';
import './functions/activities/triagePolicy.js'; // Stage B triage policy (ADR-0019 / rules-engine-v2 Phase 2)
import './functions/activities/correlatePreInstruction.js'; // TKT-084 pre-instruction correlation (TRIAGE_PRE_INSTRUCTION_ENABLED)
import './functions/activities/linkReply.js';
import './functions/activities/caseResolve.js';
import './functions/activities/setIngested.js';
import './functions/activities/classifyPersist.js';
import './functions/activities/parse.js';
import './functions/activities/statusEvaluate.js';
import './functions/activities/enrich.js';
import './functions/activities/boxArchive.js'; // Blob -> Box archive mirror (box-sync)
import './functions/activities/extractImages.js'; // embedded-image extraction (pdf-image-extraction)
import './functions/activities/imagesUnmatched.js'; // TKT-034 unmatched-images fallback (visible flag + dark reg-keyed Box folder)
import './functions/activities/imagesReceivedVrmMatch.js'; // TKT-102 image-delivery PDF-VRM match (Tractable shape; suggest-first)

// The 9 gated orchestrations (plan 22 §C) — all wired off behind their gates, no-op when invoked
import './functions/gated/finalize-eva-box.js';
import './functions/gated/chaser.js';
import './functions/gated/triage-classify.js';
import './functions/gated/box-folder-create.js';
import './functions/gated/box-file-request-copy.js';
import './functions/gated/box-blob-purge.js';
import './functions/gated/case-disposition.js';
import './functions/gated/jobsheet-import.js';
import './functions/gated/retro-case.js'; // retro case reconstruction (ADR-0022; RETRO_CASE_ENABLED)
import './functions/gated/retro-deleted-probe.js'; // TKT-119d read-only Deleted-Items feasibility probe (keyed)
import './functions/gated/eva-report-poll.js'; // TKT-095 detector (c) dark skeleton (EVA_API_ENABLED; keyed starter)
// (The replay-backfill wipe&rebuild driver was REMOVED — TKT-106; the wipe path is
// non-viable per TKT-059's finding: the mailboxes retain only a fraction of the DB.)
