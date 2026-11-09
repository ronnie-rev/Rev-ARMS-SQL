import { useMemo } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { useStore } from '../store';
import { SOP_LEVEL, sopsFor, type ClientSop } from '../lib/engine/sops';
import type { Claim } from '../lib/types';

/** Client instructions that apply to this exact claim (client + payer + CPT + provider + denial code + balance). */
export function SopBanner({ claim }: { claim: Claim }) {
  const sops = useStore((s) => s.settings.client_sops?.sops) as ClientSop[] | undefined;
  const hits = useMemo(() => sopsFor(sops || [], claim), [sops, claim.client_id, claim.payer, claim.cpt, claim.provider, claim.denial_codes, claim.balance]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!hits.length) return null;
  const top = SOP_LEVEL[hits[0].level].color;
  return (
    <div className="rounded-xl px-3 py-2 text-[12.5px] space-y-1" style={{ background: top + '14', border: `1px solid ${top}55` }}>
      <div className="flex items-center gap-1.5 font-semibold" style={{ color: top }}><BookOpenCheck size={14} />Client instructions ({hits.length})</div>
      {hits.slice(0, 5).map((h) => <div key={h.id}><span className="font-semibold" style={{ color: SOP_LEVEL[h.level].color }}>{SOP_LEVEL[h.level].label}:</span> {h.instruction}</div>)}
      {hits.length > 5 && <div className="muted">+{hits.length - 5} more in Claim 360</div>}
    </div>
  );
}
