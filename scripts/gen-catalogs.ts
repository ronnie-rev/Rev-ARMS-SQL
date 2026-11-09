// Generates the check/rule/permission catalogues for docs/ENGINE.md straight from the code, so the docs cannot drift.
import { CHECKS, groupLabel } from '../src/lib/engine/checks';
import { RULE_TEMPLATES, RULE_FIELDS } from '../src/lib/engine/rules';
import { CAPS, DEFAULT_PERMS } from '../src/lib/engine/permissions';
import { DEFAULT_IMPORT, FLAG_LABEL } from '../src/lib/engine/settings';
import { writeFileSync } from 'node:fs';

const md: string[] = [];
md.push('### Quality checks\n\n| Check | Group | Default severity | Thresholds (defaults) | What it catches |\n|---|---|---|---|---|');
CHECKS.forEach((c) => md.push(`| \`${c.id}\` — ${c.title} | ${groupLabel[c.group]} | ${c.severity} | ${(c.params || []).map((p) => `${p.label}: ${p.def}`).join('; ') || '—'} | ${c.help} |`));
md.push('\n### Rule fields\n\n| Field | Type | Notes |\n|---|---|---|');
RULE_FIELDS.forEach((f) => md.push(`| \`${f.key}\` | ${f.type} | ${f.label}${f.hint ? ' — ' + f.hint : ''} |`));
md.push('\n### Built-in rule templates\n\n| Template | Runs | When | Then |\n|---|---|---|---|');
RULE_TEMPLATES.forEach((t) => md.push(`| ${t.name} | ${t.trigger} | ${t.conditions.map((c) => `${c.field} ${c.op} ${c.value ?? ''}`).join(` ${t.match} `)} | ${t.actions.map((a) => `${a.type}${a.value ? '=' + a.value : ''}`).join(', ')} |`));
md.push('\n### Managed import flags\n\n| Flag | Meaning |\n|---|---|');
Object.entries(FLAG_LABEL).forEach(([k, v]) => md.push(`| \`${k}\` | ${v.label} — ${v.help} |`));
md.push('\n### Default permissions\n\n| Capability | admin | supervisor | specialist | auditor | viewer | client |\n|---|---|---|---|---|---|---|');
CAPS.forEach((c) => md.push(`| ${c.label} | ${(['admin', 'supervisor', 'specialist', 'auditor', 'viewer', 'client'] as const).map((r) => (DEFAULT_PERMS[r][c.id] ? '✔' : '·')).join(' | ')} |`));
md.push('\n### Default import settings\n\n```json\n' + JSON.stringify(DEFAULT_IMPORT, null, 2) + '\n```');
writeFileSync('docs/.catalogs.md', md.join('\n') + '\n');
console.log('ok');
