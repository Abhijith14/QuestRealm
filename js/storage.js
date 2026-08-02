/* ═══════════════════════════════════════════════════════════════
   QuestRealm · storage layer
   For now everything lives in localStorage, namespaced per game.
   The shape below is deliberately flat and JSON-friendly so it can
   be swapped for a real database/API later without touching the UI:
   just reimplement loadPlayers / savePlayers against the backend.
   ═══════════════════════════════════════════════════════════════ */

const QRStore = (() => {
  const keyFor = (gameId) => `questrealm:${gameId}:players`;
  const roundsKeyFor = (gameId) => `questrealm:${gameId}:rounds`;
  const activityKeyFor = (gameId) => `questrealm:${gameId}:activity`;

  // Real game-night results, hardcoded until a database is wired up.
  // Each player's per-game scores (in play order) plus which game they
  // won that round. Games 3 and 6 were exact ties at the table — `tie`
  // + `tieNote` record how the group resolved them.
  const SEED_RESULTS = {
    'grand-austria-hotel': {
      games: [
        { scores: { prasanna: 166, ritu: 184, abhijith: 116 }, winner: 'ritu' },
        { scores: { prasanna: 137, ritu: 148, abhijith: 193 }, winner: 'abhijith' },
        {
          scores: { prasanna: 116, ritu: 148, abhijith: 148 },
          winner: 'abhijith',
          tie: true,
          tieNote: 'Ritu and Abhijith tied at 148 VP — Abhijith took the tiebreak.',
        },
        { scores: { prasanna: 151, ritu: 113, abhijith: 113 }, winner: 'prasanna' },
        { scores: { prasanna: 138, ritu: 133, abhijith: 158 }, winner: 'abhijith' },
        {
          scores: { prasanna: 159, ritu: 174, abhijith: 174 },
          winner: 'ritu',
          tie: true,
          tieNote: 'Ritu and Abhijith tied at 174 VP — Ritu took the tiebreak.',
        },
      ],
      players: {
        prasanna: { name: 'Prasanna', emoji: '♟️' },
        ritu: { name: 'Ritu', emoji: '🍰' },
        abhijith: { name: 'Abhijith', emoji: '👑' },
      },
    },
  };

  // Build the recorded rounds the first time a game's board is opened.
  // Rounds are the source of truth; the seeded player roster (scores,
  // streaks, wins) is derived from replaying them in order.
  function buildSeedRounds(gameId) {
    const seed = SEED_RESULTS[gameId];
    if (!seed) return null;

    const now = Date.now();
    const gameSpanMs = 3 * 60 * 60 * 1000; // spread games a few hours apart in the past
    return seed.games.map((game, i) => ({
      round: i + 1,
      ts: now - (seed.games.length - i) * gameSpanMs,
      scores: Object.fromEntries(
        Object.entries(game.scores).map(([key, delta]) => ['seed_' + key, delta])
      ),
      winnerId: 'seed_' + game.winner,
      tie: !!game.tie,
      tieNote: game.tieNote || '',
    }));
  }

  function buildSeedPlayers(gameId, rounds) {
    const seed = SEED_RESULTS[gameId];
    if (!seed || !rounds) return null;

    const players = {};
    Object.entries(seed.players).forEach(([key, info]) => {
      const id = 'seed_' + key;
      players[id] = {
        id,
        name: info.name,
        emoji: info.emoji,
        score: 0,
        streak: 0,
        wins: 0,
        bestStreak: 0,
        history: [],
      };
    });

    rounds.forEach((round) => {
      Object.entries(round.scores).forEach(([pid, delta]) => {
        const p = players[pid];
        if (!p) return;
        p.score += delta;
        p.history.push({ delta, ts: round.ts });
      });
      Object.keys(players).forEach((pid) => {
        const p = players[pid];
        if (pid === round.winnerId) {
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
        const rounds = loadRounds(gameId); // seeds rounds too, so timestamps line up
        const seeded = buildSeedPlayers(gameId, rounds);
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

  /** @returns {Array<{round:number,ts:number,scores:Object<string,number>,winnerId:string,tie:boolean,tieNote:string}>} */
  function loadRounds(gameId) {
    try {
      const raw = localStorage.getItem(roundsKeyFor(gameId));
      if (raw !== null) {
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
      }
      const rounds = buildSeedRounds(gameId);
      if (rounds) {
        saveRounds(gameId, rounds);
        return rounds;
      }
      return [];
    } catch {
      return [];
    }
  }

  function saveRounds(gameId, rounds) {
    localStorage.setItem(roundsKeyFor(gameId), JSON.stringify(rounds));
  }

  /** @returns {Array<{type:'score'|'win', playerId:string, name:string, emoji:string, ts:number, delta?:number, newScore?:number}>} */
  function loadActivity(gameId) {
    try {
      const raw = localStorage.getItem(activityKeyFor(gameId));
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function pushActivity(gameId, entry) {
    const log = loadActivity(gameId);
    log.push(entry);
    localStorage.setItem(activityKeyFor(gameId), JSON.stringify(log));
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
    const ts = Date.now();
    player.score += delta;
    player.history.push({ delta, ts });
    savePlayers(gameId, players);
    pushActivity(gameId, {
      type: 'score',
      playerId,
      name: player.name,
      emoji: player.emoji,
      delta,
      newScore: player.score,
      ts,
    });
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
    pushActivity(gameId, {
      type: 'win',
      playerId: winnerId,
      name: winner.name,
      emoji: winner.emoji,
      ts: Date.now(),
    });
    return winner;
  }

  function removePlayer(gameId, playerId) {
    const players = loadPlayers(gameId).filter((p) => p.id !== playerId);
    savePlayers(gameId, players);
  }

  return {
    loadPlayers,
    savePlayers,
    addPlayer,
    addScore,
    recordWin,
    removePlayer,
    loadRounds,
    loadActivity,
  };
})();
