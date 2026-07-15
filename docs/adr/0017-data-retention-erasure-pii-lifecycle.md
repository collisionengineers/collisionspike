# ADR-0017 — Retention uses a minimization clock plus legal hold

**Status:** Accepted as architecture; policy values remain operator/legal work.

## Decision

Model two independent concerns:

1. a default minimization expiry after case closure; and
2. a legal/evidential hold that prevents disposition while it applies.

Disposition may run only when the expiry has passed and no hold is present. The retention period, hold
criteria, who may set/clear a hold, and anonymize-versus-delete outcome require recorded operator/legal
approval.

Data-subject requests must cover PostgreSQL, source and transient bytes, the Archive, mail references,
File Request links, and identifier strings. Automated Archive deletion is prohibited; any Archive erasure
is a human-governed step.

## Consequences

Audit records survive case disposition to the minimum lawful extent. Sensitive AI/image features require
purpose, minimization, processor/residency assessment, and per-capability approval. Open DPIA, lawful-
basis, ICO, provider-terms, retention, and erasure decisions remain explicit ticketed work.
