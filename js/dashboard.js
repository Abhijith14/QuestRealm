/* QuestRealm · dashboard (the Salon) */

(() => {
  // Show a live teaser of each game's standings on its card.
  function renderTeasers() {
    document.querySelectorAll('[data-stats-for]').forEach((el) => {
      const gameId = el.dataset.statsFor;
      const status = QRStore.status(gameId);
      if (status !== 'ready') {
        el.textContent =
          status === 'loading' ? 'Fetching the ledger…' : 'Couldn’t reach the ledger — try refreshing';
        return;
      }
      const players = QRStore.loadPlayers(gameId);
      if (!players.length) {
        el.textContent = 'No guests registered yet';
        return;
      }
      const leader = [...players].sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name)
      )[0];
      const hottest = [...players].sort((a, b) => (b.streak || 0) - (a.streak || 0))[0];
      const streakNote =
        hottest && hottest.streak >= 2
          ? ` · <strong>🔥 ${hottest.streak}</strong> streak (${hottest.emoji} ${escapeHtml(hottest.name)})`
          : '';
      el.innerHTML =
        `${players.length} guest${players.length === 1 ? '' : 's'} · ` +
        `reigning champion <strong>${leader.emoji} ${escapeHtml(leader.name)}</strong> ` +
        `with <strong>${leader.score}</strong> pts${streakNote}`;
    });
  }

  renderTeasers();
  // Re-render teasers as each game's data arrives from Supabase.
  QRStore.onSync(renderTeasers);

  // Staggered entrance reveal.
  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.animationDelay = `${i * 120}ms`;
  });

  // Curtain transition when entering a game.
  document.querySelectorAll('a.game-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.add('leaving');
      setTimeout(() => { window.location.href = card.href; }, 450);
    });
  });

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
})();
