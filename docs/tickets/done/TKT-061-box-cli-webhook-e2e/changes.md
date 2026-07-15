# TKT-061 — changes

The retained ticket describes the Box upload-intake work as:

- authenticated CLI access to the development Archive root;
- a `FILE.UPLOADED` webhook targeting the existing receiver;
- signature validation followed by evidence creation, audit recording, and case-status
  re-evaluation;
- a sandboxed upload test and a read-only mirror audit.

This artifact restores lifecycle parity for the existing done record. PLAN-006 did not create a
webhook, upload a file, or otherwise mutate Archive.
