/**
 * services/orchestration/src/index.ts — app-level entry point.
 *
 * Imports each function module for side-effect registration.
 * The Azure Functions v4 + durable-functions v3 programming model registers
 * triggers via app.http / app.timer / app.storageQueue / df.app.orchestration /
 * df.app.activity calls in each module.
 */

// Graph webhook + lifecycle + renewal (timer backstop + HTTP route + durable monitor)
import './workflows/mailbox/graph-webhook.js';
import './workflows/mailbox/graph-lifecycle.js';
import './workflows/mailbox/graph-renew.js';
import './workflows/mailbox/graph-renew-http.js';
import './workflows/mailbox/subscriptionMonitor.js';
import './workflows/archive/archive-mirror-monitor.js';
import './workflows/archive/provider-archive-monitor.js';
import './workflows/evidence/evidence-backfill-publisher-monitor.js';
// TKT-095 detector (a) — gated SentItems surface (DONE_SENT_EMAIL_ENABLED, default off/dark):
// the sent-items webhook + lifecycle endpoints and the 'sent-messages' queue processor.
// Deploying these registers the handlers only — no Graph subscription is created until the
// gate is flipped and subscription maintenance bootstraps the SentItems subs.
import './workflows/mailbox/graph-webhook-sent.js';
import './workflows/mailbox/sent-items-processor.js';

// Queue intake starter → Durable orchestrator + activities
import './workflows/intake/intake-starter.js';
// Gated Outlook filing mover (TKT-054 / 020726 E6; OUTLOOK_MOVE_ENABLED)
import './workflows/mailbox/outlook-move.js';
import './workflows/mailbox/outlook-link-resolve.js';
import './workflows/mailbox/outlook-link-backfill.js';
// case_link evidence backfill consumer (TKT-145; enqueued by the Data API accept seam)
import './workflows/evidence/evidence-backfill.js';
// Box FILE.UPLOADED-lane image classify sweep (TKT-146; timer, IMAGE_ROLE_CLASSIFY + BOX_API gated)
import './workflows/archive/box-classify-sweep.js';
import './workflows/archive/box-maintenance-monitor.js'; // durable FC1 wake path for File Request + classification retries
import './workflows/intake/intakeOrchestrator.js';
import './workflows/mailbox/archiveHolding.js';
import './workflows/mailbox/archive-holding-monitor.js';
import './workflows/intake/fetchMessage.js';
import './workflows/intake/providerMatch.js';
import './workflows/intake/classifyInbound.js';
import './workflows/intake/triagePolicy.js'; // Stage B triage policy (ADR-0019 / rules-engine-v2 Phase 2)
import './workflows/intake/correlatePreInstruction.js'; // TKT-084 pre-instruction correlation (TRIAGE_PRE_INSTRUCTION_ENABLED)
import './workflows/intake/linkReply.js';
import './workflows/intake/caseResolve.js';
import './workflows/intake/setIngested.js';
import './workflows/evidence/classifyPersist.js';
import './workflows/intake/parse.js';
import './workflows/intake/statusEvaluate.js';
import './workflows/intake/enrich.js';
import './workflows/archive/boxArchive.js'; // Blob -> Box archive mirror (box-sync)
import './workflows/evidence/extractImages.js'; // embedded-image extraction (pdf-image-extraction)
import './workflows/evidence/imagesUnmatched.js'; // TKT-034 unmatched-images fallback (visible flag + dark reg-keyed Box folder)
import './workflows/evidence/imagesReceivedVrmMatch.js'; // TKT-102 image-delivery PDF-VRM match (Tractable shape; suggest-first)

// The 9 gated orchestrations (plan 22 §C) — all wired off behind their gates, no-op when invoked
import './workflows/archive/finalize-eva-box.js';
import './workflows/intake/chaser.js';
import './workflows/intake/triage-classify.js';
import './workflows/archive/box-folder-create.js';
import './workflows/archive/box-file-request-copy.js'; // explicit 410 tombstone; API/outbox owns creation
import './workflows/archive/box-blob-purge.js';
import './workflows/intake/case-disposition.js';
import './workflows/intake/jobsheet-import.js';
import './workflows/retro/retro-case.js'; // retro case reconstruction (ADR-0022; RETRO_CASE_ENABLED)
import './workflows/retro/retro-activities.js';
import './workflows/retro/retro-deleted-probe.js'; // TKT-119d read-only Deleted-Items feasibility probe (keyed)
import './workflows/intake/eva-report-poll.js'; // TKT-095 detector (c) dark skeleton (EVA_API_ENABLED; keyed starter)
// (The replay-backfill wipe&rebuild driver was REMOVED — TKT-106; the wipe path is
// non-viable per TKT-059's finding: the mailboxes retain only a fraction of the DB.)
