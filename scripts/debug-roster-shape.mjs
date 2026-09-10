// Temporary diagnostic — confirm current team for a new entry's players
// before adding them, given trades already found in this fictional season.
const TEAM_ABBRS = ['ari','atl','bal','buf','car','chi','cin','cle','dal','den','det','gb',
  'hou','ind','jax','kc','lac','lar','lv','mia','min','ne','no','nyg','nyj','phi','pit',
  'sea','sf','tb','ten','wsh'];

const TEAM_NAMES = {
  ari: 'Arizona Cardinals', atl: 'Atlanta Falcons', bal: 'Baltimore Ravens',
  buf: 'Buffalo Bills', car: 'Carolina Panthers', chi: 'Chicago Bears',
  cin: 'Cincinnati Bengals', cle: 'Cleveland Browns', dal: 'Dallas Cowboys',
  den: 'Denver Broncos', det: 'Detroit Lions', gb: 'Green Bay Packers',
  hou: 'Houston Texans', ind: 'Indianapolis Colts', jax: 'Jacksonville Jaguars',
  kc: 'Kansas City Chiefs', lac: 'Los Angeles Chargers', lar: 'Los Angeles Rams',
  lv: 'Las Vegas Raiders', mia: 'Miami Dolphins', min: 'Minnesota Vikings',
  ne: 'New England Patriots', no: 'New Orleans Saints', nyg: 'New York Giants',
  nyj: 'New York Jets', phi: 'Philadelphia Eagles', pit: 'Pittsburgh Steelers',
  sea: 'Seattle Seahawks', sf: 'San Francisco 49ers', tb: 'Tampa Bay Buccaneers',
  ten: 'Tennessee Titans', wsh: 'Washington Commanders',
};

const targets = ['Sam LaPorta', 'Khalil Shakir', 'Dalton Kincaid', 'Tyjae Spears'];

for (const abbr of TEAM_ABBRS) {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${abbr}/roster`);
  if (!res.ok) { console.log(`${abbr}: fetch failed (${res.status})`); continue; }
  const data = await res.json();
  const raw = JSON.stringify(data);
  const hits = targets.filter(t => raw.includes(t));
  if (hits.length) console.log(`${TEAM_NAMES[abbr]} (${abbr}): contains ${hits.join(', ')}`);
}
console.log('done');
