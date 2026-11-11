// Calendar days are handled as local "YYYY-MM-DD" keys; instants as epoch ms.
// All formatting uses the phone's own locale and timezone.

const pad = (n) => String(n).padStart(2, '0');

export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => toKey(new Date());

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export const isDateKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && toKey(fromKey(s)) === s;

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Kick-off time, e.g. "18:30". */
export const formatTime = (ms) => timeFmt.format(ms);
/** Time with seconds, e.g. "18:30:05". */
export const formatClock = (ms) => clockFmt.format(ms);
/** Short day, e.g. "Sat 7 Nov". Accepts a date key or epoch ms. */
export const formatDay = (keyOrMs) => dayFmt.format(typeof keyOrMs === 'string' ? fromKey(keyOrMs) : keyOrMs);
