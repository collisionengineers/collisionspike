"""Canonical vehicle-data domain package for the CollisionSpike case workflow.

The public surface is deliberately small: callers provide provider adapters to
``VehicleDataService`` and receive the versioned ``vehicle-data.v1`` contract.
Provider HTTP/auth details and mileage business rules do not leak across that
boundary.
"""

from .contracts import (
    ALGORITHM_VERSION,
    CONTRACT_VERSION,
    CalibrationBucket,
    CalibrationProfile,
    CohortPrior,
)
from .service import VehicleDataService, legacy_enrichment_adapter

__all__ = [
    "ALGORITHM_VERSION",
    "CONTRACT_VERSION",
    "CalibrationBucket",
    "CalibrationProfile",
    "CohortPrior",
    "VehicleDataService",
    "legacy_enrichment_adapter",
]
