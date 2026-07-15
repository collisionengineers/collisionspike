/** Data API entry point. Each import registers one cohesive route surface. */

import './features/cases/register.js';
import './features/providers/routes.js';
import './features/cases/inspection-routes.js';
import './features/cases/dashboard-routes.js';
import './features/settings/gate-routes.js';
import './features/settings/routes.js';
import './features/inbound/routes.js';
import './platform/http/proxy-routes.js';
import './platform/http/register-internal-routes.js';
import './features/inbound/retro-routes.js';
import './features/assistant/chat-routes.js'; // AI chat helper (TKT-060; AI_CHAT_ENABLED)
import './features/cases/search-route.js'; // global search (TKT-072; GLOBAL_SEARCH_ENABLED)
import './features/assistant/mcp-routes.js'; // read-only MCP server for external agents (TKT-110; MCP_SERVER_ENABLED)
import './features/evidence/routes.js'; // evidence byte preview (TKT-048)
import './features/archive/mirror-outbox-routes.js'; // durable staff un-exclusion archive mirror
import './features/archive/provider-outbox-routes.js'; // durable provider-recovery Archive continuation
import './features/archive/file-request-outbox-routes.js'; // durable case image-upload links
import './features/evidence/upload-route.js';
import './features/assistant/register-suggestion-routes.js';
import './features/evidence/backfill-drain-route.js'; // durable monitor seam for pending case-link recovery jobs
import './features/assistant/image-analysis-routes.js'; // staged image-analysis suggestion producer (TKT-016; IMAGE_ANALYSIS_ENABLED)
import './features/providers/key-routes.js';
import './features/providers/intake-route.js';
import './features/vehicle/routes.js'; // canonical vehicle lookup, persistence, and staff retry
