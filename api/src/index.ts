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
import './functions/ai-suggestions.js';
import './functions/provider-keys.js';
import './functions/provider-intake.js';
