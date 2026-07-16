# Staff web app

## Ownership

This package owns the authenticated case-handler interface. Product features live under `src/features`, reusable controls under `src/shared/ui`, application routing under `src/app`, and network access under `src/data`.

## Public contract and callers

The browser calls the REST routes exposed by `@cs/api` through `src/data/rest-client.ts`. Route names, request and response shapes, authentication rules, and persisted numeric codes are external contracts. `src/main.tsx` is the production entry point; it installs the authenticated data source before rendering the app.

Production begins with `emptyDataAccess`. Fabricated records are confined to `src/__fixtures__`; `src/data/production-boundary.test.ts` prevents production modules from importing them.

## Tests

Run `npm test --workspace @cs/web` for component, feature, contract, accessibility, and source-boundary tests. Run `npm run build --workspace @cs/web` for the TypeScript and Vite production build.

## Configuration and deployment

Public browser settings are read from the documented `VITE_*` variables. Secrets do not belong in this package. The root packaging command builds this workspace and writes deployable output beneath the ignored `.artifacts/deploy/` directory. Repository work alone does not authorize a deployment.
