/**
 * ESPN data provider.
 *
 * Everything that knows about ESPN's unofficial, key-less soccer API lives in
 * this one file: URLs, response shapes, status names and event type names. The
 * rest of the app only sees the normalised objects described in ./index.js.
 *
 * It has no DOM dependencies (only `fetch`), so it also runs in Node
 * (`npm run check`) or in a Worker, e.g. for goal alerts later.
 *
 * What was verified against the live API (November 2026):
 *  - GET responses carry `Access-Control-Allow-Origin: *`, so the browser calls
 *    the API directly. A preflight (OPTIONS) is rejected with 403, so requests
 *    must stay "simple": plain GET, no custom headers.
 *  - `dates` takes a single YYYYMMDD day. Ranges (`A-B`) return 400.
 *  - ESPN's "day" is a US Eastern calendar day. European kick-off times never
 *    fall between midnight and 05:00 UTC, so asking for the phone's local date
 *    returns that local day's matches anywhere in Europe / Turkey.
 */

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const TIMEOUT_MS = 12_000;
const CREST_PX = 96;

export const espn = {
  name: 'ESPN',

  /** All matches of one competition on one local calendar day ("YYYY-MM-DD"). */
  async getMatches(league, date, { signal } = {}) {
    const day = date.replaceAll('-', '');
    const data = await getJson(`${BASE}/${slugOf(league)}/scoreboard?dates=${day}`, signal);
    return (data.events ?? [])
      .map((event) => parseScoreboardEvent(event, league))
      .sort((a, b) => a.kickoff - b.kickoff);
  },

  /** One match with its timeline (goals, cards, substitutions) and lineups. */
  async getMatch(league, matchId, { signal } = {}) {
    const data = await getJson(
      `${BASE}/${slugOf(league)}/summary?event=${encodeURIComponent(matchId)}`,
      signal,
    );
    return parseSummary(data, league, matchId);
  },
};

/* ------------------------------------------------------------------ fetch */

function slugOf(league) {
  if (!league?.espn) throw new Error(`"${league?.name ?? league?.id}" has no ESPN slug in config.js`);
  return league.espn;
}

async function getJson(url, signal) {
  const ctrl = new AbortController();
  const forward = () => ctrl.abort(signal.reason);
  if (signal?.aborted) forward();
  else signal?.addEventListener('abort', forward, { once: true });
  const timer = setTimeout(() => ctrl.abort(new Error('ESPN took too long to answer')), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`ESPN answered ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}

/* ------------------------------------------------------------- scoreboard */

function parseScoreboardEvent(event, league) {
  const comp = event.competitions?.[0] ?? {};
  const status = parseStatus(comp.status ?? event.status);
  const reds = {};
  for (const d of comp.details ?? []) {
    if (d.redCard && d.team?.id) reds[d.team.id] = (reds[d.team.id] ?? 0) + 1;
  }
  const side = (homeAway) => {
    const c = (comp.competitors ?? []).find((x) => x.homeAway === homeAway);
    return parseTeam(c, status, reds[c?.team?.id] ?? 0);
  };
  return {
    id: String(event.id),
    leagueId: league.id,
    kickoff: Date.parse(comp.date ?? event.date),
    kickoffTbd: comp.timeValid === false,
    status,
    home: side('home'),
    away: side('away'),
  };
}

/**
 * ESPN status -> { phase, label, paused }.
 * `type.state` ("pre" | "in" | "post") is the reliable part; `type.name` only
 * refines it, so an unknown name still lands in a sensible phase.
 */
function parseStatus(status = {}) {
  const type = status.type ?? {};
  const name = String(type.name ?? '');
  if (name.includes('POSTPONED')) return { phase: 'postponed', label: 'Postp.', paused: false };
  if (name.includes('CANCEL')) return { phase: 'cancelled', label: 'Canc.', paused: false };
  if (name.includes('ABANDON')) return { phase: 'abandoned', label: 'Aband.', paused: false };
  if (name.includes('SUSPEND')) return { phase: 'suspended', label: 'Susp.', paused: false };
  if (name.includes('DELAY')) return { phase: 'delayed', label: 'Delayed', paused: false };

  if (type.state === 'in') {
    if (name.includes('HALFTIME')) return { phase: 'live', label: 'HT', paused: true };
    if (name.includes('SHOOTOUT')) return { phase: 'live', label: 'Pens', paused: false };
    if (name.includes('END_OF')) return { phase: 'live', label: 'Break', paused: true };
    const clock = status.displayClock || type.shortDetail || type.detail || 'Live';
    return { phase: 'live', label: String(clock), paused: false };
  }
  if (type.state === 'post') {
    const label = name.includes('PEN') ? 'Pens' : /AET|EXTRA/.test(name) ? 'AET' : 'FT';
    return { phase: 'finished', label, paused: false };
  }
  return { phase: 'scheduled', label: '', paused: false };
}

function parseTeam(competitor = {}, status, redCards = 0) {
  const team = competitor.team ?? {};
  const played = !['scheduled', 'postponed', 'cancelled', 'delayed'].includes(status.phase);
  const raw = competitor.score;
  const score = played && raw !== undefined && raw !== null && raw !== '' ? Number(raw) : null;
  const pens = competitor.shootoutScore;
  return {
    id: String(team.id ?? ''),
    name: team.displayName ?? team.name ?? 'Unknown',
    shortName: team.shortDisplayName ?? team.displayName ?? team.name ?? 'Unknown',
    abbr: team.abbreviation ?? '',
    logo: crestUrl(team.logo ?? team.logos?.[0]?.href),
    score: Number.isFinite(score) ? score : null,
    pens: played && pens != null && Number.isFinite(Number(pens)) ? Number(pens) : null,
    winner: competitor.winner === true,
    redCards,
  };
}

/** ESPN serves crests at 500px (~200 KB). Its image combiner resizes them (~10 KB). */
function crestUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'a.espncdn.com' && u.pathname.startsWith('/i/')) {
      return `https://a.espncdn.com/combiner/i?img=${u.pathname}&h=${CREST_PX}&w=${CREST_PX}`;
    }
  } catch {
    /* fall through and use the URL as given */
  }
  return url;
}

/* ---------------------------------------------------------------- summary */

function parseSummary(data, league, matchId) {
  const comp = data.header?.competitions?.[0];
  if (!comp) throw new Error('ESPN returned no data for this match');

  const status = parseStatus(comp.status);
  const competitor = (homeAway) => (comp.competitors ?? []).find((c) => c.homeAway === homeAway);
  const home = competitor('home');
  const away = competitor('away');
  const sideOf = (teamId) =>
    teamId == null ? null
    : String(teamId) === String(home?.team?.id) ? 'home'
    : String(teamId) === String(away?.team?.id) ? 'away'
    : null;

  const events = parseTimeline(data, comp, sideOf);
  const redCount = (side) => events.filter((e) => e.type === 'red' && e.side === side).length;

  const rosterOf = (homeAway) => parseRoster((data.rosters ?? []).find((r) => r.homeAway === homeAway));
  const homeLineup = rosterOf('home');
  const awayLineup = rosterOf('away');

  const venue = data.gameInfo?.venue;
  return {
    match: {
      id: String(comp.id ?? data.header?.id ?? matchId),
      leagueId: league.id,
      kickoff: Date.parse(comp.date),
      kickoffTbd: data.header?.timeValid === false,
      status,
      home: parseTeam(home, status, redCount('home')),
      away: parseTeam(away, status, redCount('away')),
    },
    venue: [venue?.fullName, venue?.address?.city].filter(Boolean).join(', ') || null,
    events,
    lineups: homeLineup || awayLineup ? { home: homeLineup, away: awayLineup } : null,
  };
}

const person = (athlete) =>
  athlete?.displayName ? { id: String(athlete.id ?? ''), name: athlete.displayName } : null;

/**
 * Timeline, in match order.
 *
 * `keyEvents` is the main source (goals, cards, substitutions, half-time).
 * `header.competitions[0].details` lists goals and red cards again with explicit
 * flags; occasionally it has one that keyEvents is missing, so those are merged in.
 *
 * keyEvents `type.type` values seen: goal, goal---header, penalty---scored,
 * own-goal, yellow-card, red-card, substitution, halftime (plus kickoff,
 * start-2nd-half, end-regular-time, start-delay, end-delay, which we skip).
 * For an own goal `team` is the side that gets the goal, not the scorer's side.
 */
function parseTimeline(data, comp, sideOf) {
  const events = [];

  for (const k of data.keyEvents ?? []) {
    if (k.shootout) continue; // shoot-out kicks are not part of the match timeline
    const kind = String(k.type?.type ?? '');
    const people = (k.participants ?? []).map((p) => p.athlete);
    const base = {
      id: `k${k.id}`,
      minute: k.clock?.displayValue ?? '',
      clock: Number(k.clock?.value ?? 0),
      side: sideOf(k.team?.id),
    };

    if (k.scoringPlay) {
      const ownGoal = kind === 'own-goal';
      events.push({
        ...base,
        type: 'goal',
        player: person(people[0]),
        assist: ownGoal ? null : person(people[1]),
        penalty: kind.startsWith('penalty'),
        ownGoal,
      });
    } else if (kind.includes('red-card')) {
      events.push({
        ...base,
        type: 'red',
        player: person(people[0]),
        secondYellow: /second yellow/i.test(k.text ?? '') || kind.includes('yellow'),
      });
    } else if (kind === 'yellow-card') {
      events.push({ ...base, type: 'yellow', player: person(people[0]) });
    } else if (kind === 'substitution') {
      events.push({ ...base, type: 'sub', player: person(people[0]), playerOut: person(people[1]) });
    } else if (/^penalty---(missed|saved)/.test(kind)) {
      events.push({ ...base, type: 'penalty-missed', player: person(people[0]) });
    } else if (kind === 'halftime') {
      events.push({ ...base, type: 'halftime', side: null });
    }
  }

  const matched = new Set();
  (comp.details ?? []).forEach((d, i) => {
    if (d.shootout) return;
    const type = d.scoringPlay ? 'goal' : d.redCard ? 'red' : null;
    if (!type) return;
    const minute = d.clock?.displayValue ?? '';
    const side = sideOf(d.team?.id);
    const people = (d.participants ?? d.athletesInvolved ?? []).map((p) => p.athlete ?? p);
    const player = person(people[0]);

    const existing = events.find(
      (e) =>
        !matched.has(e) &&
        e.type === type &&
        e.side === side &&
        (e.minute === minute || (player && e.player?.id === player.id)),
    );
    if (existing) {
      matched.add(existing);
      return;
    }

    const clock = Number(d.clock?.value ?? 0);
    const extra =
      type === 'goal'
        ? {
            type,
            player,
            assist: d.ownGoal ? null : person(people[1]),
            penalty: d.penaltyKick === true,
            ownGoal: d.ownGoal === true,
          }
        : { type, player, secondYellow: false };
    const event = { id: `d${i}`, minute, clock, side, ...extra };
    matched.add(event);
    const at = events.findIndex((e) => e.clock > clock);
    if (at === -1) events.push(event);
    else events.splice(at, 0, event);
  });

  return events;
}

/** `rosters[]` entry -> { formation, starters, bench }, or null before lineups are announced. */
function parseRoster(entry) {
  if (!entry?.roster?.length) return null;
  const players = entry.roster.map((p) => ({
    id: String(p.athlete?.id ?? ''),
    name: p.athlete?.displayName ?? 'Unknown',
    shortName: p.athlete?.shortName ?? p.athlete?.displayName ?? 'Unknown',
    number: p.jersey ?? '',
    position: p.position?.abbreviation ?? '',
    starter: p.starter === true,
    subbedIn: p.subbedIn === true,
    subbedOut: p.subbedOut === true,
  }));
  return {
    formation: entry.formation ?? null,
    starters: players.filter((p) => p.starter),
    bench: players.filter((p) => !p.starter),
  };
}
