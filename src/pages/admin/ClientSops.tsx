import { useMemo, useState } from 'react';
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { Card, Chip, Empty, Field, Modal, toast, useConfirm } from '../../components/ui';
import { SOP_LEVEL, sopMatches, sopScope, suggestSops, type ClientSop, type SopLevel } from '../../lib/engine/sops';
import { uid } from '../../lib/utils';

const blank = (client_id: string | null): ClientSop => ({ id: uid(), client_id, title: '', instruction: '', level: 'important', active: true, payers: [], cpts: [], providers: [], codes: [], minBalance: null });
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/** Client SOPs: standing instructions that appear on every matching claim (by client, payer, CPT, provider, denial code, balance). */
export default function ClientSops() {
  const { settings, setSetting, clients, config, providers, claims } = useStore(); const { confirm, node } = useConfirm();
  const sops: ClientSop[] = settings.client_sops?.sops || []; const [fc, setFc] = useState(''); const [edit, setEdit] = useState<ClientSop | null>(null); const [paste, setPaste] = useState(false); const [text, setText] = useState(''); const [draft, setDraft] = useState<ClientSop[]>([]);
  const persist = (next: ClientSop[]) => setSetting('client_sops', { sops: next });
  const payers = useMemo(() => config.filter((o) => o.category === 'payer').map((o) => o.value), [config]); const provNames = useMemo(() => providers.map((p) => p.name), [providers]);
  const open = useMemo(() => claims.filter((c) => !c.closed_at), [claims]); const count = (s: ClientSop) => open.filter((c) => sopMatches(s, c)).length;
  const shown = sops.filter((s) => !fc || (fc === '_all' ? !s.client_id : s.client_id === fc));
  const save = async (s: ClientSop) => { if (s.title.trim().length < 3 || s.instruction.trim().length < 3) return toast.err('Give it a title and the instruction text'); await persist(sops.some((x) => x.id === s.id) ? sops.map((x) => (x.id === s.id ? s : x)) : [...sops, s]); setEdit(null); toast.ok('SOP saved — shows on matching claims for everyone'); };
  return (
    <div className="space-y-4">
      <Card title="Client SOPs & instructions" actions={<><select className="input !w-auto !py-1 text-xs" value={fc} onChange={(e) => setFc(e.target.value)}><option value="">All clients</option><option value="_all">Every client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn btn-sm" onClick={() => { setPaste(true); setDraft([]); setText(''); }}><Sparkles size={13} />Paste a document</button><button className="btn btn-sm btn-primary" onClick={() => setEdit(blank(fc && fc !== '_all' ? fc : null))}><Plus size={13} />New SOP</button></>} pad={false}>
        <p className="text-xs muted px-5 pt-1 pb-3">Each SOP says “when a claim is for this client / payer / CPT / provider / denial code, show this instruction”. It appears at the top of the claim for whoever opens it. Leave a filter empty to mean “any”.</p>
        {shown.length === 0 ? <Empty title="No SOPs yet" sub="Paste the client’s instruction email or SOP document and review the rules we draft, or add one by hand." /> :
          <div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>On</th><th>Instruction</th><th>Client</th><th>Applies when</th><th className="text-right">Open claims</th><th /></tr></thead><tbody>
            {shown.map((s) => <tr key={s.id}><td><input type="checkbox" checked={s.active} onChange={() => persist(sops.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)))} /></td>
              <td className="max-w-md"><Chip color={SOP_LEVEL[s.level].color}>{SOP_LEVEL[s.level].label}</Chip> <b>{s.title}</b><div className="text-[12px] muted">{s.instruction}</div></td><td>{clients.find((c) => c.id === s.client_id)?.name || 'Every client'}</td><td className="text-[12px]">{sopScope(s)}</td><td className="text-right">{count(s)}</td>
              <td className="whitespace-nowrap"><button className="btn btn-sm btn-ghost" aria-label="Edit" onClick={() => setEdit(s)}><Pencil size={13} /></button><button className="btn btn-sm btn-ghost" aria-label="Delete" onClick={async () => { if (await confirm(`Delete “${s.title}”?`)) await persist(sops.filter((x) => x.id !== s.id)); }}><Trash2 size={13} /></button></td></tr>)}
          </tbody></table></div>}
      </Card>
      {edit && <Modal open onClose={() => setEdit(null)} title={edit.title || 'New SOP'} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={() => save(edit)}>Save</button></>}>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3"><Field label="Client"><select className="input" value={edit.client_id || ''} onChange={(e) => setEdit({ ...edit, client_id: e.target.value || null })}><option value="">Every client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="How strict"><select className="input" value={edit.level} onChange={(e) => setEdit({ ...edit, level: e.target.value as SopLevel })}><option value="must">Must follow</option><option value="important">Important</option><option value="info">Note</option></select></Field></div>
          <Field label="Title (short)"><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. Get approval before any Aetna write-off" /></Field>
          <Field label="Instruction shown to the biller"><textarea className="input" rows={3} value={edit.instruction} onChange={(e) => setEdit({ ...edit, instruction: e.target.value })} /></Field>
          <div className="label !mb-0">Applies when (leave blank = any)</div>
          <div className="grid sm:grid-cols-2 gap-3"><Field label="Payers" hint="comma separated"><input className="input" list="sop-payers" value={edit.payers.join(', ')} onChange={(e) => setEdit({ ...edit, payers: list(e.target.value) })} /></Field>
            <Field label="CPT" hint="11042 · 110* · 97110-97140"><input className="input" value={edit.cpts.join(', ')} onChange={(e) => setEdit({ ...edit, cpts: list(e.target.value) })} /></Field>
            <Field label="Providers"><input className="input" list="sop-provs" value={edit.providers.join(', ')} onChange={(e) => setEdit({ ...edit, providers: list(e.target.value) })} /></Field>
            <Field label="Denial codes" hint="CO-50, PR-1"><input className="input" value={edit.codes.join(', ')} onChange={(e) => setEdit({ ...edit, codes: list(e.target.value) })} /></Field>
            <Field label="Balance at least $"><input type="number" className="input" value={edit.minBalance ?? ''} onChange={(e) => setEdit({ ...edit, minBalance: e.target.value === '' ? null : Number(e.target.value) })} /></Field></div>
          <datalist id="sop-payers">{payers.map((p) => <option key={p} value={p} />)}</datalist><datalist id="sop-provs">{provNames.map((p) => <option key={p} value={p} />)}</datalist>
          <div className="rounded-lg p-2.5 text-[12.5px]" style={{ background: 'var(--panel2)' }}>Matches <b>{count(edit)}</b> open claims right now.</div>
        </div></Modal>}
      {paste && <Modal wide open onClose={() => setPaste(false)} title="Draft SOPs from a document" footer={<><button className="btn" onClick={() => setPaste(false)}>Close</button><button className="btn btn-primary" disabled={!draft.length} onClick={async () => { await persist([...sops, ...draft]); setPaste(false); toast.ok(`${draft.length} SOPs added`); }}>Add {draft.length || ''} selected</button></>}>
        <div className="grid md:grid-cols-2 gap-4"><div><Field label="Paste the client’s instructions (email, SOP, checklist)" hint="One rule per line or bullet works best"><textarea className="input" rows={14} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <div className="flex gap-2 items-center mt-2"><select className="input !w-auto" value={fc} onChange={(e) => setFc(e.target.value)}><option value="">Every client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn btn-sm" disabled={text.length < 15} onClick={() => setDraft(suggestSops(text, payers, provNames, fc && fc !== '_all' ? fc : null))}><Sparkles size={13} />Draft rules</button></div></div>
          <div className="space-y-2 max-h-[420px] overflow-auto">{draft.length === 0 ? <div className="text-xs muted">Drafted rules appear here. Payers, CPT codes, denial codes and dollar amounts are picked out of each line; “never / must / always” becomes Must.</div> : draft.map((d) => <div key={d.id} className="panel2 p-2.5 text-[12.5px] space-y-1.5"><div className="flex gap-2 items-start"><select className="input !w-auto !py-0.5 text-xs" value={d.level} onChange={(e) => setDraft(draft.map((x) => (x.id === d.id ? { ...x, level: e.target.value as SopLevel } : x)))}><option value="must">Must</option><option value="important">Important</option><option value="info">Note</option></select><span className="flex-1">{d.instruction}</span><button className="btn btn-ghost btn-sm" onClick={() => setDraft(draft.filter((x) => x.id !== d.id))}>✕</button></div><div className="muted">{sopScope(d)}</div></div>)}</div></div>
      </Modal>}
      {node}
    </div>
  );
}
