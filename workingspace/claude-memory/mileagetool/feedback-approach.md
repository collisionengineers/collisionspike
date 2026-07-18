---
name: feedback-approach
description: How to approach work in this project — key corrections and validated choices
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7e2794f-1b74-492c-95e0-a5591e1c23b0
---

## Don't suggest the DVSA Recalls CSV for caching

**Why:** Recalls are added continuously — a cached copy becomes a safety liability the moment it goes stale. User flagged this explicitly: "is a recall permanent though? otherwise we'd need to add some method of continually grabbing/updating this? not ideal." The *not ideal* confirmed the CSV approach was wrong.  
**How to apply:** For any safety-relevant data, prefer always-current sources (link-outs, live APIs) over locally cached copies. DVSA recalls = link-out to check-vehicle-recalls.service.gov.uk.

## Scope creep: paid sources are off-limits

**Why:** User specified "FREE sources — do not suggest ANY paid sources" for the research phase.  
**How to apply:** When suggesting data enhancements, first check if the source is free and publicly accessible without organisational approval. KADOE, MIAFTR, insurance databases = always out.

## Plans go in docs/plans/, research in docs/research/

**Why:** User asked for the plan to be saved to `docs/plans/` and for research docs in `docs/research/`. The initial plan was generated inline without saving it first — user had to redirect.  
**How to apply:** When starting a new project or feature, create the folder structure and write documents there before generating inline content. Don't assume plan mode output is sufficient.

## MileageAnalysis thresholds must be preserved exactly

**Why:** The Python analysis.py constants (200 mi/day implausible rate, 30-day gap minimum, 0.621371 KM→miles, 0.75/1.25 uncertainty bands) are calibrated from the TypeScript original. They are not arbitrary — the TS author deliberately chose them.  
**How to apply:** When porting analysis.py to C#, copy all constants verbatim. Don't round, adjust, or "simplify" them.
