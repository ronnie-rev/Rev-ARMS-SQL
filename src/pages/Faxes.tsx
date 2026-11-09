import { HubBar } from '..//components/HubBar';
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card, Chip, PageHeader } from '../components/ui';
import { FAX_STATUS_LABEL, formatFax } from '../lib/engine/fax';
import { fmtDateTime } from '../lib/utils';

/** Every fax sent from the tool, with delivery status and a link back to the claim. */
export default function Faxes() {
  const { faxLog, claims, clients, openClaim } = useStore(); const [q, setQ] = useState(''); const [stt, setStt] = useState('');
  const cm = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]); const cl = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const rows = faxLog.filter((f) => (!stt || f.status === stt) && (!q || `${f.to_number} ${f.subject} ${cm.get(f.claim_id || '')?.claim_no || ''}`.toLowerCase().includes(q.toLowerCase())));
  const tone = (s: string) => (s === 'sent' ? '#16a34a' : s === 'failed' ? '#dc2626' : '#d97706');
  return (
    <div className="space-y-4">
      <HubBar group="appeals" />
      <PageHeader title="Faxes" sub="Everything sent from ClaimsIQ" />
      <Card pad={false}>
        <div className="p-3 flex gap-2"><input className="input max-w-xs" placeholder="Search number, claim, subject…" value={q} onChange={(e) => setQ(e.target.value)} /><select className="input max-w-[160px]" value={stt} onChange={(e) => setStt(e.target.value)}><option value="">All statuses</option>{Object.entries(FAX_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>Sent</th><th>To</th><th>Claim</th><th>Client</th><th>Pages</th><th>Status</th><th>By</th></tr></thead><tbody>
          {rows.map((f) => { const c = cm.get(f.claim_id || ''); return <tr key={f.id}><td>{fmtDateTime(f.created_at)}</td><td>{formatFax(f.to_number)}</td><td>{c ? <button className="link" onClick={() => openClaim(c.id)}>{c.claim_no}</button> : '—'}</td><td>{cl.get(f.client_id || '') || '—'}</td><td>{f.pages}</td><td><Chip color={tone(f.status)}>{FAX_STATUS_LABEL[f.status]}</Chip>{f.error && <div className="text-[11px] text-red-600">{f.error}</div>}</td><td>{f.sent_by_name || '—'}</td></tr>; })}
          {!rows.length && <tr><td colSpan={7} className="text-center muted py-8">No faxes yet. Open an appeal and press Fax.</td></tr>}
        </tbody></table></div>
      </Card>
    </div>
  );
}
