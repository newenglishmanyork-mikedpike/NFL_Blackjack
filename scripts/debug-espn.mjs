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
  const ev = scoreboard.events?.[0];
  if (ev) {
    console.log('first event id/name/status:', ev.id, ev.name, JSON.stringify(ev.status));
  }
}

// 2. Pull a guaranteed-real completed game id from 2025 week 1 (fully in the
// past), rather than guessing an event id from memory.
const pastWeek = await getJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=1&year=2025&seasontype=2');
let eventId = null;
if (pastWeek) {
  console.log('2025 week1 event count:', pastWeek.events?.length);
  const finished = pastWeek.events?.find(e => e.status?.type?.state === 'post');
  console.log('first finished event:', finished?.id, finished?.name, JSON.stringify(finished?.status?.type));
  eventId = finished?.id;
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
  const teamPlayers = summary.boxscore?.players?.[0];
  console.log('boxscore.players[0] team:', JSON.stringify(teamPlayers?.team?.displayName));
  console.log('boxscore.players[0] statistics categories:', teamPlayers?.statistics?.map(s => s.name));
  const cat = teamPlayers?.statistics?.find(s => s.name === 'passing') || teamPlayers?.statistics?.[0];
  console.log('one statistics category full shape:', JSON.stringify(cat, null, 2));
}
