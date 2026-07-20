import { readFile } from 'node:fs/promises';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';

const contractPath = new URL('../../contracts/capture.v1.yaml', import.meta.url);
const generatedTargets = [
  {
    label: 'server (@cs/api)',
    path: new URL('../../services/data-api/src/generated/capture-api.ts', import.meta.url),
  },
  {
    label: 'browser (@cs/capture-contracts)',
    path: new URL('../../packages/capture-contracts/src/generated.ts', import.meta.url),
  },
];

const contract = await readFile(contractPath);
const expected = COMMENT_HEADER + astToString(await openapiTS(contract));

let failed = false;
for (const target of generatedTargets) {
  const actual = await readFile(target.path, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return '';
    throw error;
  });
  if (actual !== expected) {
    console.error(`Generated capture API types are stale or missing: ${target.label}.`);
    failed = true;
  }
}

if (failed) {
  console.error('Run `npm run contract:capture:generate` and commit the result.');
  process.exitCode = 1;
} else {
  console.log('Generated capture API types match the canonical OpenAPI document (server + browser).');
}
