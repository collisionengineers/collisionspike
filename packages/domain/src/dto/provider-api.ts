/* ============================================================
   Collision Engineers — DATA SEAM: provider API-intake DTOs (TKT-055, ADR-0020).

   The types for the provider API intake channel — the machine-to-machine POST a
   work provider's own system uses to lodge a case (instructions + images as
   Base64-in-JSON), plus the Superuser API-key management surface the SPA drives.

   Kept in a SEPARATE module (not dto/index.ts) so the frozen DataAccess contract
   is untouched: these are additive, channel-specific shapes. The SPA binds them
   through the DataAccessExt seam (mockup-app/src/data/rest-client.ts), not the
   base DataAccess interface.

   PURE TYPES ONLY. No values, no I/O.
   ============================================================ */

/* ----------  The published provider submission contract  ---------- */

/** One instruction document uploaded inline (Base64-in-JSON, v1 transport). */
export interface ProviderApiAttachment {
  /** Original file name (used for the evidence row + blob path). */
  filename: string;
  /** MIME type, e.g. 'application/pdf'. */
  contentType: string;
  /** The file bytes, Base64-encoded (NOT data-URI prefixed). */
  base64Data: string;
}

/** One photo uploaded inline. Extends the attachment with EVA image metadata. */
export interface ProviderApiImage extends ProviderApiAttachment {
  /** EVA image role. Omitted → 'unknown' (a reviewer/OCR classifies it later). */
  imageRole?: 'overview' | 'damage_closeup' | 'additional';
  /** Desired display order (>= 0). Omitted → arrival order. */
  sequenceIndex?: number;
  /** Flag the photo unusable up-front (e.g. a person's reflection is visible). */
  excluded?: boolean;
  /** Required when `excluded` is true — why the photo is unusable. */
  exclusionReason?: string;
}

/**
 * The provider API submission body (POST /api/provider-intake/cases).
 *
 * The provider identity + principal code come ONLY from the API key — they are
 * NOT part of this body and are ignored if sent. Dates are DD/MM/YYYY. The 12
 * EVA fields are derived server-side (work_provider auto-filled from the key's
 * provider display name).
 */
export interface ProviderApiSubmission {
  /** The provider's OWN case / claim reference (their number, not our Case/PO). */
  providerReference: string;
  /** Vehicle registration mark. */
  vrm: string;
  /** Vehicle make + model (EVA field 2). */
  vehicleModel?: string;
  /** Claimant name (EVA field 3). */
  claimantName: string;
  claimantTelephone?: string;
  claimantEmail?: string;
  /** Date of incident / loss — DD/MM/YYYY. */
  dateOfLoss: string;
  /** Date of instruction — DD/MM/YYYY. */
  dateOfInstruction: string;
  /** Free-text accident circumstances (EVA field 8). */
  accidentCircumstances: string;
  /** A 6-line inspection address, or the literal 'Image Based Assessment'. */
  inspectionAddress?: string;
  vatStatus?: '' | 'Yes' | 'No';
  mileage?: string;
  mileageUnit?: '' | 'Miles' | 'Km';
  /** Instruction documents (>= 1 instruction OR >= 1 image required). */
  instructions: ProviderApiAttachment[];
  /** Vehicle / damage photos. */
  images: ProviderApiImage[];
}

/** Success response for a provider submission (HTTP 201). */
export interface ProviderApiSubmissionResult {
  /** The created Case's id (GUID). */
  caseId: string;
  /** The minted Case/PO (e.g. 'CCPY26051'), or null if the provider had no principal code. */
  casePo: string | null;
}

/* ----------  API-key management (Superuser, SPA-driven)  ---------- */

/** A provider API key as listed in Admin — NEVER carries the plaintext secret. */
export interface ProviderApiKey {
  id: string;
  /** Human label the Superuser gave the key (e.g. 'Acme production'). */
  label: string;
  /** The first 12 characters of the key (e.g. 'cspk_a1b2c3d') — for display + lookup. */
  keyPrefix: string;
  /** ISO-8601 creation time. */
  createdAt: string;
  /** The Superuser who minted it (Entra oid/upn). */
  createdBy?: string;
  /** ISO-8601 revoke time, or null when the key is still active. */
  revokedAt?: string | null;
  /** ISO-8601 last-authenticated time, or null when never used. */
  lastUsedAt?: string | null;
}

/** Request body for minting a new key. */
export interface CreateProviderApiKeyInput {
  label: string;
}

/**
 * The one-time result of minting a key. `plaintextKey` is shown ONCE and never
 * stored — only its SHA-256 hash is persisted. The UI must warn the operator to
 * copy it before dismissing the dialog.
 */
export interface CreateProviderApiKeyResult {
  id: string;
  keyPrefix: string;
  /** The full secret (e.g. 'cspk_…'). Shown once; not recoverable afterwards. */
  plaintextKey: string;
}
