"""Guard: the OCR host's EVA field map MUST stay byte-identical to the parser's.

The OCR host (``ocr_pdf_adapter``) and the FC1 parser (``services/functions/parser/
parser_adapter``) both project the engine's native fields onto the settled
12-field EVA contract. When the OCR host bakes the vendored engine and OCRs an
image-only PDF, its ``extraction``/``vrm``/``reference`` envelope is meant to be
INDISTINGUISHABLE from ``POST /api/parse``'s — same 12 keys, same contract order,
same parser->EVA rename map. If the two maps drift (e.g. the parser gains a
native field the OCR host does not map), a scanned case and a text case would
silently produce different payloads for the same document.

This test fails the moment ``EVA_FIELD_ORDER`` or ``EVA_KEY_FROM_PARSER_KEY``
diverge across the two adapters, mirroring services/functions/parser/tests/
test_schema_vendored_in_sync.py (which guards the vendored JSON schema the same
way). It imports the parser adapter by file path so it needs nothing installed
beyond the two pure modules.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

# OCR host root (conftest already puts it on sys.path so this is a plain import).
import ocr_pdf_adapter

# services/functions/parser/parser_adapter.py — reached from this service's tests.
_REPO_ROOT = Path(__file__).resolve().parents[4]
_PARSER_ADAPTER_PATH = _REPO_ROOT / "services" / "functions" / "parser" / "parser_adapter.py"


def _load_parser_adapter() -> ModuleType:
    """Load services/functions/parser/parser_adapter.py as a standalone module.

    Loaded by path (not import) so this test does not depend on the parser dir
    being on sys.path, and imports nothing heavy (parser_adapter's deps are lazy).
    """
    assert _PARSER_ADAPTER_PATH.exists(), f"parser adapter missing: {_PARSER_ADAPTER_PATH}"
    spec = importlib.util.spec_from_file_location("ce_parser_adapter_under_test", _PARSER_ADAPTER_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_eva_field_order_matches_parser() -> None:
    parser = _load_parser_adapter()
    assert ocr_pdf_adapter.EVA_FIELD_ORDER == parser.EVA_FIELD_ORDER, (
        "OCR host EVA_FIELD_ORDER drifted from the parser's — the scanned-PDF and "
        "text-PDF extraction envelopes must carry the same 12 keys in the same order."
    )


def test_eva_key_from_parser_key_matches_parser() -> None:
    parser = _load_parser_adapter()
    assert ocr_pdf_adapter.EVA_KEY_FROM_PARSER_KEY == parser.EVA_KEY_FROM_PARSER_KEY, (
        "OCR host EVA_KEY_FROM_PARSER_KEY drifted from the parser's — both adapters "
        "must apply the identical parser->EVA rename map (incl. claimant_telephone / "
        "claimant_email) so a scanned case maps fields exactly like a text case."
    )


def test_both_maps_cover_all_twelve_eva_keys() -> None:
    # Belt-and-braces: the map keys are exactly the 12 EVA fields, in both adapters.
    parser = _load_parser_adapter()
    for adapter in (ocr_pdf_adapter, parser):
        assert set(adapter.EVA_KEY_FROM_PARSER_KEY) == set(adapter.EVA_FIELD_ORDER)
        assert len(adapter.EVA_FIELD_ORDER) == 12
