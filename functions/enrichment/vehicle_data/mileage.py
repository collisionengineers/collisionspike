"""Auditable displayed-odometer estimation from immutable MOT observations.

The cleaner is deliberately conservative. It never rewrites provider values:
every raw MOT row is returned with the decisions made about it. Estimation uses
only consolidated, trusted events within one odometer segment.
"""

from __future__ import annotations

import hashlib
import math
import statistics
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable

from .contracts import ALGORITHM_VERSION, CalibrationProfile, CohortPrior

KM_TO_MILES = Decimal("0.621371192237334")
DAYS_PER_YEAR = 365.25
MIN_RATE_INTERVAL_DAYS = 90
FULL_QUALITY_MAX_DAYS = 550
HALF_QUALITY_MAX_DAYS = 900
MAX_ANNUAL_RATE = 100_000.0
DEFAULT_FORECAST_HORIZON_DAYS = 730
RETEST_WINDOW_DAYS = 30


@dataclass(slots=True)
class Observation:
    observation_id: str
    raw_index: int
    source: str
    mot_test_number: str | None
    test_date: date | None
    completed_date_raw: str | None
    test_result: str | None
    odometer_value_raw: str | None
    odometer_unit_raw: str | None
    odometer_result_type_raw: str | None
    registration_at_test: str | None
    stable_vehicle_identity: str | None
    normalized_miles: float | None
    decisions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    episode: int | None = None
    segment: int | None = None
    selected_for_event: bool = False
    included_for_rate: bool = False

    @property
    def usable(self) -> bool:
        return self.test_date is not None and self.normalized_miles is not None

    def to_contract(self) -> dict[str, object]:
        return {
            "observation_id": self.observation_id,
            "raw_index": self.raw_index,
            "source": self.source,
            "mot_test_number": self.mot_test_number,
            "test_date": self.test_date.isoformat() if self.test_date else None,
            "completed_date_raw": self.completed_date_raw,
            "test_result": self.test_result,
            "odometer_value_raw": self.odometer_value_raw,
            "odometer_unit_raw": self.odometer_unit_raw,
            "odometer_result_type_raw": self.odometer_result_type_raw,
            "registration_at_test": self.registration_at_test,
            "stable_vehicle_identity": self.stable_vehicle_identity,
            "normalized_miles": (
                round(self.normalized_miles, 3)
                if self.normalized_miles is not None
                else None
            ),
            "episode": self.episode,
            "segment": self.segment,
            "selected_for_event": self.selected_for_event,
            "included_for_rate": self.included_for_rate,
            "decisions": list(self.decisions),
            "warnings": list(self.warnings),
        }


@dataclass(frozen=True, slots=True)
class Event:
    observation: Observation

    @property
    def date(self) -> date:
        assert self.observation.test_date is not None
        return self.observation.test_date

    @property
    def miles(self) -> float:
        assert self.observation.normalized_miles is not None
        return self.observation.normalized_miles

    @property
    def segment(self) -> int:
        assert self.observation.segment is not None
        return self.observation.segment


@dataclass(slots=True)
class Interval:
    left: Event
    right: Event
    days: int
    delta_miles: float
    annual_rate: float | None
    quality_weight: float
    recency_weight: float
    included: bool
    decisions: list[str]

    @property
    def weight(self) -> float:
        return self.quality_weight * self.recency_weight if self.included else 0.0

    def to_contract(self) -> dict[str, object]:
        return {
            "from_observation_id": self.left.observation.observation_id,
            "to_observation_id": self.right.observation.observation_id,
            "from_date": self.left.date.isoformat(),
            "to_date": self.right.date.isoformat(),
            "segment": self.left.segment,
            "days": self.days,
            "delta_miles": round(self.delta_miles, 3),
            "annual_rate_miles": round(self.annual_rate)
            if self.annual_rate is not None
            else None,
            "quality_weight": self.quality_weight,
            "recency_weight": round(self.recency_weight, 6),
            "weight": round(self.weight, 6),
            "included": self.included,
            "decisions": list(self.decisions),
        }


@dataclass(slots=True)
class PreparedHistory:
    observations: list[Observation]
    events: list[Event]
    intervals: list[Interval]
    warning_codes: list[str]
    anomaly_class: str
    unresolved_unit: bool
    unresolved_reset: bool


def _parse_date(value: object) -> date | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    for candidate in (raw.split("T", 1)[0], raw.split(" ", 1)[0]):
        try:
            return date.fromisoformat(candidate)
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _strict_number(value: object) -> Decimal | None:
    if isinstance(value, bool) or value is None:
        return None
    raw = str(value).strip().replace(",", "")
    if not raw:
        return None
    try:
        number = Decimal(raw)
    except InvalidOperation:
        return None
    if not number.is_finite() or number < 0:
        return None
    return number


def _normalise_unit(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    unit = value.strip().upper().replace(".", "")
    if unit in {"MI", "MILE", "MILES"}:
        return "MI"
    if unit in {"KM", "KMS", "KILOMETRE", "KILOMETRES", "KILOMETER", "KILOMETERS"}:
        return "KM"
    return None


def _to_miles(value: Decimal, unit: str) -> float:
    converted = value * KM_TO_MILES if unit == "KM" else value
    return float(converted)


def _text(value: object) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _observation_id(raw: dict[str, Any], raw_index: int, source: str) -> str:
    identity = "|".join(
        [
            source,
            _text(raw.get("motTestNumber")) or "",
            _text(raw.get("completedDate")) or "",
            _text(raw.get("odometerValue")) or "",
            _text(raw.get("odometerUnit")) or "",
            str(raw_index),
        ]
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]


def _dedup_key(obs: Observation) -> tuple[object, ...]:
    if obs.mot_test_number:
        return ("test", obs.source.lower(), obs.mot_test_number)
    return (
        "content",
        obs.source.lower(),
        obs.completed_date_raw,
        obs.test_result,
        obs.odometer_value_raw,
        (obs.odometer_unit_raw or "").upper(),
        obs.registration_at_test,
    )


def _raw_observations(vehicle: dict[str, Any]) -> list[Observation]:
    tests = vehicle.get("motTests")
    if not isinstance(tests, list):
        return []
    vehicle_source = _text(vehicle.get("dataSource")) or "dvsa"
    stable_identity = _text(vehicle.get("vin")) or _text(vehicle.get("dvlaId"))
    observations: list[Observation] = []
    for index, item in enumerate(tests):
        raw = item if isinstance(item, dict) else {}
        source = _text(raw.get("dataSource")) or vehicle_source
        completed_raw = _text(raw.get("completedDate"))
        result_type_raw = _text(raw.get("odometerResultType"))
        unit_raw = _text(raw.get("odometerUnit"))
        number = _strict_number(raw.get("odometerValue"))
        unit = _normalise_unit(unit_raw)
        result_type = (result_type_raw or "").upper()
        obs = Observation(
            observation_id=_observation_id(raw, index, source),
            raw_index=index,
            source=source,
            mot_test_number=_text(raw.get("motTestNumber")),
            test_date=_parse_date(completed_raw),
            completed_date_raw=completed_raw,
            test_result=_text(raw.get("testResult")),
            odometer_value_raw=_text(raw.get("odometerValue")),
            odometer_unit_raw=unit_raw,
            odometer_result_type_raw=result_type_raw,
            registration_at_test=(
                _text(raw.get("registrationAtTimeOfTest"))
                or _text(raw.get("regMarkTimeOfTest"))
            ),
            stable_vehicle_identity=stable_identity,
            normalized_miles=(
                _to_miles(number, unit)
                if number is not None
                and unit is not None
                and result_type in {"READ", "OK"}
                else None
            ),
        )
        if obs.test_date is None:
            obs.decisions.append("rejected_invalid_test_date")
        if result_type not in {"READ", "OK"}:
            obs.decisions.append("rejected_odometer_not_read")
        if number is None:
            obs.decisions.append("rejected_invalid_odometer_value")
        if unit is None:
            obs.decisions.append("rejected_unknown_odometer_unit")
            # An unknown unit is ambiguous only when the provider says a
            # numeric odometer was actually read. Unread rows often omit both
            # value and unit and must not poison an otherwise usable history.
            if number is not None and result_type in {"READ", "OK"}:
                obs.warnings.append("unknown_odometer_unit")
        if number == 0:
            obs.warnings.append("zero_odometer_reading")
        observations.append(obs)
    return observations


def _choose_episode(group: list[Observation]) -> Observation:
    values = [obs.normalized_miles for obs in group if obs.normalized_miles is not None]
    assert values
    median_value = statistics.median(values)
    # Nearest to median; passed tests and later test dates break ties.
    return min(
        group,
        key=lambda obs: (
            abs((obs.normalized_miles or 0) - median_value),
            0 if (obs.test_result or "").upper() in {"PASSED", "PRS"} else 1,
            -(obs.test_date.toordinal() if obs.test_date else 0),
            -obs.raw_index,
        ),
    )


def _consolidate_episodes(observations: list[Observation]) -> list[Observation]:
    seen: set[tuple[object, ...]] = set()
    usable: list[Observation] = []
    for obs in sorted(
        observations,
        key=lambda item: (item.test_date or date.min, item.raw_index),
    ):
        if not obs.usable:
            continue
        key = _dedup_key(obs)
        if key in seen:
            obs.decisions.append("duplicate_excluded")
            continue
        seen.add(key)
        usable.append(obs)

    groups: list[list[Observation]] = []
    for obs in usable:
        if not groups:
            groups.append([obs])
            continue
        previous = groups[-1][-1]
        assert obs.test_date and previous.test_date
        gap = (obs.test_date - previous.test_date).days
        episode_signal = (
            gap == 0
            or (obs.test_result or "").upper() in {"FAILED", "PRS"}
            or any(
                (x.test_result or "").upper() in {"FAILED", "PRS"} for x in groups[-1]
            )
        )
        if 0 <= gap <= RETEST_WINDOW_DAYS and episode_signal:
            groups[-1].append(obs)
        else:
            groups.append([obs])

    selected: list[Observation] = []
    for episode, group in enumerate(groups):
        winner = _choose_episode(group)
        raw_values = [obs.normalized_miles or 0 for obs in group]
        spread = max(raw_values) - min(raw_values)
        tolerance = max(100.0, max(raw_values) * 0.01)
        for obs in group:
            obs.episode = episode
            if obs is winner:
                obs.selected_for_event = True
                obs.decisions.append("episode_selected")
                selected.append(obs)
            else:
                obs.decisions.append("retest_episode_consolidated")
        if spread > tolerance:
            for obs in group:
                obs.warnings.append("retest_reading_conflict")
    return selected


def _exclude_isolated_errors(events: list[Observation]) -> list[Observation]:
    excluded: set[str] = set()
    for index in range(1, len(events) - 1):
        prev, cur, nxt = events[index - 1], events[index], events[index + 1]
        assert prev.test_date and cur.test_date and nxt.test_date
        assert prev.normalized_miles is not None
        assert cur.normalized_miles is not None
        assert nxt.normalized_miles is not None
        p, c, n = prev.normalized_miles, cur.normalized_miles, nxt.normalized_miles
        prev_days = max(1, (cur.test_date - prev.test_date).days)
        spike_rate = (c - p) * DAYS_PER_YEAR / prev_days
        if (
            c > max(p, n)
            and n >= p
            and (
                spike_rate > MAX_ANNUAL_RATE
                or c - max(p, n) > max(1000.0, max(p, n) * 0.05)
            )
        ):
            cur.decisions.append("isolated_spike_excluded")
            cur.warnings.append("isolated_keying_spike")
            excluded.add(cur.observation_id)
        elif c < min(p, n) and n >= p:
            cur.decisions.append("isolated_dip_excluded")
            cur.warnings.append("isolated_keying_dip")
            excluded.add(cur.observation_id)
    return [obs for obs in events if obs.observation_id not in excluded]


def _assign_segments(events: list[Observation]) -> tuple[bool, bool]:
    unresolved_unit = False
    unresolved_reset = False
    segment = 0
    previous: Observation | None = None
    for index, obs in enumerate(events):
        obs.segment = segment
        if previous is None:
            previous = obs
            continue
        assert (
            previous.normalized_miles is not None and obs.normalized_miles is not None
        )
        p, c = previous.normalized_miles, obs.normalized_miles
        threshold = max(100.0, p * 0.01)
        unit_changed = _normalise_unit(previous.odometer_unit_raw) != _normalise_unit(
            obs.odometer_unit_raw
        )
        if unit_changed:
            obs.warnings.append("odometer_unit_switch_normalised")
            # A rising raw figure that becomes a large drop only after declared-unit
            # conversion is contradictory, not a normal switch.
            raw_prev = _strict_number(previous.odometer_value_raw)
            raw_cur = _strict_number(obs.odometer_value_raw)
            if (
                c < p - threshold
                and raw_prev is not None
                and raw_cur is not None
                and raw_cur >= raw_prev
            ):
                obs.warnings.append("odometer_unit_contradiction")
                unresolved_unit = True
        if c < p - threshold:
            segment += 1
            obs.segment = segment
            obs.warnings.append("odometer_segment_started")
            obs.decisions.append("persistent_lower_segment")
            if index == len(events) - 1:
                obs.warnings.append("unresolved_odometer_reset")
                unresolved_reset = True
        elif c < p:
            obs.warnings.append("small_negative_change")
        previous = obs
    return unresolved_unit, unresolved_reset


def _build_intervals(events: list[Event]) -> list[Interval]:
    intervals: list[Interval] = []
    if not events:
        return intervals
    latest_date = events[-1].date
    for left, right in zip(events, events[1:]):
        if left.segment != right.segment:
            intervals.append(
                Interval(
                    left,
                    right,
                    (right.date - left.date).days,
                    right.miles - left.miles,
                    None,
                    0,
                    0,
                    False,
                    ["crosses_odometer_segment"],
                )
            )
            continue
        days = max(1, (right.date - left.date).days)
        delta = right.miles - left.miles
        rate = delta * DAYS_PER_YEAR / days
        decisions: list[str] = []
        quality = 0.0
        included = True
        if days < MIN_RATE_INTERVAL_DAYS:
            decisions.append("short_interval_excluded")
            included = False
        elif delta < 0:
            decisions.append("negative_interval_excluded")
            included = False
        elif rate > MAX_ANNUAL_RATE:
            decisions.append("extreme_annual_rate_excluded")
            included = False
        elif days > HALF_QUALITY_MAX_DAYS:
            decisions.append("historical_gap_context_only")
            included = False
        elif days > FULL_QUALITY_MAX_DAYS:
            decisions.append("long_interval_half_weight")
            quality = 0.5
        else:
            quality = 1.0
        if delta == 0:
            decisions.append("zero_movement_retained")
            right.observation.warnings.append("zero_movement_interval")
        age_days = max(0, (latest_date - right.date).days)
        recency = 0.5 ** (age_days / 730.0)
        interval = Interval(
            left, right, days, delta, rate, quality, recency, included, decisions
        )
        if included:
            left.observation.included_for_rate = True
            right.observation.included_for_rate = True
        intervals.append(interval)
    return intervals


def prepare_history(vehicle: dict[str, Any]) -> PreparedHistory:
    observations = _raw_observations(vehicle)
    selected = _consolidate_episodes(observations)
    series = _exclude_isolated_errors(selected)
    contradictory_unit, unresolved_reset = _assign_segments(series)
    # Unknown-unit READ/OK rows are deliberately absent from ``series`` because
    # they cannot be normalised. Preserve that absence as an explicit blocking
    # state rather than forecasting through the missing observation.
    unresolved_unit = contradictory_unit or any(
        "unknown_odometer_unit" in obs.warnings for obs in observations
    )
    events = [Event(obs) for obs in series]
    intervals = _build_intervals(events)
    warning_codes = sorted(
        {warning for obs in observations for warning in obs.warnings}
        | {
            decision
            for interval in intervals
            for decision in interval.decisions
            if decision != "zero_movement_retained"
        }
    )
    rates = [
        interval.annual_rate
        for interval in intervals
        if interval.included and interval.annual_rate is not None
    ]
    volatility = _relative_mad(rates)
    if unresolved_unit or unresolved_reset:
        anomaly_class = "ambiguous"
    elif len({event.segment for event in events}) > 1:
        anomaly_class = "segmented"
    elif any("isolated_keying" in warning for warning in warning_codes):
        anomaly_class = "isolated"
    elif volatility > 0.5:
        anomaly_class = "volatile"
    else:
        anomaly_class = "clean"
    return PreparedHistory(
        observations=observations,
        events=events,
        intervals=intervals,
        warning_codes=warning_codes,
        anomaly_class=anomaly_class,
        unresolved_unit=unresolved_unit,
        unresolved_reset=unresolved_reset,
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


def _relative_mad(rates: Iterable[float | None]) -> float:
    values = [float(rate) for rate in rates if rate is not None and math.isfinite(rate)]
    if len(values) < 2:
        return 0.0
    median = statistics.median(values)
    if median == 0:
        return 0.0 if all(value == 0 for value in values) else math.inf
    return statistics.median(abs(value - median) for value in values) / abs(median)


def _round_hundred(value: float) -> int:
    return max(0, int(round(value / 100.0) * 100))


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
    hard_low: float | None = None,
    hard_high: float | None = None,
    fallback_spread: float = 0,
) -> None:
    rounded = _round_hundred(estimate)
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
        if low <= high:
            result["status"] = "estimated"
            result["prediction_interval"] = {
                "coverage": calibration.target_coverage,
                "lower_mileage": _round_hundred(low),
                "upper_mileage": _round_hundred(high),
                "calibration_version": calibration.version,
                "dataset_digest": calibration.dataset_digest,
                "sample_size": bucket.sample_size,
            }
            return

    # No eligible bucket, or its calibrated residual interval has no overlap
    # with the hard logical bounds. Never relabel a synthetic fallback as a
    # calibrated probability interval.
    low = hard_low if hard_low is not None else max(0.0, estimate - fallback_spread)
    high = hard_high if hard_high is not None else estimate + fallback_spread
    # A point estimate remains useful without a calibrated probability profile.
    # Keep it explicitly estimated, publish only the wider non-probabilistic
    # range, and attach the uncalibrated warning. This preserves normal case
    # autofill without pretending that the fallback bounds have coverage.
    result["status"] = "estimated"
    result["range"] = {
        "lower_mileage": _round_hundred(low),
        "upper_mileage": _round_hundred(high),
        "basis": "logical_bounds"
        if hard_low is not None and hard_high is not None
        else "rate_dispersion_not_calibrated",
    }
    result["warnings"] = _warnings(history, ["uncalibrated_range"])


def estimate_displayed_mileage(
    vehicle: dict[str, Any],
    *,
    target_date: date,
    cohort_prior: CohortPrior | None = None,
    calibration: CalibrationProfile | None = None,
    forecast_horizon_days: int = DEFAULT_FORECAST_HORIZON_DAYS,
) -> dict[str, object]:
    history = prepare_history(vehicle)
    result = _base_result(target_date, history)
    if not history.events:
        result["reason"] = "No readable MOT odometer observations are available."
        return result
    if history.unresolved_unit:
        result["reason"] = "The odometer unit history is contradictory."
        result["warnings"] = _warnings(history, ["odometer_unit_contradiction"])
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
            }
        )
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
        fallback_spread=spread,
        hard_low=latest.miles,
    )
    return result


def legacy_estimate_adapter(result: dict[str, object]) -> dict[str, object]:
    """Thin compatibility shape for the pre-v1 Function caller.

    No business rule lives here. Uncalibrated ``range_only`` and ``insufficient``
    outcomes intentionally do not become a point mileage.
    """

    available = result.get("status") in {"observed", "estimated"}
    interval = result.get("prediction_interval")
    range_block = result.get("range")
    bounds = (
        interval
        if isinstance(interval, dict)
        else range_block
        if isinstance(range_block, dict)
        else {}
    )
    return {
        "estimate_available": available,
        "estimated_mileage": result.get("estimated_mileage") if available else None,
        "estimate_low": bounds.get("lower_mileage"),
        "estimate_high": bounds.get("upper_mileage"),
        "annual_rate_used": result.get("annual_rate_miles"),
        "confidence": None,
        "basis": result.get("evidence"),
        "caveats": [
            warning.get("message")
            for warning in result.get("warnings", [])
            if isinstance(warning, dict)
        ],
        "anomalies_considered": [
            warning.get("code")
            for warning in result.get("warnings", [])
            if isinstance(warning, dict)
        ],
    }
