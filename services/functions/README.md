# Python function services

Each child directory is an independently packaged Python service with its own contract, tests,
requirements, and deployment inputs. Cross-service duplication is checked, not shared — see
[ADR-0032](../../docs/adr/0032-python-independent-packaging.md) (the packaging doctrine; Decision of
record).

| Service | Responsibility |
| --- | --- |
| [`box-webhook`](./box-webhook/README.md) | Archive events, uploads, and file requests |
| [`eva-sentry`](./eva-sentry/README.md) | EVA submission contract and transport |
| [`location-assist`](./location-assist/README.md) | Handler-reviewed location suggestions |
| [`ocr`](./ocr/README.md) | Scanned-document and image text extraction |
| [`parser`](./parser/README.md) | Instruction parsing and deterministic mail classification |
| [`vehicle-enrichment`](./vehicle-enrichment/README.md) | Vehicle and mileage enrichment |

Run a service's tests with its local requirements installed: `python -m pytest tests -q`. The root
CI matrix runs every retained suite. Live deployment always follows the repository operations guide.
