import { useMemo, useState } from 'react';
import { ExternalLink, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { DenialGuide } from './DenialGuide';
import { Chip, Modal } from './ui';
import { carcMeaning, scenarioIndex, type Kb } from '../lib/kb';
import type { Claim } from '../lib/types';

const BRANCH: [RegExp, string][] = [[/timely/i, 'Timely filing'], [/author|referral|retro/i, 'Authorization / referral'], [/necessity|record|audit/i, 'Medical necessity / records'], [/coding|modifier|bundl|unbundl|invalid|missing|information/i, 'Coding / modifiers'], [/eligib|cob|coverage|coordination|member/i, 'Eligibility / COB'], [/payment|offset|recoup|underpay|overpay/i, 'Payment / offsets']];
/** "How do I handle this denial on the phone?" — payer contact, opening questions, code-specific questions, and the decision flow. */
export function CallFlowModal({ claim, code, kb, onClose }: { claim: Claim; code: string; kb: Kb; onClose: () => void }) {
  const nav = useNavigate(); const { config, openClaim } = useStore(); const [done, setDone] = useState<Record<string, boolean>>({});
  const idx = useMemo(() => scenarioIndex(kb), [kb]); const s = idx.get(code) || null; const m = carcMeaning(kb, code);
  const payer = config.find((o) => o.category === 'payer' && o.value.toLowerCase() === (claim.payer || '').toLowerCase());
  const key = BRANCH.find(([re]) => re.test(`${s?.cat || ''} ${s?.t || ''} ${m?.group || ''} ${m?.desc || ''}`))?.[1]; const branch = key ? kb.CALL_BRANCH[key] || [] : [];
  const phone = payer?.meta.phone; const ivr = payer?.meta.tips; const tick = (k: string) => setDone({ ...done, [k]: !done[k] });
  const Row = ({ k, t }: { k: string; t: string }) => <li className="flex gap-2 text-[13px] items-start"><input type="checkbox" className="mt-1" checked={!!done[k]} onChange={() => tick(k)} /><span className={done[k] ? 'line-through muted' : ''}>{t}</span></li>;
  return (
    <Modal wide open onClose={onClose} title={<span className="flex items-center gap-2"><Phone size={16} />Call flow · {code}{s ? ` · ${s.t}` : ''}</span>} footer={s ? <button className="btn" onClick={() => { openClaim(null); nav(`/knowledge?tab=scenarios&code=${encodeURIComponent(s.code)}`); }}><ExternalLink size={12} />Open in Knowledge hub</button> : undefined}>
      <div className="space-y-4">
        <div className="panel2 p-3 text-[13px]"><div className="label">Payer contact — {claim.payer || 'unknown payer'}</div>{phone || ivr ? <div className="space-y-0.5">{phone && <div>Phone: <b>{phone}</b></div>}{ivr && <div>IVR / tips: {ivr}</div>}{payer?.meta.portal && <div>Portal: {payer.meta.portal}</div>}{payer?.meta.appeal_fax && <div>Appeals fax: {payer.meta.appeal_fax}</div>}</div> : <span className="muted">No contact saved — add it in Admin → Payers.</span>}</div>
        {m && <div className="text-[13px]"><Chip color="#f59e0b">{code}</Chip> <span className="muted">{m.desc}</span>{m.plain && <div className="mt-1">{m.plain}</div>}</div>}
        <div><div className="label">1 · Open the call</div><ul className="space-y-1">{kb.CALL_BASE.slice(0, 6).map((t, i) => <Row key={i} k={'b' + i} t={t} />)}</ul></div>
        {s?.ask?.length ? <div><div className="label">2 · Ask about this denial</div><ul className="space-y-1">{s.ask.map((t, i) => <Row key={i} k={'a' + i} t={t} />)}</ul></div> : null}
        {branch.length > 0 && <div><div className="label">3 · {key}</div><ul className="space-y-1">{branch.map((t, i) => <Row key={i} k={'r' + i} t={t} />)}</ul></div>}
        <div><div className="label">4 · Decide the next step</div>{s ? <DenialGuide s={s} kb={kb} compact /> : <p className="text-[13px] muted">No decision flow for {code} yet — follow the baseline checklist and escalate to your supervisor.</p>}</div>
        <p className="text-[11px] muted">Always finish by recording the call reference #, rep name, date and the next follow-up in the touch form.</p>
      </div>
    </Modal>
  );
}
