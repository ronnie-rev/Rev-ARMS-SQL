import { useMemo, useState } from 'react';
import { Gavel, Plus, Search } from 'lucide-react';
import { useStore } from '../../store';
import { useLimits } from '../../hooks';
import { Chip, Modal, toast, useConfirm } from '../ui';
import { AppealBuilder } from '../AppealBuilder';
import { isOpen, nextLevel } from '../../lib/engine/appeal';
import { deadlinesFor, isDenied } from '../../lib/engine/limits';
import { money, todayISO } from '../../lib/utils';
import type { AppealKind } from '../../lib/types';

/** One-click appeal entry point for any claim: opens the open appeal if there is one, otherwise starts a new one. */
export function CreateAppealButton({ claimId, kind, label, className = 'btn btn-sm', style }: { claimId: string; kind?: AppealKind; label?: string; className?: string; style?: 'courtesy' }) {
  const { appeals, has } = useStore(); const [open, setOpen] = useState(false);
  const mine = appeals.filter((a) => a.claim_id === claimId); const live = mine.filter(isOpen).sort((a, b) => b.level - a.level)[0];
  if (!has('work_claims')) return null;
  return <>
    <button className={className} onClick={(e) => { e.stopPropagation(); setOpen(true); }} title={live ? 'Open the appeal in progress' : 'Draft an appeal letter for this claim'}><Gavel size={13} />{label ?? (live ? `Open appeal L${live.level}` : 'Create appeal')}</button>
    {open && <AppealBuilder claimId={claimId} appealId={style ? undefined : live?.id} kind={kind} style={style} onClose={() => setOpen(false)} />}
  </>;
}

/** Create draft appeals for many claims at once (skips claims that already have an open appeal). */
export function useDraftAppeals() {
  const st = useStore(); const { cfg, idx } = useLimits(); const { confirm, node } = useConfirm(); const [busy, setBusy] = useState(false);
  const run = async (ids: string[], kind: AppealKind = 'appeal') => {
    const today = todayISO(); const todo = ids.map((id) => st.claims.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c && !c.closed_at && !st.appeals.some((a) => a.claim_id === c.id && isOpen(a) && a.kind === kind)).slice(0, 100);
    if (!todo.length) { toast.ok('Every selected claim already has an open appeal or is closed'); return 0; }
    if (!(await confirm(`Create ${todo.length} draft ${kind === 'appeal' ? 'appeals' : 'letters'} (${money(todo.reduce((a, c) => a + Math.max(0, c.balance), 0))})? Nothing is sent — each opens in Appeals for review.`))) return 0;
    setBusy(true); let n = 0;
    try {
      for (const c of todo) {
        const d = deadlinesFor(c, idx.resolve(c.payer, c.client_id, c.custom?.plan_type), today, cfg).find((x) => x.kind === 'afl');
        await st.createAppeal({ claim_id: c.id, kind, level: nextLevel(st.appeals.filter((a) => a.claim_id === c.id)), template: null, form_id: null, due_on: d?.due ?? null, reason: c.denial_codes ? `Denial ${c.denial_codes}` : null, amount_disputed: c.balance, letter: {} } as any); n++;
      }
      toast.ok(`${n} draft appeal${n > 1 ? 's' : ''} created — open Appeals to finish them`);
    } catch (e: any) { toast.err(`Stopped after ${n}: ${e?.message || e}`); } finally { setBusy(false); }
    return n;
  };
  return { run, busy, node };
}

/** "New appeal" on the Appeals page: find any claim by number, payer or code, then pick the type. */
export function NewAppealPicker({ onClose, onPick }: { onClose: () => void; onPick: (claimId: string, kind: AppealKind, style?: 'courtesy') => void }) {
  const { claims, appeals, inScope, clients } = useStore(); const [q, setQ] = useState(''); const [kind, setKind] = useState<AppealKind | 'courtesy'>('appeal');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase(); const withOpen = new Set(appeals.filter(isOpen).map((a) => a.claim_id));
    return claims.filter((c) => !c.closed_at && inScope(c.client_id) && (!t || [c.claim_no, c.payer, c.denial_codes].some((v) => (v || '').toLowerCase().includes(t)))).map((c) => ({ c, denied: isDenied(c), has: withOpen.has(c.id) })).sort((a, b) => Number(b.denied) - Number(a.denied) || b.c.balance - a.c.balance).slice(0, 30);
  }, [claims, appeals, inScope, q]);
  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Plus size={15} />New appeal</span>}>
      <div className="space-y-3">
        <div className="flex gap-2"><div className="relative flex-1"><Search size={14} className="absolute left-2.5 top-2.5 muted" /><input autoFocus className="input !pl-8" placeholder="Claim #, payer or denial code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value as AppealKind | 'courtesy')}><option value="appeal">Appeal</option><option value="courtesy">Courtesy / good-faith review</option><option value="reconsideration">Reconsideration</option><option value="corrected_claim">Corrected claim</option><option value="underpayment_dispute">Underpayment dispute</option><option value="external_review">External review</option></select></div>
        <div className="max-h-80 overflow-auto divide-y hair">{list.length === 0 ? <div className="muted text-sm p-3">No matching open claims.</div> : list.map(({ c, denied, has }) => <button key={c.id} className="w-full text-left py-2 px-1 hover:bg-white/5 flex items-center gap-2 text-sm" onClick={() => (kind === 'courtesy' ? onPick(c.id, 'appeal', 'courtesy') : onPick(c.id, kind))}><span className="font-mono text-xs w-32 shrink-0">{c.claim_no}</span><span className="flex-1 truncate">{c.payer} · {clients.find((x) => x.id === c.client_id)?.name}</span>{denied && <Chip color="#ef4444">{c.denial_codes || 'denied'}</Chip>}{has && <Chip color="#6366f1">appeal open</Chip>}<span>{money(c.balance)}</span></button>)}</div>
      </div>
    </Modal>
  );
}
