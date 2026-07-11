/**
 * api/src/index.ts — app-level entry point.
 *
 * Imports each functions module for side-effect registration.
 * The Azure Functions v4 programming model registers routes via app.http() calls
 * in each module; this file is the single entry that triggers those registrations.
 *
 * The compiled output of this file is referenced by package.json "main".
 */

import './functions/cases.js';
import './functions/providers.js';
import './functions/inspection.js';
import './functions/dashboard.js';
import './functions/gates.js';
import './functions/settings.js';
import './functions/inbound.js';
import './functions/proxy.js';
import './functions/internal.js';
import './functions/internal-retro.js';
import './functions/assistant.js'; // AI chat helper (TKT-060; AI_CHAT_ENABLED)
import './functions/search.js'; // global search (TKT-072; GLOBAL_SEARCH_ENABLED)
import './functions/mcp.js'; // read-only MCP server for external agents (TKT-110; MCP_SERVER_ENABLED)
import './functions/evidence.js'; // evidence byte preview (TKT-048)
import './functions/archive-mirror-outbox.js'; // durable staff un-exclusion archive mirror
import './functions/box-file-request-outbox.js'; // durable case image-upload links
import './functions/evidence-upload.js'; // staff evidence upload via assistant (TKT-068)
import './functions/ai-suggestions.js';
import './functions/evidence-backfill-drain.js'; // durable monitor seam for pending case-link recovery jobs
import './functions/image-analysis.js'; // staged image-analysis suggestion producer (TKT-016; IMAGE_ANALYSIS_ENABLED)
import './functions/provider-keys.js';
import './functions/provider-intake.js';
