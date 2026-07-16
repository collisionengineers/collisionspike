import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';

const contractPath = new URL('../openapi/capture.v1.yaml', import.meta.url);
const lockPath = new URL('../openapi/source-lock.json', import.meta.url);
const generatedPath = new URL('../src/generated.ts', import.meta.url);
const pendingCommit = 'PENDING_COLLISIONSPIKE_SERVER_COMMIT';

const contract = await readFile(contractPath);
const lock = JSON.parse(await readFile(lockPath, 'utf8'));
let failed = false;

const reportMismatch = (message) => {
  process.stderr.write(`${message}\n`);
  failed = true;
};

if (lock.sourceRepository !== 'collisionengineers/collisionspike') {
  reportMismatch('Capture contract source repository is not canonical.');
}
if (lock.sourcePath !== 'contracts/capture.v1.yaml') {
  reportMismatch('Capture contract source path is not canonical.');
}
if (lock.sourceCommit !== pendingCommit && !/^[0-9a-f]{40}$/.test(lock.sourceCommit)) {
  reportMismatch('Capture contract source commit must be a 40-character Git commit.');
}

const sha256 = createHash('sha256').update(contract).digest('hex');
if (sha256 !== lock.specSha256) {
  reportMismatch('Vendored capture OpenAPI does not match its source lock SHA-256.');
}

const expected = COMMENT_HEADER + astToString(await openapiTS(contract));
const actual = await readFile(generatedPath, 'utf8').catch((error) => {
  if (error?.code === 'ENOENT') return '';
  throw error;
});
if (actual !== expected) {
  reportMismatch('Generated capture API types are stale or missing.');
}

if (failed) {
  process.stderr.write(
    'Run `npm run contract:capture:generate` after updating the vendored contract and source lock.\n'
  );
  process.exitCode = 1;
} else {
  process.stdout.write('Generated capture API types match the vendored canonical OpenAPI document.\n');
  process.stdout.write(`Capture contract source lock SHA-256: ${sha256}\n`);
  if (lock.sourceCommit === pendingCommit) {
    process.stderr.write('Capture contract source commit is pending the CollisionSpike server commit.\n');
  }
}
