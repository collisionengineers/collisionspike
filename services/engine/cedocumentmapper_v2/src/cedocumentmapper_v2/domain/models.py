"""Core domain models.

These dataclasses are the Python-side contract for v2. Implementation modules
should depend on these shapes instead of exchanging raw strings.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any, Literal


class FieldKey(StrEnum):
    WORK_PROVIDER = "work_provider"
    VRM = "vrm"
    VEHICLE_MODEL = "vehicle_model"
    CLAIMANT_NAME = "claimant_name"
    REFERENCE = "reference"
    INCIDENT_DATE = "incident_date"
    INSTRUCTION_DATE = "instruction_date"
    INSPECTION_DATE = "inspection_date"
    INSPECTION_ADDRESS = "inspection_address"
    ACCIDENT_CIRCUMSTANCES = "accident_circumstances"
    VAT_STATUS = "vat_status"
    MILEAGE = "mileage"
    MILEAGE_UNIT = "mileage_unit"


FIELD_ORDER: tuple[FieldKey, ...] = (
    FieldKey.WORK_PROVIDER,
    FieldKey.VRM,
    FieldKey.VEHICLE_MODEL,
    FieldKey.CLAIMANT_NAME,
    FieldKey.REFERENCE,
    FieldKey.INCIDENT_DATE,
    FieldKey.INSTRUCTION_DATE,
    FieldKey.INSPECTION_DATE,
    FieldKey.INSPECTION_ADDRESS,
    FieldKey.ACCIDENT_CIRCUMSTANCES,
    FieldKey.VAT_STATUS,
    FieldKey.MILEAGE,
    FieldKey.MILEAGE_UNIT,
)

FIELD_LABELS: dict[FieldKey, str] = {
    FieldKey.WORK_PROVIDER: "Work Provider",
    FieldKey.VRM: "VRM",
    FieldKey.VEHICLE_MODEL: "Vehicle Model",
    FieldKey.CLAIMANT_NAME: "Claimant Name",
    FieldKey.REFERENCE: "Reference",
    FieldKey.INCIDENT_DATE: "Incident Date",
    FieldKey.INSTRUCTION_DATE: "Instruction Date",
    FieldKey.INSPECTION_DATE: "Inspection Date",
    FieldKey.INSPECTION_ADDRESS: "Inspection Address",
    FieldKey.ACCIDENT_CIRCUMSTANCES: "Accident Circumstances",
    FieldKey.VAT_STATUS: "VAT Status",
    FieldKey.MILEAGE: "Mileage",
    FieldKey.MILEAGE_UNIT: "Mileage Unit",
}

REQUIRED_FIELDS: frozenset[FieldKey] = frozenset(
    {
        FieldKey.WORK_PROVIDER,
        FieldKey.VRM,
        FieldKey.VEHICLE_MODEL,
        FieldKey.CLAIMANT_NAME,
        FieldKey.REFERENCE,
        FieldKey.INCIDENT_DATE,
        FieldKey.INSTRUCTION_DATE,
    }
)


@dataclass(frozen=True)
class SourceSpan:
    page_index: int | None = None
    line_index: int | None = None
    bbox: tuple[float, float, float, float] | None = None


@dataclass(frozen=True)
class DocumentLine:
    text: str
    page_index: int
    line_index: int
    bbox: tuple[float, float, float, float] | None = None
    block_id: str | None = None
    confidence: float | None = None


@dataclass(frozen=True)
class Table:
    """A table extracted from a source document.

    ``rows`` is an ordered tuple of rows, each a tuple of cell strings (empty
    string for blank/None cells). ``bbox`` is the table's bounding box on the
    page when known, and ``page_index`` records which page the table came from.
    Kept deliberately minimal and additive so downstream code can ignore it.
    """

    rows: tuple[tuple[str, ...], ...] = ()
    bbox: tuple[float, float, float, float] | None = None
    page_index: int | None = None


@dataclass(frozen=True)
class DocumentPage:
    page_index: int
    width: float | None = None
    height: float | None = None
    lines: tuple[DocumentLine, ...] = ()
    tables: tuple[Table, ...] = ()


@dataclass(frozen=True)
class DocumentModel:
    source_path: Path
    source_type: Literal["pdf", "docx", "doc", "eml", "msg", "txt"]
    pages: tuple[DocumentPage, ...]
    plain_text: str
    reader_notes: tuple[str, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderMatch:
    provider_id: str | None
    provider_name: str
    confidence: float
    matched_terms: tuple[str, ...] = ()
    missing_terms: tuple[str, ...] = ()
    rejected_terms: tuple[str, ...] = ()


@dataclass(frozen=True)
class ExtractionIssue:
    field: FieldKey | None
    severity: Literal["info", "warning", "error"]
    code: str
    message: str


@dataclass(frozen=True)
class FieldExtraction:
    value: str
    raw_value: str = ""
    rule_id: str | None = None
    confidence: float | None = None
    source_span: SourceSpan | None = None
    issues: tuple[ExtractionIssue, ...] = ()


@dataclass(frozen=True)
class ExtractedRecord:
    provider: ProviderMatch
    fields: dict[FieldKey, FieldExtraction]
    issues: tuple[ExtractionIssue, ...] = ()
    # Free-text provenance lines (e.g. "Applied engineer report: <file>"), mirroring v1's
    # per-session notes. Empty for a plain single-document extraction.
    notes: tuple[str, ...] = ()
    # True when the instruction text signals an AUDIT case — a second, independent
    # CE inspection auditing a THIRD-PARTY engineer's original report (a distinct
    # case-type marked by an "A." Case/PO prefix; see collisionspike ADR-0014).
    # NOT the engineer-report overlay (which merges CE's OWN CNX/EVA report). The
    # audit_signals list the signals that fired (e.g. the "A." Case/PO prefix), so
    # the call is auditable. case_type is a coarse internal label ("audit" when
    # is_audit, else None). All three are INTERNAL state and must NOT appear in the
    # EVA JSON export.
    is_audit: bool = False
    audit_signals: tuple[str, ...] = ()
    case_type: str | None = None

