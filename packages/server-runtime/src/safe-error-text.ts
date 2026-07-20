/**
 * Truncated, error-neutral read of an error-response body for log/throw context (TKT-275 / PLAN-012).
 * Consolidates the byte-identical `safeText` helper that the three orchestration transport adapters
 * (graph, functions-client, data-api-http) each defined: a 500-char cap and a `'<no body>'` sentinel.
 */
export async function safeErrorText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
