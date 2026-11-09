import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useStore } from '../../store';
import { Card, Field, toast } from '../../components/ui';
import { resolveScoreCfg, type ScoreCfg } from '../../lib/engine/scorecard';

const n = (min: number, max: number, label: string) => z.coerce.number({ message: `${label} must be a number` }).min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`);
const schema = z.object({
  windowDays: n(7, 365, 'Recent window'), baselineDays: n(14, 730, 'Baseline'), minN: n(3, 1000, 'Minimum claims'), topCpts: n(1, 50, 'CPT rows'),
  thresholds: z.object({ denialPts: n(1, 100, 'Denial rate change'), payDaysPct: n(1, 500, 'Days-to-pay change'), appealWinPts: n(1, 100, 'Appeal win-rate drop'), payPctPts: n(1, 100, 'Paid % drop'), newCarcShare: n(1, 100, 'New denial-code share') }),
}).refine((v) => v.baselineDays >= v.windowDays, { path: ['baselineDays'], message: 'Baseline must be at least as long as the recent window' });

/** Central thresholds for payer scorecards and behaviour-change alerts (react-hook-form + zod: inline validation). */
export default function ScoreRules() {
  const { settings, setSetting } = useStore(); const cfg = resolveScoreCfg(settings.score_cfg);
  const { register, handleSubmit, formState: { errors, isDirty, isSubmitting }, reset } = useForm<ScoreCfg>({ resolver: zodResolver(schema) as any, defaultValues: cfg });
  const onSubmit = handleSubmit(async (v) => { await setSetting('score_cfg', v as any); reset(v); toast.ok('Saved'); }, () => toast.err('Fix the highlighted fields'));
  const F = (label: string, name: any, err?: { message?: string }, hint?: string) => <Field label={label} hint={err?.message ? undefined : hint}><input type="number" className="input" aria-invalid={!!err} {...register(name)} style={err ? { borderColor: '#e5484d' } : undefined} />{err?.message && <span className="text-[11px] text-red-500 mt-1 block">{err.message}</span>}</Field>;
  const t = errors.thresholds as any;
  return (
    <form onSubmit={onSubmit}><Card title="Payer scorecard rules" actions={<button type="submit" className="btn btn-primary btn-sm" disabled={!isDirty || isSubmitting}>Save</button>}>
      <div className="grid md:grid-cols-4 gap-4">
        {F('Recent window (days)', 'windowDays', errors.windowDays)}{F('Baseline length (days)', 'baselineDays', errors.baselineDays, 'Compared against the part before the recent window')}{F('Minimum claims to compare', 'minN', errors.minN, 'Smaller samples never alert')}{F('CPT rows per payer', 'topCpts', errors.topCpts)}
        {F('Denial rate change (pts)', 'thresholds.denialPts', t?.denialPts, 'Alert when it moves this many percentage points')}{F('Days-to-pay change (%)', 'thresholds.payDaysPct', t?.payDaysPct)}{F('Appeal win-rate drop (pts)', 'thresholds.appealWinPts', t?.appealWinPts)}{F('Paid % drop (pts)', 'thresholds.payPctPts', t?.payPctPts)}
        {F('New denial-code share (%)', 'thresholds.newCarcShare', t?.newCarcShare, 'A code that was rare now makes up this share')}
      </div>
      <p className="text-xs muted mt-3">Alerts are checked daily and on demand from Payer scorecards. Each alert is created once per payer/CPT/kind/month.</p>
    </Card></form>
  );
}
