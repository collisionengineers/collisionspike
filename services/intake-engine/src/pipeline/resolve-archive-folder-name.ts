/* ============================================================
   intake-engine — pure archive folder-name resolution. No I/O.

   Choice: the folder name is the case number as-is, with the non-prefix remainder
   upper-cased and the prefix casing preserved exactly as minted. mint-case-number.ts
   already fixes prefixes to the lower-case literals 'a.'/'ap.'/'' — this function does
   not re-derive or second-guess that, it just never upper-cases the prefix segment,
   so 'a.QDOS26001' reads as 'a.QDOS26001' (not 'A.QDOS26001'). Upper-casing the
   remainder guarantees the folder name reads consistently even if a caller ever
   passes a lower-cased principal code or sequence padding produced elsewhere.
   ============================================================ */

const PREFIX_PATTERN = /^(a\.|ap\.)/;

export function resolveArchiveFolderName(caseNumber: string): string {
  const match = caseNumber.match(PREFIX_PATTERN);
  const prefix = match ? match[0] : '';
  const rest = caseNumber.slice(prefix.length);
  return `${prefix}${rest.toUpperCase()}`;
}
