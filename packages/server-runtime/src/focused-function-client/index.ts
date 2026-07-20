/**
 * Focused-Function HTTP transport core (TKT-262 / PLAN-008). The `x-functions-key` sibling of
 * {@link ../data-api-http-core.ts}'s MSI-bearer `request`: the single home for the
 * fetch-with-function-key plumbing that the orchestration `functions-client` and the Data-API
 * `service-client` each hand-rolled — base URL + optional key header, JSON body, `res.ok` check,
 * an opt-in `AbortController` timeout, and the 204 path.
 *
 * Like the MSI-bearer core this is ERROR-NEUTRAL. The caller resolves `baseUrl`/`functionKey`
 * (each service keeps its own env names and its own missing-config message and URL-vs-URL+KEY
 * guard) and supplies `mapError`, so each service keeps its EXACT observable contract:
 * orchestration RETAINS the upstream body in a plain `Error` for its Durable logs and throws so
 * the Durable retry policy re-runs the activity; the Data API DRAINS and DISCARDS the body
 * (customer-data redaction) and throws a typed {@link FunctionCallError} carrying status only.
 * Neither policy is ever forced onto the other — that separation is the whole point of the seam.
 *
 * It is deliberately NOT `request`/`post`: that core mints the `DATA_API_AUDIENCE` bearer, this one
 * carries a per-service function key to a focused Python service. It also adds NO retry — the two
 * callers rely on the Durable retry policy (orchestration) and best-effort caller `try/catch`
 * (Data API) respectively, so `withRetry` is deliberately absent here.
 */

export interface FocusedFnContext {
  method: string;
  /** The path passed to the request (the verbatim tail of the URL). */
  path: string;
  /** Optional short label a mapper may prefer over `path` (orchestration's route sans `/api/`). */
  label?: string;
}

/** Non-2xx handler: builds (does not throw) the `Error` the core will throw for `res`. */
export type FocusedFnErrorMapper = (
  res: Response,
  context: FocusedFnContext,
) => Promise<Error> | Error;

export interface FocusedFnRequestOptions {
  /** Already-resolved base URL; `path` is appended to it verbatim. */
  baseUrl: string;
  /** Already-resolved function key; the `x-functions-key` header is set only when present. */
  functionKey?: string;
  method: string;
  /** Path appended verbatim to `baseUrl`. */
  path: string;
  /** JSON request body. Absent → no body and no `Content-Type` (the GET/plain contract). */
  body?: unknown;
  /** Abort after this many ms. Absent → no `AbortController` (the unbounded parser/enrich path). */
  timeoutMs?: number;
  /** Per-service non-2xx → error mapper. The core never decides the error contract. */
  mapError: FocusedFnErrorMapper;
  /** Return `undefined` for a 204 instead of parsing JSON (orchestration's contract). */
  emptyOn204?: boolean;
  /** Short label threaded into `mapError`'s context and the timeout error. */
  label?: string;
  /** Abort → `Error` factory. Absent → the raw abort error propagates. */
  onTimeout?: (context: FocusedFnContext & { timeoutMs: number }) => Error;
}

/**
 * A dependency response failed. Carries the upstream status only; the body can contain customer
 * data and is deliberately NOT retained. Moved here from the Data-API service-client in TKT-262 and
 * re-exported there for back-compat.
 */
export class FunctionCallError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'FunctionCallError';
  }
}

/** Default bound for the latency-sensitive image-analysis stage calls (OCR / location-suggest). */
export const FN_STAGE_TIMEOUT_MS = 30_000;

/** The OCR Function `/plate-ocr` result — identical across both focused-Function callers (TKT-262). */
export interface PlateOcrResult {
  plate_text: string;
  confidence?: number | null;
  /** True when a plate was read (and, when case_vrm was supplied, it matched). */
  registration_visible: boolean;
  vrm_match?: string | null;
}

/**
 * Authenticated focused-Function request. Shared plumbing only; the caller owns URL resolution,
 * response typing and — via `mapError`/`onTimeout` — the observable error contract.
 */
export async function focusedFnRequest<T>(options: FocusedFnRequestOptions): Promise<T> {
  // Opt-in timeout: `undefined` => no AbortController (the parser/enrichment/Box callers whose
  // work can legitimately run long). A bounded caller aborts the fetch on the deadline.
  const controller = options.timeoutMs === undefined ? undefined : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
  const context: FocusedFnContext = {
    method: options.method,
    path: options.path,
    label: options.label,
  };
  try {
    const res = await fetch(`${options.baseUrl}${options.path}`, {
      method: options.method,
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.functionKey ? { 'x-functions-key': options.functionKey } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) throw await options.mapError(res, context);
    if (options.emptyOn204 && res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (error) {
    if (controller?.signal.aborted && options.onTimeout) {
      throw options.onTimeout({ ...context, timeoutMs: options.timeoutMs as number });
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
