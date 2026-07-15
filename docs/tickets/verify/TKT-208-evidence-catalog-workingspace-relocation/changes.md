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
