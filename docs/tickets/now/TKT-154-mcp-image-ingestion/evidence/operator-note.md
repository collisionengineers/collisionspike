# Operator note — external-agent image ingestion

An automated agent will watch a local folder containing images. It must use MCP to check whether an open case exists for the registration, then upload the images only when the match is safe so they are attached to that case and archived. Outlook must remain read-only. Box writes must stay inside the current test folder.

The supplied image-ingestion sketch is preserved beside this note after distillation.

