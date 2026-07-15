# Intake workflow

## Normal path

1. Receive a new message from an approved mailbox or a manual staff upload.
2. Preserve the source message and attachments.
3. Classify the arrival and extract identity signals.
4. Drop exact duplicates.
5. Link to an existing Case when the correlation rules give one safe result; otherwise create or propose
   the appropriate staff action.
6. Parse instruction documents and retain both extracted values and their source.
7. Match the Work Provider using document evidence first and sender evidence as supporting context.
8. Enrich vehicle facts without replacing authoritative instruction values.
9. Show the Case for staff review, correction, and missing-item chasing.
10. Block EVA handoff until the readiness checklist passes or an allowed item is explicitly overridden.
11. Send the current EVA payload and maintain the Archive copy when the relevant capability is available.
12. Record every significant decision and mutation in the audit trail.

## Other arrival types

- Image-only arrivals may be linked to a unique compatible open Case, otherwise they remain for review.
- Queries stay in the query lane unless they carry new evidence for a known Case.
- Cancellations create a staff-confirmed action; they never close a Case automatically.
- Non-actionable mail is retained with its classification but does not create a Case.
- Retroactive reconstruction links existing records first, then uses approved read-only sources. It never
  invents a Case/PO.

The system fails open to staff review: uncertain work remains visible instead of being silently merged,
discarded, or treated as complete.
