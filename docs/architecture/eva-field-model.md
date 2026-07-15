# EVA field model

The settled JSON export contract is [contracts/eva-payload.schema.json](../../contracts/eva-payload.schema.json).
It contains exactly these keys in order:

1. `work_provider`
2. `vehicle_model`
3. `claimant_name`
4. `claimant_telephone`
5. `claimant_email`
6. `date_of_loss`
7. `date_of_instruction`
8. `accident_circumstances`
9. `inspection_address`
10. `vat_status`
11. `mileage`
12. `mileage_unit`

The canonical wire key is `date_of_loss`; the handler-facing label is “Date of incident.” VRM and
Case/PO are case-identity fields and are intentionally outside this payload. Engineer allocation is also
outside the payload and happens in EVA.

## Readiness

The app requires valid case identity, Principal/Work Provider, insured name, provider reference, incident
date, inspection date, inspection-address decision, accident circumstances, vehicle model, and the image
rules before handoff. Provider-specific requirements may add fields.

Make and mileage can be suggested from vehicle facts only when the instruction does not provide an
authoritative value. VAT is a staff value. Inspection type is the constant “Vehicle Damage Inspection.”

The inspection address is either six newline-separated lines or the exact `Image Based Assessment`
choice. Staff choose or edit it; runtime code never derives it from `Loc`.

Changes to key names, ordering, validation, or semantics require synchronized schema, TypeScript, Python,
and snapshot updates.
