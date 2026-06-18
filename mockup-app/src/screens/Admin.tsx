import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Caption1,
  Divider,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  SearchBox,
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
  FileDiff,
  Mail,
  MapPin,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { SectionHeading, ErrorState, GLOBAL_TOASTER_ID } from '../components';
import { ProviderListSkeleton } from '../components/Skeletons';
import {
  useProviders,
  type InspectionLocationPolicy,
  type Provider,
  type ProviderAutomationMode,
} from '../data';

/* ============================================================
   Admin / corpus surface (Phase 1b, no prototype analog).

   View/edit the WorkProvider corpus — the email-domain list (drives
   Flow_ProviderMatch), inspectionLocationPolicy (drives the address gate),
   and providerAutomationMode (only review_auto honored in M1) — plus
   read-only stubs for the Repairer / ImageSource / InspectionAddress corpora
   (not modelled in the prototype yet, shown honestly as "not built").

   The "assisted import preview-diff" is a placeholder: parsing the
   Principals/Garages sheets into draft records is [BUILD]; activating corpus
   records is [DEPLOY-WITH-LOGIN] (Dataverse writes) and there is NO live
   SharePoint contact here.

   MOCK ONLY — edits live in local React state and never persist.
   Brand: --ce-red (#db0816) is the only red; never the print brand red.
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
    hint: 'Auto-parse + classify, then human review. The only mode honored in M1.',
  },
  { value: 'full_auto', label: 'Full-auto', hint: 'Reserved — not honored in M1.' },
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
  noDomainDot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--ce-red)',
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
  fieldHint: { color: tokens.colorNeutralForeground3 },
  cardActions: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', marginTop: 'auto' },
  spacer: { flex: 1 },

  readonlyPanel: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    padding: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  readonlyHead: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },

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

type AdminTab = 'providers' | 'read-only' | 'import';
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
        heading="Corpus administration"
        subtitle="Work-provider corpus and the assisted import preview — drafting only, no live sync."
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
        <Tab value="read-only" icon={<Wrench size={16} />}>
          Other corpora
        </Tab>
        <Tab value="import" icon={<FileDiff size={16} />}>
          Assisted import
        </Tab>
      </TabList>

      {tab === 'providers' &&
        (loading && data === undefined ? (
          <ProviderListSkeleton rows={8} />
        ) : error && data === undefined ? (
          <ErrorState error={error} onRetry={refetch} title="Couldn’t load the provider corpus" />
        ) : (data?.length ?? 0) === 0 ? (
          <MessageBar intent="info">
            <MessageBarBody>No work providers in the corpus yet.</MessageBarBody>
          </MessageBar>
        ) : (
          <ProvidersTab providers={data!} />
        ))}

      {tab === 'read-only' && <ReadOnlyCorpora />}
      {tab === 'import' && <ImportPreview />}
    </div>
  );
}

/* ----------  Providers tab: search + Active/Archived filter + Accordion rows  ---------- */

function ProvidersTab({ providers }: { providers: Provider[] }) {
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
          {activeCount} active · {archivedCount} archived · showing {shown.length} of {filtered.length}
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
                    <ProviderEditor provider={p} />
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
      {domainCount === 0 ? (
        <Tooltip content="No domains — this provider will never auto-match" relationship="label">
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

/* ----------  Editable WorkProvider editor (mock local state)  ---------- */

function ProviderEditor({ provider }: { provider: Provider }) {
  const styles = useStyles();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const [draft, setDraft] = useState<Provider>(provider);
  const [newDomain, setNewDomain] = useState('');
  // Re-seed when the underlying corpus row changes (e.g. after refetch).
  useEffect(() => setDraft(provider), [provider]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(provider);

  const addDomain = () => {
    const d = newDomain.trim().toLowerCase();
    if (!d || draft.knownEmailDomains.includes(d)) return;
    setDraft((p) => ({ ...p, knownEmailDomains: [...p.knownEmailDomains, d] }));
    setNewDomain('');
  };
  const removeDomain = (d: string) =>
    setDraft((p) => ({ ...p, knownEmailDomains: p.knownEmailDomains.filter((x) => x !== d) }));

  const save = () => {
    dispatchToast(
      <Toast>
        <ToastTitle>Draft saved (mock)</ToastTitle>
        <ToastBody>
          {draft.displayName} ({draft.principalCode}) — corpus activation is a Dataverse write, not
          done here.
        </ToastBody>
      </Toast>,
      { intent: 'success' },
    );
  };

  return (
    <>
      <Field label="Display name">
        <Input
          value={draft.displayName}
          onChange={(_, d) => setDraft((p) => ({ ...p, displayName: d.value }))}
        />
      </Field>

      <Field
        label="Principal code"
        hint="Locked — mints the Case/PO (UPPERCASE = Box, lowercase = EVA). Changing it would break references."
      >
        <Input className={styles.code} value={draft.principalCode} readOnly disabled />
      </Field>

      <Field label="Default mailbox">
        <Input
          contentBefore={<Mail size={14} />}
          value={draft.defaultMailbox}
          onChange={(_, d) => setDraft((p) => ({ ...p, defaultMailbox: d.value }))}
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
            <Caption1 className={styles.fieldHint}>No domains — provider will never auto-match.</Caption1>
          )}
          <div className={styles.domainAdd}>
            <Input
              value={newDomain}
              placeholder="acme.co.uk"
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

      <Field label="Inspection-location policy">
        <Dropdown
          value={POLICY_LABEL[draft.inspectionLocationPolicy]}
          selectedOptions={[draft.inspectionLocationPolicy]}
          onOptionSelect={(_, d) =>
            d.optionValue &&
            setDraft((p) => ({
              ...p,
              inspectionLocationPolicy: d.optionValue as InspectionLocationPolicy,
            }))
          }
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

      <Field label="Automation mode">
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
        onChange={(_, d) => setDraft((p) => ({ ...p, active: !!d.checked }))}
      />

      <div className={styles.cardActions}>
        <Button appearance="primary" icon={<ShieldCheck size={16} />} onClick={save} disabled={!dirty}>
          Save draft
        </Button>
        {dirty && (
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

/* ----------  Read-only stubs for the not-yet-modelled corpora  ---------- */

function ReadOnlyCorpora() {
  const styles = useStyles();
  const items: { icon: typeof Wrench; title: string; note: string }[] = [
    {
      icon: Wrench,
      title: 'Repairers',
      note: 'Repairer corpus (N:N with WorkProvider) is not modelled in this prototype yet — read-only placeholder.',
    },
    {
      icon: Mail,
      title: 'Image sources',
      note: 'ImageSource corpus (garage / WhatsApp groups that send photos) is not modelled yet — read-only placeholder.',
    },
    {
      icon: MapPin,
      title: 'Inspection addresses',
      note: 'InspectionAddress corpus (normalised via postcode.io; candidate ranking is M2) is not modelled yet — read-only placeholder.',
    },
  ];
  return (
    <div className={styles.grid}>
      {items.map((it) => (
        <div key={it.title} className={styles.readonlyPanel}>
          <span className={styles.readonlyHead}>
            <it.icon size={18} aria-hidden />
            <Text className={styles.provName}>{it.title}</Text>
            <Badge appearance="outline" color="subtle" shape="rounded" size="small">
              Read-only
            </Badge>
          </span>
          <Caption1 className={styles.fieldHint}>{it.note}</Caption1>
        </div>
      ))}
    </div>
  );
}

/* ----------  Assisted import preview-diff placeholder  ---------- */

function ImportPreview() {
  const styles = useStyles();
  return (
    <div className={styles.importPanel}>
      <MessageBar intent="info">
        <MessageBarBody>
          <MessageBarTitle>Assisted import — preview only</MessageBarTitle>
          Parsing the Principals / Garages sheets into draft records is [BUILD]. Activating corpus
          records is a Dataverse write [DEPLOY-WITH-LOGIN] — there is no live SharePoint contact
          here. The diff below is an illustrative sample.
        </MessageBarBody>
      </MessageBar>

      <Tooltip content="No source attached — this is a placeholder" relationship="label">
        <span>
          <Button appearance="secondary" icon={<FileDiff size={16} />} disabled>
            Attach Principals sheet (later)
          </Button>
        </span>
      </Tooltip>

      <Divider>Sample preview-diff</Divider>

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
          <span className={styles.diffAdd}>+ prefer_address</span>
        </div>
      </div>

      <Caption1 className={styles.fieldHint}>
        Management would review each diff before any record is activated — drafts never overwrite an
        approved record without a change-reason + audit.
      </Caption1>
    </div>
  );
}

export default Admin;
