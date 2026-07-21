from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPT_DIR.parents[2]

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

spec = importlib.util.spec_from_file_location("run_eval", SCRIPT_DIR / "run_eval.py")
run_eval = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(run_eval)

spec2 = importlib.util.spec_from_file_location("run_ab_parsefed", SCRIPT_DIR / "run_ab_parsefed.py")
run_ab_parsefed = importlib.util.module_from_spec(spec2)
assert spec2.loader
spec2.loader.exec_module(run_ab_parsefed)


class LoadEmailAttachmentBytesTests(unittest.TestCase):
    """PLAN-014 Slice 3 — the loader addition compare_item()/_derive_content_typings()
    depend on. Uses a real, already-tracked manifest item rather than a synthetic
    fixture, per this corpus's own real-email-only convention."""

    def _first_item_with_attachment(self):
        items = run_eval.load_manifest(SCRIPT_DIR / "manifest.json")
        for item in items:
            if not item.get("tracked", True):
                continue
            path = run_eval.resolve_manifest_file(item)
            if path is None or not path.exists():
                continue
            attachments = run_eval.load_email_attachment_bytes(path)
            if attachments:
                return item, path, attachments
        return None, None, []

    def test_returns_real_bytes_for_a_tracked_item_with_attachments(self):
        item, path, attachments = self._first_item_with_attachment()
        self.assertIsNotNone(item, "expected at least one tracked corpus item with a real attachment")
        for filename, data in attachments:
            self.assertIsInstance(filename, str)
            self.assertGreater(len(filename), 0)
            self.assertIsInstance(data, bytes)
            self.assertGreater(len(data), 0)

    def test_bare_email_with_no_attachments_returns_empty_list(self):
        items = run_eval.load_manifest(SCRIPT_DIR / "manifest.json")
        for item in items:
            if not item.get("tracked", True):
                continue
            path = run_eval.resolve_manifest_file(item)
            if path is None or not path.exists():
                continue
            fields = run_eval.load_email_fields(path)
            if not fields["has_attachments"]:
                attachments = run_eval.load_email_attachment_bytes(path)
                self.assertEqual(attachments, [])
                return
        self.skipTest("no tracked no-attachment corpus item found")


class CompareItemTests(unittest.TestCase):
    """Exercises compare_item() end-to-end (real engine, real corpus item) — proves
    the OLD/NEW delta record is well-formed, not just that it runs without error."""

    def test_compare_item_produces_a_well_formed_delta(self):
        items = run_eval.load_manifest(SCRIPT_DIR / "manifest.json")
        item = next((i for i in items if i.get("id") == "tkt043-images-existing-case"), None)
        self.assertIsNotNone(item, "tkt043-images-existing-case must exist in the manifest")
        delta = run_ab_parsefed.compare_item(item, "v2")
        self.assertIsNotNone(delta)
        for key in (
            "id",
            "content_typings_found",
            "expected_category",
            "old_category",
            "new_category",
            "old_correct",
            "new_correct",
            "changed",
        ):
            self.assertIn(key, delta)
        self.assertEqual(delta["id"], "tkt043-images-existing-case")


class OrderParseCandidatesTests(unittest.TestCase):
    """Fix (automated-review): the harness must feed the engine only the LIVE candidate set —
    matching parse.ts's orderParseCandidates().slice(0, MAX_PARSE_DOCS) — so it never derives a
    typing from an attachment the live intake would never parse."""

    def _att(self, name):
        return (name, b"x")

    def test_word_and_rtf_ordered_before_pdf(self):
        ordered = run_ab_parsefed._order_parse_candidates(
            [self._att("report.pdf"), self._att("instruction.doc")]
        )
        self.assertEqual([f for f, _ in ordered], ["instruction.doc", "report.pdf"])

    def test_capped_at_max_parse_docs(self):
        atts = [self._att(f"doc{i}.docx") for i in range(5)]
        ordered = run_ab_parsefed._order_parse_candidates(atts)
        self.assertEqual(len(ordered), run_ab_parsefed._MAX_PARSE_DOCS)

    def test_images_and_non_docs_excluded(self):
        self.assertEqual(
            run_ab_parsefed._order_parse_candidates([self._att("IMG_1.jpg"), self._att("photo.png")]),
            [],
        )

    def test_email_files_are_last_resort_only(self):
        with_doc = run_ab_parsefed._order_parse_candidates(
            [self._att("forwarded.eml"), self._att("instruction.pdf")]
        )
        self.assertEqual([f for f, _ in with_doc], ["instruction.pdf"])
        only_email = run_ab_parsefed._order_parse_candidates([self._att("forwarded.eml")])
        self.assertEqual([f for f, _ in only_email], ["forwarded.eml"])


if __name__ == "__main__":
    unittest.main()
