#requires -Version 7
# ============================================================================
# 23-activation-checklist.ps1  —  M2 operator activation checklist (prints only).
# ============================================================================
# Pure echo. No tenant/Azure/EVA/Box contact. Run it for the ordered, boundary-
# tagged checklist the operator follows to activate M2. Everything Claude built is
# GATED OFF; every step below that crosses the live-services boundary is tagged
# [RESERVED-FOR-USER]. Mirrors plans/phase-2-implementation.md.
# ============================================================================

$checklist = @'
========================================================================
 collisionspike — M2 OPERATOR ACTIVATION CHECKLIST
 Legend: [DEPLOY] = deploy/import/non-secret setting under your login (no live
         inbox/EVA/Box, no secret value).  [RESERVED] = crosses the live-services
         boundary (inject a secret value, bind a live account, flip a prod gate,
         turn a flow ON, run a live test). Claude does NONE of the [RESERVED] steps.
 Recommended order: M2.0 -> M2.A -> M2.D(drag-drop) -> M2.B -> M2.C(test) -> M2.F.
========================================================================

M2.0  PIPELINE-ON PREREQUISITE
  [ ] [RESERVED] Seed provider email domains (dataverse/.build/15-seed-emaildomains.ps1)
                 + turn ON classify-persist, parse, status-evaluate so a real email
                 becomes a parsed, classified Case. (Per the parallel intake rework,
                 confirm CS Intake orchestrates the child-flow chain.)

M2.A  ENRICHMENT (DVSA mileage + vehicle summary)   — highest value/effort
  [ ] [DEPLOY]   Confirm/redeploy enrichment Function cespkenrich-fn-gi62sd
                 (az functionapp show -g rg-collisionspike-dev -n cespkenrich-fn-gi62sd).
  [ ] [RESERVED] Register/admin-consent the DVSA Entra app (client_credentials,
                 scope https://tapi.dvsa.gov.uk/.default); record tenant id.
  [ ] [RESERVED] Inject KV secrets (run .build/21-keyvault-secrets.ps1 for the exact
                 commands): dvsa-client-id, dvsa-client-secret, dvsa-api-key, dvla-api-key.
  [ ] [DEPLOY]   Set non-secret app settings: DVSA_TENANT_ID, DVSA_SCOPE, DVSA_API_BASE,
                 DVLA_API_BASE (az functionapp config appsettings set ...).
  [ ] [DEPLOY]   Import the enrichment connector + create its connection (function-key)
                 -> bind cr1bd_dvsaenrich (see .build/20-connectors-setup.ps1).
                 Set the ENRICHMENT_API_BASE env-var to the Function host.
  [ ] [RESERVED] Flip ENRICHMENT_ENABLED=true in a TEST env (per-env currentValue).
  [ ] [RESERVED] Turn ON CS Enrich; confirm it runs post-parse with {caseId,vrm,reference}.
                 Verify: empty doc-mileage -> filled from MOT (Miles), provenance dvla_dvsa,
                 enrichment_called audit; present doc-mileage -> estimate SKIPPED (doc wins).

M2.D  BOX ARCHIVAL AT FINALISATION   — can go live on drag-drop BEFORE EVA REST
  [ ] [RESERVED] Create + authorise the Box connection -> bind cr1bd_box.
  [ ] [RESERVED] Set the BoxArchiveRootId flow parameter to the real parent folder id.
  [ ] [RESERVED] Confirm Box honours the UPPERCASE Case/PO folder name (e.g. test26001 -> TEST26001).
  [ ] [DEPLOY]   Check the Box CreateFile behaviour on large/multi-MB photo sets (chunking).
  [ ] [RESERVED] Turn ON CS Finalize EVA+Box (drag-drop transport, EVA_API_ENABLED=false).
                 Verify: finalised Case -> TEST26001 Box folder, photos in EVA order,
                 <casepo>.eva.json staged; box_synced status + audit; re-run no double-submit.

M2.B  EVA VALIDATION SURFACE (net-new Function + connector)   — on the critical path
  [ ] [DEPLOY]   Deploy functions/evavalidation (FC1, no Key Vault) via its Bicep.
  [ ] [DEPLOY]   Import the evavalidation connector (function-key) -> bind cr1bd_evavalidation.
  [ ] [DECISION] Choose the body shape: (recommended) apply a SMALL status-evaluate edit so
                 Validate_readiness passes { case, evidence } (keeps the Function stateless),
                 OR grant the Function a Dataverse identity. NOTE: editing status-evaluate is
                 out of the M2-functions task's scope; the flow-owner/operator owns that edit.
                 Until then ValidateCase(caseId) returns a SAFE-NEGATIVE (Case not ready_for_eva).
  [ ] [RESERVED] Turn ON CS Status Evaluate; verify a Case missing a damage closeup lands
                 missing_images, then ready_for_eva once the closeup is added.

M2.C  EVA SENTRY REST SUBMISSION (net-new Function + connector)   — the spine
  [ ] [DEPLOY]   Deploy functions/evasentry (FC1 + Key Vault) via its Bicep; set EVA_BASE_URL.
  [ ] [DEPLOY]   Import the evasentry connector (function-key; NO OAuth definition — EVA's
                 token lifecycle lives INSIDE the Function) -> bind cr1bd_evasentry.
  [ ] [RESERVED] Inject EVA TEST creds into KV: eva-client-id, eva-client-secret
                 (.build/21-keyvault-secrets.ps1 prints the commands).
  [ ] [RESERVED] Re-read docs/reference/Sentry API Documentation 1.2 Amended.pdf, then POST a
                 one-photo + full-set case to the EVA TEST server to CONFIRM the Impact-Image
                 shape (single ordered array vs SubmitPreviews) BEFORE wiring body/images
                 (plan open Q1). Rename payload.py's 'impact_images' key to the confirmed field.
  [ ] [RESERVED] Flip EVA_API_ENABLED=true in TEST ONLY; run CS Finalize EVA+Box on a
                 ready_for_eva Case -> EVA test accepts; previews first; overview shows the full
                 reg; eva_submitted audit records transport=sentry_rest; re-run no-ops.
  [ ] [RESERVED] EVA PRODUCTION cutover ONLY after a parity test (same Case via drag-drop JSON
                 == via the API: fields + photo order). Then swap KV to prod creds on one
                 low-risk live case. Claude never flips prod.

M2.F  CHASERS SEND (kill-switched email; WhatsApp stays manual)
  [ ] [DEPLOY]   Run .build/22-envvars-m2.ps1 (creates CHASER_SEND_ENABLED=false + the other
                 M2 env-vars) and .build/20-connectors-setup.ps1 (ensures chaser_sent audit
                 action 100000019). chaser-send uses the ALREADY-BOUND digital@ connection.
  [ ] [RESERVED] Flip CHASER_SEND_ENABLED=true + turn ON CS Chaser Send. Verify: gate-off
                 no-ops a drafted email chaser (audit "skipped"); gate-on sends to the right
                 garage, Chaser -> sent, audit chaser_sent; a whatsapp chaser is NEVER auto-sent.

CROSS-CUTTING (before any activation)
  [ ] [DEPLOY]   DLP: confirm Dataverse + Box + Azure Blob + Office 365 Outlook + the custom
                 parser/DVSA/EVA/validation connectors all sit in the SAME DLP data group.
  [ ] [DECISION] Confirm Code Apps GA/licensing + premium entitlement (+ AI Builder capacity
                 only if the AI Builder image-classification path is later chosen for M2.E).
  [ ] [DEPLOY]   Keep every flow state=off on import; the user activates each after binding.

OFFLINE GATES (must stay green through M2 — Claude-verified, no tenant)
  [ ] node flows/validate-flows.mjs            (all flows state=off, closed connector set)
  [ ] (cd functions/evasentry && pytest)        (token lifecycle, payload, image order, no-secret)
  [ ] (cd functions/evavalidation && pytest)    (image-rules/case-status parity vs the TS contracts)
  [ ] (cd functions/enrichment && pytest)       (mileage guard, 401 refresh, no-secret) [already green]
  [ ] az bicep build evasentry + evavalidation infra/main.bicep
========================================================================
'@

Write-Host $checklist
