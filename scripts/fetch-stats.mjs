// Pulls live NFL game data from ESPN's public scoreboard/summary endpoints
// (site.api.espn.com — unofficial/undocumented, but free, keyless, and
// updates during games rather than in a nightly batch) and writes
// data/scores.json. Verified field shapes against real live data on
// 2026-09-10; see README for the tradeoffs of using an unofficial API.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const REG_SEASON_GAMES = 17; // per team, since the 2021 schedule expansion
const MAX_RECENT_TOUCHDOWNS = 12;

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const outPath = path.join(dataDir, 'scores.json');
const entriesPath = path.join(dataDir, 'entries.json');
const cachePath = path.join(dataDir, 'espn-cache.json');

const TEAM_NAMES = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills', CAR: 'Carolina Panthers', CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs', LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams',
  LV: 'Las Vegas Raiders', MIA: 'Miami Dolphins', MIN: 'Minnesota Vikings',
  NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks', SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans', WSH: 'Washington Commanders',
};

// Matches index.html's normalization: case/accent/punctuation-insensitive.
function normalizeName(name) {
  return (name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/đ/gi, 'd').replace(/ł/gi, 'l').replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed for ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

// Every statistics category whose `keys` includes a "*Touchdowns" field
// (passing/rushing/receiving/defensive/interception/kick-return/punt-return)
// counts. Presence in the returned map — regardless of touchdown count —
// means the player recorded a stat in this game, used for gamesPlayed.
function extractGameBoxscore(boxscorePlayers) {
  const out = {};
  for (const teamBlock of boxscorePlayers || []) {
    const teamAbbr = teamBlock.team?.abbreviation;
    for (const cat of teamBlock.statistics || []) {
      const tdIdx = (cat.keys || []).findIndex(k => /Touchdowns$/.test(k));
      for (const a of cat.athletes || []) {
        const displayName = a.athlete?.displayName;
        if (!displayName) continue;
        const key = normalizeName(displayName);
        if (!out[key]) out[key] = { name: displayName, team: teamAbbr, touchdowns: 0 };
        out[key].team = teamAbbr;
        if (tdIdx !== -1) {
          out[key].touchdowns += Number(a.stats?.[tdIdx]) || 0;
        }
      }
    }
  }
  return out;
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

let cache = { season: null, games: {} };
try {
  cache = JSON.parse(await readFile(cachePath, 'utf8'));
} catch {
  // No cache yet — fine, first run.
}

const scoreboard = await getJson(`${ESPN_BASE}/scoreboard`);
const season = scoreboard.season?.year;
const isRegularSeason = scoreboard.season?.type === 2;
const currentWeek = isRegularSeason ? (scoreboard.week?.number || 0) : 0;

if (cache.season !== season) {
  cache = { season, games: {} };
}

const perPlayerSeason = {}; // normalizedName -> { name, team, touchdowns, gamesPlayed }
const teamCompletedGames = {}; // teamAbbr -> count of fully-finished games
const playerLastFreshContext = {}; // normalizedName -> { homeAbbr, awayAbbr, playerTeam, date, scoringPlays }

for (let week = 1; week <= currentWeek; week++) {
  let weekEvents;
  try {
    const weekBoard = await getJson(`${ESPN_BASE}/scoreboard?week=${week}&year=${season}&seasontype=2`);
    weekEvents = weekBoard.events || [];
  } catch (err) {
    console.error(`Couldn't fetch week ${week} scoreboard, skipping it this run: ${err.message}`);
    continue;
  }

  for (const event of weekEvents) {
    const competitors = event.competitions?.[0]?.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home')?.team?.abbreviation;
    const away = competitors.find(c => c.homeAway === 'away')?.team?.abbreviation;
    const state = event.status?.type?.state; // 'pre' | 'in' | 'post'
    const isFinal = event.status?.type?.completed === true;

    let gameBoxscore;
    let scoringPlays = [];
    const cached = cache.games[event.id];

    if (cached?.final) {
      gameBoxscore = cached.players;
    } else if (state === 'pre') {
      continue; // nothing to fetch yet
    } else {
      try {
        const summary = await getJson(`${ESPN_BASE}/summary?event=${event.id}`);
        gameBoxscore = extractGameBoxscore(summary.boxscore?.players);
        scoringPlays = Array.isArray(summary.scoringPlays) ? summary.scoringPlays : [];
        if (isFinal) {
          cache.games[event.id] = { final: true, week, home, away, players: gameBoxscore };
        }
      } catch (err) {
        console.error(`Couldn't fetch summary for event ${event.id} (week ${week}), skipping it this run: ${err.message}`);
        continue;
      }
    }

    if (isFinal) {
      if (home) teamCompletedGames[home] = (teamCompletedGames[home] || 0) + 1;
      if (away) teamCompletedGames[away] = (teamCompletedGames[away] || 0) + 1;
    }

    for (const [key, pdata] of Object.entries(gameBoxscore)) {
      if (!perPlayerSeason[key]) perPlayerSeason[key] = { name: pdata.name, team: pdata.team, touchdowns: 0, gamesPlayed: 0 };
      perPlayerSeason[key].team = pdata.team;
      perPlayerSeason[key].touchdowns += pdata.touchdowns;
      perPlayerSeason[key].gamesPlayed += 1;
      if (!cached?.final) {
        playerLastFreshContext[key] = { home, away, playerTeam: pdata.team, date: event.date, scoringPlays };
      }
    }
  }
}

const teams = {};
for (const abbr of Object.keys(TEAM_NAMES)) {
  const playedGames = teamCompletedGames[abbr] || 0;
  teams[abbr] = {
    name: TEAM_NAMES[abbr],
    playedGames,
    gamesRemaining: Math.max(0, REG_SEASON_GAMES - playedGames),
  };
}

// Diff season totals against the previous run to build the ticker, same
// approach as before, just against a live-updating source now.
const newTouchdownEvents = [];
for (const [key, stat] of Object.entries(perPlayerSeason)) {
  if (!draftedNames.has(key)) continue;
  const oldTds = previousPlayers[key] ? Number(previousPlayers[key].touchdowns) || 0 : 0;
  const delta = stat.touchdowns - oldTds;
  if (delta <= 0) continue;
  const ctx = playerLastFreshContext[key];
  if (!ctx) continue; // delta came entirely from already-cached final games (shouldn't happen)

  const opponentAbbr = ctx.playerTeam === ctx.home ? ctx.away : ctx.home;
  const isHome = ctx.playerTeam === ctx.home;

  // Best-effort match to a real scoring play for quarter/clock context —
  // ESPN's scoringPlays only carries a free-text description, so we match
  // by team + the player's last name appearing in that text.
  const lastName = stat.name.trim().split(/\s+/).pop().toLowerCase();
  const play = ctx.scoringPlays
    .filter(p => p.team?.abbreviation === ctx.playerTeam && /touchdown/i.test(p.type?.text || ''))
    .filter(p => (p.text || '').toLowerCase().includes(lastName))
    .pop();

  newTouchdownEvents.push({
    player: stat.name,
    team: ctx.playerTeam,
    delta,
    touchdownsAfter: stat.touchdowns,
    opponent: TEAM_NAMES[opponentAbbr] || opponentAbbr,
    isHome,
    gameDate: ctx.date,
    quarter: play?.period?.number ?? null,
    clock: play?.clock?.displayValue ?? null,
    detectedAt: new Date().toISOString(),
  });
}

const recentTouchdowns = [...newTouchdownEvents, ...previousRecentTouchdowns].slice(0, MAX_RECENT_TOUCHDOWNS);

const output = {
  updatedAt: new Date().toISOString(),
  season: String(season),
  statsPublished: isRegularSeason && currentWeek >= 1,
  playersReturned: Object.keys(perPlayerSeason).length,
  players: perPlayerSeason,
  teams,
  recentTouchdowns,
};

await writeFile(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
await writeFile(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf8');

console.log(`Wrote ${Object.keys(perPlayerSeason).length} players and ${Object.keys(teams).length} teams to data/scores.json (season ${season}, through week ${currentWeek}). ${newTouchdownEvents.length} new drafted-player touchdown event(s) logged.`);
