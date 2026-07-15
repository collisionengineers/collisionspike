"""Unit tests for clue_extraction (pure, no network)."""

from __future__ import annotations

import clue_extraction as ce


# --------------------------------------------------------------------------- #
# Postcode                                                                    #
# --------------------------------------------------------------------------- #
def test_extract_postcode_variants():
    assert ce.extract_postcode("collision at W3 7QE near the park") == "W3 7QE"
    assert ce.extract_postcode("SW1A1AA") == "SW1A 1AA"          # no-space normalised
    assert ce.extract_postcode("lower case w3 7qe") == "W3 7QE"  # upper-cased
    assert ce.extract_postcode("EC1A 1BB end") == "EC1A 1BB"


def test_extract_postcode_none_when_absent():
    assert ce.extract_postcode("no postcode here at all") is None
    assert ce.extract_postcode("") is None
    assert ce.extract_postcode(None) is None


def test_normalise_postcode_inserts_single_space():
    assert ce.normalise_postcode("w37qe") == "W3 7QE"
    assert ce.normalise_postcode("W3   7QE") == "W3 7QE"


# --------------------------------------------------------------------------- #
# Place                                                                       #
# --------------------------------------------------------------------------- #
def test_extract_place_passes_through_short_phrase_with_postcode():
    assert ce.extract_place("recovered to depot W3 7QE") == "recovered to depot W3 7QE"


def test_extract_place_short_phrase_without_postcode():
    assert ce.extract_place("Acton High Street") == "Acton High Street"


def test_extract_place_drops_long_narrative_without_postcode():
    narrative = (
        "The claimant was travelling along the road when another vehicle pulled "
        "out of a side turning without warning and collided with the offside of "
        "the claimant vehicle causing extensive damage to the wing and door"
    )
    assert ce.extract_place(narrative) is None


def test_extract_place_keeps_long_text_if_it_carries_a_postcode():
    long_with_pc = (
        "The claimant was travelling along the road near junction with the high "
        "street area when the collision happened close to W3 7QE in the borough"
    )
    # A postcode anchors the geocode even for longer text.
    assert ce.extract_place(long_with_pc) == " ".join(long_with_pc.split())


def test_extract_place_none_for_empty():
    assert ce.extract_place("") is None
    assert ce.extract_place(None) is None


# --------------------------------------------------------------------------- #
# Signage queries                                                             #
# --------------------------------------------------------------------------- #
def test_signage_queries_drops_plate_numeric_and_short_lines():
    lines = ["Smith Recovery", "AB12 CDE", "01234 567890", "to", "", "  ", "Smith Recovery"]
    qs = ce.signage_queries(lines)
    assert qs == ["Smith Recovery"]  # plate, phone, short, blank, dup all removed


def test_signage_queries_dedup_case_insensitive():
    qs = ce.signage_queries(["Acme Garage", "ACME GARAGE", "Bodyshop Ltd"])
    assert qs == ["Acme Garage", "Bodyshop Ltd"]


def test_signage_queries_caps_count():
    lines = [f"Garage Number {i}" for i in range(20)]
    qs = ce.signage_queries(lines, max_queries=4)
    assert len(qs) == 4
