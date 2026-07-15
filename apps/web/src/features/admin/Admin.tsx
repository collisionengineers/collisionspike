import { useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, Badge, Button, Caption1, Dropdown, Field, Input, MessageBar, MessageBarBody, Option, SearchBox, Spinner, Switch, Tab, TabList, Tag, TagGroup, Text, Toast, ToastBody, ToastTitle, Tooltip, mergeClasses, useToastController, type SelectTabData, type SelectTabEvent } from '@fluentui/react-components';
import { Building2, CheckCircle2, Clock, Database, FileDiff, Mail, MapPin, Settings, ShieldCheck } from 'lucide-react';
import { Panel, SectionHeading, ErrorState, GLOBAL_TOASTER_ID } from '../../shared/ui';
import { ProviderListSkeleton } from '../../shared/ui/Skeletons';
import { useProviders, useInspectionAddressCounts, useHoldNewCasesDefault, getDataAccess, type InspectionLocationPolicy, type Provider, type ProviderAutomationMode } from '../../data';
import { ProviderAccess } from './provider-access';

/* Provider settings lets authorised staff maintain work-provider matching and
   handling preferences. Supporting lists stay read-only on this screen. */

const POLICY_OPTIONS: { value: InspectionLocationPolicy; label: string; hint: string }[] = [
  {
    value: 'prefer_address',
    label: 'Prefer address',
    hint: 'Try to use a physical address. Image-based work still needs a reviewer decision and reason.',
  },
  {
    value: 'required_address',
    label: 'Required address',
    hint: 'A physical address is expected. Management can approve image-based work with a reason.',
  },
  {
    value: 'always_image_based',
    label: 'Always image-based',
    hint: 'Use images by default, with an explicit reviewer decision and reason.',
  },
];

const AUTOMATION_OPTIONS: { value: ProviderAutomationMode; label: string; hint: string }[] = [
  { value: 'manual', label: 'Staff review', hint: 'Staff complete every step.' },
  {
    value: 'review_auto',
    label: 'Prepared for review',
    hint: 'Incoming cases are prepared, then a person reviews them.',
  },
  { value: 'full_auto', label: 'Automatic handling', hint: 'Not available yet.' },
];

const POLICY_LABEL: Record<InspectionLocationPolicy, string> = {
  prefer_address: 'Prefer address',
  required_address: 'Required address',
  always_image_based: 'Always image-based',
};
const AUTOMATION_LABEL: Record<ProviderAutomationMode, string> = {
  manual: 'Staff review',
  review_auto: 'Prepared for review',
  full_auto: 'Automatic handling',
};
import { useStyles } from './admin.styles';
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
        subtitle="Manage work providers, how their emails are recognised, and how their cases are prepared."
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
          Supporting lists
        </Tab>
        <Tab value="import" icon={<FileDiff size={16} />}>
          Import providers
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

/* ----------  Intake settings: the functional hold-by-default toggle  ---------- */
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
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t save this preference</ToastTitle>
          <ToastBody>Ask a manager to check your access, then try again.</ToastBody>
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
        release. This becomes the default for future manually created cases.
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
        Search, filter, and edit each provider's sender domains and handling preferences below.
      </Caption1>

      <div className={styles.toolbar} role="search">
        <SearchBox
          className={styles.search}
          placeholder="Search name, Case/PO code, or email domain…"
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
         <Tooltip content="No email domains — incoming emails won't be matched to this provider" relationship="label">
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
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t save this provider</ToastTitle>
          <ToastBody>Ask a manager to check your access, then try again.</ToastBody>
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
        label="Case/PO code"
        hint="This code forms part of the Case/PO and cannot be changed here."
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
        hint="Add the part after the @. If two active providers share a domain, staff must choose the provider."
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
             <Caption1 className={styles.fieldHint}>No email domains — incoming emails won't be matched to this provider.</Caption1>
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

      <ProviderAccess provider={provider} />

      <Field label="Inspection location">
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

        <Field label="How new work is prepared">
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
          label="Active provider"
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


/* ----------  Supporting lists  ---------- */

function ReadOnlyCorpora() {
  const styles = useStyles();
  return (
    <div className={styles.readonlyIntro}>
      <Caption1 className={styles.fieldHint}>
        These lists support case intake. They are maintained elsewhere and cannot be changed here.
      </Caption1>
      <div className={styles.grid}>
        <Panel className={styles.readonlyPanel}>
          <span className={styles.readonlyHead}>
            <Building2 size={18} aria-hidden />
            <Text className={styles.provName}>Repairers</Text>
          </span>
          <Caption1 className={styles.fieldHint}>
            Approved repair sites linked to work providers. This list is managed elsewhere.
          </Caption1>
        </Panel>
        <Panel className={styles.readonlyPanel}>
          <span className={styles.readonlyHead}>
            <Mail size={18} aria-hidden />
            <Text className={styles.provName}>Image sources</Text>
          </span>
          <Caption1 className={styles.fieldHint}>
            Garages and groups that send case photos. This list is managed elsewhere.
          </Caption1>
        </Panel>
        <InspectionAddressCard />
      </div>
    </div>
  );
}

/* ----------  Inspection addresses: confirmed and suggested totals  ---------- */

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
          Current
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

/* ----------  Provider import  ---------- */

function ImportPreview() {
  const styles = useStyles();
  return (
    <div className={styles.importPanel}>
      <MessageBar intent="info">
        <MessageBarBody>
          Importing providers from a sheet isn't available yet.
        </MessageBarBody>
      </MessageBar>

      <Tooltip content="Attaching a sheet isn't available yet" relationship="label">
        <span>
          <Button appearance="secondary" icon={<FileDiff size={16} />} disabled>
            Choose a sheet
          </Button>
        </span>
      </Tooltip>
    </div>
  );
}

export default Admin;
