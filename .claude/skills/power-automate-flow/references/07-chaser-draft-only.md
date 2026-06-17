# Pattern 7 — WhatsApp draft-only chaser

Plan ref: §5.10 Surface C + integrations.md "Outbound chasers (ADR-0003)". **Hard rule: the spike never
auto-sends a WhatsApp chaser.** ADR-0003: WhatsApp is WhatsApp Business only, no free automated send →
the flow **composes a draft and logs it as `drafted`**; a human sends it. Email chasers are also drafted
now, sent later via Outlook (and that send is itself behind the outbound kill switch). Audatex is out of
scope.

## Why draft-only (and why it must be structurally impossible to send)

The cost/compliance reason is ADR-0003, but the engineering reason is blast-radius: an intake flow that
could send outbound messages to claimants is exactly the kind of thing that must **not** be auto-activated
on a live inbox. Keeping the chaser path to "write a `Chaser` row with state `drafted`" means there is
**no send connector in the action list at all** — the boundary is enforced by the *absence* of an
Outlook-send / WhatsApp-send action, not just by a flag. A reviewer greps the chaser flow for send
operations and finds zero.

## Fragment — compose draft + log as drafted

```json
{
  "actions": {
    "Compose_chaser_text": {
      "type": "Compose",
      "inputs": "@concat('Hi ', coalesce(outputs('Get_case')?['body/cr123_claimantname'], 'there'), ', regarding ', outputs('Get_case')?['body/cr123_caseref'], ' (', outputs('Get_case')?['body/cr123_vrm'], ') we still need: ', variables('outstandingText'), '. Could you reply with these so we can proceed?')",
      "runAfter": {}
    },
    "Create_chaser_draft": {
      "type": "OpenApiConnection",
      "inputs": {
        "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
        "parameters": {
          "entityName": "cr123_chasers",
          "item/cr123_case@odata.bind": "@concat('cr123_cases(', variables('caseId'), ')')",
          "item/cr123_channel": "whatsapp",
          "item/cr123_state": "drafted",
          "item/cr123_draftbody": "@outputs('Compose_chaser_text')",
          "item/cr123_note": "DRAFT ONLY — never auto-sends (ADR-0003). Staff sends manually."
        }
      },
      "runAfter": { "Compose_chaser_text": [ "Succeeded" ] }
    },
    "Audit_chaser_drafted": {
      "type": "OpenApiConnection",
      "inputs": {
        "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
        "parameters": { "entityName": "cr123_auditevents",
          "item/cr123_action": "chaser_drafted", "item/cr123_severity": "info",
          "item/cr123_actor": "Flow_Chaser",
          "item/cr123_after": "whatsapp draft created; awaiting manual send" }
      },
      "runAfter": { "Create_chaser_draft": [ "Succeeded" ] }
    }
  }
}
```

> **`@odata.bind` casing.** The target is the entity **set** name + record GUID
> (`cr123_cases(<guid>)`), and the property is the lookup's **schema** name, which Dataverse treats
> case-sensitively (often PascalCase, e.g. `cr123_Case@odata.bind`). On *read* this skill binds lookups
> via `_cr123_<lookup>_value` filters; `@odata.bind` is the *write* form. Confirm both the set name and
> the exact lookup schema-name casing against the frozen schema before deploy.

## Email chaser variant

Same shape, `cr123_channel = email`, also `state = drafted`. **Do not** add a "Send an email (V2)"
action. The later Outlook-send step is a *separate* flow gated behind the outbound kill switch, owned by
the user to activate — keep drafting and sending in different flows so the draft flow can never send.

## Caption to keep on the artifact

> **This chaser pattern never auto-sends (ADR-0003).** It only writes `drafted` Chaser rows; sending is a
> human/`[RESERVED-FOR-USER]` action. WhatsApp send is not automatable here; Email send is deferred and
> kill-switched.
