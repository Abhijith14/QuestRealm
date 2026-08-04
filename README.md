# QuestRealm 🏆

*Where game nights become legend.*

A little salon for our home game nights — pick a game from the dashboard, open its themed leaderboard, add guests, and tally scores.

**First table open:** [Grand Austria Hotel](https://boardgamegeek.com/boardgame/182874/grand-austria-hotel), styled after its turn-of-the-century Viennese café aesthetic (gold, burgundy velvet, café cream, Art Nouveau flourishes).

## Features

- **Dashboard** (`index.html`) — choose a game; each card shows a live teaser of that game's standings (guest count + reigning champion).
- **Themed leaderboard** (`leaderboard.html?game=grand-austria-hotel`) — podium for the top three, a full "Guest Ledger" with animated score bars, gold-glow highlights, sparkles, and FLIP rank-change animations.
- **Add Guest** — name + emoji emblem picker.
- **Add Score** — pick a guest from a dropdown and enter points; the value is *added* to their running total (negative values allowed for corrections).
- **Crown the Victor** — record who won a game: their 🔥 win streak climbs by one and everyone else's resets. Streak pills appear on ledger rows and the podium (blazing glow at 3+), with total wins and best streak in the tooltip. The dashboard card teases the hottest active streak.
- **Remove Guest** — hover a ledger row and hit ✕ (with confirmation).
- **Game History** — an expandable panel below the ledger with two parts:
  - **The Score Book** — every recorded game in play order, showing each guest's score that round and a crown on the winner. Games decided by tiebreak carry a 🤝 badge and a note on how the table resolved it.
  - **Recent Activity** — a live, reverse-chronological feed of every Add Score and Crown the Victor action taken since, with timestamps.

## Running it

Plain HTML/CSS/JS — no build step, no dependencies.

- Open `index.html` in a browser, or
- Serve the folder (`python3 -m http.server`) — recommended so the `?game=` URLs behave nicely, or
- Host on **GitHub Pages**: Settings → Pages → deploy from the branch root. Done.

## Data: Supabase (cache-first), with localStorage as fallback

Scores live in a **Supabase** (Postgres) database — shared across everyone who opens the site — with three tables per game, mirroring the original storage shape:

- `players` — the roster: each player's `score`, `streak`/`wins`/`best_streak`, and a per-game score **history** (`{delta, ts}` entries, jsonb).
- `rounds` — the recorded games (Score Book): per-round scores, the winner, and tie info (`tie`, `tie_note`) when the table split.
- `activity` — the live log (Recent Activity): one row per Add Score / Crown the Victor action.

All three are keyed by `game_id` and protected by Row-Level Security. The connection is configured in [`js/config.js`](js/config.js) via a **public anon key** — safe to ship in client JS; the database is guarded by RLS policies, not by hiding the key. The `service_role` key and DB password are never in the repo.

**Cache-first design.** [`js/storage.js`](js/storage.js) keeps an in-memory cache (mirrored to `localStorage`) so reads stay synchronous and the UI renders instantly. On load it hydrates the cache from Supabase and re-renders (`QRStore.onSync`); writes update the cache immediately and push to Supabase in the background. If Supabase is unreachable, the site falls back to the last-known `localStorage` copy. The first time a game exists only locally, its data is migrated up to Supabase automatically.

The storage layer stays isolated behind the same small API (`loadPlayers`, `savePlayers`, `addPlayer`, `addScore`, `recordWin`, `removePlayer`, `loadRounds`, `loadActivity`) — the UI never touches the backend directly. Grand Austria Hotel's first six real games (including two tiebreaks) are seeded directly in the database.

> **Note on access:** writes are currently open to anyone with the site URL (fine for a private/unlisted game-night tool). To lock editing behind a PIN or login later, tighten the RLS write policy — no client change needed.

## Adding a new game

1. Add an entry to the `GAMES` registry in [`js/leaderboard.js`](js/leaderboard.js) (name, tagline, theme class, score unit).
2. Add a theme block in [`css/style.css`](css/style.css).
3. Add a card for it on `index.html`.
