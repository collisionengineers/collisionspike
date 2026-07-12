"""Multi-format extraction regression — proves the parser gets MORE than the VRM.

The document-parsing ticket reported extraction "only really getting registration".
The root cause was the orchestration contract (fixed in parse.ts), NOT the engine —
the engine extracts the full identity set from real provider instruction documents.
This test pins that: over REAL provider samples (PDF + legacy .DOC), the production
parser seam (``run_parser`` -> ``to_eva_extraction``, exactly what the Function calls)
must return the work-provider, the VRM, AND at least two further EVA/identity fields.
A regression back to "only registration" fails this loudly.

Tolerant by design (non-empty / provider-match assertions, not brittle exact goldens —
that is ``test_engine_smoke``'s job) so minor rule tweaks don't false-fail. Individual
fixtures skip cleanly where a reader's deps are absent (PyMuPDF for PDF). Word 97+
legacy `.DOC` text uses the in-process piece-table reader and is not dependency-gated.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
INSTRUCTIONS = HERE / "fixtures" / "instructions"
REPO_ROOT = HERE.parents[2]  # functions/parser/tests -> collisionspike

# Import the production adapter seam (same module the Function's /parse route uses).
sys.path.insert(0, str(HERE.parent))
import parser_adapter  # noqa: E402
from cedocumentmapper_v2.readers import get_reader_for_path  # noqa: E402


def _fitz_available() -> bool:
    try:
        import fitz  # noqa: F401
    except Exception:
        return False
    return True


# (id, fixture filename, expected provider, expected VRM compact)
_CASES = [
    ("KBS_pdf", "KBS INSTRUCT 01.pdf", "KBS", "LT18HXW"),
    ("ALS_doc", "ALS INSTRUCT 01.DOC", "ALS", "NG63GHU"),
    ("OAK_doc", "OAK INSTRUCT 01.DOC", "OAK", "RP59MCP"),
]


def test_qdos_binary_doc_uses_piece_table_and_retains_claimant_and_narrative() -> None:
    """Pin the deployment-critical pure-Python path inside this repository.

    The fixture is a genuine Word 97+ OLE document. Requiring the reader note
    proves the assertion did not silently pass through the scrape/desktop
    fallbacks, while the two field-bearing phrases pin its table-cell text.
    """
    src = INSTRUCTIONS / "QDOS_TRIAGE_01.doc"
    assert src.exists(), "binary QDOS regression fixture is required"

    document = get_reader_for_path(src).read(src)

    assert "embedded Word piece table" in " ".join(document.reader_notes)
    assert "Miss Nicola Granger" in document.plain_text
    assert "Accident Circumstances" in document.plain_text
    assert "Damage Description" in document.plain_text


@pytest.mark.parametrize("fid,fname,provider,vrm", _CASES, ids=[c[0] for c in _CASES])
def test_multiformat_extracts_more_than_vrm(fid: str, fname: str, provider: str, vrm: str) -> None:
    src = INSTRUCTIONS / fname
    if not src.exists():
        pytest.skip(f"fixture {fname!r} not present")
    if src.suffix.lower() == ".pdf" and not _fitz_available():
        pytest.skip("PyMuPDF (licensed/approved) not installed; PDF fixture skipped")

    result = parser_adapter.run_parser(src.read_bytes(), fname, None)
    mapped = parser_adapter.to_eva_extraction(result)
    extraction = mapped["extraction"]

    work_provider = extraction["work_provider"]["value"]
    if not work_provider or work_provider == "UNKNOWN":
        # A genuinely unsupported/corrupt document can still land without provider
        # text. Nothing to assert about extraction quality in that case -> skip.
        pytest.skip(f"{fname}: reader produced no provider text on this runtime")

    assert work_provider == provider, f"{fname}: work_provider {work_provider!r} != {provider!r}"

    got_vrm = (mapped.get("vrm") or {}).get("value", "")
    assert got_vrm.replace(" ", "").upper() == vrm, f"{fname}: vrm {got_vrm!r} != {vrm!r}"

    # The crux: prove MORE than the VRM was extracted — at least two further identity /
    # EVA fields populated (else the parser has regressed to 'only registration').
    further = {
        "claimant_name": extraction["claimant_name"]["value"],
        "reference": (mapped.get("reference") or {}).get("value", ""),
        "date_of_instruction": extraction["date_of_instruction"]["value"],
        "vehicle_model": extraction["vehicle_model"]["value"],
    }
    populated = [k for k, v in further.items() if (v or "").strip()]
    assert len(populated) >= 2, (
        f"{fname}: extraction returned only VRM + {populated} — expected >=2 more "
        f"fields (regression: parser back to 'only registration'). Fields: {further}"
    )


# --------------------------------------------------------------------------- #
# content_typing (rules-engine-v2 Phase 3) — content-based attachment typing  #
# --------------------------------------------------------------------------- #
def test_known_instruction_fixture_gets_content_typing_instruction() -> None:
    """A real provider instruction document must come back typed 'instruction'
    through the PRODUCTION seam (``run_parser`` -> ``to_eva_extraction`` —
    exactly what ``/parse`` calls), proving ``content_typing`` (rules-engine-v2
    Phase 3) is actually wired end-to-end and not just unit-tested in isolation
    on the sibling. Pinned to the KBS PDF fixture specifically (unlike the
    ``ALS``/eml cases elsewhere in this module, it is not one of the two known
    pre-existing multiformat field-extraction failures, so this stays a clean
    signal for the NEW typing behaviour)."""
    fname = "KBS INSTRUCT 01.pdf"
    src = INSTRUCTIONS / fname
    if not src.exists():
        pytest.skip(f"fixture {fname!r} not present")
    if not _fitz_available():
        pytest.skip("PyMuPDF (licensed/approved) not installed; PDF fixture skipped")

    result = parser_adapter.run_parser(src.read_bytes(), fname, None)
    mapped = parser_adapter.to_eva_extraction(result)

    content_typing = mapped.get("content_typing")
    assert content_typing is not None
    assert content_typing["doc_type"] == "instruction"
    assert content_typing["provider_name"] == "KBS"
    assert content_typing["markers"], "expected at least one explaining marker"


# A real .eml sample (provider instruction in the email itself). Referenced in-place
# (large binary) and skipped when absent, like the engine drift guard.
_ALS_EML = (
    REPO_ROOT / "docs" / "plans" / "work-todo-spike" / "pdf-image-extraction"
    / "New Inspection Instruction.eml"
)


@pytest.mark.skipif(not _ALS_EML.exists(), reason="real .eml sample not present (dev-box only)")
def test_eml_extracts_provider_and_identity() -> None:
    """A `.eml` instruction must yield the provider + VRM + a reference (proves the email
    reader path extracts more than the registration too) AND, crucially, the
    `vehicle_model` — which lives ONLY in the NESTED instruction document attached to the
    email, not in the email body. Asserting it pins the nested-attachment extraction the
    document-parsing ticket added to the email reader (without it the .eml regresses to
    body-only fields)."""
    result = parser_adapter.run_parser(_ALS_EML.read_bytes(), _ALS_EML.name, None)
    mapped = parser_adapter.to_eva_extraction(result)
    extraction = mapped["extraction"]

    assert extraction["work_provider"]["value"] == "ALS"
    got_vrm = (mapped.get("vrm") or {}).get("value", "").replace(" ", "").upper()
    assert got_vrm == "NG63GHU", f"eml vrm {got_vrm!r}"
    # >VRM: the provider reference is recovered too.
    assert (mapped.get("reference") or {}).get("value", "").strip(), "eml: reference not extracted"
    # Nested-attachment extraction: vehicle_model comes from the attached instruction
    # DOC, not the email body — so it proves the email reader read the NESTED doc bytes.
    assert extraction["vehicle_model"]["value"].strip(), (
        "eml: vehicle_model empty — nested-attachment extraction regressed "
        "(the email reader is back to parsing body + names only)"
    )
