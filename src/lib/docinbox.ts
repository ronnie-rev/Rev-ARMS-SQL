// In-memory hand-off between Document OCR and the PDF / Word Studio. Held in a module variable only — never localStorage, never persisted — because documents can contain PHI.
export type InboxItem = { kind: 'pdf'; name: string; bytes: Uint8Array } | { kind: 'word'; name: string; html: string } | { kind: 'text'; name: string; text: string };
let item: InboxItem | null = null;
export const putInbox = (i: InboxItem) => { item = i; };
export const takeInbox = (): InboxItem | null => { const i = item; item = null; return i; };
/** Read without consuming — safe to call during render (React may render a page more than once before it commits). Pair with clearInbox() in an effect. */
export const peekInbox = (): InboxItem | null => item;
export const clearInbox = () => { item = null; };
