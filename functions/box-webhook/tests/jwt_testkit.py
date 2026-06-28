"""Shared JWT test material for the box-webhook offline tests.

Generates a throwaway RSA keypair ONCE per test session so the JWT client can sign
real assertions OFFLINE (no network, no committed private key). Both test modules
build a valid JWT BoxConfig from here via ``jwt_box_config()``.
"""

from __future__ import annotations

import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

from box_client import BoxConfig  # noqa: E402

API_BASE = "https://api.box.com"
TEST_KID = "test-public-key-id"
TEST_PASSPHRASE = "test-passphrase"  # noqa: S105
TEST_ENTERPRISE_ID = "1234567"
TEST_CLIENT_ID = "fake-client-id"
# Same literal as the suite's FAKE_SECRET so "secret never logged" assertions hold.
TEST_CLIENT_SECRET = "bX+fake/box/secret+VALUE=="  # noqa: S105

# One throwaway 2048-bit RSA keypair, encrypted with the test passphrase (mirrors a
# real Box Config.JSON privateKey, which is always passphrase-protected).
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
TEST_PRIVATE_PEM = _KEY.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.BestAvailableEncryption(TEST_PASSPHRASE.encode()),
).decode()
TEST_PUBLIC_PEM = (
    _KEY.public_key()
    .public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    .decode()
)


def jwt_box_config(**overrides) -> BoxConfig:
    """A valid JWT BoxConfig wired to the throwaway test keypair. Override any field."""
    params = dict(
        client_id=TEST_CLIENT_ID,
        client_secret=TEST_CLIENT_SECRET,
        enterprise_id=TEST_ENTERPRISE_ID,
        jwt_public_key_id=TEST_KID,
        jwt_private_key=TEST_PRIVATE_PEM,
        jwt_passphrase=TEST_PASSPHRASE,
        api_base=API_BASE,
    )
    params.update(overrides)
    return BoxConfig(**params)
