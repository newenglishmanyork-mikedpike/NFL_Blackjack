// Temporary diagnostic — confirm JJ McCarthy's current team before
// updating his entry (NYG vs MIN vs PIT).
const TEAM_ABBRS = ['ari','atl','bal','buf','car','chi','cin','cle','dal','den','det','gb',
  'hou','ind','jax','kc','lac','lar','lv','mia','min','ne','no','nyg','nyj','phi','pit',
  'sea','sf','tb','ten','wsh'];

for (const abbr of TEAM_ABBRS) {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${abbr}/roster`);
  if (!res.ok) { console.log(`${abbr}: fetch failed (${res.status})`); continue; }
  const data = await res.json();
  const raw = JSON.stringify(data);
  if (raw.includes('JJ McCarthy') || raw.includes('J.J. McCarthy')) console.log(`${abbr}: contains JJ McCarthy (exact)`);
  if (raw.includes('McCarthy') && !raw.includes('JJ McCarthy') && !raw.includes('J.J. McCarthy')) {
    const idx = raw.indexOf('McCarthy');
    console.log(`${abbr}: contains a DIFFERENT McCarthy -> ${raw.slice(Math.max(0,idx-80), idx+20)}`);
  }
}
console.log('done');
