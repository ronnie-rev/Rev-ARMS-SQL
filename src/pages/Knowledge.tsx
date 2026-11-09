import { BookOpenCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '../components/ui';
import { useKb } from '../lib/kb';
import { useArticles } from './knowledge/articles';
import { Find } from './knowledge/Find';
import { Denials } from './knowledge/Denials';
import { HowTo } from './knowledge/HowTo';
import { Reference } from './knowledge/Reference';

type Tab = 'find' | 'denials' | 'howto' | 'reference';
const TABS: { id: Tab; label: string }[] = [{ id: 'find', label: 'Find' }, { id: 'denials', label: 'Denials' }, { id: 'howto', label: 'How-to' }, { id: 'reference', label: 'Reference' }];
/** Links from the older ten-tab hub (and the claim drawer) keep working: each old tab maps to its new home. */
const LEGACY: Record<string, { tab: Tab; extra?: Record<string, string> }> = { scenarios: { tab: 'denials' }, triage: { tab: 'denials' }, decoder: { tab: 'find' }, playbooks: { tab: 'howto' }, rca: { tab: 'howto', extra: { item: 'g:Root cause analysis (RCA) for denials' } }, rcm: { tab: 'howto' }, academy: { tab: 'howto' }, sops: { tab: 'howto', extra: { item: 't:sops' } }, directory: { tab: 'reference', extra: { sec: 'payers' } }, deadlines: { tab: 'reference', extra: { sec: 'deadlines' } }, library: { tab: 'reference', extra: { sec: 'payers' } } };

/** Knowledge: look something up, work a denial, follow a procedure, check a reference. */
export default function Knowledge() {
  const kb = useKb(); const articles = useArticles(); const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab') || 'find'; const legacy = LEGACY[raw]; const tab = (legacy?.tab || (TABS.some((t) => t.id === raw) ? raw : 'find')) as Tab;
  const get = (k: string) => sp.get(k) || legacy?.extra?.[k] || '';
  const go = (p: Record<string, string>) => setSp({ tab: 'find', ...p }, { replace: true });
  const q = get('q') || (raw === 'decoder' ? get('code') : '');
  return (
    <div className="space-y-4">
      <PageHeader title={<span className="flex items-center gap-2"><BookOpenCheck className="text-brand-500" size={26} />Knowledge</span>} sub="Look up a code, work a denial, follow a procedure, check a reference" />
      <Tabs<Tab> tabs={TABS} value={tab} onChange={(t) => go({ tab: t })} />
      {!kb ? <div className="panel p-10 text-center muted">Loading…</div> : <>
        {tab === 'find' && <Find kb={kb} articles={articles} q={q} setQ={(v) => setSp({ tab: 'find', ...(v ? { q: v } : {}) }, { replace: true })} go={go} />}
        {tab === 'denials' && <Denials kb={kb} code={get('code')} setCode={(c) => go({ tab: 'denials', code: c })} />}
        {tab === 'howto' && <HowTo kb={kb} articles={articles} item={get('item')} setItem={(i) => go({ tab: 'howto', item: i })} />}
        {tab === 'reference' && <Reference kb={kb} sec={get('sec')} setSec={(s) => go({ tab: 'reference', sec: s })} table={get('table')} q={get('q')} go={go} />}
      </>}
    </div>
  );
}
