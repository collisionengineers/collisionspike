import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('../..', import.meta.url));
const visibleAttributes = new Set([
  'aria-label',
  'content',
  'eyebrow',
  'heading',
  'hint',
  'label',
  'placeholder',
  'subtitle',
  'title',
]);
const engineeringLanguage = /\b(?:api|azure|configuration|deploy(?:ed|ment)?|endpoint|entra|feature flag|function app|internal identifier|json|jwt|key vault|mock|msal|ocr|operator-gated|payload|postgres|provenance|route|schema|seed(?:ed)?|ticket|tkt-\d+)\b/i;

function productionTsx(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__fixtures__' ? [] : productionTsx(path);
    if (extname(entry.name) !== '.tsx' || entry.name.includes('.test.')) return [];
    return [path];
  });
}

function stringValues(node: ts.Node): string[] {
  const values: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
      values.push(child.text);
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return values;
}

function visibleStrings(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const values: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const value = node.text.trim();
      if (value) values.push(value);
    } else if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(source))) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) values.push(node.initializer.text);
      if (node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        values.push(...stringValues(node.initializer.expression));
      }
      return;
    } else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      values.push(...stringValues(node.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return values;
}

describe('handler-facing language', () => {
  it('does not expose engineering or planning vocabulary in static interface copy', () => {
    const violations = productionTsx(srcRoot).flatMap((file) =>
      visibleStrings(file)
        .filter((value) => engineeringLanguage.test(value))
        .map((value) => `${relative(srcRoot, file)}: ${JSON.stringify(value)}`),
    );

    expect(violations).toEqual([]);
  });
});
