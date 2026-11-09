import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip } from './ui';
import { SopBanner } from './SopBanner';
import { CallLog } from './CallLog';
import { RCM_FIELDS, RCM_GROUPS, rcmGaps } from '../lib/engine/rcmfields';
import { actionSuccess, appealOdds, denialRisk } from '../lib/engine/learning';
import { splitDenials } from '../lib/kb';
import { fmtDate, money, todayISO } from '../lib/utils';
import type { Claim } from '../lib/types';

/** Everything a senior specialist wants about one claim on a single screen: RCM data points to record, gaps to chase, denial risk, your appeal odds, what has worked with this payer, and the payer's contact intel. */
export function Claim360({ claim, canWork }: { claim: Claim; canWork: boolean }) {
  const { claims, appeals, workLog, config, patchClaims } = useStore();
  const risk = useMemo(() => denialRisk(claims).score(claim), [claims, claim.payer, claim.cpt, claim.provider]); // eslint-disable-line react-hooks/exhaustive-deps
  const odds = useMemo(() => appealOdds(appeals, claims, 2)(claim.payer, splitDenials(claim.denial_codes)[0]), [appeals, claims, claim.payer, claim.denial_codes]);
  const works = useMemo(() => actionSuccess(workLog, claims, { payer: claim.payer, minN: 3 }).slice(0, 4), [workLog, claims, claim.payer]);
  const gaps = rcmGaps(claim, todayISO()); const pm = (config.find((x) => x.category === 'payer' && x.value.toLowerCase() === (claim.payer || '').toLowerCase())?.meta || {}) as Record<string, string>;
  const set = (key: string, value: string) => { const cur = claim.custom?.[key] ?? ''; if (String(cur) === value) return; void patchClaims([claim.id], { custom: { ...claim.custom, [key]: value === '' ? null : value } } as any, `${RCM_FIELDS.find((f) => f.key === key)?.label} → ${value || 'cleared'}`, 'details'); };
  const tone = risk.level === 'high' ? '#dc2626' : risk.level === 'med' ? '#d97706' : '#16a34a';
  return (
    <div className="space-y-4">
      <SopBanner claim={claim} />
      {gaps.length > 0 && <div className="rounded-xl p-3 text-[12.5px] space-y-1" style={{ background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.35)' }}>{gaps.map((g) => <div key={g} className="flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />{g}</div>)}</div>}
      <div className="grid sm:grid-cols-3 gap-3 text-[13px]">
        <div className="panel2 p-3"><div className="label">Denial risk (similar claims)</div><b style={{ color: tone }} className="text-lg">{risk.score}% · {risk.level}</b>{risk.reasons.slice(0, 2).map((r) => <div key={r} className="muted text-[11.5px] mt-1">{r}</div>)}{!risk.reasons.length && <div className="muted text-[11.5px] mt-1">Not enough history for this payer × CPT yet</div>}</div>
        <div className="panel2 p-3"><div className="label">Appeal odds (your history)</div>{odds ? <><b className="text-lg" style={{ color: odds.winRate >= 0.5 ? '#16a34a' : '#dc2626' }}>{Math.round(odds.winRate * 100)}%</b><div className="muted text-[11.5px] mt-1">{odds.n} decided {odds.level === 'payer+code' ? 'for this payer + code' : odds.level === 'payer' ? 'for this payer' : 'for this code'}{odds.avgRecovered ? ` · avg ${money(odds.avgRecovered)}` : ''}</div></> : <div className="muted text-[11.5px]">No decided appeals like this yet</div>}</div>
        <div className="panel2 p-3"><div className="label">What works with {claim.payer || 'this payer'}</div>{works.length ? works.map((w) => <div key={w.action} className="flex justify-between text-[12px]"><span className="truncate mr-2">{w.action}</span><b>{Math.round(w.rate * 100)}%</b></div>) : <div className="muted text-[11.5px]">Fills in as touches accumulate</div>}</div>
      </div>
      <CallLog claim={claim} canWork={canWork} />
      {(pm.phone || pm.portal_url || pm.appeal_fax || pm.appeal_address) && <Card title={`${claim.payer} — contact intel`}><div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">{[['Provider line', pm.phone], ['Portal', pm.portal_url], ['Appeal fax', pm.appeal_fax], ['Appeal address', [pm.appeal_address, pm.appeal_city_state_zip].filter(Boolean).join(', ')], ['Timely filing', pm.tf_days ? pm.tf_days + ' days' : '']].filter(([, v]) => v).map(([k, v]) => <div key={k}><span className="muted text-[11px] mr-1.5">{k}</span>{v}</div>)}</div></Card>}
      {RCM_GROUPS.map((g) => <div key={g}><div className="label">{g}</div><div className="grid sm:grid-cols-3 gap-3">{RCM_FIELDS.filter((f) => f.group === g).map((f) => { const val = claim.custom?.[f.key] ?? ''; return (
        <label key={f.key} className="block text-[12px]"><span className="muted">{f.label}</span>{f.type === 'select' ? <select className="input mt-0.5" disabled={!canWork} value={val} onChange={(e) => set(f.key, e.target.value)}><option value="">—</option>{f.options!.map((o) => <option key={o}>{o}</option>)}</select> : <input key={String(val)} className="input mt-0.5" disabled={!canWork} type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} defaultValue={val} onBlur={(e) => set(f.key, e.target.value)} />}{f.hint && <span className="muted text-[10.5px]">{f.hint}</span>}</label>); })}</div></div>)}
      <div className="text-[11px] muted">Saved on the claim and visible to everyone. Use them in rules as “Custom: rcm_…”. DOS {fmtDate(claim.dos)} · <Chip>{claim.payer || 'no payer'}</Chip></div>
    </div>
  );
}
