# Provider / Principal / Garage Corpus & Automation Model

Distilled from `raw/provider_principal_garage_corpus/` and the CE Job Sheet. Defines the governed,
editable corpus that drives deterministic provider matching, Case/PO generation, inspection-address
policy, and the automation gates. Schema lives in [../architecture/data-model.md](../architecture/data-model.md);
this doc covers behaviour. **Derived from reference material — treat as proposed, confirm in grill.**

## Why a corpus (not reference files)
Today provider knowledge lives in the job sheet's `Principals` sheet (58 rows) + staff memory.
The spike needs a **governed, Management-editable backend corpus** so matching, policy, and Case/PO
are deterministic and auditable. Two record types only: **WorkProvider** and **InspectionAddress**
(garage/repairer/bodyshop/storage are source labels, not separate entities). `Insurer` is dropped
from the core model unless first-class source material makes it workflow-relevant.

## Provider Automation Mode (per WorkProvider)
Controls whether populated data requires human review before EVA:
| Mode | Meaning |
|---|---|
| `No auto` | Staff do everything, including data entry. |
| `Review auto` | Extraction/corpus/AI may populate fields; **staff review before EVA**. |
| `AI Auto` | May proceed to EVA after a strict AI review passes. |
| `Full auto` | May proceed straight to EVA, zero human interaction, when every gate passes. |

**Unknown providers default to `Review auto`** (and `prefer_address` policy).

> **Spike scope (decided):** only **`Review auto`** is active initially — every populated field is
> staff-reviewed before EVA. `AI Auto` / `Full auto` are modelled but **deferred** until accuracy/
> trust data exists. Implement the **global** kill switches now (AI / EVA-submit / enrichment /
> outbound); per-provider toggles and the **Improvement-Review queue** are modelled but deferred.
> Keep field-level **provenance markers** from day one (cheap, and hard to backfill).

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
