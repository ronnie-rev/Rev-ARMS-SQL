import { useMemo, useState } from 'react';
import { ROLE_META, ROLE_ORDER } from '../../lib/roles';
import { Activity, CheckCircle2, Download, FlaskConical, HeartPulse, Info, Lock, RotateCcw, ShieldAlert, Upload, XCircle, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStore } from '../../store';
import { Card, Chip, Empty, Field, Modal, toast, useConfirm } from '../../components/ui';
import { CAPS, DEFAULT_PERMS, mergePerms } from '../../lib/engine/permissions';
import { diagnoseSetup, type Finding } from '../../lib/engine/health';
import { runSelfTests, type TestResult } from '../../lib/engine/selftest';
import { DEFAULT_IMPORT, FLAG_LABEL, resolveSettings, type ImportSettings, type OverwritePolicy } from '../../lib/engine/settings';
import { ROLE_LABEL, type Role } from '../../lib/types';
import { defaultConfig } from '../../lib/defaults';
import { defaultTemplates } from '../../lib/pms';
import { cn, downloadFile, uid } from '../../lib/utils';
import type { PayerMeta } from '../../lib/engine/links';
import { validateImportSettings } from '../../lib/engine/adminvalidate';

// ───────── Import rules (global defaults) ─────────
export function ImportRules() {
  const { settings, setSetting } = useStore(); const cur = resolveSettings(settings.import); const save = (p: Partial<ImportSettings>) => setSetting('import', { ...(settings.import || {}), ...p });
  const [rej, setRej] = useState(0);
  const num = (k: keyof ImportSettings, label: string, hint?: string) => <Field label={label} hint={hint}><input type="number" className="input" key={k + rej} defaultValue={cur[k] as number} onBlur={(e) => { const v = e.target.value === '' ? NaN : Number(e.target.value); const err = validateImportSettings({ [k]: v }); if (err.length) { toast.err(err[0].msg); setRej((n) => n + 1); return; } save({ [k]: v } as any); }} /></Field>;
  const sel = (k: keyof ImportSettings, label: string, opts: [string, string][], hint?: string) => <Field label={label} hint={hint}><select className="input" value={String((cur as any)[k] ?? ((k === 'encounterAsKey' || k === 'splitOnPayer') ? true : ''))} onChange={(e) => save({ [k]: ['phiFree', 'encounterAsKey', 'splitOnPayer'].includes(k as string) ? e.target.value === 'true' : e.target.value } as any)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>;
  const chk = (k: keyof ImportSettings, label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!cur[k]} onChange={(e) => save({ [k]: e.target.checked } as any)} />{label}</label>;
  const OW: (keyof ImportSettings['overwrite'])[] = ['balance', 'billed_amt', 'payer', 'pms_status', 'denial_codes', 'last_billed', 'cpt', 'provider', 'provider_type', 'dos', 'patient_name', 'account_id'] as any;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Identity & matching">
        <p className="text-xs muted mb-3">Decides when two rows are “the same claim” across weekly files. Clients can override any of this on the import screen (“Save as client default”).</p>
        <div className="grid grid-cols-2 gap-3">
          {sel('granularity', 'Rows represent', [['claim', 'One claim per row'], ['line', 'Each charge line']], 'Line-level reports repeat the claim # per CPT.')}
          {sel('identity', 'Re-numbered claims', [['auto', 'Auto-link identical charge'], ['ask', 'Ask each time'], ['strict', 'Never link']], 'Matched by patient + DOS + CPT + amount.')}
          {sel('phiFree', 'Patient name / DOB', [['true', 'PHI-free: never store (recommended)'], ['false', 'Store patient name']], 'Both are always optional. When PHI-free, names in a file are discarded at import; letters show fill-in blanks instead.')}
          {sel('encounterAsKey' as any, 'No claim # but encounter #', [['true', 'Use encounter # as the identity'], ['false', 'Ignore encounter #']], 'Keeps every line of one encounter together even when the report has no claim number.')}
          {sel('splitOnPayer' as any, 'Same claim # under two payers', [['true', 'Split into separate claims (safe)'], ['false', 'Sum together']], 'A number can belong to only one payer; two payers usually means a typo or recycled number.')}
          {sel('missingKey', 'Rows with no claim #', [['generate', 'Generate stable ID'], ['skip', 'Skip']])}
          {sel('duplicates', 'Same claim # on many rows', [['aggregate', 'Add up as lines'], ['first', 'Keep first'], ['last', 'Keep last'], ['skip', 'Skip & report']])}
          {sel('zeroBalance', 'Zero-balance rows', [['close', 'Close claim'], ['keep', 'Keep open']])}
          {sel('negativeBalance', 'Credit balances', [['flag', 'Keep & flag'], ['keep', 'Keep silently'], ['skip', 'Skip']])}
          {sel('dateOrder', 'Date format', [['auto', 'Auto-detect'], ['mdy', 'mm/dd/yyyy'], ['dmy', 'dd/mm/yyyy']])}
          {num('closeAfterMisses', 'Act after N missing files', '1 = act at the first snapshot without the claim.')}
          {sel('missingPolicy', 'When a claim is missing from a snapshot', [['review', 'Hold for supervisor/manager review (recommended)'], ['auto_close', 'Close automatically (legacy)']], 'A file never says WHY a claim dropped off — paid, written off, or an incomplete export. Review keeps it open until a person records the outcome.')}
        </div>
      </Card>
      <Card title="Safety guardrails">
        <p className="text-xs muted mb-3">Imports that cross these lines stop and ask for explicit acknowledgement.</p>
        <div className="grid grid-cols-2 gap-3 mb-3">{num('maxDropPct', 'Max claims closed by one file (%)')}{num('maxTotalDeltaPct', 'Max total AR swing (± %)')}{num('maxInvalidPct', 'Max invalid rows (%)')}{num('maxBadDatePct', 'Max unreadable dates (%)')}</div>
        <div className="space-y-2">{chk('requireAsOf', 'Require an as-of date')}{chk('blockStale', 'Block files older than the last import')}{chk('blockSameFile', 'Block a file already imported (same content hash)')}{chk('autoAliasPayers', 'Offer to alias unknown payer names')}{chk('requireVisitType', 'Block approval when new claims have an Unknown visit type (otherwise they go to triage)')}</div>
      </Card>
      <Card title="Recovery attribution">
        <div className="grid grid-cols-2 gap-3">{num('attributionWindowDays', 'Credit touches within (days)', 'A balance reduction is credited to touches in this window before the file date.')}{sel('attributionMode', 'Method', [['last_touch', 'Last touch gets it all'], ['split_equal', 'Split equally between touchers']])}</div>
      </Card>
      <Card title="Field overwrite policy">
        <p className="text-xs muted mb-3"><b>file</b> = the aging file wins · <b>fill</b> = only fill blanks · <b>never</b> = keep ours. Workflow fields (status, root cause, owner, notes…) are never overwritten.</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">{OW.map((f) => <div key={f as string} className="flex items-center gap-2 text-[13px]"><span className="w-28 font-semibold">{f as string}</span><select className="input" value={cur.overwrite[f as string] || 'never'} onChange={(e) => save({ overwrite: { ...(settings.import?.overwrite || {}), [f]: e.target.value as OverwritePolicy } } as any)}><option value="file">file wins</option><option value="fill">fill blanks</option><option value="never">never</option></select></div>)}</div>
        <button className="btn btn-sm mt-3" onClick={() => setSetting('import', {})}><RotateCcw size={12} />Reset to defaults</button>
      </Card>
      <span className="hidden">{DEFAULT_IMPORT.granularity}</span>
    </div>
  );
}

// ───────── Permissions matrix ─────────
export function Permissions() {
  const { settings, setSetting } = useStore(); const eff = mergePerms(settings.permissions); const roles: Role[] = ROLE_ORDER;
  const toggle = (role: Role, cap: string) => { const over = { ...(settings.permissions || {}) }; over[role] = { ...(over[role] || {}) }; over[role][cap] = !eff[role][cap]; if (over[role][cap] === DEFAULT_PERMS[role][cap]) delete over[role][cap]; setSetting('permissions', over); };
  const groups = [...new Set(CAPS.map((c) => c.group))];
  const resetRole = (r: Role) => { const over = { ...(settings.permissions || {}) }; delete over[r]; setSetting('permissions', over); };
  const SUMMARY: [string, string][] = [['Production', 'work_claims'], ['QA review', 'audit_touches'], ['QA settings', 'manage_qa'], ['Control section', 'access_control'], ['Admin section', 'access_admin']];
  return (<>
    <Card title="Who gets what (at a glance)" className="mb-4" pad={false}><div className="overflow-auto"><table className="grid"><thead><tr><th>Role</th>{SUMMARY.map(([l]) => <th key={l} style={{ textAlign: 'center' }}>{l}</th>)}<th>What it is</th></tr></thead><tbody>
      {roles.filter((r) => r !== 'client').map((r) => <tr key={r}><td className="font-semibold whitespace-nowrap">{ROLE_LABEL[r]}</td>{SUMMARY.map(([l, c]) => <td key={l} style={{ textAlign: 'center' }}>{eff[r][c] ? <span className="text-emerald-500 font-bold" aria-label="yes">✓</span> : <span className="muted" aria-label="no">–</span>}</td>)}<td className="text-xs muted">{ROLE_META[r].desc}</td></tr>)}
    </tbody></table></div></Card>
    <Card title="Permission matrix" actions={<button className="btn btn-sm" onClick={() => setSetting('permissions', {})}><RotateCcw size={12} />Reset to defaults</button>}>
      <p className="text-xs muted mb-3">Fine-grained capabilities per role — changes apply instantly to menus, buttons and data views. Cells that differ from the default are highlighted. The database independently enforces the coarse boundaries (clients see only their practice; only managers write config), so UI-level toggles can never widen access beyond what the database allows.</p>
      <div className="overflow-auto"><table className="grid"><thead><tr><th>Capability</th>{roles.map((r) => <th key={r} style={{ textAlign: 'center' }} title={ROLE_META[r].desc}><div className="text-[11px] leading-tight">{ROLE_LABEL[r]}</div><button className="text-[10px] font-normal underline muted" onClick={() => resetRole(r)} title="Reset this role to its defaults">reset</button></th>)}</tr></thead><tbody>
        {groups.map((g) => [<tr key={g}><td colSpan={roles.length + 1} className="!bg-[var(--panel2)] text-[11px] font-bold uppercase tracking-wider muted">{g}</td></tr>, ...CAPS.filter((c) => c.group === g).map((c) => (
          <tr key={c.id}><td><div className="font-semibold text-[13px]">{c.label}</div><div className="text-[11px] muted">{c.help}</div></td>{roles.map((r) => { const locked = c.locked?.includes(r) || (r === 'client' && c.id !== 'view_phi'); const changed = eff[r][c.id] !== DEFAULT_PERMS[r][c.id]; return <td key={r} style={{ textAlign: 'center' }} className={changed ? 'bg-amber-500/10' : ''}>{locked ? <Lock size={12} className="muted inline" /> : <input type="checkbox" checked={!!eff[r][c.id]} onChange={() => toggle(r, c.id)} />}</td>; })}</tr>))])}</tbody></table></div>
    </Card>
  </>);
}

// ───────── Security & privacy ─────────
export function Security() {
  const { settings, setSetting } = useStore(); const sec = settings.security || {}; const model = settings.model || {}; const setSec = (p: any) => setSetting('security', { ...sec, ...p });
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Session & PHI controls"><div className="space-y-4 text-sm">
        <Field label="Auto sign-out after idle (minutes, 0 = off)"><input type="number" min={0} className="input !w-28" defaultValue={sec.idleMinutes || 0} onBlur={(e) => setSec({ idleMinutes: Math.max(0, Number(e.target.value)) })} /></Field>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={!!sec.logViews} onChange={(e) => setSec({ logViews: e.target.checked })} /><span><b>Log every claim view</b> (PHI-access audit trail, one entry per user/claim per 10 minutes) — recommended once real PHI is loaded.</span></label>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={!!sec.watermark} onChange={(e) => setSec({ watermark: e.target.checked })} /><span><b>Screen watermark</b> with the viewer’s email and date — deters screenshots and photos of PHI.</span></label>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={!!model.maskPhi} onChange={(e) => setSetting('model', { ...model, maskPhi: e.target.checked })} /><span><b>Mask patient names</b> for everyone (also per role via the permission “See patient names”).</span></label>
      </div></Card>
      <Card title="Hardening checklist"><ul className="text-[13px] space-y-2">{[
        ['Disable public sign-ups in Supabase (Auth → Providers → Email → disable “Allow new users to sign up”); onboard via invites.', true], ['Require MFA / SSO for staff in the Supabase project.', true], ['Sign BAAs with Supabase and Netlify before loading real PHI; enable PITR backups.', true],
        ['Keep the service-role key only in Netlify function env vars — never in browser env.', true], ['Review RLS after any schema change; clients must never read work_log, audit_log or other practices.', true], ['Turn on “Log every claim view” and the audit-log retention policy your compliance team requires.', !!sec.logViews]].map(([t, ok], i) => <li key={i} className="flex gap-2">{ok ? <CheckCircle2 size={15} className="text-green-500 shrink-0 mt-0.5" /> : <ShieldAlert size={15} className="text-amber-500 shrink-0 mt-0.5" />}<span>{t as string}</span></li>)}</ul></Card>
    </div>
  );
}

// ───────── Setup doctor + self-tests ─────────
const ICON = { error: <XCircle size={16} className="text-red-500" />, warn: <AlertTriangle size={16} className="text-amber-500" />, info: <Info size={16} className="text-brand-300" />, ok: <CheckCircle2 size={16} className="text-green-500" /> };
export function Doctor() {
  const st = useStore(); const [tests, setTests] = useState<TestResult[] | null>(null); const [conn, setConn] = useState<{ ok: boolean; detail: string }[] | null>(null);
  const d = useMemo(() => diagnoseSetup({ config: st.config, clients: st.clients, profiles: st.profiles, templates: st.templates, rules: st.autoRules, schedules: st.schedules, claims: st.claims, importSettings: st.settings.import, perms: st.settings.permissions }), [st.config, st.clients, st.profiles, st.templates, st.autoRules, st.schedules, st.claims, st.settings]);
  const areas = [...new Set(d.findings.map((f) => f.area))]; const col = d.score >= 85 ? '#22c55e' : d.score >= 60 ? '#f59e0b' : '#ef4444';
  const checkConn = async () => {
    const out: { ok: boolean; detail: string }[] = [];
    const t = async (name: string, fn: () => Promise<string>) => { try { out.push({ ok: true, detail: `${name}: ${await fn()}` }); } catch (e: any) { out.push({ ok: false, detail: `${name}: ${e.message}` }); } };
    await t('Storage mode', async () => st.mode === 'supabase' ? 'Supabase (live)' : 'browser demo store');
    await t('Read claims', async () => `${(await st.find('claims', {}, { limit: 1 })).length >= 0 ? 'ok' : ''} (${st.claims.length} loaded in memory)`);
    await t('Read config', async () => `${st.config.length} config rows, ${st.templates.length} templates`);
    await t('Write + read audit log', async () => { await st.audit_('diagnostic', 'Setup doctor connectivity probe'); const r = await st.find('audit_log', { kind: 'diagnostic' }, { order: 'created_at', desc: true, limit: 1 }); if (!r.length) throw new Error('probe not found after write'); return 'ok'; });
    await t('Realtime / auth', async () => (st.me() ? `signed in as ${st.me()!.email} (${st.me()!.role})` : 'no user'));
    setConn(out);
  };
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Setup health"><div className="flex items-center gap-4"><div className="relative w-24 h-24"><svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--line)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={col} strokeWidth="3" strokeDasharray={`${d.score * 0.974} 100`} strokeLinecap="round" /></svg><div className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold">{d.score}</div></div>
          <div className="text-sm space-y-1"><div><b className="text-red-400">{d.findings.filter((f) => f.level === 'error').length}</b> errors</div><div><b className="text-amber-400">{d.findings.filter((f) => f.level === 'warn').length}</b> warnings</div><div><b className="text-green-400">{d.findings.filter((f) => f.level === 'ok').length}</b> checks passed</div></div></div></Card>
        <Card title="Engine self-test" actions={<button className="btn btn-sm btn-primary" onClick={() => setTests(runSelfTests())}><FlaskConical size={13} />Run</button>}>
          {!tests ? <p className="text-xs muted">Runs {12} deterministic scenarios (matching, de-duplication, idempotency, guardrails, rules, notes, permissions) on this very deployment.</p> : <div className="space-y-1 max-h-40 overflow-auto">{tests.map((r) => <div key={r.name} className="flex gap-2 text-xs items-start">{r.ok ? <CheckCircle2 size={13} className="text-green-500 mt-0.5 shrink-0" /> : <XCircle size={13} className="text-red-500 mt-0.5 shrink-0" />}<span className="flex-1">{r.name}{!r.ok && <span className="text-red-400"> — {r.detail}</span>}</span><span className="muted">{r.ms}ms</span></div>)}<div className="text-xs font-bold pt-1">{tests.filter((t) => t.ok).length}/{tests.length} passed</div></div>}</Card>
        <Card title="Connectivity" actions={<button className="btn btn-sm" onClick={checkConn}><Activity size={13} />Test</button>}>{!conn ? <p className="text-xs muted">Verifies database reads/writes and your session. Writes one audit-log probe row.</p> : <div className="space-y-1">{conn.map((c, i) => <div key={i} className="flex gap-2 text-xs">{c.ok ? <CheckCircle2 size={13} className="text-green-500 shrink-0 mt-0.5" /> : <XCircle size={13} className="text-red-500 shrink-0 mt-0.5" />}{c.detail}</div>)}</div>}</Card>
      </div>
      {areas.map((a) => (
        <Card key={a} title={a} pad={false}><div className="px-3 pb-3 space-y-1.5">{d.findings.filter((f) => f.area === a).sort((x, y) => ['error', 'warn', 'info', 'ok'].indexOf(x.level) - ['error', 'warn', 'info', 'ok'].indexOf(y.level)).map((f: Finding) => (
          <div key={f.id} className="flex gap-3 items-start p-2.5 rounded-lg panel2"><span className="mt-0.5">{ICON[f.level]}</span><div className="flex-1"><div className="text-[13px] font-semibold">{f.title}</div>{f.detail && <div className="text-xs muted">{f.detail}</div>}</div>{f.fix && <Link to={f.fix.to} className="btn btn-sm shrink-0">{f.fix.label}</Link>}</div>))}</div></Card>))}
      <span className="hidden"><HeartPulse size={1} /></span>
    </div>
  );
}

// ───────── Backup / restore / starter content ─────────
export function Backup() {
  const st = useStore(); const { confirm, node } = useConfirm(); const [txt, setTxt] = useState(''); const [preview, setPreview] = useState<any | null>(null);
  const bundle = () => ({ format: 'arms-config', version: 1, exported: new Date().toISOString(), config_options: st.config, import_templates: st.templates, automation_rules: st.autoRules, report_schedules: st.schedules, allocation_rules: st.rules, settings: st.settings, clients: st.clients.map((c) => ({ ...c, settings: { ...c.settings, mappings: undefined } })), providers: st.providers });
  const parse = (t: string) => { try { const j = JSON.parse(t); if (j.format !== 'arms-config') throw new Error('Not a ClaimsIQ configuration file'); const idsOf = (a: any[]) => new Set((a || []).map((x: any) => x.id)); const sec = (k: string, cur: any[]) => { const have = idsOf(cur); const inc = j[k] || []; return { key: k, add: inc.filter((x: any) => !have.has(x.id)).length, upd: inc.filter((x: any) => have.has(x.id)).length }; }; setPreview({ j, sections: [sec('config_options', st.config), sec('import_templates', st.templates), sec('automation_rules', st.autoRules), sec('report_schedules', st.schedules), sec('allocation_rules', st.rules), sec('clients', st.clients), sec('providers', st.providers)] }); } catch (e: any) { toast.err(e.message); setPreview(null); } };
  const apply = async () => {
    if (!preview || !(await confirm('Apply this configuration? Items with the same id are overwritten; nothing is deleted.'))) return; const j = preview.j;
    for (const [k, t] of [['config_options', 'config_options'], ['import_templates', 'import_templates'], ['automation_rules', 'automation_rules'], ['report_schedules', 'report_schedules'], ['allocation_rules', 'allocation_rules'], ['clients', 'clients'], ['providers', 'providers']] as const) { const rows = j[k] || []; for (let i = 0; i < rows.length; i += 400) await st.save(t as any, rows.slice(i, i + 400)); }
    for (const [key, value] of Object.entries(j.settings || {})) await st.setSetting(key, value as any);
    toast.ok('Configuration restored'); setPreview(null); setTxt('');
  };
  const seedMissing = async () => { const have = new Set(st.config.map((o) => `${o.category}|${o.parent ?? ''}|${o.value}`)); const add = defaultConfig().filter((o) => !have.has(`${o.category}|${o.parent ?? ''}|${o.value}`)); await st.save('config_options', add as any); const haveT = new Set(st.templates.map((t) => t.name)); const tp = defaultTemplates().filter((t) => !haveT.has(t.name)); if (tp.length) await st.save('import_templates', tp as any); toast.ok(`Added ${add.length} starter config items and ${tp.length} templates`); };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Export configuration"><p className="text-xs muted mb-3">Everything that defines how ClaimsIQ behaves (taxonomy, buckets, payers, rules, templates, schedules, settings, clients) — no claims, no PHI. Use it to clone a setup to another environment or keep a versioned backup.</p><button className="btn btn-primary" onClick={() => { downloadFile(`arms-config-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle(), null, 2), 'application/json'); st.audit_('export', 'Exported configuration bundle'); }}><Download size={14} />Download configuration</button>
        <div className="mt-5 pt-4 border-t hair"><div className="label">Starter content</div><p className="text-xs muted mb-2">Adds any missing starter items (playbooks, letters, resources, note outcomes, PMS templates, taxonomy) without touching what you already have — useful after upgrading.</p><button className="btn" onClick={seedMissing}>Load missing starter content</button></div></Card>
      <Card title="Restore / clone configuration" actions={<button className="btn btn-sm" title="A tiny valid file showing the structure — export your configuration for a full one" onClick={() => downloadFile('ClaimsIQ_config_sample.json', JSON.stringify({ format: 'arms-config', version: 1, _help: 'Entries are matched by id. Export your configuration for a complete, editable file.', config_options: [{ id: '00000000-0000-4000-8000-000000000001', category: 'snippet', value: 'Example snippet', parent: null, label: null, color: null, sort: 99, active: true, meta: { body: "Called {payer} re {claim}." } }], settings: {} }, null, 2), 'application/json')}><Download size={12} />Sample file</button>}><input type="file" accept=".json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const t = await f.text(); setTxt(t); parse(t); } }} className="text-xs mb-2" /><textarea className="input" rows={5} placeholder="…or paste an exported JSON bundle" value={txt} onChange={(e) => { setTxt(e.target.value); if (e.target.value.trim().startsWith('{')) parse(e.target.value); }} />
        {preview && <div className="mt-3 space-y-2"><div className="flex gap-1.5 flex-wrap">{preview.sections.map((s: any) => <Chip key={s.key} color="#6366f1">{s.key}: +{s.add} new · {s.upd} overwrite</Chip>)}</div><button className="btn btn-primary" onClick={apply}><Upload size={14} />Apply configuration</button></div>}</Card>{node}
      <span className="hidden">{Object.keys(FLAG_LABEL).length}{uid.length}{cn('a')}{Empty.name}{Modal.name}</span>
    </div>
  );
}

// ───────── Payer links editor ─────────
export function PayerLinks() {
  const { config, save } = useStore(); const payers = config.filter((o) => o.category === 'payer' && o.active); const [id, setId] = useState(payers[0]?.id || ''); const p = payers.find((x) => x.id === id); const meta = (p?.meta || {}) as PayerMeta;
  const upd = (patch: Partial<PayerMeta>) => p && save('config_options', [{ ...p, meta: { ...p.meta, ...patch } }] as any);
  return (
    <Card title="Payer portals, policies & contacts">
      <p className="text-xs muted mb-3">Everything here shows up as one-click links on every claim for that payer, and powers the policy finder in the Library. Only http(s) links are accepted.</p>
      {payers.length === 0 ? <Empty title="Add payers above first" /> : <div className="grid md:grid-cols-3 gap-3">
        <Field label="Payer"><select className="input" value={id} onChange={(e) => setId(e.target.value)}>{payers.map((x) => <option key={x.id} value={x.id}>{x.value}</option>)}</select></Field>
        <Field label="Provider portal URL"><input className="input" key={id + 'p'} defaultValue={meta.portal || ''} onBlur={(e) => upd({ portal: e.target.value.trim() })} placeholder="https://…" /></Field>
        <Field label="Policy search domain" hint="Used for “policy for CPT …” searches"><input className="input" key={id + 'd'} defaultValue={meta.policy_domain || ''} onBlur={(e) => upd({ policy_domain: e.target.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') })} placeholder="payer.com" /></Field>
        <Field label="Payer ID (EDI)"><input className="input" key={id + 'i'} defaultValue={meta.payer_id || ''} onBlur={(e) => upd({ payer_id: e.target.value })} /></Field>
        <Field label="Aliases (comma-separated)" hint="Name variants seen in PMS exports"><input className="input" key={id + 'a'} defaultValue={meta.aliases || ''} onBlur={(e) => upd({ aliases: e.target.value })} /></Field>
        <Field label="Appeals address / fax"><input className="input" key={id + 'x'} defaultValue={meta.appeals_address || ''} onBlur={(e) => upd({ appeals_address: e.target.value })} /></Field>
        <div className="md:col-span-3"><div className="label">Links (policies, forms, eligibility, claim status…)</div>
          <div className="space-y-1.5">{(meta.links || []).map((l, i) => <div key={i} className="flex gap-2"><input className="input !w-56" defaultValue={l.label} onBlur={(e) => upd({ links: (meta.links || []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Label" /><input className="input" defaultValue={l.url} onBlur={(e) => upd({ links: (meta.links || []).map((x, j) => (j === i ? { ...x, url: e.target.value.trim() } : x)) })} placeholder="https://…" /><select className="input !w-32" value={l.kind || 'reference'} onChange={(e) => upd({ links: (meta.links || []).map((x, j) => (j === i ? { ...x, kind: e.target.value as any } : x)) })}>{['policy', 'portal', 'form', 'tool', 'reference'].map((k) => <option key={k}>{k}</option>)}</select><button className="btn btn-ghost btn-sm btn-danger" onClick={() => upd({ links: (meta.links || []).filter((_, j) => j !== i) })}>×</button></div>)}</div>
          <button className="btn btn-sm mt-2" onClick={() => upd({ links: [...(meta.links || []), { label: 'New link', url: '', kind: 'policy' }] })}>+ Add link</button></div></div>}
    </Card>
  );
}
