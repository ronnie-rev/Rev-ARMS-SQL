import { useState } from 'react';
import { Download } from 'lucide-react';
import Papa from 'papaparse';
import { useStore } from '../store';
import { Card, toast } from './ui';
import { useClaims } from '../hooks';
import { clientHealth } from '../lib/engine/finhealth';
import { clientReview } from '../lib/engine/reviewpack';
import { downloadFile, money, todayISO } from '../lib/utils';
import { downloadXlsx } from '../lib/xlsx';

const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** One-click report packs: a management summary across clients, and a per-client monthly pack (health, aging, payers, denials, appeals). */
export function QuickPacks() {
  const { clients, recoveries, appeals, requests, has } = useStore(); const ecs = useClaims(); const today = todayISO(); const [cid, setCid] = useState(''); const client = cid || clients[0]?.id || '';
  if (!has('export') || !has('view_money') || clients.length === 0) return null;
  const mgmtRows = () => clients.map((c) => { const h = clientHealth(ecs, recoveries, appeals, c.id, today); return { Client: c.name, Score: h.score, Grade: h.grade, 'Open A/R': h.openBalance, 'Open claims': h.openClaims, 'Avg age': h.avgAge, '% >60d': h.pct60, '% >90d': h.pct90, '% >120d': h.pct120, 'First-pass denial %': h.firstPass.rate ?? '', 'Denied now %': h.denialRate, 'Collected 30d': h.recovered30, 'Collected 90d': h.recovered90, 'Filing at risk ≤30d': h.tfAtRisk, 'Filing lost': h.tfLost, 'Underpaid': h.underpaid, 'Touched in 14d %': h.touched14, 'Top payer': h.topPayer?.payer ?? '', 'Top payer share %': h.topPayer?.share ?? '', 'Appeal win %': h.appealWin.rate ?? '' }; });
  const mgmt = () => { downloadFile(`management-summary-${today}.csv`, Papa.unparse(mgmtRows()), 'text/csv'); toast.ok('Management summary downloaded'); };
  const mgmtX = async () => { await downloadXlsx(`management-summary-${today}`, [{ name: 'Clients', rows: mgmtRows() as any, note: `Generated ${today}` }]); toast.ok('Excel workbook downloaded'); };
  const packData = () => {
    const c = clients.find((x) => x.id === client)!; const h = clientHealth(ecs, recoveries, appeals, client, today); const r = clientReview(ecs, recoveries, appeals, requests, client, addDays(today, -30), today);
    const sec = (t: string, head: string[], rows: (string | number)[][]) => [[t], head, ...rows, []];
    const out = [[`${c.name} — monthly A/R pack`, `${r.from} to ${r.to}`], [], ...sec('Summary', ['Metric', 'Value'], [['Health score', `${h.score} (${h.grade})`], ['Open A/R', h.openBalance], ['Open claims', h.openClaims], ['Avg age (days)', h.avgAge], ['% over 90 days', h.pct90], ['Collected last 30 days', h.recovered30], ['First-pass denial %', h.firstPass.rate ?? 'n/a'], ['Filing at risk ≤30d', h.tfAtRisk], ['Appeal win %', h.appealWin.rate ?? 'n/a']]),
      ...sec('Aging', ['Bucket', 'Claims', 'Balance'], r.aging.map((a) => [a.label, a.n, a.balance])), ...sec('Top payers', ['Payer', 'Claims', 'Balance'], r.topPayers.map((p) => [p.payer, p.n, p.balance])), ...sec('Top denial reasons', ['Code', 'Claims', 'Balance'], r.topDenials.map((d) => [d.code, d.n, d.balance])),
      ...sec('Appeals', ['Filed', 'Won', 'Lost', 'Pending', 'Recovered'], [[r.appeals.filed, r.appeals.won, r.appeals.lost, r.appeals.pending, r.appeals.recovered]]), ...sec('Waiting on the practice', ['Claim', 'Type', 'Request'], r.needsClient.items.map((i) => [i.claim_no, i.kind, i.body]))];
    return { c, h, r, out };
  };
  const pack = () => { const { c, out } = packData(); downloadFile(`${c.name.replace(/[^A-Za-z0-9]+/g, '-')}-pack-${today}.csv`, Papa.unparse(out as any), 'text/csv'); toast.ok('Client pack downloaded'); };
  const packX = async () => { const { c, h, r } = packData(); await downloadXlsx(`${c.name.replace(/[^A-Za-z0-9]+/g, '-')}-pack-${today}`, [
    { name: 'Summary', note: `${c.name} · ${r.from} to ${r.to}`, rows: [['Health score', `${h.score} (${h.grade})`], ['Open A/R', h.openBalance], ['Open claims', h.openClaims], ['Avg age (days)', h.avgAge], ['% over 90 days', h.pct90], ['Collected last 30 days', h.recovered30], ['First-pass denial %', h.firstPass.rate ?? 'n/a'], ['Filing at risk ≤30d', h.tfAtRisk], ['Appeal win %', h.appealWin.rate ?? 'n/a']].map(([Metric, Value]) => ({ Metric, Value })) as any },
    { name: 'Aging', rows: r.aging.map((a) => ({ Bucket: a.label, Claims: a.n, Balance: a.balance })), columns: [{ key: 'Bucket' }, { key: 'Claims', format: 'int' }, { key: 'Balance', format: 'money' }] },
    { name: 'Payers', rows: r.topPayers.map((p) => ({ Payer: p.payer, Claims: p.n, Balance: p.balance })), columns: [{ key: 'Payer' }, { key: 'Claims', format: 'int' }, { key: 'Balance', format: 'money' }] },
    { name: 'Denials', rows: r.topDenials.map((d) => ({ Code: d.code, Claims: d.n, Balance: d.balance })), columns: [{ key: 'Code' }, { key: 'Claims', format: 'int' }, { key: 'Balance', format: 'money' }] },
    { name: 'Waiting on practice', rows: r.needsClient.items.map((i) => ({ Claim: i.claim_no, Type: i.kind, Request: i.body })) }]); toast.ok('Excel pack downloaded'); };
  const packPdf = async () => { const { c, h, r } = packData(); const { tablePdf } = await import('../lib/pdf/tablePdf'); const blob = await tablePdf({ title: `${c.name} — A/R review`, subtitle: `${r.from} to ${r.to} · health ${h.score} (${h.grade})`, sections: [
    { title: 'Summary', head: ['Metric', 'Value'], rows: [['Open A/R', money(h.openBalance)], ['Open claims', h.openClaims], ['Average age (days)', h.avgAge], ['Over 90 days', h.pct90 + '%'], ['Collected, last 30 days', money(h.recovered30)], ['First-pass denial', h.firstPass.rate != null ? h.firstPass.rate + '%' : 'n/a'], ['Filing at risk (≤30d)', money(h.tfAtRisk)], ['Appeal win rate', h.appealWin.rate != null ? h.appealWin.rate + '%' : 'n/a']] },
    { title: 'Aging', head: ['Bucket', 'Claims', 'Balance'], rows: r.aging.map((a) => [a.label, a.n, money(a.balance)]), align: ['left', 'right', 'right'] },
    { title: 'Top payers', head: ['Payer', 'Claims', 'Balance'], rows: r.topPayers.map((p) => [p.payer, p.n, money(p.balance)]), align: ['left', 'right', 'right'] },
    { title: 'Top denial reasons', head: ['Code', 'Claims', 'Balance'], rows: r.topDenials.map((d) => [d.code, d.n, money(d.balance)]), align: ['left', 'right', 'right'] },
    { title: 'Appeals', head: ['Filed', 'Won', 'Lost', 'Pending', 'Recovered'], rows: [[r.appeals.filed, r.appeals.won, r.appeals.lost, r.appeals.pending, money(r.appeals.recovered)]] }, ...(r.needsClient.items.length ? [{ title: 'Waiting on the practice', head: ['Claim', 'Type', 'Request'], rows: r.needsClient.items.map((i) => [i.claim_no, i.kind, i.body]) }] : [])] }); downloadFile(`${c.name.replace(/[^A-Za-z0-9]+/g, '-')}-review-${today}.pdf`, blob, 'application/pdf'); toast.ok('PDF pack downloaded'); };
  return (
    <Card title="Quick packs">
      <div className="flex flex-wrap items-end gap-3"><button className="btn" onClick={mgmt}><Download size={14} />Management CSV</button><button className="btn" onClick={mgmtX}><Download size={14} />Management Excel</button><span className="muted text-xs">or</span>
        <select className="input !w-auto" value={client} onChange={(e) => setCid(e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn" onClick={pack}><Download size={14} />Pack CSV</button><button className="btn" onClick={packX}><Download size={14} />Pack Excel</button><button className="btn" onClick={packPdf}><Download size={14} />Pack PDF</button></div>
    </Card>
  );
}
