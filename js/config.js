// App configuration. This is the file to edit when you want different competitions.

/**
 * Competitions shown in the app, in display order.
 *
 *   id      - our own stable id (used in URLs; any unique lowercase slug)
 *   name    - label shown in the app
 *   country - small label shown next to the name
 *   espn    - the competition's slug in ESPN's API (see README for how to find one)
 *
 * A different data provider would add its own key here (e.g. `apiFootball: 39`).
 */
export const LEAGUES = [
  { id: 'premier-league', name: 'Premier League', country: 'England', espn: 'eng.1' },
  { id: 'bundesliga', name: 'Bundesliga', country: 'Germany', espn: 'ger.1' },
  { id: 'serie-a', name: 'Serie A', country: 'Italy', espn: 'ita.1' },
  { id: 'la-liga', name: 'La Liga', country: 'Spain', espn: 'esp.1' },
  { id: 'super-lig', name: 'Süper Lig', country: 'Turkey', espn: 'tur.1' },
  { id: 'champions-league', name: 'Champions League', country: 'UEFA', espn: 'uefa.champions' },
  { id: 'europa-league', name: 'Europa League', country: 'UEFA', espn: 'uefa.europa' },
  { id: 'conference-league', name: 'Conference League', country: 'UEFA', espn: 'uefa.europa.conf' },
];

/** How often to refresh while a match is live and the app is on screen. */
export const LIVE_POLL_MS = 30_000;
