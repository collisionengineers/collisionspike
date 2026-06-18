"""Pytest bootstrap: put the OCR-host root on sys.path so tests import
function_app / ocr_pdf_adapter / plate_adapter as top-level modules (the same
way the Azure Functions worker loads them)."""

from __future__ import annotations

import os
import sys

_HOST_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _HOST_ROOT not in sys.path:
    sys.path.insert(0, _HOST_ROOT)
