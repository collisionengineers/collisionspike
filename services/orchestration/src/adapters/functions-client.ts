/** *
 * Shared typed HTTP calls to the focused Python services.
 *
 * The Box facade (CCG token mint) stays inside the `box-webhook` Function — the Box
 * orchestrations call its HTTP routes; they never re-mint Box tokens (plan 22 §C).
 *
 * App-settings: PARSER_FN_URL/PARSER_FN_KEY,
 *   BOXWEBHOOK_FN_URL/BOXWEBHOOK_FN_KEY, EVASENTRY_FN_URL/EVASENTRY_FN_KEY,
 *   LOCATION_FN_URL/LOCATION_FN_KEY.
 * Vehicle enrichment is intentionally not exposed here: the dedicated enrich
 * activity is the sole caller of the vehicle-data.v1 service and owns its
 * advisory retry/error semantics.
 */

interface FnTarget {
  urlEnv: string;
  keyEnv: string;
}

const PARSER: FnTarget = { urlEnv: 'PARSER_FN_URL', keyEnv: 'PARSER_FN_KEY' };
const BOX: FnTarget = { urlEnv: 'BOXWEBHOOK_FN_URL', keyEnv: 'BOXWEBHOOK_FN_KEY' };
const EVA: FnTarget = { urlEnv: 'EVASENTRY_FN_URL', keyEnv: 'EVASENTRY_FN_KEY' };
const LOCATION: FnTarget = { urlEnv: 'LOCATION_FN_URL', keyEnv: 'LOCATION_FN_KEY' };
const OCR: FnTarget = { urlEnv: 'OCR_FN_URL', keyEnv: 'OCR_FN_KEY' };

async function callFunction<T = unknown>(
  target: FnTarget,
  method: string,
  route: string,
  body?: unknown,
): Promise<T> {
  const base = process.env[target.urlEnv];
  const key = process.env[target.keyEnv];
  if (!base) throw new Error(`missing app-setting ${target.urlEnv}`);
  const url = `${base.replace(/\/$/, '')}/api/${route.replace(/^\//, '')}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'x-functions-key': key } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // Throw so the Durable retry policy retries the calling activity (plan 22 §B).
    throw new Error(`fn ${method} ${route} → ${res.status}: ${await safeText(res)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ---------- parser ---------- */

export function callParser(caseId: string): Promise<unknown> {
  return callFunction(PARSER, 'POST', 'parse', { caseId });
}

/** Result of the parser's deterministic /classify-email route (ADR-0015). */
export interface ClassifyEmailResult {
  category: string;
  subtype: string;
  confidence?: number;
  signals?: string[];
  body_vrm?: string;
  body_caseref?: string;
  body_jobref?: string;
  /** True when the email is a reply about existing work (#3). Default false; the route
   *  derives it from in_reply_to/references when supplied, else a RE:-subject heuristic. */
  is_reply?: boolean;
  /** Append-only taxonomy generation, when supplied by the classifier. */
  taxonomy_version?: number;
}

/**
 * Email triage classifier — the parser's deterministic `/classify-email` route
 * (ADR-0015). Field names match the route contract EXACTLY (`from`, `sender_domain`,
 * `provider_match_state`, `attachment_kinds`, `has_attachments`); the route strips
 * HTML server-side. Always-on (deterministic); EMAIL_AI_ENABLED gates only the later
 * optional LLM refinement, never this call.
 */
export function callClassifyEmail(input: {
  subject?: string;
  body?: string;
  from?: string;
  senderDomain?: string;
  /** Recipient-stamped Authentication-Results header for authenticated sender rules. */
  authenticationResults?: string;
  providerMatchState?: string;
  attachmentKinds?: string[];
  attachmentFilenames?: string[];
  hasAttachments?: boolean;
  /** RFC In-Reply-To / References headers — make is_reply detection reliable (#3). */
  inReplyTo?: string;
  references?: string;
}): Promise<ClassifyEmailResult> {
  return callFunction(PARSER, 'POST', 'classify-email', {
    subject: input.subject ?? '',
    body: input.body ?? '',
    from: input.from ?? '',
    sender_domain: input.senderDomain ?? '',
    authentication_results: input.authenticationResults ?? '',
    provider_match_state: input.providerMatchState ?? '',
    attachment_kinds: input.attachmentKinds ?? [],
    attachment_filenames: input.attachmentFilenames ?? [],
    has_attachments: input.hasAttachments ?? false,
    in_reply_to: input.inReplyTo ?? '',
    references: input.references ?? '',
  });
}

/* ---------- parser image extraction (pdf-image-extraction ticket) ---------- */

export interface ExtractedImage {
  filename: string;
  ext: string;
  content_type: string;
  size: number;
  sha256: string;
  content_base64: string;
  sequence_index: number;
}

/**
 * Pull embedded images out of an instruction document (PDF/DOCX/DOC) via the parser
 * `/extract-images` route. Returns the image BYTES (base64) + sha/metadata so the
 * orchestration can persist each as image evidence. A document with no embedded images
 * returns `{ count: 0 }`; a non-2xx (422 unreadable / 502 dep) throws so the caller can
 * skip-or-retry.
 *
 * TKT-143 — `provider` (the resolved work-provider PRINCIPAL code, e.g. QDOS) and `vrm`
 * are threaded through when KNOWN so the engine's filename stems carry real identity
 * (`QDOS_AB12CDE_img_1_1.png`); both are OMITTED when unknown and the engine keeps its
 * neutral `img_<page>_<n>` stems (the TKT-090 omit-when-unknown rule, unchanged).
 */
export function callExtractImages(input: {
  documentBase64: string;
  filename: string;
  provider?: string;
  vrm?: string;
}): Promise<{ count: number; images: ExtractedImage[]; message?: string }> {
  return callFunction(PARSER, 'POST', 'extract-images', {
    document: input.documentBase64,
    filename: input.filename,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.vrm ? { vrm: input.vrm } : {}),
  });
}

/* ---------- plate OCR (registration-visible detection, ADR-0009 M1) ---------- */

export interface PlateOcrResult {
  plate_text: string;
  confidence?: number | null;
  /** True when the OCR read a plate (and, when case_vrm supplied, it matched). */
  registration_visible: boolean;
  vrm_match?: string | null;
}

/**
 * Read a UK registration plate from a vehicle photo via the OCR Function `/plate-ocr`
 * route (`cespkocr-fn-dev`). Used to set `registration_visible` on extracted images.
 * `filename` MUST carry a raster image extension (.jpg/.jpeg/.png/…). Throws on a
 * non-2xx so the caller (best-effort) can fall back to "OCR not run" (NULL tri-state).
 */
export function callPlateOcr(input: {
  imageBase64: string;
  filename: string;
  caseVrm?: string;
}): Promise<PlateOcrResult> {
  return callFunction(OCR, 'POST', 'plate-ocr', {
    image: input.imageBase64,
    filename: input.filename,
    ...(input.caseVrm ? { case_vrm: input.caseVrm } : {}),
  });
}

/* ---------- scanned-PDF OCR fallback (OCR_SCANNED_PDF_ENABLED) ---------- */

/**
 * OCR Function `/ocr-pdf` response envelope (`cespkocr-fn-dev`;
 * services/functions/ocr/function_app.py
 * `ocr_pdf`). Deliberately mirrors the parser `/api/parse` envelope so the parse activity
 * can coalesce one shape: `extraction` is the same 12-EVA-key map (or null when the engine
 * produced only raw text), `vrm`/`reference` are the same Case-identity cells, plus
 * `ocr_text`/`page_count`/`ocr_provider` the parser envelope does not carry.
 */
export interface OcrPdfResult {
  extraction: Record<string, { value?: string } | null> | null;
  vrm: { value?: string } | null;
  reference: { value?: string } | null;
  ocr_text: string;
  page_count: number;
  ocr_provider: string;
  issues: unknown[];
  contract_version: string;
}

/**
 * OCR an image-only / scanned instruction PDF via the OCR Function `/ocr-pdf` route
 * (a SEPARATE container host from the FC1 parser — it carries the `tesseract` binary FC1
 * cannot). Mirrors `callPlateOcr`: `filename` MUST end `.pdf` (the host rejects anything
 * else 400). Throws on a non-2xx so the caller (the parse activity, best-effort) can
 * fall back to the text-only parse result and never block intake.
 */
export function callOcrPdf(input: {
  documentBase64: string;
  filename: string;
  providerHint?: string;
}): Promise<OcrPdfResult> {
  return callFunction(OCR, 'POST', 'ocr-pdf', {
    document: input.documentBase64,
    filename: input.filename,
    ...(input.providerHint ? { provider_hint: input.providerHint } : {}),
  });
}

/* ---------- parser .eml explode (ADR-0022 R2 retro reconstruction) ---------- */

export interface ExplodedEmlAttachment {
  filename: string;
  content_type: string;
  size: number;
  sha256: string;
  content_base64: string;
}

/** The parser `/explode-eml` contract (explode_eml_v1) — an archived original
 *  instruction `.eml` unpacked into headers/body/attachments. */
export interface ExplodedEml {
  subject: string;
  from: string;
  to: string;
  date_iso: string;
  message_id: string;
  in_reply_to: string;
  references: string;
  body_text: string;
  attachments: ExplodedEmlAttachment[];
  skipped: Array<{ filename: string; reason: string }>;
  contract_version: string;
}

/**
 * Unpack a Box-archive `.eml` via the parser wrapper route (Python stdlib email —
 * no engine involvement). Signature-sized rasters are dropped server-side
 * (TKT-047 doctrine); nested message/rfc822 parts come back re-emitted as `.eml`
 * attachments (the forwarded-instruction case).
 */
export function callExplodeEml(input: {
  documentBase64: string;
  filename?: string;
}): Promise<ExplodedEml> {
  return callFunction(PARSER, 'POST', 'explode-eml', {
    document: input.documentBase64,
    ...(input.filename ? { filename: input.filename } : {}),
  });
}

/* ---------- EVA Sentry submit ---------- */

export function callEvaSubmit(caseId: string): Promise<unknown> {
  return callFunction(EVA, 'POST', 'submit', { caseId });
}

/* ---------- location-suggest ---------- */

export function callLocationSuggest(caseId: string): Promise<unknown> {
  return callFunction(LOCATION, 'POST', 'suggest', { caseId });
}

/* ---------- Box facade (box-webhook Function) ---------- */

export const box = {
  getFolder(folderId: string): Promise<{
    id: string;
    name?: string;
    parent?: { id?: string };
    path_collection?: { entries?: Array<{ id?: string }> };
  }> {
    return callFunction(BOX, 'GET', `box/folders/${folderId}`);
  },
  createFolder(
    name: string,
    parentId: string,
  ): Promise<{ id: string; name?: string; outcome?: 'created' | 'reused' }> {
    return callFunction(BOX, 'POST', 'box/folders', { name, parent: { id: parentId } });
  },
  /**
   * Archive one evidence byte-stream into a case Box folder — the one-way
   * Blob -> Box mirror (ADR-0012; box-sync ticket). The bytes ride as base64 in a
   * JSON body (the facade carries no multipart); the box-webhook Function decodes
   * and multipart-POSTs them to upload.box.com, scope-locked to BOX_ALLOWED_ROOT_ID.
   * 409 name-conflict is an idempotent reuse server-side, so a replayed archive
   * never duplicates a file.
   */
  uploadFile(
    folderId: string,
    filename: string,
    contentBase64: string,
    contentType?: string,
  ): Promise<{ id: string; name?: string; sha1?: string; outcome?: string }> {
    return callFunction(BOX, 'POST', `box/folders/${folderId}/files`, {
      filename,
      contentBase64,
      ...(contentType ? { contentType } : {}),
    });
  },
  /**
   * TKT-142 — archive one LARGE evidence file by BLOB REFERENCE instead of inline
   * base64. Same facade route as `uploadFile`; `blobPath` and `contentBase64` are
   * mutually exclusive. The facade downloads the blob ITSELF from the evidence storage
   * account (its own managed identity; EVIDENCE_BLOB_ACCOUNT / EVIDENCE_BLOB_CONTAINER,
   * default 'evidence') and streams it to Box — direct upload <20MB, Box chunked-upload
   * session ≥20MB — so the base64-in-JSON body that killed the facade worker on a
   * 17.6MB `.eml` (~23MB encoded → 502 + small-file recycle collateral) never exists.
   * `blobPath` is the evidence row's container-relative storage_path (the exact path
   * `blob.ts` downloadEvidenceBytes takes). Idempotency unchanged: a Box 409
   * name-conflict is reused server-side.
   */
  uploadFileFromBlob(
    folderId: string,
    filename: string,
    blobPath: string,
    contentType?: string,
  ): Promise<{ id: string; name?: string; sha1?: string; outcome?: string }> {
    return callFunction(BOX, 'POST', `box/folders/${folderId}/files`, {
      filename,
      blobPath,
      ...(contentType ? { contentType } : {}),
    });
  },
  listFolderItems(
    folderId: string,
  ): Promise<{
    entries: Array<{
      id: string;
      name: string;
      /** Box item type — 'file' | 'folder' | 'web_link' (widened for the retro
       *  instruction pick, ADR-0022 R2; absent on a pre-R2 facade deploy). */
      type?: string;
      sha1?: string;
      size?: number;
      created_at?: string;
      modified_at?: string;
    }>;
  }> {
    return callFunction(BOX, 'GET', `box/folders/${folderId}/items`);
  },
  /**
   * READ-ONLY content/name search under the configured archive roots (ADR-0022 R2 —
   * the retro reconstruction's find-the-case-folder primitive). The facade validates
   * the roots server-side (RW root + BOX_READONLY_ROOT_IDS only) and post-filters
   * every hit to provable root ancestry; each hit carries its resolved caseFolder
   * (the ancestor directly under the matched root).
   */
  searchContent(input: {
    query: string;
    rootIds?: string[];
    type?: 'file' | 'folder' | 'web_link';
    contentTypes?: string[];
    limit?: number;
  }): Promise<{
    entries: Array<{
      id: string;
      name: string;
      type: string;
      size?: number;
      createdAt?: string;
      caseFolder: { id: string; name: string } | null;
    }>;
    totalCount: number;
    filteredOut: number;
  }> {
    return callFunction(BOX, 'POST', 'box/search', {
      query: input.query,
      ...(input.rootIds && input.rootIds.length ? { rootIds: input.rootIds } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.contentTypes ? { contentTypes: input.contentTypes } : {}),
      ...(input.limit != null ? { limit: input.limit } : {}),
    });
  },
  /**
   * READ-ONLY byte fetch of one archive file (ADR-0022 R2 — the original instruction
   * `.eml`/document). Size-capped server-side (base64-in-JSON transport); RO archive
   * files are allowed, writes into them never are.
   */
  downloadFile(fileId: string): Promise<{
    id: string;
    filename: string;
    size: number;
    sha1: string;
    contentBase64: string;
  }> {
    return callFunction(BOX, 'GET', `box/files/${fileId}/content`);
  },
};

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
