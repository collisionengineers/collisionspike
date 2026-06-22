# What still needs you

This is the short list of things the system **can't finish on its own** — they need you to
provide a password/key, click a button in a live account, or send a test message. Everything
else has been built and switched on.

Each item below says **what it is**, **why only you can do it**, and the **exact steps**.

_Last updated **2026-06-23**._

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

- **Tidier provider codes:** 37 provider codes are longer than the old 8-character limit. The
  column was widened so everything loads fine — this is only worth doing if you want neater codes.
  Send canonical short codes if so.
- **One internal duplicate-handling step** (`CS Case Resolve`) is intentionally **switched off** —
  it's planned for a later phase, not needed now.
- **Use the shared readiness check inside the inbox flow:** the readiness logic exists in three
  places that are kept in sync automatically. Merging them into one is a nice-to-have; it touches a
  flow that runs on every case, so it's best done carefully with a test, not in a rush.

---

## A note on "credentials"

Where this file says "give me the login/key," those are normal service keys (DVSA, DVLA, Box, EVA).
You've said the DVSA/DVLA-type keys aren't sensitive — they're already in place and working. EVA and
Box are the two still waiting on you.
