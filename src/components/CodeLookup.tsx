import { useEffect, useState } from 'react';
import { Card, Chip } from './ui';

type Kind = 'icd10cm' | 'hcpcs';
/** ICD-10-CM and HCPCS/CPT-level lookup from the NIH/NLM Clinical Tables service (public, free, no PHI is sent — only the text you type). */
export function CodeLookup() {
  const [kind, setKind] = useState<Kind>('icd10cm'); const [q, setQ] = useState(''); const [rows, setRows] = useState<[string, string][]>([]); const [err, setErr] = useState('');
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return; } const ac = new AbortController();
    const t = setTimeout(async () => { try { setErr(''); const r = await fetch(`https://clinicaltables.nlm.nih.gov/api/${kind}/v3/search?terms=${encodeURIComponent(q)}&maxList=12&df=${kind === 'icd10cm' ? 'code,name' : 'code,display'}`, { signal: ac.signal }); const j = await r.json(); setRows((j[3] || []) as [string, string][]); } catch (e: any) { if (e.name !== 'AbortError') setErr('Lookup service not reachable from this network.'); } }, 300);
    return () => { clearTimeout(t); ac.abort(); };
  }, [q, kind]);
  return (
    <Card title="Code lookup (ICD-10 · HCPCS)">
      <div className="flex gap-2 mb-2"><select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value as Kind)}><option value="icd10cm">ICD-10-CM</option><option value="hcpcs">HCPCS</option></select><input className="input" placeholder="Code or words, e.g. E11.9 or wound care" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {err && <div className="text-xs text-red-500">{err}</div>}
      <ul className="text-[13px] space-y-1 max-h-60 overflow-auto">{rows.map(([c, n]) => <li key={c} className="flex gap-2"><Chip color="#6366f1">{c}</Chip><span>{n}</span></li>)}</ul>
      <div className="text-[11px] muted mt-2">Source: NLM Clinical Tables. CPT descriptions are AMA-licensed and not included.</div>
    </Card>
  );
}
