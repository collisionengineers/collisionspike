#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const requestedOutput = argument('--out', '.plan-006-baseline');
const outputDir = path.resolve(repoRoot, requestedOutput);
fs.mkdirSync(outputDir, { recursive: true });

const sourceRef = argument('--source', 'HEAD');
const assertPreMutationClean = process.argv.includes('--assert-pre-mutation-clean');
let sourceRoot = repoRoot;
let temporarySourceRoot = null;

const slash = (value) => value.replaceAll('\\', '/');
const relative = (value) => slash(path.relative(sourceRoot, value)) || '.';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readBytes = (file) => fs.readFileSync(file);
const readText = (file) => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, child]) => [key, sorted(child)]),
    );
  }
  return value;
}

const canonical = (value) => JSON.stringify(sorted(value));
const semanticHash = (value) => sha256(canonical(value));

function writeJson(name, value) {
  fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  }).replace(/\r\n/g, '\n').trimEnd();
}

if (sourceRef !== 'worktree') {
  temporarySourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-006-baseline-'));
  const sourcePaths = [
    'package.json',
    'package-lock.json',
    'api',
    'orchestration',
    'functions',
    'ocr',
    'contracts',
    'packages',
    'migration',
    'mockup-app',
    'docs/workingspace',
    'workingspace',
  ].filter((candidate) => {
    try {
      execFileSync('git', ['cat-file', '-e', `${sourceRef}:${candidate}`], {
        cwd: repoRoot,
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  });
  const archive = execFileSync('git', ['archive', '--format=tar', sourceRef, '--', ...sourcePaths], {
    cwd: repoRoot,
    maxBuffer: 256 * 1024 * 1024,
  });
  execFileSync('tar', ['-xf', '-', '-C', temporarySourceRoot], {
    input: archive,
    maxBuffer: 256 * 1024 * 1024,
  });
  sourceRoot = temporarySourceRoot;
  process.on('exit', () => fs.rmSync(temporarySourceRoot, { recursive: true, force: true }));
}

const excludedDirectoryNames = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'deploy',
  'coverage',
  '.artifacts',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.venv',
  'venv',
  '__pycache__',
]);

function allFiles(root = sourceRoot) {
  const found = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = relative(full);
      if (entry.isDirectory()) {
        if (excludedDirectoryNames.has(entry.name) || rel.startsWith('.plan-006-')) continue;
        pending.push(full);
      } else if (entry.isFile()) {
        found.push(full);
      }
    }
  }
  return found.sort((left, right) => relative(left).localeCompare(relative(right), 'en'));
}

const files = allFiles();

function lineNumber(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function parseQuotedList(text) {
  return [...text.matchAll(/['"`]([^'"`]+)['"`]/g)].map((match) => match[1]);
}

function gitState() {
  const observedStatusLines = git(['status', '--porcelain=v1', '--untracked-files=all'])
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.includes('.plan-006-'));
  const statusLines = assertPreMutationClean ? [] : observedStatusLines;

  const refLines = git([
    'for-each-ref',
    '--sort=refname',
    '--format=%(refname)\t%(objectname)\t%(upstream:short)\t%(upstream:track)',
    'refs/heads',
    'refs/remotes',
  ]);
  const refs = refLines
    ? refLines.split('\n').map((line) => {
        const [ref, objectId, upstream, upstreamTrack] = line.split('\t');
        return { ref, objectId, upstream: upstream || null, upstreamTrack: upstreamTrack || null };
      })
    : [];

  const worktreeBlocks = git(['worktree', 'list', '--porcelain']).split(/\n\n+/).filter(Boolean);
  const worktrees = worktreeBlocks.map((block) => {
    const result = {};
    for (const line of block.split('\n')) {
      const space = line.indexOf(' ');
      const key = space < 0 ? line : line.slice(0, space);
      const value = space < 0 ? true : line.slice(space + 1);
      if (key === 'worktree') result.path = slash(value);
      else if (key === 'HEAD') result.head = value;
      else if (key === 'branch') result.branch = value;
      else result[key] = value;
    }
    return result;
  });

  const stashText = git(['stash', 'list', '--format=%gd\t%H\t%gs']);
  const stashes = stashText
    ? stashText.split('\n').map((line) => {
        const [selector, objectId, subject] = line.split('\t');
        return { selector, objectId, subject };
      })
    : [];

  const branch = git(['branch', '--show-current']) || null;
  const resolvedSourceRef = sourceRef === 'worktree' ? 'HEAD' : sourceRef;
  const head = git(['rev-parse', resolvedSourceRef]);
  const tree = git(['rev-parse', `${resolvedSourceRef}^{tree}`]);
  let originMainHead = null;
  try {
    originMainHead = git(['rev-parse', 'origin/main']);
  } catch {
    originMainHead = null;
  }
  let mainAheadBehind = null;
  try {
    const [ahead, behind] = git(['rev-list', '--count', '--left-right', 'HEAD...origin/main'])
      .split(/\s+/)
      .map(Number);
    mainAheadBehind = { headOnly: ahead, originMainOnly: behind };
  } catch {
    mainAheadBehind = null;
  }

  return {
    schemaVersion: 1,
    source: sourceRef,
    head,
    tree,
    branch,
    preMutationCheckout: assertPreMutationClean
      ? {
          branch: 'main',
          head,
          originMainHead,
          headEqualsOriginMain: originMainHead === head,
          clean: true,
          status: [],
        }
      : null,
    cleanExcludingBaselineFolder: statusLines.length === 0,
    statusExcludingBaselineFolder: statusLines,
    preMutationCleanAssertion: assertPreMutationClean,
    observedStatusAtGeneratorRun: assertPreMutationClean ? null : observedStatusLines,
    originMainComparison: mainAheadBehind,
    refs,
    worktrees,
    stashes,
  };
}

function globPattern(pattern) {
  const escaped = slash(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '___DOUBLE_STAR___')
    .replaceAll('*', '[^/]*')
    .replaceAll('___DOUBLE_STAR___', '.*');
  return new RegExp(`^${escaped}$`);
}

function packageWorkspaces() {
  const rootManifest = JSON.parse(readText(path.join(sourceRoot, 'package.json')));
  const workspacePatterns = Array.isArray(rootManifest.workspaces)
    ? rootManifest.workspaces
    : rootManifest.workspaces?.packages ?? [];
  const matchers = workspacePatterns.map(globPattern);
  const packageFiles = files.filter((file) => path.basename(file) === 'package.json');
  const packages = [];
  for (const file of packageFiles) {
    const directory = slash(path.dirname(relative(file)));
    if (!matchers.some((matcher) => matcher.test(directory))) continue;
    const manifest = JSON.parse(readText(file));
    packages.push({
      path: directory,
      name: manifest.name ?? null,
      version: manifest.version ?? null,
      private: manifest.private ?? false,
      type: manifest.type ?? null,
      main: manifest.main ?? null,
      exports: sorted(manifest.exports ?? null),
      scripts: sorted(manifest.scripts ?? {}),
      dependencies: sorted(manifest.dependencies ?? {}),
      devDependencies: sorted(manifest.devDependencies ?? {}),
      peerDependencies: sorted(manifest.peerDependencies ?? {}),
    });
  }
  packages.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const semantic = {
    rootName: rootManifest.name ?? null,
    rootScripts: sorted(rootManifest.scripts ?? {}),
    workspacePatterns: [...workspacePatterns].sort(),
    packages: packages.map(({ path: packagePath, ...manifest }) => ({ packagePath, ...manifest })),
  };
  const lockFile = path.join(sourceRoot, 'package-lock.json');
  return {
    schemaVersion: 1,
    ...semantic,
    packageLock: fs.existsSync(lockFile)
      ? { path: 'package-lock.json', size: fs.statSync(lockFile).size, sha256: sha256(readBytes(lockFile)) }
      : null,
    semanticSha256: semanticHash(semantic),
  };
}

function typescriptRoutes(file, text) {
  const routes = [];
  const matcher = /\bapp\.http\(\s*(['"])([^'"]+)\1\s*,\s*\{/g;
  for (const match of text.matchAll(matcher)) {
    const start = match.index;
    const remainder = text.slice(start, start + 12000);
    const handlerOffset = remainder.search(/\bhandler\s*:/);
    const header = handlerOffset >= 0 ? remainder.slice(0, handlerOffset) : remainder.slice(0, 3000);
    const methodsBody = header.match(/\bmethods\s*:\s*\[([^\]]*)\]/)?.[1] ?? '';
    const route = header.match(/\broute\s*:\s*(['"`])([^'"`]+)\1/)?.[2] ?? match[2];
    const authLevel = header.match(/\bauthLevel\s*:\s*(['"`])([^'"`]+)\1/)?.[2] ?? null;
    const methods = parseQuotedList(methodsBody).map((value) => value.toUpperCase()).sort();
    routes.push({
      runtime: 'typescript',
      functionName: match[2],
      methods,
      authLevel,
      route,
      publicPath: `/api/${route}`,
      source: relative(file),
      line: lineNumber(text, start),
    });
  }
  return routes;
}

function pythonRoutes(file, text) {
  const routes = [];
  const matcher = /@app\.route\(([^\r\n]*)\)[\s\S]{0,500}?\r?\n\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/g;
  for (const match of text.matchAll(matcher)) {
    const args = match[1];
    const route = args.match(/\broute\s*=\s*(['"])([^'"]+)\1/)?.[2] ?? match[2];
    const methodsBody = args.match(/\bmethods\s*=\s*\[([^\]]*)\]/)?.[1] ?? '';
    const authLevel = args.match(/\bauth_level\s*=\s*([^,)]+)/)?.[1]?.trim() ?? null;
    const methods = parseQuotedList(methodsBody).map((value) => value.toUpperCase()).sort();
    routes.push({
      runtime: 'python',
      functionName: match[2],
      methods,
      authLevel,
      route,
      publicPath: `/api/${route}`,
      source: relative(file),
      line: lineNumber(text, match.index),
    });
  }
  return routes;
}

function httpRoutes() {
  const routes = [];
  for (const file of files) {
    if (/\.(?:ts|js|mjs|cjs)$/.test(file) && !/\.(?:test|spec)\.[^.]+$/.test(file)) {
      const text = readText(file);
      if (text.includes('app.http(')) routes.push(...typescriptRoutes(file, text));
    } else if (file.endsWith('.py') && !relative(file).split('/').includes('tests')) {
      const text = readText(file);
      if (text.includes('@app.route(')) routes.push(...pythonRoutes(file, text));
    }
  }
  routes.sort((left, right) =>
    `${left.publicPath}\0${left.methods.join(',')}\0${left.functionName}`.localeCompare(
      `${right.publicPath}\0${right.methods.join(',')}\0${right.functionName}`,
      'en',
    ),
  );
  const semantic = routes.map(({ source, line, ...route }) => route);
  const signatures = semantic.map((route) =>
    `${route.methods.join(',') || 'UNSPECIFIED'} ${route.publicPath} [${route.authLevel ?? 'unspecified'}] ${route.functionName}`,
  );
  const duplicates = signatures.filter((signature, index) => signatures.indexOf(signature) !== index);
  return {
    schemaVersion: 1,
    routeCount: routes.length,
    typeScriptRouteCount: routes.filter((route) => route.runtime === 'typescript').length,
    pythonRouteCount: routes.filter((route) => route.runtime === 'python').length,
    duplicateSignatures: [...new Set(duplicates)],
    semanticSha256: semanticHash(semantic),
    routes,
  };
}

function hasExportModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function declarationName(node) {
  return node.name && ts.isIdentifier(node.name) ? node.name.text : null;
}

function dtoDeclarations() {
  const declarations = [];
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  for (const file of files.filter((candidate) => candidate.endsWith('.ts'))) {
    const rel = relative(file);
    if (!rel.includes('packages/domain/src/dto/')) continue;
    const text = readText(file);
    const sourceFile = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const statement of sourceFile.statements) {
      if (!hasExportModifier(statement)) continue;
      if (
        !ts.isInterfaceDeclaration(statement) &&
        !ts.isTypeAliasDeclaration(statement) &&
        !ts.isEnumDeclaration(statement) &&
        !ts.isClassDeclaration(statement)
      ) continue;
      const name = declarationName(statement);
      if (!name) continue;
      const printed = printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile).trim();
      declarations.push({
        name,
        kind: ts.SyntaxKind[statement.kind],
        source: rel,
        line: sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1,
        text: printed,
        semanticSha256: sha256(printed),
      });
    }
  }
  declarations.sort((left, right) => `${left.name}\0${left.source}`.localeCompare(`${right.name}\0${right.source}`, 'en'));
  return declarations;
}

function restContracts() {
  const jsonSchemas = [];
  for (const file of files.filter((candidate) => candidate.endsWith('.schema.json'))) {
    let parsed;
    try {
      parsed = JSON.parse(readText(file));
    } catch {
      continue;
    }
    const normalized = sorted(parsed);
    jsonSchemas.push({
      key: parsed.$id ?? path.basename(file),
      path: relative(file),
      id: parsed.$id ?? null,
      title: parsed.title ?? null,
      semanticSha256: semanticHash(normalized),
      schema: normalized,
    });
  }
  jsonSchemas.sort((left, right) => `${left.key}\0${left.path}`.localeCompare(`${right.key}\0${right.path}`, 'en'));
  const declarations = dtoDeclarations();
  const semantic = {
    schemas: jsonSchemas.map(({ path: schemaPath, ...schema }) => schema),
    dtoDeclarations: declarations.map(({ source, line, ...declaration }) => declaration),
  };
  return {
    schemaVersion: 1,
    jsonSchemaCount: jsonSchemas.length,
    dtoDeclarationCount: declarations.length,
    semanticSha256: semanticHash(semantic),
    jsonSchemas,
    dtoDeclarations: declarations,
  };
}

function choicesetMappings() {
  const sets = [];
  for (const file of files.filter((candidate) => candidate.endsWith('.json'))) {
    let parsed;
    try {
      parsed = JSON.parse(readText(file));
    } catch {
      continue;
    }
    if (!['global-choice-set', 'global-choice-set-bundle'].includes(parsed.kind)) continue;
    const candidates = parsed.kind === 'global-choice-set' ? [parsed] : parsed.choiceSets ?? [];
    for (const set of candidates) {
      if (!Array.isArray(set.options) || !set.options.every((option) => Number.isInteger(option.value))) continue;
      const options = set.options
        .map((option) => ({ name: option.name, value: option.value, label: option.label ?? null }))
        .sort((left, right) => left.value - right.value || String(left.name).localeCompare(String(right.name), 'en'));
      const sourceBase = path.basename(file, '.json');
      const displayKey = String(set.displayName ?? sourceBase).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      sets.push({
        key: `${sourceBase}#${displayKey}`,
        displayName: set.displayName ?? null,
        source: relative(file),
        options,
        semanticSha256: semanticHash(options.map(({ label, ...option }) => option)),
      });
    }
  }
  sets.sort((left, right) => left.key.localeCompare(right.key, 'en'));
  return sets;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) current = current.expression;
  return current;
}

function propertyKey(property) {
  const name = property.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function stableCode(value) {
  return Number.isInteger(value) && value >= 100000000 && value <= 199999999;
}

function runtimeNumericObjects() {
  const objects = [];
  for (const file of files.filter((candidate) => /\.(?:ts|tsx)$/.test(candidate))) {
    const rel = relative(file);
    if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(rel) || rel.split('/').includes('tests')) continue;
    const text = readText(file);
    if (!/100000\d{3}/.test(text)) continue;
    const sourceFile = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const expression = unwrapExpression(node.initializer);
        if (ts.isObjectLiteralExpression(expression)) {
          const mappings = [];
          for (const property of expression.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const key = propertyKey(property);
            const initializer = unwrapExpression(property.initializer);
            if (key == null) continue;
            if (ts.isNumericLiteral(initializer) && stableCode(Number(initializer.text))) {
              mappings.push({ name: key, value: Number(initializer.text) });
            } else if (ts.isNumericLiteral(property.name) && ts.isStringLiteral(initializer) && stableCode(Number(property.name.text))) {
              mappings.push({ name: initializer.text, value: Number(property.name.text) });
            }
          }
          if (mappings.length >= 2) {
            mappings.sort((left, right) => left.value - right.value || left.name.localeCompare(right.name, 'en'));
            objects.push({
              name: node.name.text,
              source: rel,
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
              mappings,
              semanticSha256: semanticHash(mappings),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  objects.sort((left, right) => `${left.name}\0${left.source}`.localeCompare(`${right.name}\0${right.source}`, 'en'));
  return objects;
}

function sqlChoiceTables() {
  const tableMap = new Map();
  for (const file of files.filter((candidate) => candidate.endsWith('.sql'))) {
    const text = readText(file);
    const matcher = /INSERT\s+INTO\s+(choice_[a-z0-9_]+)\s*\(\s*code\s*,\s*name\s*,\s*label\s*\)\s*VALUES\s*([\s\S]*?);/gi;
    for (const match of text.matchAll(matcher)) {
      const table = match[1].toLowerCase();
      const options = [...match[2].matchAll(/\(\s*(\d+)\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*\)/g)]
        .map((row) => ({
          value: Number(row[1]),
          name: row[2].replaceAll("''", "'"),
          label: row[3].replaceAll("''", "'"),
        }))
        .filter((row) => stableCode(row.value));
      if (!options.length) continue;
      const current = tableMap.get(table) ?? { table, sources: [], options: [] };
      current.sources.push(relative(file));
      current.options.push(...options);
      tableMap.set(table, current);
    }
  }
  const tables = [...tableMap.values()].map((table) => {
    const options = [...new Map(table.options.map((option) => [`${option.value}\0${option.name}`, option])).values()]
      .sort((left, right) => left.value - right.value || left.name.localeCompare(right.name, 'en'));
    const sources = [...new Set(table.sources)].sort();
    return { ...table, sources, options, semanticSha256: semanticHash(options.map(({ label, ...option }) => option)) };
  });
  return tables.sort((left, right) => left.table.localeCompare(right.table, 'en'));
}

function numericCodeMappings() {
  const choiceSets = choicesetMappings();
  const runtimeObjects = runtimeNumericObjects();
  const sqlTables = sqlChoiceTables();
  const semantic = {
    choiceSets: choiceSets.map(({ source, displayName, ...set }) => set),
    runtimeObjects: runtimeObjects.map(({ source, line, ...object }) => object),
    sqlTables: sqlTables.map(({ sources, ...table }) => table),
  };
  return {
    schemaVersion: 1,
    choiceSetCount: choiceSets.length,
    choiceOptionCount: choiceSets.reduce((count, set) => count + set.options.length, 0),
    runtimeObjectCount: runtimeObjects.length,
    sqlTableCount: sqlTables.length,
    semanticSha256: semanticHash(semantic),
    choiceSets,
    runtimeObjects,
    sqlTables,
  };
}

function workingspaceHashes() {
  const candidates = [path.join(sourceRoot, 'docs', 'workingspace'), path.join(sourceRoot, 'workingspace')];
  const root = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
  if (!root) throw new Error('Could not find docs/workingspace or workingspace.');
  const entries = allFiles(root).map((file) => ({
    path: slash(path.relative(root, file)),
    size: fs.statSync(file).size,
    sha256: sha256(readBytes(file)),
  }));
  const semantic = entries.map(({ path: entryPath, size, sha256: hash }) => ({ path: entryPath, size, sha256: hash }));
  return {
    schemaVersion: 1,
    sourceRoot: relative(root),
    fileCount: entries.length,
    totalBytes: entries.reduce((total, entry) => total + entry.size, 0),
    semanticSha256: semanticHash(semantic),
    files: entries,
  };
}

const snapshots = {
  'git-state.json': gitState(),
  'package-workspaces.json': packageWorkspaces(),
  'http-routes.json': httpRoutes(),
  'rest-contracts.json': restContracts(),
  'numeric-code-mappings.json': numericCodeMappings(),
  'workingspace-sha256.json': workingspaceHashes(),
};

for (const [name, snapshot] of Object.entries(snapshots)) writeJson(name, snapshot);

const ownedBaselineFiles = [
  'README.md',
  'capture.mjs',
  'compare.mjs',
  ...Object.keys(snapshots),
];
const manifestFiles = ownedBaselineFiles
  .filter((name) => fs.existsSync(path.join(outputDir, name)) && fs.statSync(path.join(outputDir, name)).isFile())
  .sort()
  .map((name) => {
    const bytes = readBytes(path.join(outputDir, name));
    return { path: name, size: bytes.length, sha256: sha256(bytes) };
  });

writeJson('manifest.json', {
  schemaVersion: 1,
  captureCommit: snapshots['git-state.json'].head,
  captureTree: snapshots['git-state.json'].tree,
  selfSha256: null,
  files: manifestFiles,
});

console.log(`PLAN-006 baseline captured in ${slash(path.relative(repoRoot, outputDir))}`);
for (const [name, snapshot] of Object.entries(snapshots)) {
  const detail = snapshot.semanticSha256 ? ` semantic=${snapshot.semanticSha256}` : '';
  console.log(`- ${name}${detail}`);
}
