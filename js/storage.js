/* ═══════════════════════════════════════════════════════════════
   QuestRealm · storage layer  (Supabase-backed)

   The public API is unchanged from the original localStorage version
   (loadPlayers / savePlayers / addPlayer / addScore / recordWin /
   removePlayer / loadRounds / loadActivity) so the UI never changed.

   How it works:
   • An in-memory cache holds each game's players / rounds / activity.
   • Reads are SYNCHRONOUS — they return straight from the cache, so
     the UI stays simple and renders instantly.
   • Every page load fetches fresh data from Supabase (the single
     source of truth). Nothing is persisted in the browser, so every
     device always sees the same, current ledger.
   • Until that fetch lands, status(gameId) is 'loading' and writes
     are refused, so a half-loaded page can never overwrite real data.
   • Writes update the cache immediately (instant UI) and are pushed
     to Supabase in the background (write-through).
   • Pages re-render when hydration lands via QRStore.onSync(cb).
   ═══════════════════════════════════════════════════════════════ */

const QRStore = (() => {
  // ── Supabase client ───────────────────────────────────────────
  const cfg = window.QR_CONFIG || {};
  const sb =
    window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null;
  if (!sb) {
    console.warn(
      '[QuestRealm] Supabase not configured — the ledger cannot load.'
    );
  }

  // ── In-memory cache ───────────────────────────────────────────
  // cache[gameId] = { players: [...], rounds: [...], activity: [...] }
  const cache = {};
  const syncListeners = [];
  const hydratedGames = {}; // gameId -> Promise (dedupes concurrent hydrations)
  const statuses = {}; // gameId -> 'loading' | 'ready' | 'error'

  function cacheFor(gameId) {
    if (!cache[gameId]) {
      cache[gameId] = { players: [], rounds: [], activity: [] };
    }
    return cache[gameId];
  }

  // Legacy: older versions of the site kept everything in localStorage.
  // It is never used to display data — only read once, to upload a
  // browser's old ledger if the database has nothing for that game.
  function readLegacy(gameId, kind) {
    try {
      const val = JSON.parse(localStorage.getItem(`questrealm:${gameId}:${kind}`));
      return Array.isArray(val) ? val : [];
    } catch {
      return [];
    }
  }

  function status(gameId) {
    return statuses[gameId] || 'loading';
  }

  // Writes are only allowed once the game's real data has loaded —
  // otherwise e.g. recordGame would number a new round 1 and overwrite
  // the real round 1 in the database.
  function canWrite(gameId) {
    if (status(gameId) === 'ready') return true;
    console.warn(`[QuestRealm] "${gameId}" not loaded yet — write ignored.`);
    return false;
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
      `[QuestRealm] failed to save ${what} to Supabase — it will be lost on refresh.`,
      error
    );
  }

  // ── Hydration (Supabase → cache), on every page load ─────────
  function hydrate(gameId, { force = false } = {}) {
    if (hydratedGames[gameId] && !force) return hydratedGames[gameId];
    const c = cacheFor(gameId);
    if (!sb) {
      statuses[gameId] = 'error';
      fireSync(gameId);
      return (hydratedGames[gameId] = Promise.resolve(c));
    }

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
        c.players = pRes.data.map(rowToPlayer);
        c.rounds = rRes.data.map(rowToRound);
        c.activity = aRes.data.map(rowToActivity);

        // One-time migration: DB empty for this game but this browser
        // still holds an old local ledger → upload it.
        const legacyPlayers = readLegacy(gameId, 'players');
        if (!c.players.length && legacyPlayers.length) {
          console.info(`[QuestRealm] uploading this browser's old "${gameId}" ledger to Supabase…`);
          c.players = legacyPlayers;
          c.rounds = readLegacy(gameId, 'rounds');
          c.activity = readLegacy(gameId, 'activity');
          bgUpsertPlayers(gameId, c.players);
          bgUpsertRounds(gameId, c.rounds);
          c.activity.forEach((e) => bgInsertActivity(gameId, e));
        }
        statuses[gameId] = 'ready';
      } catch (e) {
        console.error(`[QuestRealm] loading "${gameId}" from Supabase failed.`, e);
        // A failed refetch keeps already-loaded data usable.
        if (status(gameId) !== 'ready') statuses[gameId] = 'error';
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
    ids.forEach((id) => hydrate(id, { force: true }));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoHydrate);
  } else {
    autoHydrate();
  }
  // Mobile browsers restore pages from the back/forward cache without
  // re-running scripts — refetch so a "back" never shows stale scores.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) autoHydrate();
  });

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
    if (!canWrite(gameId)) return;
    cacheFor(gameId).players = players;
    bgUpsertPlayers(gameId, players);
  }

  /** @returns {Array<{round,ts,scores,winnerId,tie,tieNote}>} */
  function loadRounds(gameId) {
    return cacheFor(gameId).rounds;
  }

  function saveRounds(gameId, rounds) {
    if (!canWrite(gameId)) return;
    cacheFor(gameId).rounds = rounds;
    bgUpsertRounds(gameId, rounds);
  }

  /** @returns {Array<{type,playerId,name,emoji,ts,delta?,newScore?}>} */
  function loadActivity(gameId) {
    return cacheFor(gameId).activity;
  }

  function pushActivity(gameId, entry) {
    const c = cacheFor(gameId);
    c.activity = [...c.activity, entry];
    bgInsertActivity(gameId, entry);
  }

  function addPlayer(gameId, name, emoji) {
    if (!canWrite(gameId)) return null;
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
    if (!canWrite(gameId)) return null;
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
    if (!canWrite(gameId)) return null;
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

  // Record one whole game at once: `entries` is [{playerId, score}] for the
  // guests who actually played (anyone omitted simply sat that game out).
  // The winner is decided by the high score; on a tie at the top the caller
  // passes the agreed `winnerId` (+ an optional `tieNote`). Applies each
  // participant's score, bumps the winner's streak/wins, resets the other
  // participants' streaks (non-participants are left untouched), writes the
  // round to the Score Book, and logs one activity entry.
  function recordGame(gameId, entries, winnerId, tieNote = '') {
    if (!canWrite(gameId)) return null;
    const players = loadPlayers(gameId);
    const byId = Object.fromEntries(players.map((p) => [p.id, p]));
    const participants = entries.filter(
      (e) => byId[e.playerId] && Number.isFinite(e.score)
    );
    if (!participants.length) return null;
    const winner = byId[winnerId];
    if (!winner || !participants.some((e) => e.playerId === winnerId)) return null;

    const ts = Date.now();
    const maxScore = Math.max(...participants.map((e) => e.score));
    const tie = participants.filter((e) => e.score === maxScore).length > 1;

    // Apply each participant's score for this game.
    const scores = {};
    participants.forEach(({ playerId, score }) => {
      const p = byId[playerId];
      p.score += score;
      p.history.push({ delta: score, ts });
      scores[playerId] = score;
    });

    // Streaks: winner up, other players IN this game reset. Sitters untouched.
    const played = new Set(participants.map((e) => e.playerId));
    players.forEach((p) => {
      if (!played.has(p.id)) return;
      if (p.id === winnerId) {
        p.streak += 1;
        p.wins += 1;
        p.bestStreak = Math.max(p.bestStreak, p.streak);
      } else {
        p.streak = 0;
      }
    });
    savePlayers(gameId, players);

    // Add the round to the Score Book.
    const rounds = loadRounds(gameId);
    const nextRound = rounds.reduce((m, r) => Math.max(m, r.round), 0) + 1;
    const round = {
      round: nextRound,
      ts,
      scores,
      winnerId,
      tie,
      tieNote: tie ? tieNote : '',
    };
    saveRounds(gameId, [...rounds, round]);

    pushActivity(gameId, {
      type: 'game',
      playerId: winnerId,
      name: winner.name,
      emoji: winner.emoji,
      ts,
    });

    return { winner, round, tie };
  }

  function removePlayer(gameId, playerId) {
    if (!canWrite(gameId)) return;
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
    recordGame,
    removePlayer,
    loadRounds,
    saveRounds,
    loadActivity,
    hydrate,
    status,
    onSync,
  };
})();
