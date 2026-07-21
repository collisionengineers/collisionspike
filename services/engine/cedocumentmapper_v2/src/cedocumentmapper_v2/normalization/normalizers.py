from __future__ import annotations

import re
from datetime import datetime
from cedocumentmapper_v2.domain.models import FieldKey, ExtractionIssue


def normalize_vrm(value: str) -> str:
    """Normalize extracted VRMs by removing all whitespace and uppercasing."""
    compact = re.sub(r"\s+", "", (value or "").strip()).upper()
    extra_digit_match = re.fullmatch(r"([A-Z]{2})1(\d{2}[A-Z]{3})", compact)
    if extra_digit_match:
        return f"{extra_digit_match.group(1)}{extra_digit_match.group(2)}"
    return compact


# Bare form-placeholder tokens a labelled VIN cell can carry instead of a value.
# Grounded on the Tractable damage-capture PDFs (collisionspike TKT-147): a
# sample without a captured VIN prints a lone "-" in the Vehicle Information
# row. None of these is a plausible complete VIN/chassis number, so blanking
# them can never lose a real value.
_VIN_PLACEHOLDER_TOKENS = frozenset({"-", "–", "—", "N/A", "NA", "NONE"})


def normalize_vin(value: str) -> str:
    """Normalize a VIN / chassis number: strip whitespace, uppercase.

    A bare placeholder token ("-", "N/A" — the Tractable empty-cell convention)
    normalizes to EMPTY: a VIN the document does not carry is ABSENT, never an
    error and never a junk value (collisionspike TKT-147). No length/character
    validation beyond that — modern VINs are 17 chars but older vehicles carry
    shorter chassis numbers, and the field is label-driven per layout (there is
    no document-wide fallback sniff to over-collect junk in the first place).
    """
    compact = re.sub(r"\s+", "", (value or "").strip()).upper()
    if compact in _VIN_PLACEHOLDER_TOKENS:
        return ""
    return compact


def normalize_mileage(value: str) -> str:
    """Extract a mileage number from the text.
    
    Collects digits and commas, and stops at the first non-digit/non-comma.
    """
    raw = (value or "").strip()
    if not raw:
        return ""

    digits = []
    started = False
    for ch in raw:
        if ch.isdigit():
            digits.append(ch)
            started = True
            continue
        if started:
            if ch == ",":
                continue
            break
    return "".join(digits)


def normalize_date(value: str) -> str:
    """Convert a date string into DD/MM/YYYY form."""
    raw = (value or "").strip()
    if not raw:
        return ""

    cleaned = re.sub(r"(\d+)\s*(st|nd|rd|th)\b", r"\1", raw, flags=re.IGNORECASE)
    cleaned = re.sub(r"^[^\dA-Za-z]+", "", cleaned)
    cleaned = re.sub(r"(\d{1,2}/\d{2})(\d{4})\b", r"\1/\2", cleaned)
    cleaned = cleaned.replace(",", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    # A leading day-of-week word is calendar decoration, not date content —
    # "Mon Jul 06 2026" (the Tractable PDF's ctime-style "Accident Date:",
    # collisionspike TKT-102) must parse exactly like "Jul 06 2026". Weekday
    # words only: month words ("May 06 2026") are untouched.
    cleaned = re.sub(
        r"^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday"
        r"|mon|tues?|wed|thur?s?|fri|sat|sun)[,.]?\s+",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    formats = [
        "%d/%m/%Y",
        "%d/%m/%y",
        "%d-%m-%Y",
        "%d-%m-%y",
        "%d-%b-%Y",
        "%d-%b-%y",
        "%d-%B-%Y",
        "%d-%B-%y",
        "%d %B %Y",
        "%d %b %Y",
        "%B %d %Y",
        "%b %d %Y",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.strftime("%d/%m/%Y")
        except ValueError:
            continue
    return raw


def normalize_vat_status(value: str) -> str:
    """Normalize VAT status to Yes/No/blank."""
    lowered = (value or "").strip().lower()
    if not lowered:
        return ""
    if lowered in {"yes", "y", "true", "1"}:
        return "Yes"
    if lowered in {"no", "n", "false", "0"}:
        return "No"
    return value.strip()


def normalize_mileage_unit(value: str) -> str:
    """Normalize mileage unit to Miles/Km/blank."""
    lowered = (value or "").strip().lower()
    if not lowered:
        return ""
    if "mile" in lowered or "mi" in lowered or lowered == "m":
        return "Miles"
    if "km" in lowered or "kilometer" in lowered or "kilometre" in lowered:
        return "Km"
    return value.strip()


# A pragmatic UK telephone matcher for instruction-document text. Accepts the
# common WRITTEN forms — 0xxxx xxxxxx landline/mobile, +44 / 0044 international,
# optional (0) after the country code, and spaces/dots/hyphens/parentheses as
# separators — without swallowing dates or references. After stripping
# separators a UK number is 10-11 digits with a leading 0, or +44 followed by
# 9-10 national digits. We DELIBERATELY do not try to be a full libphonenumber.
TELEPHONE_RE = re.compile(
    r"""
    (?<![\w.])                         # not mid-word / mid-number
    (
        (?:\+44\s?|0044\s?)\(?0?\)?[\s.\-]?\d(?:[\s.\-]?\d){8,9}  # +44 / 0044 forms
        |
        \(?0\d{1,4}\)?[\s.\-]?\d(?:[\s.\-]?\d){5,8}              # national 0xxxx form
    )
    (?![\w])
    """,
    re.VERBOSE,
)

# Standard, conservative email matcher. Anchored on word boundaries so it does
# not consume surrounding punctuation; the local part allows the usual RFC-ish
# atom characters and the domain requires at least one dot.
EMAIL_RE = re.compile(
    r"(?<![\w.+\-])([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})(?![\w@\-])"
)


def normalize_telephone(value: str) -> str:
    """Normalise an extracted UK telephone string.

    Returns a tidy form: a single leading ``+44`` (preserved when present) or a
    leading ``0``, followed by the national digits with all separators removed.
    Anything that does not contain a plausible UK number (10-11 national digits)
    returns ``""`` so the field stays empty rather than holding junk.
    """
    raw = (value or "").strip()
    if not raw:
        return ""

    match = TELEPHONE_RE.search(raw)
    candidate = match.group(1) if match else raw

    stripped = candidate.lstrip()
    international = stripped.startswith("+44") or stripped.startswith("0044")
    digits = re.sub(r"\D", "", candidate)

    if international:
        # Drop the 0044 / 44 country code, then any trunk 0 written as +44 (0)...
        if digits.startswith("0044"):
            digits = digits[4:]
        elif digits.startswith("44"):
            digits = digits[2:]
        digits = digits.lstrip("0")
        if not (9 <= len(digits) <= 10):
            return ""
        return "+44" + digits

    # National form: must be a leading-zero number of 10 or 11 digits total.
    if not digits.startswith("0"):
        return ""
    if not (10 <= len(digits) <= 11):
        return ""
    return digits


def normalize_email(value: str) -> str:
    """Normalise an extracted email address: trim, lowercase, strip punctuation.

    Returns ``""`` when no well-formed address is present, so the field is left
    empty for staff to complete rather than holding a partial token.
    """
    raw = (value or "").strip()
    if not raw:
        return ""
    match = EMAIL_RE.search(raw)
    if not match:
        return ""
    return match.group(1).strip().strip(".,;:").lower()


def normalize_address(value: str, force_postcode: bool = False) -> str:
    """Normalise the inspection address to a 6-line canonical form."""
    text = (value or "").strip()
    if not text:
        return "\n".join([""] * 6)

    def _canonicalise_postcode(postcode_text: str) -> str:
        compact = re.sub(r"\s+", "", (postcode_text or "").upper())
        if len(compact) < 5:
            return ""
        return f"{compact[:-3]} {compact[-3:]}"

    postcode_anywhere_re = re.compile(
        r"\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[ABD-HJLNP-UW-Z]{2})\b", re.IGNORECASE
    )
    postcode_end_re = re.compile(
        r"\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[ABD-HJLNP-UW-Z]{2})\b\s*$", re.IGNORECASE
    )

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\bRH[I|l\\]{1,2}\s+GAG\b", "RH11 6AG", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*,\s*", "\n", text)
    raw_lines = [part.strip() for part in text.splitlines() if part.strip()]
    if not raw_lines:
        return "\n".join([""] * 6)

    if len(raw_lines) >= 2:
        outward = raw_lines[-2].strip().upper()
        inward = raw_lines[-1].strip().upper()
        if re.fullmatch(r"[A-Z]{1,2}\d[A-Z\d]?", outward) and re.fullmatch(r"\d[ABD-HJLNP-UW-Z]{2}", inward):
            raw_lines = raw_lines[:-2] + [f"{outward} {inward}"]

    postcode_line = ""
    body_lines = []

    if len(raw_lines) == 1:
        single_line = raw_lines[0]
        if force_postcode:
            end_match = postcode_end_re.search(single_line)
            if end_match:
                postcode_line = _canonicalise_postcode(end_match.group(1))
                remainder = single_line[:end_match.start()].strip(" ,")
                body_lines = [remainder] if remainder else []
            else:
                anywhere_match = postcode_anywhere_re.search(single_line)
                if anywhere_match:
                    postcode_line = _canonicalise_postcode(anywhere_match.group(1))
                    pre = single_line[:anywhere_match.start()].strip(" ,")
                    body_lines = [pre] if pre else []
                else:
                    body_lines = raw_lines[:]
        else:
            body_lines = raw_lines[:]
    else:
        last_line = raw_lines[-1]
        any_match = postcode_anywhere_re.search(last_line)
        if any_match:
            postcode_line = _canonicalise_postcode(any_match.group(1))
            body_lines = raw_lines[:-1]
        else:
            postcode_line = last_line
            body_lines = raw_lines[:-1]

    if len(body_lines) >= 5:
        line1 = body_lines[0]
        line2 = body_lines[1] if len(body_lines) > 1 else ""
        line3 = body_lines[2] if len(body_lines) > 2 else ""
        line4 = body_lines[3] if len(body_lines) > 3 else ""
        overflow = [part for part in body_lines[4:] if part]
        line5 = " ".join(overflow)
        normalized = [line1, line2, line3, line4, line5, postcode_line]
    else:
        body_lines = body_lines[:5]
        normalized = body_lines + [""] * (5 - len(body_lines)) + [postcode_line]

    normalized = [part.strip() for part in normalized[:6]]
    while len(normalized) < 6:
        normalized.append("")
    return "\n".join(normalized)


def validate_fields(fields: dict[FieldKey, str]) -> list[ExtractionIssue]:
    """Validate all field values, generating warnings and errors."""
    issues = []

    # 1. Required Fields Check
    required_keys = {
        FieldKey.WORK_PROVIDER,
        FieldKey.VRM,
        FieldKey.VEHICLE_MODEL,
        FieldKey.CLAIMANT_NAME,
        FieldKey.REFERENCE,
        FieldKey.INCIDENT_DATE,
        FieldKey.INSTRUCTION_DATE,
    }
    for req_key in required_keys:
        val = fields.get(req_key, "").strip()
        if not val:
            issues.append(
                ExtractionIssue(
                    field=req_key,
                    severity="error",
                    code="missing_required_field",
                    message=f"Required field '{req_key.value}' is empty.",
                )
            )

    # 2. Date Format Check
    date_keys = {FieldKey.INCIDENT_DATE, FieldKey.INSTRUCTION_DATE, FieldKey.INSPECTION_DATE}
    for date_key in date_keys:
        val = fields.get(date_key, "").strip()
        if val:
            # Must be DD/MM/YYYY
            try:
                datetime.strptime(val, "%d/%m/%Y")
            except ValueError:
                issues.append(
                    ExtractionIssue(
                        field=date_key,
                        severity="warning",
                        code="invalid_date_format",
                        message=f"Date '{val}' is not in DD/MM/YYYY format.",
                    )
                )

    # 3. VRM Check (UK format check)
    vrm = fields.get(FieldKey.VRM, "").strip()
    if vrm:
        vrm_clean = normalize_vrm(vrm)
        # Check standard UK format or standard lengths (2-7 alphanumeric characters)
        if not re.match(r"^[A-Z0-9]{2,8}$", vrm_clean):
            issues.append(
                ExtractionIssue(
                    field=FieldKey.VRM,
                    severity="warning",
                    code="invalid_vrm",
                    message=f"VRM '{vrm}' does not look like a valid registration mark.",
                )
            )

    # 4. Mileage Check
    mileage = fields.get(FieldKey.MILEAGE, "").strip()
    if mileage and not mileage.isdigit():
        issues.append(
            ExtractionIssue(
                field=FieldKey.MILEAGE,
                severity="warning",
                code="invalid_mileage",
                message=f"Mileage '{mileage}' must contain digits only.",
            )
        )

    # 5. VAT Status Check
    vat = fields.get(FieldKey.VAT_STATUS, "").strip()
    if vat and vat not in {"Yes", "No"}:
        issues.append(
            ExtractionIssue(
                field=FieldKey.VAT_STATUS,
                severity="warning",
                code="invalid_vat",
                message=f"VAT Status '{vat}' should be 'Yes' or 'No'.",
            )
        )

    # 6. Mileage Unit Check
    unit = fields.get(FieldKey.MILEAGE_UNIT, "").strip()
    if unit and unit not in {"Miles", "Km"}:
        issues.append(
            ExtractionIssue(
                field=FieldKey.MILEAGE_UNIT,
                severity="warning",
                code="invalid_mileage_unit",
                message=f"Mileage Unit '{unit}' should be 'Miles' or 'Km'.",
            )
        )

    return issues
