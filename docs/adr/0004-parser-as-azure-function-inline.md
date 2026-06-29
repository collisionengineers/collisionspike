# cedocumentmapper_v2.0 runs as an Azure Function, called inline from M1

**Status:** Accepted (2026-06-17).

The document parser is integrated from the **first milestone** as an HTTP **Azure Function** (exposed
to the Power Apps Code App via a custom connector, gated by `PDF_MAPPER_ENABLED`), rather than left
as an offline CLI or deferred to a later milestone. The Code App calls it on the instruction to
pre-fill the 12 EVA fields, which staff then review (Review-auto). Chosen because the parser is the
core IP and the spike should prove the parser→EVA path end-to-end early. Cost: pulls Azure Function
infra — and the **PyMuPDF AGPL** resolution — into M1. Alternatives (manual field entry; hand-importing
parser JSON) were rejected as a hollow loop / clunky UX.
