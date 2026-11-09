import { useRef } from 'react';
import Papa from 'papaparse';
import { Download, FileDown, Upload } from 'lucide-react';
import { downloadFile } from '../lib/utils';
import { toast } from './ui';

export interface SampleSpec {
  /** file name stem, e.g. "payers" */ name: string;
  /** column headers, in order */ headers: string[];
  /** example rows (header → value) for the sample file */ rows: Record<string, string>[];
  /** the current data in the same shape, for "Export for update" */ current?: () => Record<string, string>[];
  /** applies an uploaded file; return a one-line summary */ onImport?: (rows: Record<string, string>[]) => Promise<string>;
  /** extra guidance shown in the tooltip */ note?: string;
}
const csv = (headers: string[], rows: Record<string, string>[]) => Papa.unparse({ fields: headers, data: rows.map((r) => headers.map((h) => r[h] ?? '')) });

/** Sample download + (optional) export-for-update and CSV import, consistent across every Admin list and upload screen. */
export function SampleBar({ spec, compact = true }: { spec: SampleSpec; compact?: boolean }) {
  const inp = useRef<HTMLInputElement>(null); const cls = compact ? 'btn btn-sm' : 'btn';
  const onFile = async (f: File) => {
    const text = (await f.text()).replace(/^﻿/, ''); const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
    const missing = spec.headers.filter((h, i) => i === 0 && !(parsed.meta.fields || []).includes(h)); if (missing.length) return toast.err(`Missing column “${missing[0]}” — download the sample to see the expected columns`);
    try { toast.ok(await spec.onImport!(parsed.data)); } catch (e: any) { toast.err(e.message || 'Import failed'); } if (inp.current) inp.current.value = '';
  };
  return (
    <>
      <button className={cls} title={spec.note || 'A CSV with the columns and example rows'} onClick={() => downloadFile(`ClaimsIQ_${spec.name}_sample.csv`, csv(spec.headers, spec.rows))}><FileDown size={13} />Sample</button>
      {spec.current && <button className={cls} title="Download what is configured now, edit it, and import it back" onClick={() => downloadFile(`ClaimsIQ_${spec.name}_current.csv`, csv(spec.headers, spec.current!()))}><Download size={13} />Export</button>}
      {spec.onImport && <><button className={cls} title="Upload the edited CSV — rows are matched by the first column; existing rows are updated, new ones added" onClick={() => inp.current?.click()}><Upload size={13} />Import CSV</button><input ref={inp} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></>}
    </>
  );
}

export interface JsonSpec { name: string; sample: unknown; current: () => unknown; onImport: (json: any) => Promise<string>; note?: string }
/** Same idea for nested structures (automation rules): a JSON sample, export of what exists, and import. */
export function JsonBar({ spec }: { spec: JsonSpec }) {
  const inp = useRef<HTMLInputElement>(null);
  const onFile = async (f: File) => { try { toast.ok(await spec.onImport(JSON.parse(await f.text()))); } catch (e: any) { toast.err(e instanceof SyntaxError ? 'That file is not valid JSON' : e.message || 'Import failed'); } if (inp.current) inp.current.value = ''; };
  const dl = (kind: string, data: unknown) => downloadFile(`ClaimsIQ_${spec.name}_${kind}.json`, JSON.stringify(data, null, 2), 'application/json');
  return (
    <>
      <button className="btn btn-sm" title={spec.note || 'Example file showing every field'} onClick={() => dl('sample', spec.sample)}><FileDown size={13} />Sample</button>
      <button className="btn btn-sm" title="Download what exists now, edit it, and import it back" onClick={() => dl('current', spec.current())}><Download size={13} />Export</button>
      <button className="btn btn-sm" title="Upload an edited file — entries are matched by name; existing ones are updated" onClick={() => inp.current?.click()}><Upload size={13} />Import</button><input ref={inp} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </>
  );
}
