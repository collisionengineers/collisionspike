/**
 * services/data-api/src/features/archive/lookup.ts — READ-ONLY Box archive lookup (TKT-107).
 *
 * Suggest-only: searches the read-only Box archive root(s) for folders whose name matches a
 * Case/PO or registration, and returns each match with a server-minted "Open in Box" deep link.
 * It NEVER mints a case, folder, File Request, or Case/PO — it only lists and matches.
 *
 * Scope lock is defence-in-depth: the Data API only searches the root ids in
 * `RETRO_BOX_ARCHIVE_ROOT_IDS` (gates.retroBoxArchiveRootIds), and the box-webhook facade
 * independently enforces `BOX_READONLY_ROOT_IDS`. Unconfigured (no archive roots, or no
 * BOX_FN_URL/KEY) → an honest `{ configured:false, matches:[] }` no-op.
 */

import { gates } from '@cs/domain/gates';
import { canonicalizeVrm } from '@cs/domain';
import { listBoxFolderEntries } from '../../platform/http/service-client.js';

export interface ArchiveMatch {
  /** the archived folder name (typically a Case/PO). */
  name: string;
  folderId: string;
  /** server-minted deep link the SPA/assistant renders as "Open in Box". */
  openInBoxUrl: string;
}
export interface ArchiveLookupResult {
  configured: boolean;
  query: string;
  matches: ArchiveMatch[];
}

/** True when at least one read-only archive root is configured for the Data API. */
export function archiveConfigured(): boolean {
  return roots().length > 0;
}

function roots(): string[] {
  return gates
    .retroBoxArchiveRootIds()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Look up archive folders matching `query` (a Case/PO or registration). Space-insensitive on the
 * canonical form (so "YT13 UTV"/"CCPY 26050" match compact folder names). Read-only; suggest-only.
 * `limit` caps the returned matches. Never throws — a facade error degrades to an empty result.
 */
export async function archiveLookup(query: string, limit = 8): Promise<ArchiveLookupResult> {
  const q = (query ?? '').trim().slice(0, 80);
  const rootIds = roots();
  if (!rootIds.length || q.length < 2) {
    return { configured: rootIds.length > 0, query: q, matches: [] };
  }
  const canon = canonicalizeVrm(q);
  const lowerRaw = q.toLowerCase();
  const seen = new Set<string>();
  const matches: ArchiveMatch[] = [];
  for (const rootId of rootIds) {
    let entries: Array<{ id: string; name: string }>;
    try {
      entries = await listBoxFolderEntries(rootId);
    } catch {
      continue; // best-effort per root — a transport/config error just yields no matches here
    }
    for (const e of entries) {
      const nameCanon = canonicalizeVrm(e.name);
      const hit =
        (canon.length >= 2 && nameCanon.includes(canon)) ||
        e.name.toLowerCase().includes(lowerRaw);
      if (hit && !seen.has(e.id)) {
        seen.add(e.id);
        matches.push({
          name: e.name,
          folderId: e.id,
          openInBoxUrl: `https://app.box.com/folder/${encodeURIComponent(e.id)}`,
        });
        if (matches.length >= limit) return { configured: true, query: q, matches };
      }
    }
  }
  return { configured: true, query: q, matches };
}
