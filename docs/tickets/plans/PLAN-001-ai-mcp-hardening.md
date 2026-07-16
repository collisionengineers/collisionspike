---
id: PLAN-001
title: Harden and extend AI and agent capabilities
status: active
tickets: [TKT-015, TKT-016, TKT-017, TKT-018, TKT-060, TKT-064, TKT-066, TKT-067, TKT-068, TKT-069, TKT-072, TKT-088, TKT-107, TKT-110, TKT-111, TKT-112, TKT-113]
depends-on: []
---

# PLAN-001 — Harden and extend AI and agent capabilities

## Outcome

Deliver useful assistant, search, image-analysis and agent-facing capabilities without weakening staff
authorization, data boundaries or human confirmation for writes.

## Decisions

- The Data API enforces authorization for every capability.
- Read tools use the narrowest data access required for their answer.
- Model output proposes work; it never bypasses staff confirmation or server-side validation.
- Agent-facing writes remain out of scope until identity, capability authorization, concurrency and
  audit requirements are separately accepted.
- Image processing remains separated from case-field updates so each result can be reviewed and traced.
- Feature availability is controlled explicitly and defaults to unavailable until approved.

## Sequence

1. Stabilize current assistant lookups, observability and shared domain normalization.
2. Complete the staff assistant interaction and search work.
3. Verify the human-confirmed write tier and read-only agent interface.
4. Finish the image-analysis family only after model, capacity, privacy and review requirements pass.

## Close-out

Every member ticket must have its own acceptance evidence. The plan closes only when all members are
`done` or have been explicitly transferred to another active plan.

<!-- GENERATED:PROGRESS -->
## Computed progress

**8/17 done (47%).**

| Status | Count |
|---|---:|
| Now | 3 |
| Verify | 5 |
| Done | 8 |
| Next | 0 |
| Backlog | 1 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-015](../done/TKT-015-ai-assistant/TKT-015-ai-assistant.md) | done | AI suggestion layer (observation-first, gated) |
| [TKT-016](../verify/TKT-016-ai-image-analysis/TKT-016-ai-image-analysis.md) | verify | Image-analysis VLM sequence (vehicle / reg / location) |
| [TKT-017](../done/TKT-017-ai-reg-ocr/TKT-017-ai-reg-ocr.md) | done | Registration-recognition model research + bench |
| [TKT-018](../backlog/TKT-018-ai-case-category/TKT-018-ai-case-category.md) | backlog | AI VLM total-loss vs repairable categorisation (deferred) |
| [TKT-060](../done/TKT-060-ai-chat-helper/TKT-060-ai-chat-helper.md) | done | AI chat helper — read-only Q&A assistant drawer |
| [TKT-064](../done/TKT-064-image-classification/TKT-064-image-classification.md) | done | Auto-classify evidence images — role (overview/damage) + registration visible |
| [TKT-066](../verify/TKT-066-assistant-lookup-observability/TKT-066-assistant-lookup-observability.md) | verify | Assistant can't find a case by spaced registration + tool failures are invisible |
| [TKT-067](../now/TKT-067-assistant-new-chat/TKT-067-assistant-new-chat.md) | now | Assistant drawer needs a "New chat" button to clear the conversation |
| [TKT-068](../now/TKT-068-assistant-attach-evidence/TKT-068-assistant-attach-evidence.md) | now | Let the assistant understand images and add them to a case |
| [TKT-069](../verify/TKT-069-assistant-more-tools/TKT-069-assistant-more-tools.md) | verify | Assistant answers more questions — case detail, activity, twins, queues, emails, overdue |
| [TKT-072](../done/TKT-072-global-search/TKT-072-global-search.md) | done | The search box doesn't search — global search across cases, emails, providers |
| [TKT-088](../done/TKT-088-image-role-classification-check/TKT-088-image-role-classification-check.md) | done | Image role auto-classification — confirm whether it works and decide the path |
| [TKT-107](../now/TKT-107-readonly-archive-assist/TKT-107-readonly-archive-assist.md) | now | Read-only Box archive assist (suggest-only) — decouple from the sequence-blocked reconstruction |
| [TKT-110](../verify/TKT-110-mcp-readonly-server/TKT-110-mcp-readonly-server.md) | verify | Read-only MCP server for external agents |
| [TKT-111](../verify/TKT-111-assistant-write-tier/TKT-111-assistant-write-tier.md) | verify | Assistant write tier with human confirmation |
| [TKT-112](../done/TKT-112-image-writer-reconcile/TKT-112-image-writer-reconcile.md) | done | Reconcile the two image-classification writers |
| [TKT-113](../done/TKT-113-ai-usage-ledger/TKT-113-ai-usage-ledger.md) | done | AI usage ledger for model capacity controls |
<!-- /GENERATED:PROGRESS -->
