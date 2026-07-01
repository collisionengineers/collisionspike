from __future__ import annotations

import io
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, cast

from dataclasses import replace

from cedocumentmapper_v2.config import LLMAssistSettings, migrate_providers_config
from cedocumentmapper_v2.detection import ProviderDetector, audit_signal_for_reference
from cedocumentmapper_v2.domain.models import (
    DocumentLine,
    DocumentModel,
    DocumentPage,
    ExtractedRecord,
    FieldExtraction,
    FieldKey,
    ProviderMatch,
)
from cedocumentmapper_v2.exporters import EVAJsonExporter, RJSDocxExporter
from cedocumentmapper_v2.readers import PDFDocumentReader, get_reader_for_path
from cedocumentmapper_v2.rules import RuleEngine
from cedocumentmapper_v2.ui.paths import (
    APP_DATA_DIR,
    get_desktop_dir,
    safe_filename,
    unique_output_path,
)

# Embedded-image extraction (extract_images): a raster below this pixel area is
# treated as decorative (letterhead logo, signature stamp, divider) and skipped --
# a genuine vehicle photo is reliably much larger. 200x200 chosen as a floor well
# below any real photo but above typical letterhead art.
_MIN_EXTRACTED_IMAGE_AREA = 200 * 200


class DocumentMapperService:
    """Shared use-case layer for document reading, extraction, export, and image work."""

    def __init__(self, app_data_dir: Path | None = None, seed_path: Path | None = None) -> None:
        self.app_data_dir = app_data_dir or APP_DATA_DIR
        self.merge_seed_on_load = app_data_dir is None
        self.seed_path = seed_path or Path("providers.json")
        self.config_path = self.app_data_dir / "providers.json"
        self.detector = ProviderDetector()
        self.rule_engine = RuleEngine()

    def load_provider_catalog(self) -> dict[str, Any]:
        # Pinned seed (parser Function): always migrate from the vendored providers.json
        # so a stale app-data cache cannot hide seed updates between deploys.
        if not self.merge_seed_on_load:
            fresh = self._load_seed_catalog()
            if fresh is not None:
                return cast(dict[str, Any], fresh)

        if not self.config_path.exists():
            self._seed_providers_file()
        with open(self.config_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if data.get("schema_version", 1) < 2:
            data = migrate_providers_config(data)
            self.save_provider_catalog(data.get("providers", []))
        if self.merge_seed_on_load:
            data, changed = self._merge_missing_seed_providers(data)
            if changed:
                self.save_provider_catalog(cast(list[dict[str, Any]], data.get("providers", [])))
        return cast(dict[str, Any], data)

    def load_providers(self) -> list[dict[str, Any]]:
        return cast(list[dict[str, Any]], self.load_provider_catalog().get("providers", []))

    def save_provider_catalog(self, providers: list[dict[str, Any]]) -> None:
        self.app_data_dir.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as fh:
            json.dump({"schema_version": 2, "providers": providers}, fh, indent=2)

    def read_document(self, path: str | Path, *, force_ocr: bool = False) -> DocumentModel:
        path_obj = Path(path)
        reader = get_reader_for_path(path_obj)
        # Only the PDF reader consumes the OCR override (its read() takes keyword-only
        # force_ocr); the other readers keep the plain read(path) signature, so we pass
        # the option selectively to avoid a TypeError on unknown kwargs.
        if force_ocr and isinstance(reader, PDFDocumentReader):
            return reader.read(path_obj, force_ocr=True)
        return reader.read(path_obj)

    def detect_provider(self, document: DocumentModel, providers: list[dict[str, Any]] | None = None) -> ProviderMatch:
        return self.detector.detect(document, providers or self.load_providers())

    def provider_by_id_or_name(self, selector: str, providers: list[dict[str, Any]] | None = None) -> dict[str, Any] | None:
        haystack = providers or self.load_providers()
        selector_lower = selector.lower()
        return next(
            (
                provider
                for provider in haystack
                if str(provider.get("id", "")).lower() == selector_lower
                or str(provider.get("name", "")).lower() == selector_lower
                or str(provider.get("work_provider", "")).lower() == selector_lower
            ),
            None,
        )

    def extract_document(
        self,
        document: DocumentModel,
        provider: dict[str, Any] | None = None,
        providers: list[dict[str, Any]] | None = None,
        allow_unknown: bool = True,
    ) -> ExtractedRecord:
        provider_cfg = provider
        if provider_cfg is None:
            loaded = providers or self.load_providers()
            match = self.detect_provider(document, loaded)
            provider_cfg = next((p for p in loaded if p.get("id") == match.provider_id), None)
            if provider_cfg is None and not allow_unknown:
                # No configured provider matched and the caller forbids synthesizing
                # the "unknown_temp" placeholder: surface an unmapped record so the
                # caller (e.g. headless CLI) can refuse to emit JSON for it.
                return ExtractedRecord(
                    provider=ProviderMatch(None, "Unknown", match.confidence),
                    fields={},
                )
            if provider_cfg is None:
                provider_cfg = {
                    "id": "unknown_temp",
                    "name": "New Provider (Auto-Detected)",
                    "work_provider": "UNKNOWN",
                    "enabled": True,
                    "priority": 999,
                    "detect": {
                        "required_phrases": [],
                        "optional_phrases": [],
                        "negative_phrases": [],
                        "minimum_confidence": 0.0
                    },
                    "field_rules": {}
                }
        if provider_cfg is None:
            return ExtractedRecord(provider=ProviderMatch(None, "Unknown", 0.0), fields={})
        record = self.rule_engine.extract_record(document, provider_cfg)
        return self._apply_case_type(record)

    def _apply_case_type(self, record: ExtractedRecord) -> ExtractedRecord:
        """Finalize the internal case-type flags on a freshly extracted record.

        Detects the *audit* case-type from the ``A.`` prefix on the Case/PO value
        (``FieldKey.REFERENCE``) and sets ``is_audit`` / ``audit_signals`` /
        ``case_type``. Runs on the finalized record so both the CLI and GUI paths
        get it. These are INTERNAL flags and never reach the EVA JSON export.
        """
        reference = record.fields.get(FieldKey.REFERENCE, FieldExtraction("")).value
        signal = audit_signal_for_reference(reference)
        if signal is None:
            return record
        return replace(
            record,
            is_audit=True,
            audit_signals=record.audit_signals + (signal,),
            case_type="audit",
        )

    def _resolve_provider_cfg(
        self,
        document: DocumentModel,
        provider: dict[str, Any] | None,
        providers: list[dict[str, Any]] | None,
    ) -> dict[str, Any] | None:
        """Resolve the provider config for a document (explicit, detected, or None).

        Mirrors the lookup ``extract_document`` performs, but returns the raw
        config (or ``None`` for the unmapped tail) instead of synthesizing the
        ``unknown_temp`` placeholder. Used by the orchestrator path so the
        Unknown-provider tail (``None``) can route to the LLM-assist strategy.
        """
        if provider is not None:
            return provider
        loaded = providers or self.load_providers()
        match = self.detect_provider(document, loaded)
        return next((p for p in loaded if p.get("id") == match.provider_id), None)

    def build_orchestrator(self, llm_assist: bool = False):
        """Construct a :class:`FieldExtractionOrchestrator` (opt-in path only).

        The orchestrator wraps the default :class:`RuleEngine` as a strategy
        (:class:`RuleStrategy`) plus a :class:`GeometryTableStrategy`. When
        ``llm_assist`` is requested *and* the :class:`LLMAssistSettings` resolved
        from the environment report ``is_active`` (flag on + endpoint set), an
        :class:`LLMAssistStrategy` is appended for the Unknown-provider tail.
        Otherwise no LLM strategy is added and no network call can occur.

        This is additive and opt-in: nothing here runs unless a caller invokes it.
        """
        from cedocumentmapper_v2.extraction import (
            FieldExtractionOrchestrator,
            GeometryTableStrategy,
            LLMAssistStrategy,
            RuleStrategy,
        )

        strategies: list[Any] = [
            RuleStrategy(self.rule_engine),
            GeometryTableStrategy(),
        ]
        if llm_assist:
            settings = LLMAssistSettings.from_env()
            if settings.is_active:
                strategies.append(LLMAssistStrategy(settings=settings))
        return FieldExtractionOrchestrator(strategies)

    def extract_document_orchestrated(
        self,
        document: DocumentModel,
        provider: dict[str, Any] | None = None,
        providers: list[dict[str, Any]] | None = None,
        llm_assist: bool = False,
    ):
        """Opt-in extraction via the :class:`FieldExtractionOrchestrator`.

        Returns the orchestrator's :class:`OrchestrationResult` (an
        ExtractedRecord-compatible ``record`` plus per-field ``provenance`` and a
        ``needs_review`` tuple). The case-type flags are finalized on the record
        exactly as the default path does, so downstream consumers behave the same.

        ``llm_assist`` only has an effect when the LLM-assist settings are active;
        otherwise it is a pure no-op (no strategy added, no network call). Unlike
        the default path this does NOT synthesize the ``unknown_temp`` placeholder
        provider — an unmapped document is passed to the orchestrator as ``None``
        so the LLM-assist tail can engage when enabled.
        """
        provider_cfg = self._resolve_provider_cfg(document, provider, providers)
        orchestrator = self.build_orchestrator(llm_assist=llm_assist)
        result = orchestrator.extract(document, provider_cfg)
        finalized = self._apply_case_type(result.record)
        if finalized is result.record:
            return result
        return replace(result, record=finalized)

    def process_document(
        self,
        path: str | Path,
        provider_selector: str | None = None,
        engineer_report: str | Path | None = None,
        allow_unknown: bool = True,
        force_ocr: bool = False,
    ) -> tuple[DocumentModel, ExtractedRecord]:
        providers = self.load_providers()
        document = self.read_document(path, force_ocr=force_ocr)
        provider = self.provider_by_id_or_name(provider_selector, providers) if provider_selector else None
        record = self.extract_document(document, provider, providers, allow_unknown=allow_unknown)
        if engineer_report is not None:
            engineer_document = self.read_document(engineer_report, force_ocr=force_ocr)
            engineer_provider = self.detect_engineer_provider(engineer_document, providers)
            engineer_record = self.extract_document(engineer_document, engineer_provider, providers)
            record, _ = self.overlay_records_with_overrides(
                record, engineer_record, engineer_source_name=Path(engineer_report).name
            )
        return document, record

    def detect_engineer_provider(
        self, document: DocumentModel, providers: list[dict[str, Any]] | None = None
    ) -> dict[str, Any] | None:
        """Resolve which provider should parse an engineer-report document.

        Prefers a dedicated ``engineer_report: true`` provider whose detect phrases
        match the document (faithful to v1, where engineer reports are their own
        providers with their own field rules). Falls back to the document's own
        best-matching provider, then to ``None`` (auto-detect) when nothing matches.
        Never reuses the *instruction's* provider, so the GUI and CLI agree.
        """
        loaded = providers or self.load_providers()
        match = self.detect_provider(document, loaded)
        chosen = next((p for p in loaded if p.get("id") == match.provider_id), None)
        if chosen and chosen.get("engineer_report"):
            return chosen
        engineer_cfgs = [p for p in loaded if p.get("engineer_report") and p.get("enabled", True)]
        if engineer_cfgs:
            engineer_match = self.detect_provider(document, engineer_cfgs)
            if engineer_match.provider_id:
                return next((p for p in engineer_cfgs if p.get("id") == engineer_match.provider_id), chosen)
        return chosen

    def overlay_records_with_overrides(
        self,
        base: ExtractedRecord,
        engineer: ExtractedRecord,
        engineer_source_name: str | None = None,
    ) -> tuple[ExtractedRecord, list[str]]:
        """Single source of truth for the engineer-report overlay (GUI + CLI).

        Non-blank engineer values override the base for every field except
        ``work_provider``. Returns the merged record plus the list of field keys
        that were overridden (the "Engineer Overlaid" set). Raises if there is no
        valid instruction to overlay onto (blank ``work_provider``).
        """
        base_work_provider = base.fields.get(FieldKey.WORK_PROVIDER, FieldExtraction("")).value.strip()
        if not base_work_provider:
            raise ValueError("You must process an instruction before an engineer's report")
        if base.is_audit:
            # Audit case-type: the second document is a THIRD-PARTY original being
            # audited, not CE's own engineer report. It must stay SEPARATE (compared
            # against), never merged onto the instruction. Refuse the overlay so the
            # caller keeps the original as its own classified attachment.
            raise ValueError(
                "Audit case: the original engineer's report is a third-party "
                "document and must be kept separate, not overlaid onto the instruction"
            )
        merged = dict(base.fields)
        overrides: list[str] = []
        for key, extraction in engineer.fields.items():
            if key == FieldKey.WORK_PROVIDER:
                continue
            if extraction.value.strip():
                merged[key] = extraction
                overrides.append(key.value)
        notes = tuple(base.notes)
        if engineer_source_name:
            notes = notes + (f"Applied engineer report: {engineer_source_name}",)
        notes = notes + tuple(engineer.notes)
        merged_record = ExtractedRecord(
            provider=base.provider,
            fields=merged,
            issues=base.issues + engineer.issues,
            notes=notes,
        )
        return merged_record, overrides

    def overlay_records(self, base: ExtractedRecord, engineer: ExtractedRecord) -> ExtractedRecord:
        record, _ = self.overlay_records_with_overrides(base, engineer)
        return record

    def export_json(self, record: ExtractedRecord, out_dir: Path | None = None) -> Path:
        json_text = EVAJsonExporter().export(record)
        path = self._output_path(record, ".json", out_dir)
        path.write_text(json_text, encoding="utf-8")
        return path

    def export_json_bundle(self, record: ExtractedRecord, out_dir: Path | None = None) -> dict[str, Any]:
        folder = out_dir or self.create_output_subfolder(record)
        path = self.export_json(record, folder)
        return {"path": str(path), "folder": str(folder)}

    def export_docx(self, record: ExtractedRecord, out_dir: Path | None = None) -> Path:
        docx_bytes = RJSDocxExporter().export(record)
        path = self._output_path(record, ".docx", out_dir)
        path.write_bytes(docx_bytes)
        return path

    def extract_images(
        self,
        source: str | Path | bytes,
        source_name: str,
        fields: dict[str, str],
        out_dir: Path | None = None,
    ) -> dict[str, Any]:
        data = Path(source).read_bytes() if isinstance(source, (str, Path)) else source
        ext = Path(source_name).suffix.lower()
        output_dir = out_dir or self.create_output_subfolder_from_fields(fields)
        output_dir.mkdir(parents=True, exist_ok=True)
        base_name = f"{safe_filename(fields.get('work_provider', 'RJS'))}_{safe_filename(fields.get('vrm', '') or 'UnknownVRM')}"
        saved: list[Path] = []
        notes: list[str] = []

        def is_decorative(width: int | None, height: int | None) -> bool:
            """Embedded rasters below this pixel AREA are letterhead logos, signature
            stamps, or dividers, not vehicle photos -- a real photo is reliably much
            larger. Area (not a per-axis check) survives a wide-but-short banner logo
            while still rejecting it; unknown dimensions are kept rather than risk
            dropping a real photo."""
            if not width or not height:
                return False
            return width * height < _MIN_EXTRACTED_IMAGE_AREA

        def save_bytes(stem: str, suffix: str, content: bytes) -> None:
            path = unique_output_path(output_dir, stem, suffix)
            path.write_bytes(content)
            saved.append(path)

        def extract_docx_media(docx_bytes: bytes) -> None:
            with zipfile.ZipFile(io.BytesIO(docx_bytes), "r") as zf:
                media = [name for name in zf.namelist() if name.startswith("word/media/") and not name.endswith("/")]
                for idx, member in enumerate(media, start=1):
                    suffix = Path(member).suffix or ".bin"
                    save_bytes(f"{base_name}_img_{idx}", suffix, zf.read(member))

        if ext == ".pdf":
            try:
                import fitz

                doc = fitz.open(stream=data, filetype="pdf")
                try:
                    idx = 1
                    for page_num, page in enumerate(doc, start=1):
                        for img_info in page.get_images() or []:
                            base_image = doc.extract_image(img_info[0])
                            if base_image and not is_decorative(base_image.get("width"), base_image.get("height")):
                                save_bytes(f"{base_name}_img_{page_num}_{idx}", "." + base_image["ext"], base_image["image"])
                                idx += 1
                finally:
                    doc.close()
            except Exception as exc:
                try:
                    from pypdf import PdfReader

                    reader = PdfReader(io.BytesIO(data))
                    idx = 1
                    for page_num, page in enumerate(reader.pages, start=1):
                        for image in getattr(page, "images", []) or []:
                            width = height = None
                            try:
                                pil_image = getattr(image, "image", None)
                                if pil_image is not None:
                                    width, height = pil_image.size
                            except Exception:
                                pass
                            if is_decorative(width, height):
                                continue
                            suffix = Path(getattr(image, "name", "")).suffix or ".bin"
                            save_bytes(f"{base_name}_img_{page_num}_{idx}", suffix, image.data)
                            idx += 1
                except Exception as pypdf_exc:
                    notes.append(f"PDF image extraction failed: {exc} / {pypdf_exc}")
        elif ext == ".docx":
            extract_docx_media(data)
        elif ext == ".doc":
            with tempfile.TemporaryDirectory() as tmpdir:
                temp_dir = Path(tmpdir)
                temp_doc = temp_dir / source_name
                temp_doc.write_bytes(data)
                converted = self._convert_doc_to_docx(temp_doc, temp_dir, notes)
                if converted:
                    extract_docx_media(converted.read_bytes())
                else:
                    notes.append("Could not convert DOC for image extraction.")
        else:
            notes.append("Image extraction is only supported for PDF, DOCX, and DOC.")

        return {
            "success": bool(saved),
            "count": len(saved),
            "paths": [str(path) for path in saved],
            "folder": str(output_dir),
            "message": f"Successfully extracted {len(saved)} image(s)." if saved else "No images extracted. " + " ".join(notes),
        }

    def create_output_subfolder(self, record: ExtractedRecord) -> Path:
        fields = {key.value: value.value for key, value in record.fields.items()}
        return self.create_output_subfolder_from_fields(fields)

    def create_output_subfolder_from_fields(self, fields: dict[str, str]) -> Path:
        root = get_desktop_dir() / "cedocumentmapper_outputs"
        root.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        work_provider = safe_filename(fields.get("work_provider", "") or "UnknownProvider")
        vrm = safe_filename(fields.get("vrm", "") or "UnknownVRM")
        return unique_output_path(root, f"{timestamp}_{work_provider}_{vrm}", "")

    def _convert_doc_to_docx(self, source: Path, out_dir: Path, notes: list[str]) -> Path | None:
        target = out_dir / f"{source.stem}.docx"
        try:
            import pythoncom
            import win32com.client

            pythoncom.CoInitialize()
            word = win32com.client.Dispatch("Word.Application")
            word.Visible = False
            try:
                doc = word.Documents.Open(str(source.resolve()))
                doc.SaveAs2(str(target.resolve()), FileFormat=16)
                doc.Close()
            finally:
                word.Quit()
                pythoncom.CoUninitialize()
            if target.exists():
                return target
        except Exception as exc:
            notes.append(f"Word COM DOC conversion failed: {exc}")

        soffice = shutil.which("soffice") or shutil.which("libreoffice")
        if not soffice:
            notes.append("LibreOffice not available for DOC conversion.")
            return None
        try:
            subprocess.run(
                [soffice, "--headless", "--convert-to", "docx", "--outdir", str(out_dir), str(source.resolve())],
                check=True,
                capture_output=True,
                timeout=30,
            )
            return next(iter(out_dir.glob("*.docx")), None)
        except Exception as exc:
            notes.append(f"LibreOffice DOC conversion failed: {exc}")
            return None

    def record_from_field_map(self, fields: dict[str, str]) -> ExtractedRecord:
        record_fields = {
            FieldKey(key): FieldExtraction(value=value)
            for key, value in fields.items()
            if key in {field.value for field in FieldKey}
        }
        return ExtractedRecord(
            provider=ProviderMatch(None, fields.get("work_provider", ""), 1.0),
            fields=record_fields,
        )

    def record_from_dict(self, data: dict[str, Any]) -> ExtractedRecord:
        """Rebuild an ExtractedRecord from a :meth:`record_to_dict` payload.

        Used by the GUI batch path so an engineer-report overlay targets the
        CURRENTLY-DISPLAYED record (supplied by the client) rather than whichever
        file the host imported last. Reconstructs what the overlay needs: the
        field map, the provider, and the internal ``is_audit`` / ``audit_signals``
        / ``case_type`` flags — so the never-overlay-onto-audit guard still fires.
        """
        record_fields: dict[FieldKey, FieldExtraction] = {}
        for raw_key, raw_val in (data.get("fields") or {}).items():
            try:
                field_key = FieldKey(raw_key)
            except ValueError:
                continue
            if isinstance(raw_val, dict):
                record_fields[field_key] = FieldExtraction(
                    value=str(raw_val.get("value", "") or ""),
                    raw_value=str(raw_val.get("raw_value", "") or ""),
                    rule_id=raw_val.get("rule_id"),
                    confidence=raw_val.get("confidence"),
                )
            else:
                record_fields[field_key] = FieldExtraction(value=str(raw_val or ""))
        prov = data.get("provider") or {}
        provider = ProviderMatch(
            prov.get("provider_id"),
            prov.get("provider_name", "Unknown"),
            float(prov.get("confidence", 0.0) or 0.0),
        )
        return ExtractedRecord(
            provider=provider,
            fields=record_fields,
            is_audit=bool(data.get("is_audit", False)),
            audit_signals=tuple(data.get("audit_signals") or ()),
            case_type=data.get("case_type"),
        )

    def document_to_dict(self, doc: DocumentModel) -> dict[str, Any]:
        return {
            "source_path": str(doc.source_path),
            "source_type": doc.source_type,
            "plain_text": doc.plain_text,
            "reader_notes": list(doc.reader_notes),
            "metadata": doc.metadata,
            "pages": [
                {
                    "page_index": page.page_index,
                    "width": page.width,
                    "height": page.height,
                    "lines": [
                        {
                            "text": line.text,
                            "page_index": line.page_index,
                            "line_index": line.line_index,
                            "bbox": list(line.bbox) if line.bbox else None,
                            "block_id": line.block_id,
                            "confidence": line.confidence,
                        }
                        for line in page.lines
                    ],
                }
                for page in doc.pages
            ],
        }

    def document_from_dict(self, data: dict[str, Any]) -> DocumentModel:
        pages = []
        for page_data in data.get("pages", []):
            lines = [
                DocumentLine(
                    text=line["text"],
                    page_index=line["page_index"],
                    line_index=line["line_index"],
                    bbox=tuple(line["bbox"]) if line.get("bbox") else None,
                    block_id=line.get("block_id"),
                    confidence=line.get("confidence"),
                )
                for line in page_data.get("lines", [])
            ]
            pages.append(
                DocumentPage(
                    page_index=page_data["page_index"],
                    width=page_data.get("width"),
                    height=page_data.get("height"),
                    lines=tuple(lines),
                )
            )
        return DocumentModel(
            source_path=Path(data.get("source_path", "")),
            source_type=cast(Literal["pdf", "docx", "doc", "eml", "msg", "txt"], data.get("source_type", "pdf")),
            pages=tuple(pages),
            plain_text=data.get("plain_text", ""),
            reader_notes=tuple(data.get("reader_notes", [])),
            metadata=data.get("metadata", {}),
        )

    def record_to_dict(self, record: ExtractedRecord) -> dict[str, Any]:
        return {
            "provider": {
                "provider_id": record.provider.provider_id,
                "provider_name": record.provider.provider_name,
                "confidence": record.provider.confidence,
                "matched_terms": list(record.provider.matched_terms),
                "missing_terms": list(record.provider.missing_terms),
                "rejected_terms": list(record.provider.rejected_terms),
            },
            "fields": {
                key.value: {
                    "value": value.value,
                    "raw_value": value.raw_value,
                    "rule_id": value.rule_id,
                    "confidence": value.confidence,
                    "source_span": {
                        "page_index": value.source_span.page_index,
                        "line_index": value.source_span.line_index,
                        "bbox": list(value.source_span.bbox) if value.source_span.bbox else None,
                    }
                    if value.source_span
                    else None,
                    "issues": [
                        {
                            "field": issue.field.value if issue.field else None,
                            "severity": issue.severity,
                            "code": issue.code,
                            "message": issue.message,
                        }
                        for issue in value.issues
                    ],
                }
                for key, value in record.fields.items()
            },
            "issues": [
                {
                    "field": issue.field.value if issue.field else None,
                    "severity": issue.severity,
                    "code": issue.code,
                    "message": issue.message,
                }
                for issue in record.issues
            ],
            "notes": list(record.notes),
            "is_audit": record.is_audit,
            "audit_signals": list(record.audit_signals),
            "case_type": record.case_type,
        }

    def orchestration_to_dict(self, result: Any) -> dict[str, Any]:
        """Serialize an :class:`OrchestrationResult` to JSON-safe primitives.

        Includes the standard record dict (so existing consumers can ingest it),
        plus the orchestrator's per-field provenance (winner + every ranked
        candidate, with strategy provenance) and the ``needs_review`` list.
        """

        def candidate_to_dict(candidate: Any) -> dict[str, Any]:
            return {
                "field": candidate.field.value,
                "value": candidate.value,
                "confidence": candidate.confidence,
                "strategy_name": candidate.strategy_name,
                "rule_id": candidate.rule_id,
                "raw_value": candidate.raw_value,
                "source_span": {
                    "page_index": candidate.source_span.page_index,
                    "line_index": candidate.source_span.line_index,
                    "bbox": list(candidate.source_span.bbox) if candidate.source_span.bbox else None,
                }
                if candidate.source_span
                else None,
                "metadata": dict(candidate.metadata),
            }

        provenance = {
            field_key.value: {
                "winner": candidate_to_dict(prov.winner) if prov.winner else None,
                "candidates": [candidate_to_dict(c) for c in prov.candidates],
                "needs_review": prov.needs_review,
                "review_reason": prov.review_reason,
            }
            for field_key, prov in result.provenance.items()
        }
        return {
            "record": self.record_to_dict(result.record),
            "provenance": provenance,
            "needs_review": [field_key.value for field_key in result.needs_review],
        }

    def _output_path(self, record: ExtractedRecord, extension: str, out_dir: Path | None) -> Path:
        directory = out_dir or self.create_output_subfolder(record)
        directory.mkdir(parents=True, exist_ok=True)
        work_provider = record.fields.get(FieldKey.WORK_PROVIDER, FieldExtraction("")).value
        vrm = record.fields.get(FieldKey.VRM, FieldExtraction("")).value or "UnknownVRM"
        return unique_output_path(directory, f"{safe_filename(work_provider)}_{safe_filename(vrm)}", extension)

    def _seed_providers_file(self) -> None:
        self.app_data_dir.mkdir(parents=True, exist_ok=True)
        seed_catalog = self._load_seed_catalog()
        if seed_catalog is not None:
            with open(self.config_path, "w", encoding="utf-8") as fh:
                json.dump(seed_catalog, fh, indent=2)
            return
        self.save_provider_catalog(
            [
                {
                    "id": "rjs",
                    "name": "RJS Solicitors",
                    "work_provider": "RJS",
                    "enabled": True,
                    "priority": 1,
                    "detect": {"required_phrases": ["RJS Solicitors"], "optional_phrases": [], "negative_phrases": [], "minimum_confidence": 0.8},
                    "field_rules": {},
                }
            ]
        )

    def _seed_candidates(self) -> list[Path]:
        candidates = [
            self.seed_path,
            Path(__file__).resolve().parents[3] / "providers.json",
            Path(sys.argv[0]).parent / "providers.json",
        ]
        if hasattr(sys, "_MEIPASS"):
            candidates.append(Path(getattr(sys, "_MEIPASS")) / "providers.json")
        return candidates

    def _load_seed_catalog(self) -> dict[str, Any] | None:
        for candidate in self._seed_candidates():
            if not candidate.exists():
                continue
            with open(candidate, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if data.get("schema_version", 1) < 2:
                data = migrate_providers_config(data)
            return cast(dict[str, Any], data)
        return None

    def _merge_missing_seed_providers(self, data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        seed_catalog = self._load_seed_catalog()
        if not seed_catalog:
            return data, False

        providers = list(cast(list[dict[str, Any]], data.get("providers", [])))
        existing_ids = {str(provider.get("id", "")).lower() for provider in providers}
        appended = []
        for seed_provider in cast(list[dict[str, Any]], seed_catalog.get("providers", [])):
            seed_id = str(seed_provider.get("id", "")).lower()
            if seed_id and seed_id not in existing_ids:
                appended.append(seed_provider)
                existing_ids.add(seed_id)

        if not appended:
            return data, False

        merged = dict(data)
        merged["schema_version"] = 2
        merged["providers"] = providers + appended
        return merged, True
