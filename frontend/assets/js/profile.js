// Gestion du profil: édition + affichage des stats — CSP-safe (no inline)
import { showGenericModal } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login';
    return;
  }

  // Elements
  const form = document.getElementById('profile-form');
  const usernameInput = document.getElementById('username');
  const displayNameInput = document.getElementById('displayName');
  const avatarInput = document.getElementById('avatar');
  const bioInput = document.getElementById('bio');
  const saveBtn = document.getElementById('save-profile-btn');
  const statusBox = document.getElementById('profile-status');

  // Stats elements
  const el = (id) => document.getElementById(id);
  const statsEls = {
    totalGames: el('stats-totalGames'),
    wins: el('stats-wins'),
    losses: el('stats-losses'),
    winRate: el('stats-winRate'),
    currentStreak: el('stats-currentStreak'),
    bestStreak: el('stats-bestStreak'),
    level: el('stats-level'),
    xp: el('stats-xp'),
    nextLevelXp: el('stats-nextLevelXp'),
    coins: el('stats-coins'),
  };

  // Charger profil
  fetch('/api/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(r)))
    .then((user) => {
      if (usernameInput) usernameInput.value = user.username ?? '';
      if (displayNameInput) displayNameInput.value = user.displayName ?? '';
      if (avatarInput) avatarInput.value = user.avatar ?? user.avatarUrl ?? '';
      if (bioInput) bioInput.value = user.bio ?? '';
    })
    .catch(async (err) => {
      console.warn('Erreur chargement profil', err);
      if (statusBox) statusBox.textContent = 'Impossible de charger votre profil.';
      if (err && err.json) {
        try {
          console.warn(await err.json());
        } catch {}
      }
    });

  // Charger stats
  fetch('/api/users/me/stats', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(r)))
    .then((stats) => {
      const wr = stats.winRate != null ? Math.round(stats.winRate * 100) + '%' : '-';
      if (statsEls.totalGames) statsEls.totalGames.textContent = stats.totalGames ?? 0;
      if (statsEls.wins) statsEls.wins.textContent = stats.wins ?? 0;
      if (statsEls.losses) statsEls.losses.textContent = stats.losses ?? 0;
      if (statsEls.winRate) statsEls.winRate.textContent = wr;
      if (statsEls.currentStreak) statsEls.currentStreak.textContent = stats.currentStreak ?? 0;
      if (statsEls.bestStreak) statsEls.bestStreak.textContent = stats.bestStreak ?? 0;
      if (statsEls.level) statsEls.level.textContent = stats.level ?? 1;
      if (statsEls.xp) statsEls.xp.textContent = stats.xp ?? 0;
      if (statsEls.nextLevelXp && stats.nextLevelXp != null) statsEls.nextLevelXp.textContent = stats.nextLevelXp;
      if (statsEls.coins) statsEls.coins.textContent = stats.coins ?? 0;
    })
    .catch(async (err) => {
      console.warn('Erreur chargement stats', err);
      if (err && err.json) {
        try {
          console.warn(await err.json());
        } catch {}
      }
    });

  // Sauvegarder modifications (sans inline onsubmit)
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (saveBtn) saveBtn.disabled = true;
      if (statusBox) statusBox.textContent = 'Enregistrement...';

      const payload = {
        username: usernameInput?.value?.trim(),
        displayName: displayNameInput?.value?.trim(),
        avatar: avatarInput?.value?.trim(),
        bio: bioInput?.value?.trim(),
      };

      fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
        .then(async (r) => {
          if (!r.ok) {
            const data = await safeJson(r);
            throw new Error(data?.message || 'Échec de la mise à jour du profil');
          }
          return r.json();
        })
        .then(() => {
          if (statusBox) statusBox.textContent = '✅ Profil mis à jour avec succès';
          showGenericModal('Profil', 'Vos informations ont été enregistrées.');
        })
        .catch((err) => {
          console.error('Update profile error:', err);
          if (statusBox) statusBox.textContent = `❌ ${err.message || 'Erreur lors de la mise à jour.'}`;
        })
        .finally(() => {
          if (saveBtn) saveBtn.disabled = false;
        });
    });
  }
});

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
