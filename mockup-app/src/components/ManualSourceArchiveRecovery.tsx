import { useState } from 'react';
import {
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import { sourceReadinessInputForCase, type Case } from '@cs/domain';
import { getDataAccess } from '../data';
import type { DataAccessExt } from '../data/rest-client';

export interface ManualSourceArchiveRecoveryProps {
  caseValue: Case;
  onRecovered: (value: Case) => void;
}

/** Isolated recovery surface so case-edit integrations can preserve server-owned
 * source readiness without copying it into or overwriting the local field draft. */
export function ManualSourceArchiveRecovery({
  caseValue,
  onRecovered,
}: ManualSourceArchiveRecoveryProps) {
  const source = sourceReadinessInputForCase(caseValue);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!source.sourceEvidenceArchiveFailed) return null;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setError(undefined);
    try {
      const access = getDataAccess() as DataAccessExt;
      const result = await access.retryManualIntakeArchive(caseValue.id);
      const fresh = await access.caseById(caseValue.id);
      if (fresh) onRecovered(fresh);
      if (result.requeued === 0 || !fresh) {
        setError('The archive retry could not be confirmed. Try again.');
      }
    } catch {
      setError('The archive retry could not be started. Try again.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <MessageBar intent="error">
      <MessageBarBody>
        <MessageBarTitle>A source file was not archived</MessageBarTitle>
        {error ?? 'This case stays Not Ready until the source file is archived.'}
      </MessageBarBody>
      <Button appearance="primary" onClick={() => void retry()} disabled={retrying}>
        {retrying ? 'Retrying…' : 'Retry archive'}
      </Button>
    </MessageBar>
  );
}
