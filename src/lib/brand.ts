// Single source of truth for the product name. "Revantage" is the company; "ClaimsIQ" is the product and gets the visual weight.
export const BRAND = { company: 'Revantage', product: 'ClaimsIQ', full: 'Revantage ClaimsIQ', tagline: 'Claims intelligence, recovered.', byline: 'A Revantage HBS product' } as const;
/** Names saved by earlier versions that should now read as the current product name. */
export const LEGACY_NAMES = ['ARMS', 'RevRecover', 'Rev Recover'];
export const resolveAppName = (saved?: string | null) => (!saved || LEGACY_NAMES.includes(saved.trim()) ? BRAND.product : saved.trim());
