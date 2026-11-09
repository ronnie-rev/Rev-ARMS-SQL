import { describe, expect, it } from 'vitest';
import setup from '../src/lib/appeal/forge-setup.json';
import { planForgeSetup, applySenders } from '../src/lib/engine/forgesetup';
let n = 0; const uid = () => 'id' + ++n;
describe('Appeal Forge setup import', () => {
  const client: any = { id: 'c1', name: 'Center for Plastic Surgery', code: 'CPS', settings: {} };
  it('creates missing payers, fills blanks only, never overwrites', () => {
    const existing: any = { id: 'p1', category: 'payer', value: 'Aetna', meta: { appeal_fax: '999' }, active: true };
    const plan = planForgeSetup({ payers: [{ insuranceName: 'AETNA', appealFax: '111', appealAddress: 'PO Box 1', timelyFilingDays: '180' }, { insuranceName: 'New Payer', appealPhone: '555' }] }, { payers: [existing], clients: [], providers: [] }, { uid });
    expect(plan.payers.create).toHaveLength(1); expect(plan.payers.update[0].meta).toMatchObject({ appeal_fax: '999', appeal_address: 'PO Box 1', tf_days: 180 });
  });
  it('matches clients by name or code, adds letterhead, creates providers once', () => {
    const data = { clients: [{ name: 'Center for Plastic Surgery', address1: '5550 Friendship Blvd', city: 'Chevy Chase', state: 'MD', zip: '20815', groupNPI: '123' }, { name: 'Other Clinic' }], providers: [{ practice: 'Center for Plastic Surgery', name: 'DR A', role: 'Main Surgeon', npi: '1' }, { practice: 'Unknown', name: 'DR B' }], senders: [{ name: 'Pat', practice: 'Center for Plastic Surgery' }] };
    const plan = planForgeSetup(data, { payers: [], clients: [client], providers: [] }, { uid }); expect((plan.clients.update[0].settings as any).letterhead.address).toContain('Chevy Chase'); expect(plan.clients.unmatched).toEqual(['Other Clinic']); expect(plan.providers.create).toHaveLength(1); expect(plan.providers.unmatched).toBe(1); expect(plan.senders).toBe(1);
    const again = planForgeSetup(data, { payers: [], clients: [{ ...client, settings: plan.clients.update[0].settings }], providers: plan.providers.create }, { uid }); expect(again.clients.update).toHaveLength(0); expect(again.providers.create).toHaveLength(0);
    expect(applySenders(data, [client])[0].settings).toHaveProperty('senders');
  });
  it('can create missing clients and handles the bundled starter file', () => { const plan = planForgeSetup(setup as any, { payers: [], clients: [], providers: [] }, { uid, createClients: true }); expect(plan.clients.create.length).toBe(4); expect(plan.payers.create.length).toBeGreaterThan(30); expect(plan.providers.create.length).toBeGreaterThan(5); });
});
