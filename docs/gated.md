# What still needs you

This is the short list of things the system **can't finish on its own** — they need you to
provide a password/key, click a button in a live account, or send a test message. Everything
else has been built and switched on.

Each item below says **what it is**, **why only you can do it**, and the **exact steps**.

_Last updated **2026-06-20**._

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

### 3. Switch on automatic provider matching  ·  *you supply a list*

**What:** the system can automatically tag each case with the right provider **by the sender's
email domain** — but almost none of the providers have their email domains recorded yet, so right
now matching stays manual.

**Why you:** only you know which email domains belong to which providers.

**Steps:**
1. Make a simple list of **provider → email domain(s)** (e.g. `QDOS → qdos.co.uk`).
2. Send me that list, **or** drop it into the provider records yourself.
3. Once the domains are in, automatic matching (and the automatic vehicle look-ups) start working
   on new emails — no further switch needed.

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

### 5. Switch on Box filing  ·  *you supply the key*

**What:** the "file the finished case into Box" step is built but not connected.

**Why you:** it needs a Box **API key** and sign-in to your live Box account.

**Steps:**
1. Get a Box API key / connection (you mentioned you'll provide one).
2. Send it to me, or create the Box connection in the flow yourself.
3. Confirm Box accepts the folder name format (e.g. a case `test26001` files into a folder named
   **TEST26001** in capitals).
4. Switch on the **CS Finalize EVA + Box** flow.

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
