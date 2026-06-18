"""Pure MOT-history analysis — ported from collisionplugin ``analysis.ts``.

[BUILD] — no I/O, no Azure, no network. Deterministic and unit-testable. This is
the M1 subset the enrichment wrapper needs:

* ``vehicle_summary``         — make/model/year/colour/fuel from a DVSA vehicle.
* ``mot_status``              — latest test validity (for ``get_vehicle_summary``).
* ``mileage_history``         — readable odometer readings, oldest→newest.
* ``detect_mileage_anomalies``— clocking / implausible-increase detection.
* ``current_mileage_estimate``— the projected-from-MOT mileage algorithm.

Fidelity note
-------------
This is a faithful line-by-line port of the TypeScript original. The heavier
valuation / clone-risk / DVLA cross-check helpers (``buildVehicleValuationFacts``,
``exportCloneRisk`` etc.) are deliberately NOT ported — M1 only needs the two
tools above. The mileage-estimate thresholds (200 mi/day implausibility gate,
30-day minimum gap, 100-mile rounding, 0.75/1.25 uncertainty band, the
HIGH/MEDIUM/LOW/VERY_LOW confidence ladder) are reproduced exactly.

The DVSA MOT History API vehicle shape (the JSON ``GET
/v1/trade/vehicles/registration/{reg}`` returns) is mirrored by the field names
read here: ``make``, ``model``, ``registrationDate``, ``manufactureDate``,
``manufactureYear``, ``fuelType``, ``primaryColour``, ``engineSize``,
``hasOutstandingRecall``, ``motTestDueDate`` and a ``motTests[]`` list whose
items carry ``completedDate``, ``testResult``, ``expiryDate``, ``odometerValue``,
``odometerUnit``, ``odometerResultType``.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timezone
from typing import Any

# Confidence band labels, matching the EVA mileage_confidence enum.
Confidence = str  # "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW"

_MS_PER_DAY = 86_400_000  # kept for parity with the TS day arithmetic
_DAYS_PER_YEAR = 365.25
_IMPLAUSIBLE_RATE_PER_DAY = 200.0  # miles/day gate (== detectMileageAnomalies)
_MIN_GAP_DAYS = 30  # below this gap an implausible rate is not flagged

_BASE_CAVEATS = [
    "Estimate for assessment purposes only — not a substitute for a physical "
    "odometer inspection.",
    "Derived from MOT odometer readings: mileage accrued between MOT dates and "
    "since the last test is extrapolated, not measured.",
    "Assumes broadly consistent use; SORN periods, off-road use, or a change of "
    "keeper are not detectable from MOT data.",
]


# --------------------------------------------------------------------------
# Small parsing helpers (mirror the TS internals)
# --------------------------------------------------------------------------

def _parse_date(s: Any) -> date | None:
    """Parse an ISO-ish date string to a ``date`` (date part only).

    Mirrors ``new Date(s.split("T")[0])`` — tolerant of a trailing time.
    """
    if not isinstance(s, str) or not s:
        return None
    head = s.split("T", 1)[0]
    try:
        return datetime.strptime(head, "%Y-%m-%d").date()
    except ValueError:
        # Fall back to a fuller ISO parse (e.g. "2020-01-02 00:00:00").
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
        except ValueError:
            return None


def _parse_year(s: Any) -> int | None:
    if not isinstance(s, str) or len(s) < 4:
        return None
    try:
        return int(s[:4])
    except ValueError:
        return None


def _to_miles(value: float, unit: Any) -> float:
    """KM→miles when the unit says KM; otherwise pass through (already miles)."""
    if isinstance(unit, str) and unit.upper() == "KM":
        return value * 0.621371
    return value


def _days_between(a: date, b: date) -> int:
    return abs((b - a).days)


def _to_float(value: Any) -> float | None:
    """``parseFloat`` semantics: leading numeric prefix; NaN→None."""
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        # Emulate JS parseFloat tolerance for a leading numeric run.
        i, seen_dot = 0, False
        if i < len(s) and s[i] in "+-":
            i += 1
        start = i
        while i < len(s) and (s[i].isdigit() or (s[i] == "." and not seen_dot)):
            if s[i] == ".":
                seen_dot = True
            i += 1
        prefix = s[:i] if i > start else ""
        try:
            return float(prefix)
        except ValueError:
            return None


def _mot_tests(v: dict) -> list[dict] | None:
    """Return the motTests list, or ``None`` when the key is absent.

    The distinction matters: ``None`` means "no MOT yet" (a real DVSA signal),
    whereas an empty list means "MOT'd but no readable readings".
    """
    tests = v.get("motTests")
    if isinstance(tests, list):
        return tests
    return None


# --------------------------------------------------------------------------
# vehicleSummary / motStatus  (feed get_vehicle_summary)
# --------------------------------------------------------------------------

def vehicle_summary(v: dict) -> dict:
    year = (
        _parse_year(v.get("registrationDate"))
        or _parse_year(v.get("manufactureDate"))
        or _parse_year(v.get("manufactureYear"))
    )
    tests = _mot_tests(v)
    base: dict[str, Any] = {
        "registration": v.get("registration"),
        "make": v.get("make"),
        "model": v.get("model"),
        "year": year,
        "colour": v.get("primaryColour"),
        "fuel_type": v.get("fuelType"),
        "engine_size_cc": v.get("engineSize"),
        "has_outstanding_recall": v.get("hasOutstandingRecall"),
        "mot_tests_count": len(tests) if tests is not None else 0,
    }
    if tests is None:
        base["mot_test_due_date"] = v.get("motTestDueDate")
    return base


def mot_status(v: dict) -> dict:
    tests = _mot_tests(v)
    if tests is None:
        return {
            "valid": False,
            "reason": "Vehicle has not yet had an MOT",
            "mot_test_due_date": v.get("motTestDueDate"),
        }
    sorted_tests = sorted(
        tests, key=lambda t: t.get("completedDate") or "", reverse=True
    )
    if not sorted_tests:
        return {
            "valid": False,
            "expiry_date": None,
            "days_remaining": None,
            "last_test_date": None,
            "last_test_result": None,
        }
    latest = sorted_tests[0]
    expiry = _parse_date(latest.get("expiryDate"))
    today = date.today()
    valid = latest.get("testResult") == "PASSED" and expiry is not None and expiry > today
    days_remaining = (expiry - today).days if expiry is not None else None
    return {
        "valid": valid,
        "expiry_date": latest.get("expiryDate"),
        "days_remaining": days_remaining,
        "last_test_date": latest.get("completedDate"),
        "last_test_result": latest.get("testResult"),
    }


def mileage_history(v: dict) -> list[dict]:
    tests = _mot_tests(v)
    if tests is None:
        return []
    readable = [
        t
        for t in tests
        if t.get("odometerResultType") == "READ"
        and t.get("odometerValue")
        and t.get("completedDate")
    ]
    readable.sort(key=lambda t: t.get("completedDate") or "")
    return [
        {
            "test_date": t.get("completedDate"),
            "mileage_value": t.get("odometerValue"),
            "mileage_unit": t.get("odometerUnit"),
            "test_result": t.get("testResult"),
        }
        for t in readable
    ]


# --------------------------------------------------------------------------
# detectMileageAnomalies
# --------------------------------------------------------------------------

def detect_mileage_anomalies(v: dict) -> dict:
    tests = _mot_tests(v)
    if tests is None:
        return {"anomalies": [], "summary": "No mileage anomalies detected."}

    readable = [
        t
        for t in tests
        if t.get("odometerResultType") == "READ"
        and t.get("odometerValue")
        and t.get("completedDate")
    ]
    readable.sort(key=lambda t: t.get("completedDate") or "")

    anomalies: list[dict] = []
    prev: dict | None = None

    for test in readable:
        if prev is None:
            prev = test
            continue

        prev_d = _parse_date(prev.get("completedDate"))
        curr_d = _parse_date(test.get("completedDate"))
        gaps = _days_between(prev_d, curr_d) if prev_d and curr_d else 0

        prev_raw = _to_float(prev.get("odometerValue"))
        curr_raw = _to_float(test.get("odometerValue"))
        if prev_raw is None or curr_raw is None:
            prev = test
            continue

        prev_unit = prev.get("odometerUnit")
        curr_unit = test.get("odometerUnit")
        if (
            prev_unit
            and curr_unit
            and str(prev_unit).upper() != str(curr_unit).upper()
        ):
            anomalies.append(
                {
                    "type": "UNIT_FLIP",
                    "date": test.get("completedDate"),
                    "prior_mileage": f"{prev_raw} {prev_unit}",
                    "current_mileage": f"{curr_raw} {curr_unit}",
                    "gap_days": gaps,
                    "suspicion_reason": (
                        f"Odometer unit changed from {prev_unit} to {curr_unit}."
                    ),
                }
            )

        prev_mi = _to_miles(prev_raw, prev_unit)
        curr_mi = _to_miles(curr_raw, curr_unit)

        if curr_mi < prev_mi:
            anomalies.append(
                {
                    "type": "DECREASE",
                    "date": test.get("completedDate"),
                    "prior_mileage": f"{prev_raw} {prev_unit}",
                    "current_mileage": f"{curr_raw} {curr_unit}",
                    "gap_days": gaps,
                    "suspicion_reason": (
                        f"Mileage decreased from {prev_mi:.0f} mi to "
                        f"{curr_mi:.0f} mi."
                    ),
                }
            )
        elif gaps > _MIN_GAP_DAYS:
            rate = (curr_mi - prev_mi) / max(1, gaps)
            if rate > _IMPLAUSIBLE_RATE_PER_DAY:
                anomalies.append(
                    {
                        "type": "IMPLAUSIBLE_INCREASE",
                        "date": test.get("completedDate"),
                        "prior_mileage": f"{prev_raw} {prev_unit}",
                        "current_mileage": f"{curr_raw} {curr_unit}",
                        "gap_days": gaps,
                        "suspicion_reason": (
                            f"Daily average of {rate:.0f} miles/day over {gaps} "
                            "days exceeds plausible threshold."
                        ),
                    }
                )
        prev = test

    if not anomalies:
        return {"anomalies": [], "summary": "No mileage anomalies detected."}
    counts: dict[str, int] = {}
    for a in anomalies:
        counts[a["type"]] = counts.get(a["type"], 0) + 1
    parts = [f"{n}x {t}" for t, n in counts.items()]
    return {
        "anomalies": anomalies,
        "summary": f"{len(anomalies)} anomaly(s) detected: {', '.join(parts)}.",
    }


# --------------------------------------------------------------------------
# currentMileageEstimate — the load-bearing algorithm
# --------------------------------------------------------------------------

def current_mileage_estimate(v: dict, as_of: date | None = None) -> dict:
    """Estimate current mileage from MOT odometer history.

    Faithful port of ``currentMileageEstimate``. ``as_of`` is injectable for
    tests (defaults to today, in UTC, to match the original's ``new Date()``).
    """
    if as_of is None:
        as_of = datetime.now(timezone.utc).date()

    anomalies = detect_mileage_anomalies(v)["anomalies"]
    base_caveats = list(_BASE_CAVEATS)

    tests = _mot_tests(v) or []
    all_readings: list[dict] = []
    for t in tests:
        if (
            t.get("odometerResultType") == "READ"
            and t.get("odometerValue")
            and t.get("completedDate")
        ):
            d = _parse_date(t.get("completedDate"))
            raw = _to_float(t.get("odometerValue"))
            if d is not None and raw is not None:
                all_readings.append({"date": d, "miles": _to_miles(raw, t.get("odometerUnit"))})
    all_readings.sort(key=lambda r: r["date"])

    readings = [r for r in all_readings if r["date"] <= as_of]
    future_excluded = len(all_readings) - len(readings)

    if len(readings) == 0:
        return {
            "estimate_available": False,
            "reason": (
                "No readable MOT odometer history was available on or before the "
                "requested assessment date."
            ),
            "confidence": "VERY_LOW",
            "caveats": base_caveats,
            "anomalies_considered": anomalies,
        }

    last = readings[-1]
    days_since_last = _days_between(last["date"], as_of)
    last_known = round(last["miles"])
    last_date = last["date"].isoformat()

    # Single reading: cannot annualise.
    if len(readings) < 2:
        return {
            "estimate_available": True,
            "estimated_mileage": last_known,
            "estimate_low": last_known,
            "estimate_high": last_known,
            "annual_rate_used": None,
            "basis": {
                "readings_used": 1,
                "last_known_mileage": last_known,
                "last_known_date": last_date,
                "days_since_last_reading": days_since_last,
            },
            "confidence": "VERY_LOW",
            "caveats": base_caveats
            + [
                "Only one odometer reading is available, so no annual rate could "
                "be computed; the figure is the last recorded reading."
            ],
            "anomalies_considered": anomalies,
        }

    # Consecutive intervals; mark each "clean" (no decrease, not implausible).
    intervals: list[dict] = []
    for i in range(1, len(readings)):
        prev = readings[i - 1]
        r = readings[i]
        days = max(1, _days_between(prev["date"], r["date"]))
        delta = r["miles"] - prev["miles"]
        rate_per_day = delta / days
        clean = delta >= 0 and not (days > _MIN_GAP_DAYS and rate_per_day > _IMPLAUSIBLE_RATE_PER_DAY)
        intervals.append({"days": days, "delta": delta, "rate_per_day": rate_per_day, "clean": clean})

    # Prefer the most recent up-to-2 clean intervals (≈ last 3 readings).
    recent = intervals[-2:]
    used_recent_window = len(recent) > 0 and all(iv["clean"] for iv in recent)
    chosen = recent if used_recent_window else [iv for iv in intervals if iv["clean"]]

    if len(chosen) == 0:
        return {
            "estimate_available": True,
            "estimated_mileage": last_known,
            "estimate_low": last_known,
            "estimate_high": last_known,
            "annual_rate_used": None,
            "basis": {
                "readings_used": len(readings),
                "last_known_mileage": last_known,
                "last_known_date": last_date,
                "days_since_last_reading": days_since_last,
            },
            "confidence": "VERY_LOW",
            "caveats": base_caveats
            + [
                "All available mileage intervals contain anomalies (e.g. "
                "clocking), so no reliable annual rate could be computed; the "
                "figure is the last recorded reading."
            ],
            "anomalies_considered": anomalies,
        }

    total_miles = sum(iv["delta"] for iv in chosen)
    total_days = sum(iv["days"] for iv in chosen)
    annual_rate = round((total_miles / total_days) * _DAYS_PER_YEAR)

    projected = annual_rate * (days_since_last / _DAYS_PER_YEAR)
    estimate = round((last_known + projected) / 100) * 100
    # Uncertainty band on the projected portion only — never below last_known.
    low = round((last_known + projected * 0.75) / 100) * 100
    high = round((last_known + projected * 1.25) / 100) * 100

    years_since_last = days_since_last / _DAYS_PER_YEAR
    if years_since_last > 5:
        confidence = "VERY_LOW"
    elif (
        used_recent_window
        and len(readings) >= 3
        and len(anomalies) == 0
        and years_since_last <= 1
    ):
        confidence = "HIGH"
    elif years_since_last > 2 or not used_recent_window:
        confidence = "LOW"
    else:
        confidence = "MEDIUM"

    caveats = list(base_caveats)
    if future_excluded > 0:
        caveats.append(
            f"{future_excluded} MOT reading(s) after the assessment date were "
            "excluded; the estimate only uses evidence available on or before "
            "that date."
        )
    if not used_recent_window:
        caveats.append(
            "The most recent interval was anomalous; the rate is based on older "
            "clean intervals and is less representative of current use."
        )
    if years_since_last > 2:
        caveats.append(
            f"The last MOT reading is {years_since_last:.1f} years old; "
            "projection uncertainty grows the longer since the last test."
        )
    if len(anomalies) > 0:
        caveats.append(
            "Mileage anomalies were detected in this vehicle's history (see "
            "anomalies_considered) — treat the estimate with corresponding "
            "caution."
        )

    return {
        "estimate_available": True,
        "estimated_mileage": estimate,
        "estimate_low": low,
        "estimate_high": high,
        "annual_rate_used": annual_rate,
        "basis": {
            "readings_used": (len(recent) + 1) if used_recent_window else len(readings),
            "rate_basis": "recent_window" if used_recent_window else "all_clean_intervals",
            "last_known_mileage": last_known,
            "last_known_date": last_date,
            "days_since_last_reading": days_since_last,
        },
        "confidence": confidence,
        "caveats": caveats,
        "anomalies_considered": anomalies,
    }


# --------------------------------------------------------------------------
# Tool-shaped outputs (match the old gateway structuredContent contract so the
# function_app cleaning layer is unchanged).
# --------------------------------------------------------------------------

def get_vehicle_summary(v: dict) -> dict:
    """Shape mirrors the old ``get_vehicle_summary`` structuredContent.

    The function_app reads ``make`` / ``model`` off this; the rest is advisory
    context the caller may surface but does not require.
    """
    summary = vehicle_summary(v)
    summary["mot_status"] = mot_status(v)
    history = mileage_history(v)
    summary["latest_mot_mileage"] = history[-1] if history else None
    return summary


def get_mileage_estimate(v: dict, as_of: date | None = None) -> dict:
    """Shape mirrors the old ``current_mileage_estimate`` structuredContent.

    The function_app reads ``estimate_available`` / ``estimated_mileage`` /
    ``confidence`` off this — unchanged field names, so the mileage-cleaning
    layer ports across without edits.
    """
    return current_mileage_estimate(v, as_of)
