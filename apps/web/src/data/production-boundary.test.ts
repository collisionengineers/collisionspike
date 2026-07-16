import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { emptyDataAccess, getDataAccess } from './index';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));

function productionModules(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__fixtures__' || entry.name === 'test') return [];
      return productionModules(fullPath);
    }
    if (!['.ts', '.tsx'].includes(extname(entry.name)) || /\.test\.[^.]+$/.test(entry.name)) return [];
    return [fullPath];
  });
}

describe('production source boundary', () => {
  it('starts with the honest empty source before authentication configures REST', () => {
    expect(getDataAccess()).toBe(emptyDataAccess);
  });

  it('cannot import fabricated fixture data', () => {
    const violations = productionModules(srcRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const specifiers = [...source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)]
        .map((match) => match[1]);
      return specifiers
        .filter((specifier) => specifier.includes('__fixtures__') || specifier.includes('fixture-source'))
        .map((specifier) => `${relative(srcRoot, file)} -> ${specifier}`);
    });

    expect(violations).toEqual([]);
  });
});
