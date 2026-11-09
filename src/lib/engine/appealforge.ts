// Appeal Forge content engine: a library of appeal letters (tailored per CPT, per clinical group, per letter shape) + CPT / denial rationale blocks,
import { phoneOk } from '../phone';
// matched to a claim and merged with its facts. Pure and unit-tested. The content itself lives in src/lib/appeal/forge-content.json (lazy-loaded) and can be
// extended or overridden by managers (Admin → Appeal library) via the `appeal_lib` setting.
export interface ChargeGroup { code: string; label: string; cpts: string[] }
export interface CodeTemplate { cpt?: string; cpts?: string[]; generic?: boolean; id?: string; denialCategory: string; denialDetail: string; providerRole: string; levelDefault?: string; summary?: string; body: string }
export interface Archetype { code: string; name: string; levelDefault?: string; denialCategories: string[]; summary?: string; body: string }
export interface Scenario { id: string; chargeGroup: string; cptCodes?: string[]; denialCategory: string; denialDetail: string; providerRole: string; payerId?: string; archetype?: string; archetypeName?: string; templateBody: string; frequency?: number }
export interface Rationale { id: string; chargeGroup?: string; denialCategory?: string; title: string; body: string; cptOverride?: string | null; guidelineHooks?: string[] }
export interface ForgeContent { v: number; chargeGroups: ChargeGroup[]; cptMeta: Record<string, { description?: string; group?: string; groupLabel?: string }>; codeTemplates: CodeTemplate[]; archetypes: Archetype[]; scenarios: Scenario[]; cptRationale: Rationale[]; denialRationale: Rationale[]; denialCategories: string[]; appealLevels: string[] }
/** Manager edits: items are matched by id (custom ids start with "custom-"); `disabled` hides a built-in. */
export interface ForgeOverrides { scenarios?: (Scenario & { disabled?: boolean })[]; codeTemplates?: (CodeTemplate & { disabled?: boolean })[]; archetypes?: (Archetype & { disabled?: boolean })[]; cptRationale?: (Rationale & { disabled?: boolean })[]; denialRationale?: (Rationale & { disabled?: boolean })[]; chargeGroups?: ChargeGroup[]; cptMeta?: ForgeContent['cptMeta'] }

export const codeTemplateId = (t: CodeTemplate) => t.id || `CODE-${t.cpt || (t.cpts || []).join('+')}-${(t.denialDetail || 'GENERIC').replace(/[^A-Za-z0-9]+/g, '-').toUpperCase()}-${(t.providerRole || 'ANY').replace(/\W+/g, '')}`;
function mergeById<T>(base: T[], over: (T & { disabled?: boolean })[] | undefined, idOf: (x: T) => string): T[] { if (!over?.length) return base; const m = new Map(base.map((b) => [idOf(b), b])); for (const o of over) m.set(idOf(o), o); return [...m.values()].filter((x) => !(x as { disabled?: boolean }).disabled); }
/** Built-in content + manager overrides → the library the engine searches. */
export function mergeLibrary(base: ForgeContent, o: ForgeOverrides | null | undefined): ForgeContent {
  if (!o) return base; const groups = o.chargeGroups?.length ? [...base.chargeGroups.filter((g) => !o.chargeGroups!.some((x) => x.code === g.code)), ...o.chargeGroups] : base.chargeGroups;
  return { ...base, chargeGroups: groups, cptMeta: { ...base.cptMeta, ...(o.cptMeta || {}) }, scenarios: mergeById(base.scenarios, o.scenarios, (s) => s.id), codeTemplates: mergeById(base.codeTemplates, o.codeTemplates, codeTemplateId), archetypes: mergeById(base.archetypes, o.archetypes, (a) => a.code), cptRationale: mergeById(base.cptRationale, o.cptRationale, (r) => r.id), denialRationale: mergeById(base.denialRationale, o.denialRationale, (r) => r.id) };
}

// ───────── CPT / group lookup ─────────
const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/).map((w) => w.replace(/(ation|ing|ion|s)$/, '')).join(' ').trim();
export const cptToGroup = (c: ForgeContent) => { const m: Record<string, string> = {}; for (const g of c.chargeGroups) for (const x of g.cpts) m[x] = g.code; return m; };
export function resolveCptSearch(c: ForgeContent, term: string): string[] { const raw = (term || '').trim().toLowerCase(); if (!raw) return []; if (/^\d{5}$/.test(raw)) return [raw]; const t = norm(raw); return Object.keys(c.cptMeta).filter((k) => norm(`${c.cptMeta[k].description || ''} ${c.cptMeta[k].groupLabel || ''}`).includes(t)); }
export function primaryCpt(c: ForgeContent, raw: string | null | undefined): string | null { const first = (raw || '').split(/[,;]/)[0].trim(); const m = first.match(/\b[0-9A-Z]\d{3}[0-9A-Z]\b/); if (m) return m[0]; const r = resolveCptSearch(c, first); return r[0] || null; }
export function groupForCpt(c: ForgeContent, raw: string | null | undefined): ChargeGroup | null { const code = primaryCpt(c, raw); if (!code) return null; const g = cptToGroup(c)[code]; return g ? c.chargeGroups.find((x) => x.code === g) || null : null; }
/** Appeal-Forge role from our provider type: Main Surgeon / Co-Surgeon / PA (everything else is treated as assistant). */
export const deriveRole = (type: string | null | undefined) => (/co.?surg/i.test(type || '') ? 'Co-Surgeon' : !type || /main|surgeon|physician|^md$|^do$|attending|rendering/i.test(type) && !/assist|^pa|nurse|np\b/i.test(type) ? 'Main Surgeon' : 'PA');
const roleOk = (want: string, have: string) => (want === 'PA' ? have !== 'Main Surgeon' && have !== 'Co-Surgeon' : have === want);

export type MatchSource = 'code' | 'code-generic' | 'group-payer' | 'group' | 'shape' | 'composed' | 'none';
export interface Match { source: MatchSource; id: string; body: string; summary?: string; label: string; tier: 'tailored' | 'group' | 'shape' | 'composed' | 'none' }
const tplMatches = (t: CodeTemplate, code: string) => (t.cpts ? t.cpts.includes(code) : t.cpt === code);
/** Best template for a claim: exact-CPT template > CPT group + payer > CPT group > letter shape for the denial category > composed from the rationale libraries. */
export function findTemplate(c: ForgeContent, q: { cpt: string; denialCategory?: string; denialDetail?: string; role: string; payerId?: string | null; whatDenied?: string; whyPayerSaid?: string }): Match {
  const code = primaryCpt(c, q.cpt); const detail = q.denialDetail || '';
  if (code && detail) {
    let t = c.codeTemplates.find((x) => tplMatches(x, code) && x.denialDetail === detail && roleOk(q.role, x.providerRole)) || c.codeTemplates.find((x) => tplMatches(x, code) && x.denialDetail === detail);
    if (t) return { source: 'code', id: codeTemplateId(t), body: t.body, summary: t.summary, label: `Tailored for CPT ${code}`, tier: 'tailored' };
    const gen = c.codeTemplates.find((x) => x.generic && tplMatches(x, code)); if (gen && !detail) return { source: 'code-generic', id: codeTemplateId(gen), body: gen.body, summary: gen.summary, label: 'Generic template for this CPT', tier: 'tailored' };
  }
  const g = groupForCpt(c, q.cpt);
  if (g && detail) {
    const inGroup = c.scenarios.filter((s) => s.chargeGroup === g.code && s.denialDetail === detail && roleOk(q.role, s.providerRole)); const s = (q.payerId && inGroup.find((x) => x.payerId === q.payerId)) || inGroup.find((x) => !x.payerId);
    if (s) return { source: s.payerId ? 'group-payer' : 'group', id: s.id, body: s.templateBody, summary: s.archetypeName, label: `${g.label.split('—')[0].trim()} template`, tier: 'group' };
  }
  if (g && !detail && q.denialCategory) { const s = c.scenarios.find((x) => x.chargeGroup === g.code && x.denialCategory === q.denialCategory && roleOk(q.role, x.providerRole)); if (s) return { source: 'group', id: s.id, body: s.templateBody, summary: s.archetypeName, label: `${g.label.split('—')[0].trim()} template`, tier: 'group' }; }
  if (q.denialCategory) { const a = c.archetypes.find((x) => x.denialCategories.includes(q.denialCategory!)); if (a) return { source: 'shape', id: 'SHAPE-' + a.code, body: a.body, summary: a.summary, label: `Letter shape: ${a.name}`, tier: 'shape' }; }
  if (q.denialCategory || g) return { source: 'composed', id: 'COMPOSED', body: composeLetterBody(c, { cpt: q.cpt, denialCategory: q.denialCategory, whatDenied: q.whatDenied, whyPayerSaid: q.whyPayerSaid }), label: 'Composed from the rationale libraries', tier: 'composed' };
  return { source: 'none', id: '', body: '', label: 'No match — pick a CPT and denial reason', tier: 'none' };
}
/** Denial reasons known for a CPT, flagged by how specific the template is (2 = tailored, 1 = group, 0 = none). */
export function availableDenials(c: ForgeContent, cptRaw: string): { detail: string; category: string; level: 0 | 1 | 2 }[] {
  const code = primaryCpt(c, cptRaw); const g = groupForCpt(c, cptRaw); const out = new Map<string, { detail: string; category: string; level: 0 | 1 | 2 }>();
  const add = (detail: string, category: string, level: 1 | 2) => { const e = out.get(detail); if (!e || e.level < level) out.set(detail, { detail, category, level }); };
  if (code) for (const t of c.codeTemplates) if (tplMatches(t, code) && t.denialDetail) add(t.denialDetail, t.denialCategory, 2);
  if (g) for (const s of c.scenarios) if (s.chargeGroup === g.code) add(s.denialDetail, s.denialCategory, 1);
  if (!out.size) for (const s of c.scenarios) add(s.denialDetail, s.denialCategory, 1);
  return [...out.values()].sort((a, b) => b.level - a.level || a.detail.localeCompare(b.detail));
}
export function composeLetterBody(c: ForgeContent, o: { cpt: string; denialCategory?: string; whatDenied?: string; whyPayerSaid?: string }): string {
  const g = groupForCpt(c, o.cpt); const cr = g ? c.cptRationale.find((r) => r.chargeGroup === g.code) : null; const dr = o.denialCategory ? c.denialRationale.find((r) => r.denialCategory === o.denialCategory) : null;
  const cptBlock = cr ? cr.body : `[FILL IN: the specific clinical indication and medical-necessity rationale for CPT ${primaryCpt(c, o.cpt) || 'this service'}]`; const denBlock = dr ? dr.body : `[FILL IN: the dispute argument and regulatory/coding citation for the "${o.denialCategory || 'this'}" denial reason]`;
  return ['To Whom It May Concern:', '', 'Patient: {{Patient.Name}} (Member ID {{Patient.MemberID}})', 'Claim #: {{Claim.Number}}  |  CPT {{Claim.CPT}}  |  Date of Service: {{Claim.ServiceDate}}', 'Rendering Provider: {{Provider.Name}}  |  NPI: {{Provider.NPI}}', 'Diagnosis Code(s): {{Claim.DiagnosisCodes}}', 'Contracted Rate: {{Claim.ContractedRate}}', '',
    `We are writing to formally appeal the denial of ${o.whatDenied || 'CPT {{Claim.CPT}}'}, performed by {{Provider.Name}} for our patient, {{Patient.Name}}, on {{Claim.ServiceDate}}. {{Payer.Name}} denied this claim stating: ${o.whyPayerSaid || "[FILL IN: the payer's stated reason for denial]"}. We respectfully disagree and request that the determination be reversed.`, '', cptBlock, '', denBlock, '',
    'We respectfully request that {{Payer.Name}}:', '• Review the enclosed clinical documentation and diagnosis code(s) against the stated denial reason.', '• Identify, in writing, the specific plan provision, policy, or coding edit relied upon if any portion of this claim remains denied.', '• Overturn the denial and reprocess this claim for payment at the contracted rate of {{Claim.ContractedRate}}.', '', 'We expect a formal redetermination within standard appeal timelines. For any questions regarding this appeal, contact {{Sender.Name}} at {{Sender.Email}} or {{Sender.Phone}}.'].join('\n');
}

// ───────── merging ─────────
export const FILLIN_RE = /\[(?:FILL IN|DESCRIBE|IF APPLICABLE|IF [A-Z ]+ APPLIES)[^\]]*\]/g;
export const fillIns = (body: string) => [...new Set(body.match(FILLIN_RE) || [])];
export const mergeTokens = (body: string) => [...new Set([...body.matchAll(/\{\{([\w.]+)\}\}/g)].map((m) => m[1]))];
export const TOKEN_LABEL: Record<string, string> = { 'Patient.Name': 'Patient name', 'Patient.MemberID': 'Member ID', 'Claim.Number': 'Claim #', 'Claim.CPT': 'CPT code(s)', 'Claim.CPTCode': 'CPT code', 'Claim.ServiceDate': 'Date of service', 'Claim.DiagnosisCodes': 'Diagnosis codes', 'Claim.ContractedRate': 'Contracted rate', 'Claim.AuthNumber': 'Authorization #', 'Claim.BilledAmount': 'Billed amount', 'Claim.DenialReason': 'Denial reason', 'Provider.Name': 'Provider name', 'Provider.NPI': 'Provider NPI', 'Practice.Name': 'Practice name', 'Practice.NPI': 'Group NPI', 'Payer.Name': 'Payer name', 'Assistant.Name': 'Assistant name', 'CoSurgeon.Name': 'Co-surgeon name', 'Sender.Name': 'Sender name', 'Sender.Email': 'Sender email', 'Sender.Phone': 'Sender phone' };
export type MergeCtx = Record<string, Record<string, string | null | undefined>>;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
/** Plain-text template → HTML. Known tokens are replaced; unknown/empty ones (e.g. patient name in a PHI-free workspace) become highlighted "[label]" fill-ins the biller completes. */
export function fillTemplate(tpl: string, ctx: MergeCtx): string {
  const out = esc(tpl).replace(/\{\{([\w.]+)\}\}/g, (_, path: string) => { const [a, b] = path.split('.'); const v = ctx[a]?.[b]; return v != null && String(v).trim() !== '' ? esc(String(v)) : `[${TOKEN_LABEL[path] || path}]`; });
  return out.split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
}
export const remainingFillIns = (html: string) => { const t = html.replace(/<[^>]+>/g, ' '); const a = t.match(FILLIN_RE) || []; const b = [...t.matchAll(/\[(Patient name|Member ID|Claim #|Date of service|Diagnosis codes|Contracted rate|Authorization #|Provider NPI|Sender (?:name|email|phone)|CPT code\(s\)?|Practice name|Group NPI|Assistant name|Co-surgeon name|Billed amount|Denial reason|Provider name|Payer name)\]/g)].map((m) => m[0]); return [...a, ...b]; };

// ───────── letter assembly ─────────
export interface Letterhead { name?: string; address?: string; phone?: string; fax?: string; npi?: string; taxId?: string; logo?: string; logoTextOnly?: boolean }
export interface LetterParts { head: Letterhead; date: string; payerName?: string; payerAddress?: string; payerFax?: string; re: string; /** key claim facts shown under the RE line (no patient identifiers unless provided) */ facts?: [string, string][]; bodyHtml: string; enclosures: string[]; followUps: { date: string; note: string }[]; sender?: { name?: string; title?: string; email?: string; phone?: string }; /** rendering provider shown in the signature block */ provider?: { name?: string; credentials?: string; npi?: string }; practice?: string; ccPayerFax?: boolean }
/** The one-line contact strip used under the practice name (letter preview, PDF, Word, print). */
export const letterheadLines = (h: Letterhead, fallbackName?: string) => ({
  name: h.name || fallbackName || 'Practice',
  address: h.address || '',
  contact: [h.phone && `Phone ${h.phone}`, h.fax && `Fax ${h.fax}`].filter(Boolean).join('   ·   '),
  ids: [h.npi && `Group NPI ${h.npi}`, h.taxId && `TIN ${h.taxId}`].filter(Boolean).join('   ·   '),
});
/** Letterhead as printable HTML, laid out like the original Appeal Forge letters: logo (or practice name) on the left, address and contact beside it, heavy rule below. PDF and Word draw the same elements natively. */
export function letterheadHtml(h: Letterhead, fallbackName?: string): string {
  const l = letterheadLines(h, fallbackName); const hasLogo = !!h.logo && !h.logoTextOnly;
  const text = `${l.address ? `<div style="font-size:9.5pt;color:#334155">${esc(l.address)}</div>` : ''}${l.contact ? `<div style="font-size:9pt;color:#475569">${esc(l.contact)}</div>` : ''}${l.ids ? `<div style="font-size:8.5pt;color:#64748b">${esc(l.ids)}</div>` : ''}`;
  const left = hasLogo ? `<img src="${h.logo}" alt="" style="max-height:56px;max-width:200px;display:block">` : `<div style="font-size:15pt;font-weight:700">${esc(l.name)}</div>`;
  return `<div class="lh" style="border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:16px;${hasLogo ? 'display:flex;align-items:center;gap:14px' : ''}">${hasLogo ? `${left}<div>${text}</div>` : `${left}${text}`}</div>`;
}
/** Old letters saved before the letterhead became a separate element start with the practice name + contact bits in the first paragraph — remove it so it is not shown twice. */
export function stripLegacyHead(html: string, name?: string): string {
  if (!html || !name) return html; const m = /^\s*<p>\s*<strong>([^<]*)<\/strong>(?:<br\s*\/?>[^<]*)?<\/p>/i.exec(html);
  return m && m[1].trim().toLowerCase() === name.trim().toLowerCase() ? html.slice(m[0].length) : html;
}
/** Letter BODY as HTML (editable): date, addressee, RE block with claim facts, body, follow-up history, enclosures and signature. The letterhead is rendered separately so the logo and layout are identical on screen, in PDF, Word, print and fax. */
export function assembleLetter(p: LetterParts): string {
  const to = `<p>${esc(p.date)}</p><p><strong>${esc(p.payerName || '[Payer name]')}</strong>${p.payerAddress ? '<br>' + esc(p.payerAddress) : ''}${p.payerFax ? '<br>Fax: ' + esc(p.payerFax) : ''}</p>`;
  const plain = p.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').toLowerCase(); /* only list facts the template body does not already state */ const facts = (p.facts || []).filter(([, v]) => v && !plain.includes(String(v).toLowerCase()));
  const re = `<p><strong>RE: ${esc(p.re)}</strong></p>${facts.length ? `<p><strong>Additional Claim Details:</strong><br>${facts.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</p>` : ''}`;
  const fu = p.followUps.length ? `<p><strong>Follow-up history</strong></p>${p.followUps.map((f) => `<p>${esc(f.date)}: ${esc(f.note)}</p>`).join('')}` : '';
  const enc = p.enclosures.length ? `<p><strong>Enclosures:</strong></p><ul>${p.enclosures.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '';
  const s = p.sender; const pr = p.provider; const onBehalf = pr?.name ? `<p>On behalf of ${esc(pr.name)}${pr.credentials ? ', ' + esc(pr.credentials) : ''}${pr.npi ? ' (NPI ' + esc(pr.npi) + ')' : ''}</p>` : '';
  const sig = `<p>Sincerely,</p><p><strong>${esc(s?.name || '[Sender name]')}</strong>${s?.title ? '<br>' + esc(s.title) : ''}${p.practice ? '<br>' + esc(p.practice) : ''}${s?.phone ? '<br>' + esc(s.phone) : ''}${s?.email ? '<br>' + esc(s.email) : ''}</p>${onBehalf}`;
  return to + re + p.bodyHtml + fu + enc + sig;
}
/** Pre-export quality check — nothing blocks, everything is listed. */
export function qualityIssues(o: { html: string; payerFax?: string; payerAddress?: string; claimNo?: string; dos?: string | null; deadlineLeft?: number | null; senderName?: string; attachmentsDone?: number; attachmentsTotal?: number }): { level: 'warn' | 'info'; text: string }[] {
  const out: { level: 'warn' | 'info'; text: string }[] = []; const fi = remainingFillIns(o.html); if (fi.length) out.push({ level: 'warn', text: `${fi.length} placeholder${fi.length > 1 ? 's' : ''} still to complete: ${[...new Set(fi)].slice(0, 4).join(', ')}${fi.length > 4 ? '…' : ''}` });
  if (o.payerFax && !phoneOk(o.payerFax)) out.push({ level: 'warn', text: `The payer fax number “${o.payerFax}” does not look like a valid US number — check it before faxing` });
  if (!o.claimNo) out.push({ level: 'warn', text: 'Claim number is missing' }); if (!o.dos) out.push({ level: 'info', text: 'Date of service is not on the claim' }); if (!o.payerAddress && !o.payerFax) out.push({ level: 'warn', text: 'No appeal address or fax on file for this payer (Admin → Payers)' }); if (!o.senderName) out.push({ level: 'info', text: 'Sender name is blank' });
  if (o.deadlineLeft != null && o.deadlineLeft < 0) out.push({ level: 'warn', text: `Appeal window passed ${-o.deadlineLeft} days ago — include proof of timely filing or an exception request` }); else if (o.deadlineLeft != null && o.deadlineLeft <= 7) out.push({ level: 'warn', text: `Only ${o.deadlineLeft} days left in the appeal window — send by fax or portal today` });
  if (o.attachmentsTotal && (o.attachmentsDone ?? 0) < o.attachmentsTotal) out.push({ level: 'info', text: `${o.attachmentsTotal - (o.attachmentsDone ?? 0)} packet item(s) not yet marked ready` }); return out;
}
