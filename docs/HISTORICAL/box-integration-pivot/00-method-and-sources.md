# 00 — Method, confidence & sources

## How this dossier was produced

This is not a single‑pass web search. It was produced by a deep‑research workflow with three stages,
deliberately separating *grounding in our own system* from *external fact‑finding* from *adversarial
verification*, so that the conclusions are checkable rather than asserted:

1. **Ground (3 parallel agents).** Read the local Box admin/help documentation mirror
   (`automationsresearch/box/markdown`, 100+ files) and mapped the **current collisionspike system**
   (architecture, flows, where evidence is stored, the Case/PO model, the queue model) and the
   **integration constraints** (the Code App CSP, the connector rules, chasers, dedup).
2. **Research (7 parallel web angles).** File Request · Webhooks · plans/pricing/storage · API auth ·
   Power Automate connector + embedding · value‑add features (AI/Metadata/Relay/Doc Gen/Governance) ·
   Azure cost. Each angle fetched **primary Box developer/support/pricing pages** and returned findings
   with source URLs.
3. **Verify (19 adversarial agents, 2–3 per claim).** The eight load‑bearing claims the proposal rests
   on were each handed to independent verifiers instructed to **try to refute** them against primary
   sources and default to "uncertain/refuted" if they could not confirm. The verdict for each claim is
   the majority of its votes.

Totals: 29 agents, ~510 tool calls, ~2.16M tokens of subagent work. The verified dossier the workflow
returned is the evidence base for files 01–07.

## How to read the confidence

- **Confirmed** — primary Box documentation states it directly; multiple verifiers agreed.
- **Partly true** — the capability is real but the claim as worded overstates or mis‑attributes
  something material; the caveat is the operative fact. (Six of the eight claims are here — read the
  caveats, not just the headline.)
- Where a fact rests on **inference** (e.g. "a File‑Request upload fires `FILE.UPLOADED`" — true by
  composition but never stated end‑to‑end by Box), it is flagged as **live‑test before relying**.

## Known gaps (things to confirm against a live Box tenant / sales quote)

- **GBP pricing.** box.com renders all prices client‑side in JavaScript, so the figures here are **USD
  list** (corroborated across Vendr / Costbench / G2), not a UK GBP quote. Get a sales quote for GBP and
  any negotiated discount.
- **Business‑Starter eligibility for File Request** is ambiguous in Box's own wording — treat standard
  **Business** as the safe floor for File Request, webhooks and CCG (the whole base pivot); **Business
  Plus** is needed **only** for the optional metadata‑capture form field.
- **Whether CCG specifically requires Enterprise vs works on Business** is not stated on any primary
  page — the auth guides only say "a Box enterprise account." Verify on the actual tenant.
- **File‑Request → `FILE.UPLOADED` firing** and **email‑to‑folder upload firing** are inferences — live‑test.
- **Per‑add‑on dollar pricing** (AI Units $/unit beyond the ~$10/1,000 headline, Shield, Governance,
  Doc Gen, Relay) is gated behind Box sales.
- **Box Zones / UK data residency** for claimant PII requires Enterprise + 10 seats + a consulting
  package per the local admin docs — at odds with the "few seats" profile; re‑verify if residency is
  mandated.

## Primary sources (selected, by topic)

**File Request**
- https://developer.box.com/guides/file-requests/ · /template · /copy
- https://developer.box.com/reference/post-file-requests-id-copy/ · /reference/put-file-requests-id/ · /reference/resources/file-request/
- https://support.box.com/hc/en-us/articles/360045304813-Using-File-Request-to-get-Content-from-Anyone
- https://support.box.com/hc/en-us/articles/360044783734-Box-File-Request-FAQ
- https://support.box.com/hc/en-us/articles/360045304653-Administering-Box-File-Request

**Webhooks**
- https://developer.box.com/guides/webhooks/triggers/ · /v2/ · /v2/limitations-v2/ · /v2/create-v2/ · /v2/signatures-v2/
- https://learn.microsoft.com/en-us/azure/connectors/connectors-native-reqres (Power Automate Request trigger as a target)

**Plans / pricing / storage**
- https://www.box.com/pricing · /pricing/biz · /pricing/biz-plus · /pricing/starter · /pricing/platform
- https://support.box.com/hc/en-us/articles/360043697314-Understand-the-Maximum-File-Size-You-Can-Upload-to-Box
- https://www.box.com/legal/fairusepolicy

**API auth**
- https://developer.box.com/guides/authentication/select/ · /client-credentials/ · /client-credentials/client-credentials-setup/
- https://developer.box.com/guides/authorization/platform-app-approval/
- https://developer.box.com/guides/api-calls/permissions-and-errors/scopes · /rate-limits/
- https://developer.box.com/guides/authentication/tokens/ · /tokens/downscope/

**Power Automate connector + embedding**
- https://learn.microsoft.com/en-us/connectors/box/
- https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/content-security-policy
- https://developer.box.com/guides/embed/box-embed/ · /guides/embed/ui-elements/* · /guides/security/cors/

**Value‑add (AI / Metadata / Relay / Doc Gen / Governance)**
- https://developer.box.com/guides/box-ai/ · /reference/post-ai-ask/ · /reference/post-ai-extract-structured/
- https://support.box.com/hc/en-us/articles/51958279200147-Understanding-AI-Units-In-Box
- https://support.box.com/hc/en-us/articles/29347206309395-Box-AI-for-Hubs
- https://developer.box.com/reference/post-metadata-queries-execute-read/
- https://developer.box.com/guides/docgen/ · https://support.box.com/.../Workflow-Trigger-API (Relay)
- https://developer.box.com/reference/resources/retention-policy · /reference/post-legal-hold-policies/

**Azure cost**
- https://learn.microsoft.com/en-us/azure/storage/blobs/archive-cost-estimation
- https://learn.microsoft.com/en-us/power-platform/admin/capacity-storage

**Our own system (grounding)**
- `CURRENT_STATUS.md`, `docs/architecture/{live-environment,data-model,integrations,microsoft-stack}.md`,
  `docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md`, `dataverse/schema/evidence.json`,
  `flows/definitions/*.definition.json`, `mockup-app/src/mock/queues.ts`.
