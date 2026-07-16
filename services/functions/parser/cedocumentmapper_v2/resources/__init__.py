"""Bundled package resources (JSON schemas) and a loader for them."""

from __future__ import annotations

import json
from importlib.resources import files
from typing import Any


def load_schema(name: str) -> dict[str, Any]:
    """Load a bundled JSON schema resource by file name.

    Reads the resource shipped inside ``cedocumentmapper_v2.resources`` via
    ``importlib.resources`` so it works whether the package is run from source
    or from a frozen (PyInstaller) bundle.

    Raises:
        FileNotFoundError: if the named resource does not exist in the package.
    """
    resource = files("cedocumentmapper_v2.resources").joinpath(name)
    if not resource.is_file():
        raise FileNotFoundError(
            f"Bundled schema resource not found: {name!r} "
            f"(expected in package 'cedocumentmapper_v2.resources')."
        )
    text = resource.read_text(encoding="utf-8")
    return json.loads(text)
