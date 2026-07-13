from __future__ import annotations

import json
import sys
import uuid
from dataclasses import replace
from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))
FIXTURES = Path(__file__).resolve().parent / "fixtures"

from vehicle_data.backtest import (  # noqa: E402
    calibration_profile_from_holdouts,
    chronological_holdouts,
)
from vehicle_data.contracts import (  # noqa: E402
    ALGORITHM_VERSION,
    CONTRACT_VERSION,
    CalibrationBucket,
    CalibrationProfile,
    CohortPrior,
)
from vehicle_data.mileage import estimate_displayed_mileage, prepare_history  # noqa: E402
from vehicle_data.registration import canonicalize_registration  # noqa: E402
from vehicle_data.service import (  # noqa: E402
    VehicleDataService,
    cohort_priors_from_env,
    legacy_enrichment_adapter,
    select_cohort_prior,
)


def mot(
    when: str,
    value: str,
    *,
    number: str,
    unit: str = "MI",
    result_type: str = "READ",
    result: str = "PASSED",
    registration: str = "TE57VRM",
    source: str = "dvsa",
) -> dict:
    return {
        "motTestNumber": number,
        "dataSource": source,
        "completedDate": when,
        "testResult": result,
        "odometerValue": value,
        "odometerUnit": unit,
        "odometerResultType": result_type,
        "registrationAtTimeOfTest": registration,
    }


def vehicle(*tests: dict, registration_date: str = "2018-01-01") -> dict:
    return {
        "registration": "TE57VRM",
        "registrationDate": registration_date,
        "make": "FORD",
        "model": "FOCUS",
        "fuelType": "Petrol",
        "motTests": list(tests),
    }


def calibration() -> CalibrationProfile:
    return CalibrationProfile(
        version="calibration-test-v1",
        dataset_digest="a" * 64,
        target_coverage=0.9,
        useful_tolerance_miles=2500,
        validated_horizon_days=730,
        buckets=(
            CalibrationBucket(
                method="*",
                max_horizon_days=730,
                min_clean_intervals=0,
                anomaly_class="*",
                error_q_low=-2000,
                error_q_high=2500,
                sample_size=100,
            ),
        ),
    )


def prior() -> CohortPrior:
    return CohortPrior(
        version="cohort-test-v1",
        dataset_digest="b" * 64,
        annual_rate_miles=8000,
        annual_sigma_miles=2500,
        sample_size=1000,
        vehicle_type="all",
        age_band="4-7",
        fuel_type="Petrol",
        make_model_family="FORD FOCUS",
    )


def warning_codes(result: dict) -> set[str]:
    return {item["code"] for item in result["warnings"]}


def test_registration_has_one_provider_boundary_normal_form():
    assert canonicalize_registration(" te57-vrm ") == "TE57VRM"
    assert canonicalize_registration("TE.57 VRM") == "TE57VRM"


def test_raw_observations_remain_auditable_while_dedup_and_retest_are_decisions():
    record = vehicle(
        mot("2022-01-01", "50000", number="1", result="FAILED"),
        mot("2022-01-05", "50010", number="2", result="PASSED", result_type="OK"),
        mot("2022-01-05", "50010", number="2", result="PASSED", result_type="OK"),
        mot("2023-01-05", "94000", number="3", unit="KM"),
    )
    prepared = prepare_history(record)
    assert len(prepared.observations) == 4
    assert any("duplicate_excluded" in obs.decisions for obs in prepared.observations)
    assert any(
        "retest_episode_consolidated" in obs.decisions for obs in prepared.observations
    )
    selected = [obs for obs in prepared.observations if obs.selected_for_event]
    assert len(selected) == 2
    assert selected[0].odometer_value_raw == "50010"
    assert selected[0].odometer_result_type_raw == "OK"
    assert selected[0].registration_at_test == "TE57VRM"
    assert selected[1].normalized_miles == pytest.approx(94000 / 1.609344, rel=1e-6)


def test_short_zero_and_extreme_intervals_are_recorded_not_erased():
    record = vehicle(
        mot("2020-01-01", "10000", number="1"),
        mot("2020-02-15", "10000", number="2"),
        mot("2021-02-15", "250000", number="3"),
        mot("2022-02-15", "258000", number="4"),
    )
    prepared = prepare_history(record)
    decisions = [
        decision for interval in prepared.intervals for decision in interval.decisions
    ]
    assert "short_interval_excluded" in decisions
    assert "zero_movement_retained" in decisions
    assert "extreme_annual_rate_excluded" in decisions
    assert "zero_movement_interval" in {
        warning for obs in prepared.observations for warning in obs.warnings
    }
    assert len(prepared.observations) == 4


def test_isolated_keying_spike_is_excluded_but_neighbour_history_survives():
    record = vehicle(
        mot("2021-01-01", "30000", number="1"),
        mot("2022-01-01", "40000", number="2"),
        mot("2023-01-01", "400000", number="3"),
        mot("2024-01-01", "51000", number="4"),
        mot("2025-01-01", "60000", number="5"),
    )
    prepared = prepare_history(record)
    spike = next(obs for obs in prepared.observations if obs.mot_test_number == "3")
    assert "isolated_spike_excluded" in spike.decisions
    assert len(prepared.events) == 4
    result = estimate_displayed_mileage(
        record, target_date=date(2025, 6, 1), calibration=calibration()
    )
    assert result["status"] == "estimated"
    assert "isolated_keying_spike" in warning_codes(result)


def test_persistent_lower_history_starts_new_displayed_segment_and_unresolved_last_drop_abstains():
    corroborated = vehicle(
        mot("2021-01-01", "80000", number="1"),
        mot("2022-01-01", "90000", number="2"),
        mot("2023-01-01", "12000", number="3"),
        mot("2024-01-01", "21000", number="4"),
        mot("2025-01-01", "30000", number="5"),
    )
    prepared = prepare_history(corroborated)
    assert [event.segment for event in prepared.events] == [0, 0, 1, 1, 1]
    result = estimate_displayed_mileage(
        corroborated,
        target_date=date(2025, 7, 1),
        calibration=calibration(),
    )
    assert result["status"] == "estimated"
    assert result["estimated_mileage"] < 40000
    assert "odometer_segment_started" in warning_codes(result)

    unresolved = vehicle(
        mot("2022-01-01", "80000", number="1"),
        mot("2023-01-01", "90000", number="2"),
        mot("2024-01-01", "12000", number="3"),
    )
    result = estimate_displayed_mileage(
        unresolved, target_date=date(2024, 6, 1), calibration=calibration()
    )
    assert result["status"] == "insufficient"
    assert result["method"] == "displayed_segment_only"
    assert "unresolved_odometer_reset" in warning_codes(result)


def test_unit_contradiction_abstains_instead_of_guessing():
    record = vehicle(
        mot("2022-01-01", "50000", number="1", unit="MI"),
        mot("2023-01-01", "55000", number="2", unit="KM"),
        mot("2024-01-01", "65000", number="3", unit="KM"),
    )
    result = estimate_displayed_mileage(
        record, target_date=date(2024, 6, 1), calibration=calibration()
    )
    assert result["status"] == "insufficient"
    assert "odometer_unit_contradiction" in warning_codes(result)


def test_latest_numeric_unknown_unit_abstains_even_with_calibration():
    record = vehicle(
        mot("2022-01-01", "30000", number="1"),
        mot("2023-01-01", "40000", number="2"),
        mot("2024-01-01", "50000", number="3", unit="UNKNOWN"),
    )
    result = estimate_displayed_mileage(
        record, target_date=date(2024, 6, 1), calibration=calibration()
    )
    assert result["status"] == "insufficient"
    assert result["estimated_mileage"] is None
    assert result["prediction_interval"] is None
    assert "unknown_odometer_unit" in warning_codes(result)


def test_small_negative_interval_is_not_trusted_for_interpolation():
    record = vehicle(
        mot("2023-01-01", "100000", number="1"),
        mot("2024-01-01", "99500", number="2"),
    )
    result = estimate_displayed_mileage(record, target_date=date(2023, 7, 1))
    assert result["status"] == "insufficient"
    assert result["method"] == "none"
    assert result["annual_rate_miles"] is None
    assert result["range"] is None
    assert "not trustworthy" in result["reason"]


@pytest.mark.parametrize(
    ("left_date", "right_date", "target"),
    [
        ("2024-01-01", "2024-03-01", date(2024, 2, 1)),
        ("2020-01-01", "2023-01-01", date(2021, 7, 1)),
    ],
)
def test_monotonic_interpolation_is_independent_of_rate_windows(
    left_date: str,
    right_date: str,
    target: date,
):
    result = estimate_displayed_mileage(
        vehicle(
            mot(left_date, "10000", number="1"),
            mot(right_date, "20000", number="2"),
        ),
        target_date=target,
    )
    assert result["status"] == "estimated"
    assert result["method"] == "bounded_interpolation"
    assert 10000 <= result["estimated_mileage"] <= 20000
    assert result["range"] == {
        "lower_mileage": 10000,
        "upper_mileage": 20000,
        "basis": "logical_bounds",
    }


def test_exact_mot_is_exact_and_interpolation_is_logically_bounded():
    record = vehicle(
        mot("2023-01-01", "40001", number="1"),
        mot("2024-01-01", "50003", number="2"),
    )
    exact = estimate_displayed_mileage(record, target_date=date(2024, 1, 1))
    assert exact["status"] == "observed"
    assert exact["observed_mileage"] == 50003
    assert exact["estimated_mileage"] == 50003

    middle = estimate_displayed_mileage(record, target_date=date(2023, 7, 2))
    assert middle["status"] == "estimated"
    assert middle["method"] == "bounded_interpolation"
    assert middle["range"]["lower_mileage"] == 40000
    assert middle["range"]["upper_mileage"] == 50000
    assert 40001 <= middle["estimated_mileage"] <= 50003


def test_recent_weighted_median_blends_only_with_a_defensible_versioned_prior():
    record = vehicle(
        mot("2021-01-01", "20000", number="1"),
        mot("2022-01-01", "28000", number="2"),
        mot("2023-01-01", "37000", number="3"),
        mot("2024-01-01", "47000", number="4"),
    )
    result = estimate_displayed_mileage(
        record,
        target_date=date(2024, 7, 1),
        cohort_prior=prior(),
        calibration=calibration(),
    )
    assert result["status"] == "estimated"
    assert result["method"] == "cohort_assisted_forecast"
    assert result["prior"]["version"] == "cohort-test-v1"
    assert result["prior"]["dataset_digest"] == "b" * 64
    assert 8000 <= result["annual_rate_miles"] <= 10000
    assert "cohort_prior_used" in warning_codes(result)


def test_cohort_blend_reduces_stale_vehicle_rate_weight():
    record = vehicle(
        mot("2021-01-01", "20000", number="1"),
        mot("2022-01-01", "30000", number="2"),
        # This gap is context-only (>900 days), so the newest usable
        # vehicle-specific endpoint is stale relative to the latest MOT.
        mot("2025-01-01", "50000", number="3"),
    )
    result = estimate_displayed_mileage(
        record,
        target_date=date(2025, 7, 1),
        cohort_prior=prior(),
        calibration=calibration(),
    )
    # 10,007 vehicle rate, downweighted from 70% to 56%, blended with 8,000.
    assert result["annual_rate_miles"] == pytest.approx(9124, abs=2)
    assert "historical_gap_context_only" in warning_codes(result)


def test_sparse_or_stale_histories_abstain_or_return_wide_estimate_without_fake_probability():
    sparse = vehicle(mot("2024-01-01", "40000", number="1"))
    no_prior = estimate_displayed_mileage(sparse, target_date=date(2024, 6, 1))
    assert no_prior["status"] == "insufficient"
    assert no_prior["prediction_interval"] is None

    with_prior = estimate_displayed_mileage(
        sparse,
        target_date=date(2024, 6, 1),
        cohort_prior=prior(),
    )
    assert with_prior["status"] == "estimated"
    assert with_prior["prediction_interval"] is None
    assert with_prior["range"]["basis"] == "rate_dispersion_not_calibrated"

    stale = vehicle(
        mot("2020-01-01", "20000", number="1"),
        mot("2021-01-01", "28000", number="2"),
    )
    result = estimate_displayed_mileage(
        stale, target_date=date(2023, 2, 1), calibration=calibration()
    )
    assert result["status"] == "insufficient"
    assert "forecast_horizon_exceeded" in warning_codes(result)


def test_pre_first_mot_requires_a_defensible_prior_and_registration_anchor():
    record = vehicle(
        mot("2022-01-01", "24000", number="1"),
        registration_date="2019-01-01",
    )
    record["firstUsedDate"] = "2019-01-01"
    absent = estimate_displayed_mileage(record, target_date=date(2020, 1, 1))
    assert absent["status"] == "insufficient"
    assisted = estimate_displayed_mileage(
        record,
        target_date=date(2020, 1, 2),
        cohort_prior=prior(),
        calibration=calibration(),
    )
    assert assisted["status"] == "estimated"
    assert assisted["method"] == "cohort_assisted_backcast"
    assert 0 <= assisted["estimated_mileage"] <= 24000


def test_pre_first_mot_abstains_when_first_use_predates_registration():
    record = vehicle(
        mot("2021-01-01", "80000", number="1"),
        registration_date="2020-01-01",
    )
    record["firstUsedDate"] = "2010-01-01"
    result = estimate_displayed_mileage(
        record,
        target_date=date(2020, 7, 1),
        cohort_prior=prior(),
        calibration=calibration(),
    )
    assert result["status"] == "insufficient"
    assert result["estimated_mileage"] is None
    assert "pre_registration_use_detected" in warning_codes(result)


def test_pre_first_mot_abstains_without_a_registration_anchor():
    record = vehicle(
        mot("2021-01-01", "80000", number="1"),
        registration_date="",
    )
    record["firstUsedDate"] = "2010-01-01"
    result = estimate_displayed_mileage(
        record,
        target_date=date(2020, 7, 1),
        cohort_prior=prior(),
        calibration=calibration(),
    )
    assert result["status"] == "insufficient"
    assert result["estimated_mileage"] is None
    assert "registration_anchor_unavailable" in warning_codes(result)


def test_verified_registration_backcast_passes_through_zero_and_first_mot():
    record = vehicle(
        mot("2022-01-01", "30000", number="1"),
        registration_date="2019-01-01",
    )
    record["firstUsedDate"] = "2019-01-01"
    at_anchor = estimate_displayed_mileage(
        record,
        target_date=date(2019, 1, 1),
        cohort_prior=prior(),
    )
    halfway = estimate_displayed_mileage(
        record,
        target_date=date(2020, 7, 2),
        cohort_prior=prior(),
    )
    assert at_anchor["status"] == "estimated"
    assert at_anchor["estimated_mileage"] == 0
    assert 14900 <= halfway["estimated_mileage"] <= 15100


def test_registration_without_matching_first_used_date_is_not_a_verified_anchor():
    record = vehicle(
        mot("2022-01-01", "30000", number="1"),
        registration_date="2019-01-01",
    )
    result = estimate_displayed_mileage(
        record,
        target_date=date(2020, 1, 1),
        cohort_prior=prior(),
    )
    assert result["status"] == "insufficient"
    assert "registration_anchor_unavailable" in warning_codes(result)


def test_cohort_selector_never_crosses_labels_and_uses_explicit_generic_fallback(
    monkeypatch,
):
    specific = prior()
    generic = CohortPrior(
        version="generic-v1",
        dataset_digest="c" * 64,
        annual_rate_miles=9000,
        annual_sigma_miles=3000,
        sample_size=5000,
        vehicle_type="all",
        age_band="all",
        fuel_type="all",
        make_model_family="all",
    )
    van = {
        "registrationDate": "2018-01-01",
        "firstUsedDate": "2018-01-01",
        "fuelType": "Diesel",
        "make": "MERCEDES",
        "model": "SPRINTER",
    }
    assert select_cohort_prior((specific,), van, date(2024, 1, 1)) is None
    assert select_cohort_prior((specific, generic), van, date(2024, 1, 1)) == generic

    monkeypatch.setenv(
        "MILEAGE_COHORT_PRIOR_JSON",
        json.dumps({"priors": [specific.to_contract() | specific.to_contract()["cohort"], generic.to_contract() | generic.to_contract()["cohort"]]}),
    )
    loaded = cohort_priors_from_env()
    assert [item.version for item in loaded] == ["cohort-test-v1", "generic-v1"]


def test_cohort_age_uses_official_first_used_date_and_rejects_unobservable_type():
    type_specific = replace(prior(), vehicle_type="car")
    observable = CohortPrior(
        version="first-used-v1",
        dataset_digest="d" * 64,
        annual_rate_miles=8000,
        annual_sigma_miles=2500,
        sample_size=1000,
        vehicle_type="all",
        age_band="4-7",
        fuel_type="Petrol",
        make_model_family="FORD FOCUS",
    )
    official = {
        "registrationDate": "2024-01-01",
        "firstUsedDate": "2018-01-01",
        "fuelType": "Petrol",
        "make": "FORD",
        "model": "FOCUS",
    }
    assert select_cohort_prior((type_specific,), official, date(2024, 1, 1)) is None
    assert select_cohort_prior((observable,), official, date(2024, 1, 1)) == observable


def test_tkt044_projection_is_auditable_but_not_presented_as_calibrated_without_profile():
    record = vehicle(
        mot("2023-06-01", "24000", number="1"),
        mot("2024-06-01", "32000", number="2"),
        mot("2025-06-01", "40000", number="3"),
    )
    uncalibrated = estimate_displayed_mileage(record, target_date=date(2026, 7, 9))
    assert uncalibrated["status"] == "estimated"
    assert uncalibrated["estimated_mileage"] == 48800
    # The exact-date annualisation correctly accounts for the leap-year interval;
    # recency weighting selects the latest 8,005-mile annualised rate.
    assert uncalibrated["annual_rate_miles"] == pytest.approx(8005, abs=1)
    assert "uncalibrated_range" in warning_codes(uncalibrated)
    calibrated = estimate_displayed_mileage(
        record,
        target_date=date(2026, 7, 9),
        calibration=calibration(),
    )
    assert calibrated["status"] == "estimated"
    assert (
        calibrated["prediction_interval"]["calibration_version"]
        == "calibration-test-v1"
    )


def test_malformed_or_undersized_calibration_cannot_create_a_probability_claim():
    record = vehicle(
        mot("2023-01-01", "40000", number="1"),
        mot("2024-01-01", "48000", number="2"),
    )
    invalid = CalibrationProfile(
        version="bad-profile",
        dataset_digest="not-a-sha256",
        target_coverage=0.9,
        useful_tolerance_miles=2500,
        validated_horizon_days=730,
        minimum_bucket_size=1,
        buckets=(
            CalibrationBucket(
                method="*",
                max_horizon_days=730,
                min_clean_intervals=0,
                anomaly_class="*",
                error_q_low=-10,
                error_q_high=10,
                sample_size=1,
            ),
        ),
    )
    result = estimate_displayed_mileage(
        record,
        target_date=date(2024, 7, 1),
        calibration=invalid,
    )
    assert result["status"] == "estimated"
    assert result["prediction_interval"] is None
    assert "uncalibrated_range" in warning_codes(result)


class StaticDvsa:
    def __init__(self, payload: dict | None = None, error: Exception | None = None):
        self.payload = payload
        self.error = error

    def get_vehicle_by_registration(self, registration: str) -> dict:
        if self.error:
            raise self.error
        assert self.payload is not None
        return self.payload


class StaticDvla:
    def __init__(self, payload: dict | None = None, error: Exception | None = None):
        self.payload = payload
        self.error = error

    def get_vehicle(self, registration: str) -> dict:
        if self.error:
            raise self.error
        assert self.payload is not None
        return self.payload


def test_service_emits_one_versioned_contract_raw_snapshot_and_thin_legacy_projection():
    payload = vehicle(
        mot("2023-01-01", "40000", number="1"),
        mot("2024-01-01", "48000", number="2"),
    )
    service = VehicleDataService(
        dvsa=StaticDvsa(payload),
        dvla=StaticDvla({"registrationNumber": "TE57VRM", "make": "FORD"}),
        clock=lambda: datetime(2024, 7, 1, tzinfo=timezone.utc),
        id_factory=lambda: uuid.UUID("00000000-0000-0000-0000-000000000152"),
        calibration=calibration(),
    )
    contract = service.lookup("te57 vrm", target_date=date(2024, 7, 1))
    assert contract["contract_version"] == CONTRACT_VERSION
    assert contract["algorithm_version"] == ALGORITHM_VERSION
    assert contract["lookup"]["run_id"] == "00000000-0000-0000-0000-000000000152"
    assert contract["lookup"]["canonical_registration"] == "TE57VRM"
    assert contract["provider_snapshots"][0]["raw_payload"] == payload
    assert len(contract["provider_snapshots"][0]["payload_sha256"]) == 64
    schema = json.loads(
        (FN_DIR.parents[1] / "contracts" / "vehicle-data-v1.schema.json").read_text(
            encoding="utf-8"
        )
    )
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(contract)
    adapted = legacy_enrichment_adapter(contract)
    assert adapted["vehicle_model"] == "FOCUS"
    assert adapted["make"] == "FORD"
    assert "current_mileage" not in adapted
    assert contract["mileage"]["auto_fill_eligible"] is False


@pytest.mark.parametrize(
    ("lookup_status", "expected"),
    [
        ("not_found", "not_found"),
        ("invalid_registration", "invalid_registration"),
        ("temporarily_unavailable", "temporarily_unavailable"),
        ("configuration_error", "configuration_error"),
    ],
)
def test_service_keeps_provider_outcomes_distinct(lookup_status: str, expected: str):
    error_type = type(
        "ProviderError", (RuntimeError,), {"lookup_status": lookup_status}
    )
    service = VehicleDataService(
        dvsa=StaticDvsa(error=error_type("safe")),
        clock=lambda: datetime(2026, 7, 12, tzinfo=timezone.utc),
    )
    result = service.lookup("TE57VRM")
    assert result["lookup"]["status"] == expected


def test_caller_idempotency_key_stabilises_run_identity_across_retries():
    first = VehicleDataService(
        dvsa=StaticDvsa(vehicle()),
        clock=lambda: datetime(2026, 7, 12, tzinfo=timezone.utc),
    ).lookup("TE57VRM", idempotency_key="intake:instance-1:vehicle-data:case-1")
    retry = VehicleDataService(
        dvsa=StaticDvsa(vehicle()),
        clock=lambda: datetime(2026, 7, 13, tzinfo=timezone.utc),
    ).lookup("TE57VRM", idempotency_key="intake:instance-1:vehicle-data:case-1")
    other = VehicleDataService(
        dvsa=StaticDvsa(vehicle()),
        clock=lambda: datetime(2026, 7, 13, tzinfo=timezone.utc),
    ).lookup("TE57VRM", idempotency_key="intake:instance-2:vehicle-data:case-1")
    assert first["lookup"]["run_id"] == retry["lookup"]["run_id"]
    assert first["lookup"]["run_id"] != other["lookup"]["run_id"]


def test_invalid_registration_is_blocked_before_provider_quota_and_warned():
    service = VehicleDataService(
        dvsa=StaticDvsa(),
        clock=lambda: datetime(2026, 7, 12, tzinfo=timezone.utc),
    )
    result = service.lookup(" -- ")
    assert result["lookup"]["status"] == "invalid_registration"
    assert result["provider_snapshots"] == []
    assert result["mileage"]["warnings"][0]["code"] == "invalid_registration"


def test_uncalibrated_estimate_is_visible_but_never_available_to_legacy_autofill():
    payload = vehicle(
        mot("2023-01-01", "40000", number="1"),
        mot("2024-01-01", "48000", number="2"),
    )
    contract = VehicleDataService(
        dvsa=StaticDvsa(payload),
        clock=lambda: datetime(2024, 7, 1, tzinfo=timezone.utc),
    ).lookup("TE57VRM")
    assert contract["mileage"]["status"] == "estimated"
    assert contract["mileage"]["prediction_interval"] is None
    assert contract["mileage"]["range"]["basis"] == "rate_dispersion_not_calibrated"
    adapted = legacy_enrichment_adapter(contract)
    assert contract["mileage"]["estimated_mileage"] is not None
    assert contract["mileage"]["auto_fill_eligible"] is False
    assert "current_mileage" not in adapted
    assert "mileage_confidence" not in adapted


def test_estimate_autofill_requires_empirical_profile_and_explicit_rollout_gate():
    payload = vehicle(
        mot("2023-01-01", "40000", number="1"),
        mot("2024-01-01", "48000", number="2"),
    )
    profile = replace(
        calibration(),
        holdout_sample_size=1000,
        observed_coverage=0.9,
    )
    contract = VehicleDataService(
        dvsa=StaticDvsa(payload),
        clock=lambda: datetime(2024, 7, 1, tzinfo=timezone.utc),
        calibration=profile,
        estimate_autofill_enabled=True,
    ).lookup("TE57VRM")
    assert contract["mileage"]["auto_fill_eligible"] is True
    adapted = legacy_enrichment_adapter(contract)
    assert adapted["current_mileage"] == contract["mileage"]["estimated_mileage"]


def test_chronological_backtest_reports_required_slices_and_builds_reproducible_profile():
    fixtures = json.loads(
        (FIXTURES / "chronological_holdouts.json").read_text(encoding="utf-8")
    )
    report = chronological_holdouts(fixtures, useful_tolerance_miles=2500)
    assert report["overall"]["count"] == 24
    assert report["overall"]["mae"] is not None
    assert report["overall"]["median_absolute_error"] is not None
    assert report["overall"]["range_coverage"] is not None
    assert report["overall"]["useful_tolerance_coverage"] is not None
    assert set(report["by_vehicle_type"]) == {"car", "motorcycle", "van"}
    assert report["by_horizon"]
    assert report["by_age_band"]
    assert report["by_clean_interval_count"]
    assert report["by_volatility"]
    assert report["by_anomaly_class"]
    profile = calibration_profile_from_holdouts(
        report,
        version="fixture-holdout-v1",
        minimum_bucket_size=1,
    )
    again = calibration_profile_from_holdouts(
        report,
        version="fixture-holdout-v1",
        minimum_bucket_size=1,
    )
    assert profile == again
    assert profile.dataset_digest == report["dataset_digest"]
    assert profile.buckets
