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
- `.github/workflows/refresh-stats.yml` — a GitHub Actions workflow that
  runs every 6 hours (and can be run manually), downloads the free public
  CSV data published by [nflverse-data](https://github.com/nflverse/nflverse-data)
  (player weekly stats + schedules), and commits the result to
  `data/scores.json`.

**No API key needed.** Unlike the Premier League tracker, nflverse-data
publishes its stats and schedules as plain CSV files on public GitHub
Releases — no registration, no token, no rate limit to worry about.

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

The page itself has no refresh/trigger button — the automatic 6-hourly
schedule keeps `data/scores.json` current, and if you want it sooner,
trigger it directly from GitHub: Actions tab → "Refresh stats" → Run
workflow. The page always shows whatever is currently committed.

## Adding entries

Entries live in `data/entries.json` — edit the file directly and
commit/push (or open a pull request):

```json
{
  "name": "Dave's Squad",
  "owner": "Dave",
  "players": [
    { "name": "Jonathan Taylor", "team": "Indianapolis Colts" },
    { "name": "Jahmyr Gibbs", "team": "Detroit Lions" },
    { "name": "Christian McCaffrey", "team": "San Francisco 49ers" },
    { "name": "Davante Adams", "team": "Los Angeles Rams" }
  ]
}
```

**Player names should match nflverse's `player_display_name` spelling**
(usually their full common name, e.g. "Christian McCaffrey") for
touchdowns to match up. Matching ignores case, accents, and punctuation,
but it still needs the same words in the same order. If a player shows 0
when you know they've scored, check the spelling against
`data/scores.json` after a refresh — its `players` object lists every
name nflverse currently has stats for.

## What counts as a touchdown

Every touchdown credited to the player: rushing, receiving, passing,
special-teams (kick/punt return), and defensive touchdowns. A quarterback
racks up touchdowns from their passing stats just like a receiver does
from catches — there's no exclusion here.

Regular season only (`REG`) — playoff touchdowns aren't counted, matching
the Premier League tracker's league-only scope. The season runs 17 games
per team.

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
total: for each of the 4 players, (touchdowns so far ÷ their games
played so far) × their team's remaining regular-season games, added to
the entry's current actual touchdowns. The emoji is just a quick read on
that number relative to 21 (😴 way under, 😬 needs work, 😊 good pace, 🎯
right on target, 😅 getting risky, 🤯 way past).

This is a simple rate projection using each player's own actual scoring
rate, not any kind of advanced model — it's noisy early in the season
(small sample sizes) and doesn't account for matchups, injuries, or role
changes. A player needs at least 3 games played before their rate counts
toward the projection (`MIN_GAMES_FOR_PROJECTION` in `index.html`) —
otherwise one early touchdown in week 1 would extrapolate to a
ridiculous full-season total. Below that threshold, a player's projected
contribution is just their actual touchdowns so far, same as everyone
else.

## Latest touchdowns ticker

Below the header, the page shows the most recent touchdowns scored by
anyone in someone's squad: player name, opponent, home/away, and date.
nflverse's public data has no play-by-play event feed built into this
pipeline — only a running weekly stat line per player. `fetch-stats.mjs`
works around that the same way the Premier League tracker's ticker does:
by comparing each refresh's touchdown tallies against the previous ones
committed to `data/scores.json`; whenever a drafted player's tally goes
up, it logs that as an event against their team's most recent finished
game (pulled from nflverse's `games.csv` schedule file) and keeps a
rolling history in `scores.json`'s `recentTouchdowns` array (newest
first, capped at 12).

Caveats worth knowing:
- **Attribution is inferred, not guaranteed.** If a player's tally rises
  between two refreshes, that touchdown is credited to their team's
  latest finished game as of that refresh. This is normally right for a
  once-a-week schedule, but is a good reason to keep the 6-hourly
  automatic refresh running rather than letting it lapse.
- **History starts from when this feature shipped.** Touchdowns scored
  before `recentTouchdowns` existed aren't retroactively backfilled.
- Multiple touchdowns by the same player between refreshes show as one
  ticker line with a `×N` badge rather than N separate lines.

## A note on season timing

Stats for a given season only appear in nflverse's data once games have
been played and the weekly stats file is published — as of this writing,
the 2026 season's stats file doesn't exist yet, so `data/scores.json`
correctly shows everyone at 0 touchdowns and all 32 teams with a full
17 games remaining. The page and workflow already handle this
gracefully (`statsPublished: false` in `scores.json`, with a note in the
page header) — there's nothing to configure, it'll just start filling in
once the season's games are played and nflverse publishes the file.

## Limitations

- Team names on player cards are just labels you type in — they aren't
  validated against anything.
- Editing entries requires git access (or asking whoever maintains the
  repo to add a pull request). There's no in-browser save.
- Traded players are tracked under whichever team they were with in
  their most recent game — fine for the "opponent" ticker line, but
  their `gamesRemaining` follows their new team's schedule.
