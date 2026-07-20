"""Pytest bootstrap: put the Function root on sys.path (so box_client / blob_source / data_api_client
import as top-level modules, the way the Functions worker loads them) AND services/functions (so the
shared _authconf conformance harness, TKT-268, imports as a package)."""

from __future__ import annotations

import os
import sys

_FUNCTION_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_FUNCTIONS_DIR = os.path.dirname(_FUNCTION_ROOT)
for _path in (_FUNCTIONS_DIR, _FUNCTION_ROOT):
    if _path not in sys.path:
        sys.path.insert(0, _path)
