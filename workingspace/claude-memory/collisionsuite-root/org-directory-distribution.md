---
name: org-directory-distribution
description: How CE connectors + skills reach staff Claude Desktop machines — claude.ai org extension directory (version bump mandatory) + org skills sync every 10 min; staff machines have NO system Node/Python
metadata: 
  node_type: memory
  type: project
  originSessionId: a14e50cc-f80d-45c1-a6ee-124a9d6b7bee
---

Confirmed from staff-machine logs (2026-07-03, `connectors/lisalogs1/`): Collision Engineers staff Claude Desktop installs pull everything from the **claude.ai org directory** (org id `50c93b1b-5e2b-4105-9cf4-871c2e13befc`):

- **Extensions (.mcpb)** auto-download from `claude.ai/api/organizations/<org>/dxt/extensions/<id>/download` — installed that day: `collisionrenderer-mcp` v0.2.2, `valuationbot-mcp` v3.3.0, dvsa-mot 2.0.0. **A version bump is what triggers client updates — never republish under the same version.**
- **Skills** sync via SkillsPlugin every 10 minutes ("Found 7 enabled skills"). Skill zips must be clean — the 2026-07-02 zips wrongly bundled `_dev/` + `__pycache__` (fix: `pack_skill.py`, planned).
- **Staff machines have NO system Node and NO Python** (`spawn node ENOENT`; Microsoft-Store python alias). Any skill instruction that shells out to python/pip is dead on staff machines — the vehicle-valuation skill's offline Python fallback and `validate_evidence_pack.py` gate can never run there; the renderer's `validation.errors` envelope is the only runtime gate.

**Why:** releases were assumed to be manual .mcpb installs; they are not — publish to the org directory and clients pull automatically (extensions on restart, skills ≤10 min).
**How to apply:** any connector/skill fix ships by bumping the version, rebuilding the bundle/zip, and replacing the org-directory entry; verify propagation in Desktop Settings → Extensions on a staff machine. See [[project-renderer-convergence]] and [[valuation-suite-integration-map]].

Lisa incident (2026-07-03): nine `render_valuation_outputs` calls all bounced in <100 ms (validation-failed envelopes, no PDFs, ~45 min lost). Renderer logged nothing about why (stderr diagnostics task planned); leading cause = the skill's `your_ref`/`our_ref` misdirection. Renderer assembly logged `0.1.1.0` while manifest said 0.2.2 (un-bumped Directory.Build.props) — version skew makes logs lie.

Fix status (2026-07-03, same day): all five codex PRs reviewed (multi-lens + adversarial verify, 27 confirmed findings fixed incl. a P1 multipart local-file-read gap and a P1 cookie-banner 6s-poll deadline burn) and MERGED. `collisionrenderer-mcp-0.2.3.mcpb` (dist/) and `valuationbot-mcp-3.4.0.mcpb` + `vehicle-valuation.zip` rebuilt post-fix. Remaining: USER publishes bundles/zips to the org directory (see connectors/handoff.md "Publish Handoff"), then remote verification on Lisa's machine — deliberately render a payload without `meta.your_ref` and expect a named `validation_failed` line in the MCP log.
