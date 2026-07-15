# Vehicle-data rollout

Vehicle lookup and mileage estimation are one versioned service capability. Rollout must preserve raw
provider evidence and fail closed when confidence or calibration is inadequate.

## Before enabling a new model/rule version

1. Run the retained provider fixtures and contract-parity tests.
2. Run chronological holdouts representative of production age, fuel, mileage, sparse history, unit,
   cherished-transfer, retest, and odometer-drop patterns.
3. Publish observed interval coverage and abstention rate by eligible cohort.
4. Confirm the Data API stores raw snapshots, rule/model versions, decisions, range, and warnings without
   overwriting an authoritative instruction value.
5. Confirm explicit staff lookup and automated intake use the same Data API route.
6. Obtain separate authority for any live configuration change.

Exact observed MOT values may be applied when valid. Estimated values default into a Case only when the
production-scale holdout profile meets its target and the rollout gate is explicitly approved. Otherwise
the estimate remains a staff-reviewed suggestion.
