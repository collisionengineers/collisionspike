/**
 * Best-known Case VRM / reference across the intake pipeline's three possible sources —
 * the parsed instruction document (most reliable — ADR-0006, document is authoritative),
 * a cheap subject/body regex sniff (`candidateVrm`/`candidateRef`, computed pre-parse in
 * `fetchMessage.ts`), and the classifier's own body extraction (`bodyVrm`/`bodyCaseref`,
 * `classifyInbound.ts`). Centralizes a precedence expression that was previously repeated
 * inline at multiple call sites in `intakeOrchestrator.ts` and `caseResolve.ts` (PLAN-014
 * Slice 0) — those call sites fell into two genuinely different 2-way chains depending on
 * whether a parse result existed yet at that point in the pipeline (`candidate || body`
 * before parse ran; `parser || candidate` after); these helpers generalise both into one
 * 3-way chain. A caller that omits a field (e.g. no `parserVrm` because parse hasn't run
 * yet at that call site) degrades to exactly the narrower chain it used before — this is a
 * synthesis of the two existing chains, not a behavioural change.
 *
 * Deliberately NOT used for: `caseResolve.ts`'s own `candidateRef || parserRef` (candidate
 * wins there — a retro-discovered, verified Case/PO must outrank a freshly parsed one), or
 * TKT-102's `triedVrm` (means "what did we already try and fail on before this parse
 * result existed" — must never include the parse result it predates).
 */
export function resolveCaseVrm(sources: {
  parserVrm?: string;
  candidateVrm?: string;
  bodyVrm?: string;
}): string {
  return (sources.parserVrm || sources.candidateVrm || sources.bodyVrm || '').trim();
}

export function resolveCaseRef(sources: {
  parserRef?: string;
  candidateRef?: string;
  bodyCaseref?: string;
}): string {
  return (sources.parserRef || sources.candidateRef || sources.bodyCaseref || '').trim();
}
