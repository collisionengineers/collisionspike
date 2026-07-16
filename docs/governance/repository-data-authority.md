# Repository data authority

## Authority

For this project, agents may open, decode, render, extract, compare, and analyse the complete bytes of
every committed email, image, document, and evaluation artifact. This includes content needed for ticket
evidence, parsing, classification, AI evaluation, and verification. Personal or client data does not
require separate per-file permission for this internal project processing.

When image understanding is required, raw image bytes may be sent to the configured project multimodal
assistant.

## Limits

This authority does not permit:

- publication or unrestricted egress;
- exposing credentials, secrets, tokens, or private keys;
- sending material to an unapproved service;
- bypassing repository, tenant, role, mailbox, provider, or row-level access controls;
- widening mailbox or provider scope;
- mutating a live system without explicit production-write authority.

## Fidelity and storage

Source bytes are immutable. The evidence store uses the SHA-256 digest as identity and stores each unique
blob once. A manifest preserves every logical occurrence with its owner, role, original filename, media
type, byte size, and digest.

Moving or deduplicating evidence is complete only when:

1. pre/post byte size and SHA-256 match;
2. every logical source occurrence resolves through a manifest;
3. logical occurrence counts are unchanged;
4. ticket, case, and evaluation ownership remains explicit;
5. repository checks resolve the fixture without depending on its old path.

Derived text, OCR, thumbnails, labels, and model output are distinct artifacts. They never replace the
source blob.

## User-owned workspace

`workingspace/` is non-authoritative user brainstorming material. Agents may move the directory only when
explicitly instructed and must prove byte-for-byte equality. Its filenames and contents are otherwise
untouchable.
