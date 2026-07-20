import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanProductionDependencies } from "./check-production-dependencies.mjs";

function temporaryRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "production-dependency-gate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relativePath, contents) => {
    const absolute = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents, "utf8");
  };
  write("package.json", JSON.stringify({ private: true, workspaces: ["apps/*", "packages/*"] }));
  return { root, write };
}

const webTarget = [{ name: "web", root: "apps/web", entries: ["apps/web/src/main.ts"] }];

test("rejects a transitive literal fixture import from a production entry", (t) => {
  const { root, write } = temporaryRepository(t);
  write("apps/web/src/main.ts", "import './feature.js';\n");
  write("apps/web/src/feature.ts", "import './fixtures/rows.js';\n");
  write("apps/web/src/fixtures/rows.ts", "export const rows = [];\n");

  const result = scanProductionDependencies({ root, typescriptTargets: webTarget, pythonTargets: [] });

  assert.ok(result.violations.some((finding) =>
    finding.source === "apps/web/src/feature.ts"
    && finding.kind === "import"
    && finding.marker === "fixture"));
});

test("resolves and rejects a statically constructed dynamic import", (t) => {
  const { root, write } = temporaryRepository(t);
  write("apps/web/src/main.ts", "import './loader.js';\n");
  write(
    "apps/web/src/loader.ts",
    "const category = 'sample';\nconst suffix = '-data';\nvoid import('./' + category + suffix + '.js');\n",
  );
  write("apps/web/src/sample-data.ts", "export const rows = [];\n");

  const result = scanProductionDependencies({ root, typescriptTargets: webTarget, pythonTargets: [] });

  assert.ok(result.violations.some((finding) =>
    finding.source === "apps/web/src/loader.ts"
    && finding.kind === "dynamic-import"
    && finding.marker === "sample"));
});

test("follows tsconfig aliases and workspace package exports", (t) => {
  const { root, write } = temporaryRepository(t);
  write("apps/web/tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@shared/*": ["../../packages/shared/src/*"] } } }));
  write("apps/web/src/main.ts", "import '@shared/clean';\nimport '@safe/domain';\n");
  write("packages/shared/src/clean.ts", "export const clean = true;\n");
  write("packages/safe/package.json", JSON.stringify({ name: "@safe/domain", exports: { ".": { types: "./src/index.ts" } } }));
  write("packages/safe/src/index.ts", "export * from './demo-records.js';\n");
  write("packages/safe/src/demo-records.ts", "export const records = [];\n");

  const result = scanProductionDependencies({ root, typescriptTargets: webTarget, pythonTargets: [] });

  assert.ok(result.targets[0].visited >= 4);
  assert.ok(result.violations.some((finding) =>
    finding.source === "packages/safe/src/index.ts"
    && finding.marker === "demo"));
});

test("follows Python imports and rejects a constructed dynamic module load", (t) => {
  const { root, write } = temporaryRepository(t);
  write("services/functions/example/function_app.py", "from service import run\n");
  write(
    "services/functions/example/service.py",
    "import importlib\ncategory = 'prototype'\nsuffix = '_data'\nrun = importlib.import_module(category + suffix)\n",
  );
  write("services/functions/example/prototype_data.py", "ROWS = []\n");

  const result = scanProductionDependencies({
    root,
    typescriptTargets: [],
    pythonTargets: [{
      name: "example",
      root: "services/functions/example",
      entry: "services/functions/example/function_app.py",
    }],
  });

  assert.ok(result.violations.some((finding) =>
    finding.source === "services/functions/example/service.py"
    && finding.kind === "dynamic-import"
    && finding.marker === "prototype"));
});

test("permits artificial data that is unreachable from production", (t) => {
  const { root, write } = temporaryRepository(t);
  write("apps/web/src/main.ts", "export const ready = true;\n");
  write("apps/web/tests/fixtures/fake.ts", "export const fabricated = true;\n");
  write("services/functions/example/function_app.py", "from service import run\n");
  write("services/functions/example/service.py", "run = True\n");
  write("services/functions/example/tests/sample_data.py", "ROWS = []\n");

  const result = scanProductionDependencies({
    root,
    typescriptTargets: webTarget,
    pythonTargets: [{
      name: "example",
      root: "services/functions/example",
      entry: "services/functions/example/function_app.py",
    }],
  });

  assert.deepEqual(result.violations, []);
});

test("rejects a server-only package reached from a browser production graph (ADR-0031)", (t) => {
  const { root, write } = temporaryRepository(t);
  write("apps/web/src/main.ts", "import '@cs/server-runtime';\n");
  write("packages/server-runtime/package.json", JSON.stringify({ name: "@cs/server-runtime", exports: { ".": { types: "./src/index.ts" } } }));
  write("packages/server-runtime/src/index.ts", "export const SERVER_RUNTIME_PACKAGE = '@cs/server-runtime';\n");

  const result = scanProductionDependencies({
    root,
    typescriptTargets: [{ name: "web", root: "apps/web", entries: ["apps/web/src/main.ts"], browser: true }],
    pythonTargets: [],
    serverOnlyPackages: ["packages/server-runtime"],
  });

  assert.ok(result.violations.some((finding) =>
    finding.owner === "web"
    && finding.kind === "server-only-boundary"
    && finding.dependency.startsWith("packages/server-runtime/")));
});

test("permits a server-only package that the browser production graph does not reach (ADR-0031)", (t) => {
  const { root, write } = temporaryRepository(t);
  write("apps/web/src/main.ts", "import '@cs/domain';\n");
  write("packages/domain/package.json", JSON.stringify({ name: "@cs/domain", exports: { ".": { types: "./src/index.ts" } } }));
  write("packages/domain/src/index.ts", "export const ready = true;\n");
  write("packages/server-runtime/package.json", JSON.stringify({ name: "@cs/server-runtime", exports: { ".": { types: "./src/index.ts" } } }));
  write("packages/server-runtime/src/index.ts", "export const SERVER_RUNTIME_PACKAGE = '@cs/server-runtime';\n");

  const result = scanProductionDependencies({
    root,
    typescriptTargets: [{ name: "web", root: "apps/web", entries: ["apps/web/src/main.ts"], browser: true }],
    pythonTargets: [],
    serverOnlyPackages: ["packages/server-runtime"],
  });

  assert.equal(result.violations.filter((finding) => finding.kind === "server-only-boundary").length, 0);
});

const domainPackage = [{ name: "@cs/domain", root: "packages/domain" }];

test("A3: rejects a direct cloud-SDK import in @cs/domain even when the SPA does not import it", (t) => {
  const { root, write } = temporaryRepository(t);
  write("packages/domain/package.json", JSON.stringify({ name: "@cs/domain", dependencies: { zod: "^3" } }));
  write(
    "packages/domain/src/index.ts",
    "import { DefaultAzureCredential } from '@azure/identity';\nexport const cred = DefaultAzureCredential;\n",
  );

  // No TypeScript target imports the package: the browser-safe audit is independent of SPA reach.
  const result = scanProductionDependencies({
    root,
    typescriptTargets: [],
    pythonTargets: [],
    browserSafePackages: domainPackage,
  });

  assert.ok(result.violations.some((finding) =>
    finding.owner === "@cs/domain"
    && finding.kind === "browser-unsafe-import"
    && finding.marker === "cloud-sdk"
    && finding.source === "packages/domain/src/index.ts"));
});

test("A3: rejects a transitive runtime-adapter import in @cs/domain", (t) => {
  const { root, write } = temporaryRepository(t);
  write("packages/domain/package.json", JSON.stringify({ name: "@cs/domain", dependencies: {} }));
  write("packages/domain/src/index.ts", "import './bridge.js';\nexport const ready = true;\n");
  write("packages/domain/src/bridge.ts", "import '@cs/server-runtime';\nexport const bridged = true;\n");

  const result = scanProductionDependencies({
    root,
    typescriptTargets: [],
    pythonTargets: [],
    browserSafePackages: domainPackage,
  });

  assert.ok(result.violations.some((finding) =>
    finding.kind === "browser-unsafe-import"
    && finding.marker === "server-runtime"
    && finding.source === "packages/domain/src/bridge.ts"));
});

test("A3: rejects a database-client production dependency in the @cs/domain manifest", (t) => {
  const { root, write } = temporaryRepository(t);
  write("packages/domain/package.json", JSON.stringify({ name: "@cs/domain", dependencies: { zod: "^3", pg: "^8" } }));
  write("packages/domain/src/index.ts", "export const ready = true;\n");

  const result = scanProductionDependencies({
    root,
    typescriptTargets: [],
    pythonTargets: [],
    browserSafePackages: domainPackage,
  });

  assert.ok(result.violations.some((finding) =>
    finding.kind === "browser-unsafe-dependency"
    && finding.marker === "database-client"
    && finding.dependency === "pg"
    && finding.source === "packages/domain/package.json"));
});

test("A3: rejects a Node-only builtin import in @cs/domain", (t) => {
  const { root, write } = temporaryRepository(t);
  write("packages/domain/package.json", JSON.stringify({ name: "@cs/domain", dependencies: {} }));
  write("packages/domain/src/index.ts", "import { createHash } from 'node:crypto';\nexport const h = createHash;\n");

  const result = scanProductionDependencies({
    root,
    typescriptTargets: [],
    pythonTargets: [],
    browserSafePackages: domainPackage,
  });

  assert.ok(result.violations.some((finding) =>
    finding.kind === "browser-unsafe-import" && finding.marker === "node-builtin"));
});

test("A3: permits a browser-safe @cs/domain (zod + relative imports, test files ignored)", (t) => {
  const { root, write } = temporaryRepository(t);
  write("packages/domain/package.json", JSON.stringify({ name: "@cs/domain", dependencies: { zod: "^3" } }));
  write("packages/domain/src/index.ts", "import { z } from 'zod';\nimport './rules.js';\nexport const schema = z.string();\n");
  write("packages/domain/src/rules.ts", "export const rule = true;\n");
  // A test file may use Node builtins; it must not be audited as production source.
  write("packages/domain/src/rules.test.ts", "import 'node:fs';\nexport const t = true;\n");

  const result = scanProductionDependencies({
    root,
    typescriptTargets: [],
    pythonTargets: [],
    browserSafePackages: domainPackage,
  });

  assert.equal(
    result.violations.filter((finding) => String(finding.kind).startsWith("browser-")).length,
    0,
    JSON.stringify(result.violations),
  );
});

test("rejects a dynamic module expression that cannot be resolved statically", (t) => {
  const { root, write } = temporaryRepository(t);
  write("apps/web/src/main.ts", "const moduleName = window.location.hash;\nvoid import(moduleName);\n");

  const result = scanProductionDependencies({ root, typescriptTargets: webTarget, pythonTargets: [] });

  assert.ok(result.violations.some((finding) => finding.kind === "unresolved-dynamic-import"));
});
