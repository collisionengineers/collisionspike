# Verification — TKT-021: Resolve Connexus claims-manager to the real provider (PCH/SBL)

## Verdict
**PENDING** (2026-07-10) — the sweep reopened the ticket same-day for the explicit-reason shortfall;
the **fix is deployed** (below) and the ticket is back in verify awaiting the next unresolved
Connexus arrival to prove the new wording live.

> **Reopen-fix deployed (2026-07-10, azure-integration-engineer dispatch):** `buildHeldReason()`
> (`api/src/functions/internal.ts:846-917`, Held seam rewired at 1269-1332) — three handler-plain
> shapes: unknown sender keeps the New-client wording **verbatim**; known intermediary + principal
> unresolved → note "Held — intermediary sender" ("Intermediary sender (Connexus): the instructing
> provider could not be determined from the instruction. Candidates: Performance Car Hire, SBL. …")
> + audit "Intermediary sender routed to Held (principal unresolved)"; known intermediary +
> content-resolved provider → "…the instructions identify <provider> as the provider…" (prevents a
> false "could not be determined" on acceptance-arm-2's path). Name lookups best-effort (failure
> degrades wording, never blocks intake); the audit `after` carries `intermediary: true` +
> `imageSourceId` + `candidateProviderIds`. 6 new tests pin both branches (api **421/421**); deployed
> to `cespk-api-dev` (96 fns, ARM state Running, no-auth 401 healthy). Details:
> [changes.md](./changes.md) §2026-07-10; reopen rationale:
> [reopen follow-up](./evidence/reopen-followup-100726.md).

## Sweep verdict (transcribed verbatim, 2026-07-10; W5 data pass appended)

Verdict: PENDING.

- **Acceptance 1 — "no longer flagged as a new enquiry/customer" (matcher + classifier arms
  PROVEN):** KQL (orch, 168h): **16/16** `connexus.co.uk` arrivals (07-06 → 07-10 15:46Z) hit
  `providerMatch outcome=intermediary`, stable imageSourceId `6304c102…`, **`candidateCount=2` on
  every event** — the D8 Connexus→{PCH,SBL} N:N is live in the matcher; zero direct matches, zero
  plain-unmatched. Classification stitch (2150 pipeline events): **0 of 16** classified
  `query_new_enquiry`; 12 non-work arrivals correctly never minted; the 07-07 14:37 Connexus ack was
  suggest-attached onto the earlier Connexus case by VRM. 10 `triage_decision` customEvents carry
  `intermediaryImageSourceId` + candidate ids end-to-end.
- **Acceptance 2 — "indicates PCH → PCH; indicates SBL → SBL" (mechanism live; no Connexus-specific
  live occurrence yet):** the content-string → `work_provider_id` fill with the corroboration label
  is deployed and unit-tested (`internal.ts:461-487`); `candidateCount=2` live proves both principals
  are candidates; TKT-051's W5 pass proved the content arm fires live at volume (84 rows) on other
  providers. TKT-065's 1c single-candidate fallback is **deliberately inapplicable** to Connexus
  (2 candidates — ">1 stays a human decision"); the content lane is the only Connexus resolver.
- **Acceptance 3 — "held for review with explicit unresolved-principal reason; no spurious new
  customer" (Held PROVEN; explicit-reason clause NOT implemented as written):** both creates
  `mode=manual` → `on_hold=true` + `needs_review`, no Case/PO; no intake path creates `work_provider`
  rows. **Real gap:** the case-visible reason is the **generic** 'New client — no work provider
  matched for sender @connexus.co.uk' note — there is **no** "intermediary — principal unresolved"
  reason on the case (the intermediary context lands only in the case-less global audit row and
  telemetry). The deployed code fails this clause as written.

### W5 data-pass results (orchestrator-run, 2026-07-10)
- **S1:** both live Connexus-created cases (`4f2201fa` 07-07, `186e46c2` 07-10) — `case_po` NULL,
  `on_hold=t`, `work_provider_id` NULL. `186e46c2` (the "Letter 00118942.pdf" candidate) did **not**
  content-resolve — S3 shows parser provenance for vehicleModel/claimantName/dateOfLoss/
  dateOfInstruction/vatStatus but **no workProviderId row**: the letter carried no parseable provider
  name (expected absence — correctly Held, never guessed). Its create audit captured
  "Your Ref: A.pch26171, Our ref: 570306".
- **S2:** **9 distinct Connexus-born cases** since D8 (incl. 5 drain-minted retro cases created 07-10
  15:38–15:46 from 07-01→07-07 emails) — ALL `on_hold=t`, ALL principal NULL: never resolved AS
  Connexus, never guessed, including through the TKT-140 drain.
- **S4a:** both sampled cases carry the generic 'New client — no work provider matched for sender
  @connexus.co.uk' note — confirming the acceptance-3 gap.
- **S4b:** 16 global `provider-match intermediary (Connexus) for connexus.co.uk` audit rows
  (case-less) + per-case 'New client routed to Held (no work provider matched)'.
- **S5a:** **0 rows** — no Connexus work_provider exists (structural never-AS-Connexus proof).
- **S5b:** image_source Connexus/connexus.co.uk → exactly **PCH + SBL** (matches live
  candidateCount=2).

### Expected absences (not failures)
No SBL-content occurrence yet; `4f2201fa` carried no document; `new_client_work` subtype on work
arrivals is the documented Phase-3 design (matchState stays 'unmatched'). Minor: only 10/16 arrivals
appear in `triage_decision` customEvents (sampling/ingestion; traces have all 16).

Verified by: ticket-verifier dispatch, 2026-07-10.

## Prior verdict (2026-07-02, superseded)
CODE DEPLOYED (2026-07-02) — activation pending the D8 seed delta

## Evidence
- `3a772d1` (2026-07-02) deploys `matchSenderIdentity` (address-level provider > intermediary >
  domain-level provider) and extends the provider-match records to carry an intermediary `image_source` +
  its N:N `work_provider` candidates ([`packages/domain/src/domain/sender-identity-match.ts`](../../../../packages/domain/src/domain/sender-identity-match.ts),
  unit-tested). This is live on `cespk-api-dev` / `cespk-orch-dev`.
- The **data** side — a `connexus.co.uk` intermediary `image_source` row joined N:N to PCH + SBL — is
  authored as the operator-gated delta
  [`2026-07-02-rules-engine-v2-identification.sql`](../../../../migration/assets/schema/deltas/2026-07-02-rules-engine-v2-identification.sql)
  (gated.md **§D8**) and is **not yet applied** to the live database. Until it lands, the code path is
  live-safe but degrades to today's behaviour (an empty intermediary candidate list) per the delta's own
  "Unblocks (not blocks)" note.

## Pending / gaps
- 🔒 D8 seed apply (operator, [docs/gated.md](../../../gated.md) §D8) — required before a Connexus email can
  resolve to PCH/SBL instead of "new enquiry".
- No live probe yet against a real Connexus email post-seed (can't be exercised until D8 lands).

## How to re-verify
After D8 is applied: re-intake a real Connexus email and confirm it is no longer flagged as a new
enquiry/customer — it resolves to PCH when the email/attachment indicates PCH, to SBL when it indicates
SBL, and holds for review with an explicit unresolved-principal reason when neither can be determined.
