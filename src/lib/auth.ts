// Auth helpers shared by the sign-in, reset-password and account screens. Pure functions are unit-tested; the rest wraps supabase-js.
import { supabase } from './db/supabase';

/** Public self-registration is OFF unless explicitly enabled — production is invite-only. (Also switch it off in Supabase → Authentication → Providers → Email.) */
export const ALLOW_SIGNUP = String(import.meta.env.VITE_ALLOW_SIGNUP || '') === 'true';
/** Placeholders until each is configured: set the env var in Netlify and (for SSO / MFA) enable it in Supabase. */
export const SSO_PROVIDER = String(import.meta.env.VITE_SSO_PROVIDER || '');          // e.g. google | azure | okta (supabase OAuth provider id)
export const SSO_DOMAIN = String(import.meta.env.VITE_SSO_DOMAIN || '');             // enterprise SAML: email domain registered in Supabase
export const MFA_ENABLED = String(import.meta.env.VITE_MFA || '') === 'on';
export const SUPPORT_EMAIL = String(import.meta.env.VITE_SUPPORT_EMAIL || '');
export const MIN_PASSWORD = 10;

const COMMON = new Set(['password', 'password1', 'password123', 'qwerty123', 'letmein123', 'welcome123', 'admin12345', 'iloveyou123', '1234567890', 'revrecover1']);
export interface Strength { score: 0 | 1 | 2 | 3 | 4; label: 'Too weak' | 'Weak' | 'Fair' | 'Good' | 'Strong'; ok: boolean; missing: string[] }
/** Password policy: ≥10 characters, not a common password, and at least 3 of 4 character classes. */
export function passwordStrength(pw: string, hints: string[] = []): Strength {
  const missing: string[] = []; const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length < MIN_PASSWORD) missing.push(`at least ${MIN_PASSWORD} characters`);
  if (classes < 3) missing.push('3 of: lowercase, uppercase, number, symbol');
  const low = pw.toLowerCase(); if (COMMON.has(low)) missing.push('not a common password'); if (hints.some((h) => h.length >= 4 && low.includes(h.toLowerCase()))) missing.push('must not contain your name or email');
  let score = 0; if (pw.length >= MIN_PASSWORD) score++; if (pw.length >= 14) score++; if (classes >= 3) score++; if (classes === 4 && pw.length >= 12) score++;
  if (missing.length) score = Math.min(score, 1) as 0 | 1;
  const s = Math.max(0, Math.min(4, score)) as Strength['score']; return { score: s, label: (['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const)[s], ok: missing.length === 0, missing };
}

const need = () => { if (!supabase) throw new Error('Sign-in is not configured for this environment'); return supabase; };
export const authApi = {
  async signIn(email: string, password: string) { const { error } = await need().auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; },
  async requestReset(email: string) { const { error } = await need().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/` }); if (error) throw error; },
  async setPassword(password: string) { const { error } = await need().auth.updateUser({ password }); if (error) throw error; },
  async signOutEverywhere() { const { error } = await need().auth.signOut({ scope: 'global' }); if (error) throw error; },
  async sso() { const sb = need(); if (SSO_DOMAIN) { const { error } = await sb.auth.signInWithSSO({ domain: SSO_DOMAIN }); if (error) throw error; } else if (SSO_PROVIDER) { const { error } = await sb.auth.signInWithOAuth({ provider: SSO_PROVIDER as any, options: { redirectTo: `${location.origin}/` } }); if (error) throw error; } else throw new Error('SSO is not configured'); },
  mfa: {
    async list() { const { data, error } = await need().auth.mfa.listFactors(); if (error) throw error; return data.totp; },
    async enroll() { const { data, error } = await need().auth.mfa.enroll({ factorType: 'totp' }); if (error) throw error; return data; },
    async verify(factorId: string, code: string) { const sb = need(); const ch = await sb.auth.mfa.challenge({ factorId }); if (ch.error) throw ch.error; const { error } = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code }); if (error) throw error; },
    async remove(factorId: string) { const { error } = await need().auth.mfa.unenroll({ factorId }); if (error) throw error; },
    async needsChallenge() { const { data, error } = await need().auth.mfa.getAuthenticatorAssuranceLevel(); if (error) throw error; return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'; },
  },
};
/** Friendly text for the errors people actually hit (never reveal whether an email exists). */
export function authMessage(e: unknown): string {
  const m = String((e as Error)?.message || e || ''); if (/invalid login|invalid credentials/i.test(m)) return 'Incorrect email or password.'; if (/email not confirmed/i.test(m)) return 'Confirm your email first — check your inbox.'; if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/weak|password should/i.test(m)) return 'That password does not meet the policy.'; if (/same password|different from the old/i.test(m)) return 'Choose a password you have not used before.'; if (/network|fetch/i.test(m)) return 'Cannot reach the server. Check your connection.'; return m || 'Something went wrong. Try again.';
}
