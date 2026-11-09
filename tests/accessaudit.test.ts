import { describe, expect, it } from 'vitest';
import { accessAudit } from '../src/lib/engine/accessaudit';
import { mergePerms } from '../src/lib/engine/permissions';
const P = (o: any) => ({ id: o.id, email: o.id + '@x.com', full_name: o.id, active: true, role: 'user_prod', client_ids: [], client_scope: 'all', supervisor_id: 's', ...o });
const C = (id: string) => ({ id, name: 'Client ' + id }) as any;
describe('access audit', () => {
  it('flags a runaway permission, a restricted user with no clients, stranded claims and uncovered clients', () => {
    const perms = mergePerms({ user_prod: { manage_permissions: true, delete_claims: true } });
    const r = accessAudit({ profiles: [P({ id: 'boss', role: 'sr_mgmt' }), P({ id: 'u1', client_scope: 'assigned' }), P({ id: 'gone', active: false })], clients: [C('c1')], claims: [{ id: '1', assigned_to: 'gone', closed_at: null } as any], perms, phiFree: true });
    const msgs = r.findings.map((x) => x.msg).join('\n'); expect(msgs).toMatch(/can edit the permission matrix/); expect(msgs).toMatch(/permanently delete/); expect(msgs).toMatch(/restricted to assigned clients but has none/); expect(msgs).toMatch(/deactivated users/); expect(msgs).toMatch(/no production user can see/);
    expect(r.findings[0].level).toBe('high'); expect(r.roles.find((x) => x.role === 'user_prod')!.changed).toContain('+manage_permissions');
  });
  it('is quiet on a sane setup', () => {
    const r = accessAudit({ profiles: [P({ id: 'boss', role: 'sr_mgmt' }), P({ id: 'u1', client_scope: 'assigned', client_ids: ['c1'] }), P({ id: 'cl', role: 'client', client_id: 'c1' })], clients: [C('c1')], claims: [], perms: mergePerms(null), phiFree: true });
    expect(r.findings.filter((x) => x.level !== 'info')).toEqual([]);
  });
});
