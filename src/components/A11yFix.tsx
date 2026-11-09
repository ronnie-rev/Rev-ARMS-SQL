import { useEffect } from 'react';

// Safety net for accessibility: icon-only buttons get a name from their icon, and unlabeled inputs get one from the nearest
// label, table header or placeholder. Runs on DOM changes (throttled) so dynamically rendered editors are covered too.
const ICON: Record<string, string> = { 'arrow-up': 'Move up', 'arrow-down': 'Move down', trash: 'Delete', 'trash-2': 'Delete', plus: 'Add', x: 'Close', copy: 'Duplicate', pencil: 'Edit', 'chevron-down': 'Expand', 'chevron-up': 'Collapse', 'chevron-right': 'Open', 'chevron-left': 'Back', search: 'Search', 'more-horizontal': 'More', 'grip-vertical': 'Drag handle', 'external-link': 'Open link', download: 'Download', upload: 'Upload', save: 'Save', eye: 'View', 'rotate-ccw': 'Undo', 'refresh-cw': 'Refresh', check: 'Confirm', filter: 'Filter', settings: 'Settings', bell: 'Notifications', sun: 'Toggle theme', moon: 'Toggle theme' };
const txt = (e: Element | null | undefined) => (e?.textContent || '').replace(/\s+/g, ' ').trim();

function fix(root: ParentNode) {
  root.querySelectorAll('a[href^="http"]:not([target])').forEach((a) => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); });
  root.querySelectorAll('button:not([aria-label])').forEach((b) => {
    if (txt(b) || b.getAttribute('title')) return;
    const svg = b.querySelector('svg'); const cls = [...(svg?.classList || [])].find((c) => c.startsWith('lucide-')); const name = cls ? ICON[cls.slice(7)] : undefined;
    b.setAttribute('aria-label', name || 'Action'); if (!b.getAttribute('title')) b.setAttribute('title', name || 'Action');
  });
  root.querySelectorAll('input:not([type=hidden]):not([aria-label]),select:not([aria-label]),textarea:not([aria-label])').forEach((c) => {
    const el = c as HTMLInputElement; if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return;
    const lab = el.closest('label'); const th = el.closest('td') && el.closest('table')?.querySelectorAll('thead th')[(el.closest('td') as HTMLTableCellElement).cellIndex];
    const name = el.getAttribute('placeholder') || el.getAttribute('title') || (lab && txt(lab).slice(0, 60)) || (th && txt(th)) || txt(el.previousElementSibling).slice(0, 60) || (el.type === 'checkbox' ? 'Toggle' : el.type === 'date' ? 'Date' : el.tagName === 'SELECT' ? 'Select option' : 'Value');
    el.setAttribute('aria-label', name);
  });
}
export function A11yFix() {
  useEffect(() => {
    let raf = 0; const run = () => { raf = 0; fix(document); }; const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(run); });
    mo.observe(document.body, { childList: true, subtree: true }); run(); return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
