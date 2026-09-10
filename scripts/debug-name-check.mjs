// Temporary diagnostic — cross-checks every drafted player's name in
// entries.json against ESPN's actual team rosters, to catch spelling
// mismatches before they silently cause 0 touchdowns to be attributed.
// Deleted once verification is done.
import { readFile } from 'node:fs/promises';

function normalizeName(name) {
  return (name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/đ/gi, 'd').replace(/ł/gi, 'l').replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const TEAM_ABBR = {
  'Arizona Cardinals': 'ari', 'Atlanta Falcons': 'atl', 'Baltimore Ravens': 'bal',
  'Buffalo Bills': 'buf', 'Carolina Panthers': 'car', 'Chicago Bears': 'chi',
  'Cincinnati Bengals': 'cin', 'Cleveland Browns': 'cle', 'Dallas Cowboys': 'dal',
  'Denver Broncos': 'den', 'Detroit Lions': 'det', 'Green Bay Packers': 'gb',
  'Houston Texans': 'hou', 'Indianapolis Colts': 'ind', 'Jacksonville Jaguars': 'jax',
  'Kansas City Chiefs': 'kc', 'Los Angeles Chargers': 'lac', 'Los Angeles Rams': 'lar',
  'Las Vegas Raiders': 'lv', 'Miami Dolphins': 'mia', 'Minnesota Vikings': 'min',
  'New England Patriots': 'ne', 'New Orleans Saints': 'no', 'New York Giants': 'nyg',
  'New York Jets': 'nyj', 'Philadelphia Eagles': 'phi', 'Pittsburgh Steelers': 'pit',
  'Seattle Seahawks': 'sea', 'San Francisco 49ers': 'sf', 'Tampa Bay Buccaneers': 'tb',
  'Tennessee Titans': 'ten', 'Washington Commanders': 'wsh',
};

const entries = JSON.parse(await readFile(new URL('../data/entries.json', import.meta.url), 'utf8'));
const drafted = [];
for (const e of entries) {
  for (const p of e.players || []) {
    drafted.push({ entry: e.name, name: p.name, team: p.team });
  }
}

const uniqueTeams = [...new Set(drafted.map(d => d.team))];
console.log(`Checking ${drafted.length} drafted players across ${uniqueTeams.length} teams...`);

const rosterByTeam = {};
for (const teamName of uniqueTeams) {
  const abbr = TEAM_ABBR[teamName];
  if (!abbr) { console.log(`No abbreviation mapping for team "${teamName}"`); continue; }
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${abbr}/roster`;
  const res = await fetch(url);
  if (!res.ok) { console.log(`FAILED to fetch roster for ${teamName} (${abbr}): ${res.status}`); continue; }
  const data = await res.json();
  const athletes = (data.athletes || []).flatMap(group => group.items || group.athletes || []);
  rosterByTeam[teamName] = athletes.map(a => ({ displayName: a.displayName, fullName: a.fullName }));
  console.log(`${teamName} (${abbr}): ${rosterByTeam[teamName].length} roster entries`);
}

console.log('\n=== Match results ===');
for (const d of drafted) {
  const roster = rosterByTeam[d.team] || [];
  const norm = normalizeName(d.name);
  const exact = roster.find(a => normalizeName(a.displayName) === norm || normalizeName(a.fullName) === norm);
  if (exact) {
    console.log(`OK    ${d.entry.padEnd(24)} ${d.name.padEnd(22)} -> matches "${exact.displayName}" on ${d.team}`);
  } else {
    // look for a close match anywhere on that roster (same normalized last name)
    const lastName = normalizeName(d.name.trim().split(/\s+/).pop());
    const close = roster.filter(a => normalizeName(a.displayName).includes(lastName));
    console.log(`MISS  ${d.entry.padEnd(24)} ${d.name.padEnd(22)} on ${d.team} -- NOT FOUND on roster. Close matches: ${close.map(a => a.displayName).join(', ') || 'none'}`);
  }
}
