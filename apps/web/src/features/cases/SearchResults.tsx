/**
 * SearchResults — the global-search results view (TKT-072). Reads `?q=` from the URL, calls
 * GET /api/search via the data seam, and renders three grouped sections: cases (grouped by
 * registration so "N cases share this registration" is obvious), inbound emails, and providers.
 * Read-only: rows navigate to the relevant detail screen. Honest-empty and disabled states are
 * shown plainly (never an error page). While GLOBAL_SEARCH_ENABLED is off the server returns an
 * empty disabled payload, so the view explains that search is switched off.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Title3,
  Body1,
  Caption1,
  Spinner,
  makeStyles,
  tokens,
  Badge,
} from '@fluentui/react-components';
import { Search, Car, Mail, Building2 } from 'lucide-react';
import { CASE_STATUSES, type CaseStatus } from '@cs/domain';
import { StatusBadge } from '../../shared/ui';
import { caseAgeLabel } from '../../shared/ui/date-format';
import { getDataAccess } from '../../data';
import type { GlobalSearchResults, SearchCaseHit } from '../../data/rest-client';

/** Narrow the server's status string to the CaseStatus union (TKT-096 badge). */
function isCaseStatus(s: string | undefined): s is CaseStatus {
  return !!s && (CASE_STATUSES as readonly string[]).includes(s);
}

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, padding: tokens.spacingVerticalL, maxWidth: '960px' },
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  sectionHead: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, color: tokens.colorNeutralForeground2 },
  group: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, borderLeft: `2px solid ${tokens.colorBrandStroke2}`, paddingLeft: tokens.spacingHorizontalM },
  groupLabel: { color: tokens.colorNeutralForeground3, fontStyle: 'italic' },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM, padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, borderRadius: tokens.borderRadiusMedium, cursor: 'pointer', textAlign: 'left', border: 'none', backgroundColor: 'transparent', width: '100%', ':hover': { backgroundColor: tokens.colorNeutralBackground2 } },
  rowMain: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0 },
  rowSub: { color: tokens.colorNeutralForeground3 },
  empty: { color: tokens.colorNeutralForeground3, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, alignItems: 'center', marginTop: tokens.spacingVerticalXXL },
});

/** Group case hits by canonical registration so same-VRM cases render together. */
function groupByVrm(cases: SearchCaseHit[]): Array<{ vrm: string | null; rows: SearchCaseHit[] }> {
  const map = new Map<string, SearchCaseHit[]>();
  const order: string[] = [];
  for (const c of cases) {
    const key = c.vrmCanonical ?? `__${c.id}`;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(c);
  }
  return order.map((key) => ({ vrm: key.startsWith('__') ? null : key, rows: map.get(key)! }));
}

export default function SearchResults() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    if (!q) {
      setResults(null);
      return;
    }
    setLoading(true);
    getDataAccess()
      .globalSearch(q)
      .then((r) => {
        if (live) setResults(r);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [q]);

  const caseGroups = useMemo(() => groupByVrm(results?.cases ?? []), [results]);
  const total = (results?.cases.length ?? 0) + (results?.emails.length ?? 0) + (results?.providers.length ?? 0);

  return (
    <div className={styles.page}>
      <Title3>{q ? `Results for “${q}”` : 'Search'}</Title3>

      {loading && <Spinner size="small" label="Searching…" labelPosition="after" />}

      {!loading && results?.disabled && (
        <Body1 className={styles.rowSub}>Search is switched off right now. You can still browse the queues and inbox as normal.</Body1>
      )}

      {!loading && q && !results?.disabled && total === 0 && (
        <div className={styles.empty}>
          <Search size={28} />
          <Body1>No cases, emails, or providers match “{q}”.</Body1>
          {results?.tooShort && <Caption1>Try a longer search term.</Caption1>}
        </div>
      )}

      {/* Cases, grouped by registration */}
      {!loading && (results?.cases.length ?? 0) > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <Car size={16} aria-hidden />
            <Caption1>Cases{results?.truncated.cases ? ' (showing the first matches)' : ''}</Caption1>
          </div>
          {caseGroups.map((g, gi) => (
            <div key={gi} className={g.rows.length > 1 ? styles.group : undefined}>
              {g.rows.length > 1 && g.vrm && (
                <Caption1 className={styles.groupLabel}>
                  {g.rows.length} cases share registration {g.vrm}
                </Caption1>
              )}
              {g.rows.map((c) => (
                <button key={c.id} className={styles.row} onClick={() => navigate(`/case/${c.id}`)}>
                  <div className={styles.rowMain}>
                    <Body1>
                      {c.casePo ?? c.ref ?? c.vrm ?? 'Case'} {c.vrm ? `· ${c.vrm}` : ''}
                    </Body1>
                    <Caption1 className={styles.rowSub}>
                      {/* TKT-072 verifier finding: case rows carry the case's age
                          ("12d old", the queue-row idiom). Absent createdAt (an
                          older server payload) renders nothing extra. */}
                      {[
                        [c.claimant, c.provider].filter(Boolean).join(' · ') || 'No claimant/provider',
                        caseAgeLabel(c.createdAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Caption1>
                  </div>
                  {/* TKT-096: a real status badge on result rows — terminal cases
                      (EVA Submitted / Done / Archived) are in scope and must read as
                      such, not as a generic queue word. Falls back to the queue
                      label when the server predates the status field. */}
                  {isCaseStatus(c.status) ? (
                    <StatusBadge status={c.status} size="small" />
                  ) : (
                    <Badge appearance="tint" color="informative">
                      {c.queue}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Inbound emails */}
      {!loading && (results?.emails.length ?? 0) > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <Mail size={16} aria-hidden />
            <Caption1>Inbound emails{results?.truncated.emails ? ' (showing the first matches)' : ''}</Caption1>
          </div>
          {/* TKT-072 verifier finding: an email hit opens THAT email's preview via the
              inbox `?item=` deep link (Inbox.tsx consumes it once the list loads and
              degrades to the plain inbox when the row is unknown). */}
          {results!.emails.map((e) => (
            <button
              key={e.id}
              className={styles.row}
              onClick={() => navigate(`/inbox?item=${encodeURIComponent(e.id)}`)}
            >
              <div className={styles.rowMain}>
                <Body1>{e.subject || '(no subject)'}</Body1>
                <Caption1 className={styles.rowSub}>{[e.from, e.category].filter(Boolean).join(' · ')}</Caption1>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Providers */}
      {!loading && (results?.providers.length ?? 0) > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <Building2 size={16} aria-hidden />
            <Caption1>Providers</Caption1>
          </div>
          {results!.providers.map((p) => (
            <button key={p.id} className={styles.row} onClick={() => navigate('/admin')}>
              <div className={styles.rowMain}>
                <Body1>{p.displayName || p.principalCode || 'Provider'}</Body1>
                {p.principalCode && <Caption1 className={styles.rowSub}>{p.principalCode}</Caption1>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
