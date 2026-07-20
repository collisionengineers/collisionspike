"""Pytest bootstrap: put the Function root on sys.path so tests import
function_app / location_suggest / vision_client / maps_client / photo_source /
clue_extraction as top-level modules (the same way the Azure Functions worker
loads them)."""

from __future__ import annotations

import os
import sys

_FUNCTION_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_FUNCTIONS_DIR = os.path.dirname(_FUNCTION_ROOT)  # services/functions — for the shared _authconf harness (TKT-268)
for _path in (_FUNCTIONS_DIR, _FUNCTION_ROOT):
    if _path not in sys.path:
        sys.path.insert(0, _path)
