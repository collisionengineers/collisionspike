import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  SearchBox,
  Spinner,
  Switch,
  Tab,
  TabList,
  Tag,
  TagGroup,
  Text,
  Toast,
  ToastBody,
  ToastTitle,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
  useToastController,
  type SelectTabData,
  type SelectTabEvent,
} from '@fluentui/react-components';
import {
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  FileDiff,
  KeyRound,
  Mail,
  MapPin,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Panel, SectionHeading, ErrorState, GLOBAL_TOASTER_ID } from '../components';
import { useIsSuperuser } from '../components/useIsSuperuser';
import { ProviderListSkeleton } from '../components/Skeletons';
import {
  useProviders,
  useInspectionAddressCounts,
  useHoldNewCasesDefault,
  getDataAccess,
  type InspectionLocationPolicy,
  type Provider,
  type ProviderAutomationMode,
} from '../data';
// ProviderApiKey (TKT-055/ADR-0020) is not in the data barrel's explicit re-export list —
// take it straight from the shared contract package (same source the data barrel re-exports).
import type { ProviderApiKey } from '@cs/domain';

/* ============================================================
   Provider settings (nav label "Provider settings", route /admin).

   The working surface is the Work providers tab: search, an
   Active/Archived/All filter, and inline editing of each provider's
   email-domain list (drives provider matching), inspection-location policy
   (drives the address gate), and automation mode (only review-auto honored in
   M1), plus the provider API-intake keys (TKT-055/ADR-0020). Saving a provider
   PATCHes the live Postgres corpus through the Data API (Superuser only); there
   is no Dataverse in the live Azure stack — the prior Power Platform build was
   decommissioned (see CLAUDE.md).

   Two supporting tabs are honest, intentional product states:
     • Reference data — read-only summaries (with seeded counts) of the
       Repairer / Image-source / Inspection-address tables, which are managed
       elsewhere and not editable here in M1.
     • Assisted import — a preview of how draft provider records would be
       proposed from the Principals / Garages sheets for management to review.
       Importing isn't wired yet; the sample diff is illustrative.

   Brand: var(--ce-red) is the only red; never the print brand red.
   ============================================================ */

const POLICY_OPTIONS: { value: InspectionLocationPolicy; label: string; hint: string }[] = [
  {
    value: 'prefer_address',
    label: 'Prefer address',
    hint: 'Default for unknown providers — attempt a physical address; image-based only with a reviewer decision + reason.',
  },
  {
    value: 'required_address',
    label: 'Required address',
    hint: 'Physical address expected; image-based only by Management override (audited, with a reason).',
  },
  {
    value: 'always_image_based',
    label: 'Always image-based',
    hint: 'Image-based by policy — still requires an explicit reviewer decision + reason (never silent).',
  },
];

const AUTOMATION_OPTIONS: { value: ProviderAutomationMode; label: string; hint: string }[] = [
  { value: 'manual', label: 'Manual', hint: 'No automation — every step is staff-driven.' },
  {
    value: 'review_auto',
    label: 'Review-auto',
    hint: 'Read and sort incoming cases automatically, then a person reviews them. The only mode in use.',
  },
  { value: 'full_auto', label: 'Full-auto', hint: 'Not in use yet.' },
];

const POLICY_LABEL: Record<InspectionLocationPolicy, string> = {
  prefer_address: 'Prefer address',
  required_address: 'Required address',
  always_image_based: 'Always image-based',
};
const AUTOMATION_LABEL: Record<ProviderAutomationMode, string> = {
  manual: 'Manual',
  review_auto: 'Review-auto',
  full_auto: 'Full-auto',
};

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  tabs: { marginTop: `-${tokens.spacingVerticalS}` },
  /* Layout only — border / radius / background / padding come from <Panel>. */
  intakePanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    maxWidth: '640px',
  },

  /* ----- "what works here" framing line above the toolbar ----- */
  workingNote: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },

  /* ----- providers toolbar (search + segmented filter + counts) ----- */
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
  },
  search: { width: '280px', maxWidth: '40vw' },
  segment: { marginLeft: `-${tokens.spacingHorizontalXS}` },
  toolbarSpacer: { flex: 1 },
  counts: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },

  /* ----- collapsed Accordion row (the scannable provider summary) ----- */
  accordion: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  acItem: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  rowSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    width: '100%',
  },
  rowName: {
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    fontSize: tokens.fontSizeBase300,
    color: 'var(--ce-ink)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
  rowSpacer: { flex: 1 },
  rowLastUsed: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
    minWidth: '92px',
    justifyContent: 'flex-end',
  },
  // "No domain" marker — a data-quality warning, not a blocker. Uses
  // --ce-warning-text (#8a5a00), NOT --ce-warning-line, which fails the 3:1
  // non-text graphics contrast floor on white (pigment ruling).
  noDomainDot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--ce-warning-text)',
    flexShrink: 0,
  },
  panelInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
  },
  showMore: { alignSelf: 'center', marginTop: tokens.spacingVerticalS },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: tokens.spacingHorizontalL,
  },
  provName: {
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    fontSize: tokens.fontSizeBase400,
    color: 'var(--ce-ink)',
  },
  code: {
    fontFamily: 'var(--ce-font-mono)',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground2,
  },
  domains: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  domainAdd: { display: 'flex', gap: tokens.spacingHorizontalXS, alignItems: 'flex-end' },

  /* ----- Provider API keys (TKT-055 / ADR-0020) ----- */
  keySection: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  keyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  keyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  keyPrefixMono: {
    fontFamily: 'var(--ce-font-mono)',
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
  },
  keyMeta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, whiteSpace: 'nowrap' },
  keyRowSpacer: { flex: 1 },
  /* One-time plaintext reveal — a distinct, attention-drawing surface. */
  plaintextValue: {
    fontFamily: 'var(--ce-font-mono)',
    wordBreak: 'break-all',
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  fieldHint: { color: tokens.colorNeutralForeground3 },
  cardActions: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', marginTop: 'auto' },
  spacer: { flex: 1 },

  readonlyIntro: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  /* Layout only — border / radius / background / padding come from <Panel>. */
  readonlyPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  readonlyHead: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  readonlyCount: {
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalXS,
  },
  readonlyCountNum: {
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    fontSize: tokens.fontSizeHero700,
    lineHeight: '1',
    color: 'var(--ce-ink)',
  },
  readonlyCountUnit: { color: tokens.colorNeutralForeground3 },
  /* Confirmed/suggested split sub-line under the inspection-address count. */
  splitLine: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  /* "Suggested" tint chip — distinct from the confirmed brand look. */
  suggestedChip: {
    backgroundColor: '#fef3c7',
    color: '#7a4f01',
    border: '1px solid #e3c062',
  },

  /* A distinct dashed, fill-less surface (NOT the shared <Panel> card, which has
     a solid hairline + Background1 fill) — the assisted-import preview reads as a
     placeholder drop-zone, so it keeps its own block. */
  importPanel: {
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  diffRow: {
    display: 'grid',
    gridTemplateColumns: '90px 1fr',
    gap: tokens.spacingHorizontalM,
    fontSize: tokens.fontSizeBase200,
    fontFamily: 'var(--ce-font-mono)',
  },
  diffAdd: { color: 'var(--ce-success)' },
  diffKey: { color: tokens.colorNeutralForeground3 },
});

type AdminTab = 'providers' | 'read-only' | 'import' | 'intake';
type ProviderFilter = 'all' | 'active' | 'archived';

/** How many rows to render before the "show more" cap (keeps the DOM bounded). */
const PAGE = 50;

export function Admin() {
  const styles = useStyles();
  const [tab, setTab] = useState<AdminTab>('providers');
  const { data, loading, error, refetch } = useProviders();

  return (
    <div className={mergeClasses('ce-enter', styles.root)}>
      <SectionHeading
        eyebrow="Admin"
        heading="Provider settings"
        subtitle="Manage the work providers that drive email matching and the address gate. Reference lists and assisted import are shown alongside for context."
      />

      <TabList
        className={styles.tabs}
        selectedValue={tab}
        onTabSelect={(_: SelectTabEvent, d: SelectTabData) => setTab(d.value as AdminTab)}
        aria-label="Admin sections"
      >
        <Tab value="providers" icon={<Building2 size={16} />}>
          Work providers
        </Tab>
        <Tab value="read-only" icon={<Database size={16} />}>
          Reference data
        </Tab>
        <Tab value="import" icon={<FileDiff size={16} />}>
          Assisted import
        </Tab>
        <Tab value="intake" icon={<Settings size={16} />}>
          Intake settings
        </Tab>
      </TabList>

      {tab === 'providers' &&
        (loading && data === undefined ? (
          <ProviderListSkeleton rows={8} />
        ) : error && data === undefined ? (
          <ErrorState error={error} onRetry={refetch} title="Couldn’t load the work providers" />
        ) : (data?.length ?? 0) === 0 ? (
          <MessageBar intent="info">
            <MessageBarBody>No work providers yet.</MessageBarBody>
          </MessageBar>
        ) : (
          <ProvidersTab providers={data!} onProvidersChanged={refetch} />
        ))}

      {tab === 'read-only' && <ReadOnlyCorpora />}
      {tab === 'import' && <ImportPreview />}
      {tab === 'intake' && <IntakeSettings />}
    </div>
  );
}

/* ----------  Intake settings: the functional hold-by-default toggle  ----------
   The ONE Admin control that writes live — it upserts the
   cr1bd_HOLD_NEW_CASES_BY_DEFAULT environment variable; every other Admin edit
   stages locally. Needs env-var customization privilege; a permission failure
   surfaces as an honest error toast rather than pretending it saved. */
function IntakeSettings() {
  const styles = useStyles();
  const { data, loading, refetch } = useHoldNewCasesDefault();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);
  const [saving, setSaving] = useState(false);
  const current = data ?? false;

  const onToggle = async (next: boolean) => {
    setSaving(true);
    try {
      await getDataAccess().setHoldNewCasesDefault(next);
      refetch();
      dispatchToast(
        <Toast>
          <ToastTitle>
            {next ? 'New cases will be held by default' : 'New cases will not be held by default'}
          </ToastTitle>
        </Toast>,
        { intent: 'success' },
      );
    } catch (e) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t save — you may not have permission to change environment variables</ToastTitle>
          <ToastBody>{e instanceof Error ? e.message : String(e)}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className={styles.intakePanel}>
      <Switch
        checked={current}
        disabled={loading || saving}
        label="Put new manually-created cases on hold by default"
        onChange={(_, d) => onToggle(!!d.checked)}
      />
      <Caption1 className={styles.fieldHint}>
        When on, a case created from the New-case screen is parked in the Held queue for a reviewer to
        release. Saved live to the cr1bd_HOLD_NEW_CASES_BY_DEFAULT environment variable.
      </Caption1>
    </Panel>
  );
}

/* ----------  Providers tab: search + Active/Archived filter + Accordion rows  ---------- */

function ProvidersTab({
  providers,
  onProvidersChanged,
}: {
  providers: Provider[];
  /** Re-pull the corpus after a successful provider save (reflects the persisted row). */
  onProvidersChanged: () => void;
}) {
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProviderFilter>('active'); // default to the working set
  const [limit, setLimit] = useState(PAGE);

  const activeCount = useMemo(() => providers.filter((p) => p.active).length, [providers]);
  const archivedCount = providers.length - activeCount;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers.filter((p) => {
      if (filter === 'active' && !p.active) return false;
      if (filter === 'archived' && p.active) return false;
      if (q) {
        const hay = [p.displayName, p.principalCode, ...p.knownEmailDomains]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [providers, search, filter]);

  // Reset the visible cap whenever the filter/search narrows the set.
  useEffect(() => setLimit(PAGE), [search, filter]);

  const shown = filtered.slice(0, limit);

  return (
    <>
      <Caption1 className={styles.workingNote}>
        <CheckCircle2 size={13} aria-hidden />
        Search, filter, and edit each provider's domains, policy, and automation mode below. Saving a
        provider writes the change straight away (superuser only).
      </Caption1>

      <div className={styles.toolbar} role="search">
        <SearchBox
          className={styles.search}
          placeholder="Search name, principal code, domain…"
          value={search}
          onChange={(_e, d) => setSearch(d.value)}
          aria-label="Search providers"
        />
        <TabList
          className={styles.segment}
          selectedValue={filter}
          onTabSelect={(_e, d) => setFilter(d.value as ProviderFilter)}
          size="small"
          aria-label="Filter by status"
        >
          <Tab value="active">Active ({activeCount})</Tab>
          <Tab value="archived">Archived ({archivedCount})</Tab>
          <Tab value="all">All ({providers.length})</Tab>
        </TabList>
        <span className={styles.toolbarSpacer} />
        <Caption1 className={styles.counts}>
          showing {shown.length} of {filtered.length}
        </Caption1>
      </div>

      {filtered.length === 0 ? (
        <MessageBar intent="info">
          <MessageBarBody>No providers match the current search / filter.</MessageBarBody>
        </MessageBar>
      ) : (
        <>
          <Accordion collapsible multiple className={styles.accordion}>
            {shown.map((p) => (
              <AccordionItem value={p.id} key={p.id} className={styles.acItem}>
                <AccordionHeader expandIconPosition="end" icon={<Building2 size={18} />}>
                  <ProviderRowSummary provider={p} />
                </AccordionHeader>
                <AccordionPanel>
                  <div className={styles.panelInner}>
                    <ProviderEditor provider={p} onSaved={onProvidersChanged} />
                  </div>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
          {filtered.length > shown.length && (
            <Button
              className={styles.showMore}
              appearance="secondary"
              onClick={() => setLimit((n) => n + PAGE)}
            >
              Show {Math.min(PAGE, filtered.length - shown.length)} more
            </Button>
          )}
        </>
      )}
    </>
  );
}

/* ----------  Collapsed row summary (scannable; no editing)  ---------- */

function ProviderRowSummary({ provider }: { provider: Provider }) {
  const styles = useStyles();
  const domainCount = provider.knownEmailDomains.length;
  return (
    <span className={styles.rowSummary}>
      <span className={styles.rowName}>{provider.displayName || 'Unnamed provider'}</span>
      <span className={mergeClasses(styles.code, styles.rowMeta)}>{provider.principalCode}</span>
      <Badge
        appearance={provider.active ? 'filled' : 'outline'}
        color={provider.active ? 'success' : 'subtle'}
        shape="rounded"
        size="small"
      >
        {provider.active ? 'Active' : 'Archived'}
      </Badge>
      <span className={styles.rowSpacer} />
      <Tooltip content="Not tracked yet" relationship="label">
        <Caption1 className={styles.rowLastUsed}>
          <Clock size={12} aria-hidden />
          Last used —
        </Caption1>
      </Tooltip>
      {domainCount === 0 ? (
        <Tooltip content="No email domains — won't be matched to incoming emails automatically" relationship="label">
          <span className={styles.rowMeta}>
            <span className={styles.noDomainDot} aria-hidden />
            no domains
          </span>
        </Tooltip>
      ) : (
        <Caption1 className={styles.rowMeta}>
          {domainCount} domain{domainCount === 1 ? '' : 's'}
        </Caption1>
      )}
    </span>
  );
}

/* ----------  Editable WorkProvider editor (edits kept in local state)  ---------- */

function ProviderEditor({ provider, onSaved }: { provider: Provider; onSaved: () => void }) {
  const styles = useStyles();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const [draft, setDraft] = useState<Provider>(provider);
  const [newDomain, setNewDomain] = useState('');
  const [saving, setSaving] = useState(false);
  // Re-seed when the underlying corpus row changes (e.g. after refetch).
  useEffect(() => setDraft(provider), [provider]);

  const dirty =
    draft.providerAutomationMode !== provider.providerAutomationMode ||
    JSON.stringify(draft.knownEmailDomains) !== JSON.stringify(provider.knownEmailDomains);

  const addDomain = () => {
    const d = newDomain.trim().toLowerCase();
    if (!d || draft.knownEmailDomains.includes(d)) return;
    setDraft((p) => ({ ...p, knownEmailDomains: [...p.knownEmailDomains, d] }));
    setNewDomain('');
  };
  const removeDomain = (d: string) =>
    setDraft((p) => ({ ...p, knownEmailDomains: p.knownEmailDomains.filter((x) => x !== d) }));

  // Persist the two server-writable fields (principal code is immutable; the
  // address policy is staged-only in M1). A failed save keeps the editor open with
  // the draft intact and surfaces the real error — never a fake success.
  const save = async () => {
    setSaving(true);
    try {
      await getDataAccess().updateProvider(provider.id, {
        providerAutomationMode: draft.providerAutomationMode,
        knownEmailDomains: draft.knownEmailDomains,
      });
      dispatchToast(
        <Toast>
          <ToastTitle>Provider saved</ToastTitle>
          <ToastBody>Sender domains and handling mode were saved.</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
      onSaved(); // re-pull the corpus so the row reflects the persisted values
    } catch (e) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t save — you may not have permission to edit providers</ToastTitle>
          <ToastBody>{e instanceof Error ? e.message : String(e)}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setSaving(false);
    }
  };

    return (
      <>
      <Field label="Display name">
        <Input
          value={draft.displayName}
          readOnly
          disabled
        />
      </Field>

      <Field
        label="Principal code"
        hint="Locked — used to build the Case/PO. Changing it would break references."
      >
        <Input className={styles.code} value={draft.principalCode} readOnly disabled />
      </Field>

      <Field label="Default mailbox">
        <Input
          contentBefore={<Mail size={14} />}
          value={draft.defaultMailbox}
          readOnly
          disabled
        />
      </Field>

      <Field
        label="Known email domains"
        hint="Exact domain match only (after the @) — no aliasing. A domain mapping to >1 active provider is ambiguous and never auto-picks."
      >
        <div className={styles.domains}>
          {draft.knownEmailDomains.length > 0 ? (
            <TagGroup
              onDismiss={(_, d) => removeDomain(String(d.value))}
              aria-label="Known email domains"
            >
              {draft.knownEmailDomains.map((d) => (
                <Tag key={d} value={d} dismissible dismissIcon={{ 'aria-label': `Remove ${d}` }}>
                  {d}
                </Tag>
              ))}
            </TagGroup>
          ) : (
            <Caption1 className={styles.fieldHint}>No email domains — won't be matched to incoming emails automatically.</Caption1>
          )}
          <div className={styles.domainAdd}>
            <Input
              value={newDomain}
              aria-label="Add an email domain"
              onChange={(_, d) => setNewDomain(d.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDomain();
                }
              }}
            />
            <Button appearance="secondary" onClick={addDomain} disabled={!newDomain.trim()}>
              Add
            </Button>
          </div>
        </div>
      </Field>

      <ProviderApiKeys provider={provider} />

      <Field label="Inspection-location policy">
        <Dropdown
          value={POLICY_LABEL[draft.inspectionLocationPolicy]}
          selectedOptions={[draft.inspectionLocationPolicy]}
          disabled
        >
          {POLICY_OPTIONS.map((o) => (
            <Option key={o.value} value={o.value} text={o.label}>
              {o.label}
            </Option>
          ))}
        </Dropdown>
      </Field>
      <Caption1 className={styles.fieldHint}>
        {POLICY_OPTIONS.find((o) => o.value === draft.inspectionLocationPolicy)?.hint}
      </Caption1>

        <Field label="Handling mode">
          <Dropdown
          value={AUTOMATION_LABEL[draft.providerAutomationMode]}
          selectedOptions={[draft.providerAutomationMode]}
          onOptionSelect={(_, d) =>
            d.optionValue &&
            setDraft((p) => ({
              ...p,
              providerAutomationMode: d.optionValue as ProviderAutomationMode,
            }))
          }
        >
          {AUTOMATION_OPTIONS.map((o) => (
            <Option key={o.value} value={o.value} text={o.label}>
              {o.label}
            </Option>
          ))}
        </Dropdown>
      </Field>
      <Caption1 className={styles.fieldHint}>
        {AUTOMATION_OPTIONS.find((o) => o.value === draft.providerAutomationMode)?.hint}
      </Caption1>

        <Switch
          checked={draft.active}
          label="Active (eligible for domain matching)"
          disabled
        />

      <div className={styles.cardActions}>
        <Button
          appearance="primary"
          icon={saving ? <Spinner size="tiny" /> : <ShieldCheck size={16} />}
          onClick={() => void save()}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {dirty && !saving && (
          <Button appearance="secondary" onClick={() => setDraft(provider)}>
            Discard
          </Button>
        )}
        <span className={styles.spacer} />
        {!dirty && (
          <Caption1 className={styles.fieldHint}>
            <CheckCircle2
              size={13}
              style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}
            />
            No unsaved changes
          </Caption1>
        )}
      </div>
    </>
  );
}

/* ----------  Provider API-intake keys (TKT-055 / ADR-0020)  ----------
   The Superuser surface for the machine-to-machine intake channel: list a provider's
   keys, mint a new one (the plaintext secret is shown ONCE — never stored, never
   recoverable), and revoke. Superuser-gated (useIsSuperuser) exactly like the delete-case
   flow; the server is the real authority (the routes 403 a non-Superuser regardless). */

function fmtKeyDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function ProviderApiKeys({ provider }: { provider: Provider }) {
  const styles = useStyles();
  const isSuperuser = useIsSuperuser();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const [keys, setKeys] = useState<ProviderApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [minting, setMinting] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const refresh = async () => {
    const api = getDataAccess();
    if (!api.listProviderApiKeys) return;
    setLoading(true);
    try {
      setKeys(await api.listProviderApiKeys(provider.id));
    } catch {
      /* a failed read leaves the (possibly stale) list; the mint/revoke toasts carry errors */
    } finally {
      setLoading(false);
    }
  };

  // Load only for a Superuser — the GET is Superuser-only server-side, so a non-Superuser
  // read would 403; a plain reviewer sees the "Superuser only" hint instead.
  useEffect(() => {
    if (isSuperuser) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id, isSuperuser]);

  const openMint = () => {
    setLabel('');
    setPlaintext(null);
    setDialogOpen(true);
  };

  const mint = async () => {
    const api = getDataAccess();
    if (!api.createProviderApiKey || !label.trim()) return;
    setMinting(true);
    try {
      const res = await api.createProviderApiKey(provider.id, { label: label.trim() });
      setPlaintext(res.plaintextKey); // shown ONCE — the dialog stays open on this reveal
      void refresh();
    } catch (e) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t create the key — you may not have permission</ToastTitle>
          <ToastBody>{e instanceof Error ? e.message : String(e)}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setMinting(false);
    }
  };

  const copyPlaintext = async () => {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      dispatchToast(
        <Toast>
          <ToastTitle>Key copied to the clipboard</ToastTitle>
        </Toast>,
        { intent: 'success' },
      );
    } catch {
      /* clipboard may be blocked — the value is still visible for a manual copy */
    }
  };

  const revoke = async (keyId: string) => {
    const api = getDataAccess();
    if (!api.revokeProviderApiKey) return;
    setRevoking(keyId);
    try {
      await api.revokeProviderApiKey(provider.id, keyId);
      dispatchToast(
        <Toast>
          <ToastTitle>Key revoked</ToastTitle>
        </Toast>,
        { intent: 'success' },
      );
      void refresh();
    } catch (e) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t revoke the key</ToastTitle>
          <ToastBody>{e instanceof Error ? e.message : String(e)}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Field
      label="API keys"
      hint="Keys let this provider’s own system lodge cases directly over the API (instead of email). The secret is shown once at creation and can’t be retrieved later."
    >
      <div className={styles.keySection}>
        {!isSuperuser ? (
          <Caption1 className={styles.fieldHint}>
            <KeyRound size={13} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} />
            Superuser only — sign in with a Superuser account to manage API keys.
          </Caption1>
        ) : (
          <>
            {loading && keys.length === 0 ? (
              <Caption1 className={styles.fieldHint}>Loading keys…</Caption1>
            ) : keys.length === 0 ? (
              <Caption1 className={styles.fieldHint}>No API keys yet.</Caption1>
            ) : (
              <div className={styles.keyList}>
                {keys.map((k) => (
                  <div key={k.id} className={styles.keyRow}>
                    <Text weight="semibold">{k.label || 'Unnamed key'}</Text>
                    <span className={styles.keyPrefixMono}>{k.keyPrefix}…</span>
                    {k.revokedAt ? (
                      <Badge appearance="tint" color="danger" shape="rounded" size="small">
                        Revoked
                      </Badge>
                    ) : (
                      <Badge appearance="filled" color="success" shape="rounded" size="small">
                        Active
                      </Badge>
                    )}
                    <span className={styles.keyRowSpacer} />
                    <Caption1 className={styles.keyMeta}>
                      created {fmtKeyDate(k.createdAt)} · last used {fmtKeyDate(k.lastUsedAt)}
                    </Caption1>
                    {!k.revokedAt && (
                      <Tooltip content="Revoke this key" relationship="label">
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={revoking === k.id ? <Spinner size="tiny" /> : <Trash2 size={14} />}
                          disabled={revoking === k.id}
                          onClick={() => void revoke(k.id)}
                          aria-label={`Revoke ${k.label || 'key'}`}
                        />
                      </Tooltip>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Button appearance="secondary" icon={<Plus size={16} />} onClick={openMint}>
              Generate new key
            </Button>
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(_, d) => setDialogOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {plaintext ? 'Copy your new API key now' : 'Generate a new API key'}
            </DialogTitle>
            <DialogContent>
              {plaintext ? (
                <div className={styles.keySection}>
                  <MessageBar intent="warning">
                    <MessageBarBody>
                      <MessageBarTitle>This is the only time the key is shown</MessageBarTitle>
                      Copy it now and store it securely. It cannot be retrieved again — if it’s
                      lost, revoke it and generate a new one.
                    </MessageBarBody>
                  </MessageBar>
                  <div className={styles.plaintextValue}>{plaintext}</div>
                  <Button appearance="primary" icon={<Copy size={16} />} onClick={() => void copyPlaintext()}>
                    Copy key
                  </Button>
                </div>
              ) : (
                <Field label="Label" hint="A name to recognise this key by (e.g. ‘Production integration’).">
                  <Input
                    value={label}
                    onChange={(_, d) => setLabel(d.value)}
                    placeholder="Production integration"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && label.trim() && !minting) {
                        e.preventDefault();
                        void mint();
                      }
                    }}
                  />
                </Field>
              )}
            </DialogContent>
            <DialogActions>
              {plaintext ? (
                <Button appearance="primary" onClick={() => setDialogOpen(false)}>
                  Done
                </Button>
              ) : (
                <>
                  <Button appearance="secondary" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    appearance="primary"
                    icon={minting ? <Spinner size="tiny" /> : <KeyRound size={16} />}
                    disabled={!label.trim() || minting}
                    onClick={() => void mint()}
                  >
                    {minting ? 'Generating…' : 'Generate'}
                  </Button>
                </>
              )}
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </Field>
  );
}

/* ----------  Reference data: read-only summaries of the supporting tables  ----------
   These reference tables are loaded and maintained OUTSIDE this screen; M1 surfaces
   an honest summary, not editable rows or a live count. The figures are the
   last-loaded reference totals, so the copy frames them as "last loaded"
   approximations ("~") rather than implying this screen runs a live query. The
   inspection-address card is the exception: it reads a live confirmed/suggested
   split through the data seam (see InspectionAddressCard). */

const REFERENCE_TABLES: {
  icon: typeof Wrench;
  title: string;
  approxCount: number;
  unit: string;
  description: string;
}[] = [
  {
    icon: Wrench,
    title: 'Repairers',
    approxCount: 61,
    unit: 'repairers',
    description: 'Approved repair sites linked to work providers — used when resolving where a vehicle is held.',
  },
  {
    icon: Mail,
    title: 'Image sources',
    approxCount: 23,
    unit: 'sources',
    description: 'Garage and WhatsApp groups that send in photos — used to attribute inbound images to a case.',
  },
];

function ReadOnlyCorpora() {
  const styles = useStyles();
  return (
    <div className={styles.readonlyIntro}>
      <Caption1 className={styles.fieldHint}>
        Reference lists that support intake. Loaded and maintained separately — this screen shows the
        last-loaded totals for context, not a live count.
      </Caption1>
      <div className={styles.grid}>
        {REFERENCE_TABLES.map((it) => (
          <Panel key={it.title} className={styles.readonlyPanel}>
            <span className={styles.readonlyHead}>
              <it.icon size={18} aria-hidden />
              <Text className={styles.provName}>{it.title}</Text>
              <Badge appearance="outline" color="subtle" shape="rounded" size="small">
                Last loaded
              </Badge>
            </span>
            <span className={styles.readonlyCount}>
              <Text className={styles.readonlyCountNum}>~{it.approxCount}</Text>
              <Caption1 className={styles.readonlyCountUnit}>{it.unit}</Caption1>
            </span>
            <Caption1 className={styles.fieldHint}>{it.description}</Caption1>
          </Panel>
        ))}
        {/* Inspection addresses — a LIVE confirmed/suggested split via the seam. */}
        <InspectionAddressCard />
      </div>
    </div>
  );
}

/* ----------  Inspection addresses: a LIVE confirmed/suggested split  ----------
   Unlike the static reference cards above, this reads the corpus through the data
   seam and splits the total into CONFIRMED locations and low-confidence
   SUGGESTIONS (catalogue rows a reviewer must confirm before use), so the number
   is honest and never implies the suggestions are confirmed addresses. The empty
   default seam returns 0/0 until the corpus table is wired at deploy time. */

function InspectionAddressCard() {
  const styles = useStyles();
  const { data, loading } = useInspectionAddressCounts();
  const confirmed = data?.confirmed ?? 0;
  const suggested = data?.suggested ?? 0;

  return (
    <Panel className={styles.readonlyPanel}>
      <span className={styles.readonlyHead}>
        <MapPin size={18} aria-hidden />
        <Text className={styles.provName}>Inspection addresses</Text>
        <Badge appearance="outline" color="subtle" shape="rounded" size="small">
          Live count
        </Badge>
      </span>
      <span className={styles.readonlyCount}>
        <Text className={styles.readonlyCountNum}>{loading && !data ? '—' : confirmed}</Text>
        <Caption1 className={styles.readonlyCountUnit}>confirmed</Caption1>
      </span>
      <span className={styles.splitLine}>
        <Badge appearance="tint" shape="rounded" size="small" className={styles.suggestedChip}>
          {loading && !data ? '—' : suggested} suggested
        </Badge>
        <span>candidates to confirm before use</span>
      </span>
      <Caption1 className={styles.fieldHint}>
        Known inspection locations, standardised by postcode — used to suggest an address for the EVA
        submission. Suggestions are never applied automatically.
      </Caption1>
    </Panel>
  );
}

/* ----------  Assisted import preview (sample, not yet wired)  ---------- */

function ImportPreview() {
  const styles = useStyles();
  return (
    <div className={styles.importPanel}>
      <MessageBar intent="info">
        <MessageBarBody>
          <MessageBarTitle>Assisted import — preview</MessageBarTitle>
          Assisted import drafts provider records from the Principals / Garages sheets so management
          can review each change before it goes live. This isn't available yet — when it is, you'll
          attach a sheet here to preview the proposed changes.
        </MessageBarBody>
      </MessageBar>

      <Tooltip content="Attaching a sheet isn't available yet" relationship="label">
        <span>
          <Button appearance="secondary" icon={<FileDiff size={16} />} disabled>
            Attach sheet (coming later)
          </Button>
        </span>
      </Tooltip>

      <Divider>Sample preview — illustrative only</Divider>

      <div>
        <Text className={styles.provName}>+ New work provider</Text>
        <div className={mergeClasses(styles.diffRow)} style={{ marginTop: 6 }}>
          <span className={styles.diffKey}>name</span>
          <span className={styles.diffAdd}>+ Halberd Legal LLP</span>
        </div>
        <div className={styles.diffRow}>
          <span className={styles.diffKey}>code</span>
          <span className={styles.diffAdd}>+ HALB</span>
        </div>
        <div className={styles.diffRow}>
          <span className={styles.diffKey}>domains</span>
          <span className={styles.diffAdd}>+ halberdlegal.co.uk</span>
        </div>
        <div className={styles.diffRow}>
          <span className={styles.diffKey}>policy</span>
          <span className={styles.diffAdd}>+ Prefer address</span>
        </div>
      </div>

      <Caption1 className={styles.fieldHint}>
        Management reviews each proposed change before any record goes live — an import never
        overwrites an approved record without a reason and an audit entry.
      </Caption1>
    </div>
  );
}

export default Admin;
