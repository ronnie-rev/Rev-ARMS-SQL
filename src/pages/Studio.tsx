import { lazy, Suspense, useEffect, useState } from 'react';
import { FileText, FileType2, ShieldCheck } from 'lucide-react';
import { Chip, PageHeader, Tabs } from '../components/ui';
import { clearInbox, peekInbox } from '../lib/docinbox';

const PdfStudio = lazy(() => import('../components/studio/PdfStudio'));
const WordStudio = lazy(() => import('../components/studio/WordStudio'));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (t: string) => t.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

/** PDF & Word Studio: edit existing or new PDFs and Word documents entirely in the browser. Documents are held in memory only. */
export default function Studio() {
  const [inbox] = useState(() => peekInbox()); useEffect(() => { clearInbox(); }, []); const [tab, setTab] = useState<'pdf' | 'word'>(inbox?.kind === 'word' || inbox?.kind === 'text' ? 'word' : 'pdf');
  const [word, setWord] = useState<{ name: string; html: string } | null>(inbox?.kind === 'word' ? { name: inbox.name, html: inbox.html } : inbox?.kind === 'text' ? { name: inbox.name.replace(/\.\w+$/, '') + '.docx', html: toHtml(inbox.text) } : null);
  const pdf = inbox?.kind === 'pdf' ? { name: inbox.name, bytes: inbox.bytes } : null;
  return (
    <div className="space-y-4">
      <PageHeader title="PDF & Word Studio" sub="Edit, redact, sign, fill, merge, split, OCR and convert documents — in this browser tab" />
      <div className="flex flex-wrap gap-2 text-[12px]"><Chip color="#16a34a"><ShieldCheck size={11} className="inline mr-1" />Nothing is uploaded</Chip><Chip color="#6366f1">Held in memory only — closing the tab discards it</Chip><Chip color="#64748b">PDF · Word (.docx) · images · RTF · HTML · text</Chip></div>
      <Tabs<'pdf' | 'word'> value={tab} onChange={setTab} tabs={[{ id: 'pdf', label: 'PDF editor' }, { id: 'word', label: 'Word editor' }]} />
      <Suspense fallback={<div className="panel2 p-8 text-sm muted">Loading editor…</div>}>
        <div className={tab === 'pdf' ? '' : 'hidden'}><PdfStudio initial={pdf} onToWord={(name, text) => { setWord({ name, html: toHtml(text) }); setTab('word'); }} /></div>
        <div className={tab === 'word' ? '' : 'hidden'}><WordStudio key={word?.name + String(word?.html.length)} initial={word} /></div>
      </Suspense>
      <p className="text-[11px] muted flex items-center gap-1.5"><FileText size={12} /><FileType2 size={12} />Documents can contain PHI. Save finished files where your policy allows; nothing is kept here after you leave.</p>
    </div>
  );
}
