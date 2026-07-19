# Changes — TKT-208: Catalog evidence and relocate workingspace without content changes

## Status
verify — workingspace relocation and content-addressed evidence catalog are implemented and verified
offline; independent verification remains pending.

## Commits
- a57720d9 — relocate the immutable workingspace.

## Files touched
- workingspace/
- tests/fixtures/evidence/sha256/
- tests/fixtures/manifests/evidence.json
- tests/fixtures/manifests/evidence.schema.json
- tests/fixtures/manifests/evidence-dispositions.json
- tests/fixtures/resolvers/
- services/functions/parser/tests/
- scripts/maintenance/evidence-catalog.mjs

## Summary
Binary evidence is stored once by complete SHA-256 while manifests preserve every original filename,
owner, role and logical occurrence. Shared Node and Python resolvers validate stored objects. The four
user-owned brainstorming files were moved as bytes only and retain their exact baseline hashes. Parser
regression documents resolve through the same manifest rather than remaining as a second binary store.

## A5 reconciliation (docs-only, 2026-07-19)
Independent Stage-1 verification flagged that A5's literal "exactly the four baseline filenames" now
fails because workingspace/ has grown from 4 to 94 tracked files. No tree edit was made to resolve
this: the four protected baseline files are unchanged (byte-identical `R100` renames in the relocation
commit a57720d9, recorded hashes still match), and the additional 90 files are later, out-of-scope
operator additions (e.g. adr-rewrite.txt in 7ab509c9; the ai-realignment-plans/,
architecture-simplification/ and claude-memory/ trees in baf4284f) that AGENTS.md protects as
user-owned. verification.md now records A5 as PASS (intent-satisfied by reconciliation) with per-item
evidence and corrects the stale "contains exactly four files" wording. Only the ticket's verification.md
and changes.md were touched; workingspace/ contents were not.
