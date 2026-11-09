import { useMemo, useState } from 'react';
import { diff_match_patch } from 'diff-match-patch';
import { Modal } from '../ui';

const text = (html: string) => html.replace(/<\/(p|div|h[1-6]|li)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
/** What changed between two versions of the letter: inserted text in green, removed text struck through (diff-match-patch, semantic clean-up). */
export function LetterCompare({ original, current, saved, onClose }: { original: string; current: string; saved?: string | null; onClose: () => void }) {
  const [base, setBase] = useState<'original' | 'saved'>(saved ? 'saved' : 'original');
  const d = useMemo(() => { const dmp = new diff_match_patch(); const a = text(base === 'saved' && saved ? saved : original), b = text(current); const diffs = dmp.diff_main(a, b); dmp.diff_cleanupSemantic(diffs); return { diffs, added: diffs.filter(([k]) => k === 1).reduce((n, [, t]) => n + t.split(/\s+/).filter(Boolean).length, 0), removed: diffs.filter(([k]) => k === -1).reduce((n, [, t]) => n + t.split(/\s+/).filter(Boolean).length, 0) }; }, [base, original, current, saved]);
  return (
    <Modal wide open onClose={onClose} title="What changed in this letter" footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="flex items-center gap-3 mb-3 text-[12.5px] flex-wrap"><span className="muted">Compare your version with</span><div className="seg"><button className={base === 'original' ? 'on' : ''} onClick={() => setBase('original')}>Library / template text</button>{saved && <button className={base === 'saved' ? 'on' : ''} onClick={() => setBase('saved')}>Last saved draft</button>}</div><span style={{ color: '#16a34a' }}>+{d.added} words</span><span style={{ color: '#dc2626' }}>−{d.removed} words</span></div>
      <div className="panel2 p-4 text-[13.5px] leading-relaxed whitespace-pre-wrap font-serif max-h-[60vh] overflow-auto">{d.diffs.map(([k, t], i) => k === 0 ? <span key={i}>{t}</span> : k === 1 ? <span key={i} className="bg-green-500/25 rounded px-0.5">{t}</span> : <span key={i} className="bg-red-500/20 line-through rounded px-0.5">{t}</span>)}</div>
      {d.added + d.removed === 0 && <p className="text-xs muted mt-2">No differences — the letter still matches this version.</p>}
    </Modal>
  );
}
