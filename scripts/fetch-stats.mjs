// Pulls NFL player stats and schedule data from the nflverse-data GitHub
// releases (https://github.com/nflverse/nflverse-data) and writes
// data/scores.json. No API key needed — these are public CSV downloads.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RELEASES_BASE = 'https://github.com/nflverse/nflverse-data/releases/download';
const REG_SEASON_GAMES = 17; // per team, since the 2021 schedule expansion
const MAX_RECENT_TOUCHDOWNS = 12;

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const outPath = path.join(dataDir, 'scores.json');
const entriesPath = path.join(dataDir, 'entries.json');

const TEAM_NAMES = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills', CAR: 'Carolina Panthers', CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs', LA: 'Los Angeles Rams', LAC: 'Los Angeles Chargers',
  LV: 'Las Vegas Raiders', MIA: 'Miami Dolphins', MIN: 'Minnesota Vikings',
  NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks', SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans', WAS: 'Washington Commanders',
};

function currentNflSeason() {
  const now = new Date();
  // Season N runs roughly Aug (N) through Feb (N+1); before August it's
  // still last season's tail end (or off-season with no new data yet).
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

// Minimal RFC4180-ish CSV parser (handles quoted fields with embedded
// commas/newlines and "" escaped quotes) — no npm deps, matching the
// zero-dependency style of the rest of this script.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
    return obj;
  });
}

async function fetchCsv(url) {
  const res = await fetch(url);
  if (res.status === 404) return { ok: false, rows: [] };
  if (!res.ok) throw new Error(`Request failed for ${url}: ${res.status} ${res.statusText}`);
  const text = await res.text();
  return { ok: true, rows: parseCsv(text) };
}

// Matches index.html's normalization: case/accent/punctuation-insensitive.
function normalizeName(name) {
  return (name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/đ/gi, 'd').replace(/ł/gi, 'l').replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

let previous = {};
try {
  previous = JSON.parse(await readFile(outPath, 'utf8'));
} catch {
  // No existing scores.json yet — fine, first run.
}
const previousPlayers = previous.players || {};
const previousRecentTouchdowns = Array.isArray(previous.recentTouchdowns) ? previous.recentTouchdowns : [];

let draftedNames = new Set();
try {
  const entries = JSON.parse(await readFile(entriesPath, 'utf8'));
  for (const entry of entries) {
    for (const p of entry.players || []) {
      draftedNames.add(normalizeName(p.name));
    }
  }
} catch (err) {
  console.error(`Couldn't read entries.json for the touchdowns ticker (continuing without it): ${err.message}`);
}

const season = currentNflSeason();

const statsUrl = `${RELEASES_BASE}/stats_player/stats_player_week_${season}.csv`;
const { ok: statsAvailable, rows: statRows } = await fetchCsv(statsUrl);
if (!statsAvailable) {
  console.log(`No stats file published yet for the ${season} season at ${statsUrl} — writing an empty player set for now.`);
}

// One row per player per week; aggregate all regular-season touchdowns
// credited to that player: rushing, receiving, passing, special-teams, and
// defensive.
const players = {};
for (const row of statRows) {
  if (row.season_type !== 'REG') continue;
  const displayName = row.player_display_name;
  if (!displayName) continue;
  const key = normalizeName(displayName);
  const tds = (Number(row.rushing_tds) || 0) + (Number(row.receiving_tds) || 0)
    + (Number(row.passing_tds) || 0)
    + (Number(row.special_teams_tds) || 0) + (Number(row.def_tds) || 0);
  if (!players[key]) {
    players[key] = { name: displayName, touchdowns: 0, gamesPlayed: 0, team: row.team || null };
  }
  players[key].touchdowns += tds;
  players[key].gamesPlayed += 1;
  players[key].team = row.team || players[key].team; // last-seen team (trades)
}

const gamesUrl = `${RELEASES_BASE}/schedules/games.csv`;
const { rows: gameRows } = await fetchCsv(gamesUrl);
const seasonGames = gameRows.filter(g => Number(g.season) === season && g.game_type === 'REG');

const teamGamesPlayed = {};
const lastGameByTeam = {};
for (const g of seasonGames) {
  const played = g.home_score !== '' && g.away_score !== '';
  if (!played) continue;
  for (const [team, isHome, opponent] of [[g.home_team, true, g.away_team], [g.away_team, false, g.home_team]]) {
    if (!team) continue;
    teamGamesPlayed[team] = (teamGamesPlayed[team] || 0) + 1;
    const existing = lastGameByTeam[team];
    if (!existing || new Date(g.gameday) > new Date(existing.date)) {
      lastGameByTeam[team] = { date: g.gameday, opponent, isHome };
    }
  }
}

const teams = {};
for (const abbr of Object.keys(TEAM_NAMES)) {
  const playedGames = teamGamesPlayed[abbr] || 0;
  teams[abbr] = {
    name: TEAM_NAMES[abbr],
    playedGames,
    gamesRemaining: Math.max(0, REG_SEASON_GAMES - playedGames),
  };
}

const newTouchdownEvents = [];
for (const [key, stat] of Object.entries(players)) {
  if (!draftedNames.has(key)) continue;
  const oldTds = previousPlayers[key] ? Number(previousPlayers[key].touchdowns) || 0 : 0;
  const delta = stat.touchdowns - oldTds;
  if (delta <= 0) continue;
  const lastGame = stat.team ? lastGameByTeam[stat.team] : null;
  if (!lastGame) continue; // can't attribute a game yet
  newTouchdownEvents.push({
    player: stat.name,
    team: stat.team,
    delta,
    touchdownsAfter: stat.touchdowns,
    opponent: TEAM_NAMES[lastGame.opponent] || lastGame.opponent,
    isHome: lastGame.isHome,
    gameDate: lastGame.date,
    detectedAt: new Date().toISOString(),
  });
}

const recentTouchdowns = [...newTouchdownEvents, ...previousRecentTouchdowns].slice(0, MAX_RECENT_TOUCHDOWNS);

const output = {
  updatedAt: new Date().toISOString(),
  season: String(season),
  statsPublished: statsAvailable,
  playersReturned: Object.keys(players).length,
  players,
  teams,
  recentTouchdowns,
};

await writeFile(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log(`Wrote ${Object.keys(players).length} players and ${Object.keys(teams).length} teams to data/scores.json (season ${season}). ${newTouchdownEvents.length} new drafted-player touchdown event(s) logged.`);
