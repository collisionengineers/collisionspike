"""Offline Box JWT credential check — mirrors ``box_client.py``'s token mint.

Run this to verify a downloaded Box ``Config.JSON`` actually authenticates BEFORE
wiring it into Key Vault (see ``docs/azure/box-activation.md``). It contacts ONLY
``api.box.com`` — no Azure, no tenant. It is **read-only**: it mints a Service-Account
token and reads one folder; it mutates nothing in Box. It prints only non-secret
signal (status codes, the folder name/id, token length) — never the token, key, or
secret value.

Usage:
    python functions/box-webhook/tools/check_box_credentials.py [path-to-config.json] [allowed-root-id]

Defaults: the gitignored repo-root drop ``941197__config.json`` and root ``392761581105``.
Requires: httpx, pyjwt, cryptography (already in requirements.txt).

Exit codes: 0 = auth works; 2 = bad/missing key; 3 = Box rejected the token.

Proven working 2026-06-28 (token mint 200 + folder GET 200).
"""
from __future__ import annotations

import json
import secrets
import sys
import time
from email.utils import parsedate_to_datetime

import httpx
import jwt
from cryptography.hazmat.primitives.serialization import load_pem_private_key

CONFIG_PATH = sys.argv[1] if len(sys.argv) > 1 else "941197__config.json"
ALLOWED_ROOT_ID = sys.argv[2] if len(sys.argv) > 2 else "392761581105"
TOKEN_URL = "https://api.box.com/oauth2/token"
JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer"
ASSERTION_TTL_S = 45
ALGO = "RS512"


def main() -> int:
    with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
        doc = json.load(fh)

    app = doc["boxAppSettings"]
    auth = app["appAuth"]
    client_id = app["clientID"].strip()
    client_secret = app["clientSecret"]
    enterprise_id = str(doc["enterpriseID"]).strip()
    public_key_id = auth["publicKeyID"].strip()
    private_key_pem = auth["privateKey"]
    passphrase = auth["passphrase"]

    print(f"[config] clientID=...{client_id[-6:]}  enterpriseID={enterprise_id}  publicKeyID={public_key_id}")
    print(f"[config] privateKey present={bool(private_key_pem)}  passphrase present={bool(passphrase)}")

    # 1) Decrypt the RSA private key with its passphrase.
    try:
        priv = load_pem_private_key(
            private_key_pem.encode("utf-8"),
            password=passphrase.encode("utf-8") if passphrase else None,
        )
        print("[key] private key decrypted OK")
    except Exception as exc:  # noqa: BLE001 - report and exit
        print(f"[key] FAILED to load private key: {type(exc).__name__}: {exc}")
        return 2

    def build_assertion(now_epoch: float) -> str:
        claims = {
            "iss": client_id,
            "sub": enterprise_id,
            "box_sub_type": "enterprise",
            "aud": TOKEN_URL,
            "jti": secrets.token_urlsafe(24),
            "exp": int(now_epoch) + ASSERTION_TTL_S,
            "iat": int(now_epoch),
        }
        return jwt.encode(claims, priv, algorithm=ALGO, headers={"kid": public_key_id})

    # 2-3) Build + sign + exchange, correcting host/Box clock skew on a timing 400
    #      (mirrors box_client._fetch_token: rebuild around Box's Date header, retry once).
    with httpx.Client(timeout=20.0) as client:
        clock_offset = 0.0
        resp = None
        for corrected in (False, True):
            assertion = build_assertion(time.time() + clock_offset)
            print(f"[jwt] assertion built (len={len(assertion)})"
                  + (f"  [clock-corrected offset={int(clock_offset)}s]" if corrected else ""))
            resp = client.post(
                TOKEN_URL,
                data={
                    "grant_type": JWT_BEARER_GRANT,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "assertion": assertion,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            print(f"[token] POST /oauth2/token -> HTTP {resp.status_code}")
            if resp.status_code < 400:
                break
            if not corrected and resp.status_code in (400, 401):
                date_hdr = resp.headers.get("Date")
                if date_hdr:
                    try:
                        box_time = parsedate_to_datetime(date_hdr).timestamp()
                        clock_offset = box_time - time.time()
                        print(f"[clock] Box Date={date_hdr} -> host drift ~{int(clock_offset)}s; retrying")
                        continue
                    except (TypeError, ValueError):
                        pass
            break

        if resp.status_code >= 400:
            # Box token-endpoint error bodies are safe to show (no secret echoed).
            print(f"[token] body: {resp.text[:400]}")
            return 3

        payload = resp.json()
        token = payload.get("access_token", "")
        print(f"[token] SUCCESS - access_token len={len(token)}  expires_in={payload.get('expires_in')}s")

        # 4) Read-only proof: GET the allowed-root folder (id + name only).
        r2 = client.get(
            f"https://api.box.com/2.0/folders/{ALLOWED_ROOT_ID}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            params={"fields": "id,name,item_collection"},
        )
        print(f"[rest] GET /2.0/folders/{ALLOWED_ROOT_ID} -> HTTP {r2.status_code}")
        if r2.status_code == 200:
            f = r2.json()
            n_items = (f.get("item_collection") or {}).get("total_count")
            print(f"[rest] folder name={f.get('name')!r}  id={f.get('id')}  item_count={n_items}")
            print("[result] BOX JWT AUTH WORKS END TO END (token + authenticated REST call)")
        elif r2.status_code == 404:
            print(f"[rest] 404 - token works, but the Service Account is NOT a collaborator on")
            print(f"        folder {ALLOWED_ROOT_ID}. Auth is GOOD; add the SA as a collaborator.")
        else:
            print(f"[rest] body: {r2.text[:400]}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
