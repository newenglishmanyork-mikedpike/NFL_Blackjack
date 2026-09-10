// Temporary diagnostic — the earlier roster name-check falsely reported
// several active players as "not found" on their team roster. Investigating
// whether that was a bad assumption about the roster endpoint's JSON shape.
const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/no/roster');
console.log('status:', res.status);
const data = await res.json();
console.log('top-level keys:', Object.keys(data));
console.log('athletes is array?', Array.isArray(data.athletes), 'length:', data.athletes?.length);
if (Array.isArray(data.athletes)) {
  for (const group of data.athletes) {
    console.log('group keys:', Object.keys(group), 'position/group label:', group.position ?? group.displayName ?? group.name);
    console.log('  items type:', typeof group.items, Array.isArray(group.items) ? group.items.length : group.items);
  }
}
const raw = JSON.stringify(data);
console.log('\nRaw text includes "Shaheed"?', raw.includes('Shaheed'));
const idx = raw.indexOf('Shaheed');
if (idx !== -1) {
  console.log('context around match:', raw.slice(Math.max(0, idx - 300), idx + 100));
}
