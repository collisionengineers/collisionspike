---
id: TKT-133
title: Deduplicate evidence rows (email + Box mirror twins) + fix the box-webhook kind at source
status: now
priority: P2
area: evidence
tickets-it-relates-to: [TKT-124, TKT-126, TKT-003]
research-link: docs/tickets/now/TKT-133-evidence-dedup-box-kind/evidence/operator-note.md
plan: PLAN-003
---

# TKT-133 — Deduplicate evidence rows (email + Box mirror twins) + fix the box-webhook kind at source

## Problem

The same photo can be persisted twice — once from the email attachment lane and once from the Box
FILE.UPLOADED mirror — producing duplicate rows that duplicate in the EVA photo sequence and the
zip export. Separately, the box-webhook Python client still sends evidenceClass 'image' for every
upload (the Data API writer guard now corrects it server-side, but the client should be honest at
source).

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — UI-wave batch report finding, 2026-07-09.
- evidence rows carry sha256 — a dedup key exists.

## Proposed change

PROPOSED (not built): a sha256-keyed dedup pass at write time (skip/link instead of duplicating) +
an audited one-off data cleanup of existing twins; fix data_api_client.py to derive the kind from
the file type.

## Acceptance

- A photo arriving via email AND its Box mirror yields ONE evidence row (regression test).
- Existing duplicate twins enumerated + merged/marked with audit; EVA order/zip shows each photo once.
- box-webhook sends the true kind (guard stays as belt-and-braces).

## Research

Filed 2026-07-09 from the UI-wave batch report (workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
