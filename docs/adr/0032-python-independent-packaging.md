# ADR-0032 — Python function services are independently packaged; duplication is checked, not shared

**Status:** Accepted 2026-07-20 per [PLAN-011](../tickets/plans/PLAN-011-python-doctrine-and-parity.md) ([TKT-267](../tickets/done/TKT-267-python-packaging-doctrine-decision/TKT-267-python-packaging-doctrine-decision.md)).

## Decision

Each Python function service under [`services/functions/`](../../services/functions/README.md) stays an
**independently packaged** unit — its own contract, tests, `requirements*.txt`, and deployment inputs,
built and deployed on its own. There is **no shared Python runtime package** for the cross-service
duplication that prompted PLAN-011 (per-client bearer/refresh/retry policies, and the vendored parser's
VRM and Case/PO rules). Where duplication is genuinely present, it is converted from silent drift into
**checked behaviour**, not merged:

- The divergent per-client **authentication and retry** policies are pinned by a shared **test-only**
  behavioural conformance harness against an explicit, checked per-client inventory
  ([TKT-268](../tickets/backlog/TKT-268-python-token-backoff-conformance-suite/TKT-268-python-token-backoff-conformance-suite.md)).
  It asserts only the expiry-aware-reuse, one-time-refresh, bounded-transient-retry, and `Retry-After`
  behaviours each client actually claims — never identical internals.
- The independently implemented **vendored-parser** VRM canonicalisation and Case/PO-marker recognition
  are pinned against their `@cs/domain` counterparts by a cross-language **behavioural parity** guard on
  a shared fixture corpus, with each current difference either reconciled or recorded as an explicitly
  approved allowed divergence
  ([TKT-269](../tickets/done/TKT-269-vendored-parser-cross-language-parity-guard/TKT-269-vendored-parser-cross-language-parity-guard.md)).

The vendored parser remains vendored and drift-locked ([ADR-0018](./0018-cedocumentmapper-dual-target-vendored-engine.md));
this decision only *widens the parity guard* and does not touch the vendor-lock mechanism.

## Rationale

Two independent lines of evidence favour independence over a shared runtime module.

First, the **runtime clients are not one mechanism**. Direct inspection of the committed clients shows
deliberately different authentication forms — a Box JWT assertion (`box_client.py`), Azure managed
identity for storage (`blob_source.py`) and for the Data API (`data_api_client.py`), the EVA
`Connect/token` credential form (`eva_client.py`), Microsoft Entra client credentials (`dvsa_client.py`),
a static API key (`dvla_client.py`), and a keyless managed-identity Cognitive-Services token
(`ai_reasoning.py`). Their caching, refresh, and 429/5xx handling also differ by design (some cache a
monotonic-deadline token, one uses wall-clock expiry, one delegates caching to `azure-identity`, one is a
retained-but-not-expiry-aware bearer that degrades to an empty result). Collapsing these into one shared
implementation would erase load-bearing differences; a shared *behavioural contract* pins what matters
(the observable policy) without forcing a single shape.

Second, [PLAN-009's TKT-256 read-only assessment](../operations/helper-app-consolidation-assessment.md)
recommends **against** infrastructure consolidation (keep per-service App Service plans and storage —
independent scaling/cold-start, per-app least-privilege identity, and a bounded deployment blast radius
are load-bearing for sporadically-invoked helpers; telemetry, the one dimension where sharing would help,
is already shared). That assessment explicitly treats *code/runtime* sharing as separable from
*infrastructure* sharing and does not force a shared runtime — so the packaging decision stands on the
code evidence, and that evidence points to independence. Had TKT-256 instead recommended collapsing the
apps, the sharing calculus would have changed and a shared runtime module might have been worthwhile; it
did not.

## Consequences

`services/functions/README.md`'s "independently packaged" line is reaffirmed and now points here. The
follow-on mechanisms are the checked conformance harness (TKT-268) and the cross-language parity guard
(TKT-269); the pre-existing engine-in-sync and EVA-schema-in-sync guards remain authoritative for their
own boundaries, and no tautological EVA-normalisation comparison is introduced (`buildEvaPayload` and
`decideCaseType` project already-normalised values and are not independent Python-normalizer
counterparts). Changing this decision — adopting a shared Python runtime module — would require a new ADR
or a dated superseding amendment and would re-open the sharing-versus-isolation calculus above.
