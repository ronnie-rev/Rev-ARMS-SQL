import { Card } from '../../components/ui';

/** Email-to-claim: forward payer emails into the tool. Needs an inbound-email service; nothing here stores credentials. */
export default function EmailIntake() {
  const url = `${location.origin}/.netlify/functions/inbound-email?secret=YOUR_SECRET`;
  return (
    <Card title="Email-to-claim (setup later)">
      <p className="text-sm">Staff or payers email a claim-specific address; the message is filed as a note on that claim and logged in its activity. Anything that cannot be matched safely goes to managers as a notification — it is never guessed.</p>
      <ol className="list-decimal ml-5 text-[13px] space-y-1.5 mt-3">
        <li>Pick an inbound-email service (Postmark Inbound is simplest) and a mailbox such as <b>claims@inbox.yourdomain.com</b>.</li>
        <li>In Netlify add env vars: <b>SUPABASE_URL</b>, <b>SUPABASE_SERVICE_ROLE_KEY</b>, <b>INBOUND_EMAIL_SECRET</b> (any long random text). Redeploy.</li>
        <li>Set the service’s inbound webhook to <code className="text-[12px]">{url}</code></li>
        <li>Billers can then write to <b>claims+&lt;claim UID&gt;@inbox.yourdomain.com</b> (the UID is on each claim’s Details tab), or include the claim number in the subject.</li>
      </ol>
      <p className="text-[12px] muted mt-3">Attachments are not stored — only their file names are noted. Treat inbound email as PHI-sensitive: ask payers to quote claim numbers, not patient names.</p>
    </Card>
  );
}
