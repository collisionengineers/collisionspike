"""The sole provider-boundary registration canonicaliser."""

from __future__ import annotations

import re

_NON_ALNUM = re.compile(r"[^A-Z0-9]")


def canonicalize_registration(value: object) -> str:
    """Upper-case and remove every non-alphanumeric separator.

    This mirrors the case-domain comparison form while remaining authoritative
    at the external provider boundary. The service validates length separately
    so malformed input is classified without spending provider quota.
    """

    if not isinstance(value, str):
        return ""
    return _NON_ALNUM.sub("", value.upper())


def is_plausible_registration(value: str) -> bool:
    """Cheap syntax guard, intentionally not a GB-format rejector.

    NI, cherished and older marks vary substantially. We therefore reject only
    obviously unsafe/empty tokens and leave authoritative existence to DVSA/DVLA.
    """

    return 2 <= len(value) <= 10 and value.isalnum() and any(c.isalpha() for c in value)
