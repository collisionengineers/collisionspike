import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../evidence/blob-store.ts', import.meta.url)), 'utf8');
const routeSource = readFileSync(
  fileURLToPath(new URL('./capture-upload.ts', import.meta.url)),
  'utf8',
);

describe('capture blob security boundary', () => {
  it('keeps upload SAS generation managed-identity-first and exact-object scoped', () => {
    expect(source).toContain('managedIdentityClient()');
    expect(source).toContain("BlobSASPermissions.parse('cw')");
    expect(source).toContain('blobName: blobPath');
    // Managed identity always wins when present; the only non-MI path is the
    // double-opt-in local-dev backend, and it refuses every non-loopback endpoint.
    expect(source).toMatch(/function captureBlobBackend[\s\S]*IDENTITY_ENDPOINT && process\.env\.IDENTITY_HEADER/u);
    expect(source).toMatch(/CAPTURE_LOCAL_DEV_BLOB.*!== 'true'\) return undefined/u);
    expect(source).toContain('only accepts a loopback blob endpoint');
    expect(source).toContain('requires an account-key connection string');
    expect(source).toMatch(/LOCAL_BLOB_HOSTS = \['127\.0\.0\.1', 'localhost', '::1', '\[::1\]'\]/u);
  });

  it('bounds staging downloads and promotes validated bytes outside the SAS path immutably', () => {
    // HEAD-first, then download exactly the bounded length so the ranged read
    // never requests past EOF (real Azure 416s the past-EOF chunks of an
    // overshooting downloadToBuffer count). Still allocation-bounded to maxBytes + 1.
    expect(source).toContain('Math.min(properties.contentLength ?? 0, maxBytes + 1)');
    expect(source).toContain('downloadToBuffer(0, bounded)');
    expect(source).toContain('capture-validated/');
    expect(source).toContain("conditions: { ifNoneMatch: '*' }");
    expect(source).toContain('storageError.statusCode === 412');
    expect(source).toContain('metadata: { sha256 }');
    expect(source).toContain('captureValidatedBlobPath(sessionId, assetId, sha256)');
    expect(source).toContain('captureStagingBlobPath(sessionId: string, assetId: string)');
    expect(routeSource).toContain('captureStagingBlobPath(sessionId, candidateId)');
  });

  it('limits deletion to capture-owned prefixes and keeps retention on the capture backend', () => {
    expect(source).toContain("blobPath.startsWith('capture/')");
    expect(source).toContain("blobPath.startsWith('capture-validated/')");
    expect(source).toContain('refusing to delete a non-capture blob path');
    expect(source).toMatch(/deleteCaptureManagedBlob[\s\S]*captureBlobBackend\(\)/u);
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
