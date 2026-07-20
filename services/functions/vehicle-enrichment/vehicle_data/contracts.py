"""Versioned types shared by the canonical vehicle-data service and estimator."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Literal

CONTRACT_VERSION = "vehicle-data.v1"
ALGORITHM_VERSION = "mot-display-estimator.v2"

LookupStatus = Literal[
    "found",
    "not_found",
    "invalid_registration",
    "temporarily_unavailable",
    "configuration_error",
]
MileageStatus = Literal["observed", "estimated", "range_only", "insufficient"]
MileageMethod = Literal[
    "observed_mot",
    "bounded_interpolation",
    "recent_rate_forecast",
    "cohort_assisted_forecast",
    "cohort_assisted_backcast",
    "displayed_segment_only",
    "none",
]


@dataclass(frozen=True, slots=True)
class CohortPrior:
    """A reproducible similar-vehicle annual-mileage prior.

    Priors are deliberately injected rather than hidden constants. A prior is
    defensible only when its training cohort is non-trivial and its parameters
    are finite, non-negative and within the same 100k annual-usage guard used by
    the observation cleaner.
    """

    version: str
    dataset_digest: str
    annual_rate_miles: float
    annual_sigma_miles: float
    sample_size: int
    vehicle_type: str = "unknown"
    age_band: str = "unknown"
    fuel_type: str = "unknown"
    make_model_family: str = "all"

    @property
    def defensible(self) -> bool:
        return (
            bool(self.version.strip())
            and re.fullmatch(r"[0-9a-f]{64}", self.dataset_digest) is not None
            and math.isfinite(self.annual_rate_miles)
            and math.isfinite(self.annual_sigma_miles)
            and 0 <= self.annual_rate_miles <= 100_000
            and self.annual_sigma_miles > 0
            and self.sample_size >= 200
        )

    def to_contract(self) -> dict[str, object]:
        return {
            "version": self.version,
            "dataset_digest": self.dataset_digest,
            "annual_rate_miles": round(self.annual_rate_miles),
            "annual_sigma_miles": round(self.annual_sigma_miles),
            "sample_size": self.sample_size,
            "cohort": {
                "vehicle_type": self.vehicle_type,
                "age_band": self.age_band,
                "fuel_type": self.fuel_type,
                "make_model_family": self.make_model_family,
            },
        }


@dataclass(frozen=True, slots=True)
class CalibrationBucket:
    """Chronological-holdout residual quantiles for one prediction context."""

    method: str
    max_horizon_days: int
    min_clean_intervals: int
    anomaly_class: str
    error_q_low: float
    error_q_high: float
    sample_size: int

    def to_contract(self) -> dict[str, object]:
        return {
            "method": self.method,
            "max_horizon_days": self.max_horizon_days,
            "min_clean_intervals": self.min_clean_intervals,
            "anomaly_class": self.anomaly_class,
            "error_q_low": self.error_q_low,
            "error_q_high": self.error_q_high,
            "sample_size": self.sample_size,
        }

    def matches(
        self,
        *,
        method: str,
        horizon_days: int,
        clean_intervals: int,
        anomaly_class: str,
    ) -> bool:
        return (
            self.method in {method, "*"}
            and horizon_days <= self.max_horizon_days
            and clean_intervals >= self.min_clean_intervals
            and self.anomaly_class in {anomaly_class, "*"}
        )


@dataclass(frozen=True, slots=True)
class CalibrationProfile:
    """Empirical interval profile produced by chronological holdout backtesting."""

    version: str
    dataset_digest: str
    target_coverage: float
    useful_tolerance_miles: int
    validated_horizon_days: int
    buckets: tuple[CalibrationBucket, ...]
    minimum_bucket_size: int = 30
    holdout_sample_size: int = 0
    observed_coverage: float = 0.0

    def to_contract(self) -> dict[str, object]:
        """The actual immutable profile, not a selected lookup interval."""

        return {
            "version": self.version,
            "dataset_digest": self.dataset_digest,
            "target_coverage": self.target_coverage,
            "useful_tolerance_miles": self.useful_tolerance_miles,
            "validated_horizon_days": self.validated_horizon_days,
            "minimum_bucket_size": self.minimum_bucket_size,
            "holdout_sample_size": self.holdout_sample_size,
            "observed_coverage": self.observed_coverage,
            "buckets": [bucket.to_contract() for bucket in self.buckets],
        }

    @property
    def defensible(self) -> bool:
        return (
            bool(self.version.strip())
            and re.fullmatch(r"[0-9a-f]{64}", self.dataset_digest) is not None
            and math.isfinite(self.target_coverage)
            and 0.5 <= self.target_coverage < 1
            and self.useful_tolerance_miles > 0
            and self.validated_horizon_days > 0
            and self.minimum_bucket_size >= 30
            and self.holdout_sample_size >= 0
            and math.isfinite(self.observed_coverage)
            and 0 <= self.observed_coverage <= 1
            and bool(self.buckets)
            and all(
                bool(bucket.method.strip())
                and bucket.max_horizon_days > 0
                and bucket.min_clean_intervals >= 0
                and bool(bucket.anomaly_class.strip())
                and math.isfinite(bucket.error_q_low)
                and math.isfinite(bucket.error_q_high)
                and bucket.error_q_low <= bucket.error_q_high
                and bucket.sample_size > 0
                for bucket in self.buckets
            )
        )

    def select(
        self,
        *,
        method: str,
        horizon_days: int,
        clean_intervals: int,
        anomaly_class: str,
    ) -> CalibrationBucket | None:
        if not self.defensible:
            return None
        if horizon_days > self.validated_horizon_days:
            return None
        candidates = [
            bucket
            for bucket in self.buckets
            if bucket.sample_size >= self.minimum_bucket_size
            and bucket.sample_size > 0
            and math.isfinite(bucket.error_q_low)
            and math.isfinite(bucket.error_q_high)
            and bucket.error_q_low <= bucket.error_q_high
            and bucket.matches(
                method=method,
                horizon_days=horizon_days,
                clean_intervals=clean_intervals,
                anomaly_class=anomaly_class,
            )
        ]
        if not candidates:
            return None
        # Prefer the most specific/narrowest matching bucket deterministically.
        return min(
            candidates,
            key=lambda b: (
                b.method == "*",
                b.anomaly_class == "*",
                b.max_horizon_days,
                -b.min_clean_intervals,
            ),
        )
