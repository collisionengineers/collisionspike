/**
 * capture.ts — the guided-capture HTTP route registrar.
 *
 * Wires the staff and anonymous public capture routes to their handler modules. The route
 * path / method / authLevel and the staff app-role gate (withRole) stay declared here so the
 * runtime-contract snapshot sees the full registration surface in one place; the handler
 * bodies, validation, persistence, and rate-limit logic live in the capture-* siblings:
 *   - capture-http / capture-observations / capture-session-store — shared kernel
 *   - capture-staff   — create / list / rotate / revoke (staff)
 *   - capture-access  — exchange / renew / manifest (public)
 *   - capture-upload  — upload intent / completion (public)
 *   - capture-submit  — submit / materialisation (public)
 */

import { app } from '@azure/functions';
import { withRole } from '../../platform/auth/staff-auth.js';
import {
  createCaptureSessionHandler,
  listCaptureSessionsHandler,
  revokeCaptureSessionHandler,
  rotateCaptureSessionHandler,
} from './capture-staff.js';
import {
  captureManifestHandler,
  exchangeCaptureSecretHandler,
  renewCaptureAccessHandler,
} from './capture-access.js';
import {
  completeCaptureUploadHandler,
  createCaptureUploadHandler,
} from './capture-upload.js';
import { submitCaptureSessionHandler } from './capture-submit.js';

app.http('createCaptureSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/capture-sessions',
  handler: withRole('CollisionSpike.User', createCaptureSessionHandler),
});

app.http('listCaptureSessions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/capture-sessions',
  handler: withRole('CollisionSpike.User', listCaptureSessionsHandler),
});

app.http('rotateCaptureSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'capture-sessions/{id}/rotate',
  handler: withRole('CollisionSpike.User', rotateCaptureSessionHandler),
});

app.http('revokeCaptureSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'capture-sessions/{id}/revoke',
  handler: withRole('CollisionSpike.User', revokeCaptureSessionHandler),
});

app.http('exchangeCaptureSecret', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'public/capture/exchange',
  handler: exchangeCaptureSecretHandler,
});

app.http('renewCaptureAccess', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'public/capture/renew',
  handler: renewCaptureAccessHandler,
});

app.http('captureManifest', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'public/capture/sessions/{id}',
  handler: captureManifestHandler,
});

app.http('createCaptureUpload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'public/capture/sessions/{id}/uploads',
  handler: createCaptureUploadHandler,
});

app.http('completeCaptureUpload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'public/capture/sessions/{id}/uploads/{assetId}/complete',
  handler: completeCaptureUploadHandler,
});

app.http('submitCaptureSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'public/capture/sessions/{id}/submit',
  handler: submitCaptureSessionHandler,
});
