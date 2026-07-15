/** Pure decisions for registration-keyed archive holding folders (TKT-034). */

export interface ArchiveHoldingCaseCandidate {
  caseId: string;
  casePo: string | null;
}
export type ArchiveHoldingOwnershipDecision =
  | { kind: 'none' }
  | { kind: 'exact'; candidate: ArchiveHoldingCaseCandidate }
  | { kind: 'ambiguous'; candidates: ArchiveHoldingCaseCandidate[] };

/** Zero and multiple active matches are never guessed. */
export function decideArchiveHoldingOwner(
  candidates: ArchiveHoldingCaseCandidate[],
): ArchiveHoldingOwnershipDecision {
  const unique = [...new Map(candidates.map((candidate) => [candidate.caseId, candidate])).values()];
  if (unique.length === 0) return { kind: 'none' };
  if (unique.length === 1 && unique[0].casePo?.trim()) {
    return { kind: 'exact', candidate: unique[0] };
  }
  return { kind: 'ambiguous', candidates: unique };
}

export interface ArchiveFolderEntry {
  id: string;
  name: string;
  sha1?: string;
  type?: string;
}

export type ArchiveHoldingTransferDecision =
  | { kind: 'deduplicate'; existingFileId: string }
  | { kind: 'move'; name: string };

/** Prefer content identity; otherwise choose a deterministic collision-safe filename. */
export function decideArchiveHoldingTransfer(
  filename: string,
  sourceSha1: string | undefined,
  sourceSha256: string,
  destinationEntries: ArchiveFolderEntry[],
): ArchiveHoldingTransferDecision {
  const files = destinationEntries.filter((entry) => !entry.type || entry.type === 'file');
  if (sourceSha1) {
    const sameContent = files.find(
      (entry) => entry.sha1?.toLowerCase() === sourceSha1.toLowerCase(),
    );
    if (sameContent) return { kind: 'deduplicate', existingFileId: sameContent.id };
  }

  const occupied = new Set(files.map((entry) => entry.name.toLowerCase()));
  if (!occupied.has(filename.toLowerCase())) return { kind: 'move', name: filename };
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  return { kind: 'move', name: `${stem}-${sourceSha256.slice(0, 8)}${extension}` };
}
