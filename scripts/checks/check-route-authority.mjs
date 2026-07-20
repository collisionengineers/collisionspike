#!/usr/bin/env node
/**
 * Route and authority inventory guard (TKT-266 / PLAN-008).
 *
 * PLAN-008 consolidated the internal service-to-service surface behind ONE audience-only trust seam
 * (`withServiceAuth`, TKT-245), routed every internal MSI module through the one aggregator (TKT-263),
 * and kept the three Archive outbox lanes as DISTINCT authorities (TKT-264). This guard keeps that
 * topology from silently regressing. It is import/AST-aware (TypeScript compiler), never a lexical
 * grep, so it does not false-flag a comment, a string, or a legitimate feature auth wrapper.
 *
 * It enforces three invariants:
 *
 *   1. SINGLE INTERNAL-TRUST HELPER. Exactly one audience-only auth wrapper may exist — the shared
 *      `withServiceAuth` seam. An audience-only wrapper is one that awaits `authenticate(...)` and
 *      then invokes its handler parameter with NO subject/role/scope/principal branch between them.
 *      A SECOND such declaration (or one outside the canonical module) is the exact TKT-245
 *      regression this fails on. Feature wrappers that DO gate a principal — `withRole` (role claim),
 *      `withVehicleLookupAuth` (`allowedPrincipal`), `withApiKey` (X-Api-Key), the MCP
 *      `mcpPrincipalKind` lane — are correctly NOT flagged.
 *
 *   2. NO DUPLICATE AUTHORITY IN A LANE. The committed manifest declares every internal-service
 *      authoritative route and its (capability, transition). Two writers of the SAME
 *      (capability, transition) are a duplicate authority. The three outbox lanes declare DISTINCT
 *      capabilities, so each is its own authority and none collapses into another.
 *
 *   3. SOUND DELEGATION. A capability may have an explicit staff BFF that delegates to ONE downstream
 *      focused Function (staff SPA -> withRole BFF -> Function). Every `delegatesTo` must resolve to a
 *      declared downstream and the delegation graph must be acyclic.
 *
 * The manifest is reconciled against the AST so it cannot rot: an internal-service route the AST
 * discovers but the manifest does not declare is UNOWNED; a manifest authority whose route no longer
 * exists is STALE. `--write` regenerates the AST-derived fields (owner/name/methods) while preserving
 * the hand-authored semantic fields (capability/transition/writeAuthority), so an intentional route
 * change is a one-line manifest edit in the same PR.
 *
 * Scope: production TypeScript under `services/<svc>/src` (excludes tests, `.d.ts`, dist, node_modules).
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

export const MANIFEST_PATH = "scripts/checks/route-authority-inventory.json";
export const CANONICAL_TRUST_HELPER =
  "services/data-api/src/features/inbound/internal/service-support.ts";

// Identifiers that, when referenced in a wrapper body, prove it gates a PRINCIPAL (so it is not the
// audience-only internal-trust seam). `authenticate` alone is not a gate — every wrapper calls it.
const PRINCIPAL_GATE_IDENTIFIERS = new Set([
  "withRole",
  "allowedPrincipal",
  "mcpPrincipalKind",
  "requireRole",
  "assertRole",
]);
// Property reads / literals that also prove a principal/credential gate.
const PRINCIPAL_GATE_PROPERTIES = new Set(["roles", "scp", "appid", "azp", "oid"]);
const API_KEY_HEADERS = new Set(["x-api-key", "X-Api-Key"]);

function scriptKind(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** Production TypeScript under a service `src/` tree — excludes tests, declarations, and build output. */
export function isServicesTypeScript(repositoryPath) {
  const posix = repositoryPath.replaceAll("\\", "/");
  if (!/\.tsx?$/.test(posix)) return false;
  if (/\.d\.ts$/.test(posix)) return false;
  if (/\.(test|spec)\.tsx?$/.test(posix)) return false;
  const segments = posix.split("/");
  if (segments.some((s) => s === "node_modules" || s === "dist" || s === "tests" || s === "__tests__")) {
    return false;
  }
  return /^services\/[^/]+\/src\//.test(posix);
}

function sourceFileOf(repositoryPath, text) {
  return ts.createSourceFile(
    repositoryPath,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind(repositoryPath),
  );
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** Collect the simple identifier names of a function-like's parameters. */
function parameterNames(fnNode) {
  const names = new Set();
  for (const parameter of fnNode.parameters ?? []) {
    if (ts.isIdentifier(parameter.name)) names.add(parameter.name.text);
  }
  return names;
}

/** Does `node`'s subtree call the identifier `authenticate`? */
function callsAuthenticate(node) {
  let hit = false;
  const walk = (current) => {
    if (hit || !current) return;
    if (
      ts.isCallExpression(current)
      && ts.isIdentifier(current.expression)
      && current.expression.text === "authenticate"
    ) {
      hit = true;
      return;
    }
    ts.forEachChild(current, walk);
  };
  walk(node);
  return hit;
}

/** Does `node`'s subtree invoke one of `paramNames` as a function (the wrapped handler)? */
function invokesHandlerParam(node, paramNames) {
  let hit = false;
  const walk = (current) => {
    if (hit || !current) return;
    if (
      ts.isCallExpression(current)
      && ts.isIdentifier(current.expression)
      && paramNames.has(current.expression.text)
    ) {
      hit = true;
      return;
    }
    ts.forEachChild(current, walk);
  };
  walk(node);
  return hit;
}

/** Does `node`'s subtree reference any principal/credential gate (so it is NOT audience-only)? */
function referencesPrincipalGate(node) {
  let hit = false;
  const walk = (current) => {
    if (hit || !current) return;
    if (ts.isIdentifier(current) && PRINCIPAL_GATE_IDENTIFIERS.has(current.text)) { hit = true; return; }
    if (ts.isPropertyAccessExpression(current) && PRINCIPAL_GATE_PROPERTIES.has(current.name.text)) {
      hit = true;
      return;
    }
    if (ts.isStringLiteralLike(current) && API_KEY_HEADERS.has(current.text)) { hit = true; return; }
    ts.forEachChild(current, walk);
  };
  walk(node);
  return hit;
}

/**
 * Find declarations of an audience-only auth wrapper (authenticate-then-invoke-handler, no principal
 * gate). Pure: no filesystem. Returns findings sorted by line — the canonical `withServiceAuth` at
 * {@link CANONICAL_TRUST_HELPER} is one of them; the caller treats any OTHER as a violation.
 */
export function analyzeAuthHelpers(repositoryPath, text) {
  const sourceFile = sourceFileOf(repositoryPath, text);
  const found = [];
  const consider = (name, fnNode, anchor) => {
    if (!fnNode || !fnNode.body) return;
    const params = parameterNames(fnNode);
    if (params.size === 0) return;
    if (!callsAuthenticate(fnNode.body)) return;
    if (!invokesHandlerParam(fnNode.body, params)) return;
    if (referencesPrincipalGate(fnNode.body)) return;
    found.push({
      path: repositoryPath,
      line: lineOf(sourceFile, anchor),
      name: name ?? "(anonymous)",
    });
  };
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) consider(node.name.text, node, node);
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name)
          && declaration.initializer
          && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
        ) {
          consider(declaration.name.text, declaration.initializer, declaration);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found.sort((a, b) => a.line - b.line);
}

/** Trailing identifier of an `app.http` / `app.timer` callee, e.g. `app` `.http`. */
function isAppMethodCall(node, method) {
  return (
    ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === method
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "app"
  );
}

function stringLiteral(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function objectProperty(objectLiteral, key) {
  if (!objectLiteral || !ts.isObjectLiteralExpression(objectLiteral)) return undefined;
  for (const property of objectLiteral.properties) {
    if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === key) {
      return property.initializer;
    }
  }
  return undefined;
}

function stringArray(node) {
  if (!node || !ts.isArrayLiteralExpression(node)) return [];
  return node.elements.map(stringLiteral).filter((v) => v != null);
}

/** Which auth policy gates this route handler? Mined from the handler initializer subtree. */
function handlerAuthMode(handlerNode) {
  if (!handlerNode) return "none";
  let mode = "none";
  const rank = { none: 0, "staff-bearer": 1, "mcp-principal": 2, "provider-api-key": 3, "service-audience": 4, "staff-role": 5 };
  const set = (candidate) => { if (rank[candidate] > rank[mode]) mode = candidate; };
  const walk = (current) => {
    if (!current) return;
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
      const callee = current.expression.text;
      if (callee === "withRole") set("staff-role");
      else if (callee === "withApiKey") set("provider-api-key");
      else if (callee === "withServiceAuth") set("service-audience");
      else if (callee === "withVehicleLookupAuth") set("staff-role");
      else if (callee === "mcpPrincipalKind") set("mcp-principal");
      else if (callee === "authenticate") set("staff-bearer");
    }
    ts.forEachChild(current, walk);
  };
  walk(handlerNode);
  return mode;
}

/** Default capability grouping for an internal route: the first segment after `internal/`. */
function capabilityFromRoute(route) {
  const r = String(route ?? "").replace(/^internal\//, "");
  const segment = r.split("/")[0] ?? "";
  return segment.replace(/[{}]/g, "") || "internal";
}

/** Lane a route belongs to, from its public path prefix. */
function laneOfRoute(route) {
  const r = String(route ?? "");
  if (r.startsWith("internal/")) return "internal-service";
  if (r.startsWith("provider-intake/")) return "provider-api";
  if (r.startsWith("public/capture/") || r.startsWith("capture/")) return "public-capture";
  return "public-staff";
}

/**
 * Enumerate `app.http` route registrations in one file. Pure. Returns
 * `{ owner, name, methods, route, authMode, lane, line }` per registration.
 */
export function analyzeRouteRegistrations(repositoryPath, text) {
  const sourceFile = sourceFileOf(repositoryPath, text);
  const routes = [];
  const visit = (node) => {
    if (isAppMethodCall(node, "http")) {
      const name = stringLiteral(node.arguments[0]);
      const config = node.arguments[1];
      if (name && config && ts.isObjectLiteralExpression(config)) {
        const route = stringLiteral(objectProperty(config, "route")) ?? name;
        const methods = stringArray(objectProperty(config, "methods")).map((m) => m.toUpperCase()).sort();
        const authMode = handlerAuthMode(objectProperty(config, "handler"));
        routes.push({
          owner: repositoryPath,
          name,
          methods,
          route,
          authMode,
          lane: laneOfRoute(route),
          line: lineOf(sourceFile, node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return routes;
}

/**
 * Reconcile the AST route inventory against the committed authority manifest and check the authority
 * and delegation invariants. Pure. Returns findings `{ kind, detail, ...}`.
 */
export function evaluateAuthorities(routeInventory, manifest) {
  const findings = [];
  const authorities = manifest.authorities ?? [];
  const delegations = manifest.delegations ?? [];
  const downstreams = new Set(manifest.downstreams ?? []);

  const internalRoutes = routeInventory.filter((r) => r.lane === "internal-service");
  const declaredByName = new Map(authorities.map((a) => [`${a.owner}::${a.name}`, a]));
  const inventoryByName = new Map(routeInventory.map((r) => [`${r.owner}::${r.name}`, r]));

  // (a) UNOWNED — an internal-service route the manifest does not declare.
  for (const route of internalRoutes) {
    if (!declaredByName.has(`${route.owner}::${route.name}`)) {
      findings.push({
        kind: "unowned-route",
        detail: `internal-service route '${route.name}' (${route.route}) in ${route.owner} is not declared in the authority manifest`,
      });
    }
  }

  // (b) STALE — a manifest authority whose route no longer exists (or changed auth away from internal).
  for (const authority of authorities) {
    const live = inventoryByName.get(`${authority.owner}::${authority.name}`);
    if (!live) {
      findings.push({
        kind: "stale-authority",
        detail: `manifest authority '${authority.name}' (${authority.capability}) has no matching route registration in ${authority.owner}`,
      });
    } else if (live.lane !== "internal-service") {
      findings.push({
        kind: "stale-authority",
        detail: `manifest authority '${authority.name}' is no longer an internal-service route (lane is now '${live.lane}')`,
      });
    }
  }

  // (c) DUPLICATE AUTHORITY — two writers of the same (capability, transition).
  const seen = new Map();
  for (const authority of authorities) {
    if (!authority.writeAuthority) continue;
    const key = `${authority.capability}::${authority.transition ?? "*"}`;
    if (seen.has(key)) {
      findings.push({
        kind: "duplicate-authority",
        detail: `two authoritative writers for (${authority.capability}, ${authority.transition ?? "*"}): '${seen.get(key)}' and '${authority.name}'`,
      });
    } else {
      seen.set(key, authority.name);
    }
  }

  // (d) DELEGATION — every edge resolves to a declared downstream; the graph is acyclic.
  const edges = new Map();
  for (const delegation of delegations) {
    if (!downstreams.has(delegation.delegatesTo)) {
      findings.push({
        kind: "broken-delegation",
        detail: `delegation '${delegation.capability}' -> '${delegation.delegatesTo}' has no declared downstream owner`,
      });
    }
    const list = edges.get(delegation.capability) ?? [];
    list.push(delegation.delegatesTo);
    edges.set(delegation.capability, list);
  }
  // Cycle detection over capability -> delegatesTo (delegatesTo may itself be a capability).
  const colour = new Map();
  const hasCycle = (node) => {
    if (colour.get(node) === "black") return false;
    if (colour.get(node) === "grey") return true;
    colour.set(node, "grey");
    for (const next of edges.get(node) ?? []) {
      if (hasCycle(next)) return true;
    }
    colour.set(node, "black");
    return false;
  };
  for (const capability of edges.keys()) {
    if (hasCycle(capability)) {
      findings.push({ kind: "cyclic-delegation", detail: `delegation cycle reachable from capability '${capability}'` });
      break;
    }
  }

  return findings;
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

function readManifest(root) {
  const absolute = path.resolve(root, MANIFEST_PATH);
  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

/** Build the full inventory (auth helpers + routes) from the service trees. */
export function scanServices({ root = repositoryRoot, files } = {}) {
  const candidates = (files ?? listRepositoryFiles()).map(normalizeRepositoryPath).filter(isServicesTypeScript);
  const authHelpers = [];
  const routeInventory = [];
  for (const repositoryPath of candidates) {
    const absolute = files ? path.resolve(root, repositoryPath) : resolveRepositoryPath(repositoryPath);
    let text;
    try {
      text = fs.readFileSync(absolute, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    authHelpers.push(...analyzeAuthHelpers(repositoryPath, text));
    routeInventory.push(...analyzeRouteRegistrations(repositoryPath, text));
  }
  return { scannedFiles: candidates.length, authHelpers, routeInventory };
}

/** Run every invariant. Returns findings `{ kind, detail }`. */
export function evaluateTree({ root = repositoryRoot, files, manifest } = {}) {
  const { authHelpers, routeInventory, scannedFiles } = scanServices({ root, files });
  const findings = [];

  // Invariant 1 — exactly one audience-only trust helper, at the canonical seam.
  for (const helper of authHelpers) {
    if (helper.path !== CANONICAL_TRUST_HELPER) {
      findings.push({
        kind: "second-internal-trust-helper",
        detail: `audience-only auth wrapper '${helper.name}' at ${helper.path}:${helper.line} — the internal-trust seam must be the single ${CANONICAL_TRUST_HELPER}`,
      });
    }
  }
  const canonical = authHelpers.filter((h) => h.path === CANONICAL_TRUST_HELPER);
  if (canonical.length === 0) {
    findings.push({
      kind: "missing-trust-helper",
      detail: `the canonical audience-only trust seam was not found at ${CANONICAL_TRUST_HELPER}`,
    });
  }

  // Invariants 2 & 3 — authority + delegation graph reconciled against the manifest.
  const resolved = manifest ?? readManifest(root);
  findings.push(...evaluateAuthorities(routeInventory, resolved));

  return { scannedFiles, findings, authHelpers, routeInventory };
}

/** `--write`: regenerate the manifest's AST-derived fields, preserving hand-authored semantics. */
function writeManifest(root) {
  const { routeInventory } = scanServices({ root });
  const internalRoutes = routeInventory
    .filter((r) => r.lane === "internal-service")
    .sort((a, b) => comparePaths(a.owner, b.owner) || a.name.localeCompare(b.name));
  const existing = (() => {
    try {
      return readManifest(root);
    } catch {
      return { schemaVersion: 1, authorities: [], delegations: [], downstreams: [] };
    }
  })();
  const priorByName = new Map((existing.authorities ?? []).map((a) => [`${a.owner}::${a.name}`, a]));
  const authorities = internalRoutes.map((route) => {
    const prior = priorByName.get(`${route.owner}::${route.name}`) ?? {};
    return {
      name: route.name,
      owner: route.owner,
      route: route.route,
      methods: route.methods,
      capability: prior.capability ?? capabilityFromRoute(route.route),
      transition: prior.transition ?? null,
      writeAuthority: prior.writeAuthority ?? false,
    };
  });
  const manifest = {
    schemaVersion: 1,
    authorities,
    delegations: existing.delegations ?? [],
    downstreams: existing.downstreams ?? [],
  };
  fs.writeFileSync(path.resolve(root, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const write = argv.includes("--write");
  const rest = argv.filter((v) => v !== "--json" && v !== "--write");
  if (rest.length) {
    console.error(`Unknown option(s): ${rest.join(", ")}`);
    process.exitCode = 2;
    return;
  }
  if (write) {
    const manifest = writeManifest(repositoryRoot);
    console.log(`Wrote ${MANIFEST_PATH}: ${manifest.authorities.length} internal authority route(s).`);
    return;
  }

  const { scannedFiles, findings } = evaluateTree();
  if (json) {
    process.stdout.write(`${JSON.stringify({ scannedFiles, findings }, null, 2)}\n`);
  } else if (findings.length === 0) {
    console.log(
      `Route and authority inventory: PASS (${scannedFiles} service TypeScript file(s) scanned; `
        + "one internal-trust seam, no duplicate authority, sound delegation).",
    );
  } else {
    console.error(`Route and authority inventory: FAIL (${findings.length} finding(s)).`);
    for (const finding of findings) console.error(`- [${finding.kind}] ${finding.detail}`);
  }
  process.exitCode = findings.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
