# Domain package

`@cs/domain` owns environment-free business types, DTOs, JSON schemas, codecs, readiness rules, and
stable numeric mappings shared by the web app and TypeScript services. It must not depend on a runtime
adapter, database client, or cloud SDK.

Public exports are in `src/index.ts`. Build with `npm run build --workspace @cs/domain`; run its contract
and mapping tests with `npm run test --workspace @cs/domain`.
