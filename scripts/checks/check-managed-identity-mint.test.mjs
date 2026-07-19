import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_HOME,
  analyzeManagedIdentityMint,
  isProductionTypeScript,
  scanPaths,
  scanProductionTree,
} from "./check-managed-identity-mint.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "fixtures", "managed-identity-mint");

const prongs = (findings) => new Set(findings.map((finding) => finding.prong));

test("A3 raw-endpoint fixture is flagged as a raw-endpoint mint", () => {
  const { findings } = scanPaths({ paths: [path.join(FIXTURES, "raw-endpoint-mint.fixture.ts")] });
  assert.ok(findings.some((finding) => finding.prong === "raw-endpoint-mint"));
});

test("A3 @azure/identity SDK fixture is flagged as an SDK mint", () => {
  const { findings } = scanPaths({ paths: [path.join(FIXTURES, "sdk-managed-identity-credential.fixture.ts")] });
  assert.ok(findings.some((finding) => finding.prong === "sdk-mint"));
});

test("A3 the fixtures directory fails on BOTH prongs (raw + SDK)", () => {
  const { findings } = scanPaths({ paths: [FIXTURES] });
  assert.deepEqual([...prongs(findings)].sort(), ["raw-endpoint-mint", "sdk-mint"]);
});

test("presence-checking IDENTITY_ENDPOINT and delegating the mint is NOT flagged", () => {
  const source = `
    import { storageManagedIdentityCredential, STORAGE_RESOURCE_TRAILING_SLASH } from '@cs/server-runtime';
    const miCredential = storageManagedIdentityCredential({ audience: STORAGE_RESOURCE_TRAILING_SLASH });
    export function backend() {
      const account = process.env.EVIDENCE_BLOB_ACCOUNT;
      if (account && process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER) {
        return { kind: 'managed-identity', account, credential: miCredential };
      }
      return { kind: 'local-dev' };
    }
  `;
  assert.deepEqual(analyzeManagedIdentityMint("services/data-api/src/features/evidence/blob-store.ts", source), []);
});

test("a regex literal /IDENTITY_ENDPOINT/ is NOT flagged (AST, not lexical)", () => {
  const source = `
    export function classify(text: string) {
      if (/IDENTITY_ENDPOINT/.test(text)) return 'no_identity';
      return 'unavailable';
    }
  `;
  assert.deepEqual(analyzeManagedIdentityMint("services/data-api/src/features/inbound/outlook-queue.ts", source), []);
});

test("comments and docstrings mentioning the SDK / endpoint are NOT flagged", () => {
  const source = `
    /**
     * Uses IDENTITY_ENDPOINT via @cs/server-runtime. DEFERRED: prefer @azure/identity
     * ManagedIdentityCredential / DefaultAzureCredential (SDK-managed refresh).
     */
    import { getManagedIdentityToken } from '@cs/server-runtime';
    export const token = () => getManagedIdentityToken('aud://x'); // new ManagedIdentityCredential() someday
  `;
  assert.deepEqual(analyzeManagedIdentityMint("services/orchestration/src/adapters/aoai.ts", source), []);
});

test("a type-only @azure/identity import is NOT flagged", () => {
  const typeOnlyClause = "import type { ManagedIdentityCredential } from '@azure/identity';\n";
  const typeOnlySpecifier = "import { type DefaultAzureCredential } from '@azure/identity';\n";
  assert.deepEqual(analyzeManagedIdentityMint("services/data-api/src/x.ts", typeOnlyClause), []);
  assert.deepEqual(analyzeManagedIdentityMint("services/data-api/src/y.ts", typeOnlySpecifier), []);
});

test("a direct fetch(process.env.IDENTITY_ENDPOINT ...) mint IS flagged", () => {
  const source = `
    export async function mint(aud: string) {
      const res = await fetch(process.env.IDENTITY_ENDPOINT + '?resource=' + aud, {
        headers: { 'X-IDENTITY-HEADER': process.env.IDENTITY_HEADER ?? '' },
      });
      return res.json();
    }
  `;
  const findings = analyzeManagedIdentityMint("services/orchestration/src/platform/mint.ts", source);
  assert.ok(findings.some((finding) => finding.prong === "raw-endpoint-mint"));
});

test("a multi-hop taint (endpoint -> url -> fetch) IS flagged", () => {
  const source = `
    export async function mint(aud: string) {
      const idEndpoint = process.env.IDENTITY_ENDPOINT;
      const url = idEndpoint + '?resource=' + aud;
      const res = await fetch(url);
      return res.json();
    }
  `;
  const findings = analyzeManagedIdentityMint("services/orchestration/src/platform/mint.ts", source);
  assert.ok(findings.some((finding) =>
    finding.prong === "raw-endpoint-mint" && /fetch\(\) request URL/.test(finding.detail)));
});

test("new DefaultAzureCredential() and namespaced construction are flagged as SDK mints", () => {
  const named = "import { DefaultAzureCredential } from '@azure/identity';\nconst c = new DefaultAzureCredential();\n";
  const namespaced = "import * as identity from '@azure/identity';\nconst c = new identity.ManagedIdentityCredential();\n";
  assert.ok(analyzeManagedIdentityMint("apps/web/src/a.ts", named).some((f) => f.prong === "sdk-mint"));
  assert.ok(analyzeManagedIdentityMint("apps/web/src/b.ts", namespaced).some((f) => f.prong === "sdk-mint"));
});

test("an ALIASED @azure/identity managed-identity import is flagged on its original exported name", () => {
  const aliasedImport =
    "import { ManagedIdentityCredential as Credential } from '@azure/identity';\nconst c = new Credential();\n";
  const findings = analyzeManagedIdentityMint("services/data-api/src/aliased-mint.ts", aliasedImport);
  assert.ok(
    findings.some((f) => f.prong === "sdk-mint" && /ManagedIdentityCredential as Credential/.test(f.detail)),
    "an aliased managed-identity credential import must be caught on its original exported name, not the local alias",
  );
});

test("production-TypeScript scoping excludes the home, tests, decls, Python and Markdown", () => {
  // Included — real production TypeScript.
  assert.equal(isProductionTypeScript("services/data-api/src/features/evidence/blob-store.ts"), true);
  assert.equal(isProductionTypeScript("services/orchestration/src/platform/blob.ts"), true);
  assert.equal(isProductionTypeScript("apps/web/src/main.tsx"), true);
  assert.equal(isProductionTypeScript("packages/domain/src/index.ts"), true);
  // Excluded.
  assert.equal(isProductionTypeScript(`${ALLOWED_HOME}/src/managed-identity.ts`), false);
  assert.equal(isProductionTypeScript("services/data-api/src/features/inbound/outlook-queue.test.ts"), false);
  assert.equal(isProductionTypeScript("services/orchestration/src/x.spec.ts"), false);
  assert.equal(isProductionTypeScript("services/data-api/tests/helpers.ts"), false);
  assert.equal(isProductionTypeScript("apps/web/src/__tests__/x.ts"), false);
  assert.equal(isProductionTypeScript("packages/server-runtime/dist/managed-identity.d.ts"), false);
  assert.equal(isProductionTypeScript("services/functions/parser/function_app.py"), false);
  assert.equal(isProductionTypeScript("docs/tickets/backlog/TKT-251/notes.md"), false);
  assert.equal(isProductionTypeScript("scripts/checks/fixtures/managed-identity-mint/raw-endpoint-mint.fixture.ts"), false);
});

test("A2 the current production tree has no mint outside the package", () => {
  const { findings } = scanProductionTree();
  assert.deepEqual(
    findings,
    [],
    `Unexpected managed-identity mint outside ${ALLOWED_HOME}:\n`
      + findings.map((f) => `  ${f.path}:${f.line} [${f.prong}] ${f.detail}`).join("\n"),
  );
});
