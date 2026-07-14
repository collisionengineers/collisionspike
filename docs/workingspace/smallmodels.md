

\# Extraction-first email understanding with small-model escalation



\## Summary



\- Extract text and structured identifiers from every document-bearing email before semantic classification.

\- Use a small model for category, subtype, document role, and intent; retain deterministic code for case resolution and routing actions.

\- Select the cheapest model that passes the frozen offline corpus rather than assuming the strongest model is necessary.

\- Keep the legacy classifier as a temporary fallback and deploy through a versioned Durable orchestration path.



\## Implementation changes



\- Create one `understandInbound` activity that internally downloads documents, invokes native parsing/OCR, calls the model, performs context lookup, and returns only structured results. Raw extracted text must not enter Durable history, logs, audit records, or telemetry.

\- Extend the internal parser request with optional text return. For each attachment, retain stable index, filename, native/OCR source, truncation state, document type, provider, VRM, provider job reference, VIN, page/image counts, and issues.

\- Feed the model the email plus bounded per-document text. Parse the complete text deterministically first; apply the model-input cap afterward. Treat attachment text as untrusted evidence, never as model instructions.

\- Run the selected nano model on every email. Escalate to the selected mini model for invalid output, abstention, confidence below `0.85`, multiple/conflicting identifiers, parser/model disagreement, or an unexplained image-only document. Unresolved escalation goes to manual review.

\- Resolve cases once using recognized provider plus exact provider job reference and normalized VRM. A unique eligible match may auto-associate; zero, multiple, or conflicting matches never do. AI output cannot nominate or override a case ID.

\- Use vision only after native extraction and OCR both fail, capped to four representative rendered pages/images.

\- Preserve the existing activity sequence for null/legacy orchestration versions. Put the reordered path behind a new orchestration version and a kill switch.



\## Interfaces



\- `ParsedDocumentSignal`: attachment index, filename, text source, truncation flag, document role/type, validated identifiers, provider, page/image counts, and closed-vocabulary issues. It never returns raw text from the activity.

\- `EmailUnderstanding`: category, subtype, confidence, rationale, document roles, candidate identifiers with provenance, escalation reason, and model/version.

\- AI responses use a strict JSON schema. Any AI-extracted identifier must appear verbatim in the supplied email/document text and pass deterministic normalization before lookup.



\## Validation and rollout



\- Freeze the current item-level corpus baseline, then run GPT‑5 nano, GPT‑5.4 nano, GPT‑5 mini, and GPT‑5.4 mini for three trials per item.

\- Select the cheapest primary model with zero unsafe associations and no regression on currently correct corpus items. Select the cheapest escalation model that resolves the primary model’s remaining failures.

\- Include parser-only references, conflicting documents, invoices, reports, generic photo PDFs, scanned instructions, duplicate filenames, long-document truncation, prompt injection, OCR failure, and multi-case VRM scenarios.

\- Hard-fail on any AI-selected case, ambiguous auto-association, missing tracked item, changed outcome without justification, or raw text appearing in telemetry/Durable output.

\- Run a representative 50-message token and latency benchmark. At current traffic, accept projected routine model cost only if it remains under £10/month; report vision fallback separately.

\- Deploy the models and versioned orchestration with the new route disabled, run the offline acceptance gate, then enable it. Keep the legacy classifier for one release before removal.



\## Assumptions



\- Case/PO is internal and is not expected on inbound email.

\- Provider job reference and provider-scoped normalized VRM are the inbound case-identity keys.

\- A unique eligible VRM match may auto-associate for recognized providers.

\- Raw content may be sent to the configured Global Standard model, but must not be logged.

\- The default recommendation is nano-first with mini escalation; exact model names are selected by the deterministic cheapest-passing evaluation rule.
