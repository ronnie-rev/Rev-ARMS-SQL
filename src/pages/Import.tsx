import { useState } from 'react';
import { History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader, Tabs } from '../components/ui';
import AgingImport from './import/AgingImport';
import WorklogImport from './import/WorklogImport';

export default function ImportPage() {
  const [kind, setKind] = useState<'aging' | 'worklog'>('aging');
  return (
    <div>
      <PageHeader title="Import" sub="Same claim, same record — history, notes and ownership carry forward" actions={<Link to="/imports" className="btn"><History size={14} />Import history & undo</Link>} />
      <div className="mb-4"><Tabs value={kind} onChange={setKind} tabs={[{ id: 'aging', label: 'Aging inventory' }, { id: 'worklog', label: 'Legacy production tracker' }]} /></div>
      {kind === 'aging' ? <AgingImport /> : <WorklogImport />}
    </div>
  );
}
