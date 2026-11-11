// In-memory cache of loaded days, so switching tabs or coming back from a match
// shows the last known scores instantly while a refresh runs.

const MAX_DAYS = 7;
// dateKey -> { leagues: Map<leagueId, { matches, error }>, loadedAt, okAt }
//   loadedAt: when the last refresh finished; okAt: when one last succeeded
const days = new Map();

export function dayState(dateKey) {
  let state = days.get(dateKey);
  if (!state) {
    state = { leagues: new Map(), loadedAt: 0, okAt: 0 };
    days.set(dateKey, state);
    if (days.size > MAX_DAYS) days.delete(days.keys().next().value);
  }
  return state;
}

/** A match we already have from a list, used to paint the detail page header at once. */
export function findMatch(leagueId, matchId) {
  for (const state of days.values()) {
    const match = state.leagues.get(leagueId)?.matches?.find((m) => m.id === matchId);
    if (match) return match;
  }
  return null;
}
