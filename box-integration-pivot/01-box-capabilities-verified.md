# 01 — Box capabilities, verified

Each capability below was checked adversarially against **primary Box sources**. The pattern is the
same throughout: **the feature is real, but the mechanism is not quite what the proposal assumes**, and
the mechanism is what dictates the build. Read the caveats.

---

## 1. File Request — the image‑collection mechanism · **PARTLY TRUE**

**What's real.** A File Request is an **upload‑only web form pinned to one Box folder**; external
senders need **no Box account**, just the link (drag‑drop, resumable). Expiry is **optional and off by
default**, and File Requests are **exempt from the enterprise shared‑link auto‑expiry policy**, so a
**permanent** link is genuinely achievable, as is a manually time‑boxed one. The form can capture the
sender email, a free‑text description, **and any enterprise metadata‑template field** — which is exactly
how a **vehicle registration / case reference** is captured as structured data.

**The decisive caveat — there is no "create from scratch" API.** Box states verbatim:

> *"Currently, the API only allows the creation of new file requests by copying an existing file request
> associated to another folder."*

The entire File Request API is **four operations**:

| Op | Endpoint | Use |
|---|---|---|
| GET | `GET /2.0/file_requests/{id}` | read |
| **COPY** | `POST /2.0/file_requests/{id}/copy` | **the only "create"** — copies a template onto a folder |
| UPDATE | `PUT /2.0/file_requests/{id}` | edit settings; **activate/deactivate** (`status: active|inactive`) |
| DELETE | `DELETE /2.0/file_requests/{id}` | remove |

So the "**button auto‑generates an upload link**" idea **works**, but the mechanism is:

1. **One‑time:** hand‑build **one template File Request** in the Box web app (configure the form —
   email + description + the **registration metadata field**), and record its `file_request_id` from the
   builder URL (`…/filerequest/2338423584` → `2338423584`).
2. **Per case:** ensure the Case/PO folder exists → `POST /2.0/file_requests/{templateId}/copy` with
   `folder.id` = the case folder, plus per‑case `title` / `description` / `expires_at` /
   `status:"active"`. The response returns the **live upload URL** to surface to the operator.
3. Deactivate later with `PUT … {status:"inactive"}` (the link then returns **HTTP 404** to visitors).

**Constraints that bound the design:**
- The copy **cannot change the form's metadata‑field set** — it is baked into the hand‑built template
  and replicated as‑is. (One template per "form shape"; e.g. one template for image chasers.)
- **One File Request per folder** (hard rule) — which suits *one folder per Case/PO* and *one folder per
  repeat sender*.
- File Request requires **Box Business or higher**; the **registration capture** needs **Business Plus**
  (metadata). No dedicated scope — `root_readwrite` covers it.
- For **us specifically:** the copy call must run **server‑side via the custom Box REST connector**
  (CCG/JWT) — the first‑party connector exposes no file‑request action, and the Code App CSP forbids raw
  fetch.

*Sources: developer.box.com/guides/file-requests (+ /template, /copy), /reference/post-file-requests-id-copy,
/reference/put-file-requests-id; support.box.com Using/Administering File Request, File Request FAQ.*

---

## 2. Webhooks — the "ping when an upload lands" · **PARTLY TRUE**

**What's real.** `FILE.UPLOADED` exists and is **folder‑scoped** (attachable only to a folder target),
described verbatim as *"A file is uploaded or moved to this folder."* A v2 webhook **POSTs JSON to an
external HTTPS endpoint** you choose, with `BOX-SIGNATURE-PRIMARY/SECONDARY` **HMAC‑SHA256** headers for
verification. A **Power Automate "When an HTTP request is received" trigger** or an **Azure Function HTTP
trigger** both qualify as targets. Webhooks are created via REST (`POST /webhooks`, scope
`manage_webhook`); **1,000 per app/user**, **one webhook per item**.

**Caveat A — "near‑real‑time" is not guaranteed.** Box publishes **no latency SLA** for webhooks (it
reserves "near real time" for the *Events API*). Delivery is **best‑effort / eventually‑consistent**
(usually seconds): the only timing contract is **receiver‑side** (respond `2xx` within **30 s**; Box
retries up to **12× over ~2 h**). There is **no ordering or exactly‑once guarantee** (dedup on
`event id` / `source.id`), and events can be **silently dropped** (a permission‑blocked action sends *no*
notification; an expired app session degrades to `NO_ACTIVE_SESSION`).

**Caveat B — the File‑Request→event link is an inference, not documented.** No Box page states that a
File‑Request upload fires `FILE.UPLOADED`. It is **very likely** (File Request files provably land as
ordinary files in the target folder, and the trigger fires on *any* "file is uploaded … to this
folder"), but Box never closes the loop in writing, and a community thread reports `FILE.UPLOADED`
occasionally not firing. **Live‑test before relying.**

**Caveat C — `FILE.UPLOADED` also fires on move‑into‑folder**, so an intake flow must **disambiguate
genuine uploads from moves**.

**Endpoint requirements:** public **HTTPS on port 443**, **reputable‑CA cert** (no self‑signed),
TLS 1.2/1.3, **not** a `*.box.com` URL, **not** root folder id `0`. The **first‑party Power Automate Box
connector does *not* expose webhook subscription**; its built‑in "When a file is created" trigger is
**Events‑API/polling‑backed and can lag up to one day** and **does not cover subfolders** — so it is
**not** the near‑real‑time path. The real path is a **native Box webhook → Azure Function** (verify HMAC
+ a 10‑minute replay check, then act), owned by a **JWT/CCG service identity** via the custom connector.

*Sources: developer.box.com/guides/webhooks/triggers, /v2, /v2/limitations-v2, /v2/signatures-v2;
learn.microsoft.com connectors/box.*

---

## 3. Storage & file‑size · **PARTLY TRUE (unlimited ≠ on the cheapest plan)**

- **"Unlimited storage" is a real published attribute**, suitable for many years of images/PDFs — but
  it begins at the plan literally named **"Business" (~$15/user/mo)**, **not** the cheapest
  **"Business Starter" (100 GB cap, ~$5)**. Starter is the one capped Business‑family tier.
- **Unlimited storage ≠ unlimited file size.** Per‑file caps scale by tier: Starter 2 GB · **Business
  5 GB** · **Business Plus 15 GB** · Enterprise 50 GB · Enterprise Plus 150 GB · Enterprise Advanced
  500 GB. (Immaterial for case PDFs/images, but real.) **Email‑to‑folder uploads cap at 50 MB.**
- **Fair‑use bandwidth cap:** **1 TB per user per month** (pooled per licence), with Box reserving the
  right to throttle/disable accounts that look like a CDN. A heavy *external‑upload + preview* workload
  should stay well under this, but it is the real ceiling on "unlimited."

*Sources: box.com/pricing(+/biz,/biz-plus,/starter); support.box.com max‑file‑size; box.com/legal/fairusepolicy.*

---

## 4. Plan gating — what plan buys all of it · **CONFIRMED: Business Plus**

The cheapest plan with **File Requests + Webhooks/Platform‑API + Metadata together** is **Box Business
Plus**, ~**$25–33/user/mo annual** (~$33–40 monthly per some trackers), **3‑seat minimum**.

- **Metadata is the gate.** Box: *"Metadata is a feature reserved for Business Plus, Enterprise,
  Enterprise Plus, and Enterprise Advanced accounts."* Standard **Business lacks it** — so although File
  Requests (Business+) and the 50K‑calls API allowance (every Business tier) are cheaper, the
  **registration‑capture form forces Business Plus**.
- **Box Platform / API is *not* a separate product.** Every Business+ plan ships **50K API calls/mo**
  (Enterprise 100K) plus **webhooks, UI Elements and SDKs**. A paid "Box Platform add‑on" exists only to
  *buy more* calls/AI‑units or serve external app users (Core APIs ~$2.35/1,000 calls).
- **Naming trap:** a newer **"Box Forms"** product is gated to Enterprise/Enterprise Advanced — it is
  **not** the classic Business+ "File Request." Don't conflate them.

*Sources: support.box.com Using Metadata, Using File Request; box.com/pricing/biz-plus; developer.box.com webhooks/v2 limitations.*

---

## 5. Embedding Box in the Code App · **PARTLY TRUE (iframe only, after a CSP edit)**

The Code App's **default CSP is a full policy**, not just `connect-src 'none'`:

```
connect-src 'none';  frame-src 'self';  child-src 'none';  default-src 'self';
script-src 'self' <platform>;  style-src 'self' 'unsafe-inline';  img-src 'self' data: <platform>;
object-src 'self' data:;  worker-src 'none';  frame-ancestors 'self' https://*.powerapps.com
```

| Method | Works under the default CSP? | Why |
|---|---|---|
| **Box UI Elements** (Content Explorer / Preview / Uploader / Picker) | **Blocked** | Host‑page JS doing axios XHR to `api.box.com` / `upload.box.com` / `*.boxcloud.com` (killed by `connect-src 'none'`) **and** loading JS/CSS from `cdn01.boxcdn.net` (killed by `script-src`/`style-src`); also needs a server‑minted downscoped token |
| **Box Embed widget** `<iframe src="…app.box.com/embed/s/{sharedLink}">` | **Blocked by default, but fixable** | An iframe loads Box's *own* page (no host fetch) → governed by **`frame-src`**, not `connect-src`. It **survives `connect-src 'none'`** but is blocked by the default **`frame-src 'self'`** until an admin widens it to the Box origin |

**Net:** the **only** viable embed is the **iframe / Box Embed widget** (or an expiring shared‑link
iframe), and only after an admin adds the Box domain to **`frame-src`** (per‑environment, via PPAC /
`PowerApps_CSPConfigCodeApps`). It requires a **shared link** (only the `/embed/s/` URL is framable; raw
`app.box.com/files/…` sets `X-Frame-Options`), is **preview‑only**, and has a **third‑party‑cookie**
caveat. The shared/embed link itself must be **minted server‑side** (REST) because the page can't call
Box. **UI Elements are off the table** without abandoning the project's `connect-src 'none'` rule.

*Sources: learn.microsoft.com code-apps content-security-policy; developer.box.com/guides/embed/box-embed, /guides/embed/ui-elements/*, /guides/security/cors.*

---

## 6. The Power Automate Box connector · **PARTLY TRUE (file‑only)**

An **official Microsoft‑published Box connector exists, Standard class** (not Premium) across Power
Automate / Power Apps / Logic Apps / Copilot Studio. But it is **file‑only** — **11 actions**: Copy
file, **Create file (=upload)**, Delete file, Extract archive, Get file content (id/path), Get file
metadata (id/path), List folder, List root, Update file.

**What needs raw Box REST (custom connector / HTTP action):**

| Need | In the connector? | Raw REST |
|---|---|---|
| Upload a file | ✅ Create file | — |
| New‑file trigger | ⚠️ "When a file is created (V2)" — **Events‑backed, ≤1‑day lag, no subfolders, re‑upload = modify** | use a Box **webhook** instead |
| **Create a folder** (as an object) | ❌ (only *implicitly* via a Create‑file `folderPath`) | `POST /2.0/folders` |
| **Shared / expiring links** | ❌ | `PUT /2.0/files|folders/{id}` with `shared_link` |
| **Metadata templates/instances** | ❌ | `POST/GET /2.0/files/{id}/metadata/…` |
| **Webhooks** | ❌ | `POST /2.0/webhooks` |
| **File Requests** | ❌ | `POST /2.0/file_requests/{id}/copy` |

**Connector limits:** 75 MB max file, 10,000 items/folder, 100 calls/connection/60 s, 1,000 MB/60 s,
**interactive‑OAuth only (no service identity)**. (This is also exactly the bug in our committed
`finalize-eva-box` flow — it invents a non‑existent `CreateFolder` op; see
[03‑current‑system‑and‑what‑changes.md](./03-current-system-and-what-changes.md).)

> **Conclusion:** the pivot **must** run on a **custom Box REST connector** that (a) authenticates as a
> service (CCG/JWT) and (b) reaches folders/links/metadata/webhooks/file‑requests. The first‑party
> connector can stay for plain file upload/download, but it cannot carry the pivot.

*Sources: learn.microsoft.com/connectors/box; developer.box.com /reference/post-folders, /reference/put-files-id--add-shared-link, /reference/get-events.*

---

## 7. API authentication for a service identity · **CONFIRMED (CCG/JWT, custom connector)**

For a backend acting with **no user present**, Box offers **Client‑Credentials Grant (CCG)** and **JWT**
server auth. **CCG is the simplest** — a token `POST https://api.box.com/oauth2/token` with
`grant_type=client_credentials`, `client_id`, `client_secret`, `box_subject_type=enterprise`,
`box_subject_id=<enterprise id>` → authenticates as the app's **Service Account** (App Access Only).

- **Setup:** a **Platform app (Server Authentication)** in the Box Developer Console, **authorized in the
  Admin Console** by an Admin/Co‑Admin (enter the Client ID); **re‑authorize** whenever scopes change.
- **Scopes:** `root_readwrite` (files/folders **and** metadata instances **and** file requests — there
  is no dedicated metadata or file‑request scope), `manage_webhook` (webhooks). Creating
  **enterprise** metadata *templates* additionally needs admin rights (`manage_enterprise_properties`);
  Governance needs `manage_data_retention`.
- **Tokens:** 60‑minute access tokens, **no refresh token** (re‑mint each cycle). Rate limits **1,000
  req/min/user, 240 uploads/min/user**.
- **Power Platform fit:** the first‑party connector can't do CCG, so this is a **custom connector**; the
  `client_secret` lives on the **connection / Key Vault**, never in the client bundle (mirrors our
  parser `api_key`‑on‑connection pattern). For any future UI‑Element embed, the service mints a
  **downscoped token** server‑side via token‑exchange — which fits the `connect-src 'none'` rule.

*Sources: developer.box.com/guides/authentication/{select,client-credentials,…}, /guides/authorization/platform-app-approval, /guides/api-calls/permissions-and-errors/{scopes,rate-limits}, /guides/authentication/tokens(/downscope).*

---

## 8. Box AI over the historical corpus · **PARTLY TRUE (real, but tiered & metered)**

- **`POST /2.0/ai/ask`** (Q&A) and **`POST /2.0/ai/extract_structured`** (metadata extraction from a
  PDF, template‑ or field‑driven, **auto‑OCR**) are real and map almost 1:1 onto **pre‑filling the EVA
  12‑field contract** from an instruction/job‑sheet PDF — a useful **complement / fallback** to the
  deterministic `cedocumentmapper` parser.
- **But the per‑call API reach is small:** **25 files per `ask`**, **1 file per `extract_structured`**.
  Covering a multi‑year archive means **looping in batches**.
- **True corpus‑scale Q&A is "Box AI for Hubs"** (up to **20,000 files/Hub, 2 M enterprise‑wide**) — a
  **web‑app UI feature, Enterprise Plus / Enterprise Advanced only, with no public API** (you can point
  `ask` at a `hubs` item via API, but the Hub feature itself is top‑tier).
- **Cost:** Box AI API is metered in **"AI Units" (no rollover)**. **Business / Business Plus include
  zero** and must purchase (~$10 per 1,000 units, annual commitment); Enterprise 1,000 / Enterprise Plus
  2,000 / Enterprise Advanced 20,000 per month. An admin must enable Box AI; scope `ai.readwrite`.

So Box AI over history is genuinely possible, but it is a **higher‑tier + metered** decision, not a free
by‑product of adopting Box — covered as a *later* phase in [06‑enhancements‑unconsidered.md](./06-enhancements-unconsidered.md).

*Sources: developer.box.com/guides/box-ai, /reference/post-ai-ask, /reference/post-ai-extract-structured;
support.box.com AI Units, Box AI for Hubs, Expanded AI API Access (Oct 2025).*
