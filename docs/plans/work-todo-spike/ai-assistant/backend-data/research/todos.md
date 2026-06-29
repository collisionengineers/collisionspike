# Backend data - context pack

## Source ticket

`docs/plans/work-todo-spike/ai-assistant/backend-data/todos.md` says the figures in `2.png` make no sense and that inspection addresses, image sources, repairers, and similar data need to be modifiable.

## Current state

The relevant reference data exists in Postgres:

- `work_provider` (`migration/assets/schema/010_work_provider.sql`);
- `repairer` (`migration/assets/schema/020_repairer.sql`);
- `image_source` (`migration/assets/schema/030_image_source.sql`);
- `inspection_address` (`migration/assets/schema/040_inspection_address.sql`);
- `repairer_workprovider` and `imagesource_workprovider` junctions (`migration/assets/schema/130_repairer_workprovider.sql`, `140_imagesource_workprovider.sql`).

Read/edit API coverage is uneven:

- Work providers have read routes (`api/src/functions/providers.ts:16-39`).
- Inspection address suggestions and counts exist, and case-specific inspection decisions can be saved (`api/src/functions/inspection.ts:37-189`).
- There are no obvious general CRUD routes for repairers, image sources, or inspection-address corpus maintenance.
- Existing Superuser write style can be copied from app settings routes (`api/src/functions/settings.ts:37-63`).

## Count confusion

The current registry says corpus counts are last-known and not reverified because Postgres firewall/local psql blocked the verifier:

- `work_provider` 390;
- `repairer` 32;
- `image_source` 19;
- `inspection_address` 2209;
- 174 confirmed + 2035 suggested;
- `case_` 0.

Evidence: `docs/architecture/live-environment.md:43`.

The seed docs explain part of the mismatch: the source data contains 2,035 suggested rows but around 871 deduped sites (`migration/assets/schema/seed/README.md:13-17`). The inspection-address corpus docs also say the live apply preserved 174 confirmed rows and wrote 2,035 suggested rows (`docs/architecture/inspection-address-corpus.md:10-17`, `103-106`).

The likely problem in `2.png` is a label/meaning mismatch: raw rows, loaded suggested rows, confirmed rows, and deduped physical sites are different numbers.

## Why this matters for AI

The image-analysis ticket wants address suggestions based on provider history, background text, and corpus comparison. That is only useful if the corpus can be corrected when staff identify bad addresses, duplicate sites, missing image sources, or wrong provider relationships.

## Changes that would resolve it

1. Define admin/reference-data screens and APIs for:
   - work providers;
   - repairers;
   - image sources;
   - inspection addresses;
   - provider-to-repairer and provider-to-image-source links.
2. Use Superuser-only write routes for corpus changes.
3. Use archive/active flags where possible instead of deletes.
4. Audit every change with old/new values.
5. In the dashboard/admin UI, label counts by meaning:
   - providers;
   - repairers;
   - image sources;
   - confirmed inspection addresses;
   - suggested inspection-address rows;
   - deduped suggested sites, if separately computed.
6. Keep runtime address matching out of the intake path; suggestions should remain staff-reviewed per ADR-0013.

## Evidence

- `docs/plans/work-todo-spike/ai-assistant/backend-data/todos.md`
- `docs/architecture/live-environment.md:43`
- `docs/architecture/inspection-address-corpus.md`
- `migration/assets/schema/010_work_provider.sql`
- `migration/assets/schema/020_repairer.sql`
- `migration/assets/schema/030_image_source.sql`
- `migration/assets/schema/040_inspection_address.sql`
- `api/src/functions/providers.ts`
- `api/src/functions/inspection.ts`
- `api/src/functions/settings.ts`
