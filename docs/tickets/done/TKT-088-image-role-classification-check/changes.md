# Changes — TKT-088: Image role auto-classification - confirm functional + decide path

## Status
determination recorded (PLAN-003 final wave D2, 2026-07-09) — no code change in this ticket

## Commits
No code changes — determination + live re-confirmation only.

## Files touched
- this changes.md (determination record)

## Determination — the ticket's premise is STALE; auto-classification DID ship and IS live

The ticket was filed when auto role classification "was never built" (TKT-064 then-unbuilt,
roles defaulting `unknown`, staff classifying by hand). That premise no longer holds:

1. **TKT-064 shipped the vision classifier** (orchestration `src/platform/image-classify.ts`): one
   AOAI gpt-5 structured-output call per image returning role (overview / damage_closeup /
   additional / other), registration_visible (+ plate text, constrained to the CASE VRM), and
   person_reflection (TKT-123). It stamps evidence columns at intake on BOTH lanes — direct
   email attachments (`classifyPersist.ts`) and PDF-extracted images (`extractImages.ts`) — via
   the Data API internal evidence route.
2. **It is live**: `IMAGE_ROLE_CLASSIFY_ENABLED=true` on `cespk-orch-dev` with
   `AI_MODEL_ENDPOINT`/`AI_MODEL_DEPLOYMENT=gpt-5` set (read back via
   `az functionapp config appsettings list`, 2026-07-09, this batch).
3. **Live spot-check (Postgres, csadmin read 2026-07-09)**: 6,700 image evidence rows total;
   4,698 already carried a classifier-stamped role/registration before this batch. The 2,002
   still-unclassified rows are the prior residue (box-mirror lane + the ~82 TKT-064 backfill
   errors + pre-classifier intake) — exactly the TKT-131 target set, whose reclassification run
   is recorded in [TKT-131's changes.md](../TKT-131-image-role-classify-retry/changes.md).
   The screenshots in evidence/ (all-Unclassified dropdowns) show pre-TKT-064 state.

## The operator decision this ticket was blocked on — resolved by events

The ticket offered three paths (build now / stay manual / defer). **Path 1 (build) was taken**:
TKT-064 was operator-raised 2026-07-05, built, and activated with the vision family go-live
(2026-07-08, DPIA §6a sign-off). Manual classification remains available as the review/override
layer on top (the dropdown still works; a human can always re-role an image).

## Writer-ownership corollary (with TKT-112)

Now that BOTH the orch auto-classifier and the api image-analysis route are live, the ownership
model is: **orch stamps evidence columns autonomously at intake; the api image-analysis route
writes SUGGESTIONS ONLY** (verified — see TKT-112's changes.md for the invariant evidence). The
full reconcile record lives in [TKT-112](../TKT-112-image-writer-reconcile/changes.md).

## Remainders
- The box-upload live-classify path (an image arriving VIA Box, not email) still isn't wired to
  the classifier at event time — the TKT-131 backfill covers the prior rows; the forward path
  is recorded as a remainder there (TKT-112 ownership applies: it would be an orch-side stamp).
