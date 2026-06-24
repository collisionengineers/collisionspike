"""Smoke tests for each headless CLI command group.

These assert exit codes and that JSON output is well-formed, and cover the newer
exit codes (3 read failure, 6 export failure, 7 provider-config invalid), the
unmapped -> no-JSON behavior, and that ``python -m cedocumentmapper_v2`` works.
They rely only on tiny inputs created on the fly (no private corpus).
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from cedocumentmapper_v2.cli import main


CATALOG = {
    "schema_version": 2,
    "providers": [
        {
            "id": "test",
            "name": "Test Provider",
            "work_provider": "TEST",
            "enabled": True,
            "priority": 1,
            "detect": {
                "required_phrases": ["Unique Test Phrase"],
                "optional_phrases": [],
                "negative_phrases": [],
                "minimum_confidence": 0.5,
            },
            "field_rules": {
                "work_provider": {"id": "test_wp", "kind": "manual", "value": "TEST"}
            },
        }
    ],
}


def _appdata(tmp_path: Path, catalog: dict | None = None) -> Path:
    app_data = tmp_path / "appdata"
    app_data.mkdir(exist_ok=True)
    (app_data / "providers.json").write_text(
        json.dumps(catalog or CATALOG), encoding="utf-8"
    )
    return app_data


def _eml(tmp_path: Path, *, name: str = "instruction.eml", subject: str = "Unique Test Phrase") -> Path:
    path = tmp_path / name
    path.write_text(
        "Subject: {subject}\n"
        "From: sender@example.com\n"
        "To: receiver@example.com\n"
        "Date: Sun, 31 May 2026 10:00:00 +0000\n"
        "\n"
        "Body of the {subject} instruction.\n".format(subject=subject),
        encoding="utf-8",
    )
    return path


def _run(app_data: Path, *cli_args: str) -> int:
    return main(["--app-data-dir", str(app_data), *cli_args])


# --- read -----------------------------------------------------------------


def test_read_group(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    eml = _eml(tmp_path)
    assert _run(app_data, "read", str(eml)) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["source_type"] == "eml"
    assert payload["lines"] >= 0


def test_read_failure_exit_3(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    bad = tmp_path / "broken.pdf"
    bad.write_bytes(b"not a real pdf")
    assert _run(app_data, "read", str(bad)) == 3
    assert "read failure" in capsys.readouterr().err


# --- detect ---------------------------------------------------------------


def test_detect_group(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    eml = _eml(tmp_path)
    assert _run(app_data, "detect", str(eml)) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["provider_id"] == "test"


def test_detect_no_provider_exit_4(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    eml = _eml(tmp_path, subject="No Match At All")
    assert _run(app_data, "detect", str(eml)) == 4
    payload = json.loads(capsys.readouterr().out)
    assert payload["provider_id"] is None


# --- extract --------------------------------------------------------------


def test_extract_group(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    eml = _eml(tmp_path)
    assert _run(app_data, "extract", str(eml)) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["provider"]["provider_id"] == "test"


def test_extract_unmapped_produces_no_json(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    eml = _eml(tmp_path, subject="No Match At All")
    assert _run(app_data, "extract", str(eml)) == 0
    captured = capsys.readouterr()
    assert captured.out.strip() == ""  # no JSON emitted for an unmapped document
    assert "unmapped" in captured.err


# --- process --------------------------------------------------------------


def test_process_group(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    eml = _eml(tmp_path)
    assert _run(app_data, "process", str(eml)) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["record"]["provider"]["provider_id"] == "test"
    assert payload["created"] == []


def test_process_unmapped_marks_result(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    eml = _eml(tmp_path, subject="No Match At All")
    assert _run(app_data, "process", str(eml)) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["unmapped"] is True
    assert payload["created"] == []


# --- providers ------------------------------------------------------------


def test_providers_list_group(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    assert _run(app_data, "providers", "list") == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload[0]["id"] == "test"


def test_providers_import_invalid_exit_7(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    bad_catalog = tmp_path / "import.json"
    # A field rule missing the required "kind" violates the extraction-rule schema.
    bad_catalog.write_text(
        json.dumps(
            {
                "schema_version": 2,
                "providers": [
                    {
                        "id": "bad",
                        "name": "Bad",
                        "work_provider": "BAD",
                        "enabled": True,
                        "priority": 1,
                        "detect": {"required_phrases": ["x"]},
                        "field_rules": {"work_provider": {"id": "r", "labels": ["X"]}},
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    assert _run(app_data, "providers", "import", str(bad_catalog)) == 7
    assert "validation failed" in capsys.readouterr().err


def test_providers_import_merge_ok(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    good = tmp_path / "import.json"
    good.write_text(json.dumps(CATALOG), encoding="utf-8")
    assert _run(app_data, "providers", "import", str(good), "--merge") == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["imported"] == 1


# --- rules ----------------------------------------------------------------


def test_rules_show_group(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    assert _run(app_data, "rules", "--provider", "test", "--field", "work_provider", "show") == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["kind"] == "manual"


def test_rules_set_unknown_kind_exit_2(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    code = _run(
        app_data, "rules", "--provider", "test", "--field", "vrm", "set", "--kind", "bogus"
    )
    assert code == 2
    assert "Unknown rule kind" in capsys.readouterr().err


def test_rules_run_group(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    eml = _eml(tmp_path)
    assert (
        _run(app_data, "rules", "--provider", "test", "--field", "work_provider", "run", str(eml))
        == 0
    )
    payload = json.loads(capsys.readouterr().out)
    assert payload["value"] == "TEST"
    assert "source_span" in payload
    assert "issues" in payload


# --- export ---------------------------------------------------------------


def test_export_docx_group(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    record = tmp_path / "record.json"
    record.write_text(
        json.dumps({"fields": {"work_provider": "TEST", "vrm": "AB12CDE"}}), encoding="utf-8"
    )
    out_dir = tmp_path / "out"
    assert _run(app_data, "export", "docx", "--record", str(record), "--out-dir", str(out_dir)) == 0
    payload = json.loads(capsys.readouterr().out)  # well-formed JSON status output
    created = Path(payload["created"])
    assert created.exists()
    assert created.suffix == ".docx"


def test_export_failure_exit_6(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    record = tmp_path / "record.json"
    # Blank work_provider -> EVAJsonExporter raises ValueError -> exit 6.
    record.write_text(json.dumps({"fields": {"work_provider": ""}}), encoding="utf-8")
    out_dir = tmp_path / "out"
    assert _run(app_data, "export", "json", "--record", str(record), "--out-dir", str(out_dir)) == 6
    assert "export failure" in capsys.readouterr().err


# --- images ---------------------------------------------------------------


def test_images_group(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    eml = _eml(tmp_path)
    out_dir = tmp_path / "imgs"
    # eml is unsupported for image extraction -> success False, but exit 0 + JSON.
    assert _run(app_data, "images", "extract", str(eml), "--out-dir", str(out_dir)) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["success"] is False
    assert payload["count"] == 0


# --- validate -------------------------------------------------------------


def test_validate_group(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    eml = _eml(tmp_path)
    out_dir = tmp_path / "validate_out"
    assert _run(app_data, "validate", str(eml), "--out-dir", str(out_dir)) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["count"] == 1
    assert payload["failures"] == 0
    assert Path(payload["summary"]).exists()


# --- version --------------------------------------------------------------


def test_version_group(tmp_path, capsys):
    app_data = _appdata(tmp_path)
    assert _run(app_data, "version") == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["version"]
    assert payload["python"]


# --- python -m cedocumentmapper_v2 ---------------------------------------


def test_python_dash_m_entrypoint():
    repo_root = Path(__file__).resolve().parents[1]
    # The package lives under src/ (setuptools src-layout); make it importable for
    # the subprocess the same way pytest's pythonpath=["src"] does for the suite.
    import os

    env = dict(os.environ)
    src = str(repo_root / "src")
    env["PYTHONPATH"] = src + os.pathsep + env.get("PYTHONPATH", "")
    result = subprocess.run(
        [sys.executable, "-m", "cedocumentmapper_v2", "version"],
        capture_output=True,
        text=True,
        cwd=str(repo_root),
        env=env,
    )
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["version"]
