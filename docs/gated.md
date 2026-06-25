# What still needs you

This is the short list of things the system **can't finish on its own** — they need you to
provide a password/key, click a button in a live account, or send a test message. Everything
else has been built and switched on.

Each item below says **what it is**, **why only you can do it**, and the **exact steps**.

_Last updated **2026-06-26** (added the Phase-8 Inbox/Triage activation pointer below; §8 — the
SDLC-sweep features awaiting activation — and the parser-key rotation item in §7)._

---

## ✅ Already done — nothing for you to do here

These were on the list and are now finished and working live:

- **Reading the documents (OCR / "Document AI")** — switched on and tested.
- **Suggested inspection locations** — loaded (≈870 rows) and now showing in the app.
- **The 3 stuck "images only" cases** — sorted (they were old leftovers, not a real fault).
- **Provider matching fix** — the smarter matching is now live on the email inbox.
- **Vehicle look-ups (DVSA/DVLA enrichment)** — tested with a real plate (returned "SsangYong
  Rexton") and now runs automatically on every new case.
- **EVA and the readiness checks** — built, deployed, and switched on where possible (EVA itself is
  off until you add its login — see item 4).

---

## 🔴 Needs you — with steps

> **Phase 8 — Inbox / Triage Management is built offline and awaiting activation** (branch
> `feat/phase-8-inbox-management`, PR pending). It turns the inbox flow into "classify **every** email →
> route work to Cases, everything else to a triage queue", and adds an `/inbox` screen. Activating it is a
> **sequenced, gated** job (reconcile the repo intake flow up to live first, `grill-with-docs` the ADR-0015
> decisions, apply the `cr1bd_inboundemail` schema, `pac code add-data-source` + redeploy, rebind the child
> flows, then flip the trigger on **one** inbox as a watched soft-rollout). The exact G1–G7 steps live in
> [docs/plans/phase-8-inbox-management/IMPLEMENTATION-PLAN.md](./plans/phase-8-inbox-management/IMPLEMENTATION-PLAN.md)
> §gated-activation. Do this **after** the PR merges; it stays off until you run it.

### 1. Check the email inbox still works  ·  *2 minutes*

**What:** I changed how the inbox flow matches providers. I can't send an email to test it.

**Why you:** sending a real email is the only way to confirm the inbox still picks things up, and
I can't send mail.

**Steps:**
1. From any account, send a short test email to **digital@collisionengineers.co.uk**.
2. Wait ~1 minute, then open the app's case list.
3. You should see a **new case** appear for that email.
4. ✅ If it appears, everything's fine.
   ❌ If nothing appears after a few minutes, tell me — I kept a backup and can put the inbox flow
   back to exactly how it was in one step.

> Only send test emails to **digital@**. Don't test against the Info, Engineers, or Desk inboxes —
> those are real and live.

---

### 2. Turn on the other two inboxes  ·  *~10 minutes*

**What:** only the **digital@** inbox is connected. The other two shared inboxes aren't yet feeding
in cases.

**Why you:** connecting a live mailbox needs you to sign in to that mailbox and approve the
connection — a security step I'm not able to do.

**Steps:**
1. Go to **make.powerautomate.com** → **My flows** → open **CS Intake (shared mailbox)**.
2. Make a copy of it for each extra inbox (or adjust the mailbox setting).
3. When prompted, **sign in / authorise** the connection for that mailbox.
4. Point it at the correct shared inbox address and **Save**.
5. Send a test email to that inbox and confirm a case appears.

---

### 3. Provider auto-matching  ·  ✅ *32 providers loaded — rest needs your data*

**What:** the system auto-tags each case with the right provider **by the sender's email domain**.
On **2026-06-23** I loaded verified domains for **32 providers** (from your
`provider_email_audit_2026-06-22.csv`) into the provider records (`cr1bd_knownemaildomains`), so
auto-matching now works for those on new emails. The load is idempotent and ambiguity-guarded — a
domain serving >1 active provider is never written (it goes through the intermediary path, ADR-0011).

**What's left for you:** the handful I could **not** load — either no email address was exposed in the
sampled mailbox (DFD, Fairway, Regent, Castle, Stallion, Relay) or the only address is a **public**
domain that's unsafe as a match key (NETWORK HD UK / YM Law → `gmail.com`). For those, send me the
real business domain (or confirm there isn't one) and I'll add them — everything else already matches.

---

### 4. Switch on EVA submission  ·  *you supply the login*

**What:** the EVA connection is fully built and deployed but **switched off**, with no login stored
(you asked me not to add the credentials yet).

**Why you:** it needs the EVA **test** username/secret, which only you have.

**Steps:**
1. When ready, give me the EVA **test** Client ID and Client Secret (or add them yourself to the
   secure store).
2. I (or you) flip the EVA switch to **on** in the **test** environment only.
3. Submit one test case and confirm EVA accepts it (photos in the right order, registration
   visible on the overview photo).
4. Only after that test passes do we point it at the **live** EVA.

---

### 5. Switch on Box filing  ·  *you register + authorize a Box app*

**What:** the Box-filing steps (mint the Case/PO folder, copy the upload File Request, mirror the
finished case) are built but switched off. They run through a **service identity**, not a personal
sign-in: the system mints its own Box token inside the Azure Function from a stored secret — there is
**no personal "API key" to paste onto a connection**.

**Why you:** registering the Box app and authorizing it in your Admin Console can only be done by you
(a Box admin), and only you can supply its secret. This needs a **paid Box tenant — base Business is the
floor** (the service-identity / Client Credentials Grant, File Requests and webhooks are all covered by
base Business; they don't exist on free/personal accounts). **Business Plus is only needed later** for the
optional metadata field.

**Steps:**
1. In the Box Developer Console, **create a Platform App → Server Authentication (Client Credentials
   Grant)**, App Access Only, with scopes *Read/write all files and folders* + *Manage webhooks*.
   Capture its **Client ID, Client Secret, and Enterprise ID**.
2. **Authorize + enable** that app in the **Admin Console** (Integrations → Platform Apps Manager →
   Server Authentication Apps). Re-authorize whenever you change its scopes.
3. Send me the **Client Secret** (+ the webhook signature keys) for the secure store, or add them
   yourself — they live in **Key Vault**, never on a connection.
4. Confirm Box accepts the folder name format (e.g. a case `test26001` files into a folder named
   **TEST26001** in capitals).
5. Flip the **`BOX_*`** switches on (test environment first), then the **CS Finalize EVA + Box** flow.

> **State of the Box pivot (Phase 7, ADR-0012):** everything Claude can build is **done in the working
> tree and offline-verified** — the Dataverse schema-as-code (5 `BOX_*` gates + 2 config vars + 3 `cr1bd_box*`
> columns + 3 audit actions), the `box-webhook` Azure Function (pytest 79 passed), the 3 new flows +
> the `finalize-eva-box`/`case-resolve` reworks (linter 154/154), and the Code App surfacing (vitest 256
> passed). **The Box Dataverse schema + `cr1bd_BOX_*` env-vars ARE applied live** (verified via `az`
> against Dev 2026-06-22: the `cr1bd_box*` case + evidence columns and every `cr1bd_BOX_*` env-var exist),
> with **every `BOX_*` gate `false`** (default AND current). **The `box-webhook` Azure Function is now
> DEPLOYED gated-off** (2026-06-22): `cespkbox-fn-v76a47` (FC1, `rg-collisionspike-dev`) — receiver
> `POST /api/box-webhook` + connector-facade routes, Gate-C-verified (no-key→401, key+unsigned→400,
> facade gated-off→503), with `BOX_API_ENABLED=false` and `BOX_ALLOWED_ROOT_ID=392761581105`, and its
> KV `cespkboxkvv76a47` still **empty** (no secrets). **What is still NOT live:** the `cr1bd_box_rest`
> custom connector and the Box flows are authored offline (`state=off`) — not imported, not bound; no Box
> connection is bound; the KV secrets + webhook subscription aren't in place; the `box-folder-create`
> live-intake edit is not made. So the rest of item 5 — connector import/bind, secrets, webhook sub, the
> gate flips + the BUSINESS account — is still yours.
>
> **The long pole is the BUSINESS-account second test phase.** Live testing so far used a throwaway **FREE**
> Box account (dev token), which proved the raw REST mechanics (8/9 ops; folder created + deleted, no secret
> printed) but **cannot** exercise the service path — CCG fails on free (`unauthorized_client`), and there are
> **no File Requests and no metadata**. The decisive verifications therefore wait on a live
> **Business-or-higher** tenant and are the gating unknowns:
> - the **CCG token mint** + the Admin-authorized Platform app (steps 1–3 above);
> - the **hand-built template File Request** (record its id → `BOX_FILE_REQUEST_TEMPLATE_ID`);
> - the **single biggest empirical unknown** — does a **File-Request upload fire `FILE.UPLOADED`** → the
>   Function → the case advances? (undocumented; **BLOCKING for B2**). On a transient miss the **primary**
>   recovery is Box's own retry — the receiver returns a non-2xx (503) so Box re-delivers; the `ListFolder`
>   reconciliation sweep is a **deferred, not-yet-built** secondary backstop.
>
> **Scope reminders:** start on **base Box Business** (the **metadata** field that would harden the orphaned
> image-only path is the **Business Plus** tier — out of scope now, a later optional upgrade); **EVA stays
> gated OFF**; **evidence is linked, not embedded** — a server-minted "Open in Box" deep link, so there is
> **no `frame-src` CSP edit** to make (`BOX_EMBED_ENABLED` stays reserved/off). The `box-folder-create`
> invocation into live `intake` is an operator/business-phase **live edit** (the repo intake def trails live,
> by design — do not expect it in `flows/definitions/intake.definition.json`).
>
> Full operator runbook (app registration, secrets, gate-flip order, the two-phase free-vs-Business live
> test, the live confirms) is in
> [plans/phase-7-box-integration/box-integration-activation.md](./plans/phase-7-box-integration/box-integration-activation.md).

---

### 6. Add the extra reference info  ·  *you supply the data*

**What:** there are a few reference lists that would improve matching and inspection-location
suggestions (provider code corrections, garage↔provider links, address lists, etc.).

**Why you:** this is information only the business has.

**Steps:**
1. Gather whatever you have (even partial is fine).
2. Send it over and I'll load it in.

---

### 7. Tidy-up items (optional, low priority)

- **Tidier provider codes:** 37 EVA-export names are longer than the 8-character `principalcode` cap.
  These are **export name-artifacts, not real codes**, and the cap **stays 8** (NOT widened) — see
  [over-length-principal-codes.md](./reference/over-length-principal-codes.md). Only the **5 active
  recurring businesses** need canonical short codes; send them if you want neater codes.
- **One internal duplicate-handling step** (`CS Case Resolve`) is intentionally **switched off** —
  it's planned for a later phase, not needed now.
- **Use the shared readiness check inside the inbox flow:** the readiness logic exists in three
  places that are kept in sync automatically. Merging them into one is a nice-to-have; it touches a
  flow that runs on every case, so it's best done carefully with a test, not in a rush.
- **Rotate the parser function key (soft security item).** A parser **function key** value was once
  committed in source + a doc (both now removed/scrubbed), but a doc-scrub leaves it in **git history** —
  the only true fix is to **regenerate the key in Azure** (Function App `cespike-parser-dev-…` → App keys),
  then update the `cr1bd_ceparser` connection. Low urgency (dev sandbox key), but worth doing before any
  prod use. _(This is the entry the Phase-0 README + `OPEN_ITEMS.md` Phase-1a point at.)_

---

### 8. Newly-built features waiting on you (SDLC sweep, 2026-06-24)

These were **built offline and switched OFF** in this sweep. Each is inert until you activate it; none is
live. (Full per-item detail is in `OPEN_ITEMS.md` + the phase READMEs.)

- **Chaser send (Phase 4b).** The draft-only chaser flow is built; turning real **sending** on means
  flipping `cr1bd_CHASER_SEND_ENABLED` and turning the flow on. **Why you:** it crosses the live-email
  boundary (a chaser actually leaves the building). Confirm it drafts/targets the right garage first.
- **Location-assist (Phase 4a).** The location-suggestion **assist** subsystem (Function + connector +
  gates + the `location_assist_confirmed` audit action) is built but dormant. **Why you:** it needs the
  Function + Key Vault deployed, the **CE Location Assist** connector imported, Vision + Maps keys injected,
  `LOCATION_ASSIST_API_BASE` set, the gates flipped, and `BoxPhotoSource` wired. (Suggestions stay
  staff-picked — no auto-confirm, ADR-0013.)
- **OCR for scanned PDFs (Phase 5a) — connector import + gate.** The gated OCR-fallback branch is wired into
  the parse flow (off-path unchanged). **Why you:** import/bind the **OCR** connector and flip
  `cr1bd_OCR_SCANNED_PDF_ENABLED` (then calibrate on real scans).
- **EVA-validation connector binding (Phase 3 / M2.B) — activation ORDER.** `status-evaluate`'s readiness was
  repointed off five inline filters onto the `cr1bd_evavalidation` connector (`ValidateCase`). **Why you:**
  import + bind that connection (the Function is already deployed) **BEFORE** re-importing/activating the
  updated `status-evaluate` — else every `Validate_readiness` call fails and no case can reach `ready_for_eva`
  via the status machine (the flow was previously self-contained; this is a new hard precondition).
- **Inbox triage restructure (Phase 8).** The deterministic email classifier, the `cr1bd_inboundemail`
  triage table, and the `triage-classify` flow are built (`state=off`). **Why you:** the live **intake
  restructure** — flip `fetchOnlyWithAttachment` true→false, generalise dedup, add the Switch-on-category —
  is a live-designer edit, on **one inbox first**, after single-mailbox activation. (Reconcile the repo
  `intake.definition.json` UP to live first — it trails live by design.)
- **Case disposition / retention (Phase 9, G1).** The retention-clock schema + the scheduled
  `case-disposition` flow are built (flow `state=off`, far-future start so it never fires on import;
  anonymise-by-NULL; never deletes from Box). **Why you:** set the **retention window** + the
  anonymise-vs-hard-delete policy, then flip `cr1bd_CASE_DISPOSITION_ENABLED` (test env first). The
  apply script `27-retention-schema.ps1` is DRY-RUN by default. ⚠️ **Do NOT arm this until the live evidence
  store `cespkevidstdev01` itself has soft-delete (G6 below) — the bicep hardens the Function-HOST accounts,
  not the byte store this flow deletes from, so a wrong disposal would otherwise be unrecoverable.**
- **Staff roles assignment (Phase 9, G8).** The 3-role least-privilege model (User + Admin; Engineer
  deferred) is authored as schema-as-code (`28-roles.ps1`, **create-not-assign** = gated-off). **Why you:**
  run the apply, then **assign** the roles to staff (the assignment is yours).
- **Evidence-store hardening (Phase 9, G6).** The IaC store-hardening (KV purge-protection on 4 vaults +
  Blob soft-delete/versioning) is in the bicep templates for the Function hosts. **Why you:** apply it live;
  **and** the live evidence-bytes store **`cespkevidstdev01`** (the `evidence` container, reached via
  `cr1bd_evidenceblob`) is **NOT in the IaC**, so its delete-retention + container-delete-retention +
  versioning, plus **Key Vault purge-protection**, must be applied directly on the live resource. This is the
  **hard pre-step before any purge flow (`box-blob-purge` OR `case-disposition`) is armed** — the Function-host
  bicep hardening is defense-in-depth, NOT this byte store.
- **Org-level Dataverse auditing (Phase 9, G7).** Table-native auditing + the `cr1bd_auditevent` RemoveLink
  cascade are already authored in the schema-as-code; **why you:** turn Dataverse auditing on at the
  **organisation** level so the per-table flags take effect.
- **Policy/legal inputs (Phase 9, G1–G5).** The **retention period**, **lawful basis** (DVSA/DVLA
  enrichment + valuation), **litigation/legal-hold rule**, **ICO registration** + DVLA data-use terms, and
  the **per-AI-gate production sign-off** are business/legal decisions only you can make. (AI **testing** on
  repo data is already authorised — G5.) These keep **ADR-0017 Proposed** until supplied. The DSAR/erasure
  runbook + the DPIA/controller-processor doc are authored and waiting on these inputs.

> **G-code map (so the Phase-9 README + ADR-0017 cross-links resolve):** G1 = retention period + the
> retention-clock/case-disposition build; G2 = legal-hold rule; G3 = ICO/DVLA registration + lawful basis +
> the DPIA; G4 = the DSAR cross-store runbook (incl. the Box-folder-name / File-Request-URL / Outlook-category
> blind spots); G5 = AI-data-protection production sign-off (testing authorised now); G6 = store hardening
> incl. `cespkevidstdev01`; G7 = org-level audit enablement; G8 = the 3-role assignment. The build halves are
> done offline; the items above are the operator activations.

---

## A note on "credentials"

Where this file says "give me the login/key," those are normal service keys (DVSA, DVLA, Box, EVA).
You've said the DVSA/DVLA-type keys aren't sensitive — they're already in place and working. EVA and
Box are the two still waiting on you.
