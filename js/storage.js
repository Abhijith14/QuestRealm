/* ═══════════════════════════════════════════════════════════════
   QuestRealm · storage layer  (Supabase-backed, cache-first)

   The public API is unchanged from the original localStorage version
   (loadPlayers / savePlayers / addPlayer / addScore / recordWin /
   removePlayer / loadRounds / loadActivity) so the UI never changed.

   How it works:
   • An in-memory cache holds each game's players / rounds / activity.
   • Reads are SYNCHRONOUS — they return straight from the cache, so
     the UI stays simple and renders instantly.
   • On load we hydrate the cache from Supabase (source of truth) and
     mirror it to localStorage, which doubles as an offline fallback
     for the very first paint and for when the network is down.
   • Writes update the cache + localStorage immediately (instant UI)
     and are pushed to Supabase in the background (write-through).
   • Pages re-render when hydration lands via QRStore.onSync(cb).
   ═══════════════════════════════════════════════════════════════ */

const QRStore = (() => {
  const keyFor = (gameId) => `questrealm:${gameId}:players`;
  const roundsKeyFor = (gameId) => `questrealm:${gameId}:rounds`;
  const activityKeyFor = (gameId) => `questrealm:${gameId}:activity`;

  // ── Supabase client ───────────────────────────────────────────
  const cfg = window.QR_CONFIG || {};
  const sb =
    window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null;
  if (!sb) {
    console.warn(
      '[QuestRealm] Supabase not configured — running on localStorage only.'
    );
  }

  // ── In-memory cache ───────────────────────────────────────────
  // cache[gameId] = { players: [...], rounds: [...], activity: [...] }
  const cache = {};
  const syncListeners = [];
  const hydratedGames = {}; // gameId -> Promise (dedupes concurrent hydrations)

  function cacheFor(gameId) {
    if (!cache[gameId]) {
      cache[gameId] = {
        players: readLocal(keyFor(gameId)) || [],
        rounds: readLocal(roundsKeyFor(gameId)) || [],
        activity: readLocal(activityKeyFor(gameId)) || [],
      };
    }
    return cache[gameId];
  }

  function readLocal(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      const val = JSON.parse(raw);
      return Array.isArray(val) ? val : null;
    } catch {
      return null;
    }
  }

  function writeLocal(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* storage full / disabled — cache still holds the data */
    }
  }

  function fireSync(gameId) {
    syncListeners.forEach((cb) => {
      try {
        cb(gameId);
      } catch (e) {
        console.error('[QuestRealm] onSync listener failed', e);
      }
    });
  }

  // ── Row mappers (DB snake_case ⇄ app camelCase) ───────────────
  const rowToPlayer = (r) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    score: Number(r.score) || 0,
    streak: r.streak || 0,
    wins: r.wins || 0,
    bestStreak: r.best_streak || 0,
    history: Array.isArray(r.history) ? r.history : [],
  });
  const playerToRow = (gameId, p) => ({
    game_id: gameId,
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    score: p.score,
    streak: p.streak || 0,
    wins: p.wins || 0,
    best_streak: p.bestStreak || 0,
    history: p.history || [],
  });

  const rowToRound = (r) => ({
    round: r.round,
    ts: Number(r.ts),
    scores: r.scores || {},
    winnerId: r.winner_id,
    tie: !!r.tie,
    tieNote: r.tie_note || '',
  });
  const roundToRow = (gameId, r) => ({
    game_id: gameId,
    round: r.round,
    ts: r.ts,
    scores: r.scores || {},
    winner_id: r.winnerId,
    tie: !!r.tie,
    tie_note: r.tieNote || '',
  });

  const rowToActivity = (r) => ({
    type: r.type,
    playerId: r.player_id,
    name: r.name,
    emoji: r.emoji,
    delta: r.delta == null ? undefined : Number(r.delta),
    newScore: r.new_score == null ? undefined : Number(r.new_score),
    ts: Number(r.ts),
  });
  const activityToRow = (gameId, e) => ({
    game_id: gameId,
    type: e.type,
    player_id: e.playerId,
    name: e.name,
    emoji: e.emoji,
    delta: e.delta == null ? null : e.delta,
    new_score: e.newScore == null ? null : e.newScore,
    ts: e.ts,
  });

  // ── Background write helpers (fire-and-forget, logged on error) ─
  function bgUpsertPlayers(gameId, players) {
    if (!sb || !players.length) return;
    sb.from('players')
      .upsert(players.map((p) => playerToRow(gameId, p)), {
        onConflict: 'game_id,id',
      })
      .then(({ error }) => error && logWriteError('players upsert', error));
  }
  function bgDeletePlayer(gameId, playerId) {
    if (!sb) return;
    sb.from('players')
      .delete()
      .eq('game_id', gameId)
      .eq('id', playerId)
      .then(({ error }) => error && logWriteError('player delete', error));
  }
  function bgUpsertRounds(gameId, rounds) {
    if (!sb || !rounds.length) return;
    sb.from('rounds')
      .upsert(rounds.map((r) => roundToRow(gameId, r)), {
        onConflict: 'game_id,round',
      })
      .then(({ error }) => error && logWriteError('rounds upsert', error));
  }
  function bgInsertActivity(gameId, entry) {
    if (!sb) return;
    sb.from('activity')
      .insert(activityToRow(gameId, entry))
      .then(({ error }) => error && logWriteError('activity insert', error));
  }
  function logWriteError(what, error) {
    console.error(
      `[QuestRealm] failed to sync ${what} to Supabase — kept locally, will retry on next write.`,
      error
    );
  }

  // ── Hydration (Supabase → cache), one-time migration of local ──
  function hydrate(gameId) {
    if (hydratedGames[gameId]) return hydratedGames[gameId];
    const c = cacheFor(gameId); // seeds cache from localStorage first
    if (!sb) return (hydratedGames[gameId] = Promise.resolve(c));

    hydratedGames[gameId] = (async () => {
      try {
        const [pRes, rRes, aRes] = await Promise.all([
          sb.from('players').select('*').eq('game_id', gameId),
          sb.from('rounds').select('*').eq('game_id', gameId).order('round'),
          sb.from('activity').select('*').eq('game_id', gameId).order('ts'),
        ]);
        if (pRes.error || rRes.error || aRes.error) {
          throw pRes.error || rRes.error || aRes.error;
        }

        // First-time migration: DB empty for this game but the browser
        // has local data → push local up, then treat DB as source.
        if (!pRes.data.length && c.players.length) {
          console.info(
            `[QuestRealm] migrating local "${gameId}" data to Supabase…`
          );
          bgUpsertPlayers(gameId, c.players);
          bgUpsertRounds(gameId, c.rounds);
          c.activity.forEach((e) => bgInsertActivity(gameId, e));
          return c;
        }

        c.players = pRes.data.map(rowToPlayer);
        c.rounds = rRes.data.map(rowToRound);
        c.activity = aRes.data.map(rowToActivity);
        writeLocal(keyFor(gameId), c.players);
        writeLocal(roundsKeyFor(gameId), c.rounds);
        writeLocal(activityKeyFor(gameId), c.activity);
      } catch (e) {
        console.error(
          `[QuestRealm] hydrate "${gameId}" failed — using local cache.`,
          e
        );
      }
      fireSync(gameId);
      return c;
    })();
    return hydratedGames[gameId];
  }

  // Auto-hydrate the games this page cares about: the ?game= on the
  // leaderboard, and every card's data-stats-for on the dashboard.
  function autoHydrate() {
    const ids = new Set();
    const g = new URLSearchParams(window.location.search).get('game');
    if (g) ids.add(g);
    document.querySelectorAll('[data-stats-for]').forEach((el) =>
      ids.add(el.dataset.statsFor)
    );
    if (window.location.pathname.endsWith('leaderboard.html') && !g) {
      ids.add('grand-austria-hotel'); // leaderboard's default game
    }
    ids.forEach(hydrate);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoHydrate);
  } else {
    autoHydrate();
  }

  // ═══════════════ Public API (unchanged signatures) ═════════════

  /** @returns {Array<{id,name,emoji,score,streak,wins,bestStreak,history}>} */
  function loadPlayers(gameId) {
    return cacheFor(gameId).players.map((p) => ({
      streak: 0,
      wins: 0,
      bestStreak: 0,
      ...p,
    }));
  }

  function savePlayers(gameId, players) {
    cacheFor(gameId).players = players;
    writeLocal(keyFor(gameId), players);
    bgUpsertPlayers(gameId, players);
  }

  /** @returns {Array<{round,ts,scores,winnerId,tie,tieNote}>} */
  function loadRounds(gameId) {
    return cacheFor(gameId).rounds;
  }

  function saveRounds(gameId, rounds) {
    cacheFor(gameId).rounds = rounds;
    writeLocal(roundsKeyFor(gameId), rounds);
    bgUpsertRounds(gameId, rounds);
  }

  /** @returns {Array<{type,playerId,name,emoji,ts,delta?,newScore?}>} */
  function loadActivity(gameId) {
    return cacheFor(gameId).activity;
  }

  function pushActivity(gameId, entry) {
    const c = cacheFor(gameId);
    c.activity = [...c.activity, entry];
    writeLocal(activityKeyFor(gameId), c.activity);
    bgInsertActivity(gameId, entry);
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
    bgDeletePlayer(gameId, playerId);
  }

  // Register a callback fired after a game hydrates from Supabase, so
  // pages can re-render with fresh data. Returns an unsubscribe fn.
  function onSync(cb) {
    syncListeners.push(cb);
    return () => {
      const i = syncListeners.indexOf(cb);
      if (i >= 0) syncListeners.splice(i, 1);
    };
  }

  return {
    loadPlayers,
    savePlayers,
    addPlayer,
    addScore,
    recordWin,
    removePlayer,
    loadRounds,
    saveRounds,
    loadActivity,
    hydrate,
    onSync,
  };
})();
