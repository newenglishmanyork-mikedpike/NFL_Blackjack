# NFL Blackjack

A fantasy pool where each entry picks 4 NFL players and tries to total
exactly 21 combined touchdowns across the season — go over 21 and you
bust, and every player must score at least once for the entry to
qualify. `index.html` renders the live leaderboard; touchdown counts
update automatically, no manual score entry. This is the NFL sibling of
[PL Blackjack](https://github.com/newenglishmanyork-mikedpike/PL_Blackjack),
same idea, same architecture, different sport.

## How it works

- `index.html` — the page. It reads `data/entries.json` (who picked whom)
  and `data/scores.json` (current touchdown counts) and renders the
  board.
- `data/entries.json` — one array entry per contestant's 4 picks. Edited
  by hand and committed — squads are locked in once, so this doesn't need
  a login or a database.
- `data/scores.json` — generated automatically. Don't edit it by hand.
- `data/espn-cache.json` — generated automatically. A permanent record of
  finished games' box scores, so the workflow doesn't have to re-fetch a
  game's stats over and over once it's over. Don't edit it by hand.
- `.github/workflows/refresh-stats.yml` — a GitHub Actions workflow that
  pulls live game data from ESPN's public scoreboard and box-score
  endpoints and commits the result to `data/scores.json`. It can always be
  run manually, and otherwise runs on a schedule matched to when games
  actually happen:
  - **Sundays, 1pm-11pm EST**: every 5 minutes, to track games as they
    happen live.
  - **The rest of the week** (Monday-Saturday, covering Thursday Night
    Football, Monday Night Football, and any other game days): every 6
    hours.

  Note: the Sunday window is a fixed UTC-5 offset (true EST), not adjusted
  for daylight saving. For most of the season (before the November DST
  change), Eastern clocks are on EDT (UTC-4), so the window actually lands
  1 hour later on local clocks (2pm-12am Eastern) until the fall-back,
  after which it lines up with 1pm-11pm exactly.

**No API key needed** — ESPN's scoreboard/box-score endpoints are public
and don't require registration. That said, they're **unofficial and
undocumented** (there's no published API contract, unlike the Premier
League tracker's football-data.org or the previous nflverse-based
approach) — many hobby fantasy-sports projects rely on them, and they've
been stable in practice, but ESPN could change the response shape or
access rules without notice. If the workflow starts failing, that's the
first thing to check (Actions tab → "Refresh stats" → look at the failed
run's log).

## One-time setup

1. **Enable GitHub Pages**
   Settings → Pages → under "Build and deployment", set Source to
   "Deploy from a branch", pick the branch this project lives on (e.g.
   `main`) and folder `/ (root)`, then Save. GitHub will give you a URL
   like `https://<your-username>.github.io/<repo-name>/` — that's the
   link to share with your friends.

2. **Run the workflow once manually** so `data/scores.json` gets filled
   in as soon as data is available: Actions tab → "Refresh stats" → Run
   workflow. (See the note below if the season hasn't started publishing
   stats yet.)

3. **Fill in `data/entries.json`** with real entries (see "Adding
   entries" below) — it currently just has a placeholder example.

## Refreshing stats on demand

The page itself has no refresh/trigger button — the automatic schedule
described above keeps `data/scores.json` current, and if you want it
sooner, trigger it directly from GitHub: Actions tab → "Refresh stats" →
Run workflow. The page always shows whatever is currently committed.

### A note on data freshness

Unlike a season-aggregate stats file that only refreshes once a day, ESPN's
box scores update **live, during the game** — the 5-minute Sunday cadence
means a touchdown can show up on the leaderboard within a few minutes of
it happening, not the next morning. `fetch-stats.mjs` fetches each
in-progress or newly-finished game's box score directly and sums its
touchdown-related stats per player; finished games get cached permanently
in `data/espn-cache.json` so re-runs don't keep re-fetching games that are
already over. Official stat corrections (the NFL sometimes revises a game's
stats in the days after it's played) aren't re-checked once a game is
cached as final — this mirrors the same tradeoff the Premier League
tracker makes with its own goal counts.

## Adding entries

Entries live in `data/entries.json` — edit the file directly and
commit/push (or open a pull request):

```json
{
  "name": "Dave's Squad",
  "owner": "Dave",
  "players": [
    { "name": "Jonathan Taylor", "team": "Indianapolis Colts", "projectedTds": 12 },
    { "name": "Jahmyr Gibbs", "team": "Detroit Lions", "projectedTds": 10 },
    { "name": "Christian McCaffrey", "team": "San Francisco 49ers", "projectedTds": 11 },
    { "name": "Davante Adams", "team": "Los Angeles Rams", "projectedTds": 7 }
  ]
}
```

`projectedTds` is optional (see "Projected total" below for what happens
without it) but recommended — a preseason touchdown projection for that
player from wherever you're sourcing it (a fantasy football guide, etc.).

**Player names should match ESPN's `displayName` spelling** (usually
their full common name, e.g. "Christian McCaffrey") for touchdowns to
match up. Matching ignores case, accents, and punctuation, but it still
needs the same words in the same order. If a player shows 0 when you
know they've scored, check the spelling against `data/scores.json` after
a refresh — its `players` object lists every name ESPN currently has
stats for.

## What counts as a touchdown

Every touchdown credited to the player: rushing, receiving, passing,
special-teams (kick/punt return), and defensive touchdowns. A quarterback
racks up touchdowns from their passing stats just like a receiver does
from catches — there's no exclusion here.

Regular season only — playoff touchdowns aren't counted, matching the
Premier League tracker's league-only scope. The season runs 17 games per
team.

## Local preview

Because the page fetches local JSON files, opening `index.html` directly
(`file://`) will fail — browsers block that. Serve it locally instead:

```
npx serve .
# or
python3 -m http.server 8000
```

then open the printed `localhost` URL.

## Projected total

The leaderboard's "Proj." column estimates each entry's end-of-season
total, built from each player's **preseason projected touchdowns** —
sourced manually (e.g. from a fantasy football guide) and stored as a
`projectedTds` field per player in `data/entries.json`:

```json
{ "name": "Amon-Ra St. Brown", "team": "Detroit Lions", "projectedTds": 9 }
```

For each player: `projectedTds ÷ 17` gives a per-game rate, multiplied
by their team's remaining regular-season games to get their projected
*additional* touchdowns. Summed across all 4 players and added to the
entry's current actual touchdowns, then rounded **up** to a whole
number for display. The emoji is just a quick read on that number
relative to 21 (😴 way under, 😬 needs work, 😊 good pace, 🎯 right on
target, 🤯 projected bust — anything over 21).

Before any games are played, this means the projected total is simply
the sum of the 4 players' `projectedTds` — a useful sanity check.

**If a player has no `projectedTds` figure in `data/entries.json`**, the
site falls back to the old method instead of showing zero: their own
actual touchdowns-per-game rate so far (once they've played at least 3
games — `MIN_GAMES_FOR_PROJECTION` in `index.html` — since a smaller
sample would extrapolate wildly from one early touchdown). Below that
games-played threshold with no preseason figure, a player's projected
contribution is just their actual touchdowns so far.

This is still not a sophisticated model — a single preseason number
per player, evenly spread across their remaining games, won't capture
bye weeks, injuries, role changes, or matchup strength. Treat it as a
rough pace indicator, not a forecast.

## Latest touchdowns ticker

Below the header, the page shows the most recent touchdowns scored by
anyone in someone's squad: player name, opponent, home/away, and — when
available — the real quarter and game clock the touchdown happened at.
`fetch-stats.mjs` compares each refresh's touchdown tallies against the
previous ones committed to `data/scores.json`; whenever a drafted
player's tally goes up, it logs that as an event and tries to match it to
a real scoring play from that game (ESPN's `scoringPlays` list) to pull
the quarter/clock — falling back to just the game date if no confident
match is found. Events are kept in `scores.json`'s `recentTouchdowns`
array (newest first, capped at 12).

Caveats worth knowing:
- **The quarter/clock match is best-effort**, done by matching the
  scoring player's last name against ESPN's free-text play description
  (ESPN doesn't give scoring plays a structured "scorer" field) — it can
  occasionally miss, in which case the ticker line just shows the date
  instead of a quarter/clock.
- **History starts from when this feature shipped.** Touchdowns scored
  before `recentTouchdowns` existed aren't retroactively backfilled.
- Multiple touchdowns by the same player between refreshes show as one
  ticker line with a `×N` badge rather than N separate lines.

## A note on season timing

Before the regular season starts (preseason, or the off-season),
`data/scores.json` correctly shows everyone at 0 touchdowns and all 32
teams with a full 17 games remaining. The page and workflow already
handle this gracefully (`statsPublished: false` in `scores.json`, with a
note in the page header) — there's nothing to configure, it'll just
start filling in once the regular season kicks off.

## Limitations

- Team names on player cards are just labels you type in — they aren't
  validated against anything.
- Editing entries requires git access (or asking whoever maintains the
  repo to add a pull request). There's no in-browser save.
- Traded players are tracked under whichever team they were with in
  their most recent game — fine for the "opponent" ticker line, but
  their `gamesRemaining` follows their new team's schedule.
- ESPN's endpoint is unofficial — see the callout under "How it works"
  above. If it ever breaks, `data/scores.json` just stops updating rather
  than showing wrong data; the page always displays whatever was last
  committed successfully.
