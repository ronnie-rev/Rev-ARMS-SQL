import { describe, expect, it } from 'vitest';
import { getBlock, organize, parseNote, pastTense, removeBlock, stepsBody, upsertBlock } from '../src/lib/engine/notedoc';
describe('structured notes', () => {
  it('adding call details after checklist steps keeps both (the old overwrite bug)', () => {
    let n = upsertBlock('', 'Steps taken', stepsBody(['Verify eligibility on the DOS.', 'Review the EOB']));
    n = upsertBlock(n, 'Contact', 'Called Aetna by phone; spoke with Maria (ref 88123). Claim denied CO-50.');
    expect(n).toContain('Steps taken:\n• Verified eligibility on the DOS\n• Reviewed the EOB'); expect(n).toContain('Contact: Called Aetna'); expect(n.indexOf('Contact:')).toBeLessThan(n.indexOf('Steps taken:'));
    n = upsertBlock(n, 'Contact', 'Called Aetna again; claim in process.');
    expect(getBlock(n, 'Contact')).toBe('Called Aetna again; claim in process.'); expect(getBlock(n, 'Steps taken')).toContain('Reviewed the EOB');
  });
  it('keeps free text the user typed, appends without duplicating, and removes one block', () => {
    let n = 'rep was rude, call dropped'; n = upsertBlock(n, 'Next step', 'File an appeal.'); expect(n.startsWith('rep was rude, call dropped')).toBe(true);
    n = upsertBlock(n, 'Notes', 'policy changed in July', 'append'); n = upsertBlock(n, 'Notes', 'policy changed in July', 'append'); expect(n.match(/policy changed in July/g)!.length).toBe(1);
    n = upsertBlock(n, 'Steps taken', '• Verified eligibility'); n = upsertBlock(n, 'Steps taken', '• Called payer', 'append'); expect(getBlock(n, 'Steps taken').split('\n').length).toBe(2);
    expect(parseNote(removeBlock(n, 'Next step')).blocks.some((b) => b.label === 'Next step')).toBe(false);
  });
  it('organize puts blocks in order and tidies punctuation', () => {
    const o = organize('call dropped\nNext step: file appeal\nSteps taken:\nchecked eligibility\n- reviewed eos\nContact: called aetna');
    expect(o.split('\n').filter((l) => /^(Contact|Steps taken|Next step|Notes):/.test(l)).map((l) => l.split(':')[0])).toEqual(['Contact', 'Steps taken', 'Next step', 'Notes']); expect(o).toContain('• checked eligibility'); expect(o).toContain('Next step: File appeal.'); expect(o).toContain('Notes: Call dropped.');
  });
  it('past tense helper', () => { expect(pastTense('Verify member ID.')).toBe('Verified member ID'); expect(pastTense('Eligibility confirmed')).toBe('Eligibility confirmed'); });
});
