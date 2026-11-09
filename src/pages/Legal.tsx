import { Link, useParams } from 'react-router-dom';
import { LEGAL } from '../lib/legal';

/** Public legal pages (also reachable from sign-in). Placeholder copy lives in src/lib/legal.ts. */
export default function Legal() {
  const { doc = 'terms' } = useParams(); const d = LEGAL[doc];
  return (
    <div className="min-h-full flex justify-center p-6 overflow-auto"><div className="max-w-2xl w-full py-8">
      <Link to="/" className="text-xs muted hover:underline">← Back</Link>
      {!d ? <h1 className="display text-3xl mt-4">Page not found</h1> : <><h1 className="display text-3xl mt-4">{d.title}</h1>
        <div className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.4)' }}>Placeholder text — replace the [BRACKETED] values in <code>src/lib/legal.ts</code> and have counsel review before go-live.</div>
        {d.sections.map(([h, t]) => <section key={h} className="mt-6"><h2 className="font-semibold text-[15px]">{h}</h2><p className="text-sm muted mt-1 leading-relaxed">{t}</p></section>)}</>}
      <div className="flex gap-4 text-xs muted mt-10">{Object.entries(LEGAL).map(([k, v]) => <Link key={k} className="hover:underline" to={`/legal/${k}`}>{v.title}</Link>)}<a className="hover:underline" href="/third-party-licenses.txt" target="_blank" rel="noreferrer">Open-source notices</a></div>
    </div></div>
  );
}
