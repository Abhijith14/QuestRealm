/* ═══════════════════════════════════════════════════════════════
   QuestRealm · leaderboard page
   Reads ?game=<id> from the URL, themes the page, and renders the
   podium + guest ledger with FLIP re-sort animations.
   ═══════════════════════════════════════════════════════════════ */

(() => {
  // ── Game registry ─────────────────────────────────────────────
  // Grand Austria Hotel is the first (hard-coded) game. New games:
  // add an entry here + a theme block in css/style.css.
  const GAMES = {
    'grand-austria-hotel': {
      name: 'Grand Austria Hotel',
      kicker: '· Kaiserlich-Königliche Bestenliste ·',
      tagline: 'Vienna, at the dawn of the modern age. Serve the finest coffee, charm the Emperor, and etch your name into the ledger.',
      theme: 'theme-gah',
      scoreUnit: 'VP',
      footer: 'Scores are kept in the shared ledger · Grand Austria Hotel themed board',
    },
  };

  const params = new URLSearchParams(window.location.search);
  const gameId = params.get('game') || 'grand-austria-hotel';
  const game = GAMES[gameId];

  if (!game) {
    document.getElementById('board-title').textContent = 'Unknown game';
    document.getElementById('board-tagline').textContent =
      'This table has not been set yet. Return to the salon and pick another.';
    document.querySelector('.actions').hidden = true;
    return;
  }

  // ── Theme & chrome ────────────────────────────────────────────
  document.body.classList.add(game.theme);
  document.title = `${game.name} · Leaderboard`;
  document.getElementById('board-title').textContent = game.name;
  document.getElementById('board-kicker').textContent = game.kicker;
  document.getElementById('board-tagline').textContent = game.tagline;
  document.getElementById('footer-note').textContent = game.footer;

  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.animationDelay = `${i * 110}ms`;
  });

  // Curtain transition when returning to the salon.
  const backLink = document.querySelector('.back-link');
  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    document.body.classList.add('leaving');
    setTimeout(() => { window.location.href = backLink.href; }, 450);
  });

  // ── Elements ──────────────────────────────────────────────────
  const podiumEl = document.getElementById('podium');
  const podiumWrap = document.getElementById('podium-wrap');
  const ledgerEl = document.getElementById('ledger-list');
  const emptyEl = document.getElementById('empty-state');

  const historyToggle = document.getElementById('history-toggle');
  const historyPanel = document.getElementById('history-panel');
  const roundsList = document.getElementById('rounds-list');
  const activityList = document.getElementById('activity-list');
  const activityEmpty = document.getElementById('activity-empty');

  const dlgGuest = document.getElementById('dlg-guest');
  const dlgGame = document.getElementById('dlg-game');
  const formGuest = document.getElementById('form-guest');
  const formGame = document.getElementById('form-game');
  const gamePlayersEl = document.getElementById('game-players');
  const tiebreakBlock = document.getElementById('tiebreak-block');
  const tiebreakWinner = document.getElementById('tiebreak-winner');
  const tiebreakNote = document.getElementById('tiebreak-note');
  const gameError = document.getElementById('game-error');
  const guestNameInput = document.getElementById('guest-name');
  const guestError = document.getElementById('guest-error');
  const emojiGrid = document.getElementById('emoji-grid');

  const EMOJIS = [
    '🎩', '👑', '🦁', '🦊', '🐻', '🐱', '🐶', '🦉',
    '🦄', '🐸', '🐰', '🦆', '🐢', '🐝', '🦋', '🐙',
    '☕', '🍰', '🥐', '🍷', '🎻', '🎨', '♟️', '🎲',
  ];
  let selectedEmoji = EMOJIS[0];

  // ── Rendering ─────────────────────────────────────────────────
  const sorted = () =>
    [...QRStore.loadPlayers(gameId)].sort(
      (a, b) => b.score - a.score || a.name.localeCompare(b.name)
    );

  // Per-game stats. A guest's history holds one entry per game they played,
  // so its length is their games-played count.
  const gamesPlayed = (p) => (p.history ? p.history.length : 0);
  const perGame = (p) => (gamesPlayed(p) ? p.score / gamesPlayed(p) : null);
  const winRate = (p) => (gamesPlayed(p) ? p.wins / gamesPlayed(p) : null);
  const fmtRatio = (n) => (n == null ? '—' : n.toFixed(1));
  const fmtPct = (n) => (n == null ? '—' : Math.round(n * 100) + '%');

  function render({ highlightId = null, animate = false, sparkleChars = ['✦'] } = {}) {
    const players = sorted();
    const hasPlayers = players.length > 0;

    emptyEl.hidden = hasPlayers;
    podiumWrap.style.display = hasPlayers ? '' : 'none';

    renderPodium(players);

    if (animate) {
      flip(ledgerEl, () => renderLedger(players, highlightId, sparkleChars));
    } else {
      renderLedger(players, highlightId, sparkleChars);
    }

    renderRounds(players);
    renderActivity();
  }

  // ── Game History: the Score Book (recorded rounds) ────────────
  function renderRounds(players) {
    const rounds = QRStore.loadRounds(gameId);
    const byId = Object.fromEntries(players.map((p) => [p.id, p]));

    if (!rounds.length) {
      roundsList.innerHTML = '<p class="empty-sub">No games recorded yet — Crown the Victor to start the book.</p>';
      return;
    }

    roundsList.innerHTML = rounds
      .map((r) => {
        const chips = Object.entries(r.scores)
          .map(([pid, delta]) => {
            const p = byId[pid] || { name: 'Former guest', emoji: '❔' };
            const isWinner = pid === r.winnerId;
            return `
              <span class="round-chip${isWinner ? ' winner' : ''}">
                <span class="round-chip-emoji">${p.emoji}</span>
                <span class="round-chip-name">${escapeHtml(p.name)}</span>
                <span class="round-chip-score">${delta}</span>
                ${isWinner ? '<span class="round-chip-crown" aria-hidden="true">👑</span>' : ''}
              </span>`;
          })
          .join('');

        const tieBadge = r.tie
          ? `<span class="tie-badge" title="${escapeHtml(r.tieNote || 'Resolved by tiebreak')}">🤝 Tiebreak</span>`
          : '';

        return `
          <li class="round-row${r.tie ? ' round-tie' : ''}">
            <div class="round-head">
              <span class="round-label">Game ${r.round}</span>
              ${tieBadge}
            </div>
            <div class="round-chips">${chips}</div>
            ${r.tie && r.tieNote ? `<p class="round-note">🤝 ${escapeHtml(r.tieNote)}</p>` : ''}
          </li>`;
      })
      .join('');
  }

  // ── Game History: Recent Activity (live log going forward) ────
  function renderActivity() {
    const log = QRStore.loadActivity(gameId);
    const hasLog = log.length > 0;

    activityList.hidden = !hasLog;
    activityEmpty.hidden = hasLog;
    if (!hasLog) return;

    activityList.innerHTML = [...log]
      .reverse()
      .map((e) => {
        const when = new Date(e.ts).toLocaleString(undefined, {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        });
        if (e.type === 'game') {
          return `
            <li class="activity-row activity-win">
              <span class="activity-emoji" aria-hidden="true">🏆</span>
              <span class="activity-text"><strong>${escapeHtml(e.name)}</strong> won a game</span>
              <span class="activity-time">${when}</span>
            </li>`;
        }
        if (e.type === 'win') {
          return `
            <li class="activity-row activity-win">
              <span class="activity-emoji" aria-hidden="true">👑</span>
              <span class="activity-text"><strong>${escapeHtml(e.name)}</strong> was crowned victor</span>
              <span class="activity-time">${when}</span>
            </li>`;
        }
        const sign = e.delta >= 0 ? '+' : '';
        return `
          <li class="activity-row">
            <span class="activity-emoji" aria-hidden="true">${e.emoji}</span>
            <span class="activity-text"><strong>${escapeHtml(e.name)}</strong> ${sign}${e.delta} pts <span class="activity-total">(now ${e.newScore})</span></span>
            <span class="activity-time">${when}</span>
          </li>`;
      })
      .join('');
  }

  historyToggle.addEventListener('click', () => {
    const isOpen = historyPanel.classList.toggle('open');
    historyToggle.classList.toggle('active', isOpen);
    historyToggle.setAttribute('aria-expanded', String(isOpen));
  });

  function renderPodium(players) {
    const top = players.slice(0, 3);
    // Visual order: 2nd, 1st, 3rd
    const order = [top[1], top[0], top[2]];
    const places = ['second', 'first', 'third'];
    const numerals = ['II', 'I', 'III'];

    podiumEl.innerHTML = order
      .map((p, i) => {
        if (!p) return `<div class="podium-slot empty ${places[i]}"></div>`;
        return `
          <div class="podium-slot ${places[i]}" data-podium="${p.id}">
            ${places[i] === 'first' ? '<div class="crown" aria-hidden="true">👑</div>' : ''}
            <div class="podium-guest">
              <span class="podium-emoji">${p.emoji}</span>
              <span class="podium-name">${escapeHtml(p.name)}</span>
              <span class="podium-score">${p.score} <small>${game.scoreUnit}</small></span>
              <span class="podium-sub">${fmtRatio(perGame(p))} ${game.scoreUnit}/game · ${p.wins} win${p.wins === 1 ? '' : 's'} · ${fmtPct(winRate(p))}</span>
              ${streakBadge(p)}
            </div>
            <div class="podium-pillar">
              <svg class="laurel left" viewBox="0 0 16 34" aria-hidden="true"><use href="#laurel"></use></svg>
              <span class="podium-numeral">${numerals[i]}</span>
              <svg class="laurel right" viewBox="0 0 16 34" aria-hidden="true"><use href="#laurel"></use></svg>
            </div>
          </div>`;
      })
      .join('');
  }

  function renderLedger(players, highlightId, sparkleChars = ['✦']) {
    const maxScore = Math.max(1, ...players.map((p) => p.score));

    ledgerEl.innerHTML = players
      .map((p, idx) => {
        const pct = Math.max(0, (p.score / maxScore) * 100);
        const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
        return `
          <li class="ledger-row ${rankClass}" data-pid="${p.id}">
            <span class="row-rank">${idx + 1}</span>
            <span class="row-emoji">${p.emoji}</span>
            <span class="row-name">
              <span class="row-name-main">${escapeHtml(p.name)}${streakBadge(p)}</span>
              <span class="row-sub">🏆 ${p.wins} win${p.wins === 1 ? '' : 's'} · ${fmtPct(winRate(p))} · ${gamesPlayed(p)} game${gamesPlayed(p) === 1 ? '' : 's'}</span>
            </span>
            <span class="row-bar-track" aria-hidden="true">
              <span class="row-bar" style="width:${pct}%"></span>
            </span>
            <span class="row-score">
              <span class="row-score-main" data-score>${p.score}</span>
              <span class="row-score-sub">${fmtRatio(perGame(p))} ${game.scoreUnit}/game</span>
            </span>
          </li>`;
      })
      .join('');

    if (highlightId) {
      const row = ledgerEl.querySelector(`[data-pid="${highlightId}"]`);
      if (row) {
        row.classList.add('row-glow');
        sparkle(row, sparkleChars);
        setTimeout(() => row.classList.remove('row-glow'), 1600);
      }
    }
  }

  // Gold pill shown next to a guest who holds an active win streak.
  function streakBadge(p) {
    if (!p.streak) return '';
    const title = `${p.streak} consecutive win${p.streak === 1 ? '' : 's'} · ${p.wins} total · best streak ${p.bestStreak}`;
    return `<span class="streak-pill${p.streak >= 3 ? ' blazing' : ''}" title="${title}">🔥 ${p.streak}</span>`;
  }

  // FLIP: rows glide to their new rank instead of snapping.
  function flip(container, rerender) {
    const before = new Map();
    container.querySelectorAll('[data-pid]').forEach((el) => {
      before.set(el.dataset.pid, el.getBoundingClientRect().top);
    });

    rerender();

    container.querySelectorAll('[data-pid]').forEach((el) => {
      const prevTop = before.get(el.dataset.pid);
      if (prevTop === undefined) {
        el.classList.add('row-enter');
        return;
      }
      const dy = prevTop - el.getBoundingClientRect().top;
      if (dy) {
        el.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
          { duration: 550, easing: 'cubic-bezier(.22,1,.36,1)' }
        );
      }
    });
  }

  function sparkle(row, chars = ['✦']) {
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      s.textContent = chars[i % chars.length];
      s.style.left = `${15 + Math.random() * 70}%`;
      s.style.animationDelay = `${Math.random() * 250}ms`;
      s.style.fontSize = `${0.6 + Math.random() * 0.7}rem`;
      row.appendChild(s);
      setTimeout(() => s.remove(), 1400);
    }
  }

  // ── Emoji picker ──────────────────────────────────────────────
  emojiGrid.innerHTML = EMOJIS.map(
    (e, i) =>
      `<button type="button" class="emoji-opt${i === 0 ? ' selected' : ''}" role="option"
        aria-selected="${i === 0}" data-emoji="${e}">${e}</button>`
  ).join('');

  emojiGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-emoji]');
    if (!btn) return;
    selectedEmoji = btn.dataset.emoji;
    emojiGrid.querySelectorAll('.emoji-opt').forEach((b) => {
      const sel = b === btn;
      b.classList.toggle('selected', sel);
      b.setAttribute('aria-selected', sel);
    });
  });

  // ── Dialogs ───────────────────────────────────────────────────
  function openDialog(dlg) {
    dlg.showModal();
    dlg.classList.add('open');
  }
  function closeDialog(dlg) {
    dlg.classList.remove('open');
    dlg.close();
  }

  document.querySelectorAll('.modal').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) closeDialog(dlg); // backdrop click
    });
    dlg.querySelectorAll('[data-close]').forEach((btn) =>
      btn.addEventListener('click', () => closeDialog(dlg))
    );
  });

  document.getElementById('btn-add-guest').addEventListener('click', () => {
    formGuest.reset();
    guestError.hidden = true;
    openDialog(dlgGuest);
    guestNameInput.focus();
  });
  document.getElementById('btn-empty-add').addEventListener('click', () => {
    formGuest.reset();
    guestError.hidden = true;
    openDialog(dlgGuest);
    guestNameInput.focus();
  });

  // ── Record a Game ─────────────────────────────────────────────
  // One dialog captures every player's score for a single game. The high
  // score is crowned automatically; a tie at the top asks who took the
  // tiebreak. Players left unchecked simply sat that game out.
  function buildGameDialog() {
    const players = sorted();
    gamePlayersEl.innerHTML = players
      .map(
        (p) => `
        <label class="game-player" data-row="${p.id}">
          <input type="checkbox" class="gp-check" data-id="${p.id}" checked>
          <span class="gp-emoji">${p.emoji}</span>
          <span class="gp-name">${escapeHtml(p.name)}</span>
          <input type="number" class="gp-score" data-id="${p.id}" step="1" inputmode="numeric" placeholder="—" aria-label="${escapeHtml(p.name)} score">
        </label>`
      )
      .join('');
    tiebreakBlock.hidden = true;
    gameError.hidden = true;
  }

  document.getElementById('btn-record-game').addEventListener('click', () => {
    if (!sorted().length) {
      // No guests yet — route to adding one first.
      openDialog(dlgGuest);
      guestNameInput.focus();
      return;
    }
    formGame.reset();
    buildGameDialog();
    openDialog(dlgGame);
  });

  // A checked-off guest keeps their score input; unchecking greys it out.
  gamePlayersEl.addEventListener('change', (e) => {
    const check = e.target.closest('.gp-check');
    if (!check) return;
    const row = check.closest('.game-player');
    const scoreInput = row.querySelector('.gp-score');
    row.classList.toggle('sat-out', !check.checked);
    scoreInput.disabled = !check.checked;
    if (!check.checked) scoreInput.value = '';
  });

  // Collect the participants (checked + a real number entered).
  function collectParticipants() {
    return [...gamePlayersEl.querySelectorAll('.game-player')].reduce((acc, row) => {
      const id = row.querySelector('.gp-check').dataset.id;
      const checked = row.querySelector('.gp-check').checked;
      const raw = row.querySelector('.gp-score').value.trim();
      if (checked && raw !== '') {
        const score = parseInt(raw, 10);
        if (Number.isFinite(score)) acc.push({ playerId: id, score });
      }
      return acc;
    }, []);
  }

  formGame.addEventListener('submit', (e) => {
    e.preventDefault();
    const participants = collectParticipants();

    if (participants.length < 2) {
      showError(gameError, 'Enter a score for at least two guests who played.');
      return;
    }
    // Every checked guest must have a score.
    const missing = [...gamePlayersEl.querySelectorAll('.game-player')].some((row) => {
      const checked = row.querySelector('.gp-check').checked;
      return checked && row.querySelector('.gp-score').value.trim() === '';
    });
    if (missing) {
      showError(gameError, 'Give every checked guest a score, or uncheck the ones who sat out.');
      return;
    }

    const maxScore = Math.max(...participants.map((p) => p.score));
    const tied = participants.filter((p) => p.score === maxScore);

    let winnerId;
    let tieNote = '';
    if (tied.length > 1) {
      // Reveal the tiebreak chooser on first submit; finalise on the next.
      if (tiebreakBlock.hidden) {
        const byId = Object.fromEntries(sorted().map((p) => [p.id, p]));
        tiebreakWinner.innerHTML = tied
          .map((t) => {
            const p = byId[t.playerId];
            return `<option value="${t.playerId}">${p.emoji} ${escapeHtml(p.name)} — ${t.score} ${game.scoreUnit}</option>`;
          })
          .join('');
        tiebreakBlock.hidden = false;
        gameError.hidden = true;
        tiebreakWinner.focus();
        return;
      }
      winnerId = tiebreakWinner.value;
      tieNote = tiebreakNote.value.trim();
    } else {
      winnerId = tied[0].playerId;
    }

    const result = QRStore.recordGame(gameId, participants, winnerId, tieNote);
    if (!result) {
      showError(gameError, 'Something went wrong recording that game. Please try again.');
      return;
    }
    closeDialog(dlgGame);
    render({ highlightId: result.winner.id, animate: true, sparkleChars: ['👑', '✦', '✦'] });
  });

  // ── Add guest ─────────────────────────────────────────────────
  formGuest.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = guestNameInput.value.trim();
    if (!name) {
      showError(guestError, 'Every guest needs a name.');
      return;
    }
    const exists = QRStore.loadPlayers(gameId).some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      showError(guestError, 'A guest by that name is already in the ledger.');
      return;
    }
    const player = QRStore.addPlayer(gameId, name, selectedEmoji);
    closeDialog(dlgGuest);
    render({ highlightId: player.id, animate: true });
  });

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ── First paint ───────────────────────────────────────────────
  render();
  // Re-render once this game's data hydrates from Supabase (cache-first:
  // the first paint above shows cached/local data instantly).
  QRStore.onSync((syncedGame) => {
    if (syncedGame === gameId) render();
  });
})();
