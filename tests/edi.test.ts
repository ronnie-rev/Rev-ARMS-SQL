import { describe, expect, it } from 'vitest';
import { parseX12, summarize277, summarize835, summarize837 } from '../src/lib/engine/edi';
const isa = (extra = '') => 'ISA*00*          *00*          *ZZ*PAYERID        *ZZ*PRACTICE       *260310*1200*^*00501*000000001*0*P*:~';
const R835 = [isa(), 'GS*HP*PAYER*PRACTICE*20260310*1200*1*X*005010X221A1~', 'ST*835*0001~', 'BPR*I*350.00*C*ACH*CCP*01*999999999*DA*123456*1234567890**01*888888888*DA*654321*20260312~', 'TRN*1*EFT12345*1234567890~', 'N1*PR*ACME HEALTH~', 'N1*PE*TEST PRACTICE*XX*1234567893~',
  'CLP*CL-1001*1*500.00*300.00*50.00*12*ICN778899~', 'NM1*QC*1*DOE*JANE~', 'DTM*232*20260301~', 'CAS*CO*45*150.00~', 'SVC*HC:99213*500.00*300.00**1~', 'CAS*PR*2*50.00~', 'CLP*CL-1002*4*200.00*0.00*0.00*12*ICN778900~', 'CAS*CO*50*200.00~', 'PLB*1234567893*20261231*WO:ICN1*-0.00~', 'SE*14*0001~', 'GE*1*1~', 'IEA*1*000000001~'].join('~\n').replace('~~', '~');
describe('X12 reader', () => {
  it('rejects non-X12 text clearly', () => { expect(parseX12('hello world').error).toMatch(/does not look like an X12/); });
  it('reads an 835: payer, payment, claims, adjustments, denial reason and reconciliation', () => {
    const x = parseX12(R835); expect(x.error).toBeUndefined(); expect(x.types).toEqual(['835']); expect(x.interchanges[0].sender).toBe('PAYERID');
    const r = summarize835(x)!; expect(r.payer).toBe('ACME HEALTH'); expect(r.payeeNpi).toBe('1234567893'); expect(r.total).toBe(350); expect(r.method).toBe('ACH'); expect(r.date).toBe('2026-03-12'); expect(r.trace).toBe('EFT12345');
    expect(r.claims.length).toBe(2); const a = r.claims[0]; expect(a.controlNo).toBe('CL-1001'); expect(a.paid).toBe(300); expect(a.patientResp).toBe(50); expect(a.payerClaimNo).toBe('ICN778899'); expect(a.patientName).toBe('DOE, JANE'); expect(a.lines[0].proc).toBe('99213'); expect(a.lines[0].adjustments[0]).toMatchObject({ group: 'PR', code: '2', amount: 50 }); expect(a.dos).toBe('2026-03-01');
    const d = r.claims[1]; expect(d.statusText).toBe('Denied'); expect(d.adjustments[0]).toMatchObject({ group: 'CO', code: '50', amount: 200 }); expect(r.reconciles).toBe(false); expect(r.difference).toBe(50);
  });
  it('summarises an 837 and a 277CA', () => {
    const c837 = [isa(), 'GS*HC~', 'ST*837*1~', 'NM1*85*2*TEST PRACTICE~', 'CLM*PT-9*250.00***11:B:1*Y*A*Y*Y~', 'HI*ABK:E119*ABF:I10~', 'SV1*HC:99214*250.00*UN*1~', 'SE*5*1~'].join('~\n'); const s = summarize837(parseX12(c837))!; expect(s.billingProvider).toBe('TEST PRACTICE'); expect(s.claims[0]).toMatchObject({ id: 'PT-9', amount: 250, place: '11' }); expect(s.claims[0].dx).toEqual(['E119', 'I10']); expect(s.claims[0].lines[0].proc).toBe('99214');
    const c277 = [isa(), 'GS*HN~', 'ST*277*1~', 'TRN*2*CL-1001~', 'STC*A1:20*20260310*WQ*500.00~', 'SE*4*1~'].join('~\n'); expect(summarize277(parseX12(c277))![0]).toMatchObject({ claimId: 'CL-1001', category: 'A1', status: '20', amount: 500 });
  });
});
