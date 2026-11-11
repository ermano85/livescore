// Match list for one day, grouped by competition, with the day tabs.
import { LEAGUES, LIVE_POLL_MS } from '../config.js';
import { provider } from '../providers/index.js';
import { dayState } from '../store.js';
import { addDays, formatClock, formatDay, formatTime, todayKey } from '../lib/dates.js';
import { crest, esc, icon } from '../lib/dom.js';
import { createPoller, isActive } from '../lib/polling.js';

/** Coming back to a list loaded this recently does not trigger another fetch. */
const FRESH_MS = 10_000;
const SWIPE_MIN_PX = 70;

let savedScroll = null; // { dateKey, y }: where the list was when a match was opened

const hashFor = (dateKey) => (dateKey === todayKey() ? '#/' : `#/day/${dateKey}`);

export function mountDay(ui, { date, restoreScroll }) {
  const today = todayKey();
  const dateKey = date ?? today;
  const state = dayState(dateKey);
  const listeners = new AbortController();
  let destroyed = false;
  let inFlight = null;
  let shownIds = null; // league ids currently rendered, to patch only what changed
  const shownHtml = new Map();

  ui.setTitle('Matchday');
  ui.setBack(false);
  renderTabs();
  ui.root.innerHTML = '<div class="notice" hidden></div><div class="list"></div><p class="foot"></p>';
  const [noticeEl, listEl, footEl] = ui.root.children;

  const poller = createPoller({
    getMatches: allMatches,
    onTimer() {
      const due = LEAGUES.filter(needsRefresh);
      if (due.length) refresh(due);
      else poller.schedule();
    },
    onResume() {
      if (!date && todayKey() !== today) ui.reroute(); // the app stayed open past midnight
      else if (inFlight) return; // a refresh is already on its way and will reschedule
      else if (Date.now() - state.loadedAt >= LIVE_POLL_MS) refresh(LEAGUES);
      else poller.schedule();
    },
  });

  ui.root.addEventListener(
    'click',
    (event) => {
      if (event.target.closest('[data-action="retry"]')) refresh(LEAGUES);
    },
    { signal: listeners.signal },
  );
  listenForSwipes();

  render();
  window.scrollTo(0, restoreScroll && savedScroll?.dateKey === dateKey ? savedScroll.y : 0);

  const hasErrors = [...state.leagues.values()].some((s) => s.error);
  if (state.loadedAt && !hasErrors && Date.now() - state.loadedAt < FRESH_MS) poller.schedule();
  else refresh(LEAGUES);

  return {
    kind: 'day',
    refresh: () => refresh(LEAGUES),
    destroy() {
      destroyed = true;
      savedScroll = { dateKey, y: window.scrollY };
      poller.stop();
      inFlight?.abort();
      listeners.abort();
    },
  };

  /* ---------------------------------------------------------------- data */

  function allMatches() {
    return [...state.leagues.values()].flatMap((s) => s.matches ?? []);
  }

  function needsRefresh(league) {
    const s = state.leagues.get(league.id);
    return !s || s.error || (s.matches ?? []).some((m) => isActive(m));
  }

  /** Reload the given competitions; the others keep what they have. */
  async function refresh(leagues) {
    const full = leagues.length === LEAGUES.length;
    if (inFlight?.full) return; // a full refresh is already running; it covers this one
    inFlight?.abort();
    const ctrl = (inFlight = Object.assign(new AbortController(), { full }));
    ui.setBusy(true);

    const results = await Promise.allSettled(
      leagues.map((league) => provider.getMatches(league, dateKey, { signal: ctrl.signal })),
    );
    if (destroyed || inFlight !== ctrl) return; // superseded by a newer refresh or a route change
    inFlight = null;

    results.forEach((result, i) => {
      const id = leagues[i].id;
      if (result.status === 'fulfilled') {
        state.leagues.set(id, { matches: result.value, error: null });
        state.okAt = Date.now();
      } else {
        state.leagues.set(id, { matches: state.leagues.get(id)?.matches ?? null, error: result.reason });
      }
    });
    state.loadedAt = Date.now();

    ui.setBusy(false);
    render();
    poller.schedule();
  }

  /* -------------------------------------------------------------- render */

  function renderTabs() {
    const tabs = [
      [addDays(today, -1), 'Yesterday'],
      [today, 'Today'],
      [addDays(today, 1), 'Tomorrow'],
    ];
    const isOtherDay = !tabs.some(([key]) => key === dateKey);

    ui.subbar.innerHTML = `
      <nav class="days" aria-label="Day">
        ${tabs
          .map(
            ([key, label]) => `
        <a class="day${key === dateKey ? ' is-active' : ''}" href="${hashFor(key)}"${key === dateKey ? ' aria-current="page"' : ''}>
          <span>${label}</span><small>${esc(formatDay(key))}</small>
        </a>`,
          )
          .join('')}
        <label class="day day-pick${isOtherDay ? ' is-active' : ''}">
          ${icon('calendar')}${isOtherDay ? `<small>${esc(formatDay(dateKey))}</small>` : ''}
          <input type="date" value="${dateKey}" aria-label="Pick another date">
        </label>
      </nav>`;

    const nav = ui.subbar.firstElementChild;
    nav.addEventListener('click', (event) => {
      const tab = event.target.closest('a.day');
      if (!tab) return;
      event.preventDefault();
      ui.navigate(tab.getAttribute('href'), { replace: true });
    });
    const input = nav.querySelector('input');
    input.addEventListener('click', () => {
      try {
        input.showPicker?.();
      } catch {
        /* the browser opens its own picker */
      }
    });
    input.addEventListener('change', () => {
      if (input.value) ui.navigate(hashFor(input.value), { replace: true });
    });
  }

  function render() {
    const failed = LEAGUES.filter((l) => state.leagues.get(l.id)?.error);
    const hasData = [...state.leagues.values()].some((s) => s.matches);
    const sections = LEAGUES.map((league) => [league, state.leagues.get(league.id)?.matches ?? []]).filter(
      ([, matches]) => matches.length,
    );

    if (!state.loadedAt) {
      setList(skeleton());
    } else if (!hasData) {
      setList(`
        <div class="state">
          <div class="state-icon" aria-hidden="true">📡</div>
          <h2>Couldn't load matches</h2>
          <p>Check your connection and try again.</p>
          <button class="btn" type="button" data-action="retry">Retry</button>
        </div>`);
    } else if (!sections.length) {
      setList(`
        <div class="state">
          <div class="state-icon" aria-hidden="true">⚽</div>
          <h2>${esc(emptyTitle())}</h2>
          <p>Nothing scheduled in your competitions.</p>
        </div>`);
    } else {
      patchSections(sections);
    }

    const showNotice = hasData && failed.length > 0;
    noticeEl.hidden = !showNotice;
    if (showNotice) {
      const text =
        failed.length === LEAGUES.length
          ? "Couldn't refresh. Showing the last scores loaded."
          : `Couldn't load ${failed.map((l) => l.name).join(', ')}.`;
      noticeEl.innerHTML = `<span>${esc(text)}</span><button type="button" data-action="retry">Retry</button>`;
    }

    const live = allMatches().some((m) => m.status.phase === 'live');
    footEl.textContent = state.okAt
      ? `Updated ${formatClock(state.okAt)}${live ? ` · live, refreshing every ${LIVE_POLL_MS / 1000}s` : ''} · Data: ${provider.name}`
      : '';
  }

  function setList(html) {
    listEl.innerHTML = html;
    shownIds = null;
    shownHtml.clear();
  }

  /** Re-render only the competitions whose markup changed, so a poll does not repaint the whole list. */
  function patchSections(sections) {
    const ids = sections.map(([league]) => league.id).join();
    const html = new Map(sections.map(([league, matches]) => [league.id, sectionHtml(league, matches)]));

    if (ids !== shownIds) {
      listEl.innerHTML = sections
        .map(([league]) => `<section class="league" data-league="${league.id}">${html.get(league.id)}</section>`)
        .join('');
    } else {
      for (const [id, markup] of html) {
        if (shownHtml.get(id) !== markup) listEl.querySelector(`[data-league="${id}"]`).innerHTML = markup;
      }
    }
    shownIds = ids;
    shownHtml.clear();
    for (const [id, markup] of html) shownHtml.set(id, markup);
  }

  function emptyTitle() {
    if (dateKey === today) return 'No matches today';
    if (dateKey === addDays(today, -1)) return 'No matches yesterday';
    if (dateKey === addDays(today, 1)) return 'No matches tomorrow';
    return `No matches on ${formatDay(dateKey)}`;
  }

  /* --------------------------------------------------------------- swipe */

  function listenForSwipes() {
    let start = null;
    const opts = { passive: true, signal: listeners.signal };
    ui.root.addEventListener(
      'touchstart',
      (event) => {
        const t = event.changedTouches[0];
        start = event.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
      },
      opts,
    );
    ui.root.addEventListener(
      'touchend',
      (event) => {
        if (!start) return;
        const t = event.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        const quick = Date.now() - start.at < 600;
        start = null;
        if (quick && Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > 2.5 * Math.abs(dy)) {
          ui.navigate(hashFor(addDays(dateKey, dx < 0 ? 1 : -1)), { replace: true });
        }
      },
      opts,
    );
  }
}

/* ------------------------------------------------------------------ markup */

function sectionHtml(league, matches) {
  return `<h2 class="league-head">${esc(league.name)} <span>${esc(league.country)}</span></h2>${matches.map(matchRow).join('')}`;
}

function matchRow(m) {
  const { phase } = m.status;
  const cls = `match${phase === 'live' ? ' is-live' : ''}${phase === 'finished' ? ' is-finished' : ''}`;
  const spoken =
    m.home.score === null
      ? `${m.home.name} v ${m.away.name}, ${phase === 'scheduled' ? formatTime(m.kickoff) : m.status.label}`
      : `${m.home.name} ${m.home.score}, ${m.away.name} ${m.away.score}, ${m.status.label}`;
  return `
    <a class="${cls}" href="#/match/${esc(m.leagueId)}/${esc(m.id)}" aria-label="${esc(spoken)}">
      <div class="m-status">${statusCell(m)}</div>
      <div class="m-teams">${teamLine(m.home, m.away)}${teamLine(m.away, m.home)}</div>
    </a>`;
}

function statusCell(m) {
  const { phase, label, paused } = m.status;
  if (phase === 'scheduled') return m.kickoffTbd ? 'TBD' : esc(formatTime(m.kickoff));
  if (phase === 'live') return `${paused ? '' : '<span class="dot"></span>'}${esc(label)}`;
  return esc(label);
}

function teamLine(team, other) {
  const cls = team.winner ? 'team is-winner' : other.winner ? 'team is-loser' : 'team';
  const pens = team.pens === null ? '' : `<small>(${team.pens})</small>`;
  const score = team.score === null ? '' : `${team.score}${pens}`;
  const reds = '<i class="redcard" title="Red card"></i>'.repeat(Math.min(team.redCards, 3));
  return `<div class="${cls}">${crest(team.logo, 22)}<span class="t-name">${esc(team.name)}</span>${reds}<span class="t-score">${score}</span></div>`;
}

function skeleton() {
  const block = (rows) =>
    `<div class="league" aria-hidden="true"><div class="skel-head"></div>${'<div class="skel-row"></div>'.repeat(rows)}</div>`;
  return `<div aria-busy="true" aria-label="Loading matches">${block(3)}${block(2)}</div>`;
}
