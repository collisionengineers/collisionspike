# OCR function

Provides `POST /api/ocr-pdf` for image-only PDF text extraction and
`POST /api/plate-ocr` for registration candidates. The orchestration and parsing paths
are the callers; the function does not persist case data.

## Contract

Requests carry a base64 document or image. Defensive decoding accepts one redundant
base64 wrapper because upstream transports can wrap byte strings. Responses preserve
the existing text, confidence, candidate, and issue fields. No result is auto-applied
to a case.

## Configuration

Engine selection and any external recognition credentials are supplied through app
settings and secret references. Feature availability is controlled by the calling API.

## Tests and deployment

Run `pytest` from this directory. Infrastructure is defined in `infra/main.bicep`;
deployment is an approved operation outside PLAN-006.
