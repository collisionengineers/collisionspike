export type ProviderRecoveryOutcome =
  | 'not_needed'
  | 'blocked'
  | 'identity_ready'
  | 'archive_pending'
  | 'completed';

/** Provider recovery completes only after the Case/PO Archive folder is linked. */
export function providerRecoveryAfterArchive(
  identityOutcome: 'identity_ready' | 'not_needed' | 'blocked' | undefined,
  archiveResult: unknown,
  archiveFailed: boolean,
): ProviderRecoveryOutcome {
  if (identityOutcome !== 'identity_ready') return identityOutcome ?? 'not_needed';
  if (archiveFailed || !archiveResult || typeof archiveResult !== 'object') {
    return 'archive_pending';
  }
  const folderId = String((archiveResult as { folderId?: unknown }).folderId ?? '').trim();
  const recoveryCompleted =
    (archiveResult as { providerRecoveryCompleted?: unknown }).providerRecoveryCompleted === true;
  return folderId && recoveryCompleted ? 'completed' : 'archive_pending';
}
