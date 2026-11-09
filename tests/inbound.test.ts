import { describe, expect, it } from 'vitest';
import { noteFromMail, routeMail, stripQuoted } from '../src/lib/engine/inbound';
const C = (id: string, no: string, uid?: string) => ({ id, claim_no: no, claim_uid: uid, client_id: 'c', aliases: [] });
const pool = [C('1', 'AB123456', 'UID-9X8Y7Z'), C('2', 'CD998877'), C('3', 'AB123457')];
const M = (o: any) => ({ from: 'rep@payer.com', to: ['claims@inbox.test'], subject: '', text: '', attachments: [], ...o });
describe('email-to-claim', () => {
  it('routes by plus-address first, then a unique claim number', () => {
    expect(routeMail(M({ to: ['claims+UID9X8Y7Z@inbox.test'] }), pool).claim?.id).toBe('1');
    expect(routeMail(M({ subject: 'Re: claim CD-998877 denial' }), pool).how).toBe('claim-number');
  });
  it('never guesses when two claims match or none do', () => {
    expect(routeMail(M({ text: 'see AB123456 and AB123457' }), pool).how).toBe('ambiguous');
    expect(routeMail(M({ text: 'hello' }), pool).how).toBe('none');
  });
  it('strips quoted replies and lists attachments', () => {
    expect(stripQuoted('Please resubmit.\n\nOn Mon, Jan 5 someone wrote:\n> old stuff')).toBe('Please resubmit.');
    expect(noteFromMail(M({ subject: 'x', text: 'hi', attachments: ['eob.pdf'] }))).toContain('eob.pdf');
  });
});
