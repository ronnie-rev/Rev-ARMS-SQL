# Sign-in, password reset and go-live linking

The app side of every item here is built and tested. Items marked **LINK** switch on when you add the credential or setting shown.

## Screens (preview in demo mode at `/?auth=<screen>`)
`in` · `forgot` · `sent` · `reset` · `invite` · `mfa` · `up` (create account — hidden in production). Also: **My account** (`/account`), **Help** (`/help`), public **Terms / Privacy / Security** (`/legal/…`), 404 page, crash screen with a reference code.

## Supabase (one-time)
1. **Authentication → URL Configuration:** Site URL = live URL; add live, custom-domain and preview URLs under *Redirect URLs*. Reset and invite links need this. **LINK**
2. **Authentication → Sign In / Providers → Email:** turn **off** “Allow new users to sign up” (production is invite-only). Invite people from *Authentication → Users → Invite*, then give them a `profiles` row/role (Admin → Staff & roles).
3. **Authentication → SMTP Settings:** connect Resend/SendGrid with a verified sender. Without it Supabase sends only a few emails per hour. **LINK**
4. **Authentication → Email Templates:** edit *Invite user* and *Reset password* (keep the `{{ .ConfirmationURL }}` link). Suggested subjects: “You’re invited to ClaimsIQ”, “Reset your ClaimsIQ password”.
5. **Authentication → Policies:** minimum password length 10, enable leaked-password protection. The app enforces the same policy (10+ chars, 3 of 4 character classes, not common, not your name/email).
6. **Optional MFA:** Authentication → Multi-Factor → enable TOTP, then set `VITE_MFA=on`. Users enrol on *My account*; sign-in then asks for the code. **LINK**
7. **Optional SSO:** configure a provider (Google/Microsoft) or SAML, then set `VITE_SSO_PROVIDER` (e.g. `azure`) or `VITE_SSO_DOMAIN`. A “Continue with single sign-on” button appears. **LINK**

## Netlify environment variables
| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | connect to Supabase (required) |
| `VITE_ALLOW_SIGNUP` | `true` shows “Create account” (leave unset in production) |
| `VITE_MFA` | `on` enables two-step verification screens |
| `VITE_SSO_PROVIDER` / `VITE_SSO_DOMAIN` | enables single sign-on |
| `VITE_SUPPORT_EMAIL` | support address on sign-in, Help and the “account not set up” screen |
| `VITE_ERROR_WEBHOOK` | HTTPS endpoint that receives error reports (no PHI) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REPORT_FROM`, `REPORTS_DRY_RUN` | scheduled report + client emails (functions only; never `VITE_`) |

## Before real users
Open **Admin → Go-live checklist**. Automatic items tick themselves; confirm the rest. Replace the placeholder legal text in `src/lib/legal.ts`.

## Verify a deploy
`/version.json` on your site shows the build stamp; it must match the latest commit. The same stamp is in the sidebar footer and on **Help → About this build**.
