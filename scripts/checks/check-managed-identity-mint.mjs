#!/usr/bin/env node
/**
 * Managed-identity token-mint drift guard (TKT-251 / PLAN-007).
 *
 * TKT-248–250 consolidated every hand-rolled managed-identity token mint into
 * `packages/server-runtime`. This guard keeps that consolidation durable: it FAILS if the
 * managed-identity token-MINT surface reappears in production TypeScript OUTSIDE the package.
 *
 * The check is AST/import-aware, NOT a lexical grep. It parses each file with the TypeScript
 * compiler and inspects real syntax nodes, so it never flags the variable name inside a comment,
 * a docstring, a regex literal, or a string that merely mentions the mint. This precision is the
 * whole point: production code legitimately PRESENCE-CHECKS `process.env.IDENTITY_ENDPOINT`
 * (e.g. `services/data-api/.../blob-store.ts` decides local-dev vs managed-identity that way and
 * delegates the actual mint to `@cs/server-runtime`), and code legitimately mentions the SDK in
 * comments — a lexical ban would falsely reject all of that, plus the Python services and docs.
 *
 * The forbidden surface is TWO-PRONGED (Microsoft Learn):
 *
 *   1. Raw-endpoint mint — acquiring a token through the App Service MSI REST contract. The signal
 *      is dataflow, not a bare identifier: `process.env.IDENTITY_ENDPOINT` (or the storage-audience
 *      variant of it) flowing into a `fetch(...)` request URL, and/or the `X-IDENTITY-HEADER`
 *      request header the mint must send. A presence check that reads the env var but never fetches
 *      it is NOT a mint and is not flagged.
 *
 *   2. SDK mint — importing or constructing `@azure/identity` `ManagedIdentityCredential` /
 *      `DefaultAzureCredential`, or `require`/dynamic-`import` of `@azure/identity`. A guard that
 *      watched only `IDENTITY_ENDPOINT` would miss `new ManagedIdentityCredential()`, which mints
 *      an MI token without the app ever referencing `IDENTITY_ENDPOINT` (the SDK discovers the
 *      endpoint internally).
 *
 * Scope: production TypeScript only. `packages/server-runtime` (the allowed home), `*.test.ts` /
 * `*.spec.ts` / `tests` / `__tests__`, `*.d.ts`, `dist` / `node_modules`, the Python services, and
 * Markdown/docs are all excluded.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

import {
  comparePaths,
  listRepositoryFiles,
  normalizeRepositoryPath,
  repositoryRoot,
  resolveRepositoryPath,
} from "./repository-files.mjs";

export const ALLOWED_HOME = "packages/server-runtime";
const MANAGED_IDENTITY_CREDENTIALS = new Set([
  "ManagedIdentityCredential",
  "DefaultAzureCredential",
]);
const AZURE_IDENTITY_MODULE = "@azure/identity";
const IDENTITY_ENDPOINT_ENV = "IDENTITY_ENDPOINT";
const IDENTITY_REQUEST_HEADER = "X-IDENTITY-HEADER";
const PRODUCTION_ROOTS = ["apps/", "services/", "packages/"];

function scriptKind(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * Decide whether a repository-relative path is production TypeScript this guard must scan.
 * Excludes the allowed home, tests, declaration files, build output, and non-TS files (which
 * is how the Python services and Markdown are excluded — they are simply not `.ts`).
 */
export function isProductionTypeScript(repositoryPath) {
  const posix = repositoryPath.replaceAll("\\", "/");
  if (!/\.tsx?$/.test(posix)) return false;
  if (/\.d\.ts$/.test(posix)) return false;
  if (/\.(test|spec)\.tsx?$/.test(posix)) return false;
  const segments = posix.split("/");
  if (segments.some((segment) => segment === "node_modules" || segment === "dist")) return false;
  if (segments.some((segment) => segment === "tests" || segment === "__tests__")) return false;
  if (posix === ALLOWED_HOME || posix.startsWith(`${ALLOWED_HOME}/`)) return false;
  return PRODUCTION_ROOTS.some((prefix) => posix.startsWith(prefix));
}

function isProcessEnv(node) {
  return (
    ts.isPropertyAccessExpression(node)
    && node.name.text === "env"
    && ts.isIdentifier(node.expression)
    && node.expression.text === "process"
  );
}

/** A direct `process.env.IDENTITY_ENDPOINT` / `process.env['IDENTITY_ENDPOINT']` value read. */
function isIdentityEndpointAccess(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text === IDENTITY_ENDPOINT_ENV && isProcessEnv(node.expression);
  }
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    return (
      !!argument
      && ts.isStringLiteralLike(argument)
      && argument.text === IDENTITY_ENDPOINT_ENV
      && isProcessEnv(node.expression)
    );
  }
  return false;
}

function isFetchCallee(expression, sourceFile) {
  if (ts.isIdentifier(expression)) return expression.text === "fetch";
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === "fetch";
  if (ts.isElementAccessExpression(expression)) {
    const argument = expression.argumentExpression;
    return !!argument && ts.isStringLiteralLike(argument) && argument.text === "fetch";
  }
  void sourceFile;
  return false;
}

/** Trailing identifier of a (possibly namespaced) constructor: `X` or `ns.X`. */
function constructorName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function moduleSpecifierText(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function isAzureIdentityModule(specifier) {
  return specifier === AZURE_IDENTITY_MODULE || specifier?.startsWith(`${AZURE_IDENTITY_MODULE}/`);
}

/**
 * Analyse one source file's syntax tree for the two-pronged managed-identity mint surface.
 * Pure: no filesystem or module resolution. Returns findings sorted by line.
 */
export function analyzeManagedIdentityMint(repositoryPath, text) {
  const sourceFile = ts.createSourceFile(
    repositoryPath,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind(repositoryPath),
  );
  const findings = [];
  const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const add = (node, prong, detail) => findings.push({ path: repositoryPath, line: lineOf(node), prong, detail });

  // --- Prong 1 taint: which local bindings carry the IDENTITY_ENDPOINT value? ---
  const tainted = new Set();
  const referencesEndpoint = (node) => {
    if (!node) return false;
    let hit = false;
    const walk = (current) => {
      if (hit || !current) return;
      if (isIdentityEndpointAccess(current)) { hit = true; return; }
      if (ts.isIdentifier(current) && tainted.has(current.text)) { hit = true; return; }
      ts.forEachChild(current, walk);
    };
    walk(node);
    return hit;
  };

  // Fixed point over `const/let name = <expr referencing the endpoint or a tainted binding>`,
  // plus object-destructuring `const { IDENTITY_ENDPOINT } = process.env`. Iterate so multi-hop
  // chains (idEndpoint -> url -> fetch(url)) are followed.
  let changed = true;
  let guardPasses = 0;
  while (changed && guardPasses < 64) {
    changed = false;
    guardPasses += 1;
    const consider = (node) => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (ts.isIdentifier(node.name) && !tainted.has(node.name.text) && referencesEndpoint(node.initializer)) {
          tainted.add(node.name.text);
          changed = true;
        }
        if (ts.isObjectBindingPattern(node.name) && isProcessEnv(node.initializer)) {
          for (const element of node.name.elements) {
            const property = element.propertyName ?? element.name;
            const propertyText = ts.isIdentifier(property) || ts.isStringLiteralLike(property) ? property.text : null;
            if (propertyText === IDENTITY_ENDPOINT_ENV && ts.isIdentifier(element.name) && !tainted.has(element.name.text)) {
              tainted.add(element.name.text);
              changed = true;
            }
          }
        }
      }
      ts.forEachChild(node, consider);
    };
    consider(sourceFile);
  }

  // --- Detection walk ---
  const visit = (node) => {
    // Prong 1a: a fetch whose request URL is built from the IDENTITY_ENDPOINT value.
    if (ts.isCallExpression(node) && isFetchCallee(node.expression, sourceFile)) {
      if (node.arguments[0] && referencesEndpoint(node.arguments[0])) {
        add(node, "raw-endpoint-mint", "fetch() request URL is built from process.env.IDENTITY_ENDPOINT (App Service MSI REST mint)");
      }
    }

    // Prong 1b: the MSI request header only ever appears when actually calling the endpoint.
    if (ts.isStringLiteralLike(node) && node.text === IDENTITY_REQUEST_HEADER && !ts.isJsxText(node)) {
      add(node, "raw-endpoint-mint", `'${IDENTITY_REQUEST_HEADER}' request header (App Service MSI REST mint)`);
    }

    // Prong 2a: constructing an @azure/identity managed-identity credential.
    if (ts.isNewExpression(node)) {
      const name = constructorName(node.expression);
      if (name && MANAGED_IDENTITY_CREDENTIALS.has(name)) {
        add(node, "sdk-mint", `new ${name}() (@azure/identity managed-identity credential)`);
      }
    }

    // Prong 2b: value import of a managed-identity credential from @azure/identity.
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
      const specifier = moduleSpecifierText(node.moduleSpecifier);
      if (isAzureIdentityModule(specifier)) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            // For `import { ManagedIdentityCredential as Credential }` the ORIGINAL exported name
            // is element.propertyName and element.name is the local alias. Match on the original
            // so an aliased managed-identity credential import is not silently missed.
            const importedName = (element.propertyName ?? element.name).text;
            if (!element.isTypeOnly && MANAGED_IDENTITY_CREDENTIALS.has(importedName)) {
              const alias = element.propertyName ? ` as ${element.name.text}` : "";
              add(element, "sdk-mint", `import { ${importedName}${alias} } from '${specifier}'`);
            }
          }
        }
        if (bindings && ts.isNamespaceImport(bindings)) {
          add(node, "sdk-mint", `import * as ${bindings.name.text} from '${specifier}' (@azure/identity)`);
        }
      }
    }

    // Prong 2c: import-equals / require / dynamic import of @azure/identity.
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      if (isAzureIdentityModule(moduleSpecifierText(node.moduleReference.expression))) {
        add(node, "sdk-mint", `import = require('${AZURE_IDENTITY_MODULE}')`);
      }
    }
    if (ts.isCallExpression(node)) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if ((isRequire || isDynamicImport) && isAzureIdentityModule(moduleSpecifierText(node.arguments[0]))) {
        add(node, "sdk-mint", `${isRequire ? "require" : "import"}('${AZURE_IDENTITY_MODULE}')`);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return findings.sort((left, right) => left.line - right.line || left.prong.localeCompare(right.prong));
}

function collectTypeScriptFiles(directory) {
  const results = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(absolute);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        results.push(absolute);
      }
    }
  };
  walk(directory);
  return results.sort(comparePaths);
}

/**
 * Scan the production TypeScript of the repository (tracked files only). Straggler mints outside
 * `packages/server-runtime` become findings.
 */
export function scanProductionTree({ root = repositoryRoot, files } = {}) {
  const candidates = (files ?? listRepositoryFiles()).map(normalizeRepositoryPath).filter(isProductionTypeScript);
  const findings = [];
  for (const repositoryPath of candidates) {
    const absolute = files ? path.resolve(root, repositoryPath) : resolveRepositoryPath(repositoryPath);
    let text;
    try {
      text = fs.readFileSync(absolute, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    findings.push(...analyzeManagedIdentityMint(repositoryPath, text));
  }
  return { scannedFiles: candidates.length, findings };
}

/**
 * Analyse an arbitrary set of `.ts`/`.tsx` files with NO production-scope filter. Used by the unit
 * test and the `--scan <dir>` mode to point the guard at the negative fixtures, which live outside
 * the production tree precisely so the normal run never scans them.
 */
export function scanPaths({ root, paths }) {
  const findings = [];
  let scannedFiles = 0;
  for (const target of paths) {
    const absolute = path.isAbsolute(target) ? target : path.resolve(root ?? process.cwd(), target);
    const files = fs.statSync(absolute).isDirectory() ? collectTypeScriptFiles(absolute) : [absolute];
    for (const file of files) {
      scannedFiles += 1;
      const label = root ? normalizeRepositoryPath(path.relative(root, file)) : file;
      findings.push(...analyzeManagedIdentityMint(label, fs.readFileSync(file, "utf8")));
    }
  }
  return { scannedFiles, findings };
}

function reportFinding(finding) {
  return `- ${finding.path}:${finding.line} [${finding.prong}] ${finding.detail}`;
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const scanIndex = argv.indexOf("--scan");
  const scanValueIndex = scanIndex >= 0 ? scanIndex + 1 : -1;
  const rest = argv.filter((value, index) => value !== "--json" && value !== "--scan" && index !== scanValueIndex);
  if (rest.length) {
    console.error(`Unknown option(s): ${rest.join(", ")}`);
    process.exitCode = 2;
    return;
  }

  const result = scanIndex >= 0
    ? scanPaths({ paths: [argv[scanIndex + 1]] })
    : scanProductionTree();

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.findings.length === 0) {
    console.log(
      `Managed-identity mint guard: PASS (${result.scannedFiles} production TypeScript file(s) scanned; `
        + `no token-mint surface outside ${ALLOWED_HOME}).`,
    );
  } else {
    console.error(`Managed-identity mint guard: FAIL (${result.findings.length} finding(s)).`);
    console.error(
      `A managed-identity token mint appeared outside ${ALLOWED_HOME}. Route it through the shared`
        + " @cs/server-runtime primitives (getManagedIdentityToken / storageManagedIdentityCredential) instead:",
    );
    for (const finding of result.findings) console.error(reportFinding(finding));
  }
  process.exitCode = result.findings.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
