# Copilot Studio staff assistant — setup & integration (ROADMAP 5c, M3, gate `COPILOT_ENABLED`)

> **Status:** planning / scaffold document. Read-only research (Microsoft Learn MCP). No agent
> authored, no tenant/Dataverse/connection changed. The Claude-buildable parts are an **offline
> design pack** + a **CSP-safe transport seam** + **gate plumbing**; the licensed authoring + publish
> are **operator-only** (🔒). Deep dive behind **ROADMAP §5c** for the Copilot half only — the
> valuation half moved to its own line. Pairs with
> [valuation-and-copilot.md](./valuation-and-copilot.md) §4–§5 (the prior decision doc this refines),
> [m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md),
> ADR-0008 (tool boundary ends at the EVA handoff),
> [docs/architecture/microsoft-stack.md](../../architecture/microsoft-stack.md) §9,
> [docs/architecture/live-environment.md](../../architecture/live-environment.md) (the live registry),
> [docs/gated.md](../../gated.md). Author date **2026-06-20**. Facts cited inline; verified-live facts
> from GROUND TRUTH + live-environment.md; Microsoft Learn claims re-verified via the docs MCP on the
> author date.

---

## 0. Milestone placement (LOCKED — read this before the rest)

**The Copilot Studio assistant is M3** — assistive / optional, gated-OFF, **off the EVA/Box critical
path**. It is **not** M1 (the working vertical slice) and **not** M2 (automation + richer transports).
M1 ships, and M2 automates, with **no** Copilot. Phases (ROADMAP 0–6) are the work-breakdown axis;
Milestones (M0–M3) are capability slices cutting across phases — a Phase is **never** a Milestone.
**§5c sub-letter "5c-Copilot" maps to exactly one milestone: M3.** (Its sibling §5c valuation is also
M3 — see [valuation-and-copilot.md](./valuation-and-copilot.md); the older
[m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md) "M2.G" valuation label is
**reconciled to M3** per this session's lock. Reconcile, don't duplicate.)

| Milestone | What it is | Copilot? |
|---|---|---|
| **M1** | One case end-to-end on the permanent-fallback transport (parser, all 3 inboxes live, DVSA enrichment, EVA JSON drag-drop, readiness gate, address-policy gate, plate-OCR) | **No** |
| **M2** | Automation + richer transports at scale (EVA Sentry REST, EVA-validation Function, Box archival, chaser-send, image classification/reflection) | **No** |
| **M3** | Assistive / optional, all gated-OFF, off the EVA/Box critical path (**valuation**, **Copilot Studio**, Azure Maps, WhatsApp bulk import, Dataverse-MCP-in-Copilot) | **Yes — this doc** |

---

## 1. TL;DR decision

**An optional Copilot Studio agent grounded on the live `CollisionSpike` Dataverse tables as a
knowledge source, for read-only staff Q&A over the Case corpus — never a pipeline actor (ADR-0008).**
It is surfaced in the Code App (and/or Teams) only when **both** `cr1bd_COPILOT_ENABLED=true` **and**
a `shared_microsoftcopilotstudio` connection is bound. Four facts shape the whole build and are
**verified on Microsoft Learn (2026-06-20)**:

1. **Dataverse search must be ON** in the `Collision Engineers - Dev` environment, or tables cannot be
   added to the agent. This is **admin-only** and the live environment has it **OFF today**
   (`isexternalsearchindexenabled=false`). Turning it on **incurs extra Dataverse capacity cost** for
   the search index. ([Add Dataverse tables as a knowledge source](https://learn.microsoft.com/microsoft-copilot-studio/knowledge-add-dataverse); [Configure Dataverse search](https://learn.microsoft.com/power-platform/admin/configure-relevance-search-organization).)
2. **Agent auth = "Authenticate with Microsoft"** (Entra). For Dataverse knowledge, *No
   authentication* and *Authenticate manually* are **unsupported**. With Entra user auth the agent
   only surfaces rows the **asking user** can already see — Dataverse row-level security is respected.
   ([Configuration — end-user authentication](https://learn.microsoft.com/microsoft-copilot-studio/configuration-end-user-authentication#authenticate-with-microsoft).)
3. **≤ 15 Dataverse tables per knowledge source.** The grounding set must be curated to ≤15 (§4).
   ([knowledge-add-dataverse](https://learn.microsoft.com/microsoft-copilot-studio/knowledge-add-dataverse).)
4. **Billing is Copilot-Credit metered → an inclusion = a spend decision.** A Copilot credit ≈ one
   user→agent interaction. **Seeded credits bundled in Power Platform / Dynamics licences are removed
   on 1 November 2026, for all new *and* existing customers**; after that, continued use needs a
   **standalone Copilot Studio licence / prepurchased Copilot Credits / pay-as-you-go** (Azure billing
   policy). **New customers cannot rely on seeded capacity — they must buy.** ([End of AI Builder credits — FAQ](https://learn.microsoft.com/ai-builder/endofaibcredits#faq); [Copilot Studio billing & licensing](https://learn.microsoft.com/microsoft-copilot-studio/billing-licensing); [Manage Copilot Studio credits & capacity](https://learn.microsoft.com/power-platform/admin/manage-copilot-studio-messages-capacity).)

**ADR-0008 discipline:** the agent **reads and answers**; it does **not** submit to EVA, write to Box,
advance status, or mutate a governed corpus row. It assists staff; it never auto-decides.

---

## 2. Boundary legend (who does what)

| Tag | Meaning | Who |
|---|---|---|
| **[BUILD]** | Authored + verified **offline**, zero tenant/Azure/credit contact: the design pack (table set, descriptions, synonyms/glossary, agent instructions, ADR-0008 guardrail, test-question set), the `assistant-client.ts` seam + `assistant-connector-transport.ts`, the gate plumbing, and the (drafted-not-bound) connection-reference plan. | **Claude** |
| **[DEPLOY-WITH-LOGIN]** | Tenant steps that touch no secret value and flip no prod gate: turn on Dataverse search + mark columns searchable; author the agent in a solution; add the Dataverse knowledge source; set auth = Authenticate with Microsoft; create the `shared_microsoftcopilotstudio` connection; keep the agent **unpublished** while testing. Claude may draft each step + run read-only verification GETs. | **Operator** (🔒; Claude drafts) |
| **[RESERVED-FOR-USER]** | **Publish** the agent to a channel; supply the `agentName`; **flip `cr1bd_COPILOT_ENABLED=true`**; bind the connection; run live staff chats over real Cases; confirm Copilot-Credit spend. Live data + publish + spend = the live-services boundary. | **Operator only** (🔒) |

**CSP (AGENTS.md truth #1 / [memory: Code App CSP → use connectors]):** Code Apps run under
`connect-src 'none'`; a raw `fetch()` to Copilot is refused before the network. The Code App reaches
the agent **only** through the `shared_microsoftcopilotstudio` connector via the Power Apps SDK —
never a raw fetch. **No-mock-data rule:** until the connection is bound the seam returns an honest
`not_connected`; it never fabricates an answer. **No-engineering-terms-in-UI rule (AGENTS.md):** every
user-visible string — the agent's name, greeting, replies, and the Code App entry point — uses
business language ("case", "provider", "registration", "ready for assessment"), **never** internal
identifiers (`cr1bd_*`, "Dataverse", "EVA payload", "connector", "flow", status enums).

---

## 3. Current state (verified)

| Fact | State (2026-06-20) | Source |
|---|---|---|
| `cr1bd_COPILOT_ENABLED` env-var | **Exists**, type `Boolean`, **default `false`** (frozen M1 default) | [dataverse/environment-variables.json](../../../dataverse/environment-variables.json) |
| Dataverse search | **OFF** live (`isexternalsearchindexenabled=false`) — hard pre-req, admin-only to enable | live-environment.md + GROUND TRUTH |
| Copilot connection | **None** — no `shared_microsoftcopilotstudio` connection in `Collision Engineers - Dev` | live-environment.md connections table |
| Agent | **None authored** | — |
| Dataverse corpus | **Loaded**: WorkProvider 392 (176 active), Repairer 61, ImageSource 23, InspectionAddress 174, `cr1bd_cases` holds real email-sourced rows | live-environment.md |
| Transport seams to mirror | `mockup-app/src/data/parser-connector-transport.ts` (the CSP-safe connector bridge) + `mockup-app/src/data/enrichment-client.ts` (the injectable `not_connected` default) | live |
| This plan | **5c-Copilot plan = this file**; no agent + no connection + gate default OFF | — |

---

## 4. The grounding model — Dataverse knowledge source (≤ 15 tables)

The agent is grounded on the live `CollisionSpike` tables. **≤ 15 tables per source** (Learn) forces a
curation choice — pick the most query-worthy. Each table gets a **plain-business description** (it
drives generative orchestration — vague descriptions degrade answers) and **synonyms/glossary** so the
agent speaks Collision Engineers' language. Logical names below are the live `cr1bd_` set
(live-environment.md); **the descriptions/synonyms shown are what the operator pastes into the
knowledge-source authoring UI** — they are deliberately engineering-free.

### 4.1 Chosen grounding set (10 of the ≤15 budget — leaves headroom)

| # | Table (logical) | In-agent description (business language) | Why it earns a slot |
|---|---|---|---|
| 1 | `cr1bd_cases` | "A vehicle inspection case: its reference (e.g. CCPY26050), the work provider, the vehicle registration, the current stage, and whether it is ready for assessment." | The spine of every staff question. |
| 2 | `cr1bd_workproviders` | "The companies that instruct us (the providers / principals). Their code, name, and whether they are active." | "which provider is CCPY…", "is QCL active". |
| 3 | (Repairer) `cr1bd_*` | "Repair garages (yards) where a vehicle may be inspected, and the providers they serve." | "which yard serves QCL". |
| 4 | (InspectionAddress) `cr1bd_*` | "Where an inspection happens, or 'image based assessment' when there is no physical visit." | address lookups. |
| 5 | (ImageSource) `cr1bd_*` | "How the photos for a case arrived (email, WhatsApp, …)." | provenance Q&A. |
| 6 | `cr1bd_evidences` | "The photos and documents attached to a case, their role (overview / damage close-up), and whether each is accepted for assessment." | "does CCPY… have a clear registration shot", readiness. |
| 7 | `cr1bd_auditevents` | "A dated history of what happened to a case (received, parsed, enriched, submitted)." | "when was CCPY… submitted". |
| 8 | `cr1bd_notes` | "Free-text notes staff added to a case." | context recall. |
| 9 | `cr1bd_chasers` | "Outstanding reminders sent to providers for missing instructions or photos." | "what are we still chasing on CCPY…". |
| 10 | `cr1bd_fieldlevelprovenances` | "Where each captured field came from (the document, the provider corpus, or AI) and whether it needs review." | "is the mileage on CCPY… confirmed". |

> **Curation note:** start narrower if staff queries are narrower — **Case + WorkProvider + Repairer +
> AuditEvent** answer most "status / who / when" questions and keep the index small (lower Dataverse
> search cost). Add Evidence + Chaser when readiness/chaser questions matter. The ≤15 cap is generous
> here; the constraint is **search-index cost**, not the table count.

### 4.2 Synonyms / glossary (lifts answer quality — Learn)

Add these per [knowledge-add-dataverse](https://learn.microsoft.com/microsoft-copilot-studio/knowledge-add-dataverse)
(table-column synonyms + a glossary of acronyms). Keep it CE-native:

- **principal / provider / instructing party** → WorkProvider
- **yard / garage / bodyshop** → Repairer
- **reg / VRM / plate / number plate** → vehicle registration
- **case ref / PO / job number** → the Case reference (`Principal`+YY+NNN, e.g. `CCPY26050`)
- **ready / ready for EVA / ready for assessment** → the readiness state (`ready_for_eva`)
- **IBA / image-based** → "Image Based Assessment" inspection address
- **overview shot** → the `overview` Evidence role (registration visible); **damage shot / close-up**
  → `damage_closeup`
- **chasing / chaser / waiting on** → an open Chaser
- glossary: "EVA" = the external assessment platform cases are handed to; "Box" = where finished cases
  are archived. (Used so the agent *understands* the words — **not** so it acts on EVA/Box.)

### 4.3 Agent instructions + the ADR-0008 read-only guardrail (drop-in)

The operator pastes these into the agent's **instructions** field. They are the read-only guardrail
expressed as system guidance (Copilot Studio knowledge agents are read-only by construction — they
answer from the index and have no Dataverse-write, EVA, or Box tool unless one is added; the
instruction makes the boundary explicit and forbids ever adding one):

```
You are the Collision Engineers case assistant. You help staff find information about
inspection cases by answering questions from the connected case records.

DO:
- Answer questions about a case's stage, its provider, its vehicle registration, its photos,
  what is outstanding (chasers), and its history, using only the connected records.
- Speak in plain business language. Refer to "cases", "providers", "garages", "registration",
  and "ready for assessment". Quote the case reference (e.g. CCPY26050) when relevant.
- If you do not have the information, say so plainly and suggest opening the case in the app.

DO NOT:
- Submit, change, approve, or progress any case. You are read-only.
- Send anything to the external assessment platform or to the archive. You never act on a case.
- Invent figures, statuses, or records. Only state what the connected records show.
- Use internal field names, table names, status codes, or technical jargon in your replies.
```

> **Why a knowledge agent is the right shape:** it grounds on the index and returns answers; it has
> **no action that mutates Dataverse or calls EVA/Box**. ADR-0008 ("the tool's responsibility ends at
> the EVA handoff") is therefore satisfied **structurally**, and the instruction above plus the review
> gate (§9) keep it that way. **Do not** add a Power Automate / connector *tool* that writes,
> submits, or archives — that would break ADR-0008.

### 4.4 Test-question set (offline design artifact; operator runs live in §7)

Authored now so verification is deterministic later. Each must yield a **grounded** answer citing a
real Case, in business language, **read-only**:

1. "What stage is CCPY26050 at?" → returns the case's stage in plain words.
2. "Which provider instructed CCPY26050?" → the WorkProvider name/code.
3. "Is QCL an active provider?" → active/archived from WorkProvider.
4. "Which garages serve QCL?" → Repairer rows linked to that provider.
5. "Does CCPY26050 have a clear registration photo?" → Evidence with `overview` + registration
   visible.
6. "What are we still waiting on for CCPY26050?" → open Chaser(s) / missing items.
7. "When was CCPY26050 submitted?" → AuditEvent date (or "not yet" if unsubmitted).
8. "Is the mileage on CCPY26050 confirmed?" → field-level provenance review state.
9. **Negative / guardrail:** "Submit CCPY26050 to assessment." → the agent **refuses** (read-only)
   and points to the app.
10. **Row-level security:** a user without access to a case → the agent does **not** reveal it.

---

## 5. The transport seam — `assistant-client.ts` + `assistant-connector-transport.ts` ([BUILD])

Mirror the parser/enrichment seam exactly (the repo pattern, [memory: Code App CSP → use connectors]):
a **pure, import-clean client** the screens call (offline-testable, no `@microsoft/power-apps`
import), with an injectable transport whose **default is an honest `not_connected`**, plus a
**connector-backed transport** that the in-app entry point injects.

**File `mockup-app/src/data/assistant-client.ts` (pure contract + default):**

```ts
export type AssistantStatus = 'ok' | 'not_connected' | 'error';

export interface AssistantAnswer {
  /** The agent's most recent reply (business language; never engineering terms). */
  reply: string;
  conversationId?: string;
  completed: boolean;
}

export interface AssistantResult {
  status: AssistantStatus;
  data?: AssistantAnswer;
  /** Operator-facing reason when not ok. */
  message?: string;
}

export type AssistantTransport = (message: string) => Promise<AssistantResult>;

const GATED_MESSAGE = 'The case assistant isn’t available yet.';

/** Default: honest "not connected" until the Copilot connection is bound + the gate is on. */
export const notConnectedAssistantTransport: AssistantTransport = async () => ({
  status: 'not_connected',
  message: GATED_MESSAGE,
});

/** Ask the case assistant a question (gated; never fabricates an answer). */
export async function askAssistant(
  message: string,
  transport: AssistantTransport = notConnectedAssistantTransport,
): Promise<AssistantResult> {
  const m = message.trim();
  if (!m) return { status: 'error', message: 'Type a question first.' };
  return transport(m);
}
```

**File `mockup-app/src/data/assistant-connector-transport.ts` (CSP-safe, in-app only):**
calls the generated `CopilotStudioService.ExecuteCopilotAsyncV2` — the **only** operation that returns
the response synchronously (`/proactivecopilot/executeAsyncV2`; `ExecuteCopilot` is fire-and-forget,
`ExecuteCopilotAsync` can 502). Reads are **casing-tolerant** (`lastResponse` ?? `LastResponse`;
`conversationId` ?? `ConversationId` ?? `conversationID`) per the Learn troubleshooting note. The
`agentName` is supplied at **[RESERVED-FOR-USER]** (it comes from the published agent's Channels →
Web app connection string; case-sensitive, publisher-prefixed). `notificationUrl` is the documented
placeholder `"https://notificationurlplaceholder"`.

```ts
import { CopilotStudioService } from '../generated/services/CopilotStudioService';
import type { AssistantResult, AssistantTransport } from './assistant-client';

/** agentName comes from the PUBLISHED agent (operator-supplied at activation). */
export function makeConnectorAssistantTransport(agentName: string): AssistantTransport {
  return async (message: string): Promise<AssistantResult> => {
    const result = await CopilotStudioService.ExecuteCopilotAsyncV2({
      message,
      notificationUrl: 'https://notificationurlplaceholder',
      agentName,
    });
    if (!result.success) {
      return { status: 'error', message: result.error?.message ?? 'Assistant call failed.' };
    }
    const d = result.data as Record<string, unknown>;
    const reply = (d.lastResponse ?? (d as any).LastResponse ?? '') as string;
    const conversationId = (d.conversationId ?? (d as any).ConversationId ??
      (d as any).conversationID) as string | undefined;
    const completed = Boolean(d.completed ?? (d as any).Completed);
    return { status: 'ok', data: { reply, conversationId, completed } };
  };
}
```

Reference: [Connect your code app to Microsoft Copilot Studio agents](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-copilot-studio).
Keep `assistant-client.ts` **separate** from the connector transport (as `parser-client.ts` is kept
separate from `parser-connector-transport.ts`) so the unit tests stay import-pure; only the in-app
assistant panel imports the connector transport.

**Offline test (`assistant-client.test.ts`):** empty input → `error`; default transport →
`not_connected` (no fabrication); a stub transport returning mixed-case keys → the casing-tolerant
read picks `reply`/`conversationId`; a `success:false` result → `error` with the message. No network,
no `@microsoft/power-apps` import in the test target.

---

## 6. Gate plumbing — stay hidden unless `COPILOT_ENABLED` AND a bound connection ([BUILD])

The Code App **reads** `cr1bd_COPILOT_ENABLED` (it never writes a gate — env-var manifest convention)
and shows the assistant entry point **only when both** are true:

1. `cr1bd_COPILOT_ENABLED === true` (read through the existing env-var read path), **and**
2. the `shared_microsoftcopilotstudio` data source is present (connection bound) → inject
   `makeConnectorAssistantTransport(agentName)`; otherwise the default `not_connected` transport keeps
   the panel honest (or hidden).

Reference: [Environment variables](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables).
**Draft (do not bind) a connection-reference plan** for `shared_microsoftcopilotstudio` so the operator
has a ready ALM artifact — but the connection is **created + bound by the operator** (🔒), in the
**same DLP group** as the other custom connectors so the policy allows it.

---

## 7. Use-cases — "integration into services" (what the agent does for staff)

All read-only, all in business language, all M3-gated. These are the concrete affordances:

| Use-case | Question shape | Grounds on | Surfaced where |
|---|---|---|---|
| **Case Q&A** | "Tell me about CCPY26050." | Case + WorkProvider + Evidence + AuditEvent | Code App assistant panel; Teams |
| **Status lookup** | "What stage is CCPY26050 at? Is it ready for assessment?" | Case stage / readiness | Code App (contextual on the case detail view) |
| **Readiness surfacing** | "What's missing before CCPY26050 can go for assessment?" | Evidence (roles, accepted), Chaser, provenance review state | Code App case detail |
| **Chaser drafting (assist)** | "Draft a reminder to the provider for the missing photos on CCPY26050." | Case + Chaser + WorkProvider | **Draft text only** — staff copy/paste; the agent **does not send** (sending is M2 chaser-send, draft-only by policy) |
| **Provider / yard lookup** | "Which garages serve QCL? Is QCL active?" | WorkProvider + Repairer | Code App; Teams |
| **History recall** | "What happened to CCPY26050 last week?" | AuditEvent + Note | Code App; Teams |

**Integration surfaces:**
- **Code App embed (primary):** the assistant panel injected with the connector transport (§5),
  contextual on the case detail view (pre-seed the message with the open case reference) and/or a
  global "ask about a case" entry. Pure React/Fluent v9 — no new dependency.
- **Teams (alternative/addition):** publish the agent to Teams for staff who live there. Independent
  of the Code App; same agent, same grounding, same guardrail.
- **Power Automate (assist only, NOT pipeline):** a flow *may* call the agent for a human-facing draft
  (e.g. a chaser body the reviewer approves) — but **never** to decide or act. The automated
  intake→EVA→Box pipeline does **not** depend on Copilot, and Copilot is **not** an approver
  (ADR-0008). Keep any flow use read-only/draft-only and gated.

> **Chaser-send boundary:** chaser **sending** is M2 (`CHASER_SEND_ENABLED`) and **draft-only by
> policy**. The assistant **drafts** chaser text on request; it does **not** send. Don't let the
> assistant become a send path.

---

## 8. Ordered build checklist (CLAUDE-buildable vs operator-gated)

**[BUILD] — Claude, offline (no tenant, no credit, no secret):**
1. [ ] **Design pack** (this doc §4): finalise the ≤15 grounding set, the per-table descriptions, the
   synonyms/glossary, the agent instructions + ADR-0008 read-only guardrail, and the test-question
   set — all engineering-term-free, ready to paste into the authoring UI.
   [knowledge-add-dataverse](https://learn.microsoft.com/microsoft-copilot-studio/knowledge-add-dataverse)
2. [ ] **`assistant-client.ts`** — pure contract + `not_connected` default + `askAssistant` (§5);
   import-clean for offline tests.
3. [ ] **`assistant-connector-transport.ts`** — `makeConnectorAssistantTransport(agentName)` over
   `CopilotStudioService.ExecuteCopilotAsyncV2`, casing-tolerant reads, placeholder `notificationUrl`
   (§5). [connect-to-copilot-studio](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-copilot-studio)
4. [ ] **`assistant-client.test.ts`** — empty→error, default→`not_connected`, mixed-case stub→ok,
   `success:false`→error.
5. [ ] **Gate plumbing** (§6): read `cr1bd_COPILOT_ENABLED`; render the assistant panel only when the
   gate is on **and** the data source is bound; default to `not_connected` otherwise.
   [environmentvariables](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables)
6. [ ] **Connection-reference plan** (drafted, **not bound**) for `shared_microsoftcopilotstudio`, same
   DLP group as the other connectors — an ALM artifact for the operator.

**[DEPLOY-WITH-LOGIN] — operator (🔒); Claude drafts the steps + runs read-only GETs:**
7. [ ] **Turn on Dataverse search** for `Collision Engineers - Dev` (admin-only; live is OFF) and mark
   the §4 tables + the columns staff query (case reference, stage, provider, registration, …) as
   **Searchable** in each table's Quick Find view. **Accept the search-index Dataverse-capacity cost.**
   [Configure Dataverse search](https://learn.microsoft.com/power-platform/admin/configure-relevance-search-organization)
8. [ ] **Author the agent in a solution** in that environment; set **auth = Authenticate with
   Microsoft** (No-auth / Manual are unsupported for Dataverse knowledge); **add the Dataverse
   knowledge source** with the §4 tables + descriptions + synonyms/glossary; keep it **unpublished**
   while testing. [configuration-end-user-authentication](https://learn.microsoft.com/microsoft-copilot-studio/configuration-end-user-authentication)
9. [ ] **Confirm Copilot Studio entitlement + capacity** (the inclusion = spend decision): a standalone
   Copilot Studio licence / prepurchased Copilot Credits / a pay-as-you-go billing policy on an Azure
   subscription — seeded licence credits **end 1 Nov 2026**, so do not rely on them.
   [billing-licensing](https://learn.microsoft.com/microsoft-copilot-studio/billing-licensing)
10. [ ] **Create the `shared_microsoftcopilotstudio` connection** (maker portal) in the same DLP group;
    copy the `connectionId` (`pac connection list` → API id
    `/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio`).
11. [ ] **(Claude, with the connection in place)** `pac code add-data-source -a
    "shared_microsoftcopilotstudio" -c <connectionId>` → generates `src/generated/.../CopilotStudioService`
    + updates `power.config.json`; wire the connector transport; build. [connect-to-copilot-studio](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-copilot-studio)

**[RESERVED-FOR-USER] — operator only (🔒):**
12. [ ] **Publish** the agent (Copilot Studio → Publish); read the **`agentName`** from Channels → Web
    app connection string (case-sensitive, publisher-prefixed); supply it to the Code App.
13. [ ] `pac code push`; **flip `cr1bd_COPILOT_ENABLED=true`**; bind the connection; run the §4
    test-question set live over real Cases.
14. [ ] **Verify**: grounded answers in business language; **row-level security** holds (a user sees
    only their permitted rows); the agent **refuses** any submit/edit/EVA/Box ask (ADR-0008); with the
    gate **false**, the Code App does **not** surface the assistant.

---

## 9. Verification

**Offline ([BUILD], Claude):**
- `cd mockup-app && npm run test -- assistant-client` (vitest) — empty→error; default→`not_connected`
  (no fabricated reply); mixed-case stub → casing-tolerant read returns `reply`/`conversationId`;
  `success:false`→error.
- Design-pack review against the live schema: **no invented tables**; the set is **≤15**; every
  description + reply is **engineering-term-free** (AGENTS.md no-engineering-terms-in-UI); the
  instructions encode the **ADR-0008 read-only** guardrail.
- `tsc`/lint clean; `assistant-client.ts` imports **no** `@microsoft/power-apps`.

**Live ([RESERVED-FOR-USER], operator; Claude read-only GETs only):**
- With Dataverse search ON + Entra auth, the §4 test set returns grounded answers citing real Cases.
- **Row-level security:** a user without access to a Case cannot have it surfaced.
- **ADR-0008 guardrail:** "submit / change / send to assessment / archive" → the agent **declines**;
  it never mutates a row, calls EVA, or writes Box.
- **Gate proof:** `cr1bd_COPILOT_ENABLED=false` → the Code App does not show the assistant; flipping it
  true (with the connection bound) reveals it.
- **Cost reality check:** Copilot-Credit consumption visible in **Power Platform admin centre →
  Licensing → Copilot Studio** (daily, per environment); set a per-agent monthly limit there to cap
  spend before overage enforcement.

---

## 10. Open questions / uncertainties

1. **Inclusion is an open product decision** (microsoft-stack.md §9 Q4). Copilot-Credit spend +
   Dataverse-search-index cost make this a **deliberate buy**, not a free add-on. If deferred, §5c-Copilot
   ships as the offline design pack + dormant seam only, `cr1bd_COPILOT_ENABLED` stays **false**, and
   no tenant step is taken.
2. **Which tables + staff query patterns** — the ≤15 cap is generous, but the **search-index cost**
   rewards the smallest set that answers real questions. Confirm the staff query patterns to fix the
   set (likely Case + WorkProvider + Repairer + AuditEvent first; add Evidence + Chaser for readiness).
3. **Code App embed vs Teams; global vs contextual** — decide whether the primary surface is the
   in-app panel (contextual on the case detail view) or Teams, and whether the entry is global or
   per-case. (Both can coexist; pick the default.)
4. **ALM portability** — Copilot Studio **agent + knowledge + auth + channels are not fully
   solution-portable**; the agent is authored per-environment and re-authored/re-published for any new
   environment. Capture the manual re-author steps (this doc §8) as the ALM record; do not assume an
   export/import round-trips the whole agent.
5. **Dataverse-MCP-in-Copilot (M3 enhancement, optional):** the Dataverse **MCP server** in Copilot
   Studio is an alternative/addition to the knowledge-source path ("show me the open cases" via
   natural-language tools). Note as an **M3** enhancement; the knowledge-source path is the simpler M3
   default — do not pull MCP in unless the knowledge path proves insufficient.
   ([Dataverse MCP in Copilot Studio](https://learn.microsoft.com/power-apps/maker/data-platform/data-platform-mcp-copilot-studio).)
6. **ADR-0008 re-affirm at review** — keep the agent **strictly read-only**: no tool that submits to
   EVA, writes Box, advances status, or mutates a corpus row; the chaser use is **draft-only**. Re-check
   in the binding review before any publish.

---

## 11. Decision summary (one line)

**The Copilot Studio assistant is an optional, M3, `cr1bd_COPILOT_ENABLED`-gated, Copilot-Credit-metered
staff helper grounded on ≤15 live `CollisionSpike` Dataverse tables (requires Dataverse search ON —
admin-only, currently OFF — and Entra "Authenticate with Microsoft"; No-auth/Manual unsupported) for
read-only Q&A, status, readiness, and chaser-draft assistance over the Case corpus, reached only via
the CSP-safe `shared_microsoftcopilotstudio` connector behind an honest `not_connected` seam; Claude
builds the offline design pack + the `assistant-client.ts`/`assistant-connector-transport.ts` seam +
the gate plumbing, while the operator (🔒) turns on Dataverse search, authors + publishes the agent,
confirms the Copilot-Credit spend (seeded licence credits end 1 Nov 2026 — new customers must buy), and
flips the gate; it is never a pipeline actor and never acts on EVA or Box (ADR-0008).**
