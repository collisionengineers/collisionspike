
import { Badge, Button, Caption1, Field, Input, Link, Menu, MenuItem, MenuItemRadio, MenuList, MenuPopover, MenuTrigger, MessageBar, MessageBarBody, MessageBarTitle, Spinner, Text, Toast, ToastTitle, Tooltip, mergeClasses } from '@fluentui/react-components';
import { AlertTriangle, ArrowLeft, CalendarClock, Check, CheckCircle2, ChevronDown, Clock, Download, FolderClosed, GitMerge, MoreHorizontal, Pencil, Send, Upload, Pause, Play, X } from 'lucide-react';
import { PipelineStrip, SectionHeading, StatusBadge, VrmPlate } from '../../shared/ui';
import { data } from '../../data';
import { INTAKE_CHANNEL_LABELS, type CaseWorkType } from '@cs/domain';
import { canCheckVehicleDetails } from './case-edit-session';
import { CASE_WORK_TYPE_LABELS } from './case-detail.controller';

import type { useCaseDetailController } from './case-detail.controller';

type CaseDetailViewModel = ReturnType<typeof useCaseDetailController>;

export function CaseDetailHeader(props: CaseDetailViewModel) {
  const { beginEditPo, beginEditVrm, blocked, blockerCount, c, canSaveEdits, cancelEditPo, cancelEditVrm, caseTypeOptions, caseVersion, checkVehicleAgain, checkingVehicle, currentCaseType, derivedAuditId, dispatchToast, due, editValidation, editingPo, editingVrm, exportingEva, focusFirstEditIssue, hasUnsavedChanges, invalidFieldCount, isRemoved, liveCase, markingDone, navigate, onExportForEva, onMarkReportDelivered, openRemove, poDraft, poShapeOk, readiness, reloadLatestForReconcile, saveCaseEdits, saveConflict, saveError, savePo, saveVrm, savingEdits, savingPo, savingVrm, setC, setCaseType, setDiscardOpen, setPoDraft, setVrmDraft, showCaseTypeControl, stageKey, styles, subtitle, titleText, toast, vehicleWarning, vrmCheck, vrmDraft, vrmEditBtnRef, vrmInputRef, workflowBlocked } = props;
  return       <div>
        <div className={styles.backRow}>
          <Link as="button" onClick={() => navigate('/')}>
            <span className={styles.backLink}>
              <ArrowLeft size={14} /> Dashboard
            </span>
          </Link>
        </div>

        <SectionHeading
          eyebrow={`Case · ${c.providerCode}`}
          heading={
            <span className={styles.titleLockup}>
              {editingVrm ? (
                <span className={styles.vrmEditRow} role="group" aria-label="Edit registration">
                  <Field
                    validationState={
                      vrmCheck.status === 'malformed'
                        ? 'warning'
                        : vrmCheck.status === 'empty'
                          ? 'error'
                          : 'none'
                    }
                    validationMessage={
                      vrmCheck.status === 'malformed'
                        ? 'Doesn’t look like a UK registration — save anyway if this is correct.'
                        : vrmCheck.status === 'empty'
                          ? 'Registration can’t be empty.'
                          : undefined
                    }
                  >
                    <Input
                      ref={vrmInputRef}
                      className={styles.vrmInput}
                      aria-label="Vehicle registration"
                      value={vrmDraft}
                      maxLength={16}
                      onChange={(_, d) => setVrmDraft(d.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void saveVrm();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEditVrm();
                        }
                      }}
                    />
                  </Field>
                  <Button
                    appearance="primary"
                    icon={savingVrm ? <Spinner size="tiny" /> : <Check size={16} />}
                    disabled={savingVrm || hasUnsavedChanges || vrmCheck.status === 'empty'}
                    onClick={() => void saveVrm()}
                  >
                    Save
                  </Button>
                  <Button
                    appearance="subtle"
                    icon={<X size={16} />}
                    disabled={savingVrm}
                    onClick={cancelEditVrm}
                  >
                    Cancel
                  </Button>
                </span>
              ) : (
                <span className={styles.vrmViewRow}>
                  <VrmPlate vrm={c.vrm} size="large" />
                  <Tooltip content="Edit registration" relationship="label">
                    <Button
                      ref={vrmEditBtnRef}
                      className="ce-vrm-edit-affordance"
                      appearance="subtle"
                      size="small"
                      icon={<Pencil size={14} />}
                      onClick={beginEditVrm}
                      disabled={hasUnsavedChanges}
                    />
                  </Tooltip>
                </span>
              )}
              {editingPo ? (
                <span className={styles.vrmEditRow}>
                  <Field
                    validationState={poDraft && !poShapeOk ? 'error' : 'none'}
                    validationMessage={
                      poDraft && !poShapeOk
                        ? 'Not a Case/PO shape (e.g. CCPY26050 or A.PCH261269).'
                        : undefined
                    }
                  >
                    <Input
                      aria-label="Case/PO"
                      value={poDraft}
                      maxLength={16}
                      placeholder="e.g. CCPY26050"
                      onChange={(_, d) => setPoDraft(d.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void savePo();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEditPo();
                        }
                      }}
                    />
                  </Field>
                  <Button
                    appearance="primary"
                    icon={savingPo ? <Spinner size="tiny" /> : <Check size={16} />}
                    disabled={savingPo || hasUnsavedChanges || !poShapeOk}
                    onClick={() => void savePo()}
                  >
                    Save
                  </Button>
                  <Button appearance="subtle" icon={<X size={16} />} disabled={savingPo} onClick={cancelEditPo}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <span className={styles.vrmViewRow}>
                  {/* TKT-118: a pre-mint case is identified by its REGISTRATION (the
                      plate to the left) — say so, rather than a bare "no number". */}
                  <span className={mergeClasses('ce-display', styles.titleText)}>
                    {titleText || 'No Case/PO yet — identified by registration'}
                  </span>
                  <Tooltip
                    content={c.casePo ? 'Correct the Case/PO' : 'Set the Case/PO (assigned at EVA-add)'}
                    relationship="label"
                  >
                    <Button
                      className="ce-vrm-edit-affordance"
                      appearance="subtle"
                      size="small"
                      icon={<Pencil size={14} />}
                      aria-label={c.casePo ? 'Correct the Case/PO' : 'Set the Case/PO'}
                      onClick={beginEditPo}
                      disabled={hasUnsavedChanges}
                    />
                  </Tooltip>
                </span>
              )}
            </span>
          }
          subtitle={subtitle || undefined}
          actions={
            <div className={styles.actions}>
              <Button appearance="secondary" icon={<Upload size={16} />} onClick={() => navigate('/evidence')}>
                Add evidence
              </Button>
              <Button
                appearance="secondary"
                icon={<GitMerge size={16} />}
                onClick={() => navigate(`/case/${c.id}/merge`)}
              >
                Merge…
              </Button>
              <Button
                appearance="secondary"
                icon={c.onHold ? <Play size={16} /> : <Pause size={16} />}
                onClick={async () => {
                  const next = !c.onHold;
                  try {
                    await data.setOnHold(c.id, next);
                    setC({ ...c, onHold: next });
                    toast(next ? 'Put on hold — moved to Held' : 'Released from hold');
                  } catch {
                    dispatchToast(
                      <Toast>
                        <ToastTitle>Couldn’t update hold — try again</ToastTitle>
                      </Toast>,
                      { intent: 'error' },
                    );
                  }
                }}
                disabled={hasUnsavedChanges}
              >
                {c.onHold ? 'Release' : 'Hold'}
              </Button>
              <Tooltip
                content={
                  hasUnsavedChanges
                    ? 'Save or discard changes before exporting'
                    : blocked
                    ? `Can't export yet — ${blockerCount} item(s) outstanding`
                    : 'Download one zip — the EVA file plus every included photo, in upload order'
                }
                relationship="label"
              >
                <Button
                  appearance="secondary"
                  icon={exportingEva ? <Spinner size="tiny" /> : <Download size={16} />}
                  disabled={blocked || isRemoved || exportingEva || hasUnsavedChanges}
                  onClick={() => void onExportForEva()}
                >
                  {exportingEva ? 'Exporting…' : 'Export for EVA'}
                </Button>
              </Tooltip>
              <Tooltip
                content={
                  hasUnsavedChanges
                    ? 'Save or discard changes before submitting'
                    : blocked
                      ? `Can't submit to EVA yet — ${blockerCount} item(s) outstanding`
                      : 'Submit this case to EVA'
                }
                relationship="label"
              >
                <Button
                  appearance="primary"
                  icon={<Send size={16} />}
                  disabled={blocked || isRemoved || hasUnsavedChanges}
                  onClick={() => navigate(`/case/${c.id}/submit`)}
                >
                  Submit to EVA
                </Button>
              </Tooltip>
              {/* TKT-095 thin slice: the delivery bridge — only an EVA-submitted case
                  can be marked delivered (Done). Primary action at this stage of the
                  lifecycle; the auto-detectors (Box report PDF, sent email) record it
                  without the click when they fire first. */}
              {c.status === 'eva_submitted' && (
                <Tooltip
                  content="Record that the report went back to the work provider"
                  relationship="label"
                >
                  <Button
                    appearance="primary"
                    icon={markingDone ? <Spinner size="tiny" /> : <CheckCircle2 size={16} />}
                    disabled={markingDone || hasUnsavedChanges}
                    onClick={() => void onMarkReportDelivered()}
                  >
                    {markingDone ? 'Recording…' : 'Mark report delivered'}
                  </Button>
                </Tooltip>
              )}
              {/* Close case (TKT-010) — all staff; tucked in the overflow menu so
                  it never crowds (or sits beside) the primary actions. */}
              {!isRemoved && (
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <Tooltip content="More actions" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<MoreHorizontal size={16} />}
                        aria-label="More actions"
                        disabled={hasUnsavedChanges}
                      />
                    </Tooltip>
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      <MenuItem icon={<FolderClosed size={16} />} onClick={openRemove}>
                        Close case…
                      </MenuItem>
                    </MenuList>
                  </MenuPopover>
                </Menu>
              )}
            </div>
          }
        />

        <div className={styles.titleTags}>
          <StatusBadge status={c.status} />
          {c.onHold && (
            <Badge appearance="filled" color="warning" shape="rounded">
              On hold
            </Badge>
          )}
          <Badge appearance="outline" color="informative" shape="rounded">
            {INTAKE_CHANNEL_LABELS[c.channel.kind] ?? 'Email'} · {c.channel.mode}
          </Badge>
          {/* Case-type control (TKT-057): the review-time refinement — notably
              audit → total-loss audit once the inspection outcome is known. */}
          {showCaseTypeControl && (
            <>
              <Menu
                checkedValues={{ caseType: [currentCaseType] }}
                onCheckedValueChange={(_e, d) => {
                  const next = d.checkedItems?.[0] as CaseWorkType | undefined;
                  if (next) void setCaseType(next);
                }}
              >
                <MenuTrigger disableButtonEnhancement>
                  <Tooltip
                    content="The kind of work this case is — a reviewer can refine it (e.g. an audit found to be a total loss)"
                    relationship="description"
                  >
                    <Button
                      appearance="outline"
                      size="small"
                      icon={<ChevronDown size={14} />}
                      iconPosition="after"
                      aria-label={`Case type: ${CASE_WORK_TYPE_LABELS[currentCaseType]}`}
                    >
                      {CASE_WORK_TYPE_LABELS[currentCaseType]}
                    </Button>
                  </Tooltip>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {caseTypeOptions.map((t) => (
                      <MenuItemRadio key={t} name="caseType" value={t}>
                        {CASE_WORK_TYPE_LABELS[t]}
                      </MenuItemRadio>
                    ))}
                  </MenuList>
                </MenuPopover>
              </Menu>
              {derivedAuditId && derivedAuditId !== (c.casePo ?? '').toUpperCase() && (
                <Tooltip
                  content="The audit reference — use this number on the EVA-side audit submission"
                  relationship="description"
                >
                  <Badge appearance="outline" shape="rounded" className={styles.derivedIdBadge}>
                    {derivedAuditId}
                  </Badge>
                </Tooltip>
              )}
            </>
          )}
          <span className={styles.metaChip}>
            <Clock size={13} strokeWidth={2} /> {c.ageDays}d old
          </span>
          {c.dateDue && (
            <span
              className={mergeClasses(
                styles.metaChip,
                due.tone === 'pastdue' ? styles.metaPastDue : due.tone === 'soon' ? styles.metaSoon : undefined,
              )}
            >
              {due.tone === 'pastdue' ? <AlertTriangle size={13} strokeWidth={2} /> : <CalendarClock size={13} strokeWidth={2} />}
              {due.dueText}
            </span>
          )}
        </div>

        {/* Slim pipeline progress spine — this case's stage, marked "you are here". */}
        <div className={styles.spine}>
          <PipelineStrip variant="spine" active={stageKey} />
        </div>
      </div>

      {isRemoved && (
        <MessageBar intent="info">
          <MessageBarBody>
            <MessageBarTitle>This case is closed</MessageBarTitle>
            It has left the work queues. Nothing was deleted — every detail is kept for the record.
          </MessageBarBody>
        </MessageBar>
      )}

      {vehicleWarning && !isRemoved && (
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>Vehicle details need attention</MessageBarTitle>
            {vehicleWarning}{' '}
            <Button
              appearance="transparent"
              size="small"
              disabled={!canCheckVehicleDetails(hasUnsavedChanges, checkingVehicle, c.vrm)}
              icon={checkingVehicle ? <Spinner size="tiny" /> : undefined}
              onClick={() => void checkVehicleAgain()}
            >
              {checkingVehicle ? 'Checking…' : 'Check again'}
            </Button>
          </MessageBarBody>
        </MessageBar>
      )}

      {blocked && !isRemoved && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Can't submit to EVA yet — {blockerCount} item{blockerCount === 1 ? '' : 's'}</MessageBarTitle>
            {liveCase.onHold
              ? readiness.missing.length > 0
                ? 'Release the hold and resolve the outstanding readiness items before submitting to EVA.'
                : 'Release the hold before submitting to EVA.'
              : workflowBlocked
                ? 'Finish the outstanding case decision so it can move to Review before submitting to EVA.'
              : 'Use the readiness list — each outstanding item links to the field to fix.'}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.saveBar} aria-live="polite">
        <div className={styles.saveBarMessage} role="status">
          <Text weight="semibold">
            {savingEdits
              ? 'Saving changes…'
              : saveError
                ? 'Changes not saved'
                : hasUnsavedChanges
                  ? 'Unsaved changes'
                  : 'No unsaved changes'}
          </Text>
          <Caption1 className={styles.hint}>
            {saveError ??
              (!caseVersion && hasUnsavedChanges
                ? 'Reload this case before saving your changes.'
                : invalidFieldCount > 0
                  ? `${invalidFieldCount} field${invalidFieldCount === 1 ? '' : 's'} need attention before saving.`
                  : hasUnsavedChanges
                    ? 'Review the changes, then save or discard them.'
                    : 'Edits only take effect after you save them.')}
          </Caption1>
        </div>
        <div className={styles.saveBarActions}>
          {saveConflict && (
            <Button
              appearance="secondary"
              disabled={savingEdits}
              onClick={() => void reloadLatestForReconcile()}
            >
              Reload latest
            </Button>
          )}
          {editValidation.length > 0 && (
            <Button appearance="subtle" onClick={focusFirstEditIssue}>
              Review fields
            </Button>
          )}
          <Button
            appearance="secondary"
            disabled={!hasUnsavedChanges || savingEdits}
            onClick={() => setDiscardOpen(true)}
          >
            Discard changes
          </Button>
          <Button
            appearance="primary"
            icon={savingEdits ? <Spinner size="tiny" /> : <Check size={16} />}
            disabled={!canSaveEdits}
            onClick={() => void saveCaseEdits()}
          >
            {savingEdits ? 'Saving…' : saveError && !saveConflict ? 'Try again' : 'Save changes'}
          </Button>
        </div>
      </div>;
}
