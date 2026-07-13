import { Caption1, Link, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowUpRight } from 'lucide-react';
import { normalizeOutlookWebLink, type InboundEmail } from '@cs/domain';

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
export function OutlookMessageAction({ email }: { email: InboundEmail }) {
  const styles = useStyles();
  const href = normalizeOutlookWebLink(email.outlookWebLink);

  if (!href) {
    return (
      <Caption1 className={styles.unavailable} role="status">
        This email can’t be opened in Outlook from here. The saved preview is still available.
      </Caption1>
    );
  }

  return (
    <Link inline href={href} target="_blank" rel="noopener noreferrer">
      <span className={styles.action}>
        View in Outlook <ArrowUpRight size={14} aria-hidden />
        <span className="ce-sr-only"> (opens in a new tab)</span>
      </span>
    </Link>
  );
}

export default OutlookMessageAction;
