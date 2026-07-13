import { readFile } from 'node:fs/promises';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';

const contractPath = new URL('../api/openapi/capture.v1.yaml', import.meta.url);
const generatedPath = new URL('../api/src/generated/capture-api.ts', import.meta.url);

const contract = await readFile(contractPath);
const expected = COMMENT_HEADER + astToString(await openapiTS(contract));
const actual = await readFile(generatedPath, 'utf8').catch((error) => {
  if (error?.code === 'ENOENT') return '';
  throw error;
});

if (actual !== expected) {
  console.error('Generated capture API types are stale or missing.');
  console.error('Run `npm run contract:capture:generate` and commit the result.');
  process.exitCode = 1;
} else {
  console.log('Generated capture API types match the canonical OpenAPI document.');
}
