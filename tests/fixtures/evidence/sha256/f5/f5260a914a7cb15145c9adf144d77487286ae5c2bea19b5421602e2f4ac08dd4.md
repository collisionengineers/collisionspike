# Task 6 — claudeschoice (additional cross-references)

Seven analyses beyond the prescribed T1-T5, chosen to feed the Dataverse corpus and
the address-matching service.

| File | What it answers | Headline |
|---|---|---|
| `unknown_principals.csv` | principal codes in case data with no contact record | 2 truly unknown codes |
| `contact_group_redherrings.csv` | known NON-provider codes (engineer/staff/agent/broker/client/other/private) | 20 red-herring contacts the brief warns about |
| `jobsheet_provider_activity.csv` | real case volume + recency per job-sheet provider (slash-code + name resolution, deduped) | 49 distinct providers (9 duplicate job-sheet lines collapsed); only 2 truly have **0** cases |
| `top_inspection_locations.csv` | the postcodes where inspections actually cluster | top-80 sites, with dominant principal + known-repairer flag |
| `principal_loc_rate.csv` | what share of a principal's cases have a location | image-based vs site-inspected split |
| `inspection_type_by_principal.csv` | Desktop vs physical mix per principal | validates the job-sheet "image based or address" column |
| `legal_contacts_activity.csv` | which of the 438 LEGAL contacts are live | 426 have ≥1 case; the rest are dead weight |
| `postcode_area_geography.csv` | business geography by postcode area | where the work physically is |

**Why these matter for Dataverse**
- *unknown_principals* + *legal_contacts_activity* tell you how much of the EVA
  contact list is noise before you import it into `WorkProvider`.
- *jobsheet_provider_activity* separates real earners from paper rows — seed/prioritise
  accordingly, and set `active=false` on dead ones.
- *top_inspection_locations* + *principal_loc_rate* + *inspection_type* drive the
  per-provider `imagesSourceNotes` / inspection policy and the address-matching
  service (which postcodes to pre-resolve, which principals are image-only).
- *postcode_area_geography* shows the inspector catchment (Scotland-heavy: G/ML/EH/PA).
