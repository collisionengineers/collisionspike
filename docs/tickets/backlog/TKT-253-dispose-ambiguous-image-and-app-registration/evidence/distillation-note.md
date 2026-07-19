# Distillation note — TKT-253

**Source:** `03-cloud-estate-cleanup.md` scope item 2. **Plan:** PLAN-009. Live re-verified read-only
2026-07-19 (`PLAN-009.dossier.json`).

**`valuationbot-mcp` container image:** in ACR `cespkocracraeee76` (the only registry in the subscription),
one of two repositories alongside `ce-ocr`; multiple tags, most recent push 2026-06-25; unsigned; genuinely
distinct from the OCR image.

**`P2P Server` app registration:** `appId d0b7c608-d704-4282-b498-e897191c8b28`, created 2025-06-18,
`signInAudience AzureADMyOrg`, identifier URI `urn:p2p_cert`; no credentials, no API permissions, no redirect
URIs, no readable owner; a backing service principal exists. Sign-in activity **cannot be verified** — the
tenant lacks Entra ID P1/P2 so sign-in logs are unavailable.

**Why two-phase:** both are undocumented and MCP/integration-shaped, so ownership must be established
(operator ruling) before any irreversible deletion. Disposal is a **live write** requiring separate operator
authorisation and live post-verification.
