"""extract_images: evidence-filename template + decorative-raster filter.

Two concerns, both driven by live collisionspike tickets:

* NAMING (collisionspike TKT-090): extracted-image stems are
  ``<provider>_<vrm>_img_<page>_<n>`` with UNRESOLVED tokens omitted entirely --
  never a hardcoded provider default (the old ``'RJS'``) and never a literal
  ``UnknownVRM``. The cloud parser Function calls ``extract_images`` with
  ``fields={}``, so the defaults leaked into handler-facing evidence names and
  the Box archive on every extraction.

* DECORATIVE FILTER (collisionspike TKT-089): the 200x200 pixel-AREA floor
  plus the large-banner shape heuristic (extreme aspect ratio AND small short
  side). Recall guard doctrine: a false positive (a dropped vehicle photo) is
  evidence loss -- every case here proves a real photo shape is never matched.

PDF fixtures are generated with PyMuPDF; tests skip cleanly where it is absent.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from cedocumentmapper_v2.application.service import (
    DocumentMapperService,
    is_decorative_raster,
)


def _fitz_available() -> bool:
    try:
        import fitz  # noqa: F401
    except Exception:
        return False
    return True


def _service() -> DocumentMapperService:
    # app_data_dir set so the service never touches the real user config.
    return DocumentMapperService(app_data_dir=Path("nonexistent_unused"))


def _make_pdf_with_image(width: int, height: int) -> bytes:
    """A single-page PDF with one embedded raster of the given pixel size."""
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, width, height))
    pix.set_rect(pix.irect, (200, 30, 30))
    png_bytes = pix.tobytes("png")
    page.insert_image(fitz.Rect(10, 10, 10 + min(width, 200), 10 + min(height, 200)), stream=png_bytes)
    try:
        return doc.tobytes()
    finally:
        doc.close()


# --------------------------------------------------------------------------- #
# Naming template (TKT-090)                                                   #
# --------------------------------------------------------------------------- #

# (fields, expected stem of the first extracted image) -- the source-document
# prefix is prepended by the CALLER (collisionspike's extractImages activity
# builds "<source-doc-stem>__<engine filename>"), so the engine-side stem must
# stay meaningful on its own and never carry placeholder identity tokens.
_NAMING_CASES = [
    ({"work_provider": "QDOS", "vrm": "AB12CDE"}, "QDOS_AB12CDE_img_1_1"),
    ({"work_provider": "QDOS", "vrm": ""}, "QDOS_img_1_1"),
    ({"work_provider": "", "vrm": "AB12CDE"}, "AB12CDE_img_1_1"),
    ({}, "img_1_1"),
    # Whitespace-only values are unresolved too (must not reach safe_filename,
    # whose own empty-input fallback is "export").
    ({"work_provider": "   ", "vrm": " "}, "img_1_1"),
]


@pytest.mark.skipif(not _fitz_available(), reason="PyMuPDF not installed on this runner")
@pytest.mark.parametrize("fields,expected_stem", _NAMING_CASES)
def test_extracted_image_stem_omits_unresolved_tokens(tmp_path, fields, expected_stem):
    pdf_bytes = _make_pdf_with_image(640, 480)  # photo-shaped: above floor, normal aspect
    result = _service().extract_images(pdf_bytes, "instruction.pdf", fields, tmp_path)
    assert result["count"] == 1
    name = Path(result["paths"][0]).name
    assert Path(name).stem == expected_stem, name


@pytest.mark.skipif(not _fitz_available(), reason="PyMuPDF not installed on this runner")
def test_extracted_image_names_never_carry_placeholder_identity(tmp_path):
    """No 'RJS' default and no literal 'UnknownVRM' in any handler-facing name
    (TKT-090: the old template branded every unresolved case an RJS case)."""
    for fields in ({}, {"work_provider": "", "vrm": ""}):
        out = tmp_path / str(len(list(tmp_path.iterdir())))
        result = _service().extract_images(_make_pdf_with_image(640, 480), "instruction.pdf", fields, out)
        for path_str in result["paths"]:
            name = Path(path_str).name
            assert "RJS" not in name, name
            assert "UnknownVRM" not in name, name


@pytest.mark.skipif(not _fitz_available(), reason="PyMuPDF not installed on this runner")
def test_extracted_image_stems_stay_unique_per_page_and_index(tmp_path):
    """Two embedded photos in one document must land as distinct files even with
    the empty-fields stem (the img_<page>_<n> tail carries uniqueness)."""
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    for offset in (10, 220):
        pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 640, 480))
        pix.set_rect(pix.irect, (200, 30 + offset, 30))
        page.insert_image(fitz.Rect(offset, 10, offset + 200, 210), stream=pix.tobytes("png"))
    pdf_bytes = doc.tobytes()
    doc.close()

    result = _service().extract_images(pdf_bytes, "instruction.pdf", {}, tmp_path)
    names = [Path(p).name for p in result["paths"]]
    assert result["count"] == len(set(names)) == 2, names


# --------------------------------------------------------------------------- #
# Decorative filter (TKT-089): area floor + large-banner shape heuristic      #
# --------------------------------------------------------------------------- #

def test_is_decorative_raster_unit_matrix():
    # Unknown dimensions are ALWAYS kept (recall-safe).
    assert is_decorative_raster(None, None) is False
    assert is_decorative_raster(None, 4000) is False
    assert is_decorative_raster(0, 0) is False

    # Area floor (below 200x200 equivalent).
    assert is_decorative_raster(80, 40) is True
    assert is_decorative_raster(199, 199) is True
    assert is_decorative_raster(200, 200) is False  # exactly at the floor: kept

    # Large-banner shape: extreme aspect (>= 3.5:1) AND small short side (<= 240 px).
    assert is_decorative_raster(900, 180) is True  # wide letterhead banner
    assert is_decorative_raster(600, 150) is True  # email-signature-sized banner
    assert is_decorative_raster(150, 800) is True  # tall sidebar strip
    assert is_decorative_raster(840, 240) is True  # both boundaries inclusive

    # Recall guard: real photo shapes NEVER match.
    assert is_decorative_raster(1600, 1200) is False  # 4:3 camera photo
    assert is_decorative_raster(4032, 3024) is False  # 12MP phone photo
    assert is_decorative_raster(1920, 1080) is False  # 16:9
    assert is_decorative_raster(3000, 1000) is False  # 3:1 pano crop: aspect below 3.5
    assert is_decorative_raster(845, 241) is False  # extreme aspect but short side too big
    assert is_decorative_raster(4000, 1000) is False  # 4:1 but short side 1000 -- a real pano


@pytest.mark.skipif(not _fitz_available(), reason="PyMuPDF not installed on this runner")
@pytest.mark.parametrize(
    "width,height",
    [
        (900, 180),  # wide banner logo (above the area floor -- the TKT-089 gap)
        (150, 800),  # tall narrow sidebar strip
        (80, 40),    # classic letterhead logo (under the area floor)
    ],
)
def test_decorative_shapes_are_suppressed(tmp_path, width, height):
    result = _service().extract_images(
        _make_pdf_with_image(width, height), "LtrtoEngineerIn.pdf", {}, tmp_path
    )
    assert result["count"] == 0, f"{width}x{height} must be filtered, not stored as evidence"


@pytest.mark.skipif(not _fitz_available(), reason="PyMuPDF not installed on this runner")
@pytest.mark.parametrize("width,height", [(1600, 1200), (4032, 3024)])
def test_real_photo_sizes_are_kept(tmp_path, width, height):
    result = _service().extract_images(
        _make_pdf_with_image(width, height), "photos.pdf", {}, tmp_path
    )
    assert result["count"] == 1, f"a genuine {width}x{height} photo must never be dropped"


# --------------------------------------------------------------------------- #
# Real Tractable summary PDF (collisionspike TKT-102)                          #
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(not _fitz_available(), reason="PyMuPDF not installed on this runner")
def test_tractable_submitted_vehicle_images_are_extracted(tmp_path):
    """The real Tractable damage-capture summary PDF ('TRACTABLE 01.pdf', the
    tests/fixtures corpus copy of the TKT-102 evidence sample): its final
    'Submitted Vehicle Images' page carries 7 genuine 800x600 photos plus a
    70x65 'Powered by' logo, and pages 1-2 carry two more 70x65 logos. All
    three logos fall to the 200x200 area floor; every photo is kept.

    HONEST LIMIT, pinned as-is: the 1016x565 CE letterhead graphic on page 1
    is KEPT — its 1.8:1 aspect is a normal photo shape, so the TKT-089 banner
    heuristic deliberately does not match it (recall guard: no real-photo
    shape may ever be dropped). Distinguishing it by raster CONTENT is
    collisionspike TKT-047, out of scope here.
    """
    pdf = Path(__file__).parent / "fixtures" / "instructions" / "TRACTABLE 01.pdf"
    result = _service().extract_images(pdf, pdf.name, fields={}, out_dir=tmp_path)
    names = sorted(Path(p).name for p in result["paths"])
    assert result["count"] == 8, names
    page3 = [n for n in names if n.startswith("img_3_")]
    assert len(page3) == 7, names        # the Submitted Vehicle Images photos
    assert all(n.endswith(".jpeg") for n in page3), names
    assert names.count("img_1_1.png") == 1  # the kept letterhead graphic (see above)
