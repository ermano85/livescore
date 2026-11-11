// Match detail: score header, timeline (goals, cards, substitutions) and lineups.
import { LEAGUES, LIVE_POLL_MS } from '../config.js';
import { provider } from '../providers/index.js';
import { findMatch } from '../store.js';
import { formatClock, formatDay, formatTime } from '../lib/dates.js';
import { crest, esc } from '../lib/dom.js';
import { createPoller } from '../lib/polling.js';

export function mountMatch(ui, { leagueId, matchId }) {
  const league = LEAGUES.find((l) => l.id === leagueId);
  const seed = findMatch(leagueId, matchId); // from the list, so the header shows immediately
  const listeners = new AbortController();
  let detail = null;
  let error = league ? null : new Error('Unknown competition');
  let destroyed = false;
  let inFlight = null;
  let loadedAt = 0;
  let shown = null;

  ui.setTitle(league?.name ?? 'Match');
  ui.setBack(true);
  ui.root.innerHTML = '<div class="detail"></div><p class="foot"></p>';
  const [bodyEl, footEl] = ui.root.children;
  window.scrollTo(0, 0);

  const poller = createPoller({
    getMatches: () => (detail ? [detail.match] : []),
    onTimer: load,
    onResume() {
      if (inFlight) return; // a load is already on its way and will reschedule
      if (Date.now() - loadedAt >= LIVE_POLL_MS) load();
      else poller.schedule();
    },
  });

  ui.root.addEventListener(
    'click',
    (event) => {
      if (event.target.closest('[data-action="retry"]')) load();
    },
    { signal: listeners.signal },
  );

  render();
  load();

  return {
    kind: 'match',
    refresh: load,
    destroy() {
      destroyed = true;
      poller.stop();
      inFlight?.abort();
      listeners.abort();
    },
  };

  async function load() {
    if (!league || inFlight) return;
    const ctrl = (inFlight = new AbortController());
    ui.setBusy(true);
    try {
      const result = await provider.getMatch(league, matchId, { signal: ctrl.signal });
      if (destroyed || inFlight !== ctrl) return;
      detail = result;
      error = null;
    } catch (err) {
      if (destroyed || inFlight !== ctrl) return;
      error = err;
    }
    inFlight = null;
    loadedAt = Date.now();
    ui.setBusy(false);
    render();
    poller.schedule();
  }

  function render() {
    const match = detail?.match ?? seed;
    let html = match ? scorebox(match, detail?.venue) : '';

    if (detail) {
      if (error) {
        html =
          `<div class="notice"><span>Couldn't refresh. Showing the last data loaded.</span>` +
          `<button type="button" data-action="retry">Retry</button></div>${html}`;
      }
      html += eventsPanel(detail) + lineupsPanel(detail);
    } else if (error) {
      html += `
        <div class="state">
          <div class="state-icon" aria-hidden="true">📡</div>
          <h2>Couldn't load this match</h2>
          <p>${league ? 'Check your connection and try again.' : 'This competition is not in your list.'}</p>
          ${league ? '<button class="btn" type="button" data-action="retry">Retry</button>' : ''}
        </div>`;
    } else {
      html += `<div class="panel" aria-busy="true" aria-label="Loading match">${'<div class="skel-row"></div>'.repeat(4)}</div>`;
    }

    // Only touch the DOM when something changed, so a 30s poll does not repaint the page.
    if (html !== shown) {
      bodyEl.innerHTML = html;
      shown = html;
    }
    const live = detail?.match.status.phase === 'live';
    footEl.textContent =
      detail && !error
        ? `Updated ${formatClock(loadedAt)}${live ? ` · live, refreshing every ${LIVE_POLL_MS / 1000}s` : ''} · Data: ${provider.name}`
        : '';
  }
}

/* ------------------------------------------------------------- score header */

function statusText({ phase, label }) {
  switch (phase) {
    case 'scheduled': return '';
    case 'live': return label === 'HT' ? 'Half-time' : label;
    case 'finished': return label === 'AET' ? 'After extra time' : label === 'Pens' ? 'After penalties' : 'Full time';
    case 'postponed': return 'Postponed';
    case 'cancelled': return 'Cancelled';
    case 'abandoned': return 'Abandoned';
    case 'suspended': return 'Suspended';
    case 'delayed': return 'Delayed';
    default: return label;
  }
}

function scorebox(m, venue) {
  const { phase } = m.status;
  const hasScore = m.home.score !== null && m.away.score !== null;
  const middle = hasScore
    ? `${m.home.score} – ${m.away.score}`
    : phase === 'scheduled'
      ? m.kickoffTbd ? 'TBD' : esc(formatTime(m.kickoff))
      : '–';
  const status = statusText(m.status);
  const pens =
    m.home.pens !== null && m.away.pens !== null
      ? `<div class="sb-pens">${m.home.pens}–${m.away.pens} on penalties</div>`
      : '';
  // Before kick-off the time is the headline, so the line above only needs the day.
  const when = `${formatDay(m.kickoff)}${m.kickoffTbd || phase === 'scheduled' ? '' : ` · ${formatTime(m.kickoff)}`}`;
  const team = (t) => `<div class="sb-team">${crest(t.logo, 56)}<span>${esc(t.name)}</span></div>`;

  return `
    <section class="scorebox${phase === 'live' ? ' is-live' : ''}">
      <div class="sb-meta">${esc(when)}</div>
      <div class="sb-main">
        ${team(m.home)}
        <div class="sb-mid">
          <div class="sb-score">${middle}</div>
          ${status ? `<div class="sb-status">${esc(status)}</div>` : ''}
          ${pens}
        </div>
        ${team(m.away)}
      </div>
      ${venue ? `<div class="sb-venue">${esc(venue)}</div>` : ''}
    </section>`;
}

/* ----------------------------------------------------------------- timeline */

function eventsPanel({ events, match }) {
  let body;
  if (!events.length) {
    const text =
      match.status.phase === 'scheduled'
        ? 'Goals, cards and substitutions appear here once the match starts.'
        : 'No goals, cards or substitutions recorded.';
    body = `<p class="panel-empty">${text}</p>`;
  } else {
    let home = 0;
    let away = 0;
    const rows = events.map((e) => {
      if (e.type === 'goal') {
        if (e.side === 'away') away += 1;
        else home += 1;
      }
      return eventRow(e, `${home}–${away}`);
    });
    body = `<ul class="events">${rows.join('')}</ul>`;
  }
  return `<section class="panel"><h2>Events</h2>${body}</section>`;
}

function eventRow(e, score) {
  if (e.type === 'halftime') return `<li class="ev-sep">Half-time ${score}</li>`;

  // The provider does not always name the player (e.g. a card shown to someone on the bench).
  const name = e.player ? esc(e.player.name) : null;
  let ico;
  let main;
  let small = '';
  switch (e.type) {
    case 'goal':
      ico = '<span aria-hidden="true">⚽</span><span class="sr">Goal</span>';
      main = `<b>${name ?? 'Goal'}</b>${e.penalty ? ' <span class="tag">pen</span>' : ''}${e.ownGoal ? ' <span class="tag">own goal</span>' : ''}`;
      small = `${score}${e.assist ? ` · assist ${esc(e.assist.name)}` : ''}`;
      break;
    case 'yellow':
      ico = '<i class="card-ico y"></i><span class="sr">Yellow card</span>';
      main = name ?? 'Yellow card';
      break;
    case 'red': {
      const what = e.secondYellow ? 'Second yellow card' : 'Red card';
      ico = `<i class="card-ico ${e.secondYellow ? 'yr' : 'r'}"></i>`;
      main = name ?? what;
      small = name ? what : '';
      break;
    }
    case 'penalty-missed':
      ico = '<span aria-hidden="true">✕</span>';
      main = name ?? 'Penalty';
      small = 'Penalty missed';
      break;
    default: // substitution
      ico = '<span class="sub-in" aria-hidden="true">▲</span><span class="sr">On</span>';
      main = name ?? 'Substitution';
      small = e.playerOut
        ? `<span class="sub-out" aria-hidden="true">▼</span><span class="sr">Off</span> ${esc(e.playerOut.name)}`
        : '';
  }

  const side = e.side === 'away' ? 'away' : 'home';
  return `
    <li class="ev ev-${side}">
      <div class="ev-body">
        <span class="ev-ico">${ico}</span>
        <div class="ev-text">${main}${small ? `<small>${small}</small>` : ''}</div>
      </div>
      <div class="ev-min">${esc(e.minute)}</div>
    </li>`;
}

/* ------------------------------------------------------------------ lineups */

function lineupsPanel({ lineups, events, match }) {
  if (!lineups) {
    const text =
      match.status.phase === 'scheduled'
        ? 'Lineups are usually announced about an hour before kick-off.'
        : 'Lineups are not available for this match.';
    return `<section class="panel"><h2>Lineups</h2><p class="panel-empty">${text}</p></section>`;
  }
  const marks = playerMarks(events);
  return `
    <section class="panel">
      <h2>Lineups</h2>
      <div class="lineups">${lineupColumn(match.home, lineups.home, marks)}${lineupColumn(match.away, lineups.away, marks)}</div>
    </section>`;
}

/** What each player did, keyed by player id, so the lineup can show it next to the name. */
function playerMarks(events) {
  const marks = new Map();
  const of = (person) => {
    const id = person?.id || Symbol('unknown');
    if (!marks.has(id)) marks.set(id, { goals: 0, ownGoals: 0, yellow: false, red: false, secondYellow: false, on: null, off: null });
    return marks.get(id);
  };
  for (const e of events) {
    if (e.type === 'goal') of(e.player)[e.ownGoal ? 'ownGoals' : 'goals'] += 1;
    else if (e.type === 'yellow') of(e.player).yellow = true;
    else if (e.type === 'red') Object.assign(of(e.player), { red: true, secondYellow: e.secondYellow === true });
    else if (e.type === 'sub') {
      of(e.player).on = e.minute;
      of(e.playerOut).off = e.minute;
    }
  }
  return marks;
}

function lineupColumn(team, lineup, marks) {
  const head = `
    <div class="lu-head">${crest(team.logo, 20)}<span>${esc(team.shortName)}</span>${lineup?.formation ? `<small>${esc(lineup.formation)}</small>` : ''}</div>`;
  if (!lineup) return `<div class="lu-col">${head}<p class="panel-empty">Not announced</p></div>`;

  const list = (players) => `<ul class="lu-list">${players.map((p) => playerRow(p, marks.get(p.id))).join('')}</ul>`;
  return `
    <div class="lu-col">
      ${head}
      ${list(lineup.starters)}
      ${lineup.bench.length ? `<h3 class="lu-title">Substitutes</h3>${list(lineup.bench)}` : ''}
    </div>`;
}

function playerRow(p, mark = {}) {
  const bits = [];
  if (mark.goals) bits.push(`<span>⚽${mark.goals > 1 ? `×${mark.goals}` : ''}</span>`);
  if (mark.ownGoals) bits.push('<span class="tag">og</span>');
  if (mark.yellow && !(mark.red && mark.secondYellow)) bits.push('<i class="card-ico y" title="Yellow card"></i>');
  if (mark.red) bits.push(`<i class="card-ico ${mark.secondYellow ? 'yr' : 'r'}" title="Red card"></i>`);
  const cameOn = p.subbedIn || mark.on;
  if (p.subbedOut || mark.off) bits.push(`<span class="sub-out" title="Substituted off">▼${esc(mark.off ?? '')}</span>`);
  if (cameOn) bits.push(`<span class="sub-in" title="Came on">▲${esc(mark.on ?? '')}</span>`);

  const unused = !p.starter && !cameOn;
  return `
    <li${unused ? ' class="is-unused"' : ''}>
      <span class="lu-num">${esc(p.number)}</span>
      <span class="lu-name">${esc(p.shortName || p.name)}</span>
      ${bits.length ? `<span class="lu-marks">${bits.join('')}</span>` : ''}
    </li>`;
}
