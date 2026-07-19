#!/usr/bin/env node
/**
 * Scripts single-source drift guard (TKT-261 / PLAN-010).
 *
 * PLAN-010 collapsed two families of duplicated script internals back to a single source:
 *   - TKT-258 put the incremental SHA-256 content-hash core in `scripts/checks/content-hash.mjs`.
 *   - TKT-259 put the generated-directory set + predicate in `scripts/checks/repository-files.mjs`.
 * Those consolidations only stay collapsed if a re-duplication FAILS a check. This guard is that
 * backstop: it FAILS when either shared internal is re-implemented or re-declared outside its home.
 *
 * The check is AST/import-aware, NOT a lexical grep. Every file is parsed with the TypeScript
 * compiler and only real syntax nodes are inspected, so a `createHash("sha256")` inside a comment,
 * a docstring, or a string literal is never flagged, and an IMPORT binding of a shared name is
 * distinguished from a local re-DECLARATION of it. That precision is the whole point: a lexical ban
 * would falsely reject the shared module itself, the test fixtures, and every doc that mentions the
 * primitive.
 *
 * Two single-source assertions:
 *
 *   1. Inventory content-hash core is IMPORTED, not re-implemented. The inventory/checkout
 *      generators and the repo-shape checks must not carry their own direct-byte SHA-256: no
 *      `createHash("sha256")` call, no `{ createHash }` import from `node:crypto`, no local
 *      `sha256File` / `sha256Bytes` re-declaration. The generators that DO hash must import the
 *      primitive from `scripts/checks/content-hash.mjs`. Sibling scripts that legitimately keep
 *      their own hasher (e.g. `evidence-catalog.mjs`, `reconcile-repository-reset.mjs`,
 *      `runtime-contract-lib.mjs`) are intentionally out of scope and are not scanned.
 *
 *   2. Generated-directory policy is DEFINED ONCE. `GENERATED_DIRECTORY_SEGMENTS` and
 *      `generatedDirectorySegment` are defined only in `scripts/checks/repository-files.mjs`; the
 *      consuming repo-shape checks (`check-repository-layout.mjs`, `check-tracked-outputs.mjs`)
 *      import the predicate, they never re-declare the set or a second predicate.
 *
 * Scope is an explicit allowlist of real files, so the negative fixtures under
 * `scripts/checks/fixtures/scripts-dedup/` are never scanned by the normal run; the unit test points
 * the pure analysers at them directly.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

import { repositoryRoot } from "./repository-files.mjs";

// --- Configuration: the exact single-source home + consumer surface ------------------------------

export const HASH_CORE_HOME = "scripts/checks/content-hash.mjs";
export const GENERATED_POLICY_HOME = "scripts/checks/repository-files.mjs";

// Scripts that must not re-implement the inventory hash core (the inventory/checkout generators plus
// the repo-shape checks). A subset genuinely hashes and so must import the shared primitive.
const HASH_SCOPE = [
  "scripts/maintenance/generate-repository-inventory.mjs",
  "scripts/maintenance/generate-checkout-inventory.mjs",
  "scripts/checks/check-repository-layout.mjs",
  "scripts/checks/check-tracked-outputs.mjs",
];
const HASH_REQUIRED_IMPORTERS = new Set([
  "scripts/maintenance/generate-repository-inventory.mjs",
  "scripts/maintenance/generate-checkout-inventory.mjs",
]);

// Checks that consume the generated-directory policy: they import it, never re-declare it.
const GENERATED_POLICY_CONSUMERS = [
  "scripts/checks/check-repository-layout.mjs",
  "scripts/checks/check-tracked-outputs.mjs",
];

const HASH_CORE_MODULE = "content-hash.mjs";
const GENERATED_POLICY_MODULE = "repository-files.mjs";
const SHARED_HASH_EXPORTS = new Set(["createContentHash", "sha256Bytes", "sha256File"]);
const LOCAL_HASH_FUNCTION_NAMES = new Set(["sha256File", "sha256Bytes"]);
// The low-level crypto hashers a generator must NOT reach for directly: the classic streaming
// `createHash` and the Node one-shot `hash(algorithm, data)` (already used elsewhere, so a real
// re-drift path). Both bypass createContentHash().
const CRYPTO_HASH_PRIMITIVES = new Set(["createHash", "hash"]);
// TKT-258 also consolidated the repository path normaliser into repository-files.mjs; the inventory
// generators must import it, not reintroduce a local one (TKT-261 A1, path-normalisation half).
const SHARED_PATH_MODULE = "repository-files.mjs";
const SHARED_PATH_EXPORTS = new Set(["normalizeRepositoryPath"]);
const LOCAL_PATH_FUNCTION_NAMES = new Set(["normalizeRepositoryPath", "normalizePath"]);
const GENERATED_POLICY_NAMES = new Set(["GENERATED_DIRECTORY_SEGMENTS", "generatedDirectorySegment"]);
// The single-source predicate a generated-directory consumer must import (not merely the raw set,
// which would let it rebuild separator-normalisation/case-folding/segment-matching locally).
const REQUIRED_GENERATED_POLICY_IMPORT = "generatedDirectorySegment";

// --- Parsing helpers -----------------------------------------------------------------------------

function scriptKind(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parse(label, text) {
  return ts.createSourceFile(label, text, ts.ScriptTarget.Latest, /* setParentNodes */ true, scriptKind(label));
}

/** Trailing filename of a module specifier, e.g. `"../checks/content-hash.mjs"` -> `content-hash.mjs`. */
function moduleBasename(specifier) {
  if (!specifier) return null;
  const clean = specifier.replaceAll("\\", "/").split("?")[0];
  return clean.slice(clean.lastIndexOf("/") + 1);
}

function moduleSpecifierText(node) {
  return node && ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
}

// --- Assertion 1: inventory content-hash core is imported, not re-implemented --------------------

/**
 * Inspect one file's syntax tree for a local re-implementation of the SHA-256 content-hash core and
 * for the shared primitives it imports. Pure: no filesystem access. Returns findings plus the set of
 * shared `content-hash.mjs` exports the file imports.
 */
export function analyzeHashCore(label, text) {
  const sourceFile = parse(label, text);
  const findings = [];
  const importedSharedHashExports = new Set();
  const importedSharedPathExports = new Set();
  const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const add = (node, detail) => findings.push({ path: label, line: lineOf(node), kind: "reimplemented-hash-core", detail });
  const localReimpl = (node, detail) => findings.push({ path: label, line: lineOf(node), kind: "reimplemented-inventory-core", detail });

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const specifier = moduleSpecifierText(node);
      const bindings = node.importClause?.namedBindings;
      // A named import of a low-level crypto hasher (`createHash` OR the one-shot `hash`) = re-implementation.
      if ((specifier === "node:crypto" || specifier === "crypto") && bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (CRYPTO_HASH_PRIMITIVES.has(imported)) {
            add(element, `imports { ${imported} } from '${specifier}' instead of scripts/checks/content-hash.mjs`);
          }
        }
      }
      // Record which shared content-hash primitives this file imports.
      if (moduleBasename(specifier) === HASH_CORE_MODULE && bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (SHARED_HASH_EXPORTS.has(imported)) importedSharedHashExports.add(imported);
        }
      }
      // Record whether this file imports the shared repository path normaliser.
      if (moduleBasename(specifier) === SHARED_PATH_MODULE && bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (SHARED_PATH_EXPORTS.has(imported)) importedSharedPathExports.add(imported);
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const calleeName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
      const isBare = ts.isIdentifier(callee);
      const argument = node.arguments[0];
      const sha256 = argument && ts.isStringLiteralLike(argument) && argument.text.toLowerCase() === "sha256";
      // `createHash("sha256")` / `crypto.createHash("sha256")` builds a direct-byte SHA-256 hasher; a
      // bare `createHash(...)` can only be the crypto primitive, a member call needs the literal alg.
      if (calleeName === "createHash" && (isBare || sha256)) {
        add(node, `direct createHash(${sha256 ? '"sha256"' : "…"}) call — build a hasher via createContentHash() from scripts/checks/content-hash.mjs`);
      }
      // The Node one-shot `hash("sha256", data)` / `crypto.hash("sha256", data)` is the same direct-byte
      // hash by another API; `hash` is a common name, so only flag it when the algorithm is "sha256".
      if (calleeName === "hash" && sha256) {
        add(node, `direct hash("sha256", …) one-shot call — hash via sha256Bytes()/createContentHash() from scripts/checks/content-hash.mjs`);
      }
    }

    // A local re-declaration of a shared hash OR path primitive name shadows its single-source home.
    const declaredName = ts.isFunctionDeclaration(node) && node.name ? node.name
      : (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
          && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
        ? node.name
        : null;
    if (declaredName) {
      if (LOCAL_HASH_FUNCTION_NAMES.has(declaredName.text)) {
        add(declaredName, `local ${declaredName.text} re-implements a scripts/checks/content-hash.mjs primitive`);
      }
      if (LOCAL_PATH_FUNCTION_NAMES.has(declaredName.text)) {
        localReimpl(declaredName, `local ${declaredName.text} re-implements the scripts/checks/repository-files.mjs path normaliser`);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return {
    findings: findings.sort((left, right) => left.line - right.line),
    importedSharedHashExports,
    importedSharedPathExports,
  };
}

/** Apply the assertion-1 policy for one in-scope file. */
export function evaluateHashCore(label, text, { requireSharedImport = false, requirePathImport = false } = {}) {
  const { findings, importedSharedHashExports, importedSharedPathExports } = analyzeHashCore(label, text);
  const result = [...findings];
  if (requireSharedImport && importedSharedHashExports.size === 0) {
    result.push({
      path: label,
      line: 1,
      kind: "missing-shared-hash-import",
      detail: "hashes content but imports no primitive from scripts/checks/content-hash.mjs (createContentHash / sha256Bytes / sha256File)",
    });
  }
  if (requirePathImport && importedSharedPathExports.size === 0) {
    result.push({
      path: label,
      line: 1,
      kind: "missing-shared-path-import",
      detail: "builds repository paths but imports no normalizeRepositoryPath from scripts/checks/repository-files.mjs",
    });
  }
  return result;
}

// --- Assertion 2: generated-directory policy is defined once -------------------------------------

/**
 * Inspect one file's syntax tree for local DEFINITIONS of the generated-directory policy names and
 * for IMPORTS of them from `repository-files.mjs`. Pure. An import binding is never counted as a
 * definition, so a consumer that imports the predicate is clean.
 */
export function analyzeGeneratedDirectoryPolicy(label, text) {
  const sourceFile = parse(label, text);
  const definedNames = new Set();
  const importedNames = new Set();
  const lineByName = new Map();

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const specifier = moduleSpecifierText(node);
      const bindings = node.importClause?.namedBindings;
      if (moduleBasename(specifier) === GENERATED_POLICY_MODULE && bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (GENERATED_POLICY_NAMES.has(imported)) importedNames.add(imported);
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && GENERATED_POLICY_NAMES.has(node.name.text)) {
      definedNames.add(node.name.text);
      if (!lineByName.has(node.name.text)) {
        lineByName.set(node.name.text, sourceFile.getLineAndCharacterOfPosition(node.name.getStart(sourceFile)).line + 1);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name && GENERATED_POLICY_NAMES.has(node.name.text)) {
      definedNames.add(node.name.text);
      if (!lineByName.has(node.name.text)) {
        lineByName.set(node.name.text, sourceFile.getLineAndCharacterOfPosition(node.name.getStart(sourceFile)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { definedNames, importedNames, lineByName };
}

/** Apply the assertion-2 policy for one file according to its role (`home` or `consumer`). */
export function evaluateGeneratedDirectoryPolicy(label, text, { role }) {
  const { definedNames, importedNames, lineByName } = analyzeGeneratedDirectoryPolicy(label, text);
  const findings = [];
  if (role === "home") {
    for (const name of GENERATED_POLICY_NAMES) {
      if (!definedNames.has(name)) {
        findings.push({ path: label, line: 1, kind: "missing-canonical-policy", detail: `${name} is no longer defined in the single-source home` });
      }
    }
  } else if (role === "consumer") {
    for (const name of definedNames) {
      findings.push({
        path: label,
        line: lineByName.get(name) ?? 1,
        kind: "duplicate-generated-directory-policy",
        detail: `re-declares ${name}; import it from scripts/checks/repository-files.mjs instead`,
      });
    }
    if (!importedNames.has(REQUIRED_GENERATED_POLICY_IMPORT)) {
      findings.push({
        path: label,
        line: 1,
        kind: "missing-generated-directory-import",
        detail: "does not import generatedDirectorySegment (the single-source predicate) from scripts/checks/repository-files.mjs; importing only the raw set and rebuilding the matcher locally is the drift this guard prevents",
      });
    }
  }
  return findings.sort((left, right) => left.line - right.line || left.kind.localeCompare(right.kind));
}

// --- Tree scan -----------------------------------------------------------------------------------

/** Run both assertions over the configured real-file surface. */
export function scanTree({ root = repositoryRoot } = {}) {
  const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");
  const findings = [];

  for (const relativePath of HASH_SCOPE) {
    // The two inventory generators are the files that both hash and normalise repository paths, so
    // they must import BOTH shared primitives rather than reimplement either half of TKT-258's core.
    const required = HASH_REQUIRED_IMPORTERS.has(relativePath);
    findings.push(...evaluateHashCore(relativePath, read(relativePath), { requireSharedImport: required, requirePathImport: required }));
  }

  findings.push(...evaluateGeneratedDirectoryPolicy(GENERATED_POLICY_HOME, read(GENERATED_POLICY_HOME), { role: "home" }));
  for (const relativePath of GENERATED_POLICY_CONSUMERS) {
    findings.push(...evaluateGeneratedDirectoryPolicy(relativePath, read(relativePath), { role: "consumer" }));
  }

  const scannedFiles = new Set([...HASH_SCOPE, GENERATED_POLICY_HOME, ...GENERATED_POLICY_CONSUMERS]).size;
  findings.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.kind.localeCompare(right.kind));
  return { scannedFiles, findings };
}

function reportFinding(finding) {
  return `- ${finding.path}:${finding.line} [${finding.kind}] ${finding.detail}`;
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const rest = argv.filter((value) => value !== "--json");
  if (rest.length) {
    console.error(`Unknown option(s): ${rest.join(", ")}`);
    process.exitCode = 2;
    return;
  }

  const result = scanTree();
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.findings.length === 0) {
    console.log(
      `Scripts single-source drift guard: PASS (${result.scannedFiles} shared-internals consumer(s) checked; `
        + "inventory hash core and generated-directory policy each single-source).",
    );
  } else {
    console.error(`Scripts single-source drift guard: FAIL (${result.findings.length} finding(s)).`);
    console.error(
      "A PLAN-010 shared internal was re-duplicated. Import the hash primitive from"
        + " scripts/checks/content-hash.mjs and the generated-directory predicate from"
        + " scripts/checks/repository-files.mjs instead of re-implementing them:",
    );
    for (const finding of result.findings) console.error(reportFinding(finding));
  }
  process.exitCode = result.findings.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
