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

## Running it

Plain HTML/CSS/JS — no build step, no dependencies.

- Open `index.html` in a browser, or
- Serve the folder (`python3 -m http.server`) — recommended so the `?game=` URLs behave nicely, or
- Host on **GitHub Pages**: Settings → Pages → deploy from the branch root. Done.

## Data & the road to a database

Scores currently live in the browser's `localStorage`, namespaced per game (`questrealm:<game-id>:players`). Each player carries a score **history** (`{delta, ts}` entries) plus `streak`, `wins`, and `bestStreak`, so past sessions aren't lost. Records saved before streaks existed are migrated automatically on load.

The storage layer is isolated in [`js/storage.js`](js/storage.js) with a deliberately small API (`loadPlayers`, `savePlayers`, `addPlayer`, `addScore`, `removePlayer`). To move to a real database later, reimplement those five functions against an API/backend — the UI never touches `localStorage` directly.

## Adding a new game

1. Add an entry to the `GAMES` registry in [`js/leaderboard.js`](js/leaderboard.js) (name, tagline, theme class, score unit).
2. Add a theme block in [`css/style.css`](css/style.css).
3. Add a card for it on `index.html`.
