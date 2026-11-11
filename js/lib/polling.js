// Live-update scheduling shared by the list and the match page.
//
// Rules:
//  - poll every LIVE_POLL_MS only while a match is live (or should have kicked
//    off and is not marked live yet)
//  - otherwise sleep; if a match is still to come, wake up once at its kick-off
//  - never run a timer while the app is in the background (Page Visibility API)
import { LIVE_POLL_MS } from '../config.js';

/** Keep checking a match that should have started for this long, then give up. */
const OVERDUE_MS = 90 * 60 * 1000;
/** setTimeout cannot sleep longer than ~24 days; re-check at least this often. */
const MAX_SLEEP_MS = 6 * 60 * 60 * 1000;

/** True when this match's score can change right now. */
export function isActive(match, now = Date.now()) {
  const { phase } = match.status;
  if (phase === 'live') return true;
  if (phase !== 'scheduled' && phase !== 'delayed') return false;
  const late = now - match.kickoff;
  return late > -2000 && late < OVERDUE_MS;
}

/** Milliseconds until the next refresh is worthwhile, or null if there is nothing to wait for. */
export function nextRefreshIn(matches, now = Date.now()) {
  let wait = Infinity;
  for (const match of matches) {
    if (isActive(match, now)) return LIVE_POLL_MS;
    if (match.status.phase === 'scheduled' && match.kickoff > now) wait = Math.min(wait, match.kickoff - now);
  }
  return wait === Infinity ? null : Math.min(wait, MAX_SLEEP_MS);
}

/**
 * getMatches(): the matches currently on screen
 * onTimer():    called when a refresh is due
 * onResume():   called when the app comes back to the foreground
 * Call schedule() after every load; call stop() when the view goes away.
 */
export function createPoller({ getMatches, onTimer, onResume }) {
  let timer = 0;
  let stopped = false;

  const clear = () => {
    clearTimeout(timer);
    timer = 0;
  };
  const schedule = () => {
    clear();
    if (stopped || document.hidden) return;
    const wait = nextRefreshIn(getMatches());
    if (wait !== null) timer = setTimeout(onTimer, wait);
  };
  const onVisibility = () => {
    if (document.hidden) clear();
    else onResume();
  };

  document.addEventListener('visibilitychange', onVisibility);
  return {
    schedule,
    stop() {
      stopped = true;
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
