# Intake Workflow & Requirements

> Source: promoted from the original `scratchnotes.md`. This is the target end-to-end
> automation for the spike. Pair with [admin-overview.md](./admin-overview.md) (how the
> manual process works today) and [../architecture/microsoft-stack.md](../architecture/microsoft-stack.md)
> (which Microsoft services implement each step).

## Target pipeline (10 steps)

1. **Monitor / poll** the Outlook mailbox(es).
2. **Email received.**
3. **Parse instruction content** — PDF / DOC / DOCX / MSG / EML. Any image content is
   identified with OCR / AI.
4. **Detect & identify** incoming emails based on sender address, document structure, and content.
5. **Tag / categorise** the Outlook message.
6. **Case appears in the app** for human review.
7. **If required fields and images are present**, staff can approve and send / export to EVA.
8. **If images or required data / instructions are missing**, the case is **held** and a
   **chaser workflow** is started.
9. **When requirements are met**, the case is **submitted to EVA**, a **Box folder** is created,
   and the case is **finalised**.
10. **All actions are stored** for **audit** and **deduplication**.

## Additional requirements

- **DVSA / MOT integration** — enrichment Azure Function calls **DVSA + DVLA directly via Entra**
  (the `collisionplugin` OAuth gateway was retired; direct-to-API with a managed identity is the live
  architecture). Custom Power Platform connectors expose `Func_DvsaEnrich` to Power Automate. Scope:
  **mileage estimation** (`current_mileage_estimate`) and **vehicle details**
  (`get_vehicle_summary` → make / model / year / tax / etc.). Valuation integration is later.
- **Valuationbot integration** — potential; comparable-advert valuation + evidence PDF, also in
  `collisionplugin`.
- **Copilot Studio** → a **Collision Engineers copilot**. Evaluate inclusion in the plan **plus
  costing** (see [microsoft-stack.md](../architecture/microsoft-stack.md#9-conversational-copilot--copilot-studio)).
- **postcode.io** — UK address normalisation (free). Microsoft alternative (Azure Maps) evaluated
  for later if reverse geocoding / autocomplete is needed.
- **cedocumentmapper_v2.0** — the document parser that powers steps 3–4 (already ~75% built; see
  [repo-constellation.md](../architecture/repo-constellation.md#cedocumentmapper_v20)).
- **WhatsApp intake** — manual (WhatsApp Business **app**, no API/webhook — ADR-0007). Planned
  timesaver: bulk-import exported WhatsApp media → OCR/vision matches images to Cases by **VRM**.
- **Audatex** — **out of scope** for the spike (deferred entirely).

## Reference sources

Background and ideas come from sibling repositories — **none canonical**, all reference/prior-art:
**`ccc`** (planning & draft contracts), **`collisioncc`** (a mature reference implementation), and
**`collisionplugin`** (MCP enrichment connectors). The binding design is distilled into this repo's
own docs. See [repo-constellation.md](../architecture/repo-constellation.md).
