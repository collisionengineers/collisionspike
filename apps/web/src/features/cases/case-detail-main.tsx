
import { Badge, Button, Caption1, Divider, Field, Input, Link, MessageBar, MessageBarBody, Spinner, Tab, TabList, Text, Textarea, Toast, ToastBody, ToastTitle, type SelectTabData, type SelectTabEvent } from '@fluentui/react-components';
import { AlertTriangle, ArrowUpRight, FileText, ImageOff, Mail, Lightbulb, Search } from 'lucide-react';
import { ChaserPanel, EvaFieldRow, FIELD_CLUSTERS, LABEL_FOR, ImageOrderList, Panel, ProvenanceBadge, ThumbGridSkeleton } from '../../shared/ui';
import { activeCopyFileRequestTransport, type Note } from '../../data';
import { sourceReadinessRecoverySnapshot } from '@cs/domain';
import { LinkedEmailsPanel } from '../../shared/ui/LinkedEmailsPanel';
import { ManualSourceArchiveRecovery } from '../../shared/ui/ManualSourceArchiveRecovery';
import { InspectionChoiceControl } from '../../shared/ui/InspectionChoice';
import { EvidenceCard, SUGGEST_VISIBLE, SuggestedLocationRow } from './case-detail-cards';
import { EVIDENCE_KIND_LABEL, POLICY_LABEL, type TabName } from './case-detail.controller';

import type { useCaseDetailController } from './case-detail.controller';

type CaseDetailViewModel = ReturnType<typeof useCaseDetailController>;

export function CaseDetailMain(props: CaseDetailViewModel) {
  const { acceptedImages, addNote, addrSearch, addrSearching, archiveEnabled, assistAiEnabled, assistCandidates, assistNoResult, assistRunning, c, caseVersion, changeImageBasedReason, chips, chooseInspection, confirmedProvenance, decisionMode, deleteImageEnabled, dispatchToast, documents, evidenceMutations, evidenceSaveErrors, imagesLoading, imgState, inspectionDraft, liveCase, locationAssistEnabled, logChase, noViewableRegistration, noteDraft, notesNewestFirst, onAcceptedForEva, onDismissReflection, onExclude, onOpenInArchive, onRegistrationVisible, onRole, onSuggestLocation, onTextChange, openDeleteImage, openingArchive, overrideAddr, overrideReason, persistedCase, registerRef, setAddrSearch, setC, setCaseVersion, setEvaOrderKeys, setNoteDraft, setPersistedCase, setShowAllSuggestions, setTab, showAllSuggestions, styles, suggestions, tab, toast, uploadLinkEnabled, useSuggestion, validationByField } = props;
  return         <div className={styles.main}>
          <Panel>
            <TabList
              selectedValue={tab}
              onTabSelect={(_: SelectTabEvent, d: SelectTabData) => setTab(d.value as TabName)}
            >
              <Tab value="fields">Fields</Tab>
              <Tab value="evidence">Evidence</Tab>
              <Tab value="address">Address</Tab>
              <Tab value="notes">Notes</Tab>
              <Tab value="chasers">Chasers</Tab>
              <Tab value="emails">Emails</Tab>
            </TabList>

            <div className={styles.tabBody}>
              {tab === 'fields' && (
                <div>
                  {FIELD_CLUSTERS.map((cluster) => (
                    <div className={styles.cluster} key={cluster.heading}>
                      <span className={styles.clusterHead}>{cluster.heading}</span>
                      <div className={styles.clusterBody}>
                        {cluster.keys.map((key) => (
                          <EvaFieldRow
                            key={key}
                            fieldKey={key}
                            label={LABEL_FOR[key].label}
                            required={LABEL_FOR[key].required}
                            field={c.evaFields[key]}
                            onChange={onTextChange}
                            validationMessage={validationByField.get(key)}
                            rowId={`field-${key}`}
                            registerRef={registerRef}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'evidence' && (
                <div className={styles.stack}>
                  <ManualSourceArchiveRecovery
                    caseValue={c}
                    onRecovered={(fresh) => {
                      const snapshot = sourceReadinessRecoverySnapshot(
                        c,
                        persistedCase,
                        fresh,
                        caseVersion,
                      );
                      setC(snapshot.draft);
                      setPersistedCase(snapshot.persisted);
                      setCaseVersion(snapshot.version);
                    }}
                  />
                  {/* Case archive — prefer the stored folder link, then offer the
                      generated Archive action when only Archive access is available. */}
                  {(c.boxFolderUrl || archiveEnabled) && (
                    <div className={styles.thumbRowStart}>
                      {c.boxFolderUrl ? (
                        <Link inline href={c.boxFolderUrl} target="_blank" rel="noopener noreferrer">
                          <span className={styles.inlineIconText}>
                            Open case archive <ArrowUpRight size={14} />
                          </span>
                        </Link>
                      ) : (
                        <Button
                          appearance="secondary"
                          icon={openingArchive ? <Spinner size="tiny" /> : <ArrowUpRight size={16} />}
                          onClick={onOpenInArchive}
                          disabled={openingArchive}
                        >
                          {openingArchive ? 'Opening…' : 'Open in Archive'}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Documents — the source email + instruction(s) + any other
                      non-image artifacts captured for the case. Each links to its
                      Box copy when archived (honest "Not archived" otherwise). */}
                  {documents.length > 0 && (
                    <div className={styles.stack}>
                      <Text className="ce-section-heading">Documents</Text>
                      <div className={styles.docList}>
                        {documents.map((d) => (
                          <div className={styles.docRow} key={d.id}>
                            {d.kind === 'email' ? <Mail size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
                            <span className={styles.docName}>
                              <span className={styles.docFile}>{d.fileName}</span>
                              <Caption1 className={styles.hint}>{EVIDENCE_KIND_LABEL[d.kind] ?? 'Document'}</Caption1>
                            </span>
                            {d.boxFileUrl ? (
                              <Link inline href={d.boxFileUrl} target="_blank" rel="noopener noreferrer">
                                <span className={styles.inlineIconText}>
                                  Open in Archive <ArrowUpRight size={14} />
                                </span>
                              </Link>
                            ) : (
                              <Caption1 className={styles.hint}>Not archived</Caption1>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Photos */}
                  <Text className="ce-section-heading">Photos</Text>
                  {imagesLoading && imgState.length === 0 ? (
                    // Images still loading — show a thumb skeleton, not a false
                    // "No images" (a slow fetch must not read as empty).
                    <ThumbGridSkeleton count={4} />
                  ) : imgState.length === 0 ? (
                    // ONE no-image message (review caseview #11: the tab used to
                    // carry three). The sidebar readiness owns the blocking signal.
                    <MessageBar intent="warning">
                      <MessageBarBody>
                        <span className={styles.inlineIconText}>
                          <ImageOff size={16} /> No images yet — use a chaser to request photos.
                        </span>
                      </MessageBarBody>
                    </MessageBar>
                  ) : (
                    <>
                      {/* TKT-002 (display-only): images present but none show a readable
                          registration — one concise inline warning, distinct from the
                          "No images yet" state above. */}
                      {noViewableRegistration && (
                        <MessageBar intent="warning">
                          <MessageBarBody>
                            <span className={styles.inlineIconText}>
                              <AlertTriangle size={16} /> No photo shows a readable registration yet — a vehicle overview with the full number plate is still needed.
                            </span>
                          </MessageBarBody>
                        </MessageBar>
                      )}
                      <div className={styles.thumbGrid}>
                        {imgState.map((ev) => (
                          <EvidenceCard
                            key={ev.id}
                            ev={ev}
                            onRole={onRole}
                            onRegistrationVisible={onRegistrationVisible}
                            onAcceptedForEva={onAcceptedForEva}
                            onExclude={onExclude}
                            onDismissReflection={(id) => void onDismissReflection(id)}
                            dismissingReflection={evidenceMutations[ev.id] === 'reflection'}
                            saving={evidenceMutations[ev.id] != null}
                            saveError={evidenceSaveErrors[ev.id]}
                            onDelete={deleteImageEnabled ? openDeleteImage : undefined}
                          />
                        ))}
                      </div>

                      <Divider />

                      <div className={styles.guidanceBanner}>
                        <Text size={200}>
                          <strong>EVA photo order:</strong> 2 previews first — overview (full
                          registration visible), then the main-damage closeup — then all accepted
                          photos in sequence, including those two again.
                        </Text>
                      </div>

                      {/* The reviewer's drag order feeds the EVA-export zip (TKT-126). */}
                      {acceptedImages.length > 0 && (
                        <ImageOrderList images={acceptedImages} onOrderChange={setEvaOrderKeys} />
                      )}
                    </>
                  )}
                </div>
              )}

              {tab === 'address' && (
                <div className={styles.stack}>
                  <Caption1 className={styles.hint}>Inspection address</Caption1>
                  <div className={styles.addrLines}>
                    {c.evaFields.inspectionAddress.value === 'Image Based Assessment' ? (
                      <span>Image Based Assessment</span>
                    ) : (
                      c.evaFields.inspectionAddress.value.split('\n').map((line, i) => (
                        <span key={i}>{line || ' '}</span>
                      ))
                    )}
                  </div>

                  <div className={styles.thumbRowBetween}>
                    {/* Slate info-tint callout tag — a decision label is
                        metadata, not brand/severity (pigment ruling). */}
                    <Badge appearance="tint" className={chips.chipInfoTint} shape="rounded">
                      Decision: {POLICY_LABEL[decisionMode]}
                    </Badge>
                    <ProvenanceBadge
                      variant="full"
                      provenance={c.evaFields.inspectionAddress.provenance}
                      reviewState={c.evaFields.inspectionAddress.reviewState}
                    />
                  </div>

                  {/* Plain-language provenance of a CONFIRMED live-assist pick
                      (no engineering terms). Only sourceNote is shown here; the
                      sourceLabel is held for a future save path (not yet wired). */}
                  {confirmedProvenance && (
                    <Caption1 className={styles.hint}>{confirmedProvenance.sourceNote}</Caption1>
                  )}

                  {/* Suggested locations — low-confidence corpus candidates +
                      live-assist candidates. Shown strictly as suggestions; "Use
                      this address" copies one into the draft above and sets the
                      decision to manual. Never auto-applied. The "Suggest location"
                      action (gated) proposes candidates from the case's photos +
                      text clues; it shows when the corpus has any candidates OR the
                      assist is switched on (so the reviewer can always invoke it). */}
                  <InspectionChoiceControl
                    choice={overrideAddr ? 'image_based' : 'address'}
                    onChoiceChange={chooseInspection}
                    reason={overrideReason}
                    onReasonChange={changeImageBasedReason}
                    requireReason={
                      inspectionDraft.decisionMode === 'image_based' && inspectionDraft.touched
                    }
                  >
                      {(suggestions.length > 0 ||
                        locationAssistEnabled ||
                        assistCandidates.length > 0 ||
                        assistNoResult !== null) && (
                        <>
                          <Divider />
                          <div className={styles.assistActionRow}>
                            <span className={styles.suggestHead}>
                              <Lightbulb size={15} strokeWidth={2} aria-hidden />
                              <Text size={200} weight="semibold">
                                Suggested locations
                              </Text>
                              <Caption1 className={styles.hint}>
                                Low confidence — verify before use.
                              </Caption1>
                            </span>
                            {/* Plain label — no engineering terms. Hidden unless the
                                assist is switched on (gate + Maps + API base). */}
                            {locationAssistEnabled && (
                              <Button
                                appearance="secondary"
                                size="small"
                                icon={assistRunning ? <Spinner size="tiny" /> : <Search size={14} />}
                                onClick={() => onSuggestLocation(false)}
                                disabled={assistRunning}
                              >
                                {assistRunning ? 'Looking…' : 'Suggest location'}
                              </Button>
                            )}
                            {/* Deeper AI vision-reasoning escalation (TKT-078) — hidden unless the
                                escalation gate is on (ships DARK, so not shown live today). */}
                            {assistAiEnabled && (
                              <Button
                                appearance="subtle"
                                size="small"
                                icon={<Lightbulb size={14} />}
                                onClick={() => onSuggestLocation(true)}
                                disabled={assistRunning}
                              >
                                Try a deeper photo-based suggestion
                              </Button>
                            )}
                          </div>
                        </>
                      )}

                      {/* Search the full corpus — the list otherwise shows only the ranked
                          provider shortlist (TKT-062). Typing ≥2 chars queries all ~2,200. */}
                      <Input
                        size="small"
                        value={addrSearch}
                        onChange={(_e, d) => setAddrSearch(d.value)}
                        contentBefore={<Search size={14} />}
                        placeholder="Search all locations…"
                        aria-label="Search all inspection locations"
                        className={styles.addrSearch}
                      />
                      {addrSearching && (
                        <Caption1 className={styles.assistNoResult}>
                          {suggestions.length === 0
                            ? `No locations match “${addrSearch.trim()}”.`
                            : `${suggestions.length} match${suggestions.length === 1 ? '' : 'es'} — showing the closest.`}
                        </Caption1>
                      )}

                      {/* TKT-076/079 — the shortlist is the labelled COMMON fallback
                          (no sites saved for this provider yet), never an unlabelled
                          global list. Banner + per-row wording together close the
                          scopeFallback gap both verifiers failed. */}
                      {!addrSearching && suggestions.some((s) => s.scopeFallback) && (
                        <Caption1 className={styles.assistNoResult}>
                          Showing common locations — none saved for this provider yet.
                        </Caption1>
                      )}

                      {/* Live-assist candidates render through the SAME row as the
                          corpus suggestions (identical "Suggested" badge, evidence
                          tooltip, "Use this address"). Confidence drives ordering
                          only — nothing is preselected. */}
                      {(suggestions.length > 0 || assistCandidates.length > 0) && (
                        <div className={styles.suggestList} role="list">
                          {assistCandidates.map((s) => (
                            <SuggestedLocationRow
                              key={s.id}
                              suggestion={s}
                              onUse={() => useSuggestion(s)}
                            />
                          ))}
                          {(showAllSuggestions || addrSearching
                            ? suggestions
                            : suggestions.slice(0, SUGGEST_VISIBLE)
                          ).map((s) => (
                            <SuggestedLocationRow
                              key={s.id}
                              suggestion={s}
                              onUse={() => useSuggestion(s)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Show-more toggle for the capped corpus shortlist (TKT-079). Hidden while
                          searching the full corpus (that list is already the search result). */}
                      {!addrSearching && suggestions.length > SUGGEST_VISIBLE && (
                        <Button
                          appearance="transparent"
                          size="small"
                          onClick={() => setShowAllSuggestions((v) => !v)}
                        >
                          {showAllSuggestions
                            ? 'Show fewer'
                            : `Show ${suggestions.length - SUGGEST_VISIBLE} more`}
                        </Button>
                      )}

                      {/* Muted line when the last assist run found nothing. */}
                      {assistNoResult === true && (
                        <Caption1 className={styles.assistNoResult}>
                          No location could be suggested from the photos.
                        </Caption1>
                      )}
                  </InspectionChoiceControl>
                </div>
              )}

              {tab === 'notes' && (
                <div className={styles.stack}>
                  <Field label="Add a note">
                    <Textarea
                      value={noteDraft}
                      onChange={(_, d) => setNoteDraft(d.value)}
                      resize="vertical"
                      rows={3}
                      placeholder="Record a review decision, a chase outcome, anything the team should see."
                    />
                  </Field>
                  <div>
                    <Button appearance="primary" onClick={addNote} disabled={!noteDraft.trim()}>
                      Add note
                    </Button>
                  </div>

                  <div className={styles.noteList}>
                    {notesNewestFirst.length === 0 ? (
                      <Caption1 className={styles.hint}>No notes yet.</Caption1>
                    ) : (
                      notesNewestFirst.map((n) => (
                        <div key={n.id} className={styles.note}>
                          <div className={styles.noteMeta}>
                            <span className={styles.noteAuthor}>{n.author}</span>
                            <span className={styles.noteTime}>{n.timestamp}</span>
                          </div>
                          <Text size={300}>{n.text}</Text>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {tab === 'chasers' && (
                <div className={styles.stack}>
                  {/* TKT-300 (PLAN-015): the guided-photos request panel is hidden while
                      guided capture is off for the alpha — restore by reverting this
                      ticket's change and flipping the capture gates back on. The
                      component, its tests, and the controller wiring stay in place. */}
                  <ChaserPanel
                    case={liveCase}
                    fileRequestEnabled={uploadLinkEnabled}
                    onRequestUploadLink={activeCopyFileRequestTransport}
                    onLogChased={({ channel, templateLabel }) => {
                      // Optimistic note (the visible artifact) rolled back if the
                      // POST fails; the durable chaser row PERSISTS through the
                      // seam (M-E2) and reconciles into c.chasers on response.
                      const note: Note = {
                        id: `note-${Date.now()}`,
                        author: 'J. Mercer',
                        timestamp: new Date().toLocaleString('en-GB'),
                        text: `Chased via ${channel === 'whatsapp' ? 'WhatsApp' : 'email'} — ${templateLabel}.`,
                      };
                      setC((prev) => (prev ? { ...prev, notes: [note, ...prev.notes] } : prev));
                      return logChase(c.id, { channel, templateLabel })
                        .then((chaser) => {
                          setC((prev) =>
                            prev ? { ...prev, chasers: [chaser, ...prev.chasers] } : prev,
                          );
                          toast('Chase logged');
                        })
                        .catch((err: unknown) => {
                          // Roll the optimistic note back — never a fake success.
                          setC((prev) =>
                            prev
                              ? { ...prev, notes: prev.notes.filter((n) => n.id !== note.id) }
                              : prev,
                          );
                          dispatchToast(
                            <Toast>
                              <ToastTitle>Couldn’t log the chase — try again</ToastTitle>
                              <ToastBody>
                                {err instanceof Error ? err.message : 'Please try again.'}
                              </ToastBody>
                            </Toast>,
                            { intent: 'error' },
                          );
                        });
                    }}
                  />
                </div>
              )}

              {/* Emails linked to this case (TKT-009). Mounted only when the tab
                  is open so the inbound feed isn't fetched on every case view. */}
              {tab === 'emails' && <LinkedEmailsPanel caseId={c.id} />}
            </div>
          </Panel>
        </div>;
}
