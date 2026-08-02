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
      footer: 'Scores are kept in this browser’s ledger · Grand Austria Hotel themed board',
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

  // ── Elements ──────────────────────────────────────────────────
  const podiumEl = document.getElementById('podium');
  const podiumWrap = document.getElementById('podium-wrap');
  const ledgerEl = document.getElementById('ledger-list');
  const emptyEl = document.getElementById('empty-state');

  const dlgGuest = document.getElementById('dlg-guest');
  const dlgScore = document.getElementById('dlg-score');
  const formGuest = document.getElementById('form-guest');
  const formScore = document.getElementById('form-score');
  const guestNameInput = document.getElementById('guest-name');
  const guestError = document.getElementById('guest-error');
  const scoreError = document.getElementById('score-error');
  const scoreSelect = document.getElementById('score-player');
  const scoreValue = document.getElementById('score-value');
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

  function render({ highlightId = null, animate = false } = {}) {
    const players = sorted();
    const hasPlayers = players.length > 0;

    emptyEl.hidden = hasPlayers;
    podiumWrap.style.display = hasPlayers ? '' : 'none';

    renderPodium(players);

    if (animate) {
      flip(ledgerEl, () => renderLedger(players, highlightId));
    } else {
      renderLedger(players, highlightId);
    }
  }

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

  function renderLedger(players, highlightId) {
    const maxScore = Math.max(1, ...players.map((p) => p.score));

    ledgerEl.innerHTML = players
      .map((p, idx) => {
        const pct = Math.max(0, (p.score / maxScore) * 100);
        const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
        return `
          <li class="ledger-row ${rankClass}" data-pid="${p.id}">
            <span class="row-rank">${idx + 1}</span>
            <span class="row-emoji">${p.emoji}</span>
            <span class="row-name">${escapeHtml(p.name)}</span>
            <span class="row-bar-track" aria-hidden="true">
              <span class="row-bar" style="width:${pct}%"></span>
            </span>
            <span class="row-score" data-score>${p.score}</span>
            <button class="row-remove" data-remove="${p.id}" title="Remove ${escapeHtml(p.name)}" aria-label="Remove ${escapeHtml(p.name)}">✕</button>
          </li>`;
      })
      .join('');

    if (highlightId) {
      const row = ledgerEl.querySelector(`[data-pid="${highlightId}"]`);
      if (row) {
        row.classList.add('row-glow');
        sparkle(row);
        setTimeout(() => row.classList.remove('row-glow'), 1600);
      }
    }
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

  function countUp(el, from, to, duration = 900) {
    const start = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  function sparkle(row) {
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      s.textContent = '✦';
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

  document.getElementById('btn-add-score').addEventListener('click', () => {
    const players = sorted();
    if (!players.length) {
      // No one to score yet — route to adding a guest instead.
      openDialog(dlgGuest);
      guestNameInput.focus();
      return;
    }
    scoreSelect.innerHTML = players
      .map((p) => `<option value="${p.id}">${p.emoji} ${escapeHtml(p.name)} — ${p.score} ${game.scoreUnit}</option>`)
      .join('');
    formScore.reset();
    scoreError.hidden = true;
    openDialog(dlgScore);
    scoreValue.focus();
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

  // ── Add score ─────────────────────────────────────────────────
  formScore.addEventListener('submit', (e) => {
    e.preventDefault();
    const playerId = scoreSelect.value;
    const delta = parseInt(scoreValue.value, 10);
    if (!playerId || Number.isNaN(delta)) {
      showError(scoreError, 'Pick a guest and enter a whole number of points.');
      return;
    }
    const before = QRStore.loadPlayers(gameId).find((p) => p.id === playerId);
    const oldScore = before ? before.score : 0;
    const updated = QRStore.addScore(gameId, playerId, delta);
    if (!updated) return;

    closeDialog(dlgScore);
    render({ highlightId: playerId, animate: true });

    const scoreEl = ledgerEl.querySelector(`[data-pid="${playerId}"] [data-score]`);
    if (scoreEl) countUp(scoreEl, oldScore, updated.score);
  });

  // ── Remove guest ──────────────────────────────────────────────
  ledgerEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const player = QRStore.loadPlayers(gameId).find((p) => p.id === btn.dataset.remove);
    if (!player) return;
    if (confirm(`Strike ${player.name} from the ledger? Their score will be lost.`)) {
      QRStore.removePlayer(gameId, player.id);
      render({ animate: true });
    }
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
})();
