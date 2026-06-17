# Cases correlate by VRM within an open-case window

Separately-arriving images and instructions are merged into one Case by **VRM**, scoped to the
currently **open** case for that VRM. If no open case exists, a new Case is created; multiple
historical Cases may share a VRM over time (later unrelated claims / re-inspections). Ambiguous or
duplicate VRM matches are flagged for human review rather than auto-merged. Chosen over
1-Case-per-VRM (which would wrongly fuse future unrelated claims) and over provider-reference keying
(which can't match images-first arrivals that carry no reference yet). Reflects the existing
folder-by-VRM practice and the deduplication requirement.
