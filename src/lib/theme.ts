/** Derive the whole accent ramp (--b50…--b900) from one hex colour. */
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const parse = (hex: string): [number, number, number] | null => { const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: [number, number, number], b: [number, number, number], t: number) => a.map((v, i) => clamp(v + (b[i] - v) * t)).join(' ');
export function applyAccent(hex?: string) {
  const legacy = !hex || ['#6366f1', '#5b5bd6'].includes(hex.toLowerCase()); const base = parse(legacy ? '#3b82ec' : hex); if (!base) return; const W: [number, number, number] = [255, 255, 255], K: [number, number, number] = [10, 12, 30]; const r = document.documentElement.style;
  r.setProperty('--b50', mix(base, W, 0.92)); r.setProperty('--b100', mix(base, W, 0.82)); r.setProperty('--b200', mix(base, W, 0.64)); r.setProperty('--b300', mix(base, W, 0.4)); r.setProperty('--b400', mix(base, W, 0.18));
  r.setProperty('--b500', base.join(' ')); r.setProperty('--b600', mix(base, K, 0.14)); r.setProperty('--b700', mix(base, K, 0.3)); r.setProperty('--b800', mix(base, K, 0.46)); r.setProperty('--b900', mix(base, K, 0.6));
}
