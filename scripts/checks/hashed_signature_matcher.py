#!/usr/bin/env python3
"""Hashed forbidden-signature matcher — Python mirror of hashed-signature-matcher.mjs.

This module is the Python half of an unavoidable cross-language matcher mirror. The
Node half is ``scripts/checks/hashed-signature-matcher.mjs``; both consume the single
shared vocabulary file ``scripts/checks/forbidden-signatures.json`` and must produce
identical signature IDs (or identical corpus-rejection outcomes) for the same input.
The synchronization contract is the shared vector suite
``scripts/checks/forbidden-signature-vectors.json``, executed against both
implementations by ``scripts/checks/forbidden-signature-parity.test.mjs``. See
``scripts/checks/forbidden-signature-matcher-parity.md``.

Any behavioural change to one matcher MUST be mirrored in the other and the parity
vectors kept green. This file is standard-library only so the parity harness runs
without the binary-scanner's third-party dependencies.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from typing import Callable
from urllib.parse import unquote_plus


def fnv1a32(value: str) -> str:
    result = 0x811C9DC5
    for character in value:
        result ^= ord(character)
        result = (result * 0x01000193) & 0xFFFFFFFF
    return f"{result:08x}"


def _build_signature_index(document) -> tuple[dict[int, dict[str, tuple[tuple[str, str], ...]]], int]:
    """Validate and index a signature document. Mirrors signatureIndex() in the .mjs.

    Fails closed on the same conditions as the Node implementation: unsupported
    document envelope, a non-positive adjacent-token limit, an empty or non-array
    signature set, an invalidly-shaped signature, or a duplicate identifier.
    """
    if (
        document.get("version") != 2
        or document.get("prefilter") != "fnv1a32"
        or document.get("digest") != "sha256"
    ):
        raise ValueError("Unsupported signature document")

    max_adjacent_tokens = document.get("maxAdjacentTokens")
    if (
        not isinstance(max_adjacent_tokens, int)
        or isinstance(max_adjacent_tokens, bool)
        or max_adjacent_tokens < 1
    ):
        raise ValueError("Signature document requires a positive maxAdjacentTokens")

    signatures = document.get("signatures")
    if not isinstance(signatures, list) or len(signatures) == 0:
        raise ValueError("Signature document requires at least one forbidden signature")

    mutable: dict[int, dict[str, list[tuple[str, str]]]] = {}
    identifiers: set[str] = set()
    for signature in signatures:
        identifier = signature.get("id") if isinstance(signature, dict) else None
        prefilter = signature.get("fnv1a32") if isinstance(signature, dict) else None
        digest_value = signature.get("sha256") if isinstance(signature, dict) else None
        length = signature.get("normalizedLength") if isinstance(signature, dict) else None
        if (
            not isinstance(identifier, str)
            or re.fullmatch(r"S\d{3}", identifier) is None
            or not isinstance(prefilter, str)
            or re.fullmatch(r"[a-f0-9]{8}", prefilter) is None
            or not isinstance(digest_value, str)
            or re.fullmatch(r"[a-f0-9]{64}", digest_value) is None
            or not isinstance(length, int)
            or isinstance(length, bool)
            or length < 1
        ):
            raise ValueError(f"Invalid hashed signature: {signature!r}")
        if identifier in identifiers:
            raise ValueError(f"Duplicate hashed signature identifier: {identifier}")
        identifiers.add(identifier)
        mutable.setdefault(length, {}).setdefault(prefilter, []).append((digest_value, identifier))

    frozen = {
        length: {prefilter: tuple(candidates) for prefilter, candidates in prefilters.items()}
        for length, prefilters in mutable.items()
    }
    return frozen, max_adjacent_tokens


def create_hashed_signature_matcher(document) -> Callable[[str], list[str]]:
    """Return a matcher callable mirroring createHashedSignatureMatcher() in the .mjs."""
    by_length, max_adjacent_tokens = _build_signature_index(document)
    lengths = sorted(by_length)
    max_length = max(lengths, default=0)

    def signature_ids_for(value: str) -> list[str]:
        identifiers: set[str] = set()
        tested: set[str] = set()

        def test_candidate(candidate: str) -> None:
            prefilters = by_length.get(len(candidate))
            if prefilters is None or candidate in tested:
                return
            tested.add(candidate)
            candidates = prefilters.get(fnv1a32(candidate))
            if candidates is None:
                return
            digest_value = hashlib.sha256(candidate.encode("utf-8")).hexdigest()
            identifiers.update(
                identifier
                for expected_digest, identifier in candidates
                if expected_digest == digest_value
            )

        variants = [value]
        decoded = value
        for _ in range(2):
            next_value = unquote_plus(decoded)
            if next_value == decoded:
                break
            variants.append(next_value)
            decoded = next_value

        for variant in variants:
            tokens = re.findall(r"[a-z0-9]+", variant.casefold())
            for token in tokens:
                if len(token) >= 40 and re.fullmatch(r"[a-f0-9]+", token) is not None:
                    continue
                for length in lengths:
                    if length > len(token):
                        break
                    for offset in range(len(token) - length + 1):
                        test_candidate(token[offset : offset + length])

            for start in range(len(tokens)):
                candidate = ""
                limit = min(len(tokens), start + max_adjacent_tokens)
                for end in range(start, limit):
                    candidate += tokens[end]
                    if len(candidate) > max_length:
                        break
                    if end > start:
                        test_candidate(candidate)

        return sorted(identifiers)

    return signature_ids_for


def _document_from_terms(terms, max_adjacent_tokens: int) -> dict:
    """Build a hashed signature document from plaintext non-sensitive parity terms."""
    signatures = []
    for entry in terms:
        term = entry["term"]
        signatures.append(
            {
                "id": entry["id"],
                "fnv1a32": fnv1a32(term),
                "sha256": hashlib.sha256(term.encode("utf-8")).hexdigest(),
                "normalizedLength": len(term),
            }
        )
    return {
        "version": 2,
        "prefilter": "fnv1a32",
        "digest": "sha256",
        "maxAdjacentTokens": max_adjacent_tokens,
        "signatures": signatures,
    }


def _run_vectors(vectors_path: str) -> dict:
    """Execute the shared parity vectors and emit results as JSON for the parity test."""
    fixture = json.loads(open(vectors_path, encoding="utf-8").read())
    document = _document_from_terms(fixture["signatureTerms"], fixture["maxAdjacentTokens"])
    matcher = create_hashed_signature_matcher(document)

    matches = {vector["name"]: matcher(vector["input"]) for vector in fixture["matchVectors"]}

    rejections = {}
    for vector in fixture["rejectionDocuments"]:
        try:
            create_hashed_signature_matcher(vector["document"])
            rejections[vector["name"]] = False
        except Exception:  # noqa: BLE001 - any construction failure is a rejection
            rejections[vector["name"]] = True

    return {"matches": matches, "rejections": rejections}


def _main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] == "--vectors":
        result = _run_vectors(argv[1])
        sys.stdout.write(json.dumps(result, sort_keys=True))
        sys.stdout.write("\n")
        return 0
    sys.stderr.write("usage: hashed_signature_matcher.py --vectors <path>\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
