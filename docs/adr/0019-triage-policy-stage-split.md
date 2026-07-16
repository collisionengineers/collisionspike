# ADR-0019 — Triage separates text signals, domain policy, and AI suggestions

**Status:** Accepted (decision proposed 2026-07-02; current path implemented).

## Decision

Split triage into three stages:

1. The vendored parser/classifier extracts deterministic text signals without database or network access.
2. Environment-free domain policy combines those signals with explicit context such as open-case keys,
   conversation history, intermediary relationships, and provider automation policy.
3. AI may suggest a classification or action only behind an approved gate; deterministic policy remains
   the authority and every suggestion is auditable.

## Rationale

Pure text cannot resolve context-dependent updates, cancellations, or intermediary-routed instructions.
Putting database context into the parser would fork rules and make it non-deterministic.

## Consequences

Each stage has a versioned input/output contract and pure fixture tests. A context lookup failure yields a
conservative review result. AI never creates an unreviewable hidden routing path.
