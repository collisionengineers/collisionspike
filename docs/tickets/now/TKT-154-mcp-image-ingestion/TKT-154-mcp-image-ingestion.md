---
id: TKT-154
title: Add a constrained MCP path for registration-based image ingestion
status: now
priority: P1
area: integration
tickets-it-relates-to: [TKT-034, TKT-061, TKT-064, TKT-068, TKT-110, TKT-111, TKT-146]
research-link: docs/tickets/now/TKT-154-mcp-image-ingestion/evidence/operator-note.md
plan: PLAN-004
---

# Add a constrained MCP path for registration-based image ingestion

## Problem
The live MCP endpoint is read-only. An external automated agent that watches a local image drop folder needs a narrow way to find an open case by registration and, only on an unambiguous match, upload those images so they are archived, classified, attached to the case, and reflected in readiness.

## Evidence
- [Operator note](./evidence/operator-note.md) — intended external-agent workflow and write boundaries.
- TKT-110 — existing read-only MCP server.
- TKT-068/TKT-111 — existing human-confirmed evidence write seams that may be reusable but are not a headless folder-agent contract.

## Implemented change
Implemented dark on `codex/tkt-154-mcp-image-ingestion`: least-privilege MCP tools for canonical
registration lookup and idempotent image attachment reuse the canonical evidence, classification,
Archive and readiness pipeline. Live role creation, deployment, gate activation and behavioral proof
remain operator-gated and are not claimed here.

## Acceptance
- The authenticated MCP server exposes a documented read tool that canonicalises a supplied registration and returns only the minimum case identity/status needed to decide whether exactly one eligible open case matches.
- No match, multiple active matches, a removed/merged/terminal case, invalid registration, or insufficient caller permission returns a non-mutating structured refusal; the tool never guesses.
- A separate write tool accepts bounded image payloads or an agreed streaming/upload-token contract plus canonical registration, stable client idempotency key and source filenames. It re-resolves the case server-side rather than trusting a client-supplied case ID alone.
- The MCP client identity uses a dedicated least-privilege authorization grant. Read-only MCP clients cannot call the write tool, and the write identity has no Outlook mutation capability.
- MIME/type/size/count checks reject non-images and unsafe/oversized batches before persistence. Filenames are normalised without trusting paths supplied by the client.
- A successful upload uses the canonical evidence write seam, content hash/idempotency key prevents duplicate evidence on retry, and every accepted image is linked to the resolved case.
- Archive upload is confined to the case folder under Box test root `392761581105` during this programme. The server does not accept arbitrary Box folder IDs or paths from the agent.
- Each image enters the existing image classification and registration-visible flow; case status/readiness is recomputed only after the durable evidence state is known.
- Partial batch failures return per-file outcomes and a retry-safe batch status. Success is not reported while required database/Blob/Box work is incomplete.
- Audit records identify the MCP client, registration, resolved case, idempotency key, file hashes/outcomes and retry, without storing image bytes in logs.
- Tool schemas, error codes, auth setup and a sample folder-watcher client are documented for another AI agent without embedding secrets.
- Tests cover canonical/spaced registration, no match, twin/ambiguous match, merged/terminal case, auth denial, bad MIME, size/count limits, duplicate retry, partial Box failure, classification handoff and status recomputation.
- A real authenticated MCP `tools/list`, registration lookup and upload `tools/call` are proven end to end on a designated test case/folder; Box, evidence row, classification and case attachment are read back. No Outlook write and no Box write outside the test root occurs.

## Research
Distilled 2026-07-12 from the operator's external-agent image-drop workflow and supplied sketches.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
