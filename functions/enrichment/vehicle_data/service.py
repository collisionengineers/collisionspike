"""Canonical DVSA/DVLA lookup service and versioned response contract."""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import date, datetime, timezone
from typing import Any, Callable, Protocol

from .contracts import (
    ALGORITHM_VERSION,
    CONTRACT_VERSION,
    CalibrationBucket,
    CalibrationProfile,
    CohortPrior,
)
from .mileage import estimate_displayed_mileage
from .registration import canonicalize_registration, is_plausible_registration


class DvsaProvider(Protocol):
    def get_vehicle_by_registration(self, registration: str) -> dict[str, Any]: ...


class DvlaProvider(Protocol):
    def get_vehicle(self, registration: str) -> dict[str, Any]: ...


def _json_digest(payload: object) -> str:
    encoded = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), default=str
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _clean(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _exception_status(exc: Exception) -> str:
    status = getattr(exc, "lookup_status", None)
    if status in {
        "not_found",
        "invalid_registration",
        "temporarily_unavailable",
        "configuration_error",
    }:
        return status
    name = type(exc).__name__.lower()
    if "notfound" in name or "not_found" in name:
        return "not_found"
    if "invalid" in name:
        return "invalid_registration"
    if "auth" in name or "config" in name or "notconfigured" in name:
        return "configuration_error"
    return "temporarily_unavailable"


def _snapshot(
    *,
    provider: str,
    retrieved_at: datetime,
    status: str,
    payload: dict[str, Any] | None,
    error: Exception | None = None,
) -> dict[str, object]:
    return {
        "provider": provider,
        "retrieved_at": retrieved_at.isoformat(),
        "status": status,
        "payload_sha256": _json_digest(payload) if payload is not None else None,
        "raw_payload": payload,
        "error_class": type(error).__name__ if error else None,
        "error_code": getattr(error, "error_code", None) if error else None,
    }


def cohort_prior_from_env() -> CohortPrior | None:
    raw = (os.environ.get("MILEAGE_COHORT_PRIOR_JSON") or "").strip()
    if not raw:
        return None
    try:
        payload = json.loads(raw)
        return CohortPrior(
            version=str(payload["version"]),
            dataset_digest=str(payload["dataset_digest"]),
            annual_rate_miles=float(payload["annual_rate_miles"]),
            annual_sigma_miles=float(payload["annual_sigma_miles"]),
            sample_size=int(payload["sample_size"]),
            vehicle_type=str(payload.get("vehicle_type", "unknown")),
            age_band=str(payload.get("age_band", "unknown")),
            fuel_type=str(payload.get("fuel_type", "unknown")),
            make_model_family=str(payload.get("make_model_family", "all")),
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def calibration_profile_from_env() -> CalibrationProfile | None:
    raw = (os.environ.get("MILEAGE_CALIBRATION_PROFILE_JSON") or "").strip()
    if not raw:
        return None
    try:
        payload = json.loads(raw)
        buckets = tuple(
            CalibrationBucket(
                method=str(item["method"]),
                max_horizon_days=int(item["max_horizon_days"]),
                min_clean_intervals=int(item.get("min_clean_intervals", 0)),
                anomaly_class=str(item.get("anomaly_class", "*")),
                error_q_low=float(item["error_q_low"]),
                error_q_high=float(item["error_q_high"]),
                sample_size=int(item["sample_size"]),
            )
            for item in payload["buckets"]
        )
        return CalibrationProfile(
            version=str(payload["version"]),
            dataset_digest=str(payload["dataset_digest"]),
            target_coverage=float(payload.get("target_coverage", 0.9)),
            useful_tolerance_miles=int(payload.get("useful_tolerance_miles", 2500)),
            validated_horizon_days=int(payload.get("validated_horizon_days", 730)),
            buckets=buckets,
            minimum_bucket_size=int(payload.get("minimum_bucket_size", 30)),
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


class VehicleDataService:
    """One lookup, one versioned contract, provider details kept behind adapters."""

    def __init__(
        self,
        *,
        dvsa: DvsaProvider,
        dvla: DvlaProvider | None = None,
        clock: Callable[[], datetime] | None = None,
        id_factory: Callable[[], uuid.UUID] | None = None,
        cohort_prior: CohortPrior | None = None,
        calibration: CalibrationProfile | None = None,
    ) -> None:
        self.dvsa = dvsa
        self.dvla = dvla
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.id_factory = id_factory or uuid.uuid4
        self.cohort_prior = cohort_prior
        self.calibration = calibration

    def lookup(
        self,
        registration: str,
        *,
        target_date: date | None = None,
        include_mileage: bool = True,
    ) -> dict[str, object]:
        retrieved_at = self.clock()
        if retrieved_at.tzinfo is None:
            retrieved_at = retrieved_at.replace(tzinfo=timezone.utc)
        target = target_date or retrieved_at.date()
        run_id = str(self.id_factory())
        canonical = canonicalize_registration(registration)
        lookup: dict[str, object] = {
            "run_id": run_id,
            "status": "invalid_registration",
            "requested_registration": registration,
            "canonical_registration": canonical,
            "target_date": target.isoformat(),
            "retrieved_at": retrieved_at.isoformat(),
            "provider_statuses": {},
        }
        contract: dict[str, object] = {
            "contract_version": CONTRACT_VERSION,
            "algorithm_version": ALGORITHM_VERSION,
            "lookup": lookup,
            "vehicle": {},
            "provider_snapshots": [],
            "mileage": {
                "status": "insufficient",
                "method": "none",
                "odometer_meaning": "displayed_odometer",
                "target_date": target.isoformat(),
                "algorithm_version": ALGORITHM_VERSION,
                "reason": "Registration is invalid.",
                "warnings": [
                    {
                        "code": "invalid_registration",
                        "severity": "blocking",
                        "message": "The registration is invalid; vehicle data was not requested.",
                    }
                ],
                "evidence": {
                    "observations": [],
                    "intervals": [],
                    "anomaly_class": "none",
                },
            },
        }
        if not is_plausible_registration(canonical):
            return contract

        snapshots: list[dict[str, object]] = []
        provider_statuses: dict[str, str] = {}
        dvsa_vehicle: dict[str, Any] | None = None
        dvla_vehicle: dict[str, Any] | None = None
        dvsa_error: Exception | None = None
        try:
            dvsa_vehicle = self.dvsa.get_vehicle_by_registration(canonical)
            provider_statuses["dvsa"] = "found"
            snapshots.append(
                _snapshot(
                    provider="dvsa_mot_history_v1",
                    retrieved_at=retrieved_at,
                    status="found",
                    payload=dvsa_vehicle,
                )
            )
        except Exception as exc:  # provider adapters classify without leaking secrets
            dvsa_error = exc
            provider_statuses["dvsa"] = _exception_status(exc)
            snapshots.append(
                _snapshot(
                    provider="dvsa_mot_history_v1",
                    retrieved_at=retrieved_at,
                    status=provider_statuses["dvsa"],
                    payload=None,
                    error=exc,
                )
            )

        needs_dvla = dvsa_vehicle is None or not _clean(dvsa_vehicle.get("make"))
        if self.dvla is not None and needs_dvla:
            try:
                dvla_vehicle = self.dvla.get_vehicle(canonical)
                provider_statuses["dvla"] = "found"
                snapshots.append(
                    _snapshot(
                        provider="dvla_vehicle_enquiry_v1",
                        retrieved_at=retrieved_at,
                        status="found",
                        payload=dvla_vehicle,
                    )
                )
            except Exception as exc:
                provider_statuses["dvla"] = _exception_status(exc)
                snapshots.append(
                    _snapshot(
                        provider="dvla_vehicle_enquiry_v1",
                        retrieved_at=retrieved_at,
                        status=provider_statuses["dvla"],
                        payload=None,
                        error=exc,
                    )
                )

        lookup["provider_statuses"] = provider_statuses
        contract["provider_snapshots"] = snapshots
        found = dvsa_vehicle is not None or dvla_vehicle is not None
        if found:
            lookup["status"] = "found"
        else:
            statuses = set(provider_statuses.values())
            lookup["status"] = (
                "invalid_registration"
                if "invalid_registration" in statuses
                else "configuration_error"
                if "configuration_error" in statuses
                else "temporarily_unavailable"
                if "temporarily_unavailable" in statuses
                else "not_found"
            )

        primary = dvsa_vehicle or {}
        fallback = dvla_vehicle or {}
        contract["vehicle"] = {
            "registration": _clean(primary.get("registration"))
            or _clean(fallback.get("registrationNumber"))
            or canonical,
            "make": _clean(primary.get("make")) or _clean(fallback.get("make")),
            "model": _clean(primary.get("model")),
            "first_used_date": _clean(primary.get("firstUsedDate")),
            "registration_date": _clean(primary.get("registrationDate"))
            or _clean(fallback.get("monthOfFirstRegistration")),
            "manufacture_date": _clean(primary.get("manufactureDate")),
            "manufacture_year": primary.get("manufactureYear")
            or fallback.get("yearOfManufacture"),
            "fuel_type": _clean(primary.get("fuelType"))
            or _clean(fallback.get("fuelType")),
            "primary_colour": _clean(primary.get("primaryColour"))
            or _clean(fallback.get("colour")),
            "engine_size_cc": primary.get("engineSize")
            or fallback.get("engineCapacity"),
            "stable_vehicle_identity": _clean(primary.get("vin"))
            or _clean(primary.get("dvlaId")),
        }

        if dvsa_vehicle is not None and include_mileage:
            contract["mileage"] = estimate_displayed_mileage(
                dvsa_vehicle,
                target_date=target,
                cohort_prior=self.cohort_prior,
                calibration=self.calibration,
            )
        elif not include_mileage:
            contract["mileage"] = {
                "status": "insufficient",
                "method": "none",
                "odometer_meaning": "displayed_odometer",
                "target_date": target.isoformat(),
                "algorithm_version": ALGORITHM_VERSION,
                "reason": "Mileage from the instruction is authoritative; no MOT estimate was requested.",
                "estimated_mileage": None,
                "observed_mileage": None,
                "annual_rate_miles": None,
                "prediction_interval": None,
                "range": None,
                "prior": None,
                "warnings": [
                    {
                        "code": "document_mileage_authoritative",
                        "severity": "warning",
                        "message": "Mileage from the instruction is authoritative; the MOT estimate was skipped.",
                    }
                ],
                "evidence": {
                    "observations": [],
                    "intervals": [],
                    "anomaly_class": "not_evaluated",
                },
            }
        elif dvsa_error is not None:
            contract["mileage"] = {
                **contract["mileage"],
                "reason": "MOT history was unavailable for this lookup.",
                "warnings": [
                    {
                        "code": f"dvsa_{provider_statuses.get('dvsa', 'unavailable')}",
                        "severity": "blocking",
                        "message": "MOT history was unavailable for this lookup.",
                    }
                ],
            }
        return contract


def legacy_enrichment_adapter(contract: dict[str, object]) -> dict[str, object]:
    """Temporary compatibility fields for the existing case-persistence caller.

    This is a mechanical projection only. TKT-151 can consume/persist the nested
    contract without duplicating provider or estimator rules.
    """

    vehicle = (
        contract.get("vehicle") if isinstance(contract.get("vehicle"), dict) else {}
    )
    mileage = (
        contract.get("mileage") if isinstance(contract.get("mileage"), dict) else {}
    )
    warnings = mileage.get("warnings") if isinstance(mileage, dict) else []
    lookup = contract.get("lookup") if isinstance(contract.get("lookup"), dict) else {}
    provider_statuses = (
        lookup.get("provider_statuses")
        if isinstance(lookup.get("provider_statuses"), dict)
        else {}
    )
    provider_messages: list[str] = []
    dvsa_status = provider_statuses.get("dvsa")
    if dvsa_status == "not_found":
        provider_messages.append("DVSA returned no MOT record for this registration.")
    elif dvsa_status == "invalid_registration":
        provider_messages.append("DVSA rejected the registration as invalid.")
    elif dvsa_status == "configuration_error":
        provider_messages.append(
            "DVSA lookup failed because the provider is not configured."
        )
    elif dvsa_status == "temporarily_unavailable":
        provider_messages.append(
            "DVSA lookup failed because the provider is temporarily unavailable."
        )
    output: dict[str, object] = {
        **contract,
        "warnings": provider_messages
        + [
            item.get("message") if isinstance(item, dict) else str(item)
            for item in (warnings if isinstance(warnings, list) else [])
        ],
    }
    model = _clean(vehicle.get("model")) if isinstance(vehicle, dict) else None
    make = _clean(vehicle.get("make")) if isinstance(vehicle, dict) else None
    if model:
        output["vehicle_model"] = model
    if make:
        output["make"] = make
    if isinstance(mileage, dict) and mileage.get("status") in {"observed", "estimated"}:
        estimate = mileage.get("estimated_mileage")
        if isinstance(estimate, (int, float)) and estimate >= 0:
            output["current_mileage"] = int(round(estimate))
            output["mileage_unit"] = "Miles"
            output["mileage_method"] = mileage.get("method")
            output["mileage_warnings"] = mileage.get("warnings", [])
    return output
