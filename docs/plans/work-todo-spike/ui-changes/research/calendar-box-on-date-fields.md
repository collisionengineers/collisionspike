# Research pack: calendar box on date fields

## Source ticket

`docs/plans/work-todo-spike/ui-changes/calendar-box-on-date-fields.md`

The ticket asks for a calendar control on `Date of Incident` and `Date of Instruction`.

## What is happening

The two requested fields are EVA date fields:

- `dateOfLoss` maps to `Date of Incident`.
- `dateOfInstruction` maps to `Date of Instruction`.
- The contract labels are in `packages/domain/src/contracts/eva-export.ts:84-85`.

Both fields are currently rendered through the shared EVA field component. `mockup-app/src/components/EvaFields.tsx:92-94` identifies special field kinds, but date fields fall through to the default plain `Input` at `mockup-app/src/components/EvaFields.tsx:165-172`.

This affects both main editing surfaces:

- Manual intake renders the date cluster through `EvaFieldRow` in `mockup-app/src/screens/ManualIntake.tsx:1015-1020`.
- Case detail renders all `FIELD_CLUSTERS` through `EvaFieldRow` in `mockup-app/src/screens/CaseDetail.tsx:1141-1156`.

## Why it happens

The repo stores EVA dates as `DD/MM/YYYY` strings, not native date values:

- Domain model comments and field types describe `DD/MM/YYYY` strings in `packages/domain/src/model/types.ts:51-57` and `packages/domain/src/model/types.ts:75-76`.
- Parser schema accepts empty strings or `DD/MM/YYYY` in `functions/parser/contracts/eva-payload.schema.json:61-69`.
- Postgres checks enforce the same shape in `migration/assets/schema/050_case.sql:73-74` and `migration/assets/schema/050_case.sql:99-100`.
- The API inserts the strings directly in `api/src/functions/cases.ts:222-224`.

No date picker package is currently installed. `mockup-app/package.json:13-24` includes Fluent core packages, lucide, React, and Vite tooling, but not `@fluentui/react-datepicker-compat` or a similar date picker.

## Affected files

- `mockup-app/src/components/EvaFields.tsx` - shared field renderer and best place for the control branch.
- `mockup-app/src/screens/ManualIntake.tsx` - manual intake form that will inherit the shared control.
- `mockup-app/src/screens/CaseDetail.tsx` - case editor that will inherit the shared control.
- `packages/domain/src/contracts/eva-export.ts` - authoritative field labels.
- `packages/domain/src/model/types.ts` - date format expectations.
- `functions/parser/contracts/eva-payload.schema.json` - parser output validation.
- `migration/assets/schema/050_case.sql` - database check constraints.
- `api/src/functions/cases.ts` - create/update persistence format.
- `mockup-app/package.json` - dependency change if using Fluent date picker.

## Changes that would resolve it

1. Add a date-field branch inside `EvaFieldRow`.
   - Detect `dateOfLoss` and `dateOfInstruction`.
   - Render a date picker or native date input with a calendar affordance.
   - Convert between the UI value and the stored `DD/MM/YYYY` string.

2. Preserve manual correction.
   - Handlers sometimes need to correct dates from instructions. The control should allow keyboard entry or an adjacent typed value path, not only pointer selection.

3. Keep storage unchanged.
   - Do not migrate the EVA case fields to ISO dates unless the wider contract changes.
   - Convert UI-selected values back to `DD/MM/YYYY` before saving.

4. Pick the implementation style deliberately.
   - Minimal option: a small wrapper around native `<input type="date">`, converting `YYYY-MM-DD` to `DD/MM/YYYY`.
   - Fluent option: add `@fluentui/react-datepicker-compat` and use the Fluent control to match the rest of the app. This adds a dependency and should be covered by a build check.

5. Test the conversion.
   - Unit-test `DD/MM/YYYY` to picker value and picker value back to `DD/MM/YYYY`.
   - Component-test both fields on Manual Intake and Case Detail.

## Open checks before implementation

- Manual Intake also has an optional inspection date field in `mockup-app/src/screens/ManualIntake.tsx:1021-1029`. The ticket only names incident and instruction dates, but the same control may be wanted there once the first two are fixed.
