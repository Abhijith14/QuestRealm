/* ═══════════════════════════════════════════════════════════════
   QuestRealm · storage layer
   For now everything lives in localStorage, namespaced per game.
   The shape below is deliberately flat and JSON-friendly so it can
   be swapped for a real database/API later without touching the UI:
   just reimplement loadPlayers / savePlayers against the backend.
   ═══════════════════════════════════════════════════════════════ */

const QRStore = (() => {
  const keyFor = (gameId) => `questrealm:${gameId}:players`;

  /** @returns {Array<{id:string,name:string,emoji:string,score:number,streak:number,wins:number,bestStreak:number,history:Array<{delta:number,ts:number}>}>} */
  function loadPlayers(gameId) {
    try {
      const raw = localStorage.getItem(keyFor(gameId));
      const list = raw ? JSON.parse(raw) : [];
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
