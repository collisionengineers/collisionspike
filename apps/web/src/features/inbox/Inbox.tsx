import { useInboxController } from './inbox.controller';
import { InboxView } from './inbox.view';

export function Inbox() {
  return <InboxView {...useInboxController()} />;
}

export default Inbox;
