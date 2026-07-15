"""Estimate displayed odometer mileage from a prepared MOT history.

The public functions and data types remain importable from this module. History
normalization lives in :mod:`vehicle_data.mileage_history` so estimation and
evidence preparation can evolve independently.
"""

from __future__ import annotations

import math
import statistics
from datetime import date
from typing import Any, Iterable

from .contracts import ALGORITHM_VERSION, CalibrationProfile, CohortPrior
from .mileage_history import (
    DAYS_PER_YEAR,
    DEFAULT_FORECAST_HORIZON_DAYS,
    FULL_QUALITY_MAX_DAYS,
    HALF_QUALITY_MAX_DAYS,
    KM_TO_MILES,
    MAX_ANNUAL_RATE,
    MIN_RATE_INTERVAL_DAYS,
    RETEST_WINDOW_DAYS,
    Event,
    Interval,
    Observation,
    PreparedHistory,
    _parse_date,
    _relative_mad,
    prepare_history,
)

def _weighted_median(values: Iterable[tuple[float, float]]) -> float | None:
    ordered = sorted(
        (value, weight)
        for value, weight in values
        if weight > 0 and math.isfinite(value)
    )
    if not ordered:
        return None
    total = sum(weight for _, weight in ordered)
    cursor = 0.0
    for value, weight in ordered:
        cursor += weight
        if cursor >= total / 2:
            return value
    return ordered[-1][0]


def _round_hundred(value: float) -> int:
    return max(0, int(round(value / 100.0) * 100))


def _bounded_integer(
    value: float,
    *,
    hard_low: float | None = None,
    hard_high: float | None = None,
) -> int:
    """Round a point for presentation without crossing observed hard bounds."""

    rounded = _round_hundred(value)
    if hard_low is not None:
        rounded = max(rounded, max(0, math.ceil(hard_low)))
    if hard_high is not None:
        rounded = min(rounded, max(0, math.floor(hard_high)))
    return rounded


def _warnings(
    history: PreparedHistory, extra: Iterable[str] = ()
) -> list[dict[str, str]]:
    messages = {
        "unknown_odometer_unit": "At least one MOT reading used an unknown odometer unit.",
        "odometer_unit_switch_normalised": "MOT readings changed unit; recognised miles and kilometres were normalised.",
        "odometer_unit_contradiction": "The recorded unit change produces a contradictory odometer history.",
        "isolated_keying_spike": "An isolated high MOT reading was excluded as a likely keying error.",
        "isolated_keying_dip": "An isolated low MOT reading was excluded as a likely keying error.",
        "odometer_segment_started": "A persistent lower reading started a new displayed-odometer segment.",
        "unresolved_odometer_reset": "The latest odometer decrease is not corroborated by a later reading.",
        "short_interval_excluded": "An interval under 90 days was kept as evidence but excluded from annual usage.",
        "extreme_annual_rate_excluded": "An interval over 100,000 annualised miles was excluded from the rate.",
        "historical_gap_context_only": "An interval over 900 days was retained as history but not used for the rate.",
        "retest_reading_conflict": "Readings within one fail/retest episode conflict.",
        "small_negative_change": "A small negative change was not used as evidence of annual usage.",
        "zero_movement_interval": "A zero-movement interval was retained as possible low use or storage.",
        "uncalibrated_range": "No eligible chronological calibration bucket covers this prediction; only a non-probabilistic range is returned.",
        "forecast_horizon_exceeded": "The target is beyond the validated forecast horizon.",
        "cohort_prior_unavailable": "No defensible similar-vehicle prior was supplied.",
        "cohort_prior_used": "A versioned similar-vehicle prior was blended with sparse vehicle history.",
        "registration_anchor_unavailable": "A dated new-at-registration anchor is unavailable, so a pre-first-MOT estimate is unsafe.",
        "pre_registration_use_detected": "The vehicle was recorded as first used before registration, so a zero-mile registration anchor is unsafe.",
        "displayed_segment_only": "The result describes the current displayed-odometer segment, not unknowable lifetime mileage.",
        "autofill_calibration_required": "The estimate needs checking before it can be entered on the case.",
    }
    codes = list(dict.fromkeys([*history.warning_codes, *extra]))
    return [
        {
            "code": code,
            "severity": "blocking"
            if code
            in {
                "unknown_odometer_unit",
                "odometer_unit_contradiction",
                "unresolved_odometer_reset",
                "forecast_horizon_exceeded",
                "registration_anchor_unavailable",
                "pre_registration_use_detected",
            }
            else "warning",
            "message": messages.get(code, code.replace("_", " ").capitalize() + "."),
        }
        for code in codes
    ]


def _base_result(target_date: date, history: PreparedHistory) -> dict[str, object]:
    return {
        "status": "insufficient",
        "method": "none",
        "odometer_meaning": "displayed_odometer",
        "target_date": target_date.isoformat(),
        "algorithm_version": ALGORITHM_VERSION,
        "auto_fill_eligible": False,
        "estimated_mileage": None,
        "observed_mileage": None,
        "annual_rate_miles": None,
        "prediction_interval": None,
        "range": None,
        "prior": None,
        "warnings": _warnings(history),
        "evidence": {
            "observations": [obs.to_contract() for obs in history.observations],
            "intervals": [interval.to_contract() for interval in history.intervals],
            "anomaly_class": history.anomaly_class,
        },
    }


def _apply_interval(
    result: dict[str, object],
    *,
    estimate: float,
    method: str,
    horizon_days: int,
    clean_intervals: int,
    history: PreparedHistory,
    calibration: CalibrationProfile | None,
    allow_estimate_autofill: bool,
    hard_low: float | None = None,
    hard_high: float | None = None,
    fallback_spread: float = 0,
) -> None:
    rounded = _bounded_integer(
        estimate,
        hard_low=hard_low,
        hard_high=hard_high,
    )
    result["estimated_mileage"] = rounded
    bucket = (
        calibration.select(
            method=method,
            horizon_days=max(0, horizon_days),
            clean_intervals=clean_intervals,
            anomaly_class=history.anomaly_class,
        )
        if calibration
        else None
    )
    if bucket:
        assert calibration is not None
        low = estimate + bucket.error_q_low
        high = estimate + bucket.error_q_high
        if hard_low is not None:
            low = max(low, hard_low)
        if hard_high is not None:
            high = min(high, hard_high)
        rounded_low = _bounded_integer(low, hard_low=hard_low, hard_high=hard_high)
        rounded_high = _bounded_integer(high, hard_low=hard_low, hard_high=hard_high)
        if low <= high and rounded_low <= rounded_high:
            result["status"] = "estimated"
            result["calibration_profile"] = calibration.to_contract()
            result["prediction_interval"] = {
                "coverage": calibration.target_coverage,
                "lower_mileage": rounded_low,
                "upper_mileage": rounded_high,
                "calibration_version": calibration.version,
                "dataset_digest": calibration.dataset_digest,
                "sample_size": bucket.sample_size,
            }
            result["auto_fill_eligible"] = bool(
                allow_estimate_autofill and calibration.autofill_ready
            )
            if not result["auto_fill_eligible"]:
                existing_codes = [
                    warning.get("code")
                    for warning in result.get("warnings", [])
                    if isinstance(warning, dict) and isinstance(warning.get("code"), str)
                ]
                result["warnings"] = _warnings(
                    history, [*existing_codes, "autofill_calibration_required"]
                )
            return

    # No eligible bucket, or its calibrated residual interval has no overlap
    # with the hard logical bounds. Never relabel a synthetic fallback as a
    # calibrated probability interval.
    low = hard_low if hard_low is not None else max(0.0, estimate - fallback_spread)
    high = hard_high if hard_high is not None else estimate + fallback_spread
    # A point estimate remains useful without a calibrated probability profile.
    # Keep it explicitly estimated, publish only the wider non-probabilistic
    # range, and attach the uncalibrated warning. It remains visible to staff,
    # but cannot become a default case-field write.
    result["status"] = "estimated"
    rounded_low = (
        max(0, math.ceil(hard_low))
        if hard_low is not None and hard_high is not None
        else _bounded_integer(low, hard_low=hard_low, hard_high=hard_high)
    )
    rounded_high = (
        max(0, math.floor(hard_high))
        if hard_low is not None and hard_high is not None
        else _bounded_integer(high, hard_low=hard_low, hard_high=hard_high)
    )
    result["range"] = {
        "lower_mileage": rounded_low,
        "upper_mileage": rounded_high,
        "basis": "logical_bounds"
        if hard_low is not None and hard_high is not None
        else "rate_dispersion_not_calibrated",
    }
    existing_codes = [
        warning.get("code")
        for warning in result.get("warnings", [])
        if isinstance(warning, dict) and isinstance(warning.get("code"), str)
    ]
    result["warnings"] = _warnings(
        history,
        [*existing_codes, "uncalibrated_range", "autofill_calibration_required"],
    )


def estimate_displayed_mileage(
    vehicle: dict[str, Any],
    *,
    target_date: date,
    cohort_prior: CohortPrior | None = None,
    calibration: CalibrationProfile | None = None,
    forecast_horizon_days: int = DEFAULT_FORECAST_HORIZON_DAYS,
    allow_estimate_autofill: bool = False,
) -> dict[str, object]:
    history = prepare_history(vehicle)
    result = _base_result(target_date, history)
    if not history.events:
        result["reason"] = "No readable MOT odometer observations are available."
        return result
    # Exact observation: return the exact normalised reading, never rounded.
    exact = next((event for event in history.events if event.date == target_date), None)
    if exact:
        result.update(
            {
                "status": "observed",
                "method": "observed_mot",
                "observed_mileage": int(round(exact.miles)),
                "estimated_mileage": int(round(exact.miles)),
                "range": {
                    "lower_mileage": int(round(exact.miles)),
                    "upper_mileage": int(round(exact.miles)),
                    "basis": "observed_mot",
                },
                "reason": None,
                "auto_fill_eligible": True,
            }
        )
        return result

    # An exact target-date observation is authoritative even when a separate,
    # unrelated row has an unknown unit. Forecasting/interpolation must still
    # abstain across that ambiguity.
    if history.unresolved_unit:
        result["reason"] = "The odometer unit history is contradictory."
        result["warnings"] = _warnings(history, ["odometer_unit_contradiction"])
        return result

    # Bounded interpolation uses two trusted, monotonic observations. The
    # <90-day and >900-day rules govern annual-rate estimation only: they must
    # not discard the hard information that the odometer lay between two
    # observed endpoints on an intervening date.
    for interval in history.intervals:
        left, right = interval.left, interval.right
        if left.date < target_date < right.date and left.segment == right.segment:
            if interval.delta_miles < 0:
                result["reason"] = (
                    "The surrounding MOT interval is not trustworthy enough for interpolation."
                )
                return result
            elapsed = (target_date - left.date).days
            total = (right.date - left.date).days
            estimate = left.miles + (right.miles - left.miles) * elapsed / total
            assert interval.annual_rate is not None
            result["method"] = "bounded_interpolation"
            result["annual_rate_miles"] = round(
                interval.annual_rate
            )
            _apply_interval(
                result,
                estimate=estimate,
                method="bounded_interpolation",
                horizon_days=min(elapsed, total - elapsed),
                clean_intervals=1 if interval.included else 0,
                history=history,
                calibration=calibration,
                allow_estimate_autofill=allow_estimate_autofill,
                hard_low=left.miles,
                hard_high=right.miles,
            )
            return result

    first = history.events[0]
    latest = history.events[-1]
    if target_date < first.date:
        registration_date = _parse_date(vehicle.get("registrationDate"))
        first_used_date = _parse_date(vehicle.get("firstUsedDate"))
        # DVSA defines firstUsedDate as first use in GB, NI or abroad. A
        # near-zero registration anchor is verified only when both official
        # dates exist and agree; a difference means pre-registration use or an
        # otherwise ambiguous/imported history.
        new_at_registration = (
            registration_date is not None
            and first_used_date is not None
            and first_used_date == registration_date
        )
        previously_used_before_registration = (
            registration_date is not None
            and first_used_date is not None
            and first_used_date < registration_date
        )
        registration_anchor = registration_date if new_at_registration else None
        if (
            not cohort_prior
            or not cohort_prior.defensible
            or registration_anchor is None
            or target_date < registration_anchor
            or previously_used_before_registration
        ):
            result["reason"] = (
                "A pre-first-MOT estimate is not defensible without a new-at-registration anchor and a dated, versioned cohort prior."
            )
            if previously_used_before_registration:
                extra = ["pre_registration_use_detected"]
            elif registration_anchor is None:
                extra = ["registration_anchor_unavailable"]
            else:
                extra = ["cohort_prior_unavailable"]
            result["warnings"] = _warnings(history, extra)
            return result
        age_to_first = max(1, (first.date - registration_anchor).days)
        first_life_rate = first.miles * DAYS_PER_YEAR / age_to_first
        # The observed first MOT and verified zero-mile registration anchor are
        # hard endpoints. Interpolate between them so the curve is exactly zero
        # at registration and exactly the observed reading at the first MOT;
        # the cohort contributes uncertainty, never an endpoint-breaking point.
        elapsed_from_registration = (target_date - registration_anchor).days
        estimate = first.miles * elapsed_from_registration / age_to_first
        result["method"] = "cohort_assisted_backcast"
        result["annual_rate_miles"] = round(first_life_rate)
        result["prior"] = cohort_prior.to_contract()
        result["warnings"] = _warnings(history, ["cohort_prior_used"])
        spread = (
            cohort_prior.annual_sigma_miles
            * (first.date - target_date).days
            / DAYS_PER_YEAR
        )
        _apply_interval(
            result,
            estimate=estimate,
            method="cohort_assisted_backcast",
            horizon_days=(first.date - target_date).days,
            clean_intervals=0,
            history=history,
            calibration=calibration,
            allow_estimate_autofill=allow_estimate_autofill,
            fallback_spread=max(1000.0, spread),
            hard_low=0,
            hard_high=first.miles,
        )
        return result

    if target_date < latest.date:
        result["reason"] = (
            "The target falls across an unresolved odometer segment boundary."
        )
        result["warnings"] = _warnings(history, ["displayed_segment_only"])
        return result

    horizon_days = (target_date - latest.date).days
    if history.unresolved_reset:
        result["reason"] = (
            "The latest odometer decrease is unresolved; only the observed displayed segment is defensible."
        )
        result["method"] = "displayed_segment_only"
        result["warnings"] = _warnings(
            history, ["displayed_segment_only", "unresolved_odometer_reset"]
        )
        return result
    validated_horizon = min(
        forecast_horizon_days,
        (
            calibration.validated_horizon_days
            if calibration and calibration.defensible
            else forecast_horizon_days
        ),
    )
    if horizon_days > validated_horizon:
        result["reason"] = (
            "The last trusted MOT reading is beyond the validated forecast horizon."
        )
        result["warnings"] = _warnings(history, ["forecast_horizon_exceeded"])
        return result

    current_segment = latest.segment
    usable = [
        interval
        for interval in history.intervals
        if interval.included
        and interval.right.segment == current_segment
        and interval.weight > 0
    ]
    vehicle_rate = _weighted_median(
        (interval.annual_rate or 0.0, interval.weight) for interval in usable
    )
    clean_count = len(usable)
    prior_used = False
    if vehicle_rate is None:
        if not cohort_prior or not cohort_prior.defensible:
            result["reason"] = (
                "No trustworthy annual interval or defensible similar-vehicle prior is available."
            )
            result["warnings"] = _warnings(history, ["cohort_prior_unavailable"])
            return result
        rate = cohort_prior.annual_rate_miles
        prior_used = True
    elif cohort_prior and cohort_prior.defensible:
        weight = 0.70 if clean_count == 1 else 0.85 if clean_count == 2 else 0.95
        volatility = _relative_mad(interval.annual_rate for interval in usable)
        if volatility > 0.5:
            weight *= 0.75
        # Penalise a vehicle-specific rate when its newest *usable* endpoint is
        # stale. Interval duration is not staleness: a clean one-year interval
        # ending at the latest MOT is current, while an earlier clean interval
        # followed by an excluded observation is not.
        newest_age_days = (latest.date - usable[-1].right.date).days if usable else 0
        if newest_age_days > FULL_QUALITY_MAX_DAYS:
            weight *= 0.8
        rate = weight * vehicle_rate + (1 - weight) * cohort_prior.annual_rate_miles
        prior_used = True
    else:
        rate = vehicle_rate

    estimate = latest.miles + rate * horizon_days / DAYS_PER_YEAR
    result["method"] = (
        "cohort_assisted_forecast" if prior_used else "recent_rate_forecast"
    )
    result["annual_rate_miles"] = round(rate)
    if prior_used and cohort_prior:
        result["prior"] = cohort_prior.to_contract()
        result["warnings"] = _warnings(history, ["cohort_prior_used"])
    rates = [interval.annual_rate or 0.0 for interval in usable]
    if len(rates) >= 2:
        med = statistics.median(rates)
        rate_sigma = max(
            1500.0, 1.4826 * statistics.median(abs(value - med) for value in rates)
        )
    elif cohort_prior and cohort_prior.defensible:
        rate_sigma = max(4000.0, cohort_prior.annual_sigma_miles)
    else:
        rate_sigma = 4000.0
    spread = max(500.0, rate_sigma * horizon_days / DAYS_PER_YEAR)
    _apply_interval(
        result,
        estimate=estimate,
        method=str(result["method"]),
        horizon_days=horizon_days,
        clean_intervals=clean_count,
        history=history,
        calibration=calibration,
        allow_estimate_autofill=allow_estimate_autofill,
        fallback_spread=spread,
        hard_low=latest.miles,
    )
    return result
