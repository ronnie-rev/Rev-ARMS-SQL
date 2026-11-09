import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { BookOpen, ExternalLink, Landmark, ListChecks, Search, FileText } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, PageHeader, Tabs } from '../components/ui';
import { safeUrl, resolveLinks, type PayerMeta, type Resource } from '../lib/engine/links';
import { CARC_DEFAULTS } from '../lib/engine/carc';

type Tab = 'payers' | 'resources' | 'codes' | 'playbooks' | 'letters';
const KIND: Record<string, string> = { portal: '#6366f1', policy: '#22c55e', tool: '#06b6d4', form: '#f59e0b', reference: '#64748b', search: '#a855f7' };
const a = (u: string) => ({ href: u, target: '_blank', rel: 'noopener noreferrer' });

export default function Library({ embedded = false, only }: { embedded?: boolean; only?: Tab[] } = {}) {
  const { config, carcMap } = useStore(); const [tab, setTab] = useState<Tab>('payers'); const [q, setQ] = useState('');
  const payers = config.filter((o) => o.category === 'payer' && o.active); const resources = config.filter((o) => o.category === 'resource' && o.active); const playbooks = config.filter((o) => o.category === 'playbook' && o.active); const letters = config.filter((o) => o.category === 'letter' && o.active);
  const codes = useMemo(() => [...carcMap().values()], [config]); // eslint-disable-line react-hooks/exhaustive-deps
  const fuse = useMemo(() => ({ res: new Fuse(resources, { keys: ['value', 'meta.note', 'meta.tags'], threshold: 0.35 }), codes: new Fuse(codes, { keys: ['code', 'meaning', 'rca', 'family', 'action'], threshold: 0.3 }), pb: new Fuse(playbooks, { keys: ['value', 'meta.steps'], threshold: 0.35 }), pay: new Fuse(payers, { keys: ['value', 'meta.aliases'], threshold: 0.3 }) }), [resources, codes, playbooks, payers]);
  const pick = <T,>(all: T[], f: Fuse<T>) => (q.trim() ? f.search(q).map((r) => r.item) : all);
  const [pq, setPq] = useState({ payer: '', cpt: '', text: '' });
  const meta = payers.find((p) => p.value === pq.payer)?.meta as PayerMeta | undefined;
  const smart = pq.payer ? resolveLinks(pq.payer, meta, resources as unknown as Resource[], { cpt: pq.cpt, rcaDetail: pq.text }).filter((l) => l.source === 'smart') : [];
  return (
    <div>
      {!embedded && <PageHeader title={<span className="flex items-center gap-2"><BookOpen className="text-brand-400" />Knowledge library</span>} sub="Payer portals & policies, code lookups, denial dictionary, playbooks and letter templates — all editable in Admin." />}
      <div className="flex gap-3 items-center mb-4 flex-wrap"><Tabs<Tab> value={tab} onChange={setTab} tabs={([{ id: 'payers', label: 'Payers & policies' }, { id: 'resources', label: 'Resources', count: resources.length }, { id: 'codes', label: 'Denial codes', count: codes.length }, { id: 'playbooks', label: 'Playbooks', count: playbooks.length }, { id: 'letters', label: 'Letters', count: letters.length }] as { id: Tab; label: string; count?: number }[]).filter((t) => !only || only.includes(t.id))} />
        <div className="relative ml-auto"><Search size={14} className="absolute left-2.5 top-2.5 muted" /><input className="input !pl-8 !w-72" placeholder="Search this tab…" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>

      {tab === 'payers' && (
        <div className="grid xl:grid-cols-3 gap-4">
          <Card title="Policy finder" className="xl:col-span-1"><p className="text-xs muted mb-3">Pick a payer and a procedure or topic — opens targeted searches on the payer’s own site (configure its policy domain in Admin → Payers).</p>
            <div className="space-y-2"><select className="input" value={pq.payer} onChange={(e) => setPq({ ...pq, payer: e.target.value })}><option value="">Payer…</option>{payers.map((p) => <option key={p.id}>{p.value}</option>)}</select><input className="input" placeholder="CPT / HCPCS (e.g. 15830)" value={pq.cpt} onChange={(e) => setPq({ ...pq, cpt: e.target.value })} /><input className="input" placeholder="Topic (e.g. prior authorization, modifier 25)" value={pq.text} onChange={(e) => setPq({ ...pq, text: e.target.value })} /></div>
            <div className="mt-3 space-y-1.5">{smart.map((l) => <a key={l.url} {...a(l.url)} className="flex items-center gap-2 panel2 p-2 text-[13px] hover:border-brand-500"><Search size={13} className="text-purple-400" /><span className="flex-1">{l.label}</span><ExternalLink size={12} className="muted" /></a>)}{pq.payer && !smart.length && <div className="text-xs muted">Add a CPT or topic to generate searches.</div>}</div></Card>
          <Card title="Payer directory" className="xl:col-span-2" pad={false}><div className="px-4 pb-4 overflow-auto max-h-[640px]"><table className="grid"><thead><tr><th>Payer</th><th>Phone</th><th>TF / Appeal</th><th>Links</th></tr></thead><tbody>{pick(payers, fuse.pay).map((p) => { const m = p.meta as PayerMeta; return (
            <tr key={p.id}><td className="font-semibold">{p.value}{m.tips && <div className="text-[11px] muted font-normal italic">{m.tips}</div>}</td><td className="whitespace-nowrap text-xs">{m.phone || '—'}</td><td className="text-xs whitespace-nowrap">{m.tf_days ?? '—'}d / {m.appeal_days ?? '—'}d</td>
              <td><div className="flex gap-1.5 flex-wrap">{safeUrl(m.portal) && <a {...a(m.portal!)} className="chip bg-brand-500/20 text-brand-300">Portal <ExternalLink size={10} /></a>}{(m.links || []).filter((l) => safeUrl(l.url)).map((l) => <a key={l.url} {...a(l.url)} className="chip" style={{ background: (KIND[l.kind || 'reference']) + '22', color: KIND[l.kind || 'reference'] }}>{l.label} <ExternalLink size={10} /></a>)}</div></td></tr>); })}</tbody></table></div></Card>
        </div>)}

      {tab === 'resources' && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{pick(resources, fuse.res).map((r) => (
        <a key={r.id} {...(safeUrl(r.meta.url) ? a(r.meta.url) : {})} className="panel p-4 hover:shadow-glow transition block"><div className="flex items-start justify-between gap-2"><div className="font-bold text-sm">{r.value}</div><ExternalLink size={14} className="muted shrink-0" /></div><div className="flex gap-1.5 mt-1.5"><Chip color={KIND[r.meta.kind || 'reference']}>{r.meta.kind || 'reference'}</Chip>{r.meta.payers && <Chip color="#64748b">{r.meta.payers}</Chip>}</div><p className="text-xs muted mt-2">{r.meta.note}</p></a>))}{!resources.length && <Empty title="No resources" />}</div>}

      {tab === 'codes' && <Card pad={false}><div className="px-4 pb-4 overflow-auto max-h-[680px]"><table className="grid"><thead><tr><th>Code</th><th>Meaning</th><th>Likely root cause</th><th>First move</th><th>Family</th></tr></thead><tbody>{pick(codes, fuse.codes).map((c) => <tr key={c.code}><td className="font-bold whitespace-nowrap">{c.code}</td><td className="max-w-[300px] text-[13px]">{c.meaning}</td><td className="text-xs">{c.rca}{c.rca_detail && <div className="muted">› {c.rca_detail}</div>}</td><td className="text-xs max-w-[280px]">{c.action}{c.appeal && <div className="text-amber-500 mt-0.5">Appeal: {c.appeal}</div>}</td><td><Chip color="#6366f1">{c.family}</Chip></td></tr>)}</tbody></table><p className="text-[11px] muted mt-3">Starter dictionary ({CARC_DEFAULTS.length} common codes, paraphrased). Override or extend in Admin → Denial codes; confirm against the payer remit and the official X12 lists.</p></div></Card>}

      {tab === 'playbooks' && <div className="grid md:grid-cols-2 gap-3">{pick(playbooks, fuse.pb).map((p) => <Card key={p.id} title={<span className="flex items-center gap-2"><ListChecks size={15} className="text-green-400" />{p.value}</span>}><ol className="list-decimal pl-5 space-y-1 text-[13px]">{String(p.meta.steps || '').split('\n').filter(Boolean).map((s, i) => <li key={i}>{s}</li>)}</ol></Card>)}{!playbooks.length && <Empty title="No playbooks" />}</div>}

      {tab === 'letters' && <div className="grid md:grid-cols-2 gap-3">{letters.filter((l) => !q || l.value.toLowerCase().includes(q.toLowerCase())).map((l) => <Card key={l.id} title={<span className="flex items-center gap-2"><FileText size={15} className="text-amber-400" />{l.value}</span>}><pre className="text-xs whitespace-pre-wrap muted font-sans">{l.meta.body}</pre><p className="text-[11px] muted mt-2">Generate this letter pre-filled from any claim: open the claim → Work → “Appeal letter”.</p></Card>)}</div>}
      <span className="hidden"><Landmark size={1} /></span>
    </div>
  );
}
