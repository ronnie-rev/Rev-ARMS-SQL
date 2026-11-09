// Natural-language → PivotConfig. Deterministic and local: it can only emit registered datasets/fields/measures, so there is
// no free-form SQL and nothing leaves the browser. Ambiguity is reported as clarifications instead of guessed.
import { DATASETS, defaultConfig, type DatasetId, type PivotConfig, type PRow } from './pivot';

const FIELD_WORDS: Record<string, string[]> = {
  client: ['client', 'clients', 'practice'], payer: ['payer', 'payers', 'insurance', 'carrier'], provider: ['provider', 'providers', 'doctor'], owner: ['owner', 'assignee'], user: ['analyst', 'analysts', 'user', 'agent', 'specialist', 'who'],
  visit: ['visit type', 'visit', 'surgery type'], bucket: ['age group', 'age groups', 'aging bucket', 'age bucket', 'bucket', 'buckets', 'age', 'aging'], queue: ['queue', 'queues', 'stage', 'stages'], family: ['work bucket', 'work buckets', 'cause', 'family'], lifecycle: ['lifecycle', 'native status'], status: ['status'],
  rca_detail: ['rca detail', 'root cause detail', 'detail'], rca: ['rca category', 'rca', 'root cause', 'root causes', 'denial reason'], end_action: ['end action', 'end actions', 'action'], tf_risk: ['timely filing', 'tfl'], dos_month: ['dos month', 'service month'], priority: ['priority'],
  week: ['week', 'weekly'], month: ['month', 'monthly'], date: ['day', 'daily', 'date'], supervisor: ['supervisor'], mode: ['mode'], type: ['type'], audit: ['qa', 'audit'],
};
const MEASURE_WORDS: Record<string, string[]> = {
  balance: ['outstanding ar', 'outstanding', 'balance', 'open ar', 'ar $', 'dollars', 'amount'], claims: ['distinct claims', 'claims', 'claim count', 'count'], avg_age: ['avg age', 'average age'], denied: ['denied claims', 'denials'], denied_pct: ['denial rate', 'denied %'], pct90: ['90+', 'over 90', '90 plus'],
  touches: ['touches', 'work events', 'activity'], tpc: ['touches per claim'], unworked: ['unworked'], fu_due: ['follow-ups due', 'followups due', 'overdue'], qa_pass: ['qa pass', 'pass rate'], amount: ['recovered', 'recoveries', 'recovery'],
};
export interface NLResult { config: PivotConfig; explanation: string[]; clarify: string[] }

export function parsePivotRequest(text: string, data: Record<DatasetId, PRow[]>): NLResult {
  const t = ' ' + text.toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ') + ' '; const explanation: string[] = []; const clarify: string[] = [];
  const dataset: DatasetId = /snapshot|as-of|as of|trend over|week over week|month over month/.test(t) ? 'snapshots' : /recover/.test(t) ? 'recoveries' : /touch|productiv|work event|analyst|qa /.test(t) && !/touches per 100/.test(t) ? 'work' : 'claims';
  const ds = DATASETS[dataset]; const cfg = defaultConfig(dataset); cfg.rows = []; cfg.cols = []; cfg.values = [];
  explanation.push(`Dataset: ${ds.label} — ${ds.grain}`);
  const fieldAt = (s: string): string[] => { const found: [number, string][] = []; const seg = ' ' + s + ' ';
    for (const f of ds.fields) for (const w of FIELD_WORDS[f.key] || []) { const i = seg.indexOf(' ' + w + ' '); if (i >= 0 && !found.some(([, k]) => k === f.key)) found.push([i, f.key]); }
    // drop shorter-word shadowing (e.g. "rca" inside "rca detail")
    return found.sort((a, b) => a[0] - b[0]).map(([, k]) => k).filter((k, i, a) => !(k === 'rca' && a.includes('rca_detail') && !/rca category/.test(s))); };
  const rowSeg = (t.match(/(?:rows?|by|per|grouped by|broken down by)\s+(.+?)(?=\s(?:columns?|across|and age|;|,? ?with|filter|for|in|where|values?|sum|count|show)\b|$)/) || [])[1];
  const rowM = t.match(/(?:in rows?|rows?:?)\s+(.+?)(?=\s+(?:columns?|across|age|values?|sum|count|filter)\b|;|$)/);
  const colM = t.match(/(?:across|columns?:?|in columns?)\s+(.+?)(?=\s+(?:values?|sum|count|filter|rows?|and sum)\b|;|$)/);
  const seg = (kind: RegExp) => { for (const part of t.split(/;|\bwith\b/)) { const m = part.match(/(.+?)\s+in\s+(rows?|columns?|values?)\b/); if (m && kind.test(m[2])) return m[1].replace(/^.*\b(?:pivot|build|show|make)\b/, ''); } return ''; };
  const rows = fieldAt(seg(/row/) || rowM?.[1] || rowSeg || ''); const cols = fieldAt(seg(/column/) || colM?.[1] || '');
  const ageCols = /age (?:group|bucket)s? in columns|age groups? in columns|across age|by age/.test(t) && dataset === 'claims';
  cfg.rows = rows.filter((r) => !cols.includes(r)); cfg.cols = cols.length ? cols : ageCols ? ['bucket'] : []; if (ageCols) cfg.rows = cfg.rows.filter((r) => r !== 'bucket');
  if (!cfg.rows.length) { cfg.rows = ds.defaults.rows || []; if (cfg.rows.length) clarify.push(`No row grouping found — using “${cfg.rows.join(', ')}”. Say “by payer” or “rows payer and RCA category”.`); }
  const picked: string[] = []; for (const m of ds.measures) for (const w of MEASURE_WORDS[m.id] || []) if (t.includes(w) && !picked.includes(m.id)) picked.push(m.id);
  const filtered = picked.filter((id) => !(id === 'claims' && picked.includes('touches') && !/claims/.test(t.replace('distinct claims', '')))); cfg.values = filtered.length ? filtered : ds.defaults.values || [ds.measures[0].id];
  if (!filtered.length) clarify.push(`No measure recognised — using ${cfg.values.map((v) => ds.measures.find((m) => m.id === v)?.label).join(', ')}.`);
  // filters: match known values mentioned in the text
  for (const f of ds.fields.filter((x) => !x.date)) { const vals = [...new Set(data[dataset].map((r) => String(r[f.key] ?? '')))].filter((v) => v.length > 2 && v !== '—' && !v.startsWith('('));
    const hit = vals.filter((v) => t.includes(' ' + v.toLowerCase() + ' ') || t.includes(' ' + v.toLowerCase() + ',') || t.includes(' ' + v.toLowerCase() + '.'));
    if (hit.length && !cfg.rows.includes(f.key) && !cfg.cols.includes(f.key) && hit.length < vals.length) { cfg.filters[f.key] = hit; explanation.push(`Filter ${f.label}: ${hit.join(', ')}`); } }
  if (/surgery|surgical/.test(t) && dataset !== 'recoveries' && !cfg.filters.visit) { cfg.filters.visit = ['Surgery']; explanation.push('Filter Visit type: Surgery'); }
  if (/closed|include closed/.test(t)) cfg.includeClosed = true;
  const top = t.match(/top (\d+)/); if (top) cfg.topN = Number(top[1]);
  if (/chart|bar/.test(t)) cfg.view = /stack/.test(t) ? 'stacked' : 'bar'; if (/trend|line/.test(t)) cfg.view = 'line';
  if (dataset === 'snapshots') {
    const dates = [...new Set(data.snapshots.map((r) => String(r.as_of)))].sort(); cfg.rows = cfg.rows.length ? cfg.rows : ['payer']; cfg.cols = cfg.cols.length ? cfg.cols : ['as_of']; cfg.delta = true;
    if (/latest two|last two|compare/.test(t)) { if (dates.length >= 2) { cfg.filters.as_of = dates.slice(-2); explanation.push(`Comparing snapshots ${dates.slice(-2).join(' → ')}`); } else clarify.push('Only one snapshot exists so far — import another aging file to compare.'); }
  }
  if (/sla|exclude client hold/.test(t)) clarify.push('SLA compliance with client-hold clocks is not in the metric registry yet — use “Follow-ups due” and snooze reasons for now.');
  explanation.push(`Rows: ${cfg.rows.join(' › ') || '—'} · Columns: ${cfg.cols.join(' › ') || '—'} · Values: ${cfg.values.join(', ')}`);
  return { config: cfg, explanation, clarify };
}
