// PLACEHOLDER legal copy. Replace every [BRACKETED] value and have counsel approve the text before go-live. These render at /legal/terms, /legal/privacy, /legal/security
// (public — reachable from the sign-in page), so the text lives in the code, not in the database.
export const COMPANY = { name: '[COMPANY LEGAL NAME]', product: 'Revantage ClaimsIQ', address: '[STREET, CITY, STATE ZIP]', privacyEmail: '[privacy@yourdomain.com]', securityEmail: '[security@yourdomain.com]', effective: '[EFFECTIVE DATE]' };
export const LEGAL: Record<string, { title: string; sections: [string, string][] }> = {
  terms: { title: 'Terms of Use', sections: [
    ['Agreement', `These terms govern access to ${COMPANY.product}, provided by ${COMPANY.name}. By signing in you agree to them. Effective ${COMPANY.effective}.`],
    ['Authorised use', 'Access is limited to people invited by their organisation. You are responsible for activity under your account, must keep your password confidential, and must not share accounts.'],
    ['Protected health information', 'You may only access patient information you need for your job. Access is logged. Misuse may result in suspension and legal action.'],
    ['Availability and changes', 'We aim for continuous availability but do not guarantee it. We may update the service and these terms; continued use means you accept the changes.'],
    ['Contact', `${COMPANY.name}, ${COMPANY.address}.`] ] },
  privacy: { title: 'Privacy Notice', sections: [
    ['What we collect', 'Account details (name, work email, role), usage and audit logs, and the claim and patient information your organisation uploads.'],
    ['How we use it', 'To provide the service, secure it, support you, and meet legal obligations. We do not sell personal information.'],
    ['Sharing', 'With the practice (client) that owns the data, and with sub-processors needed to run the service (hosting, database, email). [LIST SUB-PROCESSORS].'],
    ['Retention and your rights', 'Data is kept for the period agreed with your organisation. Requests about your information: ' + COMPANY.privacyEmail + '.'] ] },
  security: { title: 'Security & HIPAA', sections: [
    ['Safeguards', 'Role-based access, row-level database security, encrypted connections, audit logging of sensitive actions, and automatic sign-out after inactivity.'],
    ['Business associate agreement', `Organisations that send protected health information must have a signed business associate agreement with ${COMPANY.name}. [CONFIRM BAA STATUS WITH COUNSEL].`],
    ['Reporting a concern', `Suspected security issue or privacy incident: ${COMPANY.securityEmail}. Include what you saw and when; do not include patient information.`] ] },
};
