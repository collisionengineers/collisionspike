"""Loader for the externalized triage-rule phrase data (rules-engine-v2 Phase 5).

The flat keyword/phrase string collections that :mod:`cedocumentmapper_v2.rules.
engine`, :mod:`cedocumentmapper_v2.rules.email_classifier` and
:mod:`cedocumentmapper_v2.detection.attachment_typing` match against now live in
the bundled ``resources/triage-rules.json`` (schema:
``resources/triage-rules.schema.json``), not as Python literals. This is a
deliberately NARROW externalization (collisionspike rules-engine-v2 plan,
Phase 5): only the flat phrase/keyword lists move. The regexes, rule ordering,
confidence bands and suppression logic that read them stay exactly where they
are, in Python.

:func:`load_triage_rules` is the single entry point: it reads the packaged JSON
via :func:`cedocumentmapper_v2.resources.load_schema` (the SAME
``importlib.resources`` mechanism already used for ``eva-json.schema.json`` /
``provider-config.schema.json``, so this works identically whether the package
runs from source, is pip-installed, or is frozen into the desktop PyInstaller
build), schema-validates it, and returns a :class:`TriageRules` whose attributes
are the exact ``tuple[str, ...]`` / ``frozenset[str]`` types the module-level
constants they replace used to be.

Runtime validation is not a test-only nicety here -- it also runs on the CLOUD
path (the vendored copy inside the parser Azure Function), so a typo'd key or
an accidentally emptied phrase list fails LOUD (an exception at import time)
rather than silently degrading a classifier rule in production.
``jsonschema`` is already a runtime dependency of the engine (see
``exporters/eva_json.py``, which validates every EVA export the same way), so
this adds no new dependency.

The result is cached at module level (:func:`functools.lru_cache`) -- the
bundled resource is immutable for the life of the process, so re-reading /
re-validating on every call would be pure overhead. Every consumer therefore
does the same thing at import time::

    _RULES = load_triage_rules()
    _WORK_KEYWORDS: tuple[str, ...] = _RULES.work_keywords

so the module-level constant NAME each consumer already exports is unchanged
-- every import-site of ``_WORK_KEYWORDS`` etc. elsewhere in the engine (and in
collisionspike's vendored copy) stays untouched.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import jsonschema

from cedocumentmapper_v2 import resources

TRIAGE_RULES_RESOURCE = "triage-rules.json"
TRIAGE_RULES_SCHEMA_RESOURCE = "triage-rules.schema.json"


@dataclass(frozen=True)
class TriageRules:
    """Typed, immutable view over the bundled ``triage-rules.json`` phrase corpus.

    One attribute per externalized keyword/phrase collection -- see
    ``resources/triage-rules.json`` / ``resources/triage-rules.schema.json`` for
    the authoritative data and shape. Every attribute is the exact type the
    module-level constant it replaces used to be: ``tuple[str, ...]`` for an
    ordered phrase list, ``frozenset[str]`` for ``vrm_stopword_trigrams`` (a
    genuine set -- membership-tested, never iterated in order).
    """

    audit_phrases: tuple[str, ...]
    work_keywords: tuple[str, ...]
    billing_keywords: tuple[str, ...]
    informal_work_keywords: tuple[str, ...]
    query_keywords: tuple[str, ...]
    chase_phrases: tuple[str, ...]
    summary_markers: tuple[str, ...]
    cancellation_phrases: tuple[str, ...]
    auto_reply_markers: tuple[str, ...]
    vrm_stopword_trigrams: frozenset[str]
    report_title_phrases: tuple[str, ...]
    report_structure_phrases: tuple[str, ...]
    junk_phrases: tuple[str, ...]


@lru_cache(maxsize=1)
def load_triage_rules() -> TriageRules:
    """Load, schema-validate, and return the bundled triage-rule phrase corpus.

    Reads ``triage-rules.json`` + ``triage-rules.schema.json`` as packaged
    resources (works from source, installed, or PyInstaller-frozen), validates
    the data against the schema on this (the one real, cached) load, and
    returns a :class:`TriageRules` with every field converted to the type the
    constant it feeds used to be.

    Raises:
        jsonschema.ValidationError: the bundled JSON does not satisfy the
            schema -- e.g. a renamed/typo'd key, a missing collection, or an
            empty phrase list (``minItems: 1`` at the schema level).
        FileNotFoundError: a bundled resource is missing from the package.
    """
    schema = resources.load_schema(TRIAGE_RULES_SCHEMA_RESOURCE)
    document = resources.load_schema(TRIAGE_RULES_RESOURCE)
    jsonschema.validate(instance=document, schema=schema)

    # Explicit field-by-field (not a generic loop over dataclasses.fields())
    # so each collection is constructed with its own concrete tuple/frozenset
    # call -- mypy can verify each one against TriageRules' field types this
    # way, which it cannot do through a **kwargs unpack of a heterogeneous
    # dict. Kept in sync with TriageRules by test_parity_snapshot_covers_
    # every_field in tests/test_triage_rules.py.
    rules = document["rules"]
    return TriageRules(
        audit_phrases=tuple(rules["audit_phrases"]),
        work_keywords=tuple(rules["work_keywords"]),
        billing_keywords=tuple(rules["billing_keywords"]),
        informal_work_keywords=tuple(rules["informal_work_keywords"]),
        query_keywords=tuple(rules["query_keywords"]),
        chase_phrases=tuple(rules["chase_phrases"]),
        summary_markers=tuple(rules["summary_markers"]),
        cancellation_phrases=tuple(rules["cancellation_phrases"]),
        auto_reply_markers=tuple(rules["auto_reply_markers"]),
        vrm_stopword_trigrams=frozenset(rules["vrm_stopword_trigrams"]),
        report_title_phrases=tuple(rules["report_title_phrases"]),
        report_structure_phrases=tuple(rules["report_structure_phrases"]),
        junk_phrases=tuple(rules["junk_phrases"]),
    )
