/**
 * AssistantDrawer — the AI chat helper surface (TKT-060). An overlay drawer off the
 * AppShell header; read-only Q&A backed by POST /api/assistant/chat. Rendered only when the
 * AI_CHAT_ENABLED gate is on (AppShell hides the trigger otherwise). No streaming yet — the
 * reply arrives in one turn; the drawer shows a "thinking…" state while it waits.
 */

import { useCallback, useRef, useState, type ChangeEvent } from 'react';
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
import { Sparkles, Send, X, Plus, Paperclip } from 'lucide-react';
import { getDataAccess } from '../data';
import type { AssistantChatTurn, ProposedAction } from '../data';
import { ConfirmActionCard } from './ConfirmActionCard';
import { AttachConfirmCard } from './AttachConfirmCard';
import { attachmentNote, detectCaseRef, partitionAttachments } from './attach-validate';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', height: '100%', gap: tokens.spacingVerticalS },
  thread: { flex: '1 1 auto', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalS },
  empty: { color: tokens.colorNeutralForeground3, textAlign: 'center', marginTop: tokens.spacingVerticalXXL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, alignItems: 'center' },
  bubble: { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, borderRadius: tokens.borderRadiusLarge, maxWidth: '85%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  user: { alignSelf: 'flex-end', backgroundColor: tokens.colorBrandBackground2, color: tokens.colorNeutralForeground1 },
  assistant: { alignSelf: 'flex-start', backgroundColor: tokens.colorNeutralBackground3 },
  toolHint: { alignSelf: 'flex-start', color: tokens.colorNeutralForeground3, fontStyle: 'italic', paddingLeft: tokens.spacingHorizontalXS },
  composerWrap: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: tokens.spacingVerticalS },
  composer: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'flex-end' },
  input: { flex: '1 1 auto' },
  suggestions: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS, justifyContent: 'center' },
  attachTray: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS, alignItems: 'center' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXXS, paddingLeft: tokens.spacingHorizontalS, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3, maxWidth: '100%' },
  chipName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' },
  attachError: { color: tokens.colorStatusWarningForeground1 },
  hiddenInput: { display: 'none' },
});

const SUGGESTIONS = [
  'How many cases are in each queue?',
  'Which cases are overdue?',
  'Show the oldest cases in Review',
  'Find the case for reg ',
];

interface Turn extends AssistantChatTurn {
  toolsUsed?: string[];
  /** Write-tier proposals the assistant drafted this turn (TKT-111) — rendered as confirm cards. */
  proposals?: ProposedAction[];
}

export function AssistantDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const styles = useStyles();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  // Attach-evidence (TKT-068): files the handler picked are held CLIENT-SIDE (bytes never sent to
  // the model). After a turn that carried attachments, the confirm card resolves the target case
  // and the human confirms the upload — the model gets no upload capability.
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachError, setAttachError] = useState('');
  const [showAttachCard, setShowAttachCard] = useState(false);
  // The IMMUTABLE snapshot of the files that a specific attach-turn described to the model. The
  // confirm card renders + uploads from THIS, never the live `attachments` tray — so editing the
  // tray while a send is in flight (or before confirming) can never make the card upload a
  // different set of files than the turn the human saw described.
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = threadRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // TKT-067 — start a fresh conversation. Cannot interleave with an in-flight reply, so it
  // is disabled while sending. Clears both the thread and any half-typed question; the next
  // send starts from an empty history (POST /api/assistant/chat is stateless per request).
  const newChat = useCallback(() => {
    if (sending) return;
    setTurns([]);
    setInput('');
    setAttachments([]);
    setPendingAttachments([]);
    setAttachError('');
    setShowAttachCard(false);
  }, [sending]);

  // Add freshly-picked files to the held set, mirroring the server's size/type gate client-side
  // for a fast, plain-language "no" (the server stays the enforcer). Reset the input so the same
  // file can be re-picked after removal.
  const onPickFiles = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!picked.length) return;
    const { accepted, rejected } = partitionAttachments(picked);
    if (accepted.length) setAttachments((a) => [...a, ...accepted]);
    setAttachError(rejected.length ? rejected.map((r) => `${r.name} — ${r.reason}`).join('; ') : '');
  }, []);

  const removeAttachment = useCallback((idx: number) => {
    setAttachments((a) => a.filter((_, i) => i !== idx));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    setPendingAttachments([]);
    setAttachError('');
    setShowAttachCard(false);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const typed = text.trim();
      // SNAPSHOT the attached files for THIS turn up front. Everything downstream — the note the
      // model sees, and the files the confirm card uploads — is derived from this frozen `held`,
      // never the live `attachments` state, so a mid-flight tray edit can't desync them.
      const held = attachments;
      const hasAttach = held.length > 0;
      if ((!typed && !hasAttach) || sending) return;
      // Describe the attachments to the model as CONTEXT ONLY — COUNT + KIND, never filenames or
      // bytes — so it can help resolve the target case conversationally without any PII leaking.
      const note = hasAttach ? attachmentNote(held) : '';
      const content = [typed, note].filter(Boolean).join('\n\n');
      const history: Turn[] = [...turns, { role: 'user', content }];
      setTurns(history);
      setInput('');
      if (hasAttach) {
        // Freeze the pending set and empty the working tray — the card now owns these files; the
        // tray is clear for the next question. Hide any prior card until this turn resolves.
        setPendingAttachments(held);
        setAttachments([]);
        setShowAttachCard(false);
      }
      setSending(true);
      scrollToEnd();
      try {
        const res = await getDataAccess().assistantChat(history.map((t) => ({ role: t.role, content: t.content })));
        setTurns([...history, { role: 'assistant', content: res.reply, toolsUsed: res.toolsUsed, proposals: res.proposals }]);
      } catch {
        setTurns([...history, { role: 'assistant', content: 'Sorry — I could not answer that right now. Please try again.' }]);
      } finally {
        setSending(false);
        // Once a turn carried attachments, surface the confirm card (it stays until the files are
        // uploaded or cleared) — the human resolves + confirms the target case there, against the
        // frozen snapshot in `pendingAttachments`.
        if (hasAttach) setShowAttachCard(true);
        scrollToEnd();
      }
    },
    [turns, sending, scrollToEnd, attachments],
  );

  return (
    <OverlayDrawer open={open} onOpenChange={(_e, d) => onOpenChange(d.open)} position="end" size="medium">
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Button
                appearance="subtle"
                size="small"
                icon={<Plus size={16} />}
                onClick={newChat}
                disabled={sending || turns.length === 0}
                aria-label="Start a new chat"
              >
                New chat
              </Button>
              <Button appearance="subtle" aria-label="Close assistant" icon={<X size={18} />} onClick={() => onOpenChange(false)} />
            </span>
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
                {t.role === 'assistant' &&
                  t.proposals?.map((p, pi) => (
                    <ConfirmActionCard key={pi} action={p} onDone={() => setTurns((cur) => cur.map((x, xi) => (xi === i ? { ...x, proposals: x.proposals?.filter((_pp, ppi) => ppi !== pi) } : x)))} />
                  ))}
              </div>
            ))}
            {sending && (
              <div className={mergeClasses(styles.bubble, styles.assistant)}>
                <Spinner size="tiny" label="Thinking…" labelPosition="after" />
              </div>
            )}
            {pendingAttachments.length > 0 &&
              showAttachCard &&
              (() => {
                // Resolve a target handle from the recent conversation (incl. the assistant's reply,
                // which often names the case). Pass BOTH the registration AND the Case/PO — a handler
                // who says "add these to CCPY26050" gives no registration, so the card must be able to
                // resolve by Case/PO too, not force a manual registration lookup.
                const ref = detectCaseRef(turns.slice(-4).map((t) => t.content).join('\n'));
                return (
                  <AttachConfirmCard
                    files={pendingAttachments}
                    suggestedVrm={ref.vrm}
                    suggestedCasePo={ref.casePo}
                    onDone={clearAttachments}
                  />
                );
              })()}
          </div>
          <div className={styles.composerWrap}>
            {(attachments.length > 0 || attachError) && (
              <div className={styles.attachTray}>
                {attachments.map((f, i) => (
                  <span key={i} className={styles.chip}>
                    <Caption1 className={styles.chipName}>{f.name}</Caption1>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<X size={12} />}
                      onClick={() => removeAttachment(i)}
                      disabled={sending}
                      aria-label={`Remove ${f.name}`}
                    />
                  </span>
                ))}
                {attachError && <Caption1 className={styles.attachError}>{attachError}</Caption1>}
              </div>
            )}
            <div className={styles.composer}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className={styles.hiddenInput}
                onChange={onPickFiles}
              />
              <Button
                appearance="subtle"
                icon={<Paperclip size={18} />}
                onClick={() => fileRef.current?.click()}
                disabled={sending}
                aria-label="Attach photos or PDFs"
              />
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
              <Button
                appearance="primary"
                icon={<Send size={16} />}
                disabled={sending || (!input.trim() && attachments.length === 0)}
                onClick={() => void send(input)}
                aria-label="Send"
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      </DrawerBody>
    </OverlayDrawer>
  );
}
