# Deployment

Repository cleanup and documentation work never imply deployment authority. Use this sequence only in a
separately authorized deployment task.

## Preconditions

1. Start from a clean clone at the reviewed commit.
2. Run `npm ci` from the root.
3. Run the complete build, TypeScript tests, retained Python tests, database tests, contract snapshots,
   evidence checks, and documentation/ticket checks.
4. Confirm public REST routes, DTOs, numeric mappings, and database expectations against the approved
   baseline.
5. Validate Azure configuration without printing secret values.
6. Record intended resources, rollback point, and post-deployment probes in the owning ticket.

## Artifact rule

Build self-contained Linux Azure Functions artifacts with `npm run package:deploy`. That command writes to
ignored `.artifacts/deploy/`, installs production dependencies inside each artifact, and targets the Data
API's Sharp/libvips packages to Azure's Linux x64/glibc runtime even when packaging on Windows. A plain
`npm run bundle` writes source bundles and lockfiles only; it is not a deployable package. Confirm the Data
API artifact contains `@azure/functions`, `@img/sharp-linux-x64`, and
`@img/sharp-libvips-linux-x64`, and the orchestration artifact contains `@azure/functions` and
`durable-functions`, before `func azure functionapp publish`. Packaging must succeed from a clean clone.
Never deploy a tracked ZIP or a local bundle whose source commit is unclear.

## Order

Deploy a database change only when the new application works safely with both schema states and the change has
an approved live-write step. Then deploy focused Python services, Data API, orchestration, and the web app
in the ticket's tested order. A component not changed by the reviewed commit is not redeployed merely for
convenience.

## OCR Function App (container deploy) — `cespkocr-fn-dev-glju3v`

The OCR host is a **container** Function on Azure Container Apps (it exists to carry the `tesseract`
binary Flex Consumption cannot provide, lighting up the parser engine's OCR fallback + fast-alpr
plate OCR). The Python `func azure functionapp publish` recipe above does NOT apply to it. Deploy is
`[DEPLOY-WITH-LOGIN]` (interactive `az`), IaC under `infrastructure/functions/ocr/`:

1. **Build + push the image to ACR** (no secret is baked in):
   `az acr build --registry cespkocracraeee76 --image ce-ocr:latest services/functions/ocr`
   (rebuild whenever the materialized engine copy `services/functions/ocr/cedocumentmapper_v2/` or the
   Dockerfile changes).
2. **Pre-grant AcrPull** to the pull identity FIRST (its own template, so the role has propagated
   before the app is created — this is the fix for the RBAC race that expired the deploy):
   `az deployment group create -g rg-collisionspike-dev -f infrastructure/functions/ocr/acrpull-role.bicep`.
3. **Deploy the Function App:**
   `az deployment group create -g rg-collisionspike-dev -f infrastructure/functions/ocr/main.bicep
   -p existingAcrName=cespkocracraeee76 imageName=ce-ocr:latest acrPullIdentityId=<cespkocr-acrpull-id
   resourceId> sharedLogAnalyticsName=<parser LAW> sharedAppInsightsConnectionString=<parser App
   Insights conn str>`. Document Intelligence stays off (`deployDocIntel=false`,
   `OCR_PROVIDER=tesseract`, `PLATE_PROVIDER=fast_alpr`) unless a `keyVaultName` + `docintel-read-key`
   are supplied — see TKT-289.
4. **Set scale-to-zero replicas:**
   `az functionapp config container set -n cespkocr-fn-dev-glju3v -g rg-collisionspike-dev
   --min-replicas 0 --max-replicas 5`.
5. **Wire the caller:** the Data API reaches OCR via `OCR_FN_URL`/`OCR_FN_KEY` app settings on
   `cespk-api-dev` — these are NOT declared in `infrastructure/config-capture/*.bicep` (a known gap),
   so set them explicitly:
   `az functionapp config appsettings set -n cespk-api-dev -g rg-collisionspike-dev --settings
   OCR_FN_URL=https://cespkocr-fn-dev-glju3v.azurewebsites.net OCR_FN_KEY=<function key>`.

Base image is pinned (`mcr.microsoft.com/azure-functions/python:4-python3.12`) and must be refreshed
monthly for Microsoft's container security updates.

## Guided-capture SPA (Static Web App) — `cespk-capture-spa-dev`

The guided-capture PWA (`apps/capture-web/`, package `@cs/capture-web`) merged in from the former
collisioncapture repo (ADR-0034, TKT-278) is a **Standard Azure Static Web App**, not a Function App —
the `func`/`package:deploy` recipes above do NOT apply. Read-only IaC for the live resource is
`infrastructure/config-capture/capture-spa.bicep` (identity, SKU, and the `linkedBackend` to
`cespk-api-dev`); that template captures state and does not itself push content. Deploy is
`[DEPLOY-WITH-LOGIN]` (interactive `az` + the SWA CLI):

1. **Build the client bundle:** `npm run build --workspace @cs/capture-web` (runs `tsc --noEmit` +
   `vite build`, output in `apps/capture-web/dist/`). Build from a clean clone at the reviewed commit.
2. **Fetch the deployment token** (do not print it):
   `az staticwebapp secrets list -n cespk-capture-spa-dev -g rg-collisionspike-dev --query "properties.apiKey" -o tsv`.
3. **Push the bundle:** `swa deploy apps/capture-web/dist --deployment-token <token> --env production`
   (Static Web Apps CLI; this is the same route by which the resource was first provisioned — there is
   no CI deploy job yet).
4. **SPA routing/headers** ship in `apps/capture-web/public/staticwebapp.config.json` (bundled into
   `dist/` by the build). It is currently minimal (SPA fallback, no-store, immutable asset caching).

**Deferred to [TKT-283](../tickets/backlog/TKT-283-guided-capture-spa-deploy-pipeline/TKT-283-guided-capture-spa-deploy-pipeline.md)
(backlog, operator-gated):** a repeatable **CI** deploy job (replacing this one-off SWA-CLI push), the
full CSP / `Permissions-Policy` / `Referrer-Policy` / `.wasm`/`.onnx` MIME security-header set the
capture threat model requires, and the `capture.collisionengineers.co.uk` custom-domain binding (gated
on operator PAYG + DNS). This runbook documents the manual route that exists today; it does not
authorize the deferred automation or the domain/DNS spend. The capture SPA is a live public-facing
resource — redeploy only under an explicitly authorized task, and prefer landing TKT-283's security
headers before the next content push.

## Post-deployment proof

- Confirm resource health, version/commit marker, HTTPS, and expected function registrations.
- Run authenticated positive and negative probes for changed routes.
- Inspect the component's own monitoring resource for new failures.
- Confirm mail, queue, database, and Archive effects only where the task authorizes those effects.
- Update `LIVE_FACTS.json` from dated evidence and attach the evidence to the ticket.

If a probe fails, stop and use [diagnostics](./diagnostics.md). Do not repeat a failing publish or live
command without establishing a cause.
