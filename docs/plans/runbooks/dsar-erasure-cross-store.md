# DSAR / right-to-erasure — cross-store runbook

> **Scope.** The **documented, repeatable procedure** for satisfying a data-subject **access (DSAR)**
> or **erasure** request across **all three stores** the pipeline uses: **Dataverse** (system of
> record), **Azure Blob** (transient `.eml` + image bytes), and **Box** (one-way mirror). A request
> that reaches only the system of record is **incomplete** — this runbook exists so that does not
> happen.
>
> **Binding decision:** [ADR-0017 — Data retention, erasure & PII lifecycle](../../adr/0017-data-retention-erasure-pii-lifecycle.md)
> (**Proposed**), item G4. Controller-facing map: [docs/architecture/data-protection.md](../../architecture/data-protection.md).
> Phase plan: [docs/plans/phase-9-data-governance/README.md](../phase-9-data-governance/README.md). Operator blockers:
> [docs/gated.md](../../../docs/gated.md).
>
> **Status:** **authored, not yet exercised.** The locate/export steps are documented and concrete; the
> destructive steps are **operator-run** (they touch live stores) and are gated on the store-hardening
> pre-step (soft-delete + versioning) being in place first. Each step is tagged **[C]** (Claude can
> prepare/run the read-only part) or **[O]** (operator-only — a live delete, a Box action, a tenant
> confirm).

---

## 0. Before you start — intake, identity & holds

**0.1 — [O] Verify the requester's identity** and the **scope** of the request (access vs erasure;
which subject; which case(s)). Identity verification is an operator/legal step — **[RESERVED-FOR-USER]**.

**0.2 — [O] Check for a litigation / evidential hold FIRST.** An engineer's report can become evidence
in a dispute **years later** (the two-clock model, [data-protection §8](../../architecture/data-protection.md#8-retention--the-two-clock-model)).
**If the case is under (or potentially under) legal hold, erasure is PAUSED, not performed** — record
the hold, inform the subject of the exemption, and stop. Whether a case qualifies is an operator/legal
determination — **[RESERVED-FOR-USER]**. (Once the retention schema lands, the hold is the
`cr1bd_case` legal-hold flag; until then it is a manual check.)

**0.3 — Pick the subject key(s).** The pipeline keys PII three ways; you will need **all three** to be
thorough because the stores are keyed differently:

- **Case / PO** — `principalCode + 2-digit year + 3-digit sequence`, e.g. `CCPY26050`. **EVA renders
  lowercase** (`ccpy26050`), **Box renders UPPERCASE** (`CCPY26050`). The Box folder name **is** the
  Case/PO.
- **VRM** — the vehicle registration; the primary correlation key in Dataverse and present in Box
  folder contents / image OCR.
- **Claimant identity** — name / email / telephone, on `cr1bd_case`.

> **A single subject can span multiple Cases** (multiple historical Cases per VRM are allowed;
> ADR-0002/0010). Enumerate **every** Case for the subject before erasing — never assume one.

---

## 1. Dataverse — locate (FetchXML by Case / VRM / claimant)

**[C/O] Find every Case for the subject.** Run a FetchXML query (Power Apps maker portal → advanced
find, or the Dataverse Web API). Match on whichever key(s) you hold; OR them together to be thorough.

```xml
<fetch>
  <entity name="cr1bd_case">
    <attribute name="cr1bd_caseid" />
    <attribute name="cr1bd_casepo" />
    <attribute name="cr1bd_vrm" />
    <attribute name="cr1bd_claimantname" />
    <attribute name="cr1bd_boxfolderid" />
    <attribute name="cr1bd_boxfolderurl" />
    <attribute name="cr1bd_boxfilerequestid" />
    <attribute name="cr1bd_boxfilerequesturl" />
    <attribute name="cr1bd_sourcemailbox" />
    <attribute name="cr1bd_status" />
    <filter type="or">
      <condition attribute="cr1bd_vrm" operator="eq" value="VRM_HERE" />
      <condition attribute="cr1bd_casepo" operator="eq" value="ccpy26050" />
      <condition attribute="cr1bd_claimantname" operator="like" value="%SURNAME%" />
    </filter>
  </entity>
</fetch>
```

For each Case id returned, pull the **related rows** that also hold PII:

- **`cr1bd_evidence`** — by `cr1bd_caseid` lookup. Holds image/`.eml`/instruction/valuation kinds, the
  Box correlation mirror (`cr1bd_boxfileid`, `cr1bd_boxfileurl`), and the **storage pointer** for the
  Blob bytes (`cr1bd_sourcemessageid` carries the `box:file:<id>` / message correlation).
- **`cr1bd_inspectionaddress`** *(the per-case `InspectionAddress` row — distinct from the suggestions
  corpus)* — ad-hoc claimant-home / storage-yard addresses.
- **`cr1bd_chaser`**, **`cr1bd_note`** — free-text that may quote claimant detail.
- **`cr1bd_auditevent`** — before/after snapshots that may embed PII values (see [§5](#5-the-audit-trail--erasure-tension)).

> **Do NOT touch `cr1bd_inspectionaddress` corpus rows** that are the **offline-derived suggestions
> corpus** (ADR-0013/0016, ≈870 governed rows). Those are CE's own provider/garage directory, not the
> claimant's personal data. Only the **per-case** address attached to the subject's Case is in scope.
> If unsure which a row is, treat it as corpus and escalate — **[RESERVED-FOR-USER]**.

**Export (DSAR / access).** [C] Serialise the Case + related rows to a structured export (JSON/CSV)
for the access response. This is the portability-friendly form.

---

## 2. Azure Blob — locate (prefix list) & erase

The `evidence` container (account `cespkevidstdev01`, container `evidence`, `rg-collisionspike-dev`)
holds the **`.eml` + image bytes**. Bytes are keyed by a **per-case prefix** derived from the Case id /
Case-PO (confirm the exact prefix convention from the live `finalize-eva-box` / intake persist step
before deleting).

**2.1 — [C] List the subject's blobs (read-only):**

```bash
az storage blob list \
  --account-name cespkevidstdev01 \
  --container-name evidence \
  --prefix "<CASE_PREFIX>/" \
  --query "[].name" -o tsv
```

Repeat for **every** Case/prefix the subject spans (from [§1](#1-dataverse--locate-fetchxml-by-case--vrm--claimant)).

**2.2 — [O] Erase the bytes (only after the hardening pre-step is in place):**

> **PRE-STEP (ADR-0017 G6) — do not erase until this is true:** the `evidence` container has
> **soft-delete + versioning enabled** so a mis-fire is recoverable. This is the **hard pre-step before
> any delete**. See [data-protection §8b](../../architecture/data-protection.md#8b-store-hardening-pre-step-before-any-purge-is-armed).

```bash
# review the list FIRST; then delete by the verified prefix
az storage blob delete-batch \
  --account-name cespkevidstdev01 \
  --source evidence \
  --pattern "<CASE_PREFIX>/*"
```

> **Note the overlap with `box-blob-purge`.** That flow may already have removed **accepted-for-EVA
> image** bytes for `box_synced` cases past grace — but it leaves the **`.eml`**, the **excluded
> images**, and **non-image transient bytes**. A DSAR erasure must sweep the **whole** prefix, not just
> what the purge would have taken.

---

## 3. Box — locate the folder by Case/PO (NO automated deletion)

**3.1 — [C] Locate the folder.** The Box folder **name is the UPPERCASE Case/PO** (e.g. `CCPY26050`).
Use `cr1bd_boxfolderid` / `cr1bd_boxfolderurl` from [§1](#1-dataverse--locate-fetchxml-by-case--vrm--claimant),
or `ListFolder` under the archive root via the `cr1bd_box_rest` connector. Record the folder id and the
File-Request id/url (`cr1bd_boxfilerequestid` / `cr1bd_boxfilerequesturl`) for [§4](#4-erasure-blind-spots-pii-outside-dataverse).

**3.2 — [O] Erase in Box — BY A HUMAN ONLY.**

> ### ⛔ NO AUTOMATED DELETION FROM BOX, EVER
> No flow, schedule, or disposition job deletes from Box (the **box-blob-purge principle**,
> ADR-0017 item 9 / ADR-0012 one-way mirror). For a DSAR erasure, an **operator removes the Box folder
> (and any copied File Request) by hand** in the Box web app / Admin Console. The connector is used
> only to **locate** (`ListFolder` / `GetFolderSharedLink`), never to delete on a schedule.

**3.3 — [O] Empty Box Trash.** Deleting a Box folder moves it to **Trash** (recoverable, default ~30
days). For a genuine erasure the operator must also **purge it from Trash** (or wait out the trash
retention and record that). Confirm CE's Box Trash retention setting — **[RESERVED-FOR-USER]**.

**3.4 — [O] Deactivate the copied File Request.** If a per-case File Request was copied onto the
folder, deactivate it (`PUT /file_requests/{id}` `{status:"inactive"}`) so its **upload URL 404s** —
this is part of closing the [URL blind spot](#4-erasure-blind-spots-pii-outside-dataverse).

---

## 4. ⚠️ Erasure blind spots — PII outside Dataverse

**This is the section that makes the difference between complete and incomplete erasure.** PII-adjacent
identifiers live **OUTSIDE** the Dataverse system of record. Erasing the Dataverse rows and the bytes
**does not** reach these. Enumerate and clear **every** one:

| Blind spot | What leaks | Where | How to clear |
|---|---|---|---|
| **Box folder NAMES** | the **Case/PO** (and thus the principal + sequence) is the folder name; folder names are visible in Box search, shared-link previews, and admin reports | Box | covered by the [§3.2](#3-box--locate-the-folder-by-casepo-no-automated-deletion) human folder delete **+ Trash purge** ([§3.3](#3-box--locate-the-folder-by-casepo-no-automated-deletion)) — deleting the folder removes the name |
| **File-Request URLs** | a live File-Request **upload URL** can sit in email/chaser history and is tied to the case folder; the `cr1bd_boxfilerequesturl` mirrors it | Box + Dataverse + outbound chasers | **deactivate** the File Request ([§3.4](#3-box--locate-the-folder-by-casepo-no-automated-deletion)) so the URL 404s; null the `cr1bd_boxfilerequestid/url` Dataverse fields ([§1](#1-dataverse--locate-fetchxml-by-case--vrm--claimant)); note any chaser email that quoted the URL |
| **Outlook CATEGORY strings** | intake / triage stamps a **category** on the source Outlook message (Power Automate "Update email / categories"; Phase-8 `cr1bd_category`/`cr1bd_subtype`); a category that encodes Case/VRM/claimant is PII-adjacent and lives **on the mail item in the shared mailbox**, outside Dataverse and outside Blob/Box | Outlook (shared mailbox) | **[O]** remove the category from the source message(s) in the relevant shared inbox (`digital@` and, when live, Info/Engineers/Desk); if the original `.eml` was retained, that copy is handled in [§2](#2-azure-blob--locate-prefix-list--erase) |
| **Shared-link tokens** | a server-minted "Open in Box" deep link / shared link can persist after the row is gone | Box | revoking the link is implicit in the folder delete; if a standalone shared link was minted, revoke it in Box |
| **Backups / soft-delete shadows** | the hardening pre-step (Blob soft-delete + versioning, Box Trash, KV purge-protection) **intentionally retains recoverable copies** — these are a blind spot for erasure even though they are a safety feature for accidents | Azure Blob versions/snapshots · Box Trash | for a true erasure, also clear the **soft-deleted versions / Trash** once the active delete is confirmed correct, OR record the residual-retention window and inform the subject — **[RESERVED-FOR-USER]** |

> **The `.eml` is the high-value blind-spot target.** It is retained **only when a Case is extracted**,
> but when present it holds the **full original correspondence** (headers, body, the claimant's own
> words) in **both** Blob ([§2](#2-azure-blob--locate-prefix-list--erase)) **and** the Box mirror
> ([§3](#3-box--locate-the-folder-by-casepo-no-automated-deletion)). Both copies must go.

---

## 5. The audit-trail / erasure tension

`cr1bd_auditevent` records before/after snapshots of case/corpus changes and **may embed PII values**.
Erasure must **not silently destroy the audit trail** (the trail is required for accountability), yet
the trail must not become a back-door PII store after erasure.

- ADR-0017 item 7 requires a **defined cascade-delete rule** for `cr1bd_auditevent` when a Case is
  hard-deleted (by the disposition flow **or** a DSAR). That rule — **cascade-delete vs retain-but-
  redact the PII values in the before/after fields** — is an operator/legal decision: **[RESERVED-FOR-USER]**.
- Until the rule is set, **do not blanket-delete audit rows** during a DSAR; flag them and escalate.

---

## 6. Verify & record

**6.1 — [C] Re-run the locate queries** ([§1](#1-dataverse--locate-fetchxml-by-case--vrm--claimant),
[§2.1](#2-azure-blob--locate-prefix-list--erase), [§3.1](#3-box--locate-the-folder-by-casepo-no-automated-deletion))
and confirm **zero** live rows / blobs / Box folder remain for the subject (allowing for the
intentional soft-delete/Trash residual recorded in [§4](#4-erasure-blind-spots-pii-outside-dataverse)).

**6.2 — [O] Record the action.** Log the DSAR/erasure as an audit event (actor, subject keys, stores
touched, what was retained under legal hold or residual-retention, the response sent to the subject).
This record itself should hold the **minimum** identity needed.

**6.3 — [O] Respond to the subject** within the statutory deadline (DSAR: one month, extendable) —
**[RESERVED-FOR-USER]** for the operator/legal response wording and any exemption claimed.

---

## Cross-store checklist (one line each)

| # | Store / target | Owner | Done when |
|---|---|---|---|
| 0 | Identity verified; legal hold checked | [O] | hold absent (or erasure paused + recorded) |
| 1 | Dataverse Case + Evidence + InspectionAddress + Chaser/Note | [C/O] | every Case for the subject enumerated; rows exported (DSAR) / deleted (erasure) |
| 2 | Azure Blob `.eml` + image bytes | [O] | full per-case prefix swept (soft-delete pre-step in place) |
| 3 | Box folder by Case/PO | [O] | **human** delete + **Trash purge**; no automated delete used |
| 4a | Box folder names | [O] | removed by the folder delete |
| 4b | File-Request URLs | [O] | File Request deactivated (URL 404s); Dataverse mirror fields nulled |
| 4c | Outlook category strings | [O] | category removed from source message(s) in the shared mailbox |
| 4d | Shared-link tokens / soft-delete shadows | [O] | links revoked; residual retention cleared or recorded |
| 5 | Audit trail | [O] | cascade/redact rule applied (or escalated if undefined) |
| 6 | Verify + record + respond | [C/O] | zero live PII confirmed; action logged; subject answered |

---

## Cross-links

- [ADR-0017](../../adr/0017-data-retention-erasure-pii-lifecycle.md) — item G4 (this runbook) + item 9
  (no automated Box deletion) + item 7 (audit cascade).
- [docs/architecture/data-protection.md](../../architecture/data-protection.md) — controller/processor
  map, two-clock retention, rights summary.
- [Phase 9 plan](../phase-9-data-governance/README.md) — the implementation checklist.
- [Box go-live runbook](./box-go-live.md) — Box folder/connector mechanics this runbook locates against.
- [docs/gated.md](../../../docs/gated.md) — operator-blocker registry.
