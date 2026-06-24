"""Pytest bootstrap: put the Function root on sys.path so tests import
function_app / location_suggest / vision_client / maps_client / photo_source /
clue_extraction as top-level modules (the same way the Azure Functions worker
loads them)."""

from __future__ import annotations

import os
import sys

_FUNCTION_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _FUNCTION_ROOT not in sys.path:
    sys.path.insert(0, _FUNCTION_ROOT)
