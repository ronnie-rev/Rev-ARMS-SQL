import { Card, Chip } from '../../components/ui';
import { useServices } from '../../lib/useServices';
import { resetProbe, type ServiceId } from '../../lib/services';
import lock from '../../../deploy/services/versions.lock.json';

const LABEL: Record<ServiceId, string> = { gotenberg: 'Gotenberg — Office → PDF', stirling: 'Stirling-PDF — server OCR & compression', languagetool: 'LanguageTool — spelling & grammar' };
/** Status of the optional local document services. They run on your own server (deploy/services), pinned by version and digest. */
export default function DocServices() {
  const { status, refresh } = useServices(); const svc = lock.services as Record<string, any>;
  return (
    <div className="space-y-4">
      <Card title="Local document services" actions={<button className="btn btn-sm" onClick={() => { resetProbe(); void refresh(true); }}>Check again</button>}>
        <p className="text-sm muted mb-3">Optional helpers that run on <b>your own server</b> next to ClaimsIQ — never in the cloud. Without them every feature still works in the browser; with them you get exact-layout Word / Excel to PDF (including old .doc / .xls files), server-side OCR for very large scans, and spelling &amp; grammar checks.</p>
        <div className="divide-y hair">{(Object.keys(LABEL) as ServiceId[]).map((id) => { const s = status?.[id]; const l = svc[id]; return <div key={id} className="py-2.5 flex items-center gap-3 flex-wrap text-sm"><div className="flex-1 min-w-[220px]"><b>{LABEL[id]}</b><div className="text-[11.5px] muted">Locked to {l.image}:{l.tag} · {l.license}</div></div>{!status ? <Chip color="#64748b">checking…</Chip> : s?.up ? <Chip color="#16a34a">running</Chip> : <Chip color="#d97706">not running{s?.detail ? ` — ${s.detail}` : ''}</Chip>}</div>; })}</div>
      </Card>
      <Card title="How to turn them on">
        <ol className="list-decimal ml-5 text-sm space-y-1.5"><li>On the server (Docker installed): <code className="px-1 rounded panel2">cd deploy/services &amp;&amp; docker compose up -d</code></li><li>Check the pins and the services: <code className="px-1 rounded panel2">npm run services:live</code></li><li>Your web server forwards <code className="px-1 rounded panel2">/svc/</code> to <code className="px-1 rounded panel2">127.0.0.1:8088</code> (already in <code className="px-1 rounded panel2">deploy/nginx.conf</code> and <code className="px-1 rounded panel2">deploy/Caddyfile</code>).</li><li>Click “Check again” above.</li></ol>
        <ul className="list-disc ml-5 text-[12.5px] muted mt-3 space-y-1"><li>Images are pinned by tag <b>and</b> digest (locked {lock.lockedAt}). To upgrade, change both in <code>docker-compose.yml</code> and <code>versions.lock.json</code>, run <code>npm run services:lock</code>, then re-test Studio and Document OCR.</li><li>The services sit on an internal Docker network with no internet access; only an allow-list proxy listens, on 127.0.0.1. The Stirling-PDF web UI is never exposed.</li><li>Documents are processed in memory / temporary files and are not stored by ClaimsIQ.</li></ul>
      </Card>
    </div>
  );
}
