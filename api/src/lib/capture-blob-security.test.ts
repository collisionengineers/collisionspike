import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./blob.ts', import.meta.url)), 'utf8');
const routeSource = readFileSync(
  fileURLToPath(new URL('../functions/capture.ts', import.meta.url)),
  'utf8',
);

describe('capture blob security boundary', () => {
  it('keeps upload SAS generation managed-identity-only and exact-object scoped', () => {
    expect(source).toContain('managedIdentityClient()');
    expect(source).toContain("BlobSASPermissions.parse('cw')");
    expect(source).toContain('blobName: blobPath');
    expect(source).not.toMatch(/createCaptureUploadSas[\s\S]*StorageSharedKeyCredential/u);
  });

  it('bounds staging downloads and promotes validated bytes outside the SAS path immutably', () => {
    expect(source).toContain('downloadToBuffer(0, maxBytes + 1)');
    expect(source).toContain('capture-validated/');
    expect(source).toContain("conditions: { ifNoneMatch: '*' }");
    expect(source).toContain('storageError.statusCode === 412');
    expect(source).toContain('metadata: { sha256 }');
    expect(source).toContain('captureValidatedBlobPath(sessionId, assetId, sha256)');
    expect(source).toContain('captureStagingBlobPath(sessionId: string, assetId: string)');
    expect(routeSource).toContain('captureStagingBlobPath(sessionId, candidateId)');
  });

  it('limits deletion to capture-owned prefixes and keeps retention on managed identity', () => {
    expect(source).toContain("blobPath.startsWith('capture/')");
    expect(source).toContain("blobPath.startsWith('capture-validated/')");
    expect(source).toContain('refusing to delete a non-capture blob path');
    expect(source).toMatch(/deleteCaptureManagedBlob[\s\S]*managedIdentityClient\(\)/u);
  });

  it('resolves and locks the case lineage before selecting a validated asset', () => {
    expect(routeSource).toContain('withResolvedCaseMutationTarget(session.case_id');
    expect(routeSource).toContain('retargetOpenCaptureSession(');
    expect(routeSource).toContain('FOR UPDATE OF s, a');
    expect(routeSource).toContain("rows[0].status !== 'open'");
    expect(routeSource).toContain('new Date(rows[0].expires_at).getTime() <= Date.now()');
    expect(routeSource).toContain('Number(rows[0].token_generation) !== Number(session.token_generation)');
    expect(routeSource).toContain('rows[0].validation_attempt !== validationAttempt');
    expect(routeSource).toContain("AND validation_attempt = $8");
  });
});
