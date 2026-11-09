import { useState } from 'react';
import { Check, CloudOff, Loader2, MessageSquarePlus } from 'lucide-react';
import { useStore } from '../store';
import { Field, Modal, toast } from './ui';
import { clearSaveError, useSaveState } from '../lib/savestate';
import { uid, nowISO } from '../lib/utils';

/** Header badge: are my changes safely saved? Shared by every user on the workspace. */
export function SaveIndicator() {
  const s = useSaveState();
  if (s.error) return <button className="btn btn-sm !text-red-600" title={s.error} onClick={() => { clearSaveError(); toast.info('Repeat your last change — it did not reach the server'); }}><CloudOff size={14} />Not saved</button>;
  if (s.pending > 0) return <span className="text-[12px] muted flex items-center gap-1 px-2"><Loader2 size={13} className="animate-spin" />Saving…</span>;
  return <span className="text-[12px] muted hidden md:flex items-center gap-1 px-2" title={s.lastSaved ? `Last saved ${new Date(s.lastSaved).toLocaleTimeString()}` : 'Changes save automatically'}><Check size={13} className="text-green-500" />Saved</span>;
}

/** In-app feedback for the test phase: lands in the `feedback` table with route + build so nothing is lost in chat. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false); const [kind, setKind] = useState('bug'); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const st = useStore(); const me = st.me();
  const send = async () => { setBusy(true); try { await st.submitFeedback({ kind, body: body.trim(), route: location.pathname + location.search }); toast.ok('Thanks — logged for the team'); setBody(''); setOpen(false); } catch (e: any) { toast.err(e.message || 'Could not send'); } finally { setBusy(false); } };
  void me;
  return <>
    <button className="btn btn-ghost btn-sm" title="Send feedback" aria-label="Send feedback" onClick={() => setOpen(true)}><MessageSquarePlus size={16} /></button>
    <Modal open={open} onClose={() => setOpen(false)} title="Send feedback" footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy || body.trim().length < 3} onClick={send}>Send</button></>}>
      <div className="space-y-3"><Field label="Type"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="bug">Something is broken</option><option value="idea">Idea / missing feature</option><option value="question">Question</option></select></Field>
        <Field label="What happened?" hint="Page and time are attached automatically. Do not paste patient information."><textarea className="input" rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></Field></div>
    </Modal>
  </>;
}
