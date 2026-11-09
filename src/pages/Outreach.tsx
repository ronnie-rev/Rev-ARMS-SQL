import { HubBar } from '..//components/HubBar';
import { useMemo, useState } from 'react';
import { Copy, ExternalLink, Mail, Send } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, Field, PageHeader, toast } from '../components/ui';
import { money, relTime, todayISO, uid } from '../lib/utils';
import { supabase } from '../lib/db/supabase';
import { outreachPicks } from '../lib/engine/outreachpicks';

/** Templates carry NO patient identifiers: claims are referenced by claim number, payer, DOS-free amounts only. */
const TEMPLATES: { id: string; label: string; subject: string; body: string }[] = [
  { id: 'docs', label: 'Need documents / records', subject: 'Documents needed to work {{count}} claim(s) — {{client}}', body: 'Hi {{contact}},\n\nTo move the claims below forward we need supporting documentation (medical records / op notes / referral or authorization copies). Please upload them to the portal or reply with the files.\n\n{{claims}}\n\nTarget turnaround: {{due}}.\n\nThanks,\n{{me}}' },
  { id: 'auth', label: 'Missing authorization / referral', subject: 'Authorization / referral needed — {{count}} claim(s)', body: 'Hi {{contact}},\n\nThe payer is denying the claims below for missing authorization or referral. Can you send the auth number / referral details (or confirm none was obtained)?\n\n{{claims}}\n\nThanks,\n{{me}}' },
  { id: 'elig', label: 'Eligibility / coverage question', subject: 'Coverage verification needed — {{client}}', body: 'Hi {{contact}},\n\nThese claims were rejected or denied for coverage / eligibility. Please confirm the patient’s active insurance on the date of service, or send an updated insurance card via the portal.\n\n{{claims}}\n\nThanks,\n{{me}}' },
  { id: 'cred', label: 'Credentialing / enrollment', subject: 'Provider enrollment issue affecting claims — {{client}}', body: 'Hi {{contact}},\n\nSeveral claims are denied because the rendering provider isn’t enrolled / loaded with the payer. Please confirm credentialing status and effective dates.\n\n{{claims}}\n\nThanks,\n{{me}}' },
  { id: 'coding', label: 'Coding / documentation clarification', subject: 'Coding clarification requested — {{count}} claim(s)', body: 'Hi {{contact}},\n\nPlease have the provider review the claims below — the payer is questioning the coding / medical necessity and we need an addendum or confirmation before we appeal.\n\n{{claims}}\n\nThanks,\n{{me}}' },
  { id: 'approve', label: 'Approval to write-off / adjust', subject: 'Approval requested: adjustments — {{client}}', body: 'Hi {{contact}},\n\nWe recommend adjusting the balances below (timely filing / non-recoverable). Please reply with approval or tell us to keep working them.\n\n{{claims}}\n\nThanks,\n{{me}}' },
  { id: 'update', label: 'Status update / heads-up', subject: 'A/R update — {{client}}', body: 'Hi {{contact}},\n\nQuick update on the A/R we are working for you:\n\n{{claims}}\n\nLet us know if you have questions.\n\n{{me}}' },
  { id: 'blank', label: 'Blank message', subject: '', body: '{{claims}}' },
];

export default function Outreach() {
  const st = useStore(); const me = st.me(); const today = todayISO();
  const staff = st.clients.filter((c) => c.active);
  const [cid, setCid] = useState(st.clientScope.length === 1 ? st.clientScope[0] : staff[0]?.id || '');
  const client = st.clients.find((c) => c.id === cid);
  const [tpl, setTpl] = useState('docs'); const t = TEMPLATES.find((x) => x.id === tpl)!;
  const contacts = ((client?.settings as any)?.contacts as string) || '';
  const [to, setTo] = useState(''); const [picked, setPicked] = useState<string[]>([]); const [subject, setSubject] = useState(''); const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false); const [sending, setSending] = useState(false); const [due, setDue] = useState('3 business days');
  const [cq, setCq] = useState(''); const [cpayer, setCpayer] = useState('');
  const allOpen = useMemo(() => st.claims.filter((c) => c.client_id === cid && !c.closed_at).sort((a, b) => b.balance - a.balance), [st.claims, cid]);
  const payersOpen = useMemo(() => [...new Set(allOpen.map((c) => c.payer || 'Unknown'))].sort(), [allOpen]);
  const matched = useMemo(() => { const q = cq.trim().toLowerCase(); return allOpen.filter((c) => (!cpayer || (c.payer || 'Unknown') === cpayer) && (!q || `${c.claim_no} ${c.claim_uid || ''} ${c.encounter_no || ''} ${c.account_id || ''} ${c.payer || ''} ${c.cpt || ''} ${c.patient_name || ''}`.toLowerCase().includes(q))); }, [allOpen, cq, cpayer]);
  const open = useMemo(() => matched.slice(0, 300), [matched]);
  const picks = useMemo(() => outreachPicks(allOpen, today), [allOpen, today]);
  const log: any[] = st.userItems.filter((x) => x.kind === 'outreach').map((x) => ({ ...x.body, id: x.id, client_id: x.client_id }) as any).sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)));
  const lines = picked.map((id) => { const c = st.claims.find((x) => x.id === id); return c ? `• Claim ${c.claim_no} — ${c.payer || 'payer n/a'} — ${money(c.balance)}${c.rca ? ' — ' + c.rca : ''}` : ''; }).filter(Boolean).join('\n');
  const merge = (s: string) => s.replace(/{{contact}}/g, 'team').replace(/{{client}}/g, client?.name || '').replace(/{{count}}/g, String(picked.length)).replace(/{{claims}}/g, lines || '(no claims selected)').replace(/{{due}}/g, due).replace(/{{me}}/g, me?.full_name || 'AR team');
  const subj = touched ? subject : merge(t.subject); const text = touched ? body : merge(t.body);
  const recipients = (to || contacts).split(/[,;\s]+/).filter((x) => /.+@.+\..+/.test(x));
  const record = async (via: string) => { await st.saveItem('outreach', { at: new Date().toISOString(), by: me?.full_name, to: recipients, subject: subj, claims: picked.length, via }, { client_id: cid, shared: true }); void st.audit_('export', `Client outreach to ${client?.name} (${via}): ${subj}`, { claims: picked.length }, 'clients', cid); };
  const send = async () => {
    if (!recipients.length) return toast.err('Add at least one recipient email');
    setSending(true);
    try {
      if (!supabase) throw new Error('demo');
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/.netlify/functions/send-client-email', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ to: recipients, subject: subj, text, replyTo: me?.email }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
      await record('email'); toast.ok('Email sent');
    } catch (e: any) {
      window.location.href = `mailto:${recipients.join(',')}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(text)}`; await record('mailto');
      toast.ok(e?.message === 'demo' ? 'Opened in your mail app (demo mode)' : 'Server email unavailable — opened in your mail app');
    }
    setSending(false);
  };
  return (
    <div>
      <HubBar group="comms" />
      <PageHeader title={<span className="flex items-center gap-2"><Mail className="text-brand-400" />Client outreach</span>} sub="Ask clients for documents, authorizations, approvals or answers straight from the claims. Messages reference claim numbers only — no patient names." />
      <div className="grid xl:grid-cols-5 gap-4">
        {picks.length > 0 && <Card className="xl:col-span-5" title="Suggested asks — claims waiting on this client" actions={<span className="text-xs muted">One click picks the claims and the right message</span>}><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{picks.map((g) => <div key={g.id} className="panel2 p-3 rounded-lg"><div className="flex items-center justify-between"><b className="text-[13px]">{g.label}</b><Chip color="#6366f1">{g.claims.length}</Chip></div><div className="text-[12px] muted mt-0.5">{money(g.balance)} stuck · oldest service {g.oldestDays} days ago</div><button className="btn btn-sm mt-2" onClick={() => { setTpl(g.id); setPicked(g.claims.slice(0, 40).map((c) => c.id)); setTouched(false); toast.ok(`${Math.min(40, g.claims.length)} claims selected with the “${g.label}” message`); }}>Ask for {g.label.toLowerCase()}</button></div>)}</div></Card>}
        <Card className="xl:col-span-3" title="Compose">
          <div className="grid sm:grid-cols-3 gap-3 mb-3">
            <Field label="Client"><select className="input" value={cid} onChange={(e) => { setCid(e.target.value); setPicked([]); }}>{staff.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Template"><select className="input" value={tpl} onChange={(e) => { setTpl(e.target.value); setTouched(false); }}>{TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
            <Field label="Needed by"><input className="input" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          </div>
          <Field label="To" hint={contacts ? 'Prefilled from the client record (settings.contacts)' : 'Comma-separated; tip: store defaults on the client in Admin'}><input className="input" value={to || contacts} onChange={(e) => setTo(e.target.value)} placeholder="billing@client.com" /></Field>
          <Field label="Subject" className="mt-3"><input className="input" value={subj} onChange={(e) => { setSubject(e.target.value); setBody(text); setTouched(true); }} /></Field>
          <Field label="Message" className="mt-3"><textarea className="input font-mono text-xs" rows={14} value={text} onChange={(e) => { setBody(e.target.value); setSubject(subj); setTouched(true); }} /></Field>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn btn-primary" disabled={sending} onClick={send}><Send size={14} />Send</button>
            <button className="btn" onClick={() => { window.location.href = `mailto:${recipients.join(',')}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(text)}`; void record('mailto'); }}><ExternalLink size={14} />Open in mail app</button>
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(`${subj}\n\n${text}`); toast.ok('Copied'); }}><Copy size={14} />Copy</button>
            {touched && <button className="btn btn-ghost" onClick={() => setTouched(false)}>Reset to template</button>}
          </div>
          <p className="text-[11px] muted mt-2">“Send” uses the <code>send-client-email</code> Netlify function (needs <code>RESEND_API_KEY</code>, <code>REPORT_FROM</code>); if it isn’t configured the message opens in your mail app instead. Every send is logged.</p>
        </Card>
        <div className="xl:col-span-2 space-y-4">
          <Card title={`Attach claims (${picked.length} selected · ${matched.length} match)`} pad={false} actions={<><button className="btn btn-sm" onClick={() => setPicked([...new Set([...picked, ...matched.slice(0, 300).map((c) => c.id)])])}>Select all matching</button><button className="btn btn-sm" onClick={() => setPicked(allOpen.slice(0, 15).map((c) => c.id))}>Top 15</button><button className="btn btn-sm" onClick={() => setPicked([])}>Clear</button></>}>
            <div className="flex gap-2 p-2 border-b hair"><input className="input !py-1" placeholder="Search claim #, UID, encounter, account, CPT, payer…" value={cq} onChange={(e) => setCq(e.target.value)} /><select className="input !py-1 !w-44" value={cpayer} onChange={(e) => setCpayer(e.target.value)}><option value="">All payers</option>{payersOpen.map((p) => <option key={p}>{p}</option>)}</select></div>
            <div className="max-h-80 overflow-auto divide-y hair">{open.length === 0 ? <Empty title={cq || cpayer ? 'No claims match' : 'No open claims'} /> : open.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"><input type="checkbox" checked={picked.includes(c.id)} onChange={() => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])} /><span className="font-mono">{c.claim_no}</span><span className="muted">{c.encounter_no ? `Enc ${c.encounter_no}` : ''}</span><span className="muted truncate flex-1">{c.payer} · {c.cpt || ''}</span><b className="tabular-nums">{money(c.balance)}</b></label>))}</div>
            {matched.length > 300 && <div className="px-3 py-1.5 text-[11px] muted">Showing the top 300 by balance — refine the search to narrow.</div>}
          </Card>
          <Card title="Recent outreach" pad={false}>
            {log.filter((l) => l.client_id === cid).length === 0 ? <Empty title="Nothing sent yet" /> : <div className="divide-y hair">{log.filter((l) => l.client_id === cid).slice(0, 8).map((l) => <div key={l.id} className="px-4 py-2 text-xs"><div className="flex gap-2"><b className="truncate flex-1">{l.subject}</b><Chip color={l.via === 'email' ? '#10b981' : '#64748b'}>{l.via}</Chip></div><div className="muted">{l.by} · {l.claims} claims · {relTime(l.at)}</div></div>)}</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
