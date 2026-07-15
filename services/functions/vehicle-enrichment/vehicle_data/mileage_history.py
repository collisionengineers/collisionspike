"""Normalize and audit immutable MOT observations before estimation.

This module preserves source rows, consolidates retest episodes, segments
odometer resets, and produces the trusted events and intervals consumed by
the estimator.
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
            cur.selected_for_event = False
            cur.decisions.append("isolated_spike_excluded")
            cur.warnings.append("isolated_keying_spike")
            excluded.add(cur.observation_id)
        elif c < min(p, n) and n >= p:
            cur.selected_for_event = False
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


def _relative_mad(rates: Iterable[float | None]) -> float:
    values = [float(rate) for rate in rates if rate is not None and math.isfinite(rate)]
    if len(values) < 2:
        return 0.0
    median = statistics.median(values)
    if median == 0:
        return 0.0 if all(value == 0 for value in values) else math.inf
    return statistics.median(abs(value - median) for value in values) / abs(median)


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
