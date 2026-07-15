# Tests and fixtures

- [`fixtures/`](./fixtures/README.md) contains deterministic text fixtures, the content-addressed
  evidence store, usage manifests, and shared evidence resolvers.
- [`evaluation/`](./evaluation/README.md) explains the reproducible evaluation suites and their
  executable locations.

TypeScript unit tests remain beside the source they cover. Python tests remain inside each function
service. `npm run verify` is the complete offline entry point.
