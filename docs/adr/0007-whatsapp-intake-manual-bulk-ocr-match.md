# ADR-0007 — WhatsApp intake is manual with assisted matching

**Status:** Accepted (2026-06-17).

## Decision

WhatsApp-sourced instructions and images are attached by staff because the business uses the WhatsApp
Business app without a programmatic inbound channel. A bulk-assist path may process a staff export, read
registration text from media, and propose an open-Case match under ADR-0002/0010.

## Rationale

Manual source handling reflects the available business channel. OCR and bulk grouping can remove clerical
effort without pretending there is an automated receipt or accepting an uncertain match.

## Consequences

Every attachment records WhatsApp as its source channel. Proposed matches are reviewable, ambiguous media
stays visible, and outbound WhatsApp chasers remain manual under ADR-0003.
