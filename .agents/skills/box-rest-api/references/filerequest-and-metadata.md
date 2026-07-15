# File requests and metadata

Box creates file requests by copying an approved template; there is no independent
create-from-scratch path used by this project.

1. Maintain one reviewed template with the required capture fields.
2. Copy it to the Case/PO folder with
   `POST /2.0/file_requests/{templateId}/copy`.
3. Store the returned request id and upload URL.
4. Set `status: inactive` when the upload link should close; delete only when the
   product lifecycle explicitly requires removal.

The free-text description is not a dependable machine-readable upload attribute.
Most uploads need no registration capture because the per-case link already targets
the owning folder. Optional enterprise metadata can improve orphaned-upload triage,
but it must not become a prerequisite for the normal case path.
