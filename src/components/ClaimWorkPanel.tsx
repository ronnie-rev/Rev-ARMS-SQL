import { useMemo, useState } from 'react';
import { Check, ExternalLink, FileText, HandCoins, Lightbulb, ListChecks, Printer, Copy, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { useIntelligence, useOpts, type EClaim } from '../hooks';
import { NBA_COLOR, NBA_LABEL, type Nba } from '../lib/engine/intelligence';
import { useNavigate } from 'react-router-dom';
import type { AppealKind, Claim } from '../lib/types';
import { ClaimIntel } from './ClaimIntel';
import { WorkGuide } from './WorkGuide';
import { stepsBody } from '../lib/engine/notedoc';
import { AppealBuilder } from './AppealBuilder';
import { TouchForm, type Prefill } from './TouchForm';
import { Chip, Field, Modal, toast } from './ui';
import { resolveLinks, type PayerMeta, type Resource } from '../lib/engine/links';
import { suggestFromCodes, splitCodes } from '../lib/engine/carc';
import { claimStory } from '../lib/engine/story';
import { fmtDate, money, todayISO } from '../lib/utils';

const KIND: Record<string, string> = { portal: '#6366f1', policy: '#22c55e', tool: '#06b6d4', form: '#f59e0b', reference: '#64748b', search: '#a855f7' };

/** Everything a specialist needs to work one claim: story, learned context, denial insight, playbook, links, letters, approvals, and the touch form. */
export function ClaimWorkPanel({ ec, onSaved, autoFocus }: { ec: EClaim; onSaved?: () => void; autoFocus?: boolean }) {
  const claim = ec.c; const st = useStore(); const carcMap = useMemo(() => st.carcMap(), [st.config]); // eslint-disable-line react-hooks/exhaustive-deps
  const [prefill, setPrefill] = useState<Prefill>({}); const [draft, setDraft] = useState({ rca: '', rca_detail: '', end_action: '' }); const [letter, setLetter] = useState(false); const [approval, setApproval] = useState(false);
  const resources = useOpts('resource'); const payer = st.config.find((o) => o.category === 'payer' && o.value.toLowerCase() === (claim.payer || '').toLowerCase());
  const detail = draft.rca_detail || claim.rca_detail || ''; 
  const sug = useMemo(() => suggestFromCodes(claim.denial_codes, carcMap), [claim.denial_codes, carcMap]);
  const links = useMemo(() => resolveLinks(claim.payer, payer?.meta as PayerMeta, resources as unknown as Resource[], { cpt: claim.cpt, codes: claim.denial_codes, rcaDetail: detail }), [claim, payer, resources, detail]);
  const story = useMemo(() => claimStory(claim, ec, st.profiles.find((p) => p.id === claim.assigned_to)?.full_name), [claim, ec, st.profiles]);
  const bump = (p: Prefill) => setPrefill({ ...p, seq: (prefill.seq || 0) + 1 });
  const [courtesy, setCourtesy] = useState(false); const { nba } = useIntelligence([ec]); const n = nba.get(claim.id); const [kind, setKind] = useState<AppealKind>('appeal');
  const canApprove = st.has('approve_adjustments'); const canWorkHere = st.has('work_claims'); const myAppeals = st.appeals.filter((a) => a.claim_id === claim.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="space-y-3">
      {n && n.kind !== 'monitor' && <NextStep n={n} onAppeal={(k) => { setKind(k); setLetter(true); }} claim={claim} />}
      <WorkGuide claim={claim} rcaDetail={detail} onUseRca={(rca, d) => bump({ rca, rca_detail: d })} onInsertSteps={(steps) => bump({ block: { label: 'Steps taken', body: stepsBody(steps), mode: 'append' } })} />
      <details className="panel2 group"><summary className="px-3 py-2 cursor-pointer text-[13px] font-semibold flex items-center gap-1.5 list-none"><Sparkles size={12} />Claim overview <span className="muted font-normal text-[11px]">story, payer history, related claims</span></summary>
        <div className="px-3 pb-3 space-y-3"><div className="text-[13px] leading-relaxed">{story}</div><ClaimIntel ec={ec} /></div></details>
      <div className="flex gap-2 flex-wrap items-center"><button className="btn btn-sm" onClick={() => { setKind('appeal'); setLetter(true); }}><FileText size={13} />Appeal / letter{myAppeals.length > 0 && <Chip color="#6366f1" className="ml-1">L{Math.max(...myAppeals.map((a) => a.level))} {myAppeals[0].status}</Chip>}</button><button className="btn btn-sm" title="Good-faith request that keeps your appeal rights" onClick={() => { setKind('appeal'); setCourtesy(true); setLetter(true); }}>Courtesy review</button>{canApprove && <button className="btn btn-sm" onClick={() => setApproval(true)}><HandCoins size={13} />Request client approval</button>}
        {links.length > 0 && <details className="relative"><summary className="btn btn-sm list-none cursor-pointer"><ExternalLink size={12} />Links ({links.length})</summary><div className="absolute z-20 mt-1 panel p-2 flex gap-1.5 flex-wrap w-80 shadow-lg">{links.slice(0, 12).map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" title={l.note} className="chip hover:brightness-125" style={{ background: KIND[l.kind] + '22', color: KIND[l.kind] }}>{l.label}</a>)}</div></details>}</div>
      {canWorkHere && <label className="flex items-center gap-2 text-[12px] muted"><HandCoins size={13} />Payer promised payment by<input type="date" className="input !w-auto !py-0.5 text-xs" value={(claim.custom?.promise_date as string) || ''} onChange={(e) => st.patchClaims([claim.id], { custom: { ...(claim.custom || {}), promise_date: e.target.value || null } }, e.target.value ? `Payer promised payment by ${fmtDate(e.target.value)}` : 'Payment promise cleared')} />{claim.custom?.promise_date && <button className="btn btn-ghost btn-sm" onClick={() => st.patchClaims([claim.id], { custom: { ...(claim.custom || {}), promise_date: null } }, 'Payment promise cleared')}>clear</button>}</label>}
      <TouchForm key={claim.id + claim.touch_count} claimId={claim.id} onSaved={onSaved} autoFocus={autoFocus} prefill={prefill} onDraft={setDraft} />
      {letter && <AppealBuilder claimId={claim.id} kind={kind} style={courtesy ? 'courtesy' : undefined} onClose={() => { setLetter(false); setCourtesy(false); }} />}
      <ApprovalModal open={approval} onClose={() => setApproval(false)} ec={ec} />
    </div>
  );
}

function ApprovalModal({ open, onClose, ec }: { open: boolean; onClose: () => void; ec: EClaim }) {
  const createApproval = useStore((s) => s.createApproval); const [amount, setAmount] = useState(String(ec.c.balance.toFixed(2))); const [body, setBody] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Request client approval to adjust" footer={<button className="btn btn-primary" disabled={!body.trim()} onClick={async () => { await createApproval({ claim_id: ec.c.id, amount: Number(amount), body: body.trim() }); toast.ok('Sent to the client portal'); onClose(); }}>Send request</button>}>
      <p className="text-xs muted mb-3">The practice sees this in their portal and can approve or decline the adjustment. Their decision is recorded on the claim.</p>
      <Field label="Amount ($)" className="mb-3"><input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Explanation for the practice"><textarea className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Payer denied as untimely (CO-29); no proof of timely filing exists. Recommend contractual write-off." /></Field>
    </Modal>
  );
}

const money0 = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
/** Explainable recommendation for this claim, with a one-click way to act on it. */
function NextStep({ n, claim, onAppeal }: { n: Nba; claim: Claim; onAppeal: (k: AppealKind) => void }) {
  const col = n.color ?? NBA_COLOR[n.kind]; const payerFu = useStore((st) => Number(st.config.find((o) => o.category === 'payer' && o.value.toLowerCase() === (claim.payer || '').toLowerCase())?.meta.followup_days) || 7);
  const { assign, patchClaims, me, has } = useStore(); const nav = useNavigate(); const close = useStore((s) => s.openClaim);
  const act = (() => {
    const ca = n.custom?.action; if (ca) switch (ca.type) {
      case 'followup': return has('work_claims') ? { label: `Follow up in ${ca.days} days`, run: () => patchClaims([claim.id], { next_fu: new Date(Date.now() + ca.days * 864e5).toISOString().slice(0, 10) }, `Follow-up set (${n.label})`) } : null;
      case 'assign_me': return has('self_assign') && me() ? { label: 'Assign to me', run: () => assign([claim.id], me()!.id) } : null;
      case 'appeal': return { label: 'Start appeal', run: () => onAppeal('appeal') }; case 'corrected': return { label: 'Corrected-claim letter', run: () => onAppeal('corrected_claim') }; case 'underpay': return { label: 'Dispute underpayment', run: () => onAppeal('underpayment_dispute') };
      case 'flag': return has('work_claims') ? { label: `Flag “${ca.flag}”`, run: () => patchClaims([claim.id], { flags: [...new Set([...(claim.flags || []), ca.flag])] }, `Flagged ${ca.flag}`) } : null;
      case 'status': return has('work_claims') ? { label: `Set status: ${ca.status}`, run: () => patchClaims([claim.id], { status: ca.status }, `Status → ${ca.status}`, 'status') } : null;
      case 'link': return { label: 'Open', run: () => { close(null); nav(ca.to); } }; default: return null;
    }
    switch (n.kind) {
      case 'appeal': case 'appeal_overdue': case 'writeoff_review': return { label: n.kind === 'writeoff_review' ? 'Appeal with proof…' : 'Start appeal', run: () => onAppeal('appeal') };
      case 'corrected_claim': return { label: 'Corrected-claim letter', run: () => onAppeal('corrected_claim') };
      case 'dispute_underpay': return { label: 'Dispute underpayment', run: () => onAppeal('underpayment_dispute') };
      case 'assign': return has('self_assign') && me() ? { label: 'Assign to me', run: () => assign([claim.id], me()!.id) } : null;
      case 'set_followup': return has('work_claims') ? { label: `Follow up in ${payerFu} days`, run: () => patchClaims([claim.id], { next_fu: new Date(Date.now() + payerFu * 864e5).toISOString().slice(0, 10) }, 'Follow-up set (recommended)') } : null;
      case 'resolve_missing': return has('resolve_missing') ? { label: 'Open Missing from file', run: () => { close(null); nav('/missing'); } } : null;
      default: return null;
    }
  })();
  return (
    <div className="rounded-xl p-3 flex gap-3 items-start" style={{ background: col + '14', border: `1px solid ${col}40` }}>
      <Lightbulb size={16} style={{ color: col }} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><b className="text-[13.5px]">Recommended: {n.label}</b>{n.impact > 0 && <span className="text-[11px] muted">≈ {money0(n.impact)} in play</span>}<span className="text-[10px] muted uppercase tracking-wide">{n.confidence} confidence</span></div>
        <ul className="text-[12.5px] muted mt-1 space-y-0.5">{n.why.map((w, i) => <li key={i}>• {w}</li>)}</ul>{n.also.length > 0 && <div className="text-[11px] muted mt-1">Then: {n.also.join(' · ')}</div>}</div>
      {act && <button className="btn btn-sm btn-primary shrink-0" onClick={act.run}>{act.label}</button>}
    </div>
  );
}
