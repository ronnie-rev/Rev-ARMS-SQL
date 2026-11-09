import { useCallback, useEffect, useState } from 'react';
import { probeServices, type ServiceId, type ServiceStatus } from './services';

/** Live status of the local document services (re-checked on mount and on demand). */
export function useServices() {
  const [s, setS] = useState<Record<ServiceId, ServiceStatus> | null>(null);
  const refresh = useCallback(async (force = false) => { setS(await probeServices(force)); }, []);
  useEffect(() => { let on = true; probeServices().then((v) => on && setS(v)); return () => { on = false; }; }, []);
  return { status: s, refresh, up: (id: ServiceId) => !!s?.[id]?.up };
}
