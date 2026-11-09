import { useStore } from '../store';

export function PayerFixer({ names }: { names: { name: string; count: number }[] }) {
  const { config, save } = useStore(); const payers = config.filter((o) => o.category === 'payer' && o.active);
  return (
    <div className="space-y-2 pt-1"><div className="text-xs muted">Map each unknown name to a directory payer (adds it as an alias) or add it as a new payer. The preview updates immediately.</div>
      {names.map((n) => (<div key={n.name} className="panel2 p-2.5 flex items-center gap-2 text-[13px]"><b className="flex-1">{n.name} <span className="muted font-normal">({n.count})</span></b>
        <select className="input !w-52" defaultValue="" onChange={async (e) => { const v = e.target.value; if (!v) return; if (v === '__new') { await save('config_options', [{ id: crypto.randomUUID(), category: 'payer', value: n.name, parent: null, label: null, color: null, sort: payers.length, active: true, meta: {} } as any]); } else { const p = payers.find((x) => x.id === v)!; await save('config_options', [{ ...p, meta: { ...p.meta, aliases: [p.meta.aliases, n.name].filter(Boolean).join(', ') } } as any]); } }}>
          <option value="">Choose…</option><option value="__new">＋ Add as new payer</option>{payers.map((p) => <option key={p.id} value={p.id}>Alias of {p.value}</option>)}</select></div>))}</div>
  );
}
