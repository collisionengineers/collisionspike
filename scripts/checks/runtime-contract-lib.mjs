import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import ts from "typescript";

const EXCLUDED_DIRECTORIES = new Set([
  ".artifacts",
  ".git",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "__pycache__",
]);

const AUTH_GUARD_POLICIES = new Map([
  ["authenticate", "staff-bearer"],
  ["withApiKey", "provider-api-key"],
  ["withServiceAuth", "service-bearer"],
  ["withVehicleLookupAuth", "vehicle-lookup"],
]);

function compareText(left, right) {
  return left.localeCompare(right, "en");
}

function slash(value) {
  return value.replaceAll("\\", "/");
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function repositoryPath(root, absolutePath) {
  return slash(path.relative(root, absolutePath));
}

function walkFiles(root, relativeRoot) {
  const start = path.join(root, relativeRoot);
  if (!existsSync(start)) return [];
  const pending = [start];
  const files = [];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) pending.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  return files.sort((left, right) =>
    compareText(repositoryPath(root, left), repositoryPath(root, right)));
}

function documentsFor(root, roots, predicate) {
  return roots
    .flatMap((relativeRoot) => walkFiles(root, relativeRoot))
    .filter((absolutePath) => predicate(repositoryPath(root, absolutePath)))
    .map((absolutePath) => ({
      path: repositoryPath(root, absolutePath),
      source: readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""),
    }))
    .sort((left, right) => compareText(left.path, right.path));
}

function propertyName(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return null;
}

function objectProperty(object, name) {
  return object.properties.find((property) =>
    ts.isPropertyAssignment(property) && propertyName(property.name) === name);
}

function stringLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function stringArray(node) {
  if (!ts.isArrayLiteralExpression(node)) return null;
  const values = node.elements.map(stringLiteral);
  return values.every((value) => value !== null) ? values : null;
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function policiesInNode(node) {
  const policies = new Set();
  const visit = (current) => {
    if (ts.isCallExpression(current)) {
      const name = callName(current.expression);
      if (name === "withRole") {
        const role = current.arguments[0] ? stringLiteral(current.arguments[0]) : null;
        policies.add(role ? "role:" + role : "role:dynamic");
      } else if (name && AUTH_GUARD_POLICIES.has(name)) {
        policies.add(AUTH_GUARD_POLICIES.get(name));
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return [...policies].sort(compareText);
}

function routeSortKey(route) {
  return [
    route.publicPath,
    route.methods.join(","),
    route.runtime,
    route.functionName,
    route.source,
  ].join("\0");
}

export function extractTypeScriptRoutes(documents) {
  const routes = [];
  for (const document of documents) {
    const sourceFile = ts.createSourceFile(
      document.path,
      document.source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const visit = (node) => {
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === "app"
        && node.expression.name.text === "http"
      ) {
        const functionName = node.arguments[0] ? stringLiteral(node.arguments[0]) : null;
        const config = node.arguments[1];
        if (!functionName || !config || !ts.isObjectLiteralExpression(config)) {
          throw new Error(document.path + ": app.http registration must use a literal name and object config");
        }
        const methodsProperty = objectProperty(config, "methods");
        const authProperty = objectProperty(config, "authLevel");
        const routeProperty = objectProperty(config, "route");
        const handlerProperty = objectProperty(config, "handler");
        const methods = methodsProperty ? stringArray(methodsProperty.initializer) : null;
        const authLevel = authProperty ? stringLiteral(authProperty.initializer) : null;
        const route = routeProperty ? stringLiteral(routeProperty.initializer) : functionName;
        if (!methods?.length || !authLevel || !route) {
          throw new Error(document.path + ": " + functionName + " must declare literal methods, route, and authLevel");
        }
        const normalizedRoute = route.replace(/^\/+|\/+$/g, "");
        routes.push({
          runtime: "typescript",
          functionName,
          methods: [...new Set(methods.map((method) => method.toUpperCase()))].sort(compareText),
          publicPath: "/api/" + normalizedRoute,
          authLevel: authLevel.toLowerCase(),
          policyIdentifiers: handlerProperty ? policiesInNode(handlerProperty.initializer) : [],
          source: document.path,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return routes.sort((left, right) => compareText(routeSortKey(left), routeSortKey(right)));
}

function pythonArgument(args, name) {
  const matcher = new RegExp("\\b" + name + "\\s*=\\s*([\"'])(.*?)\\1");
  return args.match(matcher)?.[2] ?? null;
}

function pythonMethods(args) {
  const body = args.match(/\bmethods\s*=\s*\[([^\]]+)\]/)?.[1] ?? "";
  return [...body.matchAll(/["']([^"']+)["']/g)]
    .map((match) => match[1].toUpperCase())
    .sort(compareText);
}

function pythonAuthLevel(args, fallback) {
  const value = args.match(/\bauth_level\s*=\s*func\.AuthLevel\.([A-Z_]+)/)?.[1]
    ?? fallback;
  return value ? value.toLowerCase().replaceAll("_", "-") : "unspecified";
}

export function extractPythonRoutes(documents) {
  const routes = [];
  for (const document of documents) {
    const defaultAuth = document.source
      .match(/FunctionApp\s*\([^)]*\bhttp_auth_level\s*=\s*func\.AuthLevel\.([A-Z_]+)/)?.[1]
      ?? null;
    const matcher = /@app\.route\s*\(([^)]*)\)/g;
    for (const match of document.source.matchAll(matcher)) {
      const args = match[1];
      const tail = document.source.slice((match.index ?? 0) + match[0].length);
      const functionName = tail.match(/\b(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/)?.[1] ?? null;
      const route = pythonArgument(args, "route") ?? functionName;
      const methods = pythonMethods(args);
      if (!functionName || !route || methods.length === 0) {
        throw new Error(document.path + ": Python route must declare a route, methods, and function");
      }
      routes.push({
        runtime: "python",
        functionName,
        methods: [...new Set(methods)],
        publicPath: "/api/" + route.replace(/^\/+|\/+$/g, ""),
        authLevel: pythonAuthLevel(args, defaultAuth),
        policyIdentifiers: [],
        source: document.path,
      });
    }
  }
  return routes.sort((left, right) => compareText(routeSortKey(left), routeSortKey(right)));
}

function hasExportModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

export function extractDtoDeclarations(documents) {
  const declarations = [];
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  for (const document of documents) {
    const sourceFile = ts.createSourceFile(
      document.path,
      document.source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    for (const statement of sourceFile.statements) {
      if (!hasExportModifier(statement)) continue;
      if (
        !ts.isInterfaceDeclaration(statement)
        && !ts.isTypeAliasDeclaration(statement)
        && !ts.isEnumDeclaration(statement)
        && !ts.isClassDeclaration(statement)
      ) continue;
      if (!statement.name || !ts.isIdentifier(statement.name)) continue;
      const signature = printer
        .printNode(ts.EmitHint.Unspecified, statement, sourceFile)
        .replace(/\r\n/g, "\n")
        .trim();
      declarations.push({
        name: statement.name.text,
        kind: ts.SyntaxKind[statement.kind],
        source: document.path,
        signature,
        sha256: sha256(signature),
      });
    }
  }
  return declarations.sort((left, right) =>
    compareText(left.name + "\0" + left.source, right.name + "\0" + right.source));
}

export function extractJsonSchemas(documents) {
  return documents.map((document) => {
    const parsed = JSON.parse(document.source);
    const canonical = canonicalJson(parsed);
    return {
      path: document.path,
      id: typeof parsed.$id === "string" ? parsed.$id : null,
      title: typeof parsed.title === "string" ? parsed.title : null,
      sha256: sha256(canonical),
    };
  }).sort((left, right) => compareText(left.path, right.path));
}

export function extractAuthPolicyIdentifiers(documents, routes, liveFacts) {
  const roleClaims = new Set();
  for (const document of documents) {
    const sourceFile = ts.createSourceFile(
      document.path,
      document.source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const visit = (node) => {
      if (
        ts.isStringLiteral(node)
        && /^CollisionSpike\.[A-Za-z][A-Za-z0-9._-]*$/.test(node.text)
      ) {
        roleClaims.add(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  const routePolicies = new Set(routes.flatMap((route) => route.policyIdentifiers));
  return {
    acceptedRoleClaims: [...roleClaims].sort(compareText),
    liveApplicationRoles: [...new Set(liveFacts.access?.roles ?? [])].sort(compareText),
    routePolicyIdentifiers: [...routePolicies].sort(compareText),
  };
}

export function resourceNamesFromLiveFacts(liveFacts) {
  const resources = [];
  const visit = (value, keys = []) => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, [...keys, String(index)]));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const nextKeys = [...keys, key];
      if (
        typeof child === "string"
        && (key === "resource" || key === "resourceGroup")
      ) {
        resources.push({
          registryPath: nextKeys.join("."),
          kind: key,
          name: child,
        });
      }
      visit(child, nextKeys);
    }
  };
  visit(liveFacts);
  const databaseName = liveFacts.deployables?.database?.database;
  if (typeof databaseName === "string") {
    resources.push({
      registryPath: "deployables.database.database",
      kind: "database",
      name: databaseName,
    });
  }
  return resources.sort((left, right) =>
    compareText(left.registryPath + "\0" + left.name, right.registryPath + "\0" + right.name));
}

function normalizeSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSqlItems(body) {
  const items = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (quote) {
      if (character === quote && body[index + 1] === quote) {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      items.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(body.slice(start).trim());
  return items.filter(Boolean);
}

export function extractPostgresBaseline(documents) {
  const files = documents.map((document) => ({
    path: document.path,
    sha256: sha256(normalizeSql(document.source)),
  }));
  const tables = [];
  for (const document of documents) {
    const source = document.source
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/--[^\n]*/g, " ");
    const matcher = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w.]+"?)\s*\(([\s\S]*?)\);/gi;
    for (const match of source.matchAll(matcher)) {
      const columns = splitSqlItems(match[2])
        .filter((item) => !/^(?:CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE)\b/i.test(item))
        .map((item) => item.match(/^"?([A-Za-z_][\w$]*)"?\s+/)?.[1] ?? null)
        .filter(Boolean);
      tables.push({
        name: match[1].replaceAll('"', ""),
        columns,
        source: document.path,
      });
    }
  }
  tables.sort((left, right) => compareText(left.name + "\0" + left.source, right.name + "\0" + right.source));
  return {
    files,
    tables,
    sha256: sha256(canonicalJson({ files, tables })),
  };
}

export function numericCodeContract(documents) {
  const mappings = {};
  for (const document of [...documents].sort((left, right) => compareText(left.path, right.path))) {
    const parsed = JSON.parse(document.source);
    const entries = parsed.kind === "code-table"
      ? [parsed]
      : parsed.kind === "code-table-bundle"
        ? parsed.codeTables
        : [];
    for (const entry of entries) {
      mappings[entry.codeTableId] = entry.options.map(({ value, name }) => ({ value, name }));
    }
  }
  const mappingJson = JSON.stringify(mappings, null, 2) + "\n";
  const tables = Object.entries(mappings).map(([id, options]) => ({ id, options }));
  return {
    tableCount: tables.length,
    optionCount: tables.reduce((total, table) => total + table.options.length, 0),
    sha256: sha256(mappingJson),
    tables,
  };
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

export function buildRuntimeContractSnapshot(root) {
  const typeScriptDocuments = documentsFor(
    root,
    ["services/data-api/src", "services/orchestration/src"],
    (repositoryPathValue) =>
      repositoryPathValue.endsWith(".ts")
      && !/\.(?:test|spec)\.ts$/.test(repositoryPathValue),
  );
  const pythonDocuments = documentsFor(
    root,
    ["services/functions"],
    (repositoryPathValue) =>
      repositoryPathValue.endsWith(".py")
      && !repositoryPathValue.split("/").includes("tests"),
  );
  const dtoDocuments = documentsFor(
    root,
    ["packages/domain/src/dto"],
    (repositoryPathValue) =>
      repositoryPathValue.endsWith(".ts")
      && !/\.(?:test|spec)\.ts$/.test(repositoryPathValue),
  );
  const schemaDocuments = documentsFor(
    root,
    ["contracts", "packages/domain", "services/functions", "tests/fixtures/manifests"],
    (repositoryPathValue) => repositoryPathValue.endsWith(".schema.json"),
  );
  const authDocuments = documentsFor(
    root,
    ["services/data-api/src", "packages/domain/src/capabilities"],
    (repositoryPathValue) =>
      repositoryPathValue.endsWith(".ts")
      && !/\.(?:test|spec)\.ts$/.test(repositoryPathValue),
  );
  const sqlDocuments = documentsFor(
    root,
    ["database/baseline"],
    (repositoryPathValue) => repositoryPathValue.endsWith(".sql"),
  );
  const codeTableDocuments = documentsFor(
    root,
    ["packages/domain/src/data/code-tables"],
    (repositoryPathValue) => repositoryPathValue.endsWith(".json"),
  );
  const liveFacts = readJson(root, "LIVE_FACTS.json");
  const routes = [
    ...extractTypeScriptRoutes(typeScriptDocuments),
    ...extractPythonRoutes(pythonDocuments),
  ].sort((left, right) => compareText(routeSortKey(left), routeSortKey(right)));
  const declarations = extractDtoDeclarations(dtoDocuments);
  const schemas = extractJsonSchemas(schemaDocuments);
  return {
    schemaVersion: 1,
    httpRoutes: {
      count: routes.length,
      typeScriptCount: routes.filter((route) => route.runtime === "typescript").length,
      pythonCount: routes.filter((route) => route.runtime === "python").length,
      routes,
    },
    domainDtos: {
      count: declarations.length,
      declarations,
    },
    jsonSchemas: {
      count: schemas.length,
      schemas,
    },
    authPolicies: extractAuthPolicyIdentifiers(authDocuments, routes, liveFacts),
    liveResources: resourceNamesFromLiveFacts(liveFacts),
    postgresBaseline: extractPostgresBaseline(sqlDocuments),
    numericCodes: numericCodeContract(codeTableDocuments),
  };
}

function display(value) {
  if (value === undefined) return "<missing>";
  const serialized = JSON.stringify(value);
  return serialized.length > 180 ? serialized.slice(0, 177) + "..." : serialized;
}

export function compareRuntimeContractSnapshots(expected, actual, limit = 80) {
  const differences = [];
  const visit = (left, right, currentPath) => {
    if (differences.length >= limit) return;
    if (Object.is(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) {
        differences.push(currentPath + ".length: expected " + left.length + ", got " + right.length);
      }
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        visit(left[index], right[index], currentPath + "[" + index + "]");
      }
      return;
    }
    if (
      left && right
      && typeof left === "object"
      && typeof right === "object"
      && !Array.isArray(left)
      && !Array.isArray(right)
    ) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(compareText);
      for (const key of keys) visit(left[key], right[key], currentPath ? currentPath + "." + key : key);
      return;
    }
    differences.push(currentPath + ": expected " + display(left) + ", got " + display(right));
  };
  visit(expected, actual, "");
  return differences;
}

export function validateApprovedDeltas(snapshot, record) {
  const issues = [];
  if (record.schemaVersion !== 1 || !Array.isArray(record.approvals)) {
    return ["approved delta record must use schemaVersion 1 and an approvals array"];
  }
  const ids = new Set();
  for (const approval of record.approvals) {
    if (!approval.id || ids.has(approval.id)) {
      issues.push("approved delta id is missing or duplicated: " + String(approval.id));
      continue;
    }
    ids.add(approval.id);
    if (!approval.authority || !approval.reason || !approval.evidence) {
      issues.push(approval.id + ": authority, reason, and evidence are required");
    }
    if (approval.category === "http-route" && approval.operation === "remove") {
      const before = approval.before;
      const stillPresent = snapshot.httpRoutes.routes.some((route) =>
        route.runtime === before.runtime
        && route.functionName === before.functionName
        && route.publicPath === before.publicPath
        && JSON.stringify(route.methods) === JSON.stringify(before.methods));
      if (stillPresent) issues.push(approval.id + ": removed route is present in the current snapshot");
    } else if (approval.category === "domain-dto-member" && approval.operation === "remove") {
      const declaration = snapshot.domainDtos.declarations.find((entry) =>
        entry.name === approval.declaration && entry.source === approval.source);
      if (!declaration) {
        issues.push(approval.id + ": current DTO declaration was not found");
      } else {
        if (declaration.signature.includes(approval.before.member)) {
          issues.push(approval.id + ": removed DTO member is still present");
        }
        if (
          approval.after?.member
          && !declaration.signature.includes(approval.after.member)
        ) {
          issues.push(approval.id + ": replacement DTO member is absent");
        }
      }
    } else {
      issues.push(approval.id + ": unsupported approved delta category or operation");
    }
  }
  return issues;
}
