import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn, hashColor, initials } from '../lib/utils';

export function Chip({ children, color = '#6366f1', solid = false, className }: { children: ReactNode; color?: string; solid?: boolean; className?: string }) {
  return (
    <span className={cn('chip', className)} style={solid ? { background: color, color: '#fff' } : { background: color + '16', color, borderColor: color + '30' }}>
      {children}
    </span>
  );
}
export function Avatar({ name, size = 24 }: { name?: string | null; size?: number }) {
  const n = name || '?';
  return <span title={n} className="inline-flex items-center justify-center rounded-full text-white font-bold shrink-0" style={{ width: size, height: size, fontSize: size * 0.4, background: name ? hashColor(n) : '#64748b' }}>{initials(n)}</span>;
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-7 animate-in">
      <div><h1 className="display text-[28px] leading-[1.1]">{title}</h1>{sub && <p className="text-[13px] muted mt-1 max-w-3xl">{sub}</p>}</div>
      <div className="flex items-center gap-2 flex-wrap">{actions}</div>
    </div>
  );
}

export function Spark({ data, color = 'rgb(var(--b400))', h = 44 }: { data: number[]; color?: string; h?: number }) {
  const max = Math.max(...data, 1);
  return <div className="flex items-end gap-[3px] w-full" style={{ height: h }}>{data.map((v, i) => <div key={i} className={cn('flex-1 rounded-[5px]', v ? '' : 'hatch')} style={{ height: Math.max(5, (v / max) * h), background: v ? color : undefined, opacity: v ? 0.35 + 0.65 * (v / max) : 1 }} />)}</div>;
}
export function Stat({ label, value, sub, color = '#6366f1', onClick, tone = 'plain', spark, delta, icon }: { label: string; value: ReactNode; sub?: ReactNode; color?: string; onClick?: () => void; icon?: ReactNode; tone?: 'plain' | 'blue' | 'lav' | 'ink'; spark?: number[]; delta?: { text: string; good?: boolean } }) {
  return (
    <div onClick={onClick} className={cn('panel px-5 py-4 relative animate-in flex flex-col', tone === 'blue' && 'tint-blue', tone === 'lav' && 'tint-lav', tone === 'ink' && 'tile-ink', onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-soft transition')}>
      <div className="flex items-center gap-2 text-[12.5px] muted font-medium"><span style={{ color: tone === 'ink' ? undefined : color }}>{icon ?? <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />}</span>{label}{delta && <span className={cn('ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full', delta.good ? 'pill-ok' : 'pill-bad')}>{delta.text}</span>}</div>
      <div className="stat-v text-[30px] mt-2 leading-none">{value}</div>
      {sub && <div className="text-[12px] muted mt-2">{sub}</div>}
      {spark && <div className="mt-3"><Spark data={spark} color={tone === 'ink' ? 'currentColor' : undefined} /></div>}
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn('panel animate-in', className)}>
      {(title || actions) && <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2.5"><h3 className="text-[13.5px] font-medium tracking-tight">{title}</h3><div className="flex gap-2 items-center">{actions}</div></div>}
      <div className={pad ? 'px-5 pb-5' : ''}>{children}</div>
    </section>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={cn('block', className)}><span className="label">{label}</span>{children}{hint && <span className="text-[11px] muted mt-1 block">{hint}</span>}</label>;
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  return createPortal(
    <AnimatePresence>{open && (
      <motion.div key="modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[3px]" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
        <motion.div role="dialog" aria-modal="true" className={cn('panel w-full max-h-[90vh] flex flex-col shadow-soft', wide ? 'max-w-3xl' : 'max-w-md')} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.985 }} transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b hair"><h3 className="font-semibold tracking-tight">{title}</h3><button className="btn btn-ghost btn-sm" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
          <div className="p-5 overflow-auto">{children}</div>
          {footer && <div className="px-5 py-3 border-t hair flex justify-end gap-2">{footer}</div>}
        </motion.div>
      </motion.div>)}</AnimatePresence>
  , document.body);
}

export function Drawer({ open, onClose, children, width = 640 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  return (
    <AnimatePresence>{open && (
      <motion.div key="drawer" className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
        <motion.div role="dialog" aria-modal="true" className="absolute right-0 top-0 h-full panel !rounded-none !rounded-l-2xl flex flex-col" style={{ width: `min(100vw, ${width}px)` }} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>{children}</motion.div>
      </motion.div>)}</AnimatePresence>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs-u" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} data-on={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-[11px] opacity-60 tabular-nums">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, sub, action }: { icon?: ReactNode; title: string; sub?: string; action?: ReactNode }) {
  return <div className="text-center py-12 muted">{icon && <div className="flex justify-center mb-3 opacity-60">{icon}</div>}<div className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>{title}</div>{sub && <div className="text-sm mt-1">{sub}</div>}{action && <div className="mt-4">{action}</div>}</div>;
}

/** Loading placeholders: use instead of spinners so the layout does not jump. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) { return <div className={cn('skeleton', className)} style={style} aria-hidden />; }
export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return <div role="status" aria-label="Loading" className="p-4 space-y-3">{Array.from({ length: rows }, (_, r) => <div key={r} className="flex gap-3">{Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-4" style={{ flex: c === 0 ? 2 : 1, opacity: 1 - r * 0.1 }} />)}</div>)}</div>;
}
export function SkeletonCards({ n = 4 }: { n?: number }) { return <div className="grid grid-cols-2 md:grid-cols-4 gap-3" role="status" aria-label="Loading">{Array.from({ length: n }, (_, i) => <div key={i} className="panel p-4 space-y-3"><Skeleton className="h-3 w-1/2" /><Skeleton className="h-7 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>)}</div>; }

export function Bar({ value, max, color = '#6366f1', h = 6 }: { value: number; max: number; color?: string; h?: number }) {
  return <div className="rounded-full overflow-hidden w-full" style={{ height: h, background: 'var(--panel2)' }}><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, max ? (value / max) * 100 : 0)}%`, background: color }} /></div>;
}

// ───── toasts ─────
type Toast = { id: number; kind: 'ok' | 'err' | 'info'; msg: string };
let push: (t: Omit<Toast, 'id'>) => void = () => {};
export const toast = {
  ok: (msg: string) => push({ kind: 'ok', msg }), err: (msg: string) => push({ kind: 'err', msg }), info: (msg: string) => push({ kind: 'info', msg }),
};
export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  const n = useRef(0);
  useEffect(() => { push = (t) => { const id = ++n.current; setList((l) => [...l, { ...t, id }]); setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4200); }; }, []);
  return (
    <div className="fixed bottom-4 right-4 z-[60] space-y-2" aria-live="polite"><AnimatePresence initial={false}>
      {list.map((t) => (
        <motion.div layout key={t.id} className="panel px-4 py-2.5 flex items-center gap-2 text-sm shadow-xl" initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.18 }}>
          {t.kind === 'ok' ? <CheckCircle2 size={16} className="text-green-500" /> : t.kind === 'err' ? <AlertTriangle size={16} className="text-red-500" /> : <Info size={16} className="text-brand-400" />}{t.msg}
        </motion.div>
      ))}
    </AnimatePresence></div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ msg: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = (msg: string) => new Promise<boolean>((resolve) => setState({ msg, resolve }));
  const node = (
    <Modal open={!!state} onClose={() => { state?.resolve(false); setState(null); }} title="Please confirm"
      footer={<><button className="btn" onClick={() => { state?.resolve(false); setState(null); }}>Cancel</button><button className="btn btn-primary" onClick={() => { state?.resolve(true); setState(null); }}>Confirm</button></>}>
      <p className="text-sm">{state?.msg}</p>
    </Modal>
  );
  return { confirm, node };
}
