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
  BOX_GATES_ALL_FALSE,
  LOCATION_ASSIST_GATE_ALL_OFF,
  type BoxGates,
  type LocationAssistGate,
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
        embedEnabled: gates.boxEmbed(),
        metadataEnabled: gates.boxMetadata(),
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
      };
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: { ...LOCATION_ASSIST_GATE_ALL_OFF } };
    }
  }),
});
