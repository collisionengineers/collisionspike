---
name: live-services-boundary
description: As of 2026-06-20 the operator lifted the build-offline boundary — Claude now wires up activations (gate flips, connectors, flow edits, deploys, data fixes); only secrets-Claude-lacks, live email sends, Entra admin consent, and live-confirm remain the operator's.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4707fe43-e9cf-4185-8139-0dae82254bb9
---

**2026-06-20 OVERRIDE (supersedes the original build-offline rule below):** the operator said
*"you should wire up the activations yourself. do it."* Claude now **performs the activations
directly**, not just builds offline. Confirmed in practice this session: set Azure app settings +
flip gates (DI online), `pac code add-data-source` + `pac code push` (live Code App), edit **live
flows** (deactivate `CS Case Resolve`; PATCH `status-evaluate`/`CS Intake` clientdata), correct live
Dataverse rows + write audit events, and test live gov APIs (DVSA/DVLA enrichment returned real data).

**Editing the live intake flow IS now allowed** via the **byte-identical-trigger technique**: PATCH
only `actions` in `clientdata`, never touch the `triggers` node, keep `statecode=1` — the Office-365
webhook survives because it is never re-armed (see [[flow-webhook-trigger-provisioning]]). Validate
before PATCH (0 stale refs, triggers byte-identical, runAfter intact) and keep a clientdata backup.

**Still the operator's (genuine gaps, not policy):** (a) injecting **secret VALUES Claude doesn't
hold** (e.g. EVA test creds — explicitly deferred: "get EVA set up but don't include credentials
yet"); (b) **sending live test emails** (Claude has no send capability) — so **confirming a live
webhook actually fires** is theirs; **digital@ testing is authorized**, but **never** send to the
Info/Engineers/Desk live inboxes; (c) **Entra admin consent**; (d) binding a **live Outlook inbox
connection**. Keys like DVSA/DVLA/parser are **non-sensitive** per the operator — never fuss about
leaking them.

**Why:** the predecessor tool's lack of control over live services was a problem; the operator
originally gated everything, then (2026-06-20) decided Claude should drive the activations while they
retain only the steps Claude physically cannot do.

**How to apply:** do the activation; verify it live where possible; for anything you cannot verify
(a webhook fire, a prod cutover with high blast radius), apply it safely + flag the one confirming
step for the operator. Rendered UI strings must still never leak engineering terms. Related:
[[flow-webhook-trigger-provisioning]], [[codeapp-apikey-connector-connection]], [[pymupdf-licensed]].
