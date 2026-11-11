// App shell: routing, the top bar, and service worker registration.
//
// Routes (hash based, so it works from any static host and sub-folder):
//   #/                         today's matches
//   #/day/YYYY-MM-DD           matches on another day
//   #/match/<leagueId>/<id>    match detail
import { initTheme } from './theme.js';
import { isDateKey } from './lib/dates.js';
import { mountDay } from './views/day.js';
import { mountMatch } from './views/match.js';

const $ = (id) => document.getElementById(id);
const els = { view: $('view'), subbar: $('subbar'), title: $('title'), back: $('back'), refresh: $('refresh'), toast: $('toast') };

let view = null; // { kind, refresh(), destroy() }
let cameFromList = false;

/** What a view gets to work with. */
const ui = {
  root: els.view,
  subbar: els.subbar,
  setTitle(text) {
    els.title.textContent = text;
  },
  setBack(show) {
    els.back.hidden = !show;
  },
  setBusy(busy) {
    els.refresh.classList.toggle('is-busy', busy);
  },
  /** `replace: true` swaps the current history entry (used for day tabs, so Back leaves the app). */
  navigate(hash, { replace = false } = {}) {
    if (replace) {
      history.replaceState(null, '', hash);
      route();
    } else {
      location.hash = hash;
    }
  },
  reroute: route,
};

function route() {
  const previous = view?.kind;
  view?.destroy();
  els.view.replaceChildren();
  els.subbar.replaceChildren();
  ui.setBusy(false);

  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'match' && parts.length >= 3) {
    cameFromList = previous === 'day';
    view = mountMatch(ui, { leagueId: parts[1], matchId: parts[2] });
  } else {
    const date = parts[0] === 'day' && isDateKey(parts[1]) ? parts[1] : null;
    view = mountDay(ui, { date, restoreScroll: previous === 'match' });
  }
}

els.back.addEventListener('click', () => {
  if (cameFromList) history.back();
  else ui.navigate('#/', { replace: true });
});
els.refresh.addEventListener('click', () => view?.refresh());
window.addEventListener('hashchange', route);
window.addEventListener('online', () => view?.refresh());

// A crest that fails to load disappears instead of showing a broken-image icon.
document.addEventListener(
  'error',
  (event) => {
    if (event.target instanceof HTMLImageElement) event.target.style.visibility = 'hidden';
  },
  true,
);

history.scrollRestoration = 'manual';
initTheme($('theme'));
route();

/* ---------------------------------------------------------- service worker */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* the app works without it, just not offline */
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'app-updated') showUpdateToast();
  });
}

function showUpdateToast() {
  const text = document.createElement('span');
  text.textContent = 'New version ready';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Reload';
  button.addEventListener('click', () => location.reload());
  els.toast.replaceChildren(text, button);
  els.toast.hidden = false;
}
