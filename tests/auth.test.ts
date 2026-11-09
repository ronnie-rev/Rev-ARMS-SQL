import { describe, expect, it } from 'vitest';
import { authMessage, passwordStrength } from '../src/lib/auth';
describe('password policy', () => {
  it('rejects short, common and name-containing passwords', () => {
    expect(passwordStrength('Ab1!').ok).toBe(false); expect(passwordStrength('password123').ok).toBe(false); expect(passwordStrength('Priya-Nair-2026!', ['priya']).missing.join()).toContain('name or email'); expect(passwordStrength('alllowercaseonly').ok).toBe(false);
  });
  it('accepts a strong password and scores it', () => { const s = passwordStrength('Tr!cky-Harbor-4482'); expect(s.ok).toBe(true); expect(s.score).toBe(4); expect(passwordStrength('Abcdefgh12').ok).toBe(true); });
  it('friendly auth errors', () => { expect(authMessage(new Error('Invalid login credentials'))).toBe('Incorrect email or password.'); expect(authMessage(new Error('Email rate limit exceeded'))).toContain('Too many'); });
});
