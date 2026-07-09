"""Tests for the externalized triage-rule phrase data (rules-engine-v2 Phase 5).

``resources/triage-rules.json`` (schema: ``resources/triage-rules.schema.json``)
now carries the flat keyword/phrase collections that
``cedocumentmapper_v2.rules.engine``, ``cedocumentmapper_v2.rules.
email_classifier`` and ``cedocumentmapper_v2.detection.attachment_typing`` used
to define as Python tuple/frozenset literals (see ``rules/triage_rules.py``).
This suite tests the DATA + LOADER layer in isolation:

  * the bundled JSON validates against the bundled schema;
  * ``load_triage_rules()`` returns non-empty collections of the exact types
    the constants it replaces used to have, and caches its result;
  * a mutated/broken rules dict (missing key, typo'd/extra key, emptied list,
    wrong-typed item) fails schema validation LOUDLY, per the plan's
    runtime-validation goal (the cloud path validates too, not just
    desktop/test tooling);
  * a golden test pins a few real phrases in their real collection, so a
    misplaced/renamed key cannot slip through unnoticed;
  * a parity/snapshot guard pins the exact per-key COUNT against a small
    committed table, so a silent truncation (an edit that drops phrases
    without ever emptying the list, which the schema's ``minItems: 1`` alone
    would not catch) is caught here instead.

The classifier/attachment-typing suites (``test_email_classifier.py``,
``test_attachment_typing.py``) are the BEHAVIOURAL parity proof for this
refactor -- they exercise these phrases through the actual classification
rules and are unchanged/still green, proving the externalization is a pure,
zero-behaviour-change data move.
"""

from __future__ import annotations

import dataclasses

import jsonschema
import pytest

from cedocumentmapper_v2 import resources
from cedocumentmapper_v2.rules.triage_rules import (
    TRIAGE_RULES_RESOURCE,
    TRIAGE_RULES_SCHEMA_RESOURCE,
    TriageRules,
    load_triage_rules,
)

# --- Committed parity snapshot -----------------------------------------------
# One entry per externalized collection, pinning its EXACT size as of the
# rules-engine-v2 Phase-5 externalization (engine-v2.5, mechanically
# transcribed from the pre-externalization Python literals via `ast` -- see
# the sibling commit history). A change to this number must be a DELIBERATE
# edit to resources/triage-rules.json (and to this snapshot in the SAME
# commit) -- an accidental truncation (or an accidental duplicate) trips this
# test even though the schema's `minItems: 1` alone would not catch it.
_EXPECTED_COUNTS: dict[str, int] = {
    "audit_phrases": 4,
    "dual_report_audit_phrases": 2,
    "diminution_phrases": 2,
    "work_keywords": 35,
    "billing_keywords": 17,
    "informal_work_keywords": 21,
    "query_keywords": 50,
    "chase_phrases": 20,
    "summary_markers": 9,
    # 29 -> 31 (collisionspike TKT-097): + "not wish to proceed",
    # "no longer wishes to proceed" — the Oakwood live cancellation miss.
    "cancellation_phrases": 31,
    # 17 -> 20: the three TKT-081 automated-acknowledgement markers ("this is an
    # automated email", "please do not respond", "do not respond directly") were
    # added at engine-v2.7 without this snapshot being updated in the same
    # commit (pre-existing red since ccfb473); reconciled here.
    "auto_reply_markers": 20,
    "vrm_stopword_trigrams": 30,
    "report_title_phrases": 6,
    "report_structure_phrases": 5,
    "junk_phrases": 8,
    # Taxonomy v3 collections (collisionspike TKT-105/120 + TKT-084).
    "payment_phrases": 14,
    "pre_instruction_phrases": 17,
}


def _valid_document() -> dict:
    """A fresh, mutable copy of the bundled triage-rules.json.

    ``resources.load_schema`` re-reads + re-``json.loads``s the packaged
    resource on every call (no shared/cached dict), so the object returned
    here is already safe to mutate in place -- it aliases nothing else (not
    the file on disk, not ``load_triage_rules()``'s cached ``TriageRules``).
    """
    return resources.load_schema(TRIAGE_RULES_RESOURCE)


def _schema() -> dict:
    return resources.load_schema(TRIAGE_RULES_SCHEMA_RESOURCE)


# --- Schema + loader sanity ---------------------------------------------------


def test_bundled_json_validates_against_bundled_schema():
    """The packaged triage-rules.json satisfies triage-rules.schema.json."""
    schema = _schema()
    jsonschema.Draft202012Validator.check_schema(schema)
    jsonschema.validate(instance=_valid_document(), schema=schema)


def test_bundled_json_schema_version_is_1():
    assert _valid_document()["schema_version"] == 1


def test_loader_returns_typed_nonempty_collections():
    rules = load_triage_rules()
    assert isinstance(rules, TriageRules)
    for name in _EXPECTED_COUNTS:
        value = getattr(rules, name)
        if name == "vrm_stopword_trigrams":
            assert isinstance(value, frozenset), name
        else:
            assert isinstance(value, tuple), name
        assert len(value) > 0, f"{name} loaded empty"
        assert all(isinstance(item, str) and item for item in value), name


def test_loader_is_cached():
    """``load_triage_rules`` is module-level cached -- repeat calls return the
    SAME object (identity, not just equality). Three modules (engine.py,
    email_classifier.py, attachment_typing.py) each call it at import time;
    caching means one real read+validate, not three."""
    assert load_triage_rules() is load_triage_rules()


# --- Parity / snapshot guard --------------------------------------------------


def test_parity_snapshot_covers_every_field():
    """If a new phrase collection is ever added to TriageRules, this table
    must be updated in the SAME commit -- otherwise the count guard below
    would silently skip the new field instead of pinning it too."""
    field_names = {f.name for f in dataclasses.fields(TriageRules)}
    assert set(_EXPECTED_COUNTS) == field_names


def test_parity_snapshot_counts():
    """Pin the exact size of every collection against a committed snapshot.

    Catches SILENT truncation/duplication -- an edit that removes or adds
    phrases without ever emptying a list (so ``minItems: 1`` alone would not
    catch it). A deliberate content change must update ``_EXPECTED_COUNTS`` in
    the same commit as the JSON edit.
    """
    rules = load_triage_rules()
    actual_counts = {name: len(getattr(rules, name)) for name in _EXPECTED_COUNTS}
    assert actual_counts == _EXPECTED_COUNTS


def test_parity_snapshot_total():
    """Belt-and-braces: the grand total across all collections."""
    rules = load_triage_rules()
    total = sum(len(getattr(rules, name)) for name in _EXPECTED_COUNTS)
    # 255 -> 258 (auto_reply_markers reconciliation) -> 260 (TKT-097) -> 291
    # (payment_phrases 14 + pre_instruction_phrases 17, taxonomy v3).
    assert total == sum(_EXPECTED_COUNTS.values()) == 291


# --- Golden phrase pins -------------------------------------------------------


@pytest.mark.parametrize(
    ("collection", "phrase"),
    [
        ("cancellation_phrases", "claim cancelled"),
        ("work_keywords", "please inspect"),
        ("billing_keywords", "raise an invoice"),
        ("query_keywords", "any update"),
        ("chase_phrases", "provide the report"),
        ("informal_work_keywords", "roadworthy"),
        ("summary_markers", "summary of the instructions"),
        ("audit_phrases", "audit report"),
        ("auto_reply_markers", "out of office"),
        ("report_title_phrases", "engineer's report"),
        ("report_structure_phrases", "findings and opinion"),
        ("junk_phrases", "unsubscribe"),
    ],
)
def test_golden_phrase_present(collection: str, phrase: str):
    """A hand-picked real phrase must be present in ITS collection -- an
    accidental key swap (e.g. cancellation_phrases <-> query_keywords) or an
    emptied-then-partially-refilled list would trip this even if the overall
    counts happened to coincide."""
    rules = load_triage_rules()
    assert phrase in getattr(rules, collection)


def test_golden_vrm_stopword_trigrams_present():
    rules = load_triage_rules()
    assert "NOW" in rules.vrm_stopword_trigrams
    assert "VAT" in rules.vrm_stopword_trigrams


# --- Broken-JSON schema-validation failures -----------------------------------


def test_missing_required_key_fails_validation():
    document = _valid_document()
    del document["rules"]["cancellation_phrases"]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=document, schema=_schema())


def test_unknown_extra_key_fails_validation():
    """A typo'd key (e.g. a stray ``cancelation_phrases``) must fail LOUDLY,
    not be silently ignored -- additionalProperties: false at the rules
    level."""
    document = _valid_document()
    document["rules"]["cancelation_phrases"] = ["typo"]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=document, schema=_schema())


def test_emptied_collection_fails_validation():
    """An accidental JSON edit that empties a tuple can't slip through --
    minItems: 1 on every phrase list."""
    document = _valid_document()
    document["rules"]["work_keywords"] = []
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=document, schema=_schema())


def test_wrong_schema_version_fails_validation():
    document = _valid_document()
    document["schema_version"] = 2
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=document, schema=_schema())


def test_non_string_item_fails_validation():
    document = _valid_document()
    document["rules"]["junk_phrases"].append(123)
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=document, schema=_schema())


def test_blank_string_item_fails_validation():
    document = _valid_document()
    document["rules"]["junk_phrases"].append("")
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=document, schema=_schema())


def test_missing_rules_key_fails_validation():
    document = _valid_document()
    del document["rules"]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=document, schema=_schema())
