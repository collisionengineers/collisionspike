# PLAN-005 / TKT-150 remediation handoff — 2026-07-14

## Executive verdict

This is the current handoff for repository reconciliation and claimant remediation. It was prepared from
`main` at `d62260ca66210d22be2884b862681f9b992f5795` after fetching `origin`.

- The TKT-150 runtime, schema, parser fingerprint endpoint, provider recovery safeguards, and initial
  remediation runner were merged and deployed through PR #93.
- PRs #94–#96 subsequently hardened the offline remediation runner for retained text, raw email identity,
  and root-level retained email pairs. Those runner-only changes did not require another live deployment.
- The latest v8 read-only plan completed, but its independent audit failed. It is explicitly superseded and
  cannot be approved, backed up as current authority, or applied.
- TKT-150 remains `now` with a `PENDING` verification verdict.
- No claimant apply, final operational cutover, spreadsheet-dependent folder switch, production EVA call,
  Outlook write, Graph mutation, service pause, or production Archive-root write was attempted.
- The retired Claude+Codex reciprocal-review workflow was deleted from `main` and from every open PR branch.
  Normal GitHub review and ordinary CI remain.

## Non-negotiable safety boundary

This handoff does not authorise a live cutover. The final cutover remains blocked until the separately required
job spreadsheet, production EVA API access, and independently verified production Archive authority exist.
TKT-150 is claimant-only remediation and must continue to obey these rules:

1. Generate and inspect a brand-new full plan outside Git.
2. Require the independent redacted audit to pass before treating that plan as authority.
3. Only then create and restore-prove a dump bound to that exact plan.
4. Obtain named, unexpired human approval bound to the exact plan, backup, runner, environment, counts, and
   allowlists.
5. Apply only fill-if-blank claimant writes and the sealed status-recompute allowlist.
6. Keep all raw source, plan, backup, approval, journal, and ledger artifacts outside every repository and
   linked worktree.

## Merged implementation map

| PR | Main result | Scope | Deployment state |
|---|---|---|---|
| #93 | `cc0d7b52` | Runtime/schema safeguards, parser fingerprint contract, provider recovery, and initial runner | Runtime/schema/API/orchestration/Box/parser deployment completed and verified |
| #94 | `8f8f31cc` | Retained-body replay hardening | Runner-only; no redeployment required |
| #95 | `72266795` | Raw-email identity binding | Runner-only; no redeployment required |
| #96 | `d62260ca` | Root-level retained email-pair support | Runner-only; no redeployment required |

The focused current-main gate was rerun on 2026-07-14:

```text
npm run test:tkt150-remediation
50 passed, 0 failed, 0 skipped
```

This proves the checked-in contract tests. It does not override the failed v8 live-plan audit.

## Attempt chronology

All attempt artifacts are private under:

`C:\Users\PC\Documents\CollisionSpike-Private\TKT-150\20260714-061441`

Do not copy the raw plans, stdout/stderr, source material, dumps, manifests, or identifiers into Git.

| Attempt | Plan census (baseline / repair / absent / conflict / failed) | Result and disposition |
|---|---:|---|
| Initial/root | 151 / 13 / 59 / 0 / 79 | Obsolete audit passed, but the source model rejected retained text. QDOS26079 first failed at `source_type`. A plan-bound dump was created and restore-proved, but the plan and backup are superseded. No approval, apply, or ledger. |
| Retained-text v3 | 152 / 25 / 67 / 0 / 60 | Obsolete audit passed, but unique tokenized bodies were still rejected. QDOS26079 failed at `source_processing`. Superseded; no backup, approval, apply, or ledger. |
| Raw-EML v4 | 154 / 26 / 91 / 0 / 37 | Audit failed with 62 invariant failures; one census row was not fully classified. QDOS26079 still failed at `source_processing`. Superseded; no backup, approval, apply, or ledger. |
| Launcher v5 | No plan | Failed before firewall creation because the Windows Azure CLI firewall arguments were wrong. Superseded. |
| Launcher v6 | No plan | Failed at repository identity before firewall creation because environment clearing poisoned child Git variables on Windows. Superseded. |
| Launcher v7 | No plan | Failed at Key Vault resolution before firewall creation because live references use `VaultName`/`SecretName`. Superseded. |
| Root-EML v8 | 156 / 27 / 93 / 0 / 36 | Planning and cleanup completed, but the audit failed with 60 invariant failures. Superseded and marked must-not-apply/approve/back-up-as-authority. No backup, approval, apply, journal, or ledger. |

The two files named `*-delta-apply.txt` in the initial private directory are deployment/schema evidence, not a
claimant-data apply. Across all attempts, `applyAttempted=false`.

## Latest v8 evidence

Safe aggregate and integrity facts:

- plan progress: 156 of 156;
- status rows: 156;
- proposed claimant repairs: 27;
- absent in source: 93;
- conflicts: 0;
- failed: 36;
- source-processing failures: 49, parse failures: 1, email-provenance failures: 6;
- 18 tokenized retained-text rows still lack an exact raw-email binding;
- root-level raw binding count: 0;
- QDOS26079 found a claimant in its PDF but still failed at `source_processing` and authorised no write;
- two legitimate newly observed source-absent cases made the helper's fixed exact-reference-size expectation
  stale; and
- the temporary TKT-150 firewall rule set was absent after cleanup, with the pre/post firewall snapshot hash
  unchanged.

Key v8 hashes:

| Artifact | SHA-256 |
|---|---|
| Current checked-in runner | `8e5eca3cc25ab735267bf0d544a9d2408bbd18aa4f56920d9a7477deea84656e` |
| v8 launcher | `8218e3dbc6e045fc630d6fdbf208a5347cf6025ad1b29cfa582d8a9270180fa8` |
| v8 audit helper | `d717a5f2ee56eda64393dcd54e9762c49473b4bc3189d430d17476c7484da93e` |
| Raw v8 plan | `ad13472c01ebd1d044893bd5872c831a8023bc94f98f5f670e9ea929e8bfa160` |
| Sealed v8 plan | `eb04538f803d1f82e02e9a11d37374523567ccb290a6ff443327970974093858` |
| v8 audit summary | `035d37618ddbace9d9c0e41c8778bfcf1b8395daa7c9829417088d3c324bcce9` |
| Deployed parser fingerprint | `a187e9fff018b5a81545a8dfc19b631cfd3f88f00b5a02889cd6e5a3275b60b2` |
| Firewall snapshot, before and after | `7ebf84f8b51071f2db75a252f96da5881f3a7fed6db27b13ba6b855b46c8c452` |

## Current blockers and the next safe sequence

The next implementation must start from current `main`, not from a historical TKT-150 branch.

1. Reproduce the 18 tokenized binding failures using redacted/isolated fixtures.
2. Correct the source-identity model for the observed retained-source shapes, including root-level pairs,
   without relaxing exact full-message identity or collision checks.
3. Make the audit's expected reference set tolerate legitimate baseline growth while still requiring complete
   one-to-one accounting.
4. Add permanent positive and negative fixtures, including the QDOS-like PDF-plus-retained-source shape.
5. Merge through normal CI and normal human review. Do not restore the retired reciprocal-review workflow.
6. Generate an entirely new plan with a new timestamp and independently audit it.
7. If and only if the audit passes, create a new plan-bound dump/restore proof and seek named approval.
8. Apply claimant-only remediation, retain the external journal/ledger, and commission independent live
   verification before moving the ticket through `verify` to `done`.

## Repository and PR state at handoff

The reconciliation evidence is indexed in
[`docs/reconciliation/PLAN-005/README.md`](../reconciliation/PLAN-005/README.md), and the authoritative machine
snapshot is [`current-inventory.json`](../reconciliation/PLAN-005/current-inventory.json).
At the first 2026-07-14 handoff checkpoint:

| PR / branch | Published head | State | Required next action |
|---|---|---|---|
| PR #73 / `codex/tkt-154-mcp-image-ingestion` | `93528ba9` | Draft, conflicts with current main | Rebase/resolve semantically, run its ticket gates, merge or close |
| PR #83 / `codex/guided-capture-server` | `df674dcd` | Draft, conflicts with current main | Rebase/resolve semantically, run its ticket gates, merge or close |
| PR #87 / `codex/tkt-160-delete-case-image` | `5ba04004` | Draft, conflicts with current main | Rebase/resolve semantically, run its ticket gates, merge or close |
| PR #89 / `codex/tkt-034-archive-adoption` | `3ffe81ec` | Draft, conflicts with current main | Rebase/resolve semantically, run its ticket gates, merge or close |
| `codex/tkt-150-closeout` | `42fe65be` | PR #93 merged; patch-equivalent/stale worktree | Remove worktree and local/remote branch after this handoff is remote |
| `codex/tkt-150-claimant-extraction` | `a2b34640` | Historical, remote-preserved, no open PR | Retain only until its patch-unique history is fully represented by this handoff/recovery bundle |
| `codex/tkt-150-live-proof` | `80e4868b` | Historical, remote-preserved, no open PR | Same semantic disposition requirement |
| `codex/tkt-150-live-remediation` | `ed63af70` | Historical, remote-preserved, no open PR | Same semantic disposition requirement |

The latest TKT-154 and TKT-160 local safety commits were force-published to their existing PR branches under
exact `--force-with-lease` guards. The PLAN-005 reconciliation documents and scripts that were previously
untracked in the guided-capture worktree were copied byte-for-byte to the dedicated
`codex/plan-005-handoff` branch. Its stale untracked PLAN-005 shadow was not copied because it only removed the
current YAML frontmatter and added blank lines.

## Completion semantics

This handoff closes preservation and explains the current state; it does not claim PLAN-005 is complete.
PLAN-005 remains active until its much broader acceptance criteria are met, including resolution of all open
PRs, all ticket truth, the separately gated final cutover, and final branch/worktree cleanup. TKT-150 remains
open until a new audited plan, current backup/approval, claimant-only apply, complete ledger, and independent
live proof exist.
