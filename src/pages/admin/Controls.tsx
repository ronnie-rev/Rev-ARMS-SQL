import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useStore } from '../../store';
import { Card, Chip } from '../../components/ui';

interface Ctl { tab?: string; to?: string; title: string; what: string; cap: string; state: (s: ReturnType<typeof useStore.getState>) => string | null }
const has = (k: string) => (s: ReturnType<typeof useStore.getState>) => (s.settings[k] ? 'Customised' : null);
const n = (x: number, w: string) => (x ? `${x} ${w}` : null);
const CONTROLS: { group: string; items: Ctl[] }[] = [
  { group: 'Deadlines & money', items: [
    { tab: 'limits', title: 'Filing limits', what: 'Timely-filing, appeal and corrected-claim days per payer / client; escalation timing and who is told', cap: 'manage_payer_rules', state: (s) => n(s.payerLimits.length, 'payer rows') },
    { tab: 'reimb', title: 'Reimbursement', what: 'Client GCR %, payer flat %, fee schedules, underpayment thresholds', cap: 'manage_payer_rules', state: (s) => n(s.feeSchedules.length, 'fee schedules') },
    { tab: 'payers', title: 'Payers', what: 'Payer directory, contacts, IVR tips, links', cap: 'manage_payer_rules', state: (s) => n(s.config.filter((o) => o.category === 'payer').length, 'payers') } ] },
  { group: 'How work is ordered & assigned', items: [
    { tab: 'prirules', title: 'Smart priority', what: 'Weights behind the worklist order (deadline, value, age, follow-ups)', cap: 'manage_payer_rules', state: has('priority_cfg') },
    { to: '/allocation', title: 'Allocation rules', what: 'Who gets which claims, plus a priority boost per rule', cap: 'assign', state: (s) => n(s.rules.length, 'rules') },
    { tab: 'recrules', title: 'Recommendation rules', what: 'Build your own “if a claim looks like this, recommend that” rules, with templates', cap: 'manage_payer_rules', state: (s) => n((s.settings.custom_recs?.rules || []).length, 'rules') },
    { tab: 'intelrules', title: 'Intelligence rules', what: 'Next-best-action rules, forecast, capacity, signals, unresolved tracker, calculators', cap: 'manage_payer_rules', state: has('intel_cfg') },
    { tab: 'bulkrules', title: 'Bulk actions', what: 'Which bulk changes are allowed, size limits, undo window', cap: 'manage_payer_rules', state: has('bulk_cfg') },
    { tab: 'buckets2', title: 'Issue buckets', what: 'Per-client lanes for recurring bulk problems', cap: 'manage_payer_rules', state: (s) => n(s.config.filter((o) => o.category === 'issue_bucket').length, 'buckets') } ] },
  { group: 'Denials, appeals & guidance', items: [
    { tab: 'playbooks', title: 'Denial checklists', what: 'Step-by-step checklists tied to denial codes (! = required)', cap: 'edit_content', state: (s) => n(s.config.filter((o) => o.category === 'playbook').length, 'checklists') },
    { tab: 'letters', title: 'Appeal & letter templates', what: 'Letters, auto-pick by denial code or kind, variables', cap: 'edit_content', state: (s) => n(s.config.filter((o) => o.category === 'letter').length, 'templates') },
    { tab: 'clientsops', title: 'Client SOPs', what: 'Standing client instructions shown on matching claims (payer, CPT, provider, denial code)', cap: 'manage_payer_rules', state: (s) => (s.settings.client_sops?.sops?.length ? `${s.settings.client_sops.sops.length} SOPs` : null) },
    { tab: 'faxsetup', title: 'Fax setup', what: 'Provider, caller ID and cover sheet for sending appeals by fax', cap: 'manage_payer_rules', state: (s) => (s.settings.fax_cfg?.enabled ? 'On' : null) },
    { tab: 'applib', title: 'Appeal library', what: 'Edit the appeal letters, rationales and CPT groups behind the Appeal Builder', cap: 'manage_payer_rules', state: (s) => (s.settings.appeal_lib && Object.keys(s.settings.appeal_lib).length ? 'Customised' : null) },
    { tab: 'aforms', title: 'Payer appeal forms', what: 'Upload official PDFs; fields map to claim data', cap: 'manage_payer_rules', state: (s) => n(s.payerForms.length, 'forms') },
    { tab: 'carc', title: 'Denial codes', what: 'Meaning, root cause and first move per code', cap: 'edit_content', state: (s) => n(s.config.filter((o) => o.category === 'carc').length, 'codes') },
    { tab: 'articles', title: 'Knowledge articles', what: 'SOPs, checklists, escalation guides', cap: 'edit_content', state: (s) => n(s.config.filter((o) => o.category === 'kb_article').length, 'articles') } ] },
  { group: 'Quality & monitoring', items: [
    { tab: 'scorerules', title: 'Payer scorecard alerts', what: 'When a payer’s behaviour change raises an alert', cap: 'manage_payer_rules', state: has('score_cfg') },
    { to: '/qa?tab=settings', title: 'QA program', what: 'Sampling, scorecard, error types & weights, scoring model, KPI targets', cap: 'manage_qa', state: () => null },
    { tab: 'clients', title: 'Clients & providers', what: 'Practices, PMS, supervisors, timely-filing defaults', cap: 'manage_clients', state: (s) => n(s.clients.length, 'clients') } ] },
];
/** One place to find every rule a manager can change, what it controls and whether it has been customised. */
export default function Controls() {
  const s = useStore(); const can = s.has;
  return (
    <div className="space-y-4">
      <Card title="Manager controls"><p className="text-sm muted">Every rule that shapes how the work is ordered, escalated, recommended and measured. Changes apply to everyone immediately and are recorded in the audit log. “Defaults” means nothing has been changed yet.</p></Card>
      {CONTROLS.map((g) => { const items = g.items.filter((i) => can(i.cap)); if (!items.length) return null; return (
        <div key={g.group}><div className="label mb-2">{g.group}</div><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{items.map((i) => { const st = i.state(s); return (
          <Link key={i.title} to={i.to || `/admin?tab=${i.tab}`} className="panel p-4 flex flex-col gap-1.5 hover:shadow-glow transition"><div className="flex items-center gap-2"><b className="text-[13.5px]">{i.title}</b>{st ? <Chip color="#22c55e">{st}</Chip> : <Chip color="#94a3b8">Defaults</Chip>}<ArrowRight size={14} className="ml-auto muted" /></div><div className="text-xs muted">{i.what}</div></Link>); })}</div></div>); })}
    </div>
  );
}
