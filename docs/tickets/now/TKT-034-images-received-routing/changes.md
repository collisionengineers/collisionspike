# Changes — TKT-034: Inbound images: match to case / create Box folder by reg / flag

## Status
The narrowed residue is built + deployed (2026-07-09, PLAN-003 intake wave). (The category split
half shipped earlier — see the 2026-07-07 reconciliation note below.)

## What shipped (the 3-step fallback chain, ADR-0015 §5)

- **Step 1 — match to an existing case:** already live via the triage rung (TKT-043 /
  TRIAGE_IMAGES_ROUTING_ENABLED + the auto-attach/suggest machinery). Unchanged.
- **Step 3 — flag for manual handling (ALWAYS, no gate):** new orchestration activity
  **`imagesUnmatched`** consumes the previously side-effect-free `route_images_unmatched` triage
  action — it stamps `attention_reason = 'images_no_match'` on the email's triage row (new
  `POST /api/internal/inbound/attention`, schema-tolerant; DDL delta
  `2026-07-09-inbound-attention-reason.sql` applied live). The SPA renders a **"No matching case"**
  chip on the inbox row (critical severity, beats "New"; superseded by a later case link) and a
  preview MessageBar: *"These images did not match any case. Please review this email and link or
  file them by hand."* — the sample-email shape (no match, no viewable reg) now lands VISIBLY on
  the flag step instead of silently as a generic query.
- **Step 2 — reg-keyed Box folder: built DARK** behind the NEW gate **`BOX_REG_FOLDER_ENABLED`**
  (default off; registered `(absent)` in LIVE_FACTS). When the operator approves the new
  folder-naming semantic (non-Case/PO folders named by registration under `BOX_FOLDER_ROOT_ID`),
  flipping it makes `imagesUnmatched` create the folder via the existing box-fn `create_folder`
  (scope-locked to the allowed root — the Box scope-guard allowlist is satisfied because the folder
  parent IS `BOX_FOLDER_ROOT_ID`). Box 409 name-conflict is an idempotent reuse server-side.

## Deploy state
orch redeployed (70 fns — `imagesUnmatched` visible in the function list), api redeployed, SPA
redeployed. Gate NOT flipped (operator item — needs the folder-semantics approval).

## Remainders (honest)
- Live proof of the flag: the next unmatched image-bearing email (with the triage images gate on,
  which it is) should show the chip — verifier item; no synthetic email was injected.
- The reg-keyed folder rung stays dark until the operator approves + flips
  `BOX_REG_FOLDER_ENABLED` (suggest adding to docs/gated.md at distillation).

## Reconciliation note (2026-07-07) — stays backlog, rescoped
Half of this is **already shipped**: the Enquiries-vs-Case-Queries category split exists on `main` —
`query_existing_work` (100000003) + `query_new_enquiry` (100000004) in
`packages/domain/src/data/choicesets/inbound-email-classification.json:32-33`, with the DTO/outlook-folder
plumbing. What remained was the **image-received fallback chain** — built this wave as above.
