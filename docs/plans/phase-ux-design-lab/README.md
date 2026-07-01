> **⚠ PLATFORM NOTE (2026-07-01).** This plan was written in the **Power Platform era** — references to
> the "Code App", `pac code` deploys, `code-app-architect`, connector seams, and CSP `connect-src 'none'`
> describe the **decommissioned** stack. The live port target is the **Azure SWA SPA** (`mockup-app/` on
> `cespk-spa-dev`, REST + MSAL — see [CLAUDE.md](../../../CLAUDE.md)), and the production-UI builder is
> **`fluent-spa-designer`**. The design-lab *method* (stages A–F, operator-picks-winner) remains current.
> Also note: an **in-place UI reforge shipped 2026-07-01** ([docs/reviews/010726/](../../reviews/010726/))
> — any future design-lab convergence must reconcile to that decision register.

> **UX Design Lab** — a cross-cutting design phase: explore many **throwaway HTML/React** UI directions for
> the *whole* product, judge them, converge on a winner, then **port the winner to the Fluent v9 Code App**.
> **Status: SCAFFOLDED (2026-06-25) — runs after agent reload.** The nine UI/UX subagents are created in
> `.claude/agents/` and registered in [../../../AGENTS.md](../../../AGENTS.md); the design work runs as a
> **dynamic ultracode `Workflow`** once the agents are reloaded. Decisions this session: throwaway → port the
> winner; **open** aesthetic exploration (re-anchor to the CE brand only at port); **responsive-web-first**;
> **8+ directions**. This phase designs the UI for *all* phases (1–9), so it is a cross-cutting lab, not a
> sequential delivery phase.

# UX Design Lab — Plan

## Context

We need a **long-term UI that covers every planned feature** — now and future — with the **main page managing
the whole inbox** ([Phase-8](../phase-8-inbox-management/README.md) triage: `receiving_work` / `query` /
`other`, *not just case email*) alongside new cases and live operational data, and the **queues page
retained**. There is already a real Power Apps **Code App** ([../../../mockup-app/](../../../mockup-app/):
React 18 + Vite + **Fluent v9** + lucide, ~9 screens, a shared component library, a Dataverse data seam) and
a **frozen design system** ([../../design/THEME-MAPPING.md](../../design/THEME-MAPPING.md),
[../../design/ui-ux.md](../../design/ui-ux.md), the `collision-engineers-design` brand).

**Why throwaway-then-port.** The production app is locked to Fluent v9 + CSP `connect-src 'none'` (connectors
only, no raw fetch, no iframes) + the CE brand. Exploring under those limits would kneecap variety. So we
explore broadly as standalone HTML/React (no CSP, any fonts/libs), judge, then port **only the winner** — the
rubric weights **Fluent-portability + brand-re-anchorability** so the winner is shippable.

## Agent roster (created; reload before running)

Nine project agents in [../../../.claude/agents/](../../../.claude/agents/) (see
[../../../AGENTS.md](../../../AGENTS.md) → "UI/UX design-lab agents"). Each owns one slice and **defers the
Code App shell / routes / connector wiring / `pac code` deploy to `code-app-architect`**; none use
`canvas-app-*` / `genpage-*` / `mcp-apps:*`.

`ux-architect` · `ui-ux-pro-max-specialist` · `ui-visual-designer` · `stitch-prototyper` · `mobile-ux-designer`
· `accessibility-engineer` · `design-critic` · `fluent-spa-designer` · `motion-demo-designer` *(optional)*.

## The dynamic ultracode workflow (divergence → judge → converge → port)

| Stage | What happens | Skills | Agent(s) |
|---|---|---|---|
| **A — Foundation** *(convergent)* | ONE shared artifact: the full screen/feature inventory (Phases 1–9), the **main-page inbox cockpit** spec (whole inbox + new cases + KPIs + queues snapshot), the queues model, the core user flows, and the **rubric** (`design-brief.md` + `rubric.json`). Guarantees every direction covers the same surface. | `frontend-design` + domain docs | ux-architect |
| **B — Divergence** *(fan-out, 8+)* | Per direction in parallel: pro-max seeds a *distinct* system (open latitude) → visual-designer refines into a distinctive identity + key-screen specs → mobile-designer adds the responsive treatment. | `ui-ux-pro-max`, `frontend-design` | ui-ux-pro-max-specialist, ui-visual-designer, mobile-ux-designer |
| **C — Build** *(pipeline)* | Each direction's key screens (inbox cockpit, queues, case detail, intake + EVA-submit flows) → **runnable throwaway HTML/React** under `directions/<name>/`. | `stitch-design`, `stitch-build`, `stitch-utilities` | stitch-prototyper |
| **D — Audit + Judge** *(advisory)* | a11y-audit each prototype; score each vs the rubric across lenses → an **advisory** ranked `leaderboard.md` (decision-support, **not** a verdict) + per-direction scorecards + a completeness-gap list. | `chrome-devtools` a11y, `taste-design`, `frontend-design` | accessibility-engineer, design-critic |
| **— Operator vetting & selection** | The **workflow stops here.** The operator opens the gallery, reviews the prototypes + advisory scorecards, and **picks the winner**. No auto-pick. | — | **the operator** |
| **E — Converge** *(after the operator picks)* | The **operator-chosen** winner → a refined prototype (main page + queues + key flows), grafting the best ideas from runners-up; a focused mobile-ux pass + optional walkthrough video. | `frontend-design`, `hyperframes`/`remotion` | ui-visual-designer, ux-architect, mobile-ux-designer, (motion-demo-designer) |
| **F — Port spec** | Map the winner → Fluent v9 + CE brand + CSP + the existing component library → `port-spec.md` (an ordered PR breakdown). Hand to **code-app-architect** to build. | `collision-engineers-design`, Fluent v9 (MS Learn) | fluent-spa-designer (builds directly in the SWA SPA — the code-app-architect handoff is the decommissioned Power Apps era) |

**Dynamic** = the direction count scales (8+), the judge can loop-until-converged, and the completeness
critic flags missing feature coverage before convergence. The `Workflow` uses `parallel`/`pipeline` fan-out
for B–D, a judge panel in D, and a single convergence + port in E–F.

> **The operator vets and picks the winner.** Stages A–D run autonomously and produce the gallery + the
> **advisory** scorecards/leaderboard; the workflow then **stops for the operator to vet and choose**.
> Convergence (E) + port (F) run only on the chosen winner — there is **no auto-pick**.

## Evaluation rubric (outline — ux-architect finalises `rubric.json`)

Score each direction on: **feature coverage** (the full screen inventory), **task efficiency** (top jobs),
**intuitiveness**, **visual appeal**, **relevance to the finished product**, **brand re-anchorability**,
**accessibility** (WCAG-AA), and **Fluent-portability**. The user's bar: *efficient, easy, intuitive,
visually appealing, and relevant to the intended finished product.*

## Directory layout

```
docs/plans/phase-ux-design-lab/
  README.md            this plan (the workflow spec)
  design-brief.md      (Stage A) shared brief + screen/feature inventory + navigation + flows
  rubric.json          (Stage A) the scoring rubric
  directions/<name>/   one folder per explored direction: the runnable HTML/React mockup + its scorecard
  leaderboard.md       (Stage D) ranked directions + completeness gaps
  synthesis.md         (Stage E) the chosen winner + grafted ideas (+ optional walkthrough video)
  port-spec.md         (Stage F) Fluent v9 component map + CE-brand reconciliation + PR breakdown
```

## Constraints & port target

- **Production:** Fluent UI v9 only, CSP `connect-src 'none'` (connectors / the `src/data/*` seam, no raw
  fetch), no iframes (evidence/Box = server-minted deep links), CE brand (CE-red `#db0816`, Futura
  display-only, 2px radii), relative asset paths. Reconcile *to* [../../design/THEME-MAPPING.md](../../design/THEME-MAPPING.md).
- **Reuse, don't re-invent:** the `mockup-app/` component library (`Panel`, `EvaFieldRow`, `VrmPlate`,
  `PipelineStrip`, `StatusBadge`, `ProvenanceBadge`, `ReadinessChecklist`, `ImageOrderList`, `ChaserPanel`,
  skeletons, async states) and `code-app-architect` for the build/deploy.
- **Excluded skills:** `model-apps:genpage`, `canvas-apps:*` (Code App, not model-driven/canvas),
  `mcp-apps:*` (no new MCP server). `stitch-build:react-native` is reserved for a future native direction.

## How to run (after reload)

1. `/reload-plugins` (or restart) so the nine agents load.
2. Invoke the dynamic ultracode `Workflow` (opt in with "ultracode") to run Stages **A–D** — it fans out the
   8+ directions, builds the mockups, and writes the **advisory** scorecards + `leaderboard.md`, then **stops**.
3. **Vet the gallery** (open `directions/<slug>/index.html`) and **pick the winner** — the operator decides.
4. Run convergence (E) + the port spec (F) on the chosen winner, then hand `port-spec.md` to
   `code-app-architect` to build into [../../../mockup-app/](../../../mockup-app/).

## Risks

- **Throwaway→port is lossy** — open/off-brand ideas may port as *spirit, not pixel*; the rubric weights
  shippability and `fluent-spa-designer` re-anchors (and may propose documented `THEME-MAPPING.md`
  updates rather than silently diverging).
- **Prototypes use fake data** — the port wires through the existing data seam (CSP: connectors only).
- **Cost** — 8+ directions × build × judge is a large ultracode run; the dynamic workflow scales.
