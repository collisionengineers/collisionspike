# Fixtures

- `cases/` contains small case-sidecar fixtures.
- `email/` contains labels and examination notes; source messages resolve through the evidence catalog.
- `evidence/sha256/<prefix>/` stores each unique source blob once under its SHA-256 identity.
- `manifests/evidence.json` records every logical usage and original filename.
- `resolvers/` provides Node and Python helpers that resolve a digest or logical source path.

Do not edit source evidence in place. Add or move evidence only through the catalog workflow, then run
`npm run check:evidence` and the decoded-document scan.
