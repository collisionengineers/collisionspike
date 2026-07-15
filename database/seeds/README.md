# Database seed data

This directory contains the current, reproducible reference-data inputs. It never
contains production case rows.

- `910_seed_corpus.sql` rebuilds work providers, repairers, confirmed inspection
  sites, image sources, and their links from the four committed CSVs under `data/`.
  It deliberately preserves existing provider email matches; apply the two
  evidence-backed corrections below after a rebuild.
- `920_replace_suggested_addresses.sql` loads
  `data/inspection-suggestions.csv` through a caller-supplied absolute path and
  replaces only suggested inspection addresses. Confirmed addresses are preserved.
- `915_corpus_email_address_match.sql` and
  `916_provider_domain_corrections.sql` apply idempotent, evidence-backed provider
  matching corrections. They are safe to rerun after a corpus refresh.

The baseline creates all code-table rows directly. Stable numeric codes are checked
by `../tests/code-table-parity.mjs` and must never be renumbered.

These scripts are production-write operations. PLAN-006 does not execute them.
