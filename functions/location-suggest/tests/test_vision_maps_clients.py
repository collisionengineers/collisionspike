"""Unit tests for the Vision + Maps clients with httpx MockTransport.

No network, no Azure key, deterministic. The clients accept an injected
httpx transport, so we assert the request shape (URL/params/headers) and the
response projection without ever leaving the process.
"""

from __future__ import annotations

import json

import httpx
import pytest

import maps_client as mc
import vision_client as vc
from maps_client import MapsClient, MapsConfig, MapsError, MapsNotConfigured
from vision_client import VisionClient, VisionConfig, VisionError, VisionNotConfigured


# --------------------------------------------------------------------------- #
# Vision config from env (Key Vault references)                              #
# --------------------------------------------------------------------------- #
def test_vision_config_from_env(monkeypatch):
    monkeypatch.setenv("AZURE_VISION_ENDPOINT", "https://v.example.com/")
    monkeypatch.setenv("AZURE_VISION_KEY", "secret-from-kv")
    cfg = VisionConfig.from_env()
    assert cfg.endpoint == "https://v.example.com"  # trailing slash trimmed
    assert cfg.analyze_url == "https://v.example.com/computervision/imageanalysis:analyze"
    # the key is never echoed in repr
    assert "secret-from-kv" not in repr(cfg)
    assert "<redacted>" in repr(cfg)


def test_vision_config_missing_raises_not_configured(monkeypatch):
    monkeypatch.delenv("AZURE_VISION_ENDPOINT", raising=False)
    monkeypatch.delenv("AZURE_VISION_KEY", raising=False)
    with pytest.raises(VisionNotConfigured) as exc:
        VisionConfig.from_env()
    # names only, never values
    assert "AZURE_VISION_ENDPOINT" in str(exc.value)
    assert "AZURE_VISION_KEY" in str(exc.value)


# --------------------------------------------------------------------------- #
# Vision analyze: request shape + payload projection                         #
# --------------------------------------------------------------------------- #
def test_vision_analyze_parses_ocr_and_tags():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["key"] = request.headers.get("Ocp-Apim-Subscription-Key")
        captured["content_type"] = request.headers.get("Content-Type")
        captured["body"] = request.content
        payload = {
            "readResult": {
                "blocks": [
                    {"lines": [{"text": "Smith Recovery", "confidence": 0.97}, {"text": "", "confidence": 0.1}]}
                ]
            },
            "tagsResult": {"values": [{"name": "garage", "confidence": 0.88}]},
        }
        return httpx.Response(200, json=payload)

    cfg = VisionConfig(endpoint="https://v.example.com", key="k", api_version="2024-02-01")
    client = VisionClient(cfg, transport=httpx.MockTransport(handler))
    result = client.analyze(b"\x89PNG-bytes")

    assert "imageanalysis:analyze" in captured["url"]
    assert "features=read%2Ctags" in captured["url"] or "features=read,tags" in captured["url"]
    assert "api-version=2024-02-01" in captured["url"]
    assert captured["key"] == "k"
    assert captured["content_type"] == "application/octet-stream"
    assert captured["body"] == b"\x89PNG-bytes"

    assert [l.text for l in result.ocr_lines] == ["Smith Recovery"]  # blank dropped
    assert result.ocr_lines[0].confidence == 0.97
    assert [t.name for t in result.tags] == ["garage"]


def test_vision_analyze_401_raises_vision_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="unauthorized")

    cfg = VisionConfig(endpoint="https://v.example.com", key="bad")
    client = VisionClient(cfg, transport=httpx.MockTransport(handler))
    with pytest.raises(VisionError) as exc:
        client.analyze(b"x")
    assert exc.value.status == 401
    # never echoes the body
    assert "unauthorized" not in str(exc.value)


def test_vision_analyze_500_raises_vision_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    cfg = VisionConfig(endpoint="https://v.example.com", key="k")
    client = VisionClient(cfg, transport=httpx.MockTransport(handler))
    with pytest.raises(VisionError) as exc:
        client.analyze(b"x")
    assert exc.value.status == 500


def test_vision_analyze_tolerates_missing_sections():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})  # no readResult / tagsResult

    cfg = VisionConfig(endpoint="https://v.example.com", key="k")
    client = VisionClient(cfg, transport=httpx.MockTransport(handler))
    result = client.analyze(b"x")
    assert result.ocr_lines == []
    assert result.tags == []


# --------------------------------------------------------------------------- #
# Maps config from env (Key Vault reference)                                 #
# --------------------------------------------------------------------------- #
def test_maps_config_from_env(monkeypatch):
    monkeypatch.setenv("AZURE_MAPS_KEY", "maps-secret")
    monkeypatch.delenv("AZURE_MAPS_ENDPOINT", raising=False)
    cfg = MapsConfig.from_env()
    assert cfg.endpoint == "https://atlas.microsoft.com"
    assert cfg.country_set == "GB"
    assert "maps-secret" not in repr(cfg)
    assert "<redacted>" in repr(cfg)


def test_maps_config_missing_key_raises(monkeypatch):
    monkeypatch.delenv("AZURE_MAPS_KEY", raising=False)
    with pytest.raises(MapsNotConfigured) as exc:
        MapsConfig.from_env()
    assert "AZURE_MAPS_KEY" in str(exc.value)


# --------------------------------------------------------------------------- #
# Maps geocode: request shape + payload projection                          #
# --------------------------------------------------------------------------- #
def test_maps_geocode_parses_results_and_uk_bias():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        payload = {
            "results": [
                {
                    "address": {
                        "freeformAddress": "Smith Recovery, Acton, London W3 7QE",
                        "streetNameAndNumber": "1 High Street",
                        "municipality": "Acton",
                        "countrySubdivision": "London",
                        "postalCode": "W3 7QE",
                    },
                    "position": {"lat": 51.5, "lon": -0.27},
                    "score": 0.91,
                },
                {"address": {"freeformAddress": ""}},  # dropped (no freeform)
            ]
        }
        return httpx.Response(200, json=payload)

    cfg = MapsConfig(key="k")
    client = MapsClient(cfg, transport=httpx.MockTransport(handler))
    results = client.geocode("Smith Recovery", limit=3)

    assert "countrySet=GB" in captured["url"]
    assert "subscription-key=k" in captured["url"]
    assert "query=Smith+Recovery" in captured["url"] or "query=Smith%20Recovery" in captured["url"]

    assert len(results) == 1
    r = results[0]
    assert r.postcode == "W3 7QE"
    assert r.lat == 51.5
    assert r.score == 0.91
    assert "1 High Street" in r.address_lines
    # postcode is carried separately, NOT duplicated into the lines
    assert "W3 7QE" not in r.address_lines


def test_maps_search_poi_uses_fuzzy_endpoint():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "address": {"freeformAddress": "Smith Recovery, Acton", "municipality": "Acton"},
                        "position": {"lat": 51.5, "lon": -0.27},
                        "score": 0.88,
                    }
                ]
            },
        )

    client = MapsClient(MapsConfig(key="k"), transport=httpx.MockTransport(handler))
    results = client.search_poi("Smith Recovery", limit=2)
    assert "/search/fuzzy/json" in captured["url"]  # POI/fuzzy, not /search/address/
    assert "countrySet=GB" in captured["url"]
    assert len(results) == 1 and results[0].score == 0.88


def test_maps_geocode_empty_query_returns_empty_without_call():
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("must not call Maps for an empty query")

    client = MapsClient(MapsConfig(key="k"), transport=httpx.MockTransport(handler))
    assert client.geocode("   ") == []


def test_maps_geocode_403_raises():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, text="forbidden")

    client = MapsClient(MapsConfig(key="bad"), transport=httpx.MockTransport(handler))
    with pytest.raises(MapsError) as exc:
        client.geocode("anywhere")
    assert exc.value.status == 403


def test_maps_geocode_503_raises():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    client = MapsClient(MapsConfig(key="k"), transport=httpx.MockTransport(handler))
    with pytest.raises(MapsError) as exc:
        client.geocode("anywhere")
    assert exc.value.status == 503
