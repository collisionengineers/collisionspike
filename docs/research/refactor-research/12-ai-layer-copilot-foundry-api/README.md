# 12 — The AI Layer: Copilot / Copilot Studio vs Azure AI Foundry vs Direct API

> **Two questions answered here:** (1) *If we migrate off Power Platform, can we still use Copilot /
> Copilot Studio?* (2) *Would Copilot Studio even have an advantage over standard AI — a direct model
> API, or Azure AI Foundry?*
>
> **Grounding.** This isn't greenfield thinking — the repo already analysed the native AI story in
> [`docs/research/01-power-platform-native.md`](../../01-power-platform-native.md) and **deferred Copilot
> Studio to M3** ("bounded queue-work UI doesn't need conversational AI for 5 staff; real value only
> over a large closed-case history"). The `COPILOT_ENABLED` and `AIBUILDER_CLASSIFY_ENABLED` gates are
> both **off / plan-only**. This doc extends that conclusion to the *migration* decision. Facts below
> are from Microsoft Learn (June 2026), cited inline.

---

## First: what does this app actually need AI for?

The AI use cases here are **embedded and programmatic**, not conversational:

- **document understanding / field-extraction assist** (the parser pipeline),
- **classification** (email triage, image roles),
- **drafting** (chaser emails),
- **summarisation** (enrichment / MOT / valuation evidence).

None of these is a chatbot. That single fact drives the whole answer: **Copilot Studio is a
conversational-agent builder** — the wrong *shape* for a deterministic document pipeline. The one
place a copilot could help is a "chat with your cases" staff assistant — which the repo already judged
low-value for a 5-person bounded workflow and deferred.

---

## Q1 — Can we still use Copilot / Copilot Studio after leaving Power Platform?

Three different products, three different answers:

| Product | After migrating off Power Platform? | Why |
|---|---|---|
| **Microsoft 365 Copilot** (assistant in Outlook/Word/Teams) | ✅ **Unaffected** | Tenant-level, tied to M365 — independent of where the app runs. Staff keep it if licensed (~$30/user/mo). But it works over M365/Graph data, **not** your custom case app, unless you build an agent for it. |
| **Copilot Studio** (build custom agents/chatbots) | ⚠️ **Yes, but it drags Power Platform back in** | You *can* subscribe standalone and embed its web-chat agent into **any** front-end (incl. a plain React SPA) — it deploys to "any channel" and calls your backend via connectors/HTTP. **But it intrinsically runs on a Power Platform environment with Dataverse** (stores its config/state there; quotas are *"per Dataverse environment"*) and is billed in **Copilot Credits**. So adopting it **re-introduces the exact Power Platform + Dataverse dependency + licensing you're migrating away from.** |
| **Native "Copilot over your data" in Power Apps** (the auto-wired app copilot) | ❌ **Lost** | It's intrinsic to Power Apps + Dataverse. Leave those and this zero-build feature goes with them. |

**So:** M365 Copilot survives untouched. Copilot Studio survives *only* if you keep a foot in
Power Platform/Dataverse for the AI piece — which partly defeats the migration's lock-in/cost goals.
The built-in Power Apps copilot is gone.

---

## Q2 — Does Copilot Studio have any advantage vs direct API / Foundry?

For this app's needs: **little advantage, several disadvantages.** Comparison:

| Dimension | **Copilot Studio** | **Azure AI Foundry** | **Direct API (Claude / OpenAI)** |
|---|---|---|---|
| Shape | Low-code **conversational** agent builder | Managed AI **platform** (models, agents, RAG, evals) | Raw model calls in your own code |
| Model choice | Microsoft-hosted GPT family; limited | **1,900+ models incl. Claude** (`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`), OpenAI, OSS | Anything (latest Claude/GPT), full control |
| Pricing | **Copilot Credits** — $200/25k credits (~$0.008) or $0.01 PAYG; a *grounded* answer = 12 credits, *with reasoning* 112+ | Token-based (consumption) | Token-based — cheapest, most predictable |
| Control (prompts/orchestration/evals) | Low | High | **Highest** |
| Lock-in | **High** — Power Platform + Dataverse | Medium — Azure-hosted, but models reachable by API | **Lowest** — portable, any host |
| Data residency | Power Platform geo | Azure UK South; Claude-in-Foundry: Anthropic is processor | Provider's region/DPA |
| Best at | A Teams/web chatbot built & maintained by **non-developers** | Managed AI **with model choice + governance** on Azure | Embedded, programmatic AI features (this app's actual need) |
| Maintained by | Citizen developers | Developers | Developers |

### Where each genuinely wins

- **Direct API (Claude)** — best for the **embedded pipeline AI** this app actually needs (extraction
  assist, classification, drafting). Cheapest, most controllable, fully portable, no Microsoft
  dependency. **The team already has an offline LLM-assist + eval harness in `cedocumentmapper`** — so
  the muscle for this approach already exists. Works identically from *any* migration target.
- **Azure AI Foundry** — the **managed middle ground if you stay Azure-adjacent** (folder
  [01](../01-powerapps-to-azure/README.md)). You get model choice **including Claude natively**
  (`claude-opus-4-8` et al. are in the Foundry catalogue, pay-per-token, Anthropic as processor),
  plus content safety, evals, observability, and the **Agent Service / Microsoft Agent Framework**
  (which supports Claude agents — via the public Anthropic API *or* Foundry-hosted Claude). Azure
  governance + UK residency without the Power Platform low-code wrapper.
- **Copilot Studio** — wins **only** if you specifically want a **low-code conversational assistant**
  ("ask about your cases" in Teams) that **non-developers** build and maintain, and you accept the
  Power Platform/Dataverse footprint + Copilot-Credit billing. For the core intake pipeline it's the
  wrong tool.

---

## Cost reality check (Copilot Credits vs tokens)

Copilot Studio's **Copilot Credits** model (changed Sept 2025) is the catch: a plain message = 1
credit, a **generative answer over your data = 2**, a **tenant-graph-grounded answer = 12**, and
**adding reasoning can push a single response past 112 credits**. At $0.008–0.01/credit, a grounded,
reasoning agent answer can cost **~$1+ per response** — far more, and far less predictable, than the
equivalent token-based Claude/Foundry call. For high-volume programmatic use (classify every email,
extract every doc), token-based APIs win decisively on unit economics.

> ⚠️ **Related gotcha even if you *stay* on Power Platform:** **AI Builder** (which the dormant
> `AIBUILDER_CLASSIFY_ENABLED` gate targets) moved to Copilot Credits — seeded AI Builder credits are
> **removed 2026-11-01**, and new customers must buy Copilot Credits to run AI Builder features. The
> "free AI Builder credits" assumption in older planning is dead; treat any AI Builder/image-AI usage
> as net-new Copilot-Credit spend. On a migrated stack you'd do image classification via a direct
> vision API or Foundry anyway.

---

## Recommendation

1. **Keep Microsoft 365 Copilot** regardless of target — it's tenant-level and unaffected; it's the
   staff productivity assistant, not your app's AI.
2. **Do the app's AI with a direct model API (Claude) or Azure AI Foundry, not Copilot Studio.** This
   app needs *embedded* AI (extraction/classification/drafting), and direct API / Foundry beat Copilot
   Studio on control, cost, model choice, and — crucially for this exercise — **lock-in**. The
   existing `cedocumentmapper` LLM-assist + eval harness is the right foundation.
   - **Non-Microsoft target** (folders 03–08): **direct Claude/OpenAI API** — portable, ~$0
     infrastructure, calls cleanly from any host.
   - **Azure PaaS target** (folder 01): **Azure AI Foundry** — managed, Claude available natively,
     Azure governance + UK residency; or still the direct API if you want minimum Azure coupling.
3. **Only adopt Copilot Studio** if a *conversational* "ask about your cases" assistant for staff
   (Teams/web), built by non-developers, becomes a real requirement — and accept that it re-introduces
   a Power Platform/Dataverse footprint + Copilot-Credit billing. The repo already deferred this to
   **M3**; this migration analysis reinforces that, and adds: **you don't need Power Platform to build
   that assistant later** — Foundry Agent Service / Microsoft Agent Framework + Claude delivers the
   same conversational outcome with far less lock-in.

**Net:** migrating off Power Platform costs you the auto-wired Power Apps copilot and makes Copilot
Studio awkward (it pulls Dataverse back in) — but it **loses you nothing that matters for this app's
real AI needs**, and it *opens up* cheaper, more capable, more portable AI (direct Claude API, or
Claude-in-Foundry) that the per-credit Copilot model can't match.

## Sources

- Copilot Studio licensing / Copilot Credits ($200/25k, PAYG $0.01, requires Dataverse environment) — https://learn.microsoft.com/microsoft-copilot-studio/billing-licensing · https://learn.microsoft.com/power-platform/admin/powerapps-flow-licensing-faq#microsoft-copilot-studio · quotas "per Dataverse environment" https://learn.microsoft.com/microsoft-copilot-studio/requirements-quotas
- Credit consumption (grounded = 12, reasoning 112+) — https://learn.microsoft.com/microsoft-copilot-studio/requirements-messages-management · https://www.cloudzero.com/blog/copilot-studio-pricing/
- AI Builder → Copilot Credits, seeded credits removed 2026-11-01 — https://learn.microsoft.com/ai-builder/administer-licensing
- Claude models in Azure AI Foundry (`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`) — https://learn.microsoft.com/azure/foundry/foundry-models/concepts/claude-models · catalogue https://learn.microsoft.com/azure/foundry/concepts/foundry-models-overview
- Microsoft Agent Framework — Anthropic/Claude agents (public API or Foundry-hosted) — https://learn.microsoft.com/agent-framework/agents/providers/anthropic
- Embed a Copilot Studio agent in a Code App — https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-copilot-studio
- Prior repo analysis (Copilot deferred to M3) — [`docs/research/01-power-platform-native.md`](../../01-power-platform-native.md)
