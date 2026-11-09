import { useMemo } from 'react';
import { Copy } from 'lucide-react';
import { useStore } from '../store';
import { Card, toast } from './ui';
import { payerBrief } from '../lib/engine/payerbrief';
import { money } from '../lib/utils';

/** Payer playbook: behaviour from your own history plus where to call, fax and appeal. Copy it into a client email or a training note. */
export function PayerBriefCard({ payer }: { payer: string }) {
  const { claims, appeals, activity, config } = useStore();
  const meta = (config.find((o) => o.category === 'payer' && o.value.toLowerCase() === payer.toLowerCase())?.meta || {}) as Record<string, string>;
  const b = useMemo(() => payerBrief(payer, claims, appeals, activity, meta), [payer, claims, appeals, activity, meta]);
  const text = [`${b.payer} — payer brief`, `${b.open} open claims · ${money(b.openBalance)}`, ...b.lines, ...b.contact.map((c) => `${c.label}: ${c.value}`)].join('\n');
  return (
    <Card title="Payer playbook" className="lg:col-span-3" actions={<button className="btn btn-sm" onClick={() => { void navigator.clipboard.writeText(text); toast.ok('Brief copied'); }}><Copy size={13} />Copy</button>}>
      <div className="grid md:grid-cols-2 gap-6 text-[13px]">
        <div><div className="label">What your history says</div>{b.lines.length ? <ul className="list-disc ml-5 space-y-1">{b.lines.map((l) => <li key={l}>{l}</li>)}</ul> : <div className="muted">Not enough history yet (needs 10+ claims, 3+ decided appeals, 3+ logged calls).</div>}
          {b.topCodes.length > 0 && <div className="mt-3"><div className="label">Open denials by code</div>{b.topCodes.map((c) => <div key={c.code} className="flex justify-between"><span>{c.code}</span><span className="muted">{c.n} · {money(c.balance)}</span></div>)}</div>}</div>
        <div><div className="label">Where to send things</div>{b.contact.length ? b.contact.map((c) => <div key={c.label} className="flex gap-2"><span className="muted w-28 shrink-0">{c.label}</span><span className="break-words min-w-0">{c.value}</span></div>) : <div className="muted">No contact details yet — add them in Admin → Payers.</div>}</div>
      </div>
    </Card>
  );
}
