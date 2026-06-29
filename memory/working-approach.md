---
name: working-approach
description: How to work in this project — prefer always-current sources for safety-relevant data (never cached copies), use FREE sources only for research, and save plans to docs/plans and research to docs/research.
metadata:
  type: feedback
---

## Safety-relevant data → always-current sources, never cached copies

**Why:** the user explicitly flagged the DVSA recalls CSV as a safety liability — recalls are added
continuously, so a cached copy becomes wrong the moment it goes stale ("is a recall permanent though?").
**How to apply:** for any safety-relevant data, prefer live APIs / link-outs over locally cached copies.
DVSA recalls = link out to `check-vehicle-recalls.service.gov.uk`, never a bundled CSV.

## Research uses FREE sources only

**Why:** the user specified "FREE sources — do not suggest ANY paid sources" for the research phase.
**How to apply:** when suggesting data enhancements, first check the source is free and publicly
accessible without organisational approval. KADOE, MIAFTR, paid insurance databases = out.

## Plans → docs/plans/, research → docs/research/

**Why:** the user wants planning + research artefacts saved into the repo, not just produced inline.
**How to apply:** create the folder structure and write the doc before generating inline content; don't
assume plan-mode output alone is sufficient.

Relates to [[activation-boundary]], [[user-profile]].
