"""Chronological holdout evaluation and conformal-profile construction."""

from __future__ import annotations

import hashlib
import json
import math
import statistics
from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable

from .contracts import CalibrationBucket, CalibrationProfile, CohortPrior
from .mileage import estimate_displayed_mileage


@dataclass(frozen=True, slots=True)
class HoldoutRecord:
    vehicle_id: str
    target_date: str
    horizon_days: int
    vehicle_type: str
    age_band: str
    clean_interval_count: int
    volatility_band: str
    anomaly_class: str
    method: str
    estimate: int
    actual: int
    error: int
    range_low: int | None
    range_high: int | None


def _as_date(value: object) -> date:
    return date.fromisoformat(str(value).split("T", 1)[0].split(" ", 1)[0])


def _actual_miles(
    vehicle: dict[str, Any], test: dict[str, Any], target: date
) -> int | None:
    """Normalise the hidden outcome through the same canonical cleaner.

    This keeps real backtests from silently accepting units, values, or reading
    statuses that production would reject.
    """

    observed = estimate_displayed_mileage(
        {**vehicle, "motTests": [test]},
        target_date=target,
    )
    value = observed.get("observed_mileage")
    return (
        int(value)
        if observed.get("status") == "observed" and isinstance(value, int)
        else None
    )


def _age_band(vehicle: dict[str, Any], target: date) -> str:
    raw = vehicle.get("registrationDate") or vehicle.get("firstUsedDate")
    if not raw:
        return "unknown"
    years = max(0, (target - _as_date(raw)).days // 365)
    if years < 4:
        return "0-3"
    if years < 8:
        return "4-7"
    if years < 13:
        return "8-12"
    return "13+"


def _volatility_band(intervals: object) -> str:
    rates = (
        [
            float(item["annual_rate_miles"])
            for item in intervals
            if isinstance(item, dict)
            and item.get("included") is True
            and isinstance(item.get("annual_rate_miles"), (int, float))
        ]
        if isinstance(intervals, list)
        else []
    )
    if len(rates) < 2:
        return "sparse"
    median = statistics.median(rates)
    if median == 0:
        relative_mad = 0.0 if all(rate == 0 for rate in rates) else math.inf
    else:
        relative_mad = statistics.median(abs(rate - median) for rate in rates) / abs(
            median
        )
    if relative_mad <= 0.15:
        return "stable"
    if relative_mad <= 0.5:
        return "variable"
    return "volatile"


def chronological_holdouts(
    vehicles: Iterable[dict[str, Any]],
    *,
    cohort_prior: CohortPrior | None = None,
    useful_tolerance_miles: int = 2500,
) -> dict[str, object]:
    """Hide each observation in turn and predict it from strictly earlier data."""

    records: list[HoldoutRecord] = []
    source_rows = list(vehicles)
    for vehicle_index, vehicle in enumerate(source_rows):
        tests = [test for test in vehicle.get("motTests", []) if isinstance(test, dict)]
        tests.sort(key=lambda item: str(item.get("completedDate", "")))
        vehicle_id = str(
            vehicle.get("vehicleId") or vehicle.get("registration") or vehicle_index
        )
        # At least two earlier readings are required before a chronological forecast.
        for holdout_index in range(2, len(tests)):
            holdout = tests[holdout_index]
            if str(holdout.get("odometerResultType", "")).upper() not in {"READ", "OK"}:
                continue
            try:
                target = _as_date(holdout["completedDate"])
            except (KeyError, ValueError):
                continue
            training = {**vehicle, "motTests": tests[:holdout_index]}
            result = estimate_displayed_mileage(
                training,
                target_date=target,
                cohort_prior=cohort_prior,
                calibration=None,
            )
            estimate = result.get("estimated_mileage")
            if not isinstance(estimate, int):
                continue
            evidence = (
                result.get("evidence")
                if isinstance(result.get("evidence"), dict)
                else {}
            )
            intervals = evidence.get("intervals") if isinstance(evidence, dict) else []
            clean_count = sum(
                1
                for item in intervals
                if isinstance(item, dict) and item.get("included") is True
            )
            range_block = (
                result.get("range") if isinstance(result.get("range"), dict) else {}
            )
            selected_dates = [
                _as_date(item["test_date"])
                for item in evidence.get("observations", [])
                if isinstance(item, dict)
                and item.get("selected_for_event") is True
                and item.get("test_date")
            ]
            if not selected_dates:
                continue
            latest_date = max(selected_dates)
            actual = _actual_miles(vehicle, holdout, target)
            if actual is None:
                continue
            records.append(
                HoldoutRecord(
                    vehicle_id=vehicle_id,
                    target_date=target.isoformat(),
                    horizon_days=(target - latest_date).days,
                    vehicle_type=str(vehicle.get("vehicleType", "unknown")),
                    age_band=_age_band(vehicle, target),
                    clean_interval_count=clean_count,
                    volatility_band=_volatility_band(intervals),
                    anomaly_class=str(evidence.get("anomaly_class", "unknown")),
                    method=str(result.get("method", "none")),
                    estimate=estimate,
                    actual=actual,
                    error=actual - estimate,
                    range_low=(
                        int(range_block["lower_mileage"])
                        if "lower_mileage" in range_block
                        else None
                    ),
                    range_high=(
                        int(range_block["upper_mileage"])
                        if "upper_mileage" in range_block
                        else None
                    ),
                )
            )

    serialised = [
        record.__dict__
        if hasattr(record, "__dict__")
        else {field: getattr(record, field) for field in record.__dataclass_fields__}
        for record in records
    ]
    digest = hashlib.sha256(
        json.dumps(
            source_rows, sort_keys=True, separators=(",", ":"), default=str
        ).encode("utf-8")
    ).hexdigest()
    return {
        "dataset_digest": digest,
        "records": serialised,
        "overall": _metrics(records, useful_tolerance_miles),
        "by_horizon": _group_metrics(
            records, lambda r: _horizon_band(r.horizon_days), useful_tolerance_miles
        ),
        "by_vehicle_type": _group_metrics(
            records, lambda r: r.vehicle_type, useful_tolerance_miles
        ),
        "by_age_band": _group_metrics(
            records, lambda r: r.age_band, useful_tolerance_miles
        ),
        "by_clean_interval_count": _group_metrics(
            records,
            lambda r: str(min(r.clean_interval_count, 3)),
            useful_tolerance_miles,
        ),
        "by_volatility": _group_metrics(
            records, lambda r: r.volatility_band, useful_tolerance_miles
        ),
        "by_anomaly_class": _group_metrics(
            records, lambda r: r.anomaly_class, useful_tolerance_miles
        ),
    }


def _horizon_band(days: int) -> str:
    if days <= 183:
        return "0-6m"
    if days <= 366:
        return "6-12m"
    if days <= 730:
        return "12-24m"
    return "24m+"


def _metrics(
    records: Iterable[HoldoutRecord], useful_tolerance_miles: int
) -> dict[str, object]:
    rows = list(records)
    if not rows:
        return {
            "count": 0,
            "mae": None,
            "median_absolute_error": None,
            "range_coverage": None,
            "useful_tolerance_coverage": None,
        }
    absolute = [abs(row.error) for row in rows]
    ranged = [
        row for row in rows if row.range_low is not None and row.range_high is not None
    ]
    return {
        "count": len(rows),
        "mae": round(sum(absolute) / len(absolute), 3),
        "median_absolute_error": round(statistics.median(absolute), 3),
        "range_coverage": (
            round(
                sum(row.range_low <= row.actual <= row.range_high for row in ranged)
                / len(ranged),
                6,
            )
            if ranged
            else None
        ),
        "useful_tolerance_coverage": round(
            sum(error <= useful_tolerance_miles for error in absolute) / len(absolute),
            6,
        ),
    }


def _group_metrics(
    records: Iterable[HoldoutRecord],
    key,
    useful_tolerance_miles: int,
) -> dict[str, object]:
    grouped: dict[str, list[HoldoutRecord]] = {}
    for row in records:
        grouped.setdefault(str(key(row)), []).append(row)
    return {
        name: _metrics(rows, useful_tolerance_miles)
        for name, rows in sorted(grouped.items())
    }


def _quantile(values: list[int], q: float) -> float:
    if not values:
        raise ValueError("cannot take a quantile of no values")
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    fraction = position - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


def calibration_profile_from_holdouts(
    report: dict[str, object],
    *,
    version: str,
    target_coverage: float = 0.9,
    useful_tolerance_miles: int = 2500,
    validated_horizon_days: int = 730,
    minimum_bucket_size: int = 30,
) -> CalibrationProfile:
    """Build reproducible residual buckets from chronological predictions."""

    raw_records = report.get("records")
    if not isinstance(raw_records, list):
        raise ValueError("holdout report has no records")
    groups: dict[tuple[str, int, int, str], list[int]] = {}
    for item in raw_records:
        if not isinstance(item, dict):
            continue
        horizon = int(item["horizon_days"])
        if horizon > validated_horizon_days:
            continue
        max_horizon = (
            183 if horizon <= 183 else 366 if horizon <= 366 else validated_horizon_days
        )
        clean_count = min(int(item.get("clean_interval_count", 0)), 3)
        key = (
            str(item["method"]),
            max_horizon,
            clean_count,
            str(item.get("anomaly_class", "*")),
        )
        groups.setdefault(key, []).append(int(item["error"]))
    alpha = (1 - target_coverage) / 2
    buckets = tuple(
        CalibrationBucket(
            method=key[0],
            max_horizon_days=key[1],
            min_clean_intervals=key[2],
            anomaly_class=key[3],
            error_q_low=_quantile(errors, alpha),
            error_q_high=_quantile(errors, 1 - alpha),
            sample_size=len(errors),
        )
        for key, errors in sorted(groups.items())
    )
    return CalibrationProfile(
        version=version,
        dataset_digest=str(report.get("dataset_digest", "")),
        target_coverage=target_coverage,
        useful_tolerance_miles=useful_tolerance_miles,
        validated_horizon_days=validated_horizon_days,
        buckets=buckets,
        minimum_bucket_size=minimum_bucket_size,
    )
