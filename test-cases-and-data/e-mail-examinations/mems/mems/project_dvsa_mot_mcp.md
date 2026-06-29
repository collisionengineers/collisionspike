---
name: project-dvsa-mot-mcp
description: DVSA MOT History MCP server implementation status and key decisions
metadata: 
  node_type: memory
  type: project
  originSessionId: 2a64b288-23c8-4251-9931-e8e70221cf2d
---

MCP server for DVSA MOT History API, built in Python at C:\Users\Alex\Documents\GitHub\dvlaclaudeconnector.

**Why:** Collision engineering team needs Claude to query vehicle MOT history for accident assessment, mileage fraud detection, and evidence preservation.

**Package name:** `dvsa_mot_mcp` (inside repo folder `dvlaclaudeconnector` — kept for historical reasons). Python package is `dvsa-mot-mcp` in pyproject.toml.

**Implementation complete as of 2026-05-22:**
- M1: `pyproject.toml`, `src/dvsa_mot_mcp/` scaffold with uv
- M2: `errors.py` (MOTH-xx-yy hierarchy), `models.py` (pydantic v2 + `normalize_registration`)
- M3: `dvsa_client.py` (OAuth2 + token bucket rate limiter + exponential backoff)
- M4: `storage.py` (aiosqlite WAL — cache, snapshots, audit tables)
- M5–M8: `tools/lookup.py`, `tools/analysis.py`, `tools/snapshots.py`, `tools/admin.py` — all 16 MCP tools
- M9: `server.py` (FastMCP + lifespan), `auth.py` (BearerAuthMiddleware using hmac.compare_digest)
- M10: `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `scripts/keep_alive.py`
- M11: Tests at 67 passing, smoke test fixtures committed

**How to apply:** When continuing work on this project, tests pass with `python -m uv run pytest`. Server starts with `python -m uv run python -m dvsa_mot_mcp`.

**Registration normalisation:** `normalize_registration(reg)` in models.py strips spaces + uppercases. Applied in all tool inputs and in DvsaClient automatically.
