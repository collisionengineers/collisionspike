---
id: TKT-199
title: Make repository data authority explicit without weakening security
status: now
priority: P1
area: docs
tickets-it-relates-to: [TKT-019, TKT-020, TKT-063, TKT-068, TKT-149]
research-link: docs/tickets/now/TKT-199-repository-data-authority-docs/evidence/operator-ruling-2026-07-13.md
plan: PLAN-004
---

# Make repository data authority explicit without weakening security

## Problem
The operator has explicitly authorized complete project use of all email, image and document material already present in this repository. Older instructions still prohibit raw-byte analysis solely because of PII/client data, including TKT-068's prior names-only/“bytes are never sent” design text. Those contradictions cause incomplete evidence review, but a broad “anything goes” rewrite could accidentally weaken separate controls around secrets, arbitrary external sharing, authenticated cloud access and production mutation.

## Evidence
- [Repository operating charter](../../../../AGENTS.md) — highest-level repository working instructions that must carry the clarified authority and retained boundaries.
- ADR-0015 already records operator authority to run AI testing on repository data, but that statement is narrower than complete local project analysis and still coexists with other potentially conflicting instructions.
- Operator direction dated 2026-07-13: all repository email/image/document material may be used completely for this project; remove blocks based solely on PII/client-data concerns, while retaining secret redaction, external-sharing limits and production-write scope.

## Implemented offline scope
Create one binding, dated repository-data authority statement; audit root/nested agent instructions,
skills and project docs for contradictory raw-byte restrictions; rewrite each contradiction in place; and
add deterministic validation. Independent security review and representative-format proof remain pending.

The authority is specific: project agents may open, decode, render, extract, compare and analyse every email, image and document committed to this repository for project work without asking again merely because it contains client data or PII. Raw images may be supplied to the project's configured multimodal assistant when needed for TKT-068. This does not declare material public/sanitized or authorize arbitrary egress, secret disclosure, broader live access or production mutation.

## Acceptance
- **A1.** A committed audit inventory covers root and nested `AGENTS.md`, `CLAUDE.md`, `.claude/agents/**`, `.agents/skills/**`, binding ADRs, plans/runbooks and ticket-workflow docs. Every statement that restricts raw email/image/document inspection or processing is cited by file/line, classified by reason and given an explicit keep/rewrite/remove decision.
- **A2.** The root operating charter contains a dated, unambiguous authority statement that repository-contained email, image and document bytes may be opened, decoded, rendered, extracted and analysed for this project, including full content needed for ticket evidence, parsing, classification, AI evaluation and verification; no per-file re-authorization is required solely for PII/client-data reasons.
- **A3.** Every binding instruction that prohibited or discouraged raw-byte use solely because material contains PII, personal data, client data or real case details is rewritten to agree with A2. TKT-068's names-only/“bytes never sent to the model” prose is removed from the current tree; Git history remains the recovery source.
- **A4.** The rewritten policy explicitly preserves secret/credential redaction and non-disclosure, repository and tenant access controls, least privilege, mailbox/provider scope, approval for production writes, and the ban on unapproved external transmission/publication. Repository data is never described as public, anonymized, synthetic or safe to share merely because internal project analysis is authorized.
- **A5.** Instructions distinguish approved project processing from arbitrary external transmission. The configured multimodal assistant is an approved project processor for raw image input under TKT-068; restrictions may remain for unapproved services, publication, secrets, residency/provider-term requirements or unrelated egress, but cannot be cited to block approved/local repository analysis.
- **A6.** Ticket-distill, assistant and relevant agent/skill workflows explicitly permit reading full raw bytes and rendered contents of supplied `.eml`, image, PDF, Word and other evidence and, when the task requires it, sending raw images to the configured multimodal assistant. They require fidelity/hash preservation and retain the no-silent-edit/discard/move rule.
- **A7.** The audit records intentional retained restrictions with rationale and authority, and records every rewritten file. It finds and resolves semantic contradictions, including paraphrases, not only exact phrases such as “PII” or “raw bytes”.
- **A8.** A deterministic repository check verifies the canonical authority statement is present and scans the defined binding-instruction surfaces for known stale deny patterns or markers. It emits file/line/actionable reasons, has an explicit narrow allowlist for legitimate external-sharing/security language, and runs in the normal repository/docs verification path.
- **A9.** Check fixtures prove failure for representative direct and paraphrased PII-only raw-byte prohibitions, success for the canonical authority and legitimate secret/external/production boundaries, and failure when an allowlist entry is stale, overbroad or lacks its recorded rationale.
- **A10.** Documentation/skill link checks, ticket checks and the new contradiction check pass together; generated/copied skill instructions do not reintroduce superseded wording, and an independent human review confirms the resulting hierarchy has one clear answer.
- **A11.** A controlled proof opens and analyses one representative repository `.eml`, image, PDF and Word document without re-asking for PII permission, records unchanged hashes, and sends the representative image bytes through the configured multimodal assistant boundary. Network evidence proves no bytes went to an unapproved service or live production system.
- **A12.** The dated authorization, scope, exclusions and precedence are discoverable from the repository entry-point docs and contradiction-audit artifact, so a future agent can state both what it may do and what remains forbidden without relying on chat history.
- **A13.** Moving evidence never changes its bytes. A pre/post ledger proves the same SHA-256 and byte size for every source blob, and each ticket/case/evaluation use retains its owner, role and original filename in a manifest.
- **A14.** Deduplication removes repeated storage only. Every logical occurrence remains resolvable through the global evidence catalog and its owning local manifest; missing, extra or hash-mismatched uses fail repository validation.

## Validation
- **Offline:** produce the instruction inventory and semantic review; run the contradiction checker against positive/negative fixtures and the full repository scope; run docs/ticket/skill-link validation; validate every evidence manifest against stored bytes; hash representative source files before and after approved local inspection.
- **Signed-in/live repository proof:** inspect the final files and check results from the authenticated repository/CI view, then run a normal ticket-evidence review over representative committed EML/image/PDF/Word material and retain tool/output evidence showing local/approved handling and zero production/external write.
- **Security review:** a second reviewer specifically checks that secret redaction, external-sharing, live-access and production-mutation controls survived, and that no retained external-processing rule has been accidentally generalized back into a local raw-byte prohibition.

## Research
Distilled 2026-07-13 from the operator's explicit repository-data authorization and the current [AGENTS.md](../../../../AGENTS.md). This ticket changes documentation and validation only; it does not itself broaden cloud permissions, production scope or third-party data-processing authority.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Repository operating charter](../../../../AGENTS.md)
- [Operator authority ruling](./evidence/operator-ruling-2026-07-13.md)
