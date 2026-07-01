# Provider / Principal / Garage Corpus & Automation Model

Distilled from `raw/provider_principal_garage_corpus/` and the CE Job Sheet. Defines the governed,
editable corpus that drives deterministic provider matching, Case/PO generation, inspection-address
policy, and the automation gates. Schema lives in [../architecture/data-model.md](../architecture/data-model.md);
this doc covers behaviour. **Derived from reference material — treat as proposed, confirm in grill.**

## Why a corpus (not reference files)
Today provider knowledge lives in the job sheet's `Principals` sheet (58 rows) + staff memory.
The spike needs a **governed, Management-editable backend corpus** so matching, policy, and Case/PO
are deterministic and auditable. Three record types: **WorkProvider**, **Repairer** (a first-class
entity, many-to-many with WorkProvider per ADR-0001 — garage/repairer/bodyshop/storage are
**Repairer** rows, not flattened labels), and **InspectionAddress** (a specific address linked to a
Repairer or entered ad hoc). The live Sandbox schema reflects this: the Repairer table has 61 seeded
rows. `Insurer` is dropped from the core model unless first-class source material makes it
workflow-relevant.

## Provider Automation Mode (per WorkProvider)
Controls whether populated data requires human review before EVA:
| Mode | Meaning |
|---|---|
| `No auto` | Staff do everything, including data entry. |
| `Review auto` | Extraction/corpus/AI may populate fields; **staff review before EVA**. |
| `AI Auto` | May proceed to EVA after a strict AI review passes. |
| `Full auto` | May proceed straight to EVA, zero human interaction, when every gate passes. |

**Unknown providers default to `Review auto`** (and `prefer_address` policy).

> **Live enforcement (2026-06-30, [TKT-013](../tickets/TKT-013-automation-mode/TKT-013-automation-mode.md)):**
> modes are stored on `work_provider.provider_automation_mode_code` (`manual` · `review_auto` ·
> `full_auto` deferred in the choiceset) and **honoured by the orchestration pipeline**. Record-keeping
> (Box folder create, evidence archive, image extract) runs on **every** intake regardless of mode;
> **enrichment** is deferred when the matched provider is `manual`. Active providers in the live corpus are
> set to `review_auto` — see the registry
> [live-environment.md](../architecture/live-environment.md). `AI Auto` / `Full auto` remain modelled but
> **deferred** until accuracy/trust data exists.

## Two-tier control (global kill switch → per-provider)
Every automated capability is checked twice: the **global kill switch** first, then the
**per-WorkProvider** setting. Per-provider toggles: Provider Automation Mode, **AI assistance
allowed**, **EVA submission allowed**, **External enrichment allowed** (DVLA/DVSA, Document AI,
Vision, web), **Outbound communications allowed** (email/WhatsApp), **Inspection Address policy**.

## Provider matching
Sender email **domain after `@`** → `WorkProvider.knownEmailDomains`. No alias matching. Keep
domains/codes unambiguous to protect Case/PO safety.

## Provenance & the improvement loop
Every EVA-relevant field carries provenance (see data-model). `Review auto` is a **case-level
review** with field-level visibility: staff resolve `needs_review`/`conflict`, then
`Mark case reviewed for EVA`. Staff corrections **never auto-change active rules** — they emit
`ImprovementSignal`s into a Management **Improvement Review** queue (filter/group/export; actions:
mark one-off, create corpus/parser/policy task, ignore). This turns staff knowledge into structured
data over time.

## Safety rules (corpus edits are high-impact settings changes)
- Referenced records are never deleted — deactivate/archive/merge (keep old IDs as redirects;
  Case/PO history depends on old principal codes).
- Email domains / principal codes must be unique enough to prevent ambiguous matching.
- Loosening Inspection Address policy or Automation Mode requires a **reason + impact count** of
  affected open cases.
- `required_address` override stays Management-only and audited.
- Corpus address edits require source/evidence notes; imports require **preview diff**; parser/rule
  activation changes require **dry-run impact checks**; affected providers become
  `Configured, not verified` until rechecked; rollback restores the previous version.

## Seed data
The job sheet `Principals` (58) and `Garages` (38) extracts in
`raw/inspection_address_helper/ce_principals_and_garages_normalized.md` (gitignored, PII) are the
**first version** of the corpus. Note real-world messiness to handle on import: duplicate provider
rows (e.g. multiple Knightsbridge/KMR/RJS rows by sub-source), free-text storage addresses embedded
in the `Image based or address` column, EVA codes like `Create for each` / `Check Instructions`,
and sub-source routing (e.g. Fraz/On Track, Hackney Solutions). These need normalisation + Management
review, not blind import.

**Decided — assisted import + Management review:** a one-time import tool parses the sheets into
**draft** WorkProvider + ImageSource + Repairer records — collapsing duplicate rows by Principal Code
into one WorkProvider + N **ImageSources**, and lifting embedded storage addresses out of the
free-text "Image based or address" column into **Repairer/InspectionAddress** records — then presents
a **preview diff** for Management to approve/correct before activation. Odd codes (`Create for each`,
`Check Instructions`, `N/A`) are flagged for manual handling, never auto-used for Case/PO.
