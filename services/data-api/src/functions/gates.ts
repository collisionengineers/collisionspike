/**
 * api/src/functions/gates.ts — gate-read HTTP routes.
 *
 * DataAccess methods 22–24 (plan 21 §21.1 / §21.2):
 *   22 GET /api/gates/box                       getBoxGates           -> BoxGates
 *   23 GET /api/gates/box/file-request-template getBoxFileRequestTemplateId -> { templateId: string|null }
 *   24 GET /api/gates/location-assist           getLocationAssistGate -> LocationAssistGate
 *
 * These read ONLY app-settings (process.env) via @cs/domain/gates — NOT a DB. Every
 * read DEFAULTS to all-false / honest-off on any failure (never 5xx); the defaults are
 * the shared constants BOX_GATES_ALL_FALSE / LOCATION_ASSIST_GATE_ALL_OFF (plan 21.2).
 *   - fileRequestTemplateConfigured is DERIVED (BOX_FILE_REQUEST_TEMPLATE_ID non-empty).
 *   - getBoxFileRequestTemplateId returns the raw string, or null when unset (SPA maps null->undefined).
 *   - location-assist `enabled` ANDs LOCATION_ASSIST_ENABLED + AZURE_MAPS_ENABLED + a non-empty API base.
 */

import { app } from '@azure/functions';
import {
  AI_ASSIST_GATE_ALL_OFF,
  BOX_GATES_ALL_FALSE,
  LOCATION_ASSIST_GATE_ALL_OFF,
  OUTLOOK_MOVE_GATE_ALL_OFF,
  type AiAssistGate,
  type BoxGates,
  type LocationAssistGate,
  type OutlookMoveGate,
} from '@cs/domain';
import { withRole } from '../lib/auth.js';
import { gates } from '../lib/gates.js';

// 22 — GET /api/gates/box
app.http('getBoxGates', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'gates/box',
  handler: withRole('CollisionSpike.User', async () => {
    try {
      const result: BoxGates = {
        apiEnabled: gates.boxApi(),
        folderAtIntakeEnabled: gates.boxFolderAtIntake(),
        fileRequestEnabled: gates.boxFileRequest(),
        fileRequestTemplateConfigured: gates.boxFileRequestTemplateId() !== '',
      };
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: { ...BOX_GATES_ALL_FALSE } };
    }
  }),
});

// 23 — GET /api/gates/box/file-request-template
app.http('getBoxFileRequestTemplateId', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'gates/box/file-request-template',
  handler: withRole('CollisionSpike.User', async () => {
    try {
      const id = gates.boxFileRequestTemplateId();
      return { status: 200, jsonBody: { templateId: id !== '' ? id : null } };
    } catch {
      return { status: 200, jsonBody: { templateId: null } };
    }
  }),
});

// 24 — GET /api/gates/location-assist
app.http('getLocationAssistGate', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'gates/location-assist',
  handler: withRole('CollisionSpike.User', async () => {
    try {
      const result: LocationAssistGate = {
        assistEnabled: gates.locationAssist(),
        mapsEnabled: gates.azureMaps(),
        apiBaseConfigured: gates.locationAssistApiBase() !== '',
        enabled: gates.locationAssistEnabled(),
        aiEnabled: gates.locationAssistAiEnabled(),
      };
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: { ...LOCATION_ASSIST_GATE_ALL_OFF } };
    }
  }),
});

// GET /api/gates/ai-assist — the AI suggestion-layer gate (TKT-015). `enabled` is the
// AI_ASSIST_ENABLED master switch the SPA panel keys on; `modelConfigured` reports whether
// a model endpoint + deployment are set (generate can do real work). Honest all-off on failure.
app.http('getAiAssistGate', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'gates/ai-assist',
  handler: withRole('CollisionSpike.User', async () => {
    try {
      const result: AiAssistGate = {
        enabled: gates.aiAssist(),
        modelConfigured: gates.aiAssistConfigured(),
      };
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: { ...AI_ASSIST_GATE_ALL_OFF } };
    }
  }),
});

// GET /api/gates/outlook-move — the Outlook filing gate (TKT-054 / 020726 E6). `enabled`
// is the actionable state the SPA "Suggested action" button keys on: OUTLOOK_MOVE_ENABLED
// AND a configured move queue. Honest all-off on failure.
app.http('getOutlookMoveGate', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'gates/outlook-move',
  handler: withRole('CollisionSpike.User', async () => {
    try {
      const result: OutlookMoveGate = { enabled: gates.outlookMoveEnabled() };
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: { ...OUTLOOK_MOVE_GATE_ALL_OFF } };
    }
  }),
});
