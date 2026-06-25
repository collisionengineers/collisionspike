# 02 — Desktop App + Hosted Backend

> **One-line verdict.** Cheapest *infrastructure* of any option (a thin backend is **~$5–25/mo** and
> the existing parser already ships a **pywebview desktop GUI**), but the **worst fit for a
> multi-user, shared-queue intake workflow** — and it adds distribution, code-signing, and
> auto-update overhead a web app doesn't have. Viable as a **single-operator power-tool**, not as the
> team's primary case-intake surface.
>
> Pricing confidence: backend figures reuse the verified indie-provider research
> ([`05`](../05-supabase/README.md)/[`07`](../07-vps-self-hosted/README.md)); desktop
> distribution/signing costs are **published vendor rates** (stable, lightly estimated).

See [`00-current-architecture-baseline`](../00-current-architecture-baseline/README.md).

---

## The shape

A **thick client** (rich desktop app) talks to a **thin cloud backend** (just a database + a few API
endpoints + the parser/enrichment functions). Two credible client technologies:

| Client | Notes for this app |
|---|---|
| **Python + pywebview** | **Already exists** — `cedocumentmapper_v2.0` ships a single-user desktop review GUI (React + pywebview, portable PyInstaller exe via `build.ps1`). The parser engine runs *locally*, no cloud parse call needed. Strong reuse story. |
| **Tauri** (Rust shell + web UI) | Reuse the existing React UI almost verbatim; ~3–10 MB binaries, low memory. Best if you want the existing `mockup-app/` React front-end as the client. |
| **Electron** | Same React reuse, heavier (~120 MB), simplest tooling. |

Backend = any option from folders 05–08 (Supabase, a VPS, Cloudflare). The database is the only
thing that *must* be shared; parsing/enrichment can run client-side.

---

## Monthly run-cost

| Element | Cost | Note |
|---|---|---|
| Hosted DB + thin API (e.g. **Supabase Pro** or **Hetzner VPS**) | **~$5–25/mo** | See [05](../05-supabase/README.md)/[07](../07-vps-self-hosted/README.md) |
| Parser/enrichment compute | **~$0** | Runs *on the client* (parser engine is local Python) |
| **Windows code-signing certificate** | **~$200–400/yr** (OV) · EV higher | One-time-ish; required to avoid SmartScreen warnings |
| Apple Developer (only if macOS build) | **$99/yr** | Notarization required for macOS |
| Auto-update hosting (e.g. object storage / GitHub Releases) | **~$0–5/mo** | Tauri updater / Squirrel / Sparkle |
| **TOTAL** | **~$10–30/mo + ~$300–500/yr signing** | Plus per-machine deployment effort |

Run-cost is genuinely tiny because the heavy compute (PDF parsing) moves to the operators' machines.
The hidden cost is **distribution operations**, not servers.

## Billing model

Backend = consumption/flat (per the chosen backend). Desktop adds **fixed annual certificate costs**
and **per-release packaging/signing/notarization effort**. No per-user SaaS licensing.

## What you'd rebuild

- **Client:** if pywebview — extend the existing parser GUI into a full case workspace (queues, case
  detail, EVA export). If Tauri/Electron — wrap the existing React `mockup-app/` and repoint its
  `DataAccess` seam at the backend REST API. The React UI is ~65–70% reusable either way.
- **Backend:** a slim REST API + Postgres (the Dataverse replacement) + the 15 flows re-expressed as
  backend jobs/queue workers (a desktop client can't host long-running chasers — those still need a
  server-side scheduler).
- **Auth/sync:** desktop apps need a token flow + offline/online sync handling the web app avoids.

## Vendor lock-in profile — **LOW**

The client is yours (open frameworks); the backend is whatever portable option you choose (Postgres).
Essentially no platform lock-in. The trade is **operational** (you own updates + signing), not
contractual.

## UK/EU data residency

Inherited from the backend choice — pick a UK/EU region (Supabase London, Hetzner DE/FI, Azure UK
South). Case data at rest stays where the backend lives; the desktop client holds transient local
copies (consider disk encryption on operator machines for claimant PII).

## Pros / Cons

**Pros:** cheapest servers; parser runs locally (fast, no upload of large PDFs); offline-capable;
reuses the existing pywebview GUI; near-zero lock-in. **Cons:** **poor fit for a shared team queue**
(intake is inherently collaborative — multiple staff working one inbox/queue, live status); per-machine
install + update + code-signing burden; chasers/scheduled flows still need a server anyway, so you
don't escape the backend; harder to do live multi-user concurrency than a web app.

## When this wins

If Collision Engineers' intake is realistically **one or two power users** running heavy local
document processing, a desktop tool over a tiny shared DB is cheap and fast. For a **3–10 person
shared-queue workflow** (the stated scale), a web app (folders 01/03/04/05) fits the collaboration
model far better. **Recommended only as a complement** (e.g. a power-user parsing/review tool) rather
than the primary platform.

## Sources

- Tauri vs Electron footprint — https://tauri.app/ · https://www.electronjs.org/
- Windows code signing (OV/EV cert pricing) — e.g. https://www.digicert.com/signing/code-signing-certificates · https://about.ssl.com/code-signing/
- Apple notarization / Developer Program $99/yr — https://developer.apple.com/support/compare-memberships/
- Backend pricing — see [05-supabase](../05-supabase/README.md), [07-vps-self-hosted](../07-vps-self-hosted/README.md)
- Existing pywebview GUI — `../cedocumentmapper_v2.0` (`build.ps1`), per repo `CLAUDE.md`
