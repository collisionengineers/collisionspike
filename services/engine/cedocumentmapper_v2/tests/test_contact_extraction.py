"""Claimant contact (email) exclusion regressions for collisionspike TKT-233.

A live PCH instruction PDF quoted OUR OWN intake address
(engineers@collisionengineers.co.uk) in its "send the report to" boilerplate and
the engine harvested it as the CLAIMANT's email. Any address at our own domain
(or a subdomain such as noreply.collisionengineers.co.uk) must be rejected by
``RuleEngine._is_non_claimant_email`` — blank beats wrong. All fixture text
below is synthetic; no real case data.
"""

from __future__ import annotations

from pathlib import Path

from cedocumentmapper_v2.domain.models import (
    DocumentLine,
    DocumentModel,
    DocumentPage,
    FieldKey,
)
from cedocumentmapper_v2.rules import RuleEngine


def _doc(*text_lines: str) -> DocumentModel:
    lines = tuple(
        DocumentLine(text=text, page_index=0, line_index=index)
        for index, text in enumerate(text_lines)
    )
    return DocumentModel(
        source_path=Path("synthetic.pdf"),
        source_type="pdf",
        pages=(DocumentPage(page_index=0, lines=lines),),
        plain_text="\n".join(text_lines),
    )


_PROVIDER = {
    "id": "demo",
    "name": "Demo Provider",
    "work_provider": "Demo Provider",
    "field_rules": {},
}


def _extract(*text_lines: str):
    return RuleEngine().extract_record(_doc(*text_lines), _PROVIDER).fields


def test_own_intake_address_is_not_claimant_email():
    """Instruction boilerplate quoting OUR intake mailbox must never win —
    even as the sole address in the document (the live PCH defect shape)."""
    fields = _extract(
        "Vehicle Inspection Instruction",
        "Please forward the completed engineer's report to",
        "engineers@collisionengineers.co.uk",
        "Name: Mr Sample Claimant",
        "VRM: AB12 CDE",
    )
    assert fields[FieldKey.CLAIMANT_EMAIL].value == ""


def test_own_domain_is_rejected_even_with_claimant_context():
    """An own-domain address sitting inside claimant context lines still loses."""
    fields = _extract(
        "Our client: Mr Sample Claimant",
        "info@collisionengineers.co.uk",
        "VRM: AB12 CDE",
    )
    assert fields[FieldKey.CLAIMANT_EMAIL].value == ""


def test_own_subdomain_is_rejected():
    """Subdomains of our domain (website form sender) are ours too."""
    fields = _extract(
        "Claimant Email: mail@noreply.collisionengineers.co.uk",
        "VRM: AB12 CDE",
    )
    assert fields[FieldKey.CLAIMANT_EMAIL].value == ""


def test_genuine_claimant_email_still_extracted_alongside_own_address():
    """The exclusion must not suppress the claimant's real address."""
    fields = _extract(
        "Our client: Mr Sample Claimant",
        "Claimant Email: sample.claimant@example.co.uk",
        "Return the report to engineers@collisionengineers.co.uk",
        "VRM: AB12 CDE",
    )
    assert fields[FieldKey.CLAIMANT_EMAIL].value == "sample.claimant@example.co.uk"
