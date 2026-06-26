# 20 — Data & schema migration

Dataverse → Azure Database for PostgreSQL. The schema is the easy part (it is already JSON); the cost
is the *logic* that moves to the API ([`21`](./21-backend-api-build.md)). **Phase P2.** Source of
truth: `dataverse/schema/*.json` (12 tables), `dataverse/choicesets/*.json` (17 files → 22 global
choice sets), `dataverse/relationships.json` (15 one-to-many + 2 many-to-many).

The DDL is **authored and checked in** under [`assets/schema/`](./assets/schema/) — apply it verbatim:

| File | What it builds |
|---|---|
| `000_enums_lookups.sql` | 22 `choice_*` lookup tables, **integer codes copied verbatim** (EVA/contract/classifier parity) |
| `010_…` – `120_…` | one file per Dataverse table (work_provider, repairer, image_source, inspection_address, **case_**, evidence, field_level_provenance, audit_event, chaser, note, improvement_signal, inbound_email) |
| `130_…`, `140_…` | the two N:N intersect tables (`repairer_workprovider`, `imagesource_workprovider`) |
| `900_constraints.sql` | all 15 relationship FKs + 4 junction FKs (cascade per Dataverse), the two `UNIQUE(source_message_id)` dedup keys, FK indexes, and RLS |
| `seed/README.md` | the corpus reseed approach (staging `\copy` + idempotent upsert from `dataverse/.build/`) |

## 1. Provision Postgres (P1, prerequisite)

The subscription holding `rg-collisionspike-dev` is an **Azure free trial** (`FreeTrial_2014-09-01`).
Per Microsoft Learn *“Use an Azure free account to try Azure Database for PostgreSQL for free”*, a
free account gets, **free for 12 months**: **750 hours/month of Burstable B1MS** (enough to run one
instance 24×7) + **32 GB storage** + 32 GB backup storage. Stay at/under **B1ms + 32 GB** to remain
inside the allowance (Q1 in [`02`](./02-decisions-and-open-questions.md)); the operator has weeks
before needing to upgrade to Pay-As-You-Go.

```bash
# Flags verified on Microsoft Learn "az postgres flexible-server create" (CLI reference) +
# the free-account how-to. B1MS is the free-tier compute; storage min is 32 GiB.
az postgres flexible-server create \
  --resource-group rg-collisionspike-dev \
  --name cespk-pg-dev \
  --location uksouth \
  --tier Burstable --sku-name Standard_B1ms \
  --storage-size 32 \
  --version 16 \
  --backup-retention 7 \
  --microsoft-entra-auth Enabled --password-auth Enabled \
  --admin-user csadmin --admin-password "<generate-32-char; store in cespk KV>" \
  --public-access None
# Then create the application database (the CLI no longer creates a named DB by default):
az postgres flexible-server db create \
  --resource-group rg-collisionspike-dev --server-name cespk-pg-dev --database-name collisionspike
# Allow the build host to connect once, to apply DDL (delete the rule after, or use a Bastion/VM):
az postgres flexible-server firewall-rule create \
  --resource-group rg-collisionspike-dev --name cespk-pg-dev \
  --rule-name build-host --start-ip-address <your-ip> --end-ip-address <your-ip>
```

Flag notes (all confirmed on Learn):
- `--tier Burstable --sku-name Standard_B1ms` — the only free-tier compute. `--version 16` is pinned
  (the CLI now defaults new servers to **PG 17**; gen_random_uuid() is core in 14+, so 16 is fine and
  the DDL needs no extension — `000_…` keeps a harmless `CREATE EXTENSION IF NOT EXISTS pgcrypto`).
- `--public-access None` — *“sets the server in public access mode but does not create a firewall
  rule”* (i.e. starts closed; you add the one build-host rule above). For a hardened setup use
  `--vnet`/`--subnet` private access instead and reach it from the Function App's VNet integration.
- `--microsoft-entra-auth Enabled` + `--password-auth Enabled` — keep password auth for the initial
  DDL apply, but the **Data API authenticates with its managed identity** (Entra token as the psql
  password, `az account get-access-token --resource-type oss-rdbms`), so no DB password ships in app
  settings. Add the API's managed identity as an Entra DB principal post-create
  (see [`31`](./31-auth-migration.md), [`11`](./11-secrets-and-keyvault.md)). `--admin-user` cannot be
  `admin`/`administrator`/`root` etc. (Learn constraint) — `csadmin` is valid.
- `--admin-password` is still **stored in Key Vault** — in the dedicated break-glass vault
  `cespk-pg-kv-dev` (created by [`assets/iac/provision.sh`](./assets/iac/provision.sh)) as secret
  `pg-admin-password`, **never** the enrichment vault `cespkenrichkvgi62sd` (see [`11`](./11-secrets-and-keyvault.md));
  never in the repo — break-glass only.

## 2. The DDL → `assets/schema/` (already generated)

Translation table actually applied (see each file for column-by-column detail):

| Dataverse construct | Postgres |
|---|---|
| Table (`cr1bd_case`, …) | `TABLE case_ (…)` etc. — drop the `cr1bd_` prefix, snake_case the columns; `case` is reserved so the table is **`case_`** |
| Primary key (`cr1bd_caseid`) | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| String (maxLength n) | `varchar(n)` (format Email/Url validated app-side) |
| Memo (maxLength n) | `varchar(n)` when a contract limit matters (e.g. `eva_payload12` 4000, audit `before`/`after` 8000), else `text` |
| Whole number / BigInt | `integer` / `bigint` (`size_bytes`) |
| Decimal (precision 4, 0..1) | `numeric(5,4)` + `CHECK 0..1` (confidence) |
| Double (0..1) | `double precision` + `CHECK 0..1` (inbound confidence) |
| Boolean | `boolean` (sensible `DEFAULT`: `accepted_for_eva`/`active` true, `excluded`/`on_hold`/`legal_hold`/`submit_requested` false; `registration_visible` stays nullable tri-state) |
| DateTime — UserLocal/TZ-independent | `timestamptz` |
| DateTime — **DateOnly** (`date_due`, `inspection_date`, `last_seen_on`) | `date` |
| Choice (`statuscode` etc.) | `*_code int` FK → `choice_<set>(code)` (**integer code preserved**) |
| Lookup (relationship) | `*_id uuid` FK (added in `900_…`) |
| **File** (`cr1bd_filebytes`) | **omitted** — bytes stay in Blob `cespkevidstdev01`, referenced by `storage_path` |
| Alternate key | `UNIQUE` constraint (natural keys inline; the two dedup `source_message_id` keys in `900_…`) |

Faithfulness extras encoded as `CHECK`s: the EVA enum/format invariants
(`eva_date_of_loss`/`eva_date_of_instruction` `^\d{2}/\d{2}/\d{4}$|''`, `eva_vat_status ∈ {'',Yes,No}`,
`eva_mileage_unit ∈ {'',Miles,Km}`), `excluded ⇒ exclusion_reason`, and the ADR-0013 invariant
`decision_mode=image_based ⇒ non-empty decision_reason`.

### Choicesets → lookup tables (codes preserved — R4)
`000_enums_lookups.sql` emits, for each of the 22 choice sets:
```sql
CREATE TABLE choice_case_status (code integer PRIMARY KEY, name text NOT NULL UNIQUE, label text NOT NULL);
INSERT INTO choice_case_status (code, name, label) VALUES
  (100000000, 'new_email', 'New Email'), (100000001, 'ingested', 'Ingested'), … ;  -- integers verbatim
```
Lookup tables (not native enums) keep the **integer codes explicit and queryable** — EVA, the
`contracts/` package, the Vitest parity test, and `email_classifier.py` all key on them.
`audit_event` keeps codes like `box_folder_created = 100000019`; the two inbound taxonomies keep
their `name`s == the classifier's `CATEGORY_*`/`SUBTYPE_*` strings 1:1.

### Relationships → FK (cascade verbatim from `relationships.json`)
`Cascade → ON DELETE CASCADE`; `RemoveLink → ON DELETE SET NULL`. All in `900_…`:
```sql
ALTER TABLE evidence    ADD CONSTRAINT fk_evidence_case   FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE CASCADE;   -- owned child
ALTER TABLE audit_event ADD CONSTRAINT fk_audit_event_case FOREIGN KEY (case_id) REFERENCES case_(id) ON DELETE SET NULL; -- append-only history
ALTER TABLE case_       ADD CONSTRAINT fk_case_work_provider FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE SET NULL; -- corpus
```
Owned children (Evidence, FieldLevelProvenance, Chaser, Note) **Cascade**; append-only/corpus/triage
referrers (AuditEvent, ImprovementSignal, InboundEmail, all corpus lookups) **SET NULL** so history
and corpus survive a deleted case. The two N:N intersects (`repairer_workprovider`,
`imagesource_workprovider`) cascade from either side.

### Dedup key → UNIQUE
```sql
ALTER TABLE case_         ADD CONSTRAINT uq_case_source_message_id          UNIQUE (source_message_id);
ALTER TABLE inbound_email ADD CONSTRAINT uq_inbound_email_source_message_id UNIQUE (source_message_id);
```
Postgres treats NULLs as distinct, so manually-created rows (no Message-ID) don't collide; only a
repeated real Graph/Internet Message-ID trips the get-or-create idempotency guard (ADR-0010).

### RLS
Single-tenant, staff-only — so RLS is **defense-in-depth**, not tenant filtering. Its job: make the
**audit trail append-only** (INSERT+SELECT for all, *no* UPDATE policy, DELETE admin-only) and gate
destructive deletes to the admin role. Tables get `ENABLE` + `FORCE ROW LEVEL SECURITY`; the Data API
connects as a **non-owner** login (mapped from its managed identity) and sets `SET LOCAL app.role =
'staff'|'admin'` per request. Policies read `current_setting('app.role', true)`. The exact claim →
role wiring is in [`31`](./31-auth-migration.md).

## 3. Apply
Apply in lexical order (the `NNN` prefixes guarantee dependency order; `000` first, `900` last):
```bash
PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv) \
psql "host=cespk-pg-dev.postgres.database.azure.com port=5432 \
      user=csadmin dbname=collisionspike sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f assets/schema/000_enums_lookups.sql \
  $(ls assets/schema/[0-9][0-9][0-9]_*.sql | grep -v 000_ | sort) \
  -f assets/schema/900_constraints.sql
```
`ON_ERROR_STOP=1` so a bad file aborts the run instead of half-applying. (For the very first apply you
can connect as `csadmin` with the password; thereafter prefer the Entra-token form shown above.)

## 4. Reseed the reference corpus (NOT a live-row copy)

There is **no production case data** to migrate. The corpus is reseeded from the **offline seed
sources already in the repo** under `dataverse/.build/` — **never** by exporting live `cr1bd_*` rows.
Full source→table map, file names, and the staging-`\copy` + idempotent-upsert pattern are in
[`assets/schema/seed/README.md`](./assets/schema/seed/). In brief:
- **Work providers** (~392) ← `provider_corpus_recommendation.csv` + `email-domains.csv`
  (`10`/`15-seed-*.ps1`)
- **Repairers** (~61) ← `top_inspection_locations.csv` + `task1_garages_vs_repairer/matches.csv`
  (`11-seed-repairers.ps1`) + the `repairer_workprovider` links
- **Image sources** (~23) + `imagesource_workprovider` links (`13-link-imagesources.ps1`)
- **Inspection addresses** — confirmed sites (`12-seed-…`) + ~871 deduped **suggested** sites from
  `sources/inspection-suggestions-from-eva-export.csv` (`rank`/`frequency`/`last_seen` precomputed by
  `preprocess-eva-inspection-export.py`; `16-seed-suggested-addresses.ps1` logic), loaded with
  `decision_mode=unknown` + `source_label='suggested:…'` so nothing is ever auto-confirmed (ADR-0013).

Each corpus reseeds as an `INSERT … ON CONFLICT (<natural key>) DO UPDATE` so the run is **idempotent**
(re-runnable against the continuously-changing suggestions source). Author one `seed_<corpus>.sql` (or
a single `910_seed_corpus.sql` in dependency order) and apply it **after** `900_…`. The **only**
Dataverse row export anywhere in the migration is the cold-archive CSV at teardown
([`90`](./90-deprovision-power-platform.md)).

## 5. Parity gate

Two layers, both must pass before P3 begins:

**(a) Spec-level (unchanged, file-only).** The ported `node migration/assets/verify-parity-pg.mjs`
(from `dataverse/verify-parity.mjs`, see [`10`](./10-settings-migration.md) §7) re-asserts the
checks that don't need the DB: CaseStatus names == contract union (11), terminals (3), the 12 EVA
fields in `evaOrder` 1..12, gate defaults, and the inbound taxonomy == `email_classifier.py`.

**(b) Database-level (new, post-apply).** Assert the live `choice_*` tables equal the choiceset JSON
code-for-code — the integers are the contract, so this is the load-bearing check:
```sql
-- every choice_* row must match dataverse/choicesets/*.json exactly (count + each code/name pair).
-- Example for case-status (must return 11 rows, codes 100000000..100000010, no drift):
SELECT code, name FROM choice_case_status ORDER BY code;
-- Spot the high-value pinned codes the contracts/classifier depend on:
SELECT name, code FROM choice_audit_action
 WHERE name IN ('box_folder_created','inbound_classified','inbound_routed','case_disposed');
 -- expect 100000019, 100000024, 100000025, 100000026
SELECT count(*) FROM choice_case_status;            -- 11
SELECT count(*) FROM choice_inbound_subtype;        -- 6  (== SUBTYPE_* in email_classifier.py)
-- structural: every EVA enum CHECK + the image_based-requires-reason CHECK exist:
SELECT conname FROM pg_constraint WHERE conname LIKE 'ck_case_eva_%' OR conname = 'ck_inspection_address_image_based_reason';
```
Wire these into the same harness (a thin `pg` reader that diffs `SELECT code,name` against each
choiceset file) so the gate is one command. Choiceset integers, gate defaults, and status-machine
transitions must match the Dataverse values exactly before P3.
