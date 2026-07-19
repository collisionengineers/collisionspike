# Distillation note — TKT-270

**Source:** operator requirement for a final "hardcore repository check" + reconciled review Gate 0. **Plan:**
PLAN-012.

**Why an audit is still needed after PLAN-007–011:** those plans each remove one finding class (A/B/F/G token
+ HTTP + retry + storage; C/D routes/clients; E/H Python; I scripts; estate). The findings register was
point-in-time discovery, not exhaustive proof. The audit certifies there is nothing else, or names what
remains.

**Four audit categories (read-only, structural — not lexical):**
1. Mechanisms implemented 3+ times (token mints, HTTP wrappers, retry, hashing, secret/PII detection).
2. Capabilities reachable by more than one registered path.
3. Cross-language rule divergence (TS `@cs/domain` vs Python vs vendored `cedocumentmapper_v2`).
4. Tracked-doc live-state claims that disagree with `LIVE_FACTS.json`.

**Method:** subagent fan-out (Explore/general-purpose for source, azure-diagnostician for any live claim),
import/AST-aware. Each residual finding → a new ticket (or a recorded intentional exception). Read-only;
changes nothing. Feeds the guards in TKT-271–274.
