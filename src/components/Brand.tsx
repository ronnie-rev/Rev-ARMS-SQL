import { BRAND } from '../lib/brand';

/** Product monogram: rounded square with the “IQ” glyph. Pure SVG so it stays crisp at any size and in print. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={BRAND.full}>
      <defs><linearGradient id="ciq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5e6ad2" /><stop offset="1" stopColor="#2fb8d6" /></linearGradient></defs>
      <rect width="40" height="40" rx="10" fill="url(#ciq)" />
      <path d="M12 11v18" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="25" cy="19.5" r="7" fill="none" stroke="#fff" strokeWidth="3.4" />
      <path d="M26.5 24.5l5 5.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}
/** Wordmark: small “REVANTAGE” over a large “Claims” + accent “IQ”. `size` is the product-name font size in px. */
export function BrandWordmark({ size = 22, showCompany = true, name }: { size?: number; showCompany?: boolean; name?: string }) {
  const product = name && name !== BRAND.product ? name : null;
  return (
    <span className="inline-flex flex-col leading-none select-none" aria-label={BRAND.full}>
      {showCompany && <span className="uppercase font-semibold" style={{ fontSize: Math.max(8, Math.round(size * 0.34)), letterSpacing: '0.26em', color: 'var(--muted)', marginBottom: Math.round(size * 0.12) }}>{BRAND.company}</span>}
      {product ? <span className="font-bold tracking-tight" style={{ fontSize: size, letterSpacing: '-0.03em' }}>{product}</span> : <span className="font-bold" style={{ fontSize: size, letterSpacing: '-0.04em' }}>Claims<span style={{ color: 'rgb(var(--b500))' }}>IQ</span></span>}
    </span>
  );
}
/** Mark + wordmark together. */
export function BrandLockup({ size = 22, showCompany = true, name }: { size?: number; showCompany?: boolean; name?: string }) {
  return <span className="inline-flex items-center gap-2.5"><BrandMark size={Math.round(size * 1.55)} /><BrandWordmark size={size} showCompany={showCompany} name={name} /></span>;
}
