# Research — "what would ACTUALLY help" (2026-06-18)

Four parallel research lanes assessed features / implementations / integrations that genuinely move the
needle for the `collisionspike` case-intake spike — grounded in [CURRENT_STATUS.md](../../CURRENT_STATUS.md),
the [ROADMAP](../../ROADMAP.md), and the [data analysis](../../raw/principalandrepairersheets/outputs/reports/).
Each lane rates items **value (H/M/L) × effort (S/M/L)**, gives a data-grounded "why it helps here," and an
explicit **Do-NOT-do-yet** list.

| Lane | Doc | Scope |
|---|---|---|
| 0 | [`00-strategy.md`](./00-strategy.md) | Cross-cutting prioritization, anti-features, next-3-moves, north star |
| 1 | [`01-power-platform-native.md`](./01-power-platform-native.md) | Copilot, AI Builder, Dataverse search/audit, Power Automate patterns, Power BI/Pages, ALM/DLP |
| 2 | [`02-azure-ai-document.md`](./02-azure-ai-document.md) | Document Intelligence/OCR, Azure OpenAI, AI Search, Maps vs postcode.io, Service Bus, observability, cost |
| 3 | [`03-domain-workflow.md`](./03-domain-workflow.md) | EVA Sentry REST, Box, chasers, dedup/matching, address-matching, enrichment, dormancy, image rules |

## The convergent answer (all four lanes agree)

**The frontier is not "build more app" — it's flip the built slice to running on one real input, then widen the corpus that makes matching good.** Concretely, the next moves in order:

1. ✅ **DONE 2026-06-18 — Live email intake activated on `digital@` mailbox.** `CS Intake` / Provider Match / Case Resolve ON; test email created a real `cr1bd_cases` row. New #1: corpus incorporation + downstream-flow activation (Classify+Persist, Parse, Status Evaluate, Enrich) + parser CSP/connector fix.
2. **Incorporate the confirmed provider corpus into Dataverse** — *Claude, in parallel*, pure data, no inbox contact (`docs/plans/phase-1-intake-and-case-tracking/corpus/dataverse-corpus-incorporation.md`). Widens from a 45-row seed toward the real **active** base (the 137 off-jobsheet principals) and lays the `Repairer`/`InspectionAddress`/yard rows the next move needs.
3. **Address-matching service (with the fast-confirm queue)** — *Claude, depends on #2*. **The single highest-leverage thing the data unlocks**: ~35% of the 7,474 part-postcode cases are pre-solved from each principal's own repeat-postcode history, so the operator confirms a volume-ranked queue with one click (one confirm = **814 QCL cases at M12 5FX**) instead of researching 638 districts. Resolves the 57%-part-postcode data-quality gap → EVA field 9. postcode.io, `AZURE_MAPS_ENABLED=false`.
4. **EVA JSON drag-drop → EVA test + Box** — *operator (B5)*. Proves the 12-field contract end-to-end **before** any REST work.

**Per-lane top pick:** L1 → **Managed Environments + DLP + Dataverse search + Power Automate retry/try-catch** (governance & reliability, free with the Premium licence Code App users already need). L2 → **Document Intelligence `prebuilt-read` to close the scanned-PDF OCR gap (B-full)**, feeding the *existing* parser rules (zero new infra, ~£0 at volume). L3 → **address-matching fast-confirm**. L0 → the sequence above.

## Explicit anti-features (don't build yet — and why)

- **EVA Sentry REST API** before the drag-drop JSON path is validated — the *contract* is the risk, not the transport (ADR-0005).
- **Image-classification AI / reflection detection** before intake works — M1 only needs registration-OCR; Custom Vision & Image Analysis 4.0 **retire 2028-09-25** (ADR-0009).
- **Azure AI Search** — no unstructured corpus yet; always-on $75–250/mo breaks the ≈£0-idle posture (an M3 Copilot/RAG decision).
- **Service Bus / Durable Functions** pipeline migration — the 10 cloud flows already orchestrate it and own the connectors.
- **Custom DI extraction-model training** — needs labelled real docs → collides with "no mock data."
- **Mock/seed *case* data** to make the app look populated — hides the real gate (the unbound Outlook connection); explicitly forbidden.
- **Loading the deferred corpus slices** (partial-postcode guesses, paper providers, red-herrings, unconfirmed code-drift) — operator-confirmed clarifying-info phase only.
- **Low-code Dataverse plug-ins** — preview, "not for production," being superseded by Dataverse Functions; keep dedup/transactional logic in flows.

## ⚠️ Pricing/licensing corrections surfaced (propagate to `microsoft-stack.md`)

- **AI Builder credits retire 2026-11-01** — seeded Premium credits removed, new add-on purchase closed, usage shifts to Copilot Credits. "AI Builder ≈ $0" is wrong for this build's timeframe. (Moot anyway — AI Builder document processing duplicates the already-live free deterministic parser.)
- **Copilot Studio is now Copilot-Credit metered** ($200/mo ≈ 25k credits, or $0.01/credit) — the old "$0–30/mo" figure is light. (`COPILOT_ENABLED` stays off; M3+.)
- The all-Microsoft, gated, ≈£0-idle posture otherwise holds: parser on FC1, postcode.io for addresses, DI Read only for the OCR misses (500 free pages/mo), Key Vault/managed-identity reused.
