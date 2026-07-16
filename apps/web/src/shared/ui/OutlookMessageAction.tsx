import { useEffect, useState } from 'react';
import { Caption1, Link, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowUpRight } from 'lucide-react';
import {
  normalizeOutlookWebLink,
  type InboundEmail,
  type OutlookMessageLinkResolution,
} from '@cs/domain';
import { getDataAccess } from '../../data';

const useStyles = makeStyles({
  action: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  unavailable: { color: tokens.colorNeutralForeground3 },
});

/**
 * Read-only exact-message action. The target is Graph's stored message.webLink;
 * this component re-validates it at the last rendering boundary and never builds
 * a URL from message content or mailbox identifiers.
 */
export interface OutlookMessageActionProps {
  email: InboundEmail;
  /** Test seam; production always uses the authenticated read-only Data API check. */
  resolveLink?: (id: string) => Promise<OutlookMessageLinkResolution>;
}

const FALLBACK_COPY: Record<Exclude<OutlookMessageLinkResolution['status'], 'available'>, string> = {
  missing_identity: 'This email can’t be opened in Outlook from here. The saved preview is still available.',
  not_found: 'This email is no longer available in Outlook. The saved preview is still available.',
  not_accessible: 'This email can’t be opened in Outlook from here. The saved preview is still available.',
  unavailable: 'Outlook couldn’t be checked just now. The saved preview is still available.',
};

export function OutlookMessageAction({ email, resolveLink }: OutlookMessageActionProps) {
  const styles = useStyles();
  const [resolution, setResolution] = useState<OutlookMessageLinkResolution | undefined>();

  useEffect(() => {
    let cancelled = false;
    setResolution(undefined);
    const resolve = resolveLink ?? ((id: string) => getDataAccess().resolveOutlookMessageLink(id));
    resolve(email.id)
      .then((result) => {
        if (cancelled) return;
        const href = result.status === 'available'
          ? normalizeOutlookWebLink(result.outlookWebLink)
          : undefined;
        setResolution(
          href ? { status: 'available', outlookWebLink: href } :
            result.status === 'available' ? { status: 'unavailable' } : result,
        );
      })
      .catch(() => {
        if (!cancelled) setResolution({ status: 'unavailable' });
      });
    return () => { cancelled = true; };
  }, [email.id, resolveLink]);

  if (!resolution) {
    return (
      <Caption1 className={styles.unavailable} role="status">
        Checking whether this email can be opened in Outlook…
      </Caption1>
    );
  }

  if (resolution.status !== 'available') {
    return (
      <Caption1 className={styles.unavailable} role="status">
        {FALLBACK_COPY[resolution.status]}
      </Caption1>
    );
  }

  return (
    <Link inline href={resolution.outlookWebLink} target="_blank" rel="noopener noreferrer">
      <span className={styles.action}>
        View in Outlook <ArrowUpRight size={14} aria-hidden />
        <span className="ce-sr-only"> (opens in a new tab)</span>
      </span>
    </Link>
  );
}

export default OutlookMessageAction;
