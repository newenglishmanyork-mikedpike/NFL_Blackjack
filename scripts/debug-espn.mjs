// Temporary diagnostic script — NOT part of the production pipeline.
// Fetches ESPN's public (unofficial) NFL endpoints and prints the shape of
// the JSON so we can verify field names before writing the real parser.
// Deleted once verification is done.

async function getJson(url) {
  console.log(`\n=== GET ${url} ===`);
  const res = await fetch(url);
  console.log(`status: ${res.status}`);
  if (!res.ok) return null;
  return res.json();
}

// 1. Current scoreboard (whatever week ESPN thinks "now" is).
const scoreboard = await getJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
if (scoreboard) {
  console.log('scoreboard top-level keys:', Object.keys(scoreboard));
  console.log('season:', JSON.stringify(scoreboard.season));
  console.log('week:', JSON.stringify(scoreboard.week));
  console.log('event count:', scoreboard.events?.length);
  for (const ev of scoreboard.events || []) {
    const comps = ev.competitions?.[0]?.competitors || [];
    const abbrs = comps.map(c => `${c.team?.abbreviation}(${c.homeAway})`);
    console.log(ev.id, ev.name, '|', abbrs.join(' vs '), '|', JSON.stringify(ev.status?.type));
  }
}

// 2. Use whatever event is currently live/finished from today's real
// scoreboard (rather than a guessed or possibly-stale historical id).
let eventId = null;
if (scoreboard) {
  const candidate = scoreboard.events?.find(e => e.status?.type?.state === 'post')
    || scoreboard.events?.find(e => e.status?.type?.state === 'in')
    || scoreboard.events?.[0];
  console.log('chosen event:', candidate?.id, candidate?.name, JSON.stringify(candidate?.status?.type));
  eventId = candidate?.id;
}

const summary = eventId
  ? await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`)
  : null;
if (summary) {
  console.log('summary top-level keys:', Object.keys(summary));
  console.log('header.competitions[0].status:', JSON.stringify(summary.header?.competitions?.[0]?.status));

  console.log('\n--- scoringPlays ---');
  console.log('scoringPlays count:', summary.scoringPlays?.length);
  console.log('scoringPlays[0]:', JSON.stringify(summary.scoringPlays?.[0], null, 2));
  console.log('scoringPlays[1]:', JSON.stringify(summary.scoringPlays?.[1], null, 2));

  console.log('\n--- boxscore ---');
  console.log('boxscore keys:', Object.keys(summary.boxscore || {}));
  console.log('competitors abbreviations:', summary.header?.competitions?.[0]?.competitors?.map(c => [c.team?.abbreviation, c.homeAway, c.score]));
  for (const teamPlayers of summary.boxscore?.players || []) {
    console.log('\nteam:', teamPlayers?.team?.displayName, teamPlayers?.team?.abbreviation);
    console.log('statistics categories:', teamPlayers?.statistics?.map(s => ({ name: s.name, labels: s.labels, keys: s.keys })));
    const cat = teamPlayers?.statistics?.find(s => s.name === 'passing') || teamPlayers?.statistics?.[0];
    console.log('one full category:', JSON.stringify(cat, null, 2));
  }
}

// 3. Sanity-check whether the scoreboard supports querying a fully-past
// week (needed to build season-cumulative totals), and what shape a
// finished event's status takes there.
const pastWeek = await getJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=1&year=2025&seasontype=2');
if (pastWeek) {
  console.log('\n2025 week1 event count:', pastWeek.events?.length);
  const first = pastWeek.events?.[0];
  console.log('2025 week1 first event id/name:', first?.id, first?.name);
  console.log('2025 week1 first event raw status:', JSON.stringify(first?.status));
  console.log('2025 week1 first event competitions[0].status:', JSON.stringify(first?.competitions?.[0]?.status));
}
