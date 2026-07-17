# ADR-0007 — Receipt of images

**Status:** Accepted; rewritten and renamed 2026-07-16 per [Review 160726](../reviews/160726/decisions.md).

## Decision

Images reach a Case through five receipt channels. Each records its source channel, and every proposed
match to a Case follows [ADR-0002](./0002-vrm-open-case-correlation.md) /
[ADR-0010](./0010-dedup-reference-disambiguated-no-time-window.md).

1. **File Request links.** The chaser flow issues an account-free Box File Request against the Case
   folder (built — TKT-156); uploads land in the Archive path under
   [ADR-0012](./0012-box-centric-intake-additive-hybrid.md).
2. **Guided capture.** *Direction — open evaluation (2026-07-16):* File Requests carry the need today.
   Commercial guided-capture products (tractable/ravin class) hold management interest, and the in-house
   CollisionCapture flow is a contender (built dark — TKT-200; related TKT-102/104). Selection criteria:
   capture quality, claimant friction, cost per case, and data-protection posture. The selection is
   deliberately deferred; no channel is committed by this ADR.
3. **WhatsApp.** Staff attach WhatsApp-sourced media manually; a bulk-assist path may read registration
   text from media and propose an open-Case match. There is no programmatic WhatsApp channel — outbound
   chasers stay manual under [ADR-0003](./0003-channel-aware-chasers-whatsapp-constraint.md). Receiving
   an entire *case* over WhatsApp is a separate matter: it is added manually today, as there is no
   facility to handle it.
4. **Network drive.** A staged scan of the office network drive that reads registrations from filenames
   and folder names and proposes matches (decided 2026-07-16; not built — TKT-242).
5. **Agent attach.** The MCP image-ingest lane is shipped (TKT-154) under the tiered access model of
   [ADR-0023](./0023-mcp-server-hosting-and-auth.md), with
   [ADR-0024](./0024-assistant-write-tier-confirmation-protocol.md) /
   [ADR-0025](./0025-shared-capability-registry.md) governing the assistant surfaces. In-app assistant
   attach is not built (TKT-068).

## Rationale

Image receipt is now genuinely multi-channel, and the old WhatsApp-only decision under-described it.
Naming the channels in one place keeps source recording, matching, and Archive behaviour consistent, and
keeps each channel's build state honest.

## Consequences

Every attachment records its receipt channel. Proposed matches are reviewable, ambiguous media stays
visible, and no channel bypasses the correlation rules or the Archive safety rules.
