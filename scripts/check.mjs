// Smoke test for the data provider, straight from Node (no browser needed).
// Handy when scores stop showing up and you want to know whether ESPN changed.
//
//   npm run check                 -> today
//   npm run check -- 2026-11-07   -> a specific day
import { LEAGUES } from '../js/config.js';
import { provider } from '../js/providers/index.js';

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const date = process.argv[2] ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

console.log(`${provider.name} · ${date}\n`);
let sample = null;
let failures = 0;

for (const league of LEAGUES) {
  try {
    const matches = await provider.getMatches(league, date);
    console.log(`${league.name} (${matches.length})`);
    for (const m of matches) {
      const score = m.home.score === null ? ' v ' : ` ${m.home.score}-${m.away.score} `;
      const status = m.status.phase === 'scheduled' ? time.format(m.kickoff) : m.status.label;
      console.log(`  ${status.padEnd(7)} ${m.home.name}${score}${m.away.name}`);
      if (!sample || (sample.match.status.phase === 'scheduled' && m.status.phase !== 'scheduled')) {
        sample = { league, match: m };
      }
    }
  } catch (err) {
    failures += 1;
    console.log(`${league.name}: FAILED - ${err.message}`);
  }
}

if (sample) {
  const { league, match } = sample;
  console.log(`\nDetail: ${match.home.name} v ${match.away.name}`);
  try {
    const detail = await provider.getMatch(league, match.id);
    for (const e of detail.events) {
      if (e.type === 'halftime') console.log('  -- half-time --');
      else {
        const who = e.type === 'sub' ? `${e.player?.name} for ${e.playerOut?.name}` : e.player?.name ?? '?';
        const tags = [e.penalty && 'pen', e.ownGoal && 'og', e.secondYellow && '2nd yellow'].filter(Boolean);
        console.log(`  ${e.minute.padEnd(7)} ${e.type.padEnd(7)} ${(e.side ?? '').padEnd(5)} ${who} ${tags.join(' ')}`);
      }
    }
    const count = (l) => (l ? `${l.starters.length}+${l.bench.length} (${l.formation ?? '?'})` : 'not announced');
    console.log(`  lineups: home ${count(detail.lineups?.home)}, away ${count(detail.lineups?.away)}`);
  } catch (err) {
    failures += 1;
    console.log(`  FAILED - ${err.message}`);
  }
} else {
  console.log('\nNo matches on this day, so the match detail call was not exercised.');
}

process.exit(failures ? 1 : 0);
