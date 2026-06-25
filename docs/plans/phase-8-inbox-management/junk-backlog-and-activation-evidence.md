# Phase 8 — live junk-case evidence, the activation trigger, and why triage keeps test extraction working

> **Findings + activation note, 2026-06-25.** Complements [README.md](./README.md) (the canonical Phase-8
> build plan) — it does **not** repeat the taxonomy / decision-tree / build-step detail there. This note
> records the **live evidence** that motivates turning Phase 8 on, the **immediate junk-backlog cleanup**, and
> the resolution to the operator's testability concern. Phase 8 stays **ADR-0015 _Proposed_**; activation
> remains operator-gated (`fetchOnlyWithAttachment` flip + schema `-Apply` + flow activation).

## What was observed (Dev, 2026-06-25)

- 50 Cases exist in Dev and **every one is blank** (no VRM / Case-PO / work-provider / claimant / ref):
  **38 `needs_review`** (100000002) + **12 `error`** (100000010). **Zero** carry an instruction-PDF
  (no `kind=Instruction` evidence in either bucket); **zero** parsed to identity.
- The subjects/senders show what they actually are: **GitHub notifications**
  (`Re: [collisionengineers/...] feat(...)`, `[.../cepi] Run failed: npm audit`), **live vendor/business
  threads** (Minotaur/EVA, Tractable, Experian, DVLA KADOE, Thatcham), **internal colleague mail** (andrew@),
  and **personal/automated mail** (an Instagram 2FA recovery code).
- **Root cause:** `digital@` is the team's **live working inbox** (the maker / signed-in identity —
  [../../architecture/live-environment.md](../../architecture/live-environment.md)), **not** a document-intake
  inbox, and the live `CS Intake` trigger runs **`fetchOnlyWithAttachment=false`**
  ([../../activation/email-intake-activation.md](../../activation/email-intake-activation.md)) — so it turns
  **every** message into a Case. None are work-provider instructions, which is why all 50 are blank.

This is exactly the "no-attachment noise / firing on every email" that Phase 8 exists to absorb (README §Context):
today there is no triage, so ordinary correspondence becomes junk Cases.

## The `error` vs `needs_review` split is noise here

`flows/definitions/status-evaluate.definition.json` routes a blank case to `error` only when it carries
image/instruction evidence (branch 5) and to `needs_review` otherwise (branch 4, the "premature-error-safe"
guard). For these emails the discriminator collapses to *"did the notification happen to carry an inline
avatar / signature image"* — **12 did** (→ `error`), **38 didn't** (→ `needs_review`). A real mechanism, but
**no business meaning** for non-instruction mail. Parser success is not the driver (34 of the 38 `needs_review`
cases parsed fine — same as the `error` ones).

## Immediate cleanup (blank-guarded; safe)

[`dataverse/.build/delete-junk-cases.ps1`](../../../dataverse/.build/delete-junk-cases.ps1) is DRY-RUN by
default, re-checks every identity field live immediately before delete, and cascades the child rows. It
targets **one status per run**:

```powershell
# from dataverse/.build  (requires: az login to the Dev tenant)
pwsh ./delete-junk-cases.ps1                                 # DRY RUN -> 12 error
pwsh ./delete-junk-cases.ps1 -StatusInt 100000002            # DRY RUN -> 38 needs_review
pwsh ./delete-junk-cases.ps1 -Execute                         # delete the 12 error cases
pwsh ./delete-junk-cases.ps1 -StatusInt 100000002 -Execute   # delete the 38 needs_review cases
```

The blank-guard skips any case with identity, so a **successful test extraction** (which writes a VRM /
provider → a non-blank case) is **never** deleted. Cleanup is point-in-time: the backlog re-accumulates while
intake watches `digital@` on `fetchOnlyWithAttachment=false`, until Phase-8 triage lands.

## Testability is preserved — triage classifies on content, not sender

Operator concern: *"if we set it so we only get legit instructions, we'll never see the extraction working"* —
because test sends come from a separate, non-provider account. They don't: the Phase-8 classifier
([`functions/parser/cedocumentmapper_v2/rules/email_classifier.py`](../../../functions/parser/cedocumentmapper_v2/rules/email_classifier.py),
route `POST /classify-email`) routes on **content** — an instruction-PDF attachment, `_WORK_KEYWORDS`, or a
body VRM / Case-ref — **not** on a known-provider sender domain. The taxonomy carries a dedicated
**`new_client_work`** subtype precisely for unknown-domain instructions (fixture
`test-cases-and-data/triage-corpus/new_client_work/unknown-domain-instruction.eml`). So under triage:

- a test send carrying instruction content → `receiving_work` → Case → parse / extraction (sender irrelevant);
- content-less noise (GitHub / vendor / 2FA) → `other` → a `cr1bd_inboundemail` row, **no Case**.

Net effect: the operator **gains** a clean Case queue *and* keeps testing extraction. Today the test
extractions are buried under 50 junk rows; after triage they are the only Cases.

## Activation sequence

The full build / phasing / files / verification is in [README.md](./README.md) (§Phasing, §Files to
create/modify, §Verification). Two prerequisites are worth surfacing before flipping anything live:

1. **Reconcile the repo `intake.definition.json` UP to live first.** Live `CS Intake` runs
   `Run_enrich` / `Run_case_resolve` after parse that the repo def lacks
   ([../../../CURRENT_STATUS.md](../../../CURRENT_STATUS.md); intake-repo-trails-live) — a re-import without
   reconciling would regress the live wiring.
2. **`grill-with-docs` the ADR-0015 locked decisions before applying
   [`26-inbound-email.ps1`](../../../dataverse/.build/26-inbound-email.ps1)** (per the README banner).

Then soft-roll-out on the single `digital@` inbox in Dev, watching Power Automate run volume (a throttling
monitor, not a cost ceiling — README §Cost analysis). In production, intake should ultimately watch the
**dedicated 3 shared intake inboxes**, not the working inbox; `digital@` is fine as the Dev soft-rollout target.
