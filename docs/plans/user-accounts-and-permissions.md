# Plan — User accounts & permission levels (staff personas)

> **Status: PLANNING ONLY.** Nothing here is applied live. This document specifies *how* staff
> accounts and per-persona permissions should be modelled for the **`Collision Engineers - Intake`**
> Code App (`da7ba7af-9ffc-4c70-8f75-1f053ca354da`) in the **`Collision Engineers - Dev`** Sandbox
> (`b3090c42-51fb-ee24-9868-474da322a3ad`). It is grounded in the live registry
> ([architecture/live-environment.md](../architecture/live-environment.md)), the operator role-gap
> analysis ([roles-and-permissions.md](../roles-and-permissions.md)) and the actual app source
> (`mockup-app/src/`). Last authored **2026-06-22**.
>
> **Scope boundary vs `roles-and-permissions.md`.** That doc is the *operator's* role-gap list
> (what `digital@collisionengineers.co.uk` needs to **build/deploy**). **This** doc is about
> **end-user staff** who will *use* the deployed app, and how to scope what each can see and do.
> The two share one fact: per-user **Power Apps Premium** licensing is the practical ceiling on
> how many staff seats can be stood up.

---

## 1. Goal & scope

**Goal.** Define a least-privilege account-and-permission model for the staff who use the live
Intake Code App, so that (a) every user authenticates as themselves, (b) what each user may *do* is
governed where it is actually enforceable — the **Dataverse security-role layer** — and (c) adding
or removing a staff member is a single, auditable group-membership change.

**In scope**
- Staff personas implied by the app's screens, the case state machine, and the write seam.
- The Entra-group → Dataverse-team → security-role implementation pattern, scoped least-privilege.
- The plan → implement → test → verify lifecycle and a per-role allowed/denied test matrix.
- A clean split of **operator-gated** provisioning vs **Claude-authorable** solution components.

**Out of scope (call-outs, not designed here)**
- Standing up TEST/PROD environments (needs **Power Platform Administrator** — a flagged operator
  gap in roles-and-permissions.md item 4); this plan targets the single live Dev/Sandbox.
- External / B2B guest access (provider or contractor logins) — see open questions.
- Field Security Profiles for column-level masking — described as a *planning option* in §3.6, not
  built (grep found none in the repo today).
- The operator's own build/deploy roles — those live in roles-and-permissions.md.

**Three load-bearing facts that shape everything below**

1. **There is no app-level auth or role-gating in React.** The Code App authenticates every user via
   **Microsoft Entra ID** (per
   `learn.microsoft.com/power-apps/developer/code-apps/overview#limitations`). `PowerProvider.tsx`
   only warms the `@microsoft/power-apps` SDK host bridge (`getContext`) — it does **not** read the
   signed-in user or their roles. `AppShell.tsx` even hardcodes `userName='J. Mercer'` and never
   reads the live identity; `routes.tsx` exposes **every** screen (`/`, `/intake`, `/evidence`,
   `/queue/:name`, `/case/:id`, `/case/:id/submit`, `/case/:id/dedup`, `/admin`, `/logs`) to anyone
   who can open the app. **Therefore all persona separation MUST be enforced in Dataverse
   security roles (table/column/record privileges), not in the UI.**

2. **A staff user needs THREE things to use the app** (code apps follow *canvas-app* sharing limits,
   not model-driven; docs: `code-apps/overview#managed-platform-capability-support`):
   (i) be a **user in the Dev environment**; (ii) have the app **shared** to them (directly or via an
   Entra security group) from `make.powerapps.com`; (iii) hold a **Dataverse security role** granting
   the table privileges. Unlike model-driven apps, the security role is *not* the share grant — both
   are required.

3. **Premium licensing applies.** The app uses Dataverse + premium connectors, so each end-user
   needs a **Power Apps Premium** licence (microsoft-stack.md line 59). Service principals **cannot
   own code apps**, so a human maker must own/push (`pac code push`). `pac` still surfaces `pac code`
   as **"(Preview)"** — GA + Premium licensing must be confirmed before any production rollout.

---

## 2. Personas & permission levels

Personas are **inferred from the app surface**, not from any existing role config (no custom staff
roles exist in the solution today). The app's *write* surface is deliberately tiny — the `DataAccess`
seam (`mockup-app/src/data/types.ts`) exposes only three mutations: `createCase`,
`setOnHold(caseId, onHold)`, and the Box submit-signal `requestFinalize` (a PATCH of
`cr1bd_submitrequested` / `cr1bd_submitpayloadhash` / `cr1bd_evapayload12`). Everything else through
the seam is **read**. The case state machine (`contracts/case-status.ts`) and the 3-queue model
(Not Ready / Review / Held) define where personas naturally split.

The **custom tables** in the `CollisionSpike` solution (prefix `cr1bd`, all **`UserOwned`**) are:
`cr1bd_case`, `cr1bd_evidence`, `cr1bd_workprovider`, `cr1bd_auditevent`,
`cr1bd_fieldlevelprovenance`, `cr1bd_note`, `cr1bd_chaser`, `cr1bd_inspectionaddress`,
`cr1bd_repairer`, `cr1bd_imagesource`, `cr1bd_improvementsignal`. The `BOX_*`/EVA/enrichment **feature
gates** live in the platform `environmentvariabledefinition` / `environmentvariablevalue` tables and
are **read-only to staff** (the UI's `getBoxGates` only reads them; flipping a gate is an admin act).

### 2.1 Persona → capability table

Privilege scope uses the Dataverse access-level ladder: **None / User / Business Unit (BU) / Parent-Child
BU / Organization (Org)**. Because all queues are **status-based, not owner-based** (no "my cases vs
your cases" concept exists), the natural scope for staff read/write is **Organization** — even though
the tables are `UserOwned` (which *would* allow BU/User scoping later if a real segmentation need
appears). CRUD shorthand: **C**reate **R**ead **W**rite (update) **D**elete **A**ppend/AppendTo.

| Capability | Intake Clerk | Engineer / Reviewer | Provider / Reference Admin | Read-only Auditor | System Administrator (`digital@`) |
|---|---|---|---|---|---|
| **Screens reachable** (all are technically reachable; see §3.5 — privilege governs what *works*) | Dashboard, Not-Ready queue, New case (`/intake`), Add evidence (`/evidence`), Case detail | All clerk screens + Review queue, Held queue, EVA submit dialog, Dedup dialog | Dashboard, Admin / Provider settings (`/admin`), Case detail (read) | Dashboard, all queues (read), Case detail (read), Action logs (`/logs`) | All screens |
| **`cr1bd_case`** | C R W (Org) | C R W (Org) | R (Org) | R (Org) | C R W D (Org) |
| **`cr1bd_evidence`** | C R W (Org) | C R W (Org) — incl. exclude/include image | R (Org) | R (Org) | C R W D (Org) |
| **`cr1bd_fieldlevelprovenance`** | C R W (Org) | C R W (Org) | R (Org) | R (Org) | C R W D (Org) |
| **`cr1bd_note`** | C R (Org) | C R W (Org) | R (Org) | R (Org) | C R W D (Org) |
| **`cr1bd_auditevent`** (append-only by design — written by flows/webhook) | **R** (Org) | **R** (Org) | **R** (Org) | **R** (Org) | C R W D (Org) |
| **`cr1bd_workprovider`** | R (Org) | R (Org) | **R W** (Org) — *only if §2.3 confirmed* | R (Org) | C R W D (Org) |
| **`cr1bd_repairer` / `cr1bd_imagesource` / `cr1bd_inspectionaddress`** | R (Org) | R (Org) | **R W** (Org) — *only if §2.3 confirmed* | R (Org) | C R W D (Org) |
| **`cr1bd_chaser`** | R (Org) | C R W (Org) | R (Org) | R (Org) | C R W D (Org) |
| **`cr1bd_improvementsignal`** | R (Org) | C R (Org) | R (Org) | R (Org) | C R W D (Org) |
| **Env-var / feature-gate tables (`BOX_*`, EVA, enrichment)** | R only | R only | R only | R only | **R W** (flip gates) |
| **Manual intake — create case** (`data.createCase`) | ✅ | ✅ | ✗ | ✗ | ✅ |
| **Hold / Release** (`data.setOnHold` → `cr1bd_onhold`, routes to Held) | ✗ | ✅ | ✗ | ✗ | ✅ |
| **Exclude / include evidence image** (`onExclude` → `cr1bd_excluded` + `cr1bd_exclusionreason`) | ✗ | ✅ | ✗ | ✗ | ✅ |
| **Dedup decision** (attach-vs-new; writes dedup latch columns) | ✗ | ✅ | ✗ | ✗ | ✅ |
| **"Use this address"** (copies a suggestion into the manual draft; never auto-confirms, never writes image_based) | ✗ (read-only triage) | ✅ | ✗ | ✗ | ✅ |
| **EVA submit signal** (`requestFinalize` → PATCH `cr1bd_submitrequested` on `cr1bd_case`; gated, blocked until 0 outstanding readiness items) | ✗ | ✅ (this is the reviewer's defining privilege) | ✗ | ✗ | ✅ |
| **Trigger / flip the `BOX_*` / EVA / enrichment gates** | ✗ | ✗ | ✗ | ✗ | ✅ |
| **Provider-settings WRITE to Dataverse** (`cr1bd_workprovider`) | ✗ | ✗ | ✗ (**not live today** — see §2.4) | ✗ | ✅ (deploy-time) |
| **Read Action logs** (`/logs` → `cr1bd_auditevent`) | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Schema caveat:** `cr1bd_onhold` is **live-only** — it was added directly in the CollisionSpike
> solution (2026-06-20) and is **not yet in `dataverse/schema/case.json`** (the repo schema trails
> live here). Don't conclude it's missing by grepping the schema; confirm against the live table.

### 2.2 Persona notes

- **Intake Clerk** — works the **Not Ready** queue (arrived-but-incomplete: `new_email`,
  `ingested`, `needs_review`, `missing_required_fields`, `missing_images`, `linked_to_instruction`).
  Defining actions: **New case** (`ManualIntake.tsx`) and **Add evidence** (`AddEvidence.tsx`).
  Needs C/R/W on `cr1bd_case` + `cr1bd_evidence` + `cr1bd_fieldlevelprovenance` + `cr1bd_note`, R on
  the corpus tables. **No** Hold/Release, **no** EVA submit, **no** dedup decision — those are
  reviewer privileges.
- **Engineer / Reviewer** — works the **Review** queue (`ready_for_eva` only — the human-in-the-loop
  gate). Superset of the clerk **plus** Hold/Release, image exclude/include, dedup decisions,
  "Use this address", and the **EVA submit signal** (`requestFinalize`). This is the only persona
  permitted to write the finalize/submit latch on `cr1bd_case`.
- **Provider / Reference Admin** — owns the provider corpus and reference data. Read-only on case
  data; R/W on `cr1bd_workprovider` / `cr1bd_repairer` / `cr1bd_imagesource` /
  `cr1bd_inspectionaddress` — **but only if §2.3/§2.4 is confirmed in scope**; today the Admin screen
  writes nowhere (§2.4), so this persona can collapse into the Auditor until corpus self-service is
  wanted.
- **Read-only Auditor** — Read on `cr1bd_case` + `cr1bd_auditevent` (and broadly Read across tables),
  **no** create/write/delete anywhere. The audit-event table is **append-only by design** (written by
  flows and the `box-webhook` Function), so the Auditor must **never** get Write/Delete on it.
- **System Administrator (`digital@`)** — already holds the Dataverse **System Administrator** role in
  Dev (verified live, roles-and-permissions.md). Owns env-var gates, flow state, the Code App push,
  schema, and connections. **Not** a "staff persona" — it is the build/operate role and stays as-is.

### 2.3 Optional consolidation — a single "Case Worker" role

If the business does **not** want true persona separation at M1, collapse Intake Clerk + Engineer/
Reviewer into one **Case Worker** role (C/R/W across the case + evidence + provenance + note + chaser
tables at Org scope, including the submit signal). This is purely a Dataverse-role + cost decision
(each seat is a paid Premium licence) — the app UI does not distinguish the two today. See open
questions.

### 2.4 Why "Provider Admin" needs no WorkProvider write **today**

`Admin.tsx` (route `/admin`, "Provider settings") edits provider domains / inspection-location policy
/ automation mode **but saves only to local React state** — the toast reads *"saved here for review
before going live"*, and persisting to `cr1bd_workprovider` is an **operator deploy-time write**
(per the Admin.tsx header comment). The assisted-import is a disabled preview. **So no staff persona
needs Write on `cr1bd_workprovider` today.** The Provider-Admin row's R/W on the corpus is reserved
for a *future* self-service phase and should only be granted if that phase is explicitly in scope.

---

## 3. Implementation model

### 3.1 The three-layer enforcement chain (per persona)

For each persona, provision **one Entra security group → one Dataverse team → one custom security
role**, so that adding a staff member is a single group-membership change and licence/app-share/role
all flow through the group:

```
Entra security group  ──(group team)──▶  Dataverse team  ──(role on team)──▶  custom cr1bd security role
        │                                                                              │
        └── app shared to the GROUP (make.powerapps.com)        table/column/record privileges (least-priv)
        └── Power Apps Premium licence assigned via the group (License Admin)
```

Docs basis: code apps follow canvas-app sharing, and Microsoft advises using **Entra security groups**
to manage access at scale (`share-model-driven-app` "Use Microsoft Entra groups to manage access").
Sharing the app to the **group** (not per user) means a new starter is added once and inherits the
app share, the licence (group-based licensing), and the team's security role.

### 3.2 The four (or five) custom security roles to author

Authored **in the Dev environment** as **solution components** inside (a copy of, or an additive
solution layered over) `CollisionSpike` — the predefined **Basic User** role only covers
out-of-the-box tables, so the custom `cr1bd_*` tables **require a custom role**
(`share-model-driven-app`: *"If your app has one or more custom tables, contact a Power Platform
administrator to configure privileges to the custom tables in a security role"*).

| Role (suggested schema name) | Built on | Custom-table privileges (Org scope unless noted) |
|---|---|---|
| `cr1bd_IntakeClerk` | Basic User | C/R/W `cr1bd_case`, `cr1bd_evidence`, `cr1bd_fieldlevelprovenance`; C/R `cr1bd_note`; R corpus tables + `cr1bd_auditevent` |
| `cr1bd_EngineerReviewer` | Basic User | All of IntakeClerk **plus** W on the `cr1bd_case` submit/dedup latch columns, C/R/W `cr1bd_chaser`, C/R `cr1bd_improvementsignal` |
| `cr1bd_ProviderAdmin` *(only if §2.3 in scope)* | Basic User | R case tables; **R/W** `cr1bd_workprovider`, `cr1bd_repairer`, `cr1bd_imagesource`, `cr1bd_inspectionaddress` |
| `cr1bd_ReadOnlyAuditor` | Basic User | **R only** across all `cr1bd_*` tables incl. `cr1bd_auditevent`; **no** C/W/D anywhere |
| *(optional)* `cr1bd_CaseWorker` | Basic User | The §2.3 merge of IntakeClerk + EngineerReviewer |

Every custom role must also include **basic platform privileges** so the app can open: read on the
solution's system tables and the env-var definition/value tables, plus enough to invoke any flow the
app triggers (today the app triggers finalize *indirectly* via a Dataverse submit-signal PATCH, **not**
a direct flow call, so **Write on `cr1bd_case` suffices** — no "App Opener" role is required *yet*;
if a future button calls a flow directly, add **App Opener** per `code-apps/how-to/add-flows`).

### 3.3 Least-privilege specifics

- **Org-level read/write, not User-level.** Queues are status-based; there is no owner-based "my
  cases" model. Org scope is the correct default. Keep the tables `UserOwned` (they already are) so
  BU/User scoping remains *available* if a real segmentation requirement later appears — but do not
  use it now (it would add friction with no benefit).
- **No Delete for any staff persona.** None of the three app mutations deletes rows; deletes stay
  with System Administrator. (Image *exclusion* is a Write to `cr1bd_excluded`, not a Delete.)
- **Auditor gets Read only, never Write on `cr1bd_auditevent`.** The table is append-only and
  populated by flows/the webhook; a human Auditor writing to it would corrupt the trail.
- **Gate tables are read-only to all staff.** Flipping `BOX_API_ENABLED` / `EVA_API_ENABLED` /
  `ENRICHMENT_ENABLED` etc. is a System Administrator act, not a persona privilege.

### 3.4 How the Code App actually enforces it

It does not — **Dataverse does.** Every read/write the app issues runs as the signed-in user against
Dataverse via the generated services (`GeneratedServices` in `types.ts`, satisfied by
`pac code add-data-source` output). A user lacking a privilege gets a **Dataverse authorization error
on the call**, surfaced as a failed operation in the UI — the screen still *renders* (no client-side
gate), but the mutation fails. This is by design: the **server is the trust boundary**, exactly as the
CSP/connector posture already forces all external calls through connectors rather than client fetch.
**Do not** add fake client-side role gating that suggests an enforcement boundary the React layer does
not own.

### 3.5 Cosmetic-only UI hardening (optional, non-authoritative)

Because the nav shows every screen to everyone, a *future* nice-to-have is to read the user's roles
via the SDK (a real `getContext`/role lookup, replacing the hardcoded `userName='J. Mercer'`) and
**hide** screens a persona can't use — e.g. hide `/admin` from non-admins, hide the EVA-submit button
from non-reviewers. **This is cosmetic only** and must never be the enforcement mechanism; the
Dataverse role is. Treat it as a usability backlog item, not a security control.

### 3.6 Column-level option (Field Security Profiles) — not built

If a future Auditor must be blocked from sensitive columns (claimant telephone/email
`cr1bd_evaclaimanttelephone` / `cr1bd_evaclaimantemail`, or the finalize/dedup latch columns
`cr1bd_submitpayloadhash` / `cr1bd_finalizedpayloadhash`), Dataverse **Field Security Profiles** can
mask them per role. **None exist in the repo today** (grep found none) — this is a planning option,
authored as additional solution components only if a real requirement lands.

---

## 4. Lifecycle: plan → implement → test → verify

### 4.1 Plan
- Confirm the persona set with the business (true separation vs single Case Worker — §2.3, open Q1).
- Confirm whether the Provider-Admin self-service phase is in scope (§2.4, open Q3).
- Decide individual Premium licences vs a dedicated service account for connections (open Q2).

### 4.2 Implement (what gets built, and by whom — see §5)
1. **Claude (authorable):** author the custom security-role definitions (§3.2) and any optional Field
   Security Profiles as **solution components** in an additive solution layered over `CollisionSpike`
   (prefix `cr1bd`). These are XML/JSON role definitions, deployable like the rest of the schema.
2. **Operator-gated:** create the Entra **users** + per-persona **security groups**; assign **Power
   Apps Premium** licences (needs **License Administrator** — flagged gap, roles-and-permissions.md
   item 5); create the matching **Dataverse teams** mapped to the groups; assign each custom role to
   its team; **share the app** to each group from `make.powerapps.com`.

### 4.3 Test — per-role allowed/denied matrix

Run each row signed in as a test user holding **only** that persona's role. "Allowed" must succeed;
"Denied" must return a Dataverse authorization error (the app call fails), **not** a silent success.

| # | Action under test | Intake Clerk | Engineer/Reviewer | Provider Admin | Auditor |
|---|---|---|---|---|---|
| T1 | Open the app at all (share + role + env-user present) | allow | allow | allow | allow |
| T2 | View Dashboard + queue counts (read aggregates) | allow | allow | allow | allow |
| T3 | Create a case via `/intake` (`createCase`) | **allow** | allow | **deny** | **deny** |
| T4 | Add evidence to a case via `/evidence` | **allow** | allow | **deny** | **deny** |
| T5 | Read a case detail | allow | allow | allow | allow |
| T6 | Hold / Release a case (`setOnHold` → `cr1bd_onhold`) | **deny** | **allow** | deny | deny |
| T7 | Exclude an evidence image (`cr1bd_excluded`) | **deny** | **allow** | deny | deny |
| T8 | Open + commit a dedup decision (`/case/:id/dedup`) | **deny** | **allow** | deny | deny |
| T9 | Fire the EVA submit signal (`requestFinalize` → `cr1bd_submitrequested`) | **deny** | **allow** | deny | deny |
| T10 | Read Action logs (`/logs` → `cr1bd_auditevent`) | allow | allow | allow | allow |
| T11 | **Write** to `cr1bd_auditevent` (negative — should be impossible for everyone but SysAdmin) | **deny** | **deny** | **deny** | **deny** |
| T12 | Write to `cr1bd_workprovider` (corpus) | deny | deny | **allow** *(only if §2.4 in scope; else deny)* | deny |
| T13 | Flip a feature gate (`BOX_API_ENABLED`/`EVA_API_ENABLED`/`ENRICHMENT_ENABLED`) | **deny** | **deny** | **deny** | **deny** |
| T14 | Delete any case/evidence row | **deny** | **deny** | **deny** | **deny** |

> EVA-submit (T9) is **doubly gated**: even for a Reviewer it is blocked by the app's readiness check
> (0 outstanding items) **and** the `EVA_API_ENABLED` / `BOX_*` env-var gates. The role test only
> proves the *privilege*; end-to-end submission still needs the gates flipped + EVA creds (operator).

### 4.4 Verify (evidence to capture)
- **Live role/privilege check** via the WebAPI as the test user, e.g. against
  `https://collisionengineers-dev.crm11.dynamics.com`:
  `GET /api/data/v9.2/systemusers(<systemuserid>)/Microsoft.Dynamics.CRM.RetrieveUserPrivileges`
  (a function **bound to the `systemuser` entity** — not a bare collection endpoint), with
  `GET /api/data/v9.2/systemuserroles` for which roles the user holds and
  `GET /api/data/v9.2/roles(<roleid>)/roleprivileges_association` for each role's privileges — to
  confirm the user holds exactly the intended role and no more.
- **Allowed actions** leave a `cr1bd_auditevent` row / a real Dataverse change — confirm via
  `GET /api/data/v9.2/cr1bd_cases?$orderby=createdon desc` and the Action logs screen.
- **Denied actions** return an authorization error on the call (capture the failure), confirming the
  server is the boundary.
- Re-verify against the live registry toolkit in
  [architecture/live-environment.md](../architecture/live-environment.md) §"Live-verification toolkit".

---

## 5. Operator-gated vs Claude-authorable

| Item | Who | Why / detail |
|---|---|---|
| **Author custom security-role definitions** (`cr1bd_IntakeClerk`, `cr1bd_EngineerReviewer`, `cr1bd_ProviderAdmin`, `cr1bd_ReadOnlyAuditor`, optional `cr1bd_CaseWorker`) as solution components | **Claude** | Role definitions are solution metadata (like the existing schema). Authored offline, layered additively over `CollisionSpike`. |
| **Author optional Field Security Profiles** (§3.6) | **Claude** | Only if a column-masking requirement lands; none today. |
| **Cosmetic UI role-hiding** (§3.5, replace hardcoded `userName`) | **Claude** | App-source change; cosmetic, not an enforcement boundary. |
| **Import/assign the roles into the live Dev env** | **Operator** (System Administrator — `digital@` holds this) | Assigning a security role to a user/team is a live admin action. |
| **Create Entra users + per-persona security groups** | **Operator** (needs directory admin) | Tenant directory writes; not a Dataverse act. |
| **Assign Power Apps Premium licences** (per user or via group) | **Operator** (**License Administrator** — flagged gap, roles-and-permissions.md item 5) | Per-user Premium is the practical seat ceiling (microsoft-stack.md). |
| **Create Dataverse teams + map to the Entra groups** | **Operator** (System Administrator) | Group-team setup is an admin act. |
| **Share the app** to each persona group from `make.powerapps.com` | **Operator** (System Administrator / System Customizer ≥ the role being granted — `digital@` has this) | Code apps follow canvas-app sharing; the share is separate from the role. |
| **Tenant Code Apps enablement + DLP classification of premium connectors** | **Operator** (**Power Platform Administrator** — flagged gap, roles-and-permissions.md item 4) | Tenant-level; the env System Administrator role can't reach it. |
| **Stand up TEST/PROD** (if the persona model must move beyond Dev) | **Operator** (**Power Platform Administrator**) | Environment lifecycle is a flagged gap. |

**Net:** Claude can author *every role/profile definition* as solution components and the optional UI
hardening; **every step that creates an identity, grants a licence, assigns a role to a live user, or
shares the app is operator-gated** — and two of those (License Admin, Power Platform Admin) are
already-identified missing operator roles. Per-user **Premium licensing** is the real ceiling on
scaling staff seats.

---

## 6. Open questions

1. **How many staff, and is true persona separation wanted at M1?** The app UI does not distinguish
   Intake Clerk vs Engineer/Reviewer, so this is purely a Dataverse-role + per-seat-Premium-cost
   decision. If not, collapse to a single `cr1bd_CaseWorker` role (§2.3).
2. **Individual Premium licences per staff member, or a dedicated service account for connections?**
   roles-and-permissions.md item 5 already flags **License Administrator** as a missing operator role;
   the number of paid seats is the practical ceiling. (Note: code apps cannot be *owned* by a service
   principal, so a human maker still owns/pushes.)
3. **Is the self-service Provider-Admin persona in scope?** Today `/admin` saves only to local React
   state (operator deploy-time write), so **no `cr1bd_workprovider` write privilege is needed yet** —
   grant the `cr1bd_ProviderAdmin` role's corpus R/W only if this phase is explicitly wanted (§2.4).
4. **Mask sensitive columns from the Auditor via Field Security Profiles?** (claimant phone/email;
   finalize/dedup latch columns). None exist today — a planning choice, not current state (§3.6).
5. **Single Dev/Sandbox forever, or a Dev → Test → Prod path?** Standing up TEST/PROD needs **Power
   Platform Administrator** (a flagged gap) and changes *where* these staff roles get authored/assigned.
6. **Does any staff member need access scoped to a subset of cases** (e.g. by provider or business
   unit)? The app has no owner-based "my cases" concept and queues are status-based, so **Org scope is
   the natural default** unless a real segmentation requirement exists (the `UserOwned` tables leave
   BU/User scoping available if it does).
7. **Will external / guest users (a provider or contractor) ever need access?** Code apps support
   Entra B2B guest sharing, but guests must be **licensed from the Dataverse tenant** — out of scope
   unless required.
