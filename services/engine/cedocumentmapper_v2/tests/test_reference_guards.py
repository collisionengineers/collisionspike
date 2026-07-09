"""collisionspike TKT-136 — /parse fallback-reference money/fragment guards and
the classifier VRM guards ported to the DOCUMENT path.

The live failure: a parts/estimate line "REFRIGERANT R1234YF ..." minted the
case_ref "RIGERANT R1234YF" (the fuzzy "ref" label matched the word head), and
tier 4's SUBSTRING cue test let "refrigerant" read as a reference cue. Money
values could equally be minted (TKT-103 guarded only the classifier path).
The scope addendum ports the classifier-only TKT-071 tight anchor and #7/F162
stop-word trigram guards to the /parse document path (shared definitions in
rules/engine.py — the classifier aliases them, so the two cannot drift).
"""

from pathlib import Path

import pytest

from cedocumentmapper_v2.domain.models import (
    DocumentLine,
    DocumentModel,
    DocumentPage,
    FieldKey,
)
from cedocumentmapper_v2.rules import RuleEngine
from cedocumentmapper_v2.rules.engine import (
    reference_candidate_is_fragment,
    reference_candidate_is_money,
    vrm_document_candidate_is_bad,
)


def _doc(texts: list[str]) -> DocumentModel:
    lines = [
        DocumentLine(text=text, page_index=0, line_index=idx)
        for idx, text in enumerate(texts)
    ]
    return DocumentModel(
        source_path=Path("dummy.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=tuple(lines)),),
        plain_text="\n".join(texts),
    )


# --------------------------------------------------------------------------- #
# The shared money guard                                                       #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "token",
    ["768.00", "1,234.56", "£1,234.56", "£768.00", "GBP487", "3,168.12"],
)
def test_money_shapes_are_rejected(token):
    assert reference_candidate_is_money(token) is True


def test_currency_marker_before_token_rejects_it():
    assert reference_candidate_is_money("487", "Quote: GBP ") is True
    assert reference_candidate_is_money("487.320", "fee £") is True


@pytest.mark.parametrize(
    "token",
    ["206848.001", "45391_1", "SAB/46286/1", "CCPY26050", "REB/46487/1", "HD4110"],
)
def test_genuine_reference_shapes_are_not_money(token):
    assert reference_candidate_is_money(token) is False


# --------------------------------------------------------------------------- #
# The fragment-plausibility guard                                              #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "value",
    [
        "RIGERANT R1234YF",           # the live junk case_ref (TKT-136)
        "RIGERANT R1234YF 650g",      # same line with its spec quantity
        "650g",                       # a bare unit quantity
        "Our client was involved",    # prose head, no digit
        "Bumper R1234 2.5kg",         # spec-list shape (unit token)
    ],
)
def test_fragment_shapes_are_rejected(value):
    assert reference_candidate_is_fragment(value) is True


@pytest.mark.parametrize(
    "value",
    [
        "REB/46487/1",     # single-token real refs are untouched
        "206848.001",
        "CCPY26050",
        "PHA 5013",        # short ALL-CAPS principal head + sequence
        "REF 123456",
    ],
)
def test_genuine_reference_values_pass_the_fragment_guard(value):
    assert reference_candidate_is_fragment(value) is False


# --------------------------------------------------------------------------- #
# _fallback_reference end-to-end on document lines                             #
# --------------------------------------------------------------------------- #
def test_refrigerant_parts_line_mints_no_reference():
    """The RIGERANT reproduction: fuzzy 'ref' label tier + tier-4 substring cue
    both used to fire on 'REFRIGERANT ...' — now neither may mint a value."""
    doc = _doc(
        [
            "COLLISION REPAIR ESTIMATE",
            "Parts and materials required:",
            "REFRIGERANT R1234YF",
            "650g",
            "Total excluding VAT 768.00",
        ]
    )
    record = RuleEngine().extract_record(doc, {"id": "p", "name": "P", "field_rules": {}})
    assert record.fields[FieldKey.REFERENCE].value == ""


def test_money_value_after_ref_label_is_not_a_reference():
    doc = _doc(["Our Ref: £768.00", "some narrative text"])
    record = RuleEngine().extract_record(doc, {"id": "p", "name": "P", "field_rules": {}})
    assert record.fields[FieldKey.REFERENCE].value == ""


def test_genuine_labelled_reference_still_extracts():
    doc = _doc(["Our Ref: REB/46487/1", "some narrative text"])
    record = RuleEngine().extract_record(doc, {"id": "p", "name": "P", "field_rules": {}})
    assert record.fields[FieldKey.REFERENCE].value == "REB/46487/1"


def test_tier4_cue_requires_word_boundary():
    """'refrigerant' contains the substring 'ref' but is NOT a reference cue;
    a genuine cue word ('claim') still lets tier 4 fire. (The 'claim' cue is
    used because a literal ' ref ' is claimed by the fuzzy label tier first.)"""
    engine = RuleEngine()
    junk = _doc(["REFRIGERANT 12345 CHARGE"])
    assert engine._fallback_reference(list(junk.pages[0].lines)).value == ""
    genuine = _doc(["46203 - claim correspondence"])
    assert engine._fallback_reference(list(genuine.pages[0].lines)).value == "46203"


# --------------------------------------------------------------------------- #
# Document-path VRM guards (the TKT-136 scope addendum)                        #
# --------------------------------------------------------------------------- #
def test_postcode_area_headed_token_needs_tight_anchor_on_document_path():
    """TKT-071 ported: 'HD4110' near the word 'vehicle' is a provider job ref,
    not a plate — without an IMMEDIATELY preceding reg/vrm anchor it must not
    become the fallback VRM."""
    doc = _doc(["Vehicle assessed under estimate HD4110", "narrative text"])
    record = RuleEngine().extract_record(doc, {"id": "p", "name": "P", "field_rules": {}})
    assert record.fields[FieldKey.VRM].value == ""


def test_tight_anchored_postcode_area_token_still_extracts():
    doc = _doc(["registration: HD4110", "narrative text"])
    record = RuleEngine().extract_record(doc, {"id": "p", "name": "P", "field_rules": {}})
    assert record.fields[FieldKey.VRM].value == "HD4110"


def test_label_next_line_value_is_label_anchored():
    """A label-next-line layout is anchored by the label itself: a loose
    postcode-area-headed value under a 'Registration Number' label is genuine."""
    doc = _doc(["Registration Number", "HD4110"])
    record = RuleEngine().extract_record(doc, {"id": "p", "name": "P", "field_rules": {}})
    assert record.fields[FieldKey.VRM].value == "HD4110"


def test_stopword_trigram_is_rejected_without_context_on_document_path():
    """#7/F162 ported: 'Model X5 now …' spells the well-formed shape 'X5 NOW'
    but is natural-language noise when no VRM context word sits nearby."""
    doc = _doc(["The offer applies to X5 now available in stock"])
    record = RuleEngine().extract_record(doc, {"id": "p", "name": "P", "field_rules": {}})
    assert record.fields[FieldKey.VRM].value == ""


def test_stopword_trigram_with_vrm_context_still_extracts():
    text = "reg X5 NOW confirmed for inspection"
    doc = _doc([text])
    record = RuleEngine().extract_record(doc, {"id": "p", "name": "P", "field_rules": {}})
    # normalize_vrm strips the space on the way out.
    assert record.fields[FieldKey.VRM].value == "X5NOW"


def test_vrm_document_guard_helper_positions():
    text = "quoting estimate HD4110 for the vehicle"
    start = text.index("HD4110")
    assert vrm_document_candidate_is_bad("HD4110", text, start, start + 6) is True
    anchored = "registration HD4110 as advised"
    start2 = anchored.index("HD4110")
    assert vrm_document_candidate_is_bad("HD4110", anchored, start2, start2 + 6) is False
