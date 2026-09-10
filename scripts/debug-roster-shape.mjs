// Temporary diagnostic — find which team's roster actually contains each
// of the 5 "missing" players, to check whether they were traded relative
// to what's listed in entries.json (rather than a name-matching bug).
const TEAM_ABBRS = ['ari','atl','bal','buf','car','chi','cin','cle','dal','den','det','gb',
  'hou','ind','jax','kc','lac','lar','lv','mia','min','ne','no','nyg','nyj','phi','pit',
  'sea','sf','tb','ten','wsh'];

const targets = ['Shaheed', 'White', 'Mitchell', 'Kolar', 'Cooper'];

for (const abbr of TEAM_ABBRS) {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${abbr}/roster`);
  if (!res.ok) { console.log(`${abbr}: fetch failed (${res.status})`); continue; }
  const data = await res.json();
  const raw = JSON.stringify(data);
  const hits = targets.filter(t => raw.includes(t));
  if (hits.length) console.log(`${abbr}: contains ${hits.join(', ')}`);
}
console.log('done');
