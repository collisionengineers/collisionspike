# Pattern 8 — DLP, ALM & solution-packaging gotchas

Plan ref: §6 ALM, §8.5 boundary gate, §5.1 "references only declared connection refs". This is how the
authored flow definitions actually ship inside the `CollisionSpike` solution **turned off**, without DLP
surprises.

## Ship flows as definitions that are OFF by default

- **Every intake / classify / dedup / status / EVA-submit / Box-sync / chaser flow is exported in the
  solution with state = off / not-activated.** Activation is the user's reserved step (§2,
  `[RESERVED-FOR-USER]`). When you export a managed/unmanaged solution, set each cloud flow's
  `statecode`/activation so import lands them **draft/off**. Produce the §8.5 checklist: flow name → off
  state.
- A flow definition references **connection references** (`connectionReferences`), not literal
  connections. The actual connection (to a specific live mailbox / Box account) is bound **by the user at
  activation**. Claude must never bind a connection to a live shared mailbox (§8.5 connection inventory).

## Connection references in the solution

Each `host.connectionName` in the action fragments (e.g. `shared_office365`, `shared_box`,
`shared_commondataserviceforapps`, the custom `shared_ceparser` / `shared_evasentry`) must resolve to a
**connection reference** packaged in the solution, not a hard connection id. The
`customizations.xml` / `connectionreferences` carry logical names like:

```
cr123_sharedmailbox_office365      -> Office 365 Outlook   (intake trigger; bound by user)
cr123_dataverse                    -> Microsoft Dataverse
cr123_box                          -> Box                  (finalization; bound by user)
cr123_sharepoint                   -> SharePoint           (job-sheet import; bound by user)
cr123_ceparser                     -> custom: /parse       (deploy-with-login)
cr123_dvsaenrich                   -> custom: /dvsa-mot/enrich
cr123_evasentry                    -> custom: EVA Sentry    (gated EVA_API_ENABLED)
cr123_evavalidation                -> custom: validation surface (Pattern 4)
```

> Keep one connection reference per logical connector; flows bind to the reference, the reference binds to
> a connection at deploy/activation. This is what lets the *same* definition move dev → test → prod
> unchanged.

## Environment variables are definitions, not values, in the solution

- Package the env-var **definitions** (`PDF_MAPPER_ENABLED`, `ENRICHMENT_ENABLED`, `ENRICHMENT_API_BASE`,
  `EVA_API_ENABLED`, `EVA_BASE_URL`, `AZURE_MAPS_ENABLED`, …) with their **default** values; supply
  **environment-specific current values** at/after import, not in the unmanaged source.
- **Secret** env-vars (`EVA_CLIENT_ID/SECRET`, gateway creds) carry **Key Vault references only** — never
  a literal secret in the solution, the flow, or any committed config (CLAUDE.md; §8.5 no-credentials
  assertion). The Function dereferences Key Vault; the flow never reads the secret value.
- Flows **read** these (Pattern 5); the **manifest owner is dataverse-data-architect**. A flow that
  writes an `environmentvariablevalue`/`definition` is a boundary violation.

## DLP / premium-connector watch-list

- **DLP policy must place every connector this spike uses in the *same* data group.** If Dataverse is
  "Business" and Box/HTTP is "Non-Business" (or blocked), the flow will fail to run or even to import.
  Confirm the target environment's DLP before activation; flag any connector that would straddle groups.
- **Premium connectors in play:** Dataverse, Box, custom connectors (parser/DVSA/EVA), and HTTP are
  **premium** → require Premium licensing (also the open Code Apps GA/licensing question, Risk #12).
  Standard: Office 365 Outlook, SharePoint, Excel Online (Business). No surprise premium dependency
  should appear that the manifest didn't anticipate — audit the action list for connectors not in the
  §3 services table.
- **Custom connectors are environment-scoped** and must be imported (deploy-with-login) before a flow
  that references them will run. Their OpenAPI is authored offline (azure-integration-engineer); gating
  is at the flow branch (Pattern 5), not inside the connector.

## Offline build-verification for packaging (§5.1 / §8.1)

- Lint each exported `flows/*.definition.json`: well-formed; **references only declared connection
  refs**; trigger/action schema matches the connector swagger; all `@`-expressions compile (no unresolved
  dynamic-content tokens).
- Run the **Power Platform solution checker / flow checker statically** (no run) → no errors (§8.4).
- Assert flow `state = off` for every intake/categorize/SharePoint/Box/EVA-submit flow (§8.5 step 2).
- Grep the solution for secret-var names → only Key Vault **references** appear, never values (§8.5
  step 3).
