import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { Card, Chip } from '../../components/ui';
import { fmtDateTime } from '../../lib/utils';

/** Everything testers sent from the in-app feedback button. */
export default function Feedback() {
  const st = useStore(); const [rows, setRows] = useState<any[]>([]); const load = () => void st.listFeedback().then(setRows); useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title={`Tester feedback (${rows.filter((r) => r.status === 'new').length} new)`} pad={false}>
      <div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>When</th><th>Who</th><th>Type</th><th>Where</th><th>Message</th><th>Status</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td>{fmtDateTime(r.created_at)}</td><td>{r.user_name || '—'}</td><td><Chip color={r.kind === 'bug' ? '#dc2626' : r.kind === 'idea' ? '#6366f1' : '#64748b'}>{r.kind}</Chip></td><td className="text-[12px]">{r.route}<div className="muted">{r.build}</div></td><td className="max-w-md whitespace-pre-wrap">{r.body}</td>
          <td><select className="input !py-0.5" value={r.status} onChange={(e) => { void st.setFeedbackStatus(r.id, e.target.value).then(load); }}><option value="new">new</option><option value="seen">seen</option><option value="done">done</option></select></td></tr>)}
        {!rows.length && <tr><td colSpan={6} className="text-center muted py-8">Nothing yet.</td></tr>}
      </tbody></table></div>
    </Card>
  );
}
