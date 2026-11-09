import { useMemo, useState } from 'react';
import { isProducer } from '../../lib/roles';
import { GripVertical, Wand2 } from 'lucide-react';
import { useStore } from '../../store';
import { useClaims, type EClaim } from '../../hooks';
import { Avatar, Bar, Card, Chip, Empty, toast, useConfirm } from '../../components/ui';
import { allocate } from '../../lib/engine/alloc';
import { cn, moneyShort, num, sum } from '../../lib/utils';

type GroupBy = 'client-payer' | 'client' | 'payer' | 'bucket';
interface Chunk { key: string; label: string; sub: string; color?: string; ids: string[]; value: number; oldest: number }

const chunkify = (list: EClaim[], by: GroupBy): Chunk[] => {
  const m = new Map<string, Chunk>();
  for (const x of list) {
    const k = by === 'client' ? x.c.client_id : by === 'payer' ? x.c.payer || 'Unknown' : by === 'bucket' ? x.bucket?.label || '?' : x.c.client_id + '|' + (x.c.payer || 'Unknown');
    const e = m.get(k) || { key: k, label: by === 'client' ? x.client?.name || '' : by === 'payer' ? x.c.payer || 'Unknown' : by === 'bucket' ? `${x.bucket?.label} days` : x.c.payer || 'Unknown', sub: by === 'client-payer' ? x.client?.name || '' : '', color: by === 'bucket' ? x.bucket?.color : x.client?.color, ids: [], value: 0, oldest: 0 };
    e.ids.push(x.c.id); e.value += x.c.balance; e.oldest = Math.max(e.oldest, x.age ?? 0); m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
};

/** Drag a group of claims (by client / payer / bucket) onto a person to assign it. */
export function AllocationBoard() {
  const { profiles, assign } = useStore(); const all = useClaims(); const { confirm, node } = useConfirm();
  const open = useMemo(() => all.filter((x) => x.open), [all]); const [by, setBy] = useState<GroupBy>('client-payer'); const [over, setOver] = useState<string | null>(null);
  const staff = profiles.filter((p) => p.active && isProducer(p.role)); const unassigned = open.filter((x) => !x.c.assigned_to);
  const pool = useMemo(() => chunkify(unassigned, by), [unassigned, by]);
  const claimsById = useMemo(() => new Map(open.map((x) => [x.c.id, x])), [open]);
  const drop = async (uid: string | null, raw: string) => {
    let ids: string[]; try { ids = JSON.parse(raw); } catch { return; } if (!ids.length) return;
    const v = sum(ids.map((i) => claimsById.get(i)?.c.balance || 0)); const who = uid ? profiles.find((p) => p.id === uid)?.full_name : 'the unassigned pool';
    if (ids.length > 40 && !(await confirm(`Move ${ids.length} claims (${moneyShort(v)}) to ${who}?`))) return;
    await assign(ids, uid); toast.ok(`${ids.length} claims → ${who}`);
  };
  const autoBalance = async () => {
    const m = allocate(unassigned, staff.map((p) => p.id), 'balanced', open, new Map(profiles.map((p) => [p.id, p.skills || []]))); const g = new Map<string, string[]>(); m.forEach((u, c) => g.set(u, [...(g.get(u) || []), c]));
    for (const [u, ids] of g) await assign(ids, u); toast.ok(`Balanced ${m.size} claims across ${g.size} people`);
  };
  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap"><span className="text-xs muted">Group the pool by</span>
        {([['client-payer', 'Client + payer'], ['client', 'Client'], ['payer', 'Payer'], ['bucket', 'Aging bucket']] as const).map(([id, l]) => <button key={id} onClick={() => setBy(id)} className={cn('chip border', by === id ? 'bg-brand-500 text-white border-transparent' : 'panel2 muted')}>{l}</button>)}
        <button className="btn btn-sm ml-auto" onClick={autoBalance} disabled={!unassigned.length}><Wand2 size={13} />Auto-balance everything</button></div>
      <div className="flex gap-4 overflow-x-auto pb-3 items-start">
        <Column title="Unassigned pool" sub={`${num(unassigned.length)} claims · ${moneyShort(sum(unassigned.map((x) => x.c.balance)))}`} over={over === 'pool'} onOver={(v) => setOver(v ? 'pool' : null)} onDrop={(raw) => drop(null, raw)}>
          {pool.slice(0, 60).map((c) => <ChunkCard key={c.key} c={c} />)}{!pool.length && <Empty title="Everything is assigned" />}</Column>
        {staff.map((p) => { const mine = open.filter((x) => x.c.assigned_to === p.id); const cap = p.daily_target * 5; const chunks = chunkify(mine, 'client'); return (
          <Column key={p.id} title={<span className="flex items-center gap-2"><Avatar name={p.full_name} size={22} />{p.full_name}</span>} sub={`${num(mine.length)} claims · ${moneyShort(sum(mine.map((x) => x.c.balance)))}`} over={over === p.id} onOver={(v) => setOver(v ? p.id : null)} onDrop={(raw) => drop(p.id, raw)}
            header={<div className="mt-2"><div className="flex justify-between text-[10px] muted mb-1"><span>vs weekly capacity ({cap} touches)</span><span>{Math.round((mine.length / Math.max(1, cap * 4)) * 100)}%</span></div><Bar value={mine.length} max={cap * 4} color={mine.length > cap * 4 ? '#ef4444' : 'rgb(91 91 214)'} h={5} />{(p.client_ids || []).length > 0 && <div className="flex gap-1 mt-2 flex-wrap">{(p.client_ids || []).map((id) => <span key={id} className="text-[10px] muted">{useStore.getState().clients.find((c) => c.id === id)?.code}</span>)}</div>}</div>}>
            {chunks.map((c) => <ChunkCard key={c.key} c={c} compact />)}{!chunks.length && <div className="text-xs muted text-center py-6">Drop claims here</div>}</Column>); })}
      </div>{node}
    </div>
  );
}

function Column({ title, sub, header, children, over, onOver, onDrop }: { title: React.ReactNode; sub: string; header?: React.ReactNode; children: React.ReactNode; over: boolean; onOver: (v: boolean) => void; onDrop: (raw: string) => void }) {
  return (
    <div onDragOver={(e) => { e.preventDefault(); onOver(true); }} onDragLeave={() => onOver(false)} onDrop={(e) => { e.preventDefault(); onOver(false); onDrop(e.dataTransfer.getData('text/chunk')); }} className={cn('w-72 shrink-0 panel p-3 max-h-[calc(100vh-280px)] flex flex-col transition', over && 'ring-2 ring-brand-500')}>
      <div className="px-1 pb-2"><div className="text-[13px] font-semibold">{title}</div><div className="text-[11px] muted">{sub}</div>{header}</div>
      <div className="space-y-2 overflow-auto pr-0.5">{children}</div>
    </div>
  );
}
function ChunkCard({ c, compact }: { c: Chunk; compact?: boolean }) {
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData('text/chunk', JSON.stringify(c.ids))} className="panel2 p-2.5 cursor-grab active:cursor-grabbing hover:border-brand-500 transition">
      <div className="flex items-center gap-2"><GripVertical size={12} className="muted" />{c.color && <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />}<b className="text-[12.5px] flex-1 truncate">{c.label}</b><Chip color="#64748b">{c.ids.length}</Chip></div>
      {!compact && <div className="flex justify-between text-[11px] muted mt-1 pl-5"><span className="truncate">{c.sub}</span><span>{moneyShort(c.value)} · oldest {c.oldest}d</span></div>}
      {compact && <div className="text-[11px] muted pl-5 mt-0.5">{moneyShort(c.value)}</div>}
    </div>
  );
}

/** Who covers which practice: the matrix drives "My clients", capacity planning and coverage-aware allocation. */
export function CoverageMatrix() {
  const { profiles, clients, claims, save, assign } = useStore(); const all = useClaims();
  const staff = profiles.filter((p) => p.active && isProducer(p.role)); const cl = clients.filter((c) => c.active);
  const load = useMemo(() => { const m = new Map<string, { n: number; v: number }>(); claims.forEach((c) => { if (c.closed_at) return; const e = m.get(c.client_id) || { n: 0, v: 0 }; e.n++; e.v += c.balance; m.set(c.client_id, e); }); return m; }, [claims]);
  const toggle = (uid: string, cid: string) => { const p = profiles.find((x) => x.id === uid)!; const cur = p.client_ids || []; save('profiles', [{ ...p, client_ids: cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid] }] as any); };
  const allocateByCoverage = async () => {
    let n = 0; for (const c of cl) {
      const team = staff.filter((p) => isProducer(p.role) && (p.client_ids || []).includes(c.id)).map((p) => p.id); if (!team.length) continue;
      const un = all.filter((x) => x.open && x.c.client_id === c.id && !x.c.assigned_to); if (!un.length) continue;
      const m = allocate(un, team, 'skills', all.filter((x) => x.open), new Map(profiles.map((p) => [p.id, p.skills || []]))); const g = new Map<string, string[]>(); m.forEach((u, id) => g.set(u, [...(g.get(u) || []), id])); for (const [u, ids] of g) { await assign(ids, u); n += ids.length; }
    }
    toast.ok(n ? `Allocated ${n} claims to the people covering each client` : 'Nothing to allocate (check coverage and unassigned claims)');
  };
  return (
    <Card title="Client coverage" actions={<button className="btn btn-primary btn-sm" onClick={allocateByCoverage}><Wand2 size={13} />Allocate unassigned by coverage</button>} pad={false}>
      <div className="overflow-auto px-5 pb-5"><p className="text-xs muted mb-3">Tick the practices each person covers. “My clients” in the workspace switcher, the day planner and capacity planning all follow this.</p>
        <table className="grid"><thead><tr><th>Person</th>{cl.map((c) => <th key={c.id} style={{ textAlign: 'center' }}><div className="flex flex-col items-center gap-0.5"><span className="w-2 h-2 rounded-full" style={{ background: c.color }} /><span>{c.code || c.name.slice(0, 4)}</span><span className="normal-case tracking-normal font-normal opacity-70">{moneyShort(load.get(c.id)?.v || 0)}</span></div></th>)}<th style={{ textAlign: 'right' }}>Clients</th></tr></thead><tbody>
          {staff.map((p) => (<tr key={p.id}><td className="whitespace-nowrap"><div className="flex items-center gap-2"><Avatar name={p.full_name} size={22} /><div><div className="font-medium text-[13px]">{p.full_name}</div><div className="text-[10px] muted capitalize">{p.role}</div></div></div></td>
            {cl.map((c) => <td key={c.id} style={{ textAlign: 'center' }}><input type="checkbox" checked={(p.client_ids || []).includes(c.id)} onChange={() => toggle(p.id, c.id)} /></td>)}<td style={{ textAlign: 'right' }} className="font-semibold">{(p.client_ids || []).length}</td></tr>))}
          <tr><td className="muted text-xs">People covering</td>{cl.map((c) => { const n = staff.filter((p) => (p.client_ids || []).includes(c.id)).length; return <td key={c.id} style={{ textAlign: 'center' }} className={n ? 'text-xs' : 'text-xs text-amber-500 font-semibold'}>{n || '⚠ 0'}</td>; })}<td /></tr></tbody></table></div>
    </Card>
  );
}
