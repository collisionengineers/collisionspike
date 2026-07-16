
import { Badge, Button, Caption1, Checkbox, Divider, Dropdown, Field, Input, MessageBar, MessageBarBody, MessageBarTitle, Option, ProgressBar, Spinner, Text, Textarea, mergeClasses } from '@fluentui/react-components';
import { Car, FileText, Image as ImageIcon, MapPin, PencilLine, Send, Upload, X } from 'lucide-react';
import { EvaFieldRow, LABEL_FOR, Panel, ProvenanceBadge, SectionHeading, VrmPlate } from '../../shared/ui';
import { DateField } from '../../shared/ui/DateField';
import { CASE_TYPE_LABELS, type CaseStatus } from '../../data';
import { isImageFile, isInstructionFile, MANUAL_INTAKE_ACCEPT, manualIntakeFileRejection } from './manual-intake-files';

import type { useManualIntake } from './manual-intake.controller';

type ManualIntakeViewModel = ReturnType<typeof useManualIntake>;

export function ManualIntakeView(props: ManualIntakeViewModel) {
  const { addFiles, batchRejection, canCreate, casePoPreview, caseType, chooseInstruction, createCase, dragging, enriching, error, fields, fileInputRef, files, info, inspectOn, instructionFile, insuredName, lookUpVehicle, make, missingRequired, mode, normaliseInspectionAddress, normalising, onDragLeave, onDragOver, onDrop, onFieldChange, onHold, pendingManualUpload, phase, provider, providerCode, providerReference, receivedFrom, receivedOn, removeFile, resetToPick, setInfo, setInspectOn, setInsuredName, setMake, setOnHold, setProvider, setProviderCode, setProviderReference, setReceivedFrom, setReceivedOn, setStatus, setVrm, setWriteProvenance, startImagesOnly, startManual, status, styles, unsupportedFiles, vrm, warnings, writeProvenance, MANUAL_CLUSTER_KEYS } = props;
    return (
    <div className={mergeClasses('ce-enter', styles.page)}>
      <SectionHeading eyebrow="Intake" heading="New case" subtitle="Read the details from an instruction document, or type a case in by hand." />

      <input
        ref={fileInputRef}
        type="file"
        accept={MANUAL_INTAKE_ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Something went wrong</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      {info && (
        <MessageBar intent="info" onClick={() => setInfo(undefined)}>
          <MessageBarBody>{info}</MessageBarBody>
        </MessageBar>
      )}

      {pendingManualUpload && (
        <Panel>
          <MessageBar intent="error" aria-live="assertive">
            <MessageBarBody>
              <MessageBarTitle>Some files still need attention</MessageBarTitle>
              {pendingManualUpload.outcome?.message ??
                'The case has been created. Add the selected files to finish it.'}
            </MessageBarBody>
          </MessageBar>
          <Text>This case will stay Not Ready until every selected file has been added.</Text>
          <div className={styles.fileList} aria-label="Files for this case">
            {files.map((file, index) => {
              const result = pendingManualUpload.outcome?.items.find(
                (item) => item.fileIndex === index,
              );
              const isInstruction = file === instructionFile;
              return (
                <div key={`${file.name}-${file.size}-${index}`} className={styles.fileChip}>
                  {isImageFile(file)
                    ? <ImageIcon size={14} aria-hidden />
                    : <FileText size={14} aria-hidden />}
                  <span className={styles.fileName} title={file.name}>{file.name}</span>
                  <Badge
                    className={styles.fileTag}
                    size="small"
                    appearance="tint"
                    color={result?.state === 'added' ? 'success' : 'danger'}
                  >
                    {result?.state === 'added'
                      ? isInstruction ? 'Instruction added' : 'File added'
                      : isInstruction ? 'Instruction needs retry' : 'Needs retry'}
                  </Badge>
                  {result?.state !== 'added' && !isInstruction && isInstructionFile(file) && (
                    <Button
                      appearance="subtle"
                      size="small"
                      onClick={() => chooseInstruction(file)}
                      disabled={phase === 'creating'}
                    >
                      Use as instruction
                    </Button>
                  )}
                  {result?.state !== 'added' && (
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<X size={14} />}
                      aria-label={`Remove ${file.name} from this retry`}
                      onClick={() => removeFile(index)}
                      disabled={phase === 'creating'}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {pendingManualUpload.outcome?.items.some((item) => item.state === 'outstanding') && (
            <ul aria-label="Files that need attention">
              {pendingManualUpload.outcome.items
                .filter((item) => item.state === 'outstanding')
                .map((item) => (
                  <li key={`${item.fileIndex}-${item.fileName}`}>
                    {item.fileName}: {item.reason}
                  </li>
                ))}
            </ul>
          )}
          {pendingManualUpload.requiresInstruction && !instructionFile && (
            <MessageBar intent="warning">
              <MessageBarBody>
                <MessageBarTitle>Add the instruction</MessageBarTitle>
                Choose a PDF instruction before retrying.
              </MessageBarBody>
            </MessageBar>
          )}
          {phase === 'creating' && (
            <ProgressBar aria-label="Adding files" thickness="medium" />
          )}
          <div className={styles.footerActions}>
            <Button
              appearance="secondary"
              icon={<Upload size={16} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={phase === 'creating'}
            >
              Add files
            </Button>
            <Button
              appearance="primary"
              icon={phase === 'creating' ? <Spinner size="tiny" /> : <Upload size={16} />}
              onClick={createCase}
              disabled={
                phase === 'creating' ||
                unsupportedFiles.length > 0 ||
                Boolean(batchRejection) ||
                (pendingManualUpload.requiresInstruction && !instructionFile)
              }
            >
              {phase === 'creating' ? 'Adding files…' : 'Retry files'}
            </Button>
          </div>
        </Panel>
      )}

      {/* ----- STEP 1: pick + parse ----- */}
      {(phase === 'pick' || phase === 'parsing') && (
        <Panel>
          <div
            className={mergeClasses(styles.dropzone, dragging && styles.dropzoneActive)}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <Upload size={36} className={styles.dropIcon} strokeWidth={1.5} aria-hidden />
            <Text weight="semibold">Drag files here — we’ll read an instruction document automatically</Text>
            <Caption1 className={styles.hint}>
              Drop a PDF and it’s read automatically — no button needed. Add vehicle images alongside,
              or choose “Images only”
              when photos arrived without instructions.
            </Caption1>
            <div className={styles.pickActions}>
              <Button
                appearance="secondary"
                icon={<Upload size={16} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={phase === 'parsing'}
              >
                {files.length > 0 ? 'Add files' : 'Choose file'}
              </Button>
              <Button
                appearance="transparent"
                icon={<PencilLine size={16} />}
                onClick={startManual}
                disabled={phase === 'parsing'}
              >
                Enter manually (no document)
              </Button>
              <Button
                appearance="transparent"
                icon={<ImageIcon size={16} />}
                onClick={startImagesOnly}
                disabled={phase === 'parsing'}
              >
                Images only (no instructions yet)
              </Button>
            </div>

            {/* Chosen files — the instruction doc is parsed; the rest ride along. */}
            {files.length > 0 && (
              <div className={styles.fileList}>
                {files.map((f, i) => {
                  const isDoc = f === instructionFile;
                  const isImg = isImageFile(f);
                  const rejection = manualIntakeFileRejection(f);
                  return (
                    <div key={`${f.name}-${f.size}-${i}`} className={styles.fileChip}>
                      {isImg ? <ImageIcon size={14} aria-hidden /> : <FileText size={14} aria-hidden />}
                      <span className={styles.fileName} title={f.name}>
                        {f.name}
                      </span>
                      <Badge
                        className={styles.fileTag}
                        size="small"
                        appearance="tint"
                        color={isDoc || rejection ? 'danger' : 'informative'}
                      >
                        {rejection ? 'Not supported' : isDoc ? 'Instruction' : isImg ? 'Image' : 'Evidence'}
                      </Badge>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<X size={14} />}
                        aria-label={`Remove ${f.name}`}
                        onClick={() => removeFile(i)}
                        disabled={phase === 'parsing'}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {unsupportedFiles.length > 0 && (
              <MessageBar intent="warning" className={styles.barAbove}>
                <MessageBarBody>
                  <MessageBarTitle>Some files can’t be added</MessageBarTitle>
                  {unsupportedFiles.map(({ file }) => file.name).join(' · ')}. Use JPG, PNG, WebP,
                  or PDF files. Remove these files to continue.
                </MessageBarBody>
              </MessageBar>
            )}
            {batchRejection && (
              <MessageBar intent="warning" className={styles.barAbove}>
                <MessageBarBody>
                  <MessageBarTitle>Choose fewer files</MessageBarTitle>
                  {batchRejection}
                </MessageBarBody>
              </MessageBar>
            )}
            {files.length > 0 && !instructionFile && (
              <Caption1 className={styles.hint}>
                Add a PDF instruction document to read from, or enter the case manually.
              </Caption1>
            )}
          </div>

          {/* Parse is a multi-second Function call → indeterminate bar + copy. */}
          {phase === 'parsing' && (
            <div className={styles.parseProgress} role="status" aria-live="polite">
              <ProgressBar aria-label="Reading document" thickness="medium" />
              <Caption1 className={styles.parseProgressLabel}>
                Reading the document — this can take a few seconds for scanned PDFs.
              </Caption1>
            </div>
          )}
        </Panel>
      )}

      {/* ----- STEP 2: review + create ----- */}
      {(phase === 'review' || phase === 'creating') && fields && !pendingManualUpload && (
        <Panel>
          {warnings.length > 0 && (
            <MessageBar intent="warning" className={styles.barBelow}>
              <MessageBarBody>
                <MessageBarTitle>Check these details</MessageBarTitle>
                {warnings.map((w) => w.message).join(' · ')}
              </MessageBarBody>
            </MessageBar>
          )}

          {/* Case identity */}
          <span className={styles.clusterHead}>Case identity</span>
          <div className={styles.clusterBody}>
            {/* Derived, non-configurable case type (review #5). */}
            <div className={styles.caseTypeRow}>
              <Text size={200} className={styles.hint}>
                Case type
              </Text>
              {/* Neutral outline — a derived case type is metadata, not
                  brand/severity (pigment ruling). */}
              <Badge appearance="outline" color="informative">
                {CASE_TYPE_LABELS[caseType]}
              </Badge>
            </div>

            <div className={styles.identityRow}>{vrm.trim() && <VrmPlate vrm={vrm} size="large" />}</div>

            {/* Instruction-led intake keeps registration with the case identity.
                Images-only intake renders it in the consolidated details group. */}
            {mode !== 'images' && (
              <div className={styles.fieldRow}>
                <div className={styles.fieldWithAction}>
                  <Field
                    className={styles.fieldGrow}
                    label="Vehicle Registration (VRM)"
                    required
                    {...(!vrm.trim()
                      ? { validationState: 'error' as const, validationMessage: 'Required' }
                      : {})}
                  >
                    <Input value={vrm} onChange={(_, d) => setVrm(d.value)} />
                  </Field>
                  <Button
                    icon={enriching ? <Spinner size="tiny" /> : <Car size={16} />}
                    onClick={lookUpVehicle}
                    disabled={enriching || !vrm.trim()}
                  >
                    Look up vehicle details
                  </Button>
                </div>
                <div />
              </div>
            )}

            {/* Image-only intake (TKT-024): who sent the photos + when. The
                provider fields below are ABSENT — no instructions, no provider,
                no Case/PO (identified by the VRM until instructions arrive). */}
            {mode === 'images' && (
              <div className={styles.pairRow}>
                <Field
                  label="Received from"
                  required
                  {...(!receivedFrom.trim()
                    ? { validationState: 'error' as const, validationMessage: 'Required' }
                    : {})}
                >
                  <Input value={receivedFrom} onChange={(_, d) => setReceivedFrom(d.value)} />
                </Field>
                <Field
                  label="Received on"
                  required
                  {...(!receivedOn.trim()
                    ? { validationState: 'error' as const, validationMessage: 'Required' }
                    : {})}
                >
                  <DateField value={receivedOn} onChange={setReceivedOn} aria-label="Received on" />
                </Field>
              </div>
            )}

            {mode !== 'images' && (
              <>
                {/* Work provider + Principal — BOTH, separate (review #7). */}
                <div className={styles.pairRow}>
                  <Field label="Work provider" required {...(!provider.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}>
                    <Input value={provider} onChange={(_, d) => setProvider(d.value)} />
                  </Field>
                  <Field label="Principal" required {...(!providerCode.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}>
                    <Input value={providerCode} maxLength={8} onChange={(_, d) => setProviderCode(d.value.toUpperCase())} />
                  </Field>
                </div>

                {/* Case/PO preview — server allocates the real value when the case is created. */}
                <div className={styles.fieldRow}>
                  <div className={styles.fieldWithAction}>
                    <Field className={styles.fieldGrow} label="Case/PO">
                      <Input value={casePoPreview?.boxUpper ?? ''} placeholder="Assigned on create" readOnly disabled />
                    </Field>
                  </div>
                  <div />
                </div>
                {casePoPreview && (
                  <Caption1 className={styles.inlineNote}>
                    Suggested next for {casePoPreview.principal}: {casePoPreview.boxUpper} —{' '}
                    {casePoPreview.source === 'box'
                      ? 'next after the latest archive folder'
                      : 'next in our records'}
                    .
                  </Caption1>
                )}

                {/* Provider's reference / Claim No — the provider's own case number. */}
                <div className={styles.fieldRow}>
                  <Field
                    label="Provider's reference / Claim No"
                    required
                    {...(!providerReference.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}
                  >
                    <Input value={providerReference} onChange={(_, d) => setProviderReference(d.value)} />
                  </Field>
                  <div />
                </div>
              </>
            )}

            {/* Policyholder identity only exists on instruction-led intake. */}
            {mode !== 'images' && (
              <div className={styles.fieldRow}>
                <Field
                  label="Insured Name"
                  required
                  {...(!insuredName.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}
                >
                  <Input value={insuredName} onChange={(_, d) => setInsuredName(d.value)} />
                </Field>
                <div />
              </div>
            )}

            {/* Intake status (review #7) — instruction-led paths only; an image-only
                case's status is automatic (TKT-024: "should be automatic regardless"). */}
            {mode !== 'images' && (
              <div className={styles.fieldRow}>
                <Field label="Intake status">
                  <Dropdown
                    value={status === 'ingested' ? 'Ingested' : 'New email'}
                    selectedOptions={[status]}
                    onOptionSelect={(_, d) => d.optionValue && setStatus(d.optionValue as CaseStatus)}
                  >
                    <Option value="ingested" text="Ingested">
                      Ingested
                    </Option>
                    <Option value="new_email" text="New email">
                      New email
                    </Option>
                  </Dropdown>
                </Field>
                <div />
              </div>
            )}
          </div>

          {mode === 'images' ? (
            <>
              <span className={styles.clusterHead}>Claimant and vehicle</span>
              <div className={styles.clusterBody}>
                <div
                  className={styles.imageIdentityGrid}
                  role="group"
                  aria-label="Claimant and vehicle details"
                >
                  <Field label="Claimant name">
                    <Input
                      value={fields.claimantName.value}
                      onChange={(_, d) => onFieldChange('claimantName', d.value)}
                    />
                  </Field>
                  <div className={styles.imageLookupCell}>
                    <Field
                      label="Registration"
                      required
                      {...(!vrm.trim()
                        ? { validationState: 'error' as const, validationMessage: 'Required' }
                        : {})}
                    >
                      <Input value={vrm} onChange={(_, d) => setVrm(d.value)} />
                    </Field>
                    <Button
                      icon={enriching ? <Spinner size="tiny" /> : <Car size={16} />}
                      onClick={lookUpVehicle}
                      disabled={enriching || !vrm.trim()}
                    >
                      Look up vehicle details
                    </Button>
                  </div>
                  <Field label="Make">
                    <Input value={make} onChange={(_, d) => setMake(d.value)} />
                  </Field>
                  <Field
                    label="Vehicle model"
                    required
                    {...(!fields.vehicleModel.value.trim()
                      ? { validationState: 'error' as const, validationMessage: 'Required' }
                      : {})}
                  >
                    <Input
                      value={fields.vehicleModel.value}
                      onChange={(_, d) => onFieldChange('vehicleModel', d.value)}
                    />
                  </Field>
                  <Field label="Mileage">
                    <Input
                      value={fields.mileage.value}
                      onChange={(_, d) => onFieldChange('mileage', d.value)}
                    />
                  </Field>
                </div>
                {MANUAL_CLUSTER_KEYS[1].map((key) => (
                  <EvaFieldRow
                    key={key}
                    fieldKey={key}
                    label={LABEL_FOR[key].label}
                    required={false}
                    field={fields[key]}
                    onChange={onFieldChange}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <span className={styles.clusterHead}>Provider &amp; claimant</span>
              <div className={styles.clusterBody}>
                {MANUAL_CLUSTER_KEYS[0].map((key) => (
                  <EvaFieldRow key={key} fieldKey={key} label={LABEL_FOR[key].label} required={LABEL_FOR[key].required} field={fields[key]} onChange={onFieldChange} />
                ))}
              </div>

              <span className={styles.clusterHead}>Vehicle</span>
              <div className={styles.clusterBody}>
                <div className={styles.pairRow}>
                  <Field label="Make">
                    <Input value={make} onChange={(_, d) => setMake(d.value)} />
                  </Field>
                  <Field label={LABEL_FOR.vehicleModel.label} required={LABEL_FOR.vehicleModel.required} {...(LABEL_FOR.vehicleModel.required && !fields.vehicleModel.value.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}>
                    <Input value={fields.vehicleModel.value} onChange={(_, d) => onFieldChange('vehicleModel', d.value)} />
                  </Field>
                </div>
                <div className={styles.fieldRow}>
                  <Field label={LABEL_FOR.mileage.label}>
                    <Input value={fields.mileage.value} onChange={(_, d) => onFieldChange('mileage', d.value)} />
                  </Field>
                  <div className={styles.fieldMeta}>
                    <ProvenanceBadge provenance={fields.mileage.provenance} reviewState={fields.mileage.reviewState} />
                  </div>
                </div>
                {MANUAL_CLUSTER_KEYS[1].map((key) => (
                  <EvaFieldRow key={key} fieldKey={key} label={LABEL_FOR[key].label} required={LABEL_FOR[key].required} field={fields[key]} onChange={onFieldChange} />
                ))}
              </div>
            </>
          )}

          {/* Incident / location. The image-only variant (TKT-024) keeps ONLY the
              required Location — accident circumstances are instruction facts that
              don't exist yet, and the old "Image Based Assessment" lock + reason are
              GONE (that inspection-method decision belongs to review, not intake). */}
          <span className={styles.clusterHead}>{mode === 'images' ? 'Location' : 'Incident'}</span>
          <div className={styles.clusterBody}>
            {mode !== 'images' &&
              MANUAL_CLUSTER_KEYS[2].map((key) => (
                <EvaFieldRow key={key} fieldKey={key} label={LABEL_FOR[key].label} required={LABEL_FOR[key].required} field={fields[key]} onChange={onFieldChange} />
              ))}
            <div className={styles.fieldRow}>
              <div className={styles.fieldWithAction}>
                <Field
                  className={styles.fieldGrow}
                  label={mode === 'images' ? 'Location' : LABEL_FOR.inspectionAddress.label}
                  required
                  {...(!fields.inspectionAddress.value.trim()
                    ? { validationState: 'error' as const, validationMessage: 'Required' }
                    : {})}
                >
                  <Textarea
                    value={fields.inspectionAddress.value}
                    onChange={(_, d) => onFieldChange('inspectionAddress', d.value)}
                    resize="vertical"
                    rows={6}
                  />
                </Field>
                <Button
                  icon={normalising ? <Spinner size="tiny" /> : <MapPin size={16} />}
                  onClick={normaliseInspectionAddress}
                  disabled={normalising || !fields.inspectionAddress.value.trim()}
                >
                  Standardise address
                </Button>
              </div>
              <div className={styles.fieldMeta}>
                <ProvenanceBadge provenance={fields.inspectionAddress.provenance} reviewState={fields.inspectionAddress.reviewState} />
              </div>
            </div>
          </div>

          {/* Dates + Inspection — instruction-led paths only (TKT-024: incident /
              instruction / inspection dates cannot exist before instructions). */}
          {mode !== 'images' && (
            <>
              <span className={styles.clusterHead}>Dates &amp; inspection</span>
              <div className={styles.clusterBody}>
                {MANUAL_CLUSTER_KEYS[3].map((key) => (
                  <EvaFieldRow key={key} fieldKey={key} label={LABEL_FOR[key].label} required={LABEL_FOR[key].required} field={fields[key]} onChange={onFieldChange} />
                ))}
                {/* Inspect on (inspection date) — required, defaults to today (review #15). */}
                <div className={styles.fieldRow}>
                  <Field
                    label="Inspect on (inspection date)"
                    required
                    {...(!inspectOn.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}
                  >
                    <DateField
                      value={inspectOn}
                      onChange={setInspectOn}
                      aria-label="Inspect on (inspection date)"
                    />
                  </Field>
                  <div />
                </div>
                <Caption1 className={styles.inlineNote}>
                  Inspection type: Vehicle damage inspection.
                </Caption1>
              </div>
            </>
          )}

          {missingRequired.length > 0 && (
            <MessageBar intent="warning" className={styles.barAbove}>
              <MessageBarBody>
                <MessageBarTitle>Required before creating</MessageBarTitle>
                {missingRequired.join(' · ')}
              </MessageBarBody>
            </MessageBar>
          )}

          <Divider />

          {phase === 'creating' && (
            <ProgressBar className={styles.creatingBar} aria-label="Creating case" thickness="medium" />
          )}

          <div className={styles.footer}>
            <div className={styles.checkboxStack}>
              <Checkbox
                checked={writeProvenance}
                onChange={(_, d) => setWriteProvenance(d.checked === true)}
                label="Record where each field came from"
              />
              <Checkbox
                checked={onHold}
                onChange={(_, d) => setOnHold(d.checked === true)}
                label="Put this case on hold"
              />
            </div>
            <div className={styles.footerActions}>
              <Button appearance="secondary" onClick={resetToPick} disabled={phase === 'creating'}>
                Start over
              </Button>
              <Button
                appearance="primary"
                icon={phase === 'creating' ? <Spinner size="tiny" /> : <Send size={16} />}
                onClick={createCase}
                disabled={phase === 'creating' || !canCreate}
              >
                {phase === 'creating' ? 'Creating…' : 'Create case'}
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
