/**
 * AssistantDrawer — the AI chat helper surface (TKT-060). An overlay drawer off the
 * AppShell header; read-only Q&A backed by POST /api/assistant/chat. Rendered only when the
 * AI_CHAT_ENABLED gate is on (AppShell hides the trigger otherwise). No streaming yet — the
 * reply arrives in one turn; the drawer shows a "thinking…" state while it waits.
 */

import { useCallback, useRef, useState } from 'react';
import {
  OverlayDrawer,
  DrawerHeader,
  DrawerHeaderTitle,
  DrawerBody,
  Button,
  Textarea,
  Spinner,
  Caption1,
  Body1,
  makeStyles,
  tokens,
  mergeClasses,
} from '@fluentui/react-components';
import { Sparkles, Send, X } from 'lucide-react';
import { getDataAccess } from '../data';
import type { AssistantChatTurn } from '../data';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', height: '100%', gap: tokens.spacingVerticalS },
  thread: { flex: '1 1 auto', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalS },
  empty: { color: tokens.colorNeutralForeground3, textAlign: 'center', marginTop: tokens.spacingVerticalXXL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, alignItems: 'center' },
  bubble: { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, borderRadius: tokens.borderRadiusLarge, maxWidth: '85%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  user: { alignSelf: 'flex-end', backgroundColor: tokens.colorBrandBackground2, color: tokens.colorNeutralForeground1 },
  assistant: { alignSelf: 'flex-start', backgroundColor: tokens.colorNeutralBackground3 },
  toolHint: { alignSelf: 'flex-start', color: tokens.colorNeutralForeground3, fontStyle: 'italic', paddingLeft: tokens.spacingHorizontalXS },
  composer: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'flex-end', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: tokens.spacingVerticalS },
  input: { flex: '1 1 auto' },
  suggestions: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS, justifyContent: 'center' },
});

const SUGGESTIONS = [
  'How many cases are in each queue?',
  'What does "Held" mean?',
  'Find the case for reg ',
];

interface Turn extends AssistantChatTurn {
  toolsUsed?: string[];
}

export function AssistantDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const styles = useStyles();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = threadRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || sending) return;
      const history: Turn[] = [...turns, { role: 'user', content: q }];
      setTurns(history);
      setInput('');
      setSending(true);
      scrollToEnd();
      try {
        const res = await getDataAccess().assistantChat(history.map((t) => ({ role: t.role, content: t.content })));
        setTurns([...history, { role: 'assistant', content: res.reply, toolsUsed: res.toolsUsed }]);
      } catch {
        setTurns([...history, { role: 'assistant', content: 'Sorry — I could not answer that right now. Please try again.' }]);
      } finally {
        setSending(false);
        scrollToEnd();
      }
    },
    [turns, sending, scrollToEnd],
  );

  return (
    <OverlayDrawer open={open} onOpenChange={(_e, d) => onOpenChange(d.open)} position="end" size="medium">
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button appearance="subtle" aria-label="Close assistant" icon={<X size={18} />} onClick={() => onOpenChange(false)} />
          }
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} /> Assistant
          </span>
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <div className={styles.body}>
          <div className={styles.thread} ref={threadRef}>
            {turns.length === 0 && !sending && (
              <div className={styles.empty}>
                <Sparkles size={28} />
                <Body1>Ask about cases, queues, or inbound emails.</Body1>
                <Caption1>I can look things up — I can't make changes.</Caption1>
                <div className={styles.suggestions}>
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} size="small" appearance="outline" onClick={() => (s.endsWith(' ') ? setInput(s) : void send(s))}>
                      {s.trim()}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div className={mergeClasses(styles.bubble, t.role === 'user' ? styles.user : styles.assistant)}>{t.content}</div>
                {t.role === 'assistant' && t.toolsUsed && t.toolsUsed.length > 0 && (
                  <Caption1 className={styles.toolHint}>looked up {Array.from(new Set(t.toolsUsed)).join(', ').replace(/_/g, ' ')}</Caption1>
                )}
              </div>
            ))}
            {sending && (
              <div className={mergeClasses(styles.bubble, styles.assistant)}>
                <Spinner size="tiny" label="Thinking…" labelPosition="after" />
              </div>
            )}
          </div>
          <div className={styles.composer}>
            <Textarea
              className={styles.input}
              value={input}
              onChange={(_e, d) => setInput(d.value)}
              placeholder="Ask a question…"
              resize="vertical"
              aria-label="Ask the assistant a question"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <Button appearance="primary" icon={<Send size={16} />} disabled={sending || !input.trim()} onClick={() => void send(input)} aria-label="Send">
              Send
            </Button>
          </div>
        </div>
      </DrawerBody>
    </OverlayDrawer>
  );
}
