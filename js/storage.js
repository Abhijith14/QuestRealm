/* ═══════════════════════════════════════════════════════════════
   QuestRealm · storage layer
   For now everything lives in localStorage, namespaced per game.
   The shape below is deliberately flat and JSON-friendly so it can
   be swapped for a real database/API later without touching the UI:
   just reimplement loadPlayers / savePlayers against the backend.
   ═══════════════════════════════════════════════════════════════ */

const QRStore = (() => {
  const keyFor = (gameId) => `questrealm:${gameId}:players`;

  // Real game-night results, hardcoded until a database is wired up.
  // Each player's per-game scores (in play order) plus which game they
  // won that round — ties at the table were resolved by the group.
  const SEED_RESULTS = {
    'grand-austria-hotel': {
      games: [
        { scores: { prasanna: 166, ritu: 184, abhijith: 116 }, winner: 'ritu' },
        { scores: { prasanna: 137, ritu: 148, abhijith: 193 }, winner: 'abhijith' },
        { scores: { prasanna: 116, ritu: 148, abhijith: 148 }, winner: 'abhijith' },
        { scores: { prasanna: 151, ritu: 113, abhijith: 113 }, winner: 'prasanna' },
        { scores: { prasanna: 138, ritu: 133, abhijith: 158 }, winner: 'abhijith' },
        { scores: { prasanna: 159, ritu: 174, abhijith: 174 }, winner: 'ritu' },
      ],
      players: {
        prasanna: { name: 'Prasanna', emoji: '♟️' },
        ritu: { name: 'Ritu', emoji: '🍰' },
        abhijith: { name: 'Abhijith', emoji: '👑' },
      },
    },
  };

  // Build a fresh seeded roster the first time a game's board is opened.
  function buildSeed(gameId) {
    const seed = SEED_RESULTS[gameId];
    if (!seed) return null;

    const now = Date.now();
    const gameSpanMs = 3 * 60 * 60 * 1000; // spread games an hour+ apart in the past
    const players = {};
    Object.entries(seed.players).forEach(([key, info]) => {
      players[key] = {
        id: 'seed_' + key,
        name: info.name,
        emoji: info.emoji,
        score: 0,
        streak: 0,
        wins: 0,
        bestStreak: 0,
        history: [],
      };
    });

    seed.games.forEach((game, i) => {
      const ts = now - (seed.games.length - i) * gameSpanMs;
      Object.entries(game.scores).forEach(([key, delta]) => {
        const p = players[key];
        p.score += delta;
        p.history.push({ delta, ts });
      });
      Object.keys(players).forEach((key) => {
        const p = players[key];
        if (key === game.winner) {
          p.streak += 1;
          p.wins += 1;
          p.bestStreak = Math.max(p.bestStreak, p.streak);
        } else {
          p.streak = 0;
        }
      });
    });

    return Object.values(players);
  }

  /** @returns {Array<{id:string,name:string,emoji:string,score:number,streak:number,wins:number,bestStreak:number,history:Array<{delta:number,ts:number}>}>} */
  function loadPlayers(gameId) {
    try {
      const raw = localStorage.getItem(keyFor(gameId));
      if (raw === null) {
        const seeded = buildSeed(gameId);
        if (seeded) {
          savePlayers(gameId, seeded);
          return seeded;
        }
        return [];
      }
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      // Migrate records saved before streaks existed.
      return list.map((p) => ({ streak: 0, wins: 0, bestStreak: 0, ...p }));
    } catch {
      return [];
    }
  }

  function savePlayers(gameId, players) {
    localStorage.setItem(keyFor(gameId), JSON.stringify(players));
  }

  function addPlayer(gameId, name, emoji) {
    const players = loadPlayers(gameId);
    const player = {
      id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: name.trim(),
      emoji: emoji || '🎩',
      score: 0,
      streak: 0,
      wins: 0,
      bestStreak: 0,
      history: [],
    };
    players.push(player);
    savePlayers(gameId, players);
    return player;
  }

  function addScore(gameId, playerId, delta) {
    const players = loadPlayers(gameId);
    const player = players.find((p) => p.id === playerId);
    if (!player) return null;
    player.score += delta;
    player.history.push({ delta, ts: Date.now() });
    savePlayers(gameId, players);
    return player;
  }

  // A game was won: the victor's streak climbs, everyone else's resets.
  function recordWin(gameId, winnerId) {
    const players = loadPlayers(gameId);
    const winner = players.find((p) => p.id === winnerId);
    if (!winner) return null;
    players.forEach((p) => {
      if (p.id === winnerId) {
        p.streak += 1;
        p.wins += 1;
        p.bestStreak = Math.max(p.bestStreak, p.streak);
      } else {
        p.streak = 0;
      }
    });
    savePlayers(gameId, players);
    return winner;
  }

  function removePlayer(gameId, playerId) {
    const players = loadPlayers(gameId).filter((p) => p.id !== playerId);
    savePlayers(gameId, players);
  }

  return { loadPlayers, savePlayers, addPlayer, addScore, recordWin, removePlayer };
})();
