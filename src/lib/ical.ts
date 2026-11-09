// Calendar export (RFC 5545) with the `ics` library (ISC). Titles carry claim numbers only — never patient names — so a synced calendar holds no PHI.
import { createEvents, type EventAttributes } from 'ics';

export interface CalItem { title: string; date: string; description?: string; uid?: string }
/** All-day events with reminders 7 days and 1 day before. Returns the .ics text, or '' when there is nothing to export. */
export function buildIcs(items: CalItem[], calendarName = 'ClaimsIQ deadlines'): string {
  const ev: EventAttributes[] = items.filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date)).map((i) => { const [y, m, d] = i.date.split('-').map(Number); return { start: [y, m, d] as [number, number, number], duration: { days: 1 }, title: i.title, calName: calendarName, ...(i.description ? { description: i.description } : {}), ...(i.uid ? { uid: `${i.uid}@claimsiq` } : {}), alarms: [{ action: 'display', description: i.title, trigger: { days: 7, before: true } }, { action: 'display', description: i.title, trigger: { days: 1, before: true } }] } as EventAttributes; });
  if (!ev.length) return ''; const { error, value } = createEvents(ev); if (error) throw new Error(String((error as any).message || error)); return value || '';
}
