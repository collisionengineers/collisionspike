import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Caption1,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
  SearchBox,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { Check, FileImage, Paperclip, Upload, X } from 'lucide-react';
import { SectionHeading, VrmPlate } from '../components';
import { partitionAttachments } from '../components/attach-validate';
import { data, type Case, type EvidenceUploadResult } from '../data';
import { ADD_EVIDENCE_QUEUES, uploadEvidenceThenOpen } from './add-evidence-submit';
import { addEvidenceTopLevelMessage } from './evidence-upload-result';

const ACCEPT = [
  '.jpg', '.jpeg', '.png', '.webp', '.pdf',
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
].join(',');

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    width: '100%',
    maxWidth: '880px',
    margin: '0 auto',
  },
  step: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalL,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: 0,
  },
  stepLabel: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  caseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '320px',
    overflowY: 'auto',
  },
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
    minWidth: 0,
    textAlign: 'left',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  caseRowActive: {
    border: '1px solid var(--ce-charcoal)',
    boxShadow: 'inset 0 0 0 1px var(--ce-charcoal)',
  },
  caseMeta: { display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: 1 },
  po: {
    fontFamily: 'var(--ce-font-mono)',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
    overflowWrap: 'anywhere',
  },
  files: { display: 'flex', flexDirection: 'column', gap: '4px', margin: 0, padding: 0, listStyle: 'none' },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    minWidth: 0,
  },
  fileName: { minWidth: 0, flexGrow: 1, overflowWrap: 'anywhere' },
  hiddenInput: { display: 'none' },
  actions: { display: 'flex', gap: tokens.spacingHorizontalM, alignItems: 'center', flexWrap: 'wrap' },
  submit: { alignSelf: 'flex-start' },
  muted: { color: tokens.colorNeutralForeground3 },
  results: { margin: 0, paddingLeft: tokens.spacingHorizontalL },
});

export function caseMatchesSearch(item: Case, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [item.vrm, item.casePo ?? '', item.provider, item.evaFields.claimantName.value]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

export function resultFileLabel(
  files: readonly File[],
  fileIndex: number,
  fallbackName: string,
): string {
  const fileName = files[fileIndex]?.name || fallbackName;
  return files.filter((file) => file.name === fileName).length > 1
    ? `${fileName} (file ${fileIndex + 1})`
    : fileName;
}

export function AddEvidence() {
  const styles = useStyles();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadKeyRef = useRef(crypto.randomUUID());
  const uploadInFlightRef = useRef(false);

  const [cases, setCases] = useState<Case[]>([]);
  const [caseLoadError, setCaseLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [files, setFiles] = useState<File[]>([]);
  const [pickerRejected, setPickerRejected] = useState<Array<{ name: string; reason: string }>>([]);
  const [result, setResult] = useState<EvidenceUploadResult>();
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(ADD_EVIDENCE_QUEUES.map((queue) => data.casesForQueue(queue)))
      .then((lists) => {
        if (cancelled) return;
        const byId = new Map<string, Case>();
        for (const list of lists) for (const item of list) byId.set(item.id, item);
        setCases([...byId.values()]);
      })
      .catch(() => {
        if (!cancelled) setCaseLoadError(true);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    return cases.filter((item) => caseMatchesSearch(item, search));
  }, [cases, search]);

  const selected = cases.find((item) => item.id === selectedId);
  const topLevelMessage = result ? addEvidenceTopLevelMessage(result, files.length) : undefined;

  const changedBatch = (): void => {
    uploadKeyRef.current = crypto.randomUUID();
    setResult(undefined);
  };

  const selectCase = (id: string): void => {
    if (id !== selectedId) changedBatch();
    setSelectedId(id);
  };

  const onFiles = (list: FileList | null): void => {
    if (!list) return;
    const partitioned = partitionAttachments([...files, ...Array.from(list)]);
    setFiles(partitioned.accepted);
    setPickerRejected(partitioned.rejected);
    changedBatch();
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeFile = (index: number): void => {
    setFiles((current) => current.filter((_file, fileIndex) => fileIndex !== index));
    setPickerRejected([]);
    changedBatch();
  };

  const changeSearch = (value: string): void => {
    setSearch(value);
    if (selected && !caseMatchesSearch(selected, value)) {
      setSelectedId(undefined);
      changedBatch();
    }
  };

  const attach = async (): Promise<void> => {
    if (!selected || files.length === 0 || uploadInFlightRef.current) return;
    const targetId = selected.id;
    const batchFiles = [...files];
    uploadInFlightRef.current = true;
    setUploading(true);
    setResult(undefined);
    try {
      const response = await uploadEvidenceThenOpen(
        data,
        targetId,
        batchFiles,
        uploadKeyRef.current,
        navigate,
      );
      setResult(response);
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  };

  return (
    <div className={mergeClasses('ce-enter', styles.root)} aria-busy={uploading}>
      <SectionHeading eyebrow="Intake" heading="Add evidence" subtitle="Add files to an existing case." />

      <section className={styles.step} aria-labelledby="add-evidence-case-step">
        <span id="add-evidence-case-step" className={styles.stepLabel}>1 · Find the case</span>
        <SearchBox
          aria-label="Search open cases"
          placeholder="Search VRM, claimant or Case/PO…"
          value={search}
          disabled={uploading}
          onChange={(_event, detail) => changeSearch(detail.value)}
        />
        {caseLoadError ? (
          <MessageBar intent="error">
            <MessageBarBody>Cases could not be loaded. Try again.</MessageBarBody>
          </MessageBar>
        ) : filtered.length === 0 ? (
          <Caption1 className={styles.muted}>
            {cases.length === 0 ? 'No open cases are available.' : 'No open case matches that search.'}
          </Caption1>
        ) : (
          <div className={styles.caseList} aria-label="Open cases">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                className={mergeClasses(
                  'ce-focusable',
                  styles.caseRow,
                  item.id === selectedId && styles.caseRowActive,
                )}
                onClick={() => selectCase(item.id)}
                aria-pressed={item.id === selectedId}
                disabled={uploading}
              >
                <VrmPlate vrm={item.vrm} size="small" />
                <span className={styles.caseMeta}>
                  <Text size={200}>{item.provider}</Text>
                  <span className={styles.po}>{item.casePo ?? 'No Case/PO yet'}</span>
                </span>
                {item.id === selectedId && <Check size={16} aria-label="Selected" />}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className={styles.step} aria-labelledby="add-evidence-file-step">
        <span id="add-evidence-file-step" className={styles.stepLabel}>2 · Choose evidence</span>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          className={styles.hiddenInput}
          aria-label="Choose evidence files"
          onChange={(event) => onFiles(event.target.files)}
        />
        <div className={styles.actions}>
          <Button
            icon={<Upload size={16} />}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            Choose files
          </Button>
          <Caption1 className={styles.muted}>JPG, PNG, WebP or PDF · up to 15 MB each</Caption1>
        </div>

        {files.length > 0 && (
          <ul className={styles.files} aria-label="Files ready to add">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className={styles.fileRow}>
                <FileImage size={15} aria-hidden />
                <Caption1 className={styles.fileName}>{file.name}</Caption1>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<X size={14} />}
                  aria-label={`Remove ${file.name}`}
                  disabled={uploading}
                  onClick={() => removeFile(index)}
                />
              </li>
            ))}
          </ul>
        )}

        {pickerRejected.length > 0 && (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>Some files were not selected</MessageBarTitle>
              <ul className={styles.results}>
                {pickerRejected.map((item, index) => (
                  <li key={`${item.name}-${index}`}>{item.name} — {item.reason}</li>
                ))}
              </ul>
            </MessageBarBody>
          </MessageBar>
        )}
      </section>

      {uploading && (
        <div role="status" aria-live="polite">
          <Text>Adding {files.length} file{files.length === 1 ? '' : 's'}…</Text>
          <ProgressBar />
        </div>
      )}

      {topLevelMessage && (
        <MessageBar intent="error" role="alert" aria-live="assertive">
          <MessageBarBody>
            <MessageBarTitle>We could not confirm the files</MessageBarTitle>
            {topLevelMessage}
          </MessageBarBody>
        </MessageBar>
      )}

      {result && result.rejected.length > 0 && (
        <MessageBar intent="error" role="alert" aria-live="assertive">
          <MessageBarBody>
            <MessageBarTitle>
              {result.added.length > 0 ? 'Some files still need to be added' : 'The files were not added'}
            </MessageBarTitle>
            <ul className={styles.results}>
              {result.rejected.map((item) => (
                <li key={`rejected-${item.fileIndex}`}>
                  {resultFileLabel(files, item.fileIndex, item.fileName)} — {item.reason}
                </li>
              ))}
            </ul>
            {result.added.length > 0 && (
              <Caption1>{result.added.length} file{result.added.length === 1 ? '' : 's'} already added. Retry is safe.</Caption1>
            )}
          </MessageBarBody>
        </MessageBar>
      )}

      <Button
        className={styles.submit}
        appearance="primary"
        icon={<Paperclip size={16} />}
        disabled={!selected || files.length === 0 || uploading}
        onClick={() => void attach()}
      >
        {uploading ? 'Adding files…' : selected ? `Add to ${selected.vrm || selected.casePo || 'case'}` : 'Add to case'}
      </Button>
    </div>
  );
}

export default AddEvidence;
