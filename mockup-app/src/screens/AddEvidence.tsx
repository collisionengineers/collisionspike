import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Caption1,
  MessageBar,
  MessageBarBody,
  SearchBox,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { Paperclip, Upload, FileImage, Check } from 'lucide-react';
import { SectionHeading, VrmPlate } from '../components';
import { data, type Case } from '../data';

/* Add evidence (review nav-bar #5): the SECOND intake path. Evidence (vehicle
   photos, an emailed instruction, a .msg) must attach to an EXISTING case —
   never create a new one. The user finds the open case, picks the files, and
   sends them to that case's evidence set.

   The case LINK is the functional core here. Writing the bytes to Blob storage
   is the live storage-connector step (operator-gated, same gate as the case
   workspace's upload); until that connection is bound the screen records the
   intent and routes to the case so the files can be confirmed there. */

const ACCEPT = 'image/*,.eml,.msg,.pdf';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, maxWidth: '760px' },
  step: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalL,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  stepLabel: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  caseList: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto' },
  caseRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    background: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  caseRowActive: {
    border: '1px solid var(--ce-red)',
    boxShadow: 'inset 0 0 0 1px var(--ce-red)',
  },
  caseMeta: { display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: 1 },
  po: { fontFamily: 'var(--ce-font-mono)', textTransform: 'uppercase', color: tokens.colorNeutralForeground3 },
  fileRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  fileChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 8px',
    borderRadius: '2px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: '12px',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  hiddenInput: { display: 'none' },
  actions: { display: 'flex', gap: tokens.spacingHorizontalM, alignItems: 'center' },
  muted: { color: tokens.colorNeutralForeground3 },
});

const OPEN_QUEUES = ['awaiting-images', 'images-only', 'ready-review'] as const;

export function AddEvidence() {
  const styles = useStyles();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [cases, setCases] = useState<Case[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(OPEN_QUEUES.map((q) => data.casesForQueue(q))).then((lists) => {
      if (cancelled) return;
      const byId = new Map<string, Case>();
      for (const list of lists) for (const c of list) byId.set(c.id, c);
      setCases([...byId.values()]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) =>
      [c.vrm, c.casePo ?? '', c.provider, c.evaFields.claimantName.value]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [cases, search]);

  const selected = cases.find((c) => c.id === selectedId);

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };

  const attach = () => {
    if (selectedId) navigate(`/case/${selectedId}`);
  };

  return (
    <div className={mergeClasses('ce-enter', styles.root)}>
      <SectionHeading
        eyebrow="Intake"
        heading="Add evidence"
        subtitle="Attach photos or an instruction to an existing case — this never creates a new case."
      />

      {/* Step 1 — find the case */}
      <section className={styles.step}>
        <span className={styles.stepLabel}>1 · Find the case</span>
        <SearchBox
          placeholder="Search VRM, Case/PO, claimant…"
          value={search}
          onChange={(_e, d) => setSearch(d.value)}
        />
        {filtered.length === 0 ? (
          <Caption1 className={styles.muted}>
            {cases.length === 0
              ? 'No open cases to add evidence to yet.'
              : 'No open case matches that search.'}
          </Caption1>
        ) : (
          <div className={styles.caseList}>
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className={mergeClasses(
                  'ce-focusable',
                  styles.caseRow,
                  c.id === selectedId && styles.caseRowActive,
                )}
                onClick={() => setSelectedId(c.id)}
                aria-pressed={c.id === selectedId}
              >
                <VrmPlate vrm={c.vrm} size="small" />
                <span className={styles.caseMeta}>
                  <Text size={200}>{c.provider}</Text>
                  <span className={styles.po}>{c.casePo ?? 'No Case/PO yet'}</span>
                </span>
                {c.id === selectedId && <Check size={16} aria-label="Selected" />}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Step 2 — choose the files */}
      <section className={styles.step}>
        <span className={styles.stepLabel}>2 · Choose evidence</span>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          className={styles.hiddenInput}
          onChange={(e) => onFiles(e.target.files)}
        />
        <div className={styles.actions}>
          <Button icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>
            Choose files
          </Button>
          <Caption1 className={styles.muted}>Vehicle photos, an .eml/.msg, or a PDF.</Caption1>
        </div>
        {files.length > 0 && (
          <div className={styles.fileRow}>
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className={styles.fileChip}>
                <FileImage size={13} aria-hidden />
                {f.name}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Step 3 — attach */}
      <MessageBar intent="info">
        <MessageBarBody>
          Writing the files to storage is the live Blob-connector step (operator-gated). Attaching
          opens the case so the evidence can be confirmed and ordered for EVA there.
        </MessageBarBody>
      </MessageBar>

      <div className={styles.actions}>
        <Button
          appearance="primary"
          icon={<Paperclip size={16} />}
          disabled={!selected || files.length === 0}
          onClick={attach}
        >
          {selected ? `Add to ${selected.vrm}` : 'Add to case'}
        </Button>
      </div>
    </div>
  );
}

export default AddEvidence;
