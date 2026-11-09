import { useMemo, useState } from 'react';
import { Phone } from 'lucide-react';
import { useStore } from '../store';
import { Card, Field, toast } from './ui';
import { CALL_OUTCOMES, callsOf } from '../lib/engine/calls';
import { fmtDate, fmtDateTime } from '../lib/utils';
import type { Claim } from '../lib/types';

/** Log a payer call in ten seconds: who you reached, the reference number, any promised payment date and the next follow-up. Everything lands on the claim. */
export function CallLog({ claim, canWork }: { claim: Claim; canWork: boolean }) {
  const { activity, patchClaims, logActivity } = useStore(); const calls = useMemo(() => callsOf(activity.filter((a) => a.claim_id === claim.id)), [activity, claim.id]);
  const [f, setF] = useState({ outcome: CALL_OUTCOMES[0] as string, rep: '', ref: '', promise: '', next: '', summary: '' }); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (f.outcome === CALL_OUTCOMES[0] && !f.ref.trim()) return toast.err('Reached a rep — add the call reference number'); setBusy(true);
    try {
      const sum = `${f.outcome}${f.rep ? ` · ${f.rep}` : ''}${f.ref ? ` · ref ${f.ref}` : ''}${f.promise ? ` · payment promised ${fmtDate(f.promise)}` : ''}${f.summary ? ` — ${f.summary}` : ''}`;
      await logActivity(claim.id, 'call', sum, { outcome: f.outcome, rep: f.rep, ref: f.ref, promise: f.promise });
      const custom = { ...claim.custom, ...(f.rep ? { rcm_payer_rep: f.rep } : {}), ...(f.ref ? { rcm_call_ref: f.ref } : {}), ...(f.promise ? { promise_date: f.promise } : {}) };
      await patchClaims([claim.id], { custom, ...(f.next ? { next_fu: f.next } : f.promise ? { next_fu: f.promise } : {}) } as any);
      toast.ok('Call logged'); setF({ ...f, rep: '', ref: '', promise: '', next: '', summary: '' });
    } finally { setBusy(false); }
  };
  return (
    <Card title={<span className="flex items-center gap-1.5"><Phone size={14} />Payer calls ({calls.length})</span>}>
      {canWork && <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Outcome"><select className="input" value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}>{CALL_OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Rep name"><input className="input" value={f.rep} onChange={(e) => setF({ ...f, rep: e.target.value })} /></Field><Field label="Call reference #"><input className="input" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
        <Field label="Payer promised payment by"><input type="date" className="input" value={f.promise} onChange={(e) => setF({ ...f, promise: e.target.value })} /></Field><Field label="Next follow-up" hint="defaults to the promise date"><input type="date" className="input" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
        <Field label="What they said"><input className="input" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
        <div className="sm:col-span-3"><button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>Log call</button></div></div>}
      {calls.length > 0 && <ul className="mt-3 divide-y hair text-[12.5px]">{calls.slice(0, 6).map((c) => <li key={c.id} className="py-1.5"><span className="muted mr-2">{fmtDateTime(c.at)}</span>{c.by && <b className="mr-1">{c.by}</b>}{c.summary}</li>)}</ul>}
    </Card>
  );
}
