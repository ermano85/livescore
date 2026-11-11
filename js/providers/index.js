/**
 * The app talks to exactly one data provider, exported here.
 *
 * To switch provider (e.g. to API-Football), write another module with the same
 * two methods and export it below. Nothing else in the app needs to change.
 *
 * Provider interface
 * ------------------
 *   getMatches(league, date, { signal }) -> Promise<Match[]>
 *       league: an entry of LEAGUES in config.js
 *       date:   local calendar day, "YYYY-MM-DD"
 *   getMatch(league, matchId, { signal }) -> Promise<MatchDetail>
 *
 * Normalised shapes
 * -----------------
 *   Match {
 *     id, leagueId,
 *     kickoff: number            // epoch milliseconds
 *     kickoffTbd: boolean        // date known, time not confirmed
 *     status: {
 *       phase: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
 *            | 'abandoned' | 'suspended' | 'delayed',
 *       label: string            // "67'", "HT", "FT", "AET", "Pens", "Postp." ...
 *       paused: boolean          // live but not in play (half-time, break)
 *     },
 *     home: Team, away: Team
 *   }
 *   Team { id, name, shortName, abbr, logo, score: number|null,
 *          pens: number|null, winner: boolean, redCards: number }
 *
 *   MatchDetail {
 *     match: Match,
 *     venue: string|null,
 *     events: Event[],           // in match order
 *     lineups: { home: Lineup|null, away: Lineup|null } | null
 *   }
 *   Event {
 *     id, minute: string, clock: number, side: 'home'|'away'|null,
 *     type: 'goal' | 'yellow' | 'red' | 'sub' | 'penalty-missed' | 'halftime',
 *     player: Person|null,       // scorer / carded player / player coming ON
 *     assist?: Person|null,      // goal
 *     penalty?: boolean,         // goal
 *     ownGoal?: boolean,         // goal; `side` is the team that gets the goal
 *     secondYellow?: boolean,    // red
 *     playerOut?: Person|null    // sub
 *   }
 *   Person { id, name }
 *   Lineup { formation: string|null, starters: Player[], bench: Player[] }
 *   Player { id, name, shortName, number, position, starter, subbedIn, subbedOut }
 */
import { espn } from './espn.js';

export const provider = espn;
