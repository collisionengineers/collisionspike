#!/usr/bin/env node
/**
 * Reject artificial data reachable from production entry points.
 *
 * The check follows the actual TypeScript/JavaScript and Python import graphs.
 * Test-only material is allowed when it is unreachable; direct, transitive,
 * aliased, package-exported, and statically constructed dynamic loads are not.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(HERE, "../..");
const PYTHON_HELPER = path.join(HERE, "production_dependency_graph.py");

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const ARTIFICIAL_TOKENS = new Map([
  ["demo", "demo"], ["demos", "demo"],
  ["evaluation", "evaluation"], ["evaluations", "evaluation"],
  ["fixture", "fixture"], ["fixtures", "fixture"],
  ["mock", "mock"], ["mocks", "mock"],
  ["prototype", "prototype"], ["prototypes", "prototype"],
  ["sample", "sample"], ["samples", "sample"],
  ["seed", "seed"], ["seeds", "seed"],
  ["story", "story"], ["stories", "story"],
  ["test", "test-only"], ["tests", "test-only"], ["__tests__", "test-only"],
]);

const DEFAULT_TYPESCRIPT_TARGETS = [
  { name: "web", root: "apps/web", entries: ["apps/web/src/main.tsx"] },
  { name: "data-api", root: "services/data-api", entries: ["services/data-api/src/index.ts"] },
  { name: "orchestration", root: "services/orchestration", entries: ["services/orchestration/src/index.ts"] },
];

function posixPath(value) {
  return value.split(path.sep).join("/");
}

function repositoryPath(root, value) {
  return posixPath(path.relative(root, value));
}

function normalizedTokens(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .flatMap((part) => part.split(/_+/))
    .filter(Boolean);
}

export function artificialMarker(value) {
  for (const token of normalizedTokens(value)) {
    const marker = ARTIFICIAL_TOKENS.get(token);
    if (marker) return marker;
  }
  return null;
}

function scriptKind(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression?.(current)
  ) current = current.expression;
  return current;
}

function staticString(node, constants, sourceFile, seen = new Set()) {
  if (!node) return null;
  const value = unwrapExpression(node);
  if (ts.isStringLiteralLike(value) || ts.isNumericLiteral(value)) return value.text;
  if (value.kind === ts.SyntaxKind.TrueKeyword) return "true";
  if (value.kind === ts.SyntaxKind.FalseKeyword) return "false";
  if (ts.isIdentifier(value)) {
    if (seen.has(value.text) || !constants.has(value.text)) return null;
    return staticString(constants.get(value.text), constants, sourceFile, new Set([...seen, value.text]));
  }
  if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(value.left, constants, sourceFile, seen);
    const right = staticString(value.right, constants, sourceFile, seen);
    return left === null || right === null ? null : `${left}${right}`;
  }
  if (ts.isTemplateExpression(value)) {
    let result = value.head.text;
    for (const span of value.templateSpans) {
      const expression = staticString(span.expression, constants, sourceFile, seen);
      if (expression === null) return null;
      result += expression + span.literal.text;
    }
    return result;
  }
  if (ts.isNewExpression(value) && value.expression.getText(sourceFile) === "URL") {
    return staticString(value.arguments?.[0], constants, sourceFile, seen);
  }
  if (ts.isCallExpression(value)) {
    const name = value.expression.getText(sourceFile);
    if (/\.(?:join|resolve)$/.test(name) || /^(?:join|resolve)$/.test(name)) {
      const parts = value.arguments.map((argument) => staticString(argument, constants, sourceFile, seen));
      if (parts.length && parts.every((part) => part !== null)) return path.posix.join(...parts);
    }
  }
  return null;
}

function stringFragments(node) {
  const fragments = [];
  function visit(current) {
    if (ts.isStringLiteralLike(current)) fragments.push(current.text);
    ts.forEachChild(current, visit);
  }
  visit(node);
  return fragments.join("/");
}

function collectTypeScriptDependencies(filename, text) {
  const sourceFile = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, scriptKind(filename));
  const constants = new Map();
  const ambiguousConstants = new Set();
  function collectConstants(node) {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && ts.isVariableDeclarationList(node.parent)
      && (node.parent.flags & ts.NodeFlags.Const)
    ) {
      const name = node.name.text;
      if (constants.has(name) || ambiguousConstants.has(name)) {
        constants.delete(name);
        ambiguousConstants.add(name);
      } else {
        constants.set(name, node.initializer);
      }
    }
    ts.forEachChild(node, collectConstants);
  }
  collectConstants(sourceFile);

  const dependencies = [];
  const findings = [];
  const addDependency = (node, expression, kind, dynamic = false) => {
    const specifier = staticString(expression, constants, sourceFile);
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    if (specifier === null) {
      if (dynamic) {
        findings.push({
          kind: "unresolved-dynamic-import",
          line,
          dependency: expression?.getText(sourceFile) ?? "<missing>",
          detail: "Dynamic module name is not statically resolvable",
        });
      }
      return;
    }
    dependencies.push({ kind, line, specifier });
  };
  const inspectResource = (node, expression, kind) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const resolved = staticString(expression, constants, sourceFile);
    const candidate = resolved ?? stringFragments(expression);
    const marker = artificialMarker(candidate);
    if (marker) findings.push({
      kind,
      line,
      dependency: candidate,
      marker,
      detail: "Production code loads an artificial-data path",
    });
  };

  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      addDependency(node, node.moduleSpecifier, "import");
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      addDependency(node, node.moduleSpecifier, "export-from");
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      addDependency(node, node.moduleReference.expression, "import-equals");
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addDependency(node, node.argument.literal, "import-type");
    } else if (ts.isCallExpression(node)) {
      const callName = node.expression.getText(sourceFile);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addDependency(node, node.arguments[0], "dynamic-import", true);
      } else if (callName === "require" || callName === "require.resolve") {
        addDependency(node, node.arguments[0], callName, true);
      } else if (/^(?:readFile|readFileSync|createReadStream|openSync)$/.test(callName)) {
        if (node.arguments[0]) inspectResource(node, node.arguments[0], "resource-load");
      } else if (/\.(?:readFile|readFileSync|createReadStream|openSync)$/.test(callName)) {
        if (node.arguments[0]) inspectResource(node, node.arguments[0], "resource-load");
      } else if (/\.(?:glob|globEager)$/.test(callName) || /^(?:glob|globEager)$/.test(callName)) {
        addDependency(node, node.arguments[0], "dynamic-glob", true);
      }
    } else if (ts.isNewExpression(node) && node.expression.getText(sourceFile) === "URL" && node.arguments?.[0]) {
      inspectResource(node, node.arguments[0], "url-resource");
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { dependencies, findings, parseDiagnostics: sourceFile.parseDiagnostics };
}

function pathCandidates(basePath) {
  const extension = path.extname(basePath).toLowerCase();
  const candidates = [basePath];
  if (extension) {
    const stem = basePath.slice(0, -extension.length);
    const replacements = {
      ".js": [".ts", ".tsx", ".mts"],
      ".jsx": [".tsx", ".ts"],
      ".mjs": [".mts", ".ts"],
      ".cjs": [".cts", ".ts"],
    }[extension] ?? [];
    candidates.push(...replacements.map((replacement) => `${stem}${replacement}`));
    if (![...CODE_EXTENSIONS, ".json", ".css", ".scss", ".sass", ".less", ".svg"].includes(extension)) {
      candidates.push(...[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"].map((suffix) => `${basePath}${suffix}`));
    }
  } else {
    candidates.push(...[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"].map((suffix) => `${basePath}${suffix}`));
    candidates.push(...["index.ts", "index.tsx", "index.mts", "index.js", "index.mjs", "index.json"].map((entry) => path.join(basePath, entry)));
  }
  return [...new Set(candidates)];
}

function resolveExistingPath(basePath) {
  for (const candidate of pathCandidates(basePath)) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return path.resolve(candidate);
  }
  return null;
}

function exportTarget(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  for (const key of ["types", "source", "import", "default", "require"]) {
    const candidate = exportTarget(value[key]);
    if (candidate) return candidate;
  }
  for (const candidateValue of Object.values(value)) {
    const candidate = exportTarget(candidateValue);
    if (candidate) return candidate;
  }
  return null;
}

function expandWorkspaceDirectories(root) {
  const packageJson = path.join(root, "package.json");
  if (!fs.existsSync(packageJson)) return [];
  const manifest = JSON.parse(fs.readFileSync(packageJson, "utf8"));
  const patterns = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages ?? [];
  const directories = [];
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const parent = path.join(root, pattern.slice(0, -2));
      if (!fs.existsSync(parent)) continue;
      for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory()) directories.push(path.join(parent, entry.name));
      }
    } else {
      directories.push(path.join(root, pattern));
    }
  }
  return directories;
}

function workspaceAliases(root, explicitDirectories) {
  const aliases = new Map();
  const directories = explicitDirectories?.map((value) => path.resolve(root, value)) ?? expandWorkspaceDirectories(root);
  for (const directory of directories) {
    const manifestPath = path.join(directory, "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!manifest.name) continue;
    const exports = manifest.exports;
    if (exports && typeof exports === "object" && !Array.isArray(exports)) {
      const entries = Object.keys(exports).some((key) => key.startsWith(".")) ? Object.entries(exports) : [[".", exports]];
      for (const [subpath, definition] of entries) {
        const target = exportTarget(definition);
        if (!target || target.includes("*")) continue;
        const specifier = subpath === "." ? manifest.name : `${manifest.name}${subpath.slice(1)}`;
        const absolute = resolveExistingPath(path.resolve(directory, target));
        if (absolute) aliases.set(specifier, absolute);
      }
    }
    if (!aliases.has(manifest.name)) {
      const fallback = resolveExistingPath(path.join(directory, "src", "index"))
        ?? resolveExistingPath(path.resolve(directory, manifest.main ?? "src/index"));
      if (fallback) aliases.set(manifest.name, fallback);
    }
  }
  return aliases;
}

function tsconfigAliases(targetRoot) {
  const configPath = path.join(targetRoot, "tsconfig.json");
  if (!fs.existsSync(configPath)) return [];
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) return [];
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath));
  const baseUrl = parsed.options.baseUrl ?? path.dirname(configPath);
  return Object.entries(parsed.options.paths ?? {}).map(([pattern, targets]) => ({ pattern, targets, baseUrl }));
}

function aliasMatch(specifier, alias) {
  const escaped = alias.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\\*", "(.*)");
  const match = new RegExp(`^${escaped}$`).exec(specifier);
  if (!match) return [];
  return alias.targets.map((target) => path.resolve(alias.baseUrl, target.replace("*", match[1] ?? "")));
}

function resolveTypeScriptDependency({ source, specifier, packageAliases, pathAliases }) {
  if (specifier.startsWith("node:") || specifier.startsWith("http:") || specifier.startsWith("https:")) return { external: true };
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const absolute = resolveExistingPath(path.resolve(path.dirname(source), specifier));
    return absolute ? { absolute } : { unresolvedLocal: true };
  }
  if (packageAliases.has(specifier)) return { absolute: packageAliases.get(specifier) };
  const packagePrefix = [...packageAliases.keys()]
    .filter((candidate) => specifier.startsWith(`${candidate}/`))
    .sort((left, right) => right.length - left.length)[0];
  if (packagePrefix) {
    const packageEntry = packageAliases.get(packagePrefix);
    const packageRoot = packageEntry.includes(`${path.sep}src${path.sep}`)
      ? packageEntry.slice(0, packageEntry.indexOf(`${path.sep}src${path.sep}`))
      : path.dirname(packageEntry);
    const suffix = specifier.slice(packagePrefix.length + 1);
    const absolute = resolveExistingPath(path.join(packageRoot, "src", suffix));
    if (absolute) return { absolute };
  }
  for (const alias of pathAliases) {
    for (const base of aliasMatch(specifier, alias)) {
      const absolute = resolveExistingPath(base);
      if (absolute) return { absolute };
    }
  }
  return { external: true };
}

export function scanTypeScriptTargets({ root, targets, explicitWorkspaceDirectories }) {
  const packageAliases = workspaceAliases(root, explicitWorkspaceDirectories);
  const results = [];
  for (const target of targets) {
    const targetRoot = path.resolve(root, target.root);
    const pathAliases = tsconfigAliases(targetRoot);
    const queue = target.entries.map((entry) => path.resolve(root, entry));
    const visited = new Set();
    const violations = [];
    let edges = 0;
    const addViolation = (source, finding) => violations.push({
      owner: target.name,
      language: "typescript",
      source: repositoryPath(root, source),
      ...finding,
    });

    while (queue.length) {
      const source = queue.shift();
      if (visited.has(source)) continue;
      visited.add(source);
      if (!fs.existsSync(source)) {
        addViolation(source, { kind: "missing-entry", line: 1, dependency: repositoryPath(root, source), detail: "Production entry does not exist" });
        continue;
      }
      const sourceMarker = artificialMarker(repositoryPath(root, source));
      if (sourceMarker) addViolation(source, {
        kind: "artificial-path", line: 1, dependency: repositoryPath(root, source), marker: sourceMarker, detail: "Reachable module has an artificial-data path",
      });
      const text = fs.readFileSync(source, "utf8");
      const parsed = collectTypeScriptDependencies(source, text);
      for (const diagnostic of parsed.parseDiagnostics) addViolation(source, {
        kind: "parse-error",
        line: diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1 || 1,
        dependency: repositoryPath(root, source),
        detail: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      });
      for (const finding of parsed.findings) addViolation(source, finding);
      for (const dependency of parsed.dependencies) {
        edges += 1;
        const marker = artificialMarker(dependency.specifier);
        if (marker) addViolation(source, {
          ...dependency,
          dependency: dependency.specifier,
          marker,
          detail: "Production import names an artificial-data dependency",
        });
        const resolution = resolveTypeScriptDependency({ source, specifier: dependency.specifier, packageAliases, pathAliases });
        if (resolution.absolute) {
          const resolvedMarker = artificialMarker(repositoryPath(root, resolution.absolute));
          if (resolvedMarker && !marker) addViolation(source, {
            ...dependency,
            dependency: dependency.specifier,
            resolvedPath: repositoryPath(root, resolution.absolute),
            marker: resolvedMarker,
            detail: "Production import resolves to an artificial-data path",
          });
          if (CODE_EXTENSIONS.has(path.extname(resolution.absolute).toLowerCase())) queue.push(resolution.absolute);
        } else if (resolution.unresolvedLocal) {
          addViolation(source, {
            ...dependency,
            dependency: dependency.specifier,
            detail: "Local production import could not be resolved",
          });
        }
      }
    }
    results.push({ name: target.name, visited: visited.size, edges, violations });
  }
  return results;
}

function defaultPythonTargets(root) {
  const functionsRoot = path.join(root, "services", "functions");
  if (!fs.existsSync(functionsRoot)) return [];
  return fs.readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(functionsRoot, entry.name, "function_app.py")))
    .map((entry) => ({
      name: entry.name,
      root: `services/functions/${entry.name}`,
      entry: `services/functions/${entry.name}/function_app.py`,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function pythonCommand() {
  const configured = process.env.PYTHON;
  if (configured) return configured;
  return process.platform === "win32" ? "python" : "python3";
}

export function scanPythonTargets({ root, targets }) {
  if (!targets.length) return [];
  const args = [PYTHON_HELPER, "--repository-root", root];
  for (const target of targets) args.push("--target", `${target.name}|${target.root}|${target.entry}`);
  let result = spawnSync(pythonCommand(), args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error?.code === "ENOENT" && pythonCommand() !== "python") {
    result = spawnSync("python", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Python dependency scanner failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout).targets;
}

export function scanProductionDependencies(options = {}) {
  const root = path.resolve(options.root ?? REPOSITORY_ROOT);
  const typescriptTargets = options.typescriptTargets ?? DEFAULT_TYPESCRIPT_TARGETS;
  const pythonTargets = options.pythonTargets ?? defaultPythonTargets(root);
  const typescript = scanTypeScriptTargets({
    root,
    targets: typescriptTargets,
    explicitWorkspaceDirectories: options.explicitWorkspaceDirectories,
  });
  const python = scanPythonTargets({ root, targets: pythonTargets });
  const targets = [...typescript, ...python];
  const violations = targets.flatMap((target) => target.violations);
  return {
    root,
    targets,
    violations: violations.sort((left, right) =>
      left.source.localeCompare(right.source) || left.line - right.line || left.kind.localeCompare(right.kind)),
    modules: targets.reduce((total, target) => total + target.visited, 0),
    edges: targets.reduce((total, target) => total + target.edges, 0),
  };
}

function report(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (!result.violations.length) {
    console.log(`Production dependency boundary: PASS (${result.targets.length} entrypoint graphs, ${result.modules} modules, ${result.edges} dependency edges).`);
    return;
  }
  console.error(`Production dependency boundary: FAIL (${result.violations.length} violation(s)).`);
  for (const finding of result.violations) {
    const resolved = finding.resolvedPath ? ` -> ${finding.resolvedPath}` : "";
    const marker = finding.marker ? ` [${finding.marker}]` : "";
    console.error(`- ${finding.source}:${finding.line} (${finding.owner}) ${finding.kind}: ${finding.dependency}${resolved}${marker}`);
    console.error(`  ${finding.detail}`);
  }
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const unknown = arguments_.filter((argument) => argument !== "--json");
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.join(", ")}`);
  const result = scanProductionDependencies();
  report(result, arguments_.includes("--json"));
  process.exitCode = result.violations.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
