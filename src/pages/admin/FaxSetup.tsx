import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { Card, Field, toast } from '../../components/ui';
import { DEFAULT_FAX_CFG, normalizeFax, resolveFaxCfg, validateFaxCfg, type FaxCfg } from '../../lib/engine/fax';
import { PROVIDERS, type FaxProvider } from '../../lib/fax/adapters';
import { supabase, hasSupabase } from '../../lib/db/supabase';
import { coverSheetPdf, mergePdfs, toB64 } from '../../lib/pdf/packet';

/** Fax setup: provider, caller ID, cover sheet text. Secrets (API keys) are set in Netlify environment variables, never here. */
export default function FaxSetup() {
  const st = useStore(); const saved = useMemo(() => resolveFaxCfg(st.settings.fax_cfg), [st.settings.fax_cfg]); const [d, setD] = useState<FaxCfg>(saved);
  const [ping, setPing] = useState<any>(null); const [testTo, setTestTo] = useState(''); const [busy, setBusy] = useState(false);
  const errs = validateFaxCfg(d); const dirty = JSON.stringify(d) !== JSON.stringify(saved); const P = PROVIDERS[d.provider as FaxProvider];
  const save = async () => { if (errs.length) return toast.err(errs[0]); await st.setSetting('fax_cfg', d as any); toast.ok('Fax settings saved'); };
  const check = async () => {
    if (!hasSupabase || st.mode === 'local') return setPing({ demo: true });
    try { const { data } = await supabase!.auth.getSession(); const r = await fetch('/.netlify/functions/fax?action=ping', { headers: { Authorization: `Bearer ${data.session?.access_token}` } }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); setPing(j); } catch (e: any) { setPing({ error: e.message }); }
  };
  const test = async () => {
    const to = normalizeFax(testTo); if (!to) return toast.err('Enter a valid number'); setBusy(true);
    try { const cover = await coverSheetPdf({ cfg: d, to: { name: 'Test recipient', fax: to }, from: { practice: 'ClaimsIQ', person: st.me()?.full_name, fax: d.fromNumber }, pages: 1, re: 'Test transmission', note: 'This is a test fax from ClaimsIQ. No patient information is included.' }); const m = await mergePdfs([cover]);
      const row = await st.sendFaxDoc({ to, subject: 'Test fax', pdfBase64: toB64(m.bytes), pages: m.pages, claimId: null, appealId: null, clientId: null }); toast.ok(row.status === 'test' ? 'Recorded (demo mode — not transmitted)' : 'Test fax queued — check the history page'); } catch (e: any) { toast.err(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <Card title="Fax from ClaimsIQ" actions={<><button className="btn btn-sm" onClick={() => setD(DEFAULT_FAX_CFG)}>Reset</button><button className="btn btn-sm btn-primary" disabled={!dirty || errs.length > 0} onClick={save}>Save</button></>}>
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Faxing"><label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={d.enabled} onChange={(e) => setD({ ...d, enabled: e.target.checked })} />Enabled for staff</label></Field>
          <Field label="Provider" hint={P?.note}><select className="input" value={d.provider} onChange={(e) => setD({ ...d, provider: e.target.value as FaxProvider })}>{(Object.keys(PROVIDERS) as FaxProvider[]).map((k) => <option key={k} value={k}>{PROVIDERS[k].label}</option>)}</select></Field>
          <Field label="From number (caller ID)" hint={P?.fromRequired ? 'Required for this provider' : 'Optional'}><input className="input" value={d.fromNumber} onChange={(e) => setD({ ...d, fromNumber: e.target.value })} placeholder="(555) 000-1234" /></Field>
          <Field label="Max pages per fax"><input type="number" className="input" value={d.maxPages} onChange={(e) => setD({ ...d, maxPages: +e.target.value })} /></Field>
        </div>
        <div className="grid md:grid-cols-2 gap-4 mt-4"><Field label="Default cover-sheet message"><textarea className="input" rows={3} value={d.coverNote} onChange={(e) => setD({ ...d, coverNote: e.target.value })} /></Field><Field label="Confidentiality notice (printed on every cover)"><textarea className="input" rows={3} value={d.confidentiality} onChange={(e) => setD({ ...d, confidentiality: e.target.value })} /></Field></div>
        {errs.map((e) => <div key={e} className="text-[12px] text-red-600 mt-2">• {e}</div>)}
      </Card>
      <Card title="Connect your provider" actions={<button className="btn btn-sm" onClick={check}>Check connection</button>}>
        <ol className="list-decimal ml-5 text-[13px] space-y-1"><li>Sign up with {P?.label} (they sign a HIPAA BAA before you send real PHI).</li><li>In Netlify → Site configuration → Environment variables add: <b>{['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', ...(P?.env || [])].join(', ')}</b>{d.provider === 'phaxio' && <> (optional <b>FAX_CALLBACK_SECRET</b> to protect delivery callbacks)</>}.</li><li>Redeploy, then press <b>Check connection</b> and send a test fax below.</li><li>Tick “Enabled for staff”, choose the provider, Save.</li></ol>
        {P?.docs && <div className="text-[12px] muted mt-2">Provider docs: {P.docs}</div>}
        {ping && <div className="mt-3 text-[13px] border rounded p-3">{ping.demo ? 'Demo mode: no server function to check. Test sends are recorded only.' : ping.error ? <span className="text-red-600">Could not reach the fax function: {ping.error}</span> : <><div>Provider on server: <b>{ping.label}</b> · {ping.enabled ? 'enabled' : 'switched off'}</div><ul className="mt-1">{ping.env.map((e: any) => <li key={e.name}>{e.set ? '✅' : '❌'} {e.name}</li>)}</ul>{ping.callback && <div className="muted text-[12px] mt-1">Delivery callback URL: {ping.callback}</div>}</>}</div>}
        <div className="flex gap-2 items-end mt-4 max-w-lg"><Field label="Send a test fax to"><input className="input" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Your own fax line" /></Field><button className="btn" disabled={busy} onClick={test}>{busy ? 'Sending…' : 'Send test'}</button></div>
      </Card>
    </div>
  );
}
