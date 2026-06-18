"""Inspection-address matching — the ROADMAP-4a resolver (pure orchestration).

[BUILD] — authored offline. The only impurity in the *service* is the optional
postcode.io normalisation, which is injected (``PostcodeIoClient``) so this
module is unit-tested with a fake. NOTHING here reads Dataverse: the candidate
corpus rows (InspectionAddress + Repairer) are passed IN the request body by the
Power Automate flow, exactly like ``functions/evavalidation`` keeps the flow the
sole Dataverse caller (drift-free, stateless Function).

The problem (from ``loc_principal_analysis.md``)
------------------------------------------------
~57% of located cases carry a **part postcode** in ``Loc`` (a district / outward
code such as ``CH5``) — an incomplete inspection location. We resolve it to a
**full address** by finding a known site in the corpus whose postcode's district
``startswith`` the Case district. A district is frequently **shared by several
principals** (storage / recovery yards), so the district alone cannot pick the
provider — we therefore scope candidates by the Case's **principal** first, only
widening to district-shared sites when nothing principal-specific exists.

The inviolable rule (mirrors ``mockup-app/src/domain/address-policy.ts``)
-------------------------------------------------------------------------
This service NEVER emits ``Image Based Assessment`` on its own. It either:
  * resolves a physical 6-line address (``decisionMode`` ``confirmed_physical`` /
    ``manual``) when a confident match exists, OR
  * returns ``candidates`` + ``needsReviewerDecision`` and leaves field 9 unset.
The image-based literal is only serialised when the **caller** passes an explicit
reviewer decision carrying a non-empty reason (``serialize_inspection_address``).
"""

from __future__ import annotations

from typing import Any

from postcode import (
    IMAGE_BASED_LITERAL,
    district_matches,
    outward_of,
    parse_postcode,
    serialize_six_lines,
)
from postcode_client import PostcodeIoClient

# Decision-mode names — must match dataverse/choicesets/inspection-decision-mode.json.
DM_CONFIRMED_PHYSICAL = "confirmed_physical"
DM_MANUAL = "manual"
DM_IMAGE_BASED = "image_based"
DM_UNKNOWN = "unknown"

# Source kinds carried by a candidate (for ranking + display).
_SOURCE_REPAIRER = "repairer"
_SOURCE_INSPECTION_ADDRESS = "inspection_address"


def _clean(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _address_lines(row: dict[str, Any]) -> list[str]:
    """Pull the 6 address lines from a corpus row in column OR contract form.

    Accepts both Dataverse columns (``cr1bd_addressline1``…) and bare contract
    keys (``addressLine1`` / ``line1``) so the flow can hand raw rows through.
    """
    out: list[str] = []
    for i in range(1, 7):
        val = (
            row.get(f"cr1bd_addressline{i}")
            or row.get(f"addressLine{i}")
            or row.get(f"addressline{i}")
            or row.get(f"line{i}")
        )
        out.append(_clean(val))
    return out


def _row_postcode(row: dict[str, Any]) -> str:
    return _clean(row.get("cr1bd_postcode") or row.get("postcode"))


def _row_name(row: dict[str, Any]) -> str:
    return _clean(row.get("cr1bd_name") or row.get("name") or row.get("label"))


def _row_principals(row: dict[str, Any]) -> set[str]:
    """The principal code(s) a candidate site is linked to, UPPERCASE.

    A Repairer is N:N with WorkProvider; an InspectionAddress reference row may
    carry the seeding principal. The flow flattens linked codes into
    ``principalCodes`` (list) and/or a single ``principalCode``.
    """
    codes: set[str] = set()
    one = _clean(row.get("principalCode") or row.get("principal") or row.get("cr1bd_principalcode"))
    if one:
        codes.add(one.upper())
    many = row.get("principalCodes") or row.get("principals")
    if isinstance(many, list):
        for c in many:
            cc = _clean(c)
            if cc:
                codes.add(cc.upper())
    return codes


def rank_candidates(
    *,
    case_loc: str | None,
    principal_code: str | None,
    inspection_addresses: list[dict[str, Any]] | None,
    repairers: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Return matching known sites for the Case district, best first.

    A row is a candidate iff its postcode's district ``startswith`` the Case's
    outward code (ROADMAP-4a). Ranking, descending:
      1. ``principalMatch`` — the site is linked to this Case's principal
         (resolves the shared-yard ambiguity).
      2. ``exactDistrict``  — the site's outward code EQUALS the Case district
         (vs a broader ``startswith`` only).
      3. source — a ``Repairer`` (a real garage CE deals with) over a bare
         ``InspectionAddress`` reference row.
      4. has a full postcode present.

    Pure: no postcode.io here (the corpus postcodes are already normalised).
    """
    parsed = parse_postcode(case_loc)
    # Corpus matching applies ONLY to a part (district-only) Loc. A full postcode
    # is already the location (resolved directly in ``resolve``); a non-postcode
    # Loc has no district to match. Both carry no corpus candidates.
    if parsed.kind != "part":
        return []
    case_outward = parsed.outward
    if not case_outward:
        return []  # defensive: a part postcode always has an outward code

    pc = (principal_code or "").strip().upper()
    candidates: list[dict[str, Any]] = []

    def consider(row: dict[str, Any], source: str) -> None:
        postcode = _row_postcode(row)
        if not district_matches(case_outward, postcode):
            return
        principals = _row_principals(row)
        cand_out = outward_of(postcode)
        candidates.append(
            {
                "label": _row_name(row),
                "addressLines": _address_lines(row),
                "postcode": postcode,
                "district": cand_out,
                "source": source,
                "principalMatch": bool(pc and pc in principals),
                "exactDistrict": cand_out == case_outward,
                "repairerId": _clean(row.get("cr1bd_repairerid") or row.get("repairerId")) or None,
                "inspectionAddressId": _clean(
                    row.get("cr1bd_inspectionaddressid") or row.get("inspectionAddressId")
                )
                or None,
            }
        )

    for row in repairers or []:
        if isinstance(row, dict):
            consider(row, _SOURCE_REPAIRER)
    for row in inspection_addresses or []:
        if isinstance(row, dict):
            consider(row, _SOURCE_INSPECTION_ADDRESS)

    candidates.sort(
        key=lambda c: (
            c["principalMatch"],
            c["exactDistrict"],
            c["source"] == _SOURCE_REPAIRER,
            bool(c["postcode"]),
        ),
        reverse=True,
    )
    return candidates


def _auto_resolvable(candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The single confident candidate to auto-fill, or ``None`` (needs a human).

    Confident = there is a UNIQUE best candidate that is linked to the Case's
    principal. If the top two candidates are both principal-linked (a genuinely
    ambiguous shared site) OR the best is only district-shared (not linked to
    this principal), we do NOT auto-resolve — the reviewer picks.
    """
    if not candidates:
        return None
    best = candidates[0]
    if not best["principalMatch"]:
        return None  # only district-shared sites — too weak to auto-fill
    if len(candidates) > 1 and candidates[1]["principalMatch"]:
        # Two principal-linked sites in the same district: ambiguous, ask a human.
        return None
    return best


def normalize_with_postcodeio(
    candidate: dict[str, Any],
    *,
    client: PostcodeIoClient | None,
    azure_maps_enabled: bool,
    warnings: list[str],
) -> dict[str, Any]:
    """Best-effort postcode.io normalisation of the chosen candidate's postcode.

    Honours the gate: when ``AZURE_MAPS_ENABLED`` is true the matcher defers to a
    (future) Azure Maps path and this normalisation is skipped with a note; when
    false (the M1 default) we call postcode.io. Always fail-soft — a failure
    leaves the candidate's own postcode untouched and records a warning.
    """
    if azure_maps_enabled:
        warnings.append(
            "AZURE_MAPS_ENABLED is true; postcode.io normalisation skipped "
            "(Azure Maps path not implemented in M1 — candidate postcode used as-is)."
        )
        return candidate
    if client is None:
        return candidate

    pc = candidate.get("postcode") or ""
    if not pc:
        return candidate
    result = client.lookup_postcode(pc)
    if not result:
        warnings.append(
            f"postcode.io could not confirm '{pc}'; using the corpus postcode unchanged."
        )
        return candidate

    normalised = _clean(result.get("postcode"))
    if normalised:
        out = dict(candidate)
        out["postcode"] = normalised
        out["postcodeValidated"] = True
        district = _clean(result.get("admin_district"))
        if district:
            out["adminDistrict"] = district
        return out
    return candidate


def resolve(
    *,
    case_loc: str | None,
    principal_code: str | None,
    inspection_addresses: list[dict[str, Any]] | None,
    repairers: list[dict[str, Any]] | None,
    reviewer_decision: dict[str, Any] | None = None,
    azure_maps_enabled: bool = False,
    postcode_client: PostcodeIoClient | None = None,
) -> dict[str, Any]:
    """Resolve a Case's inspection location to the EVA field-9 decision.

    Returns (always — matching is advisory, like enrichment):
        {
          "decisionMode": "confirmed_physical"|"manual"|"image_based"|"unknown",
          "inspectionAddress": "<6 lines>" | "Image Based Assessment" | None,
          "matched": bool,                 # an address was auto-resolved
          "candidates": [ {label, addressLines, postcode, district,
                           source, principalMatch, exactDistrict, …}, … ],
          "needsReviewerDecision": bool,   # a human must choose / confirm
          "locKind": "full"|"part"|"none",
          "district": "<outward>"|"",
          "warnings": [ … ],
          "reason"?: "<echoed reviewer reason when image-based>",
        }

    Order of precedence:
      1. An explicit reviewer decision (image-based-with-reason, or pick a
         candidate) is honoured first — the human is authoritative.
      2. A full-postcode ``Loc`` needs no district match; it is normalised and
         returned as a confirmed physical address.
      3. A part-postcode ``Loc`` is matched against the corpus; a unique
         principal-linked site auto-resolves, otherwise candidates are surfaced.
    """
    warnings: list[str] = []
    parsed = parse_postcode(case_loc)

    base: dict[str, Any] = {
        "decisionMode": DM_UNKNOWN,
        "inspectionAddress": None,
        "matched": False,
        "candidates": [],
        "needsReviewerDecision": False,
        "locKind": parsed.kind,
        "district": parsed.outward,
        "warnings": warnings,
    }

    # ---- 1) Explicit reviewer decision wins ------------------------------
    if isinstance(reviewer_decision, dict):
        decided = _apply_reviewer_decision(
            reviewer_decision,
            case_loc=case_loc,
            principal_code=principal_code,
            inspection_addresses=inspection_addresses,
            repairers=repairers,
            azure_maps_enabled=azure_maps_enabled,
            postcode_client=postcode_client,
            warnings=warnings,
        )
        if decided is not None:
            decided.setdefault("locKind", parsed.kind)
            decided.setdefault("district", parsed.outward)
            decided["warnings"] = warnings
            return decided
        # Decision was image-based WITHOUT a reason (or malformed) -> fall through
        # to a gate; we must NEVER silently emit image-based.
        warnings.append(
            "reviewer decision present but not actionable (image-based needs a "
            "non-empty reason, or no candidate index supplied); awaiting a valid decision."
        )
        base["needsReviewerDecision"] = True
        return base

    # ---- 2) A full postcode already IS the location ----------------------
    if parsed.kind == "full":
        chosen = {
            "label": "",
            "addressLines": [],
            "postcode": parsed.normalized,
            "district": parsed.outward,
            "source": "case_loc",
            "principalMatch": False,
            "exactDistrict": True,
        }
        chosen = normalize_with_postcodeio(
            chosen,
            client=postcode_client,
            azure_maps_enabled=azure_maps_enabled,
            warnings=warnings,
        )
        base["decisionMode"] = DM_CONFIRMED_PHYSICAL
        base["matched"] = True
        base["inspectionAddress"] = serialize_six_lines(
            chosen.get("addressLines") or [], chosen.get("postcode")
        )
        base["chosen"] = chosen
        return base

    # ---- 3) Non-postcode Loc: nothing to match on ------------------------
    if parsed.kind == "none":
        warnings.append(
            "Loc is empty or not a UK postcode; no district to match. "
            "Reviewer must enter the address or record an image-based decision (+reason)."
        )
        base["needsReviewerDecision"] = True
        return base

    # ---- 3) Part postcode: match the corpus by district + principal ------
    candidates = rank_candidates(
        case_loc=case_loc,
        principal_code=principal_code,
        inspection_addresses=inspection_addresses,
        repairers=repairers,
    )
    base["candidates"] = candidates

    if not candidates:
        warnings.append(
            f"No known site in district '{parsed.outward}' for principal "
            f"'{(principal_code or '').upper() or '?'}'. Reviewer must resolve the address."
        )
        base["needsReviewerDecision"] = True
        return base

    auto = _auto_resolvable(candidates)
    if auto is None:
        warnings.append(
            f"{len(candidates)} candidate site(s) in district '{parsed.outward}'; "
            "no single principal-linked match — reviewer must choose."
        )
        base["needsReviewerDecision"] = True
        return base

    auto = normalize_with_postcodeio(
        auto, client=postcode_client, azure_maps_enabled=azure_maps_enabled, warnings=warnings
    )
    # A site carried over from a Repairer is a confirmed physical site; one only
    # inferred from a reference InspectionAddress is treated as 'manual' (still a
    # real address, but flag it as system-suggested for the reviewer's eye).
    base["decisionMode"] = (
        DM_CONFIRMED_PHYSICAL if auto["source"] == _SOURCE_REPAIRER else DM_MANUAL
    )
    base["matched"] = True
    base["inspectionAddress"] = serialize_six_lines(
        auto.get("addressLines") or [], auto.get("postcode")
    )
    base["chosen"] = auto
    return base


def _apply_reviewer_decision(
    decision: dict[str, Any],
    *,
    case_loc: str | None,
    principal_code: str | None,
    inspection_addresses: list[dict[str, Any]] | None,
    repairers: list[dict[str, Any]] | None,
    azure_maps_enabled: bool,
    postcode_client: PostcodeIoClient | None,
    warnings: list[str],
) -> dict[str, Any] | None:
    """Honour an explicit reviewer decision. Returns ``None`` when the decision
    is image-based but carries no reason (caller then raises the gate).

    Accepted shapes:
      * ``{"choice": "image_based", "reason": "<non-empty>"}``  -> the literal.
      * ``{"choice": "use_candidate", "candidateIndex": <int>}`` -> that candidate.
      * ``{"choice": "manual_address", "addressLines": [...], "postcode": "..."}``.
    """
    choice = _clean(decision.get("choice"))

    if choice == "image_based":
        reason = _clean(decision.get("reason"))
        if not reason:
            return None  # INVIOLABLE: no image-based without a reason
        return {
            "decisionMode": DM_IMAGE_BASED,
            "inspectionAddress": IMAGE_BASED_LITERAL,
            "matched": True,
            "candidates": [],
            "needsReviewerDecision": False,
            "reason": reason,
        }

    if choice == "use_candidate":
        ranked = rank_candidates(
            case_loc=case_loc,
            principal_code=principal_code,
            inspection_addresses=inspection_addresses,
            repairers=repairers,
        )
        idx = decision.get("candidateIndex")
        if isinstance(idx, int) and 0 <= idx < len(ranked):
            chosen = normalize_with_postcodeio(
                ranked[idx],
                client=postcode_client,
                azure_maps_enabled=azure_maps_enabled,
                warnings=warnings,
            )
            return {
                "decisionMode": DM_CONFIRMED_PHYSICAL
                if chosen["source"] == _SOURCE_REPAIRER
                else DM_MANUAL,
                "inspectionAddress": serialize_six_lines(
                    chosen.get("addressLines") or [], chosen.get("postcode")
                ),
                "matched": True,
                "candidates": ranked,
                "needsReviewerDecision": False,
                "chosen": chosen,
            }
        warnings.append("reviewer chose a candidate index that is out of range.")
        return None

    if choice == "manual_address":
        lines = decision.get("addressLines")
        lines = lines if isinstance(lines, list) else []
        chosen = {
            "addressLines": [_clean(x) for x in lines],
            "postcode": _clean(decision.get("postcode")),
        }
        chosen = normalize_with_postcodeio(
            chosen, client=postcode_client, azure_maps_enabled=azure_maps_enabled, warnings=warnings
        )
        return {
            "decisionMode": DM_MANUAL,
            "inspectionAddress": serialize_six_lines(
                chosen.get("addressLines") or [], chosen.get("postcode")
            ),
            "matched": True,
            "candidates": [],
            "needsReviewerDecision": False,
            "chosen": chosen,
        }

    # Unknown choice -> not actionable.
    return None


def serialize_inspection_address(
    address_lines: list[str] | None, postcode: str | None
) -> str:
    """Public helper: render a physical address to the EVA 6-line field."""
    return serialize_six_lines(address_lines or [], postcode)
