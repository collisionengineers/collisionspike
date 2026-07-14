# Evidence — TKT-041 (cancelled/closed-case emails)

The evidence for this ticket is the corpus of 13 real `.eml` samples kept in the sibling
[`source-emails/cancelled-cases/`](../source-emails/cancelled-cases/) directory (a mix of cancellation,
closure, instruction and estimate mails — useful as both positives and near-miss negatives for the eval
corpus).

**Why the samples live under `source-emails/`, not moved directly into `evidence/`.** The eval harness
references every one of these 13 files by its exact path in `scripts/eval-email/manifest.json` (manifest ids
`tkt041-*`), and `scripts/check-tickets.mjs` fails if any of those manifest paths stop resolving. Relocating
the files would break the harness and the ticket gate — and `manifest.json` is outside `docs/tickets/**` — so
the samples stay at their manifest-referenced path and this README is the `evidence/` pointer to them.

## Contents (`../source-emails/cancelled-cases/`)

- `Claim Cancelled - SBL-B0521876.eml`, `Claim Cancelled - SBL-B0649696.eml` — true cancellations
  (the live-probe sample is `SBL-B0649696`).
- `Claim closed notification  AX REF - 1062608 / 1069305 / 1070680.eml` — three closures.
- The remaining eight (instruction / estimate / query mails, plus the `tkt041-06-hold-request` hold sample)
  — near-miss negatives that keep the cancellation rule honest.

## Live verification

See [../verification.md](../verification.md): the real `Claim Cancelled - SBL-B0649696` sample POSTed to the
deployed classify route returned 200 `cancellation`/`cancellation_notice` (taxonomy_version 2); corpus
cancellation recall was 12/12 with no regression.
