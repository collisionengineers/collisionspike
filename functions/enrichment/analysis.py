"""Deprecated compatibility facade for the canonical ``vehicle_data`` package.

No estimator or cleaning rule may be implemented here. The case-workflow owner
is ``vehicle_data.mileage``; this module exists only for old offline imports and
will be removed after downstream standalone tools consume ``vehicle-data.v1``.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from vehicle_data.mileage import (
    estimate_displayed_mileage,
    legacy_estimate_adapter,
    prepare_history,
)


def vehicle_summary(vehicle: dict[str, Any]) -> dict[str, object]:
    tests = vehicle.get("motTests") if isinstance(vehicle.get("motTests"), list) else []
    return {
        "registration": vehicle.get("registration"),
        "make": vehicle.get("make"),
        "model": vehicle.get("model"),
        "year": _year(vehicle.get("registrationDate") or vehicle.get("manufactureDate") or vehicle.get("manufactureYear")),
        "colour": vehicle.get("primaryColour"),
        "fuel_type": vehicle.get("fuelType"),
        "engine_size_cc": vehicle.get("engineSize"),
        "has_outstanding_recall": vehicle.get("hasOutstandingRecall"),
        "mot_tests_count": len(tests),
    }


def _year(value: object) -> int | None:
    try:
        return int(str(value)[:4])
    except (TypeError, ValueError):
        return None


def mileage_history(vehicle: dict[str, Any]) -> list[dict[str, object]]:
    prepared = prepare_history(vehicle)
    return [
        {
            "test_date": obs.completed_date_raw,
            "mileage_value": obs.odometer_value_raw,
            "mileage_unit": obs.odometer_unit_raw,
            "test_result": obs.test_result,
        }
        for obs in prepared.observations
        if obs.normalized_miles is not None and obs.test_date is not None
    ]


def detect_mileage_anomalies(vehicle: dict[str, Any]) -> dict[str, object]:
    prepared = prepare_history(vehicle)
    anomalies = [
        {
            "type": warning.upper(),
            "date": obs.test_date.isoformat() if obs.test_date else None,
            "observation_id": obs.observation_id,
        }
        for obs in prepared.observations
        for warning in obs.warnings
    ]
    return {
        "anomalies": anomalies,
        "summary": (
            "No mileage anomalies detected."
            if not anomalies
            else f"{len(anomalies)} mileage warning(s) recorded."
        ),
    }


def current_mileage_estimate(vehicle: dict[str, Any], as_of: date | None = None) -> dict[str, object]:
    result = estimate_displayed_mileage(vehicle, target_date=as_of or date.today())
    return legacy_estimate_adapter(result)


def get_mileage_estimate(vehicle: dict[str, Any], as_of: date | None = None) -> dict[str, object]:
    return current_mileage_estimate(vehicle, as_of)


def get_vehicle_summary(vehicle: dict[str, Any]) -> dict[str, object]:
    summary = vehicle_summary(vehicle)
    history = mileage_history(vehicle)
    summary["latest_mot_mileage"] = history[-1] if history else None
    return summary
