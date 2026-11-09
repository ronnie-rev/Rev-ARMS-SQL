// Permanent claim UID: RR-<CLIENT>-<YY>-<7-digit sequence>-<check>.  Assigned once when a claim is first created and never changed by
// re-numbering, merging, reopening or re-importing.  The check character catches typos when somebody reads a UID over the phone.
// Sequences are per client, so two practices can both have "claim 1000234" and the UIDs still never collide.
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford base32 (no I L O U)
export const checkChar = (body: string): string => { let s = 0; for (let i = 0; i < body.length; i++) s = (s * 7 + body.charCodeAt(i) * (i + 3)) % 32; return ALPHA[s]; };
/** 2–5 alphanumeric characters identifying the client inside a UID */
export const clientTag = (c: { code?: string | null; name?: string | null }): string => {
  const raw = (c.code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (raw.length >= 2) return raw.slice(0, 5);
  const w = (c.name || 'CL').toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean); const t = (w.length > 1 ? w.map((x) => x[0]).join('') : (w[0] || 'CL')).slice(0, 5); return t.length >= 2 ? t : t + 'X';
};
export const formatUid = (tag: string, year: number, seq: number): string => { const body = `${tag}-${String(year % 100).padStart(2, '0')}-${String(seq).padStart(7, '0')}`; return `RR-${body}-${checkChar(body)}`; };
const RE = /^RR-([A-Z0-9]{2,5})-(\d{2})-(\d{7,})-([0-9A-Z])$/;
export function parseUid(uid: string | null | undefined): { tag: string; yy: number; seq: number } | null {
  const m = RE.exec((uid || '').trim().toUpperCase()); if (!m) return null; const body = `${m[1]}-${m[2]}-${m[3]}`; if (checkChar(body) !== m[4]) return null; return { tag: m[1], yy: Number(m[2]), seq: Number(m[3]) };
}
export const validUid = (uid: string | null | undefined) => !!parseUid(uid);
/** highest sequence already issued for this client tag (scans existing claims) */
export const maxSeq = (claims: { claim_uid?: string | null }[], tag: string): number => { let m = 0; for (const c of claims) { const p = parseUid(c.claim_uid); if (p && p.tag === tag && p.seq > m) m = p.seq; } return m; };
/** `n` consecutive UIDs starting after `startSeq` */
export const allocateUids = (tag: string, startSeq: number, n: number, now = new Date()): string[] => Array.from({ length: n }, (_, i) => formatUid(tag, now.getUTCFullYear(), startSeq + i + 1));

/** Local/demo data and legacy imports: give every claim without a UID the next number for its client (oldest first). Returns only the claims that changed. */
export function backfillUids<T extends { id: string; client_id: string; created_at: string; claim_uid?: string | null }>(claims: T[], clients: { id: string; code?: string | null; name?: string | null }[]): T[] {
  const cm = new Map(clients.map((c) => [c.id, c])); const next = new Map<string, number>(); const out: T[] = [];
  const by = new Map<string, T[]>(); for (const c of claims) { const l = by.get(c.client_id); if (l) l.push(c); else by.set(c.client_id, [c]); }
  for (const [cid, list] of by) {
    const tag = clientTag(cm.get(cid) || {}); let seq = maxSeq(list, tag); next.set(cid, seq);
    for (const c of list.filter((x) => !x.claim_uid).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) { seq++; out.push({ ...c, claim_uid: formatUid(tag, new Date(c.created_at).getUTCFullYear(), seq) }); }
  }
  return out;
}
