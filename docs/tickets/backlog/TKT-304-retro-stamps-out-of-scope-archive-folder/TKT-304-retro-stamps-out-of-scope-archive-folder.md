---
id: TKT-304
title: Retro reconstruction stamps a discovered live-archive folder as the case's durable Archive link
status: backlog
priority: P1
area: archive
tickets-it-relates-to: [TKT-219, TKT-303]
research-link: docs/tickets/verify/TKT-303-terminal-archive-failure-retry-loop/evidence/diagnosis-2026-07-21.md
---

# Retro reconstruction stamps a discovered live-archive folder as the case's durable Archive link

## Problem

Retro reconstruction gates adoption of a discovered archive **Case/PO** but not adoption of the
discovered **folder**. With `RETRO_ADOPT_ARCHIVE_PO_ENABLED=false` the allocator correctly mints a
fresh Case/PO and records the discovered one as `discoveredArchivePo` — yet the same create still
writes the discovered live-archive folder id into `case_.box_folder_id`.

Observed live 2026-07-21 on case `13f1c47f-f337-48e7-8a2d-a43b3ff9e40e` (Case/PO `A.QDOS26229`,
`reconstructionSource: box_eml`), which was stamped with folder `401801654393`:

```json
{"casePo":"A.QDOS26229","discoveredArchivePo":"A.QDOS261819",
 "reconstructionSource":"box_eml","boxFolderId":"401801654393"}
```

That folder is under neither `BOX_ALLOWED_ROOT_ID` (`392761581105`) nor `BOX_READONLY_ROOT_IDS`
(`3221031282`), so every subsequent write-side operation on the case is refused. Full evidence:
[TKT-303 diagnosis](../../verify/TKT-303-terminal-archive-failure-retry-loop/evidence/diagnosis-2026-07-21.md).

The consequences observed: the case could never complete provider recovery, and an evidence
archive attempt aimed 23 files at the live folder (`archived 0/23 evidence file(s) to archive
folder 401801654393`). Nothing was written — the facade's scope lock held — but the intent
reached the live archive boundary, which is exactly what the pinned test root exists to prevent.

Pre-wipe telemetry showed **eight** distinct out-of-scope folder ids stuck simultaneously, so this
is the normal outcome of retro reconstruction in the current alpha posture, not an edge case.

TKT-303 stops such a case from looping forever, and its terminal-park makes the condition visible
instead of noisy. It does **not** stop retro from creating the condition in the first place.

## Change

Not designed. The shape of the decision:

- The `box_folder_id` written by a retro create should be gated on the same footing as the
  Case/PO. While the write root is the pinned test root, a discovered archive folder is
  reference data (record it like `discoveredArchivePo`), not the case's durable Archive link.
- The case should then mint its own folder under the pinned root through the normal
  `boxFolderCreate` seam — which is precisely what happened, correctly, once the bad link was
  cleared by hand: `A.QDOS26229` minted folder `401933843879` at 21:03:21Z.
- Decide what production cutover expects: at that point the archive root becomes the write root
  and adopting a discovered folder may be right. The gate should express that difference rather
  than the behaviour being incidental.

## Acceptance

- A retro reconstruction that discovers an archive folder outside the pinned write root does not
  write that folder id to `case_.box_folder_id`.
- The discovered folder identity is still recorded queryably on the case, as `discoveredArchivePo`
  already is.
- Such a case mints its own folder under the pinned root and completes provider recovery without
  operator intervention.
- Proven on a real reconstruction, not only a fixture.
