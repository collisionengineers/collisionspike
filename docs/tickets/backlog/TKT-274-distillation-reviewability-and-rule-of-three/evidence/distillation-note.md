# Distillation note — TKT-274

**Source:** reconciled review Gate 0 item 11 (reviewability) + the "Simplicity" perspective (rule-of-three).
**Plan:** PLAN-012.

**Reviewability gap:** `.gitattributes` keeps `workingspace/**` byte-stable and suppresses text diffs. Even
without `-diff`, a draft committed before its distillation PR is unchanged and therefore absent from the PR
diff. Rendering is not a sufficient fix. Every new plan must carry a linked derivation summary with immutable
source references and an adopted/changed/dropped decision map. PLAN-012's own summary is the first fixture.
The user-owned drafts and their attributes remain untouched.

**Qualified rule-of-three discipline:** three structurally equivalent implementations trigger a consolidation
review. Sharing is accepted only when contract, owner, lifecycle, security, and failure semantics match;
otherwise the exception and parity/authority proof are recorded. Single-caller wrappers are candidates for
inlining unless they express a real boundary.

**Structural delta:** report before/after owned files and nonblank lines for the completed lane and aggregate
plan. A scaffold PR may be locally positive. A non-negative completed plan needs an explicit operator decision
because file count cannot overrule semantic boundaries.

**Constraint:** `.gitattributes` and `workingspace/` files are neither edited nor renamed by this ticket.
