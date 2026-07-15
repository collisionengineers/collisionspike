
import { Caption1, Text, mergeClasses } from '@fluentui/react-components';
import { Check, CheckCircle2, X } from 'lucide-react';
import { Panel } from '../../shared/ui';
import { AiAssistPanel } from '../assistant/AiAssistPanel';
import type { useCaseDetailController } from './case-detail.controller';

type CaseDetailViewModel = ReturnType<typeof useCaseDetailController>;

export function CaseDetailSidebar(props: CaseDetailViewModel) {
  const { blocked, blockerCount, c, goToBlocker, hasUnsavedChanges, liveCase, readiness, refreshAfterAiPromotion, styles, workflowBlocked } = props;
  return         <div className={styles.sidebar}>
          {/* ONE canonical readiness presentation: each ✗ row deep-links to fix. */}
          <Panel>
            <Text className="ce-section-heading">Readiness</Text>
            <Caption1 className={mergeClasses(styles.hint, styles.hintNudgeTop)} block>
              {blocked
                ? liveCase.onHold
                  ? readiness.missing.length > 0
                    ? `Release the hold and resolve ${readiness.missing.length} readiness item${readiness.missing.length === 1 ? '' : 's'} before EVA.`
                    : 'Release the hold before EVA.'
                  : workflowBlocked
                    ? 'Finish the outstanding case decision so it can move to Review before EVA.'
                  : `${blockerCount} item${blockerCount === 1 ? '' : 's'} to resolve before EVA — select one to fix.`
                : 'Every check passes — ready for EVA.'}
            </Caption1>
            <div className={styles.readyList} role="list">
              {readiness.items.map((item) => (
                <div className={styles.readyRow} key={item.id} role="listitem">
                  {item.ok ? (
                    <Check size={16} className={styles.iconOk} aria-label="Pass" />
                  ) : (
                    <X size={16} className={styles.iconBad} aria-label="Fail" />
                  )}
                  <span className={styles.readyText}>
                    {item.ok ? (
                      <Text className={styles.readyLabel}>{item.label}</Text>
                    ) : (
                      <button
                        type="button"
                        className={styles.fixLink}
                        onClick={() => goToBlocker(item)}
                      >
                        {item.label}
                      </button>
                    )}
                    {!item.ok && item.detail && <Text className={styles.readyDetail}>{item.detail}</Text>}
                  </span>
                </div>
              ))}
              {!blocked && (
                <span className={styles.readyDone}>
                  <CheckCircle2 size={16} color="var(--ce-success)" />
                  <Text size={300}>Nothing outstanding — ready for EVA.</Text>
                </span>
              )}
            </div>
          </Panel>

          {/* TKT-128: never render blank — a case with no imported facts says so
              in plain English. (The parsed EVA fields live on the Fields tab; this
              panel is the ov_* overview facts only.) */}
          {(() => {
            const facts = (
              [
                ['Insured', c.overviewFacts.insuredName],
                ['Claimant', c.overviewFacts.claimantName],
                ['Third party', c.overviewFacts.thirdPartyName],
                ['Claim no.', c.overviewFacts.claimNumber],
                ['Policy ref', c.overviewFacts.policyReference],
                ['Incident', c.overviewFacts.incidentDate],
                ['Claim type', c.overviewFacts.claimType],
                ['Insurer', c.overviewFacts.insurerName],
                ['Repairer', c.overviewFacts.repairerName],
              ] as const
            ).filter(([, v]) => !!v);
            return (
              <Panel className={styles.factsPanel}>
                <Text className="ce-section-heading">Imported details</Text>
                <Caption1 className={mergeClasses(styles.hint, styles.hintNudgeBottom)} block>
                  From the instruction document or email.
                </Caption1>
                {facts.length === 0 ? (
                  <Caption1 className={styles.hint} block>
                    Nothing was imported from the instruction document or email yet.
                  </Caption1>
                ) : (
                  facts.map(([k, v]) => (
                    <div className={styles.factRow} key={k}>
                      <span className={styles.factKey}>{k}</span>
                      <span className={styles.factVal}>{v}</span>
                    </div>
                  ))
                )}
              </Panel>
            );
          })()}

          {/* Gated AI "Assistant" (TKT-015) — renders NOTHING unless AI_ASSIST_ENABLED.
              Observation-first: suggestions with Accept/Reject; nothing mutates the case
              on its own (the API promotes an accepted value FILL-IF-EMPTY). */}
          <AiAssistPanel
            caseId={c.id}
            disabled={hasUnsavedChanges}
            onPromoted={() => void refreshAfterAiPromotion()}
          />
        </div>;
}
