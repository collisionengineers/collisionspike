# Verification — TKT-208: Catalog evidence and relocate workingspace without content changes

## Verdict
TESTED (offline)

## Evidence
- The catalog resolves 550 logical usages to 533 unique blobs. Seventeen duplicate occurrences account
  for 72,307,413 deduplicated bytes without deleting their logical records, including every parser
  instruction fixture.
- The disposition manifest records 94 generated, obsolete-export or transcribed-prototype occurrences
  that are not evidence-store inputs.
- Evidence schema, Node resolver, Python resolver and catalog check validate full hashes, sizes, storage
  paths and logical keys offline.
- The final workingspace directory contains exactly four files. Recomputed SHA-256 values are:
  - aifirstplan.txt — 1e092f72364e78ba05aeaeae022e73ac83d89f76122e131fb17743ab03a3126c
  - model-evaluation-plan.md — 46e5795937fae4741b6fd7f778e1ffe1a7515ad39884a0128abb4e784fa4558d
  - proposedparserchanges.md — 768893ff9be0f8790f642336f77ec4ff4b33077994cbfae2c8c993534b3d2566
  - smallmodels.md — f02a84860aa71ad4c3980a7634fe05d539895b642319ea15ee5814dcd97c6f1e
- Documentation checks resolve retained evidence through manifests with zero broken links or orphans.

## Pending / gaps
- Remote CI and independent sampling of each retained media type remain pending.

## How to re-verify
Run node scripts/maintenance/evidence-catalog.mjs check and both fixture-resolver tests, then recompute
SHA-256 for workingspace/*. Independently sample email, message, PDF, Office and image usages and confirm
each original logical record resolves to a byte-identical object.
