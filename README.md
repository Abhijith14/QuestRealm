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

## Data & the road to a database

Scores currently live in the browser's `localStorage`, namespaced per game. Three keys per game:

- `questrealm:<game-id>:players` — the roster: each player's score, `streak`/`wins`/`bestStreak`, and a per-game score **history** (`{delta, ts}` entries).
- `questrealm:<game-id>:rounds` — the recorded games (Score Book): per-round scores, the winner, and tie info (`tie`, `tieNote`) when the table split.
- `questrealm:<game-id>:activity` — the live log (Recent Activity): one entry per Add Score / Crown the Victor action taken through the UI.

Games saved before streaks or history existed are migrated automatically on load. Real results already played (Grand Austria Hotel's first six games, including two tiebreaks) are hardcoded as a one-time seed in `js/storage.js` — it only fires the first time a game's `players` key is empty, so it behaves like real starter data and is freely editable afterward.

The storage layer is isolated in [`js/storage.js`](js/storage.js) behind a small API (`loadPlayers`, `savePlayers`, `addPlayer`, `addScore`, `recordWin`, `removePlayer`, `loadRounds`, `loadActivity`). To move to a real database later, reimplement those against an API/backend — the UI never touches `localStorage` directly.

## Adding a new game

1. Add an entry to the `GAMES` registry in [`js/leaderboard.js`](js/leaderboard.js) (name, tagline, theme class, score unit).
2. Add a theme block in [`css/style.css`](css/style.css).
3. Add a card for it on `index.html`.
