// CSP-safe profile/stats page logic
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login'; return; }

  const form = document.getElementById('profile-form');
  const usernameInput = document.getElementById('username');
  const displayNameInput = document.getElementById('displayName');
  const avatarInput = document.getElementById('avatar');
  const bioInput = document.getElementById('bio');
  const saveBtn = document.getElementById('save-profile-btn');
  const statusBox = document.getElementById('profile-status');

  fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.ok ? r.json() : Promise.reject(r))
    .then(u => {
      if (usernameInput) usernameInput.value = u.username || '';
      if (displayNameInput) displayNameInput.value = u.displayName || '';
      if (avatarInput) avatarInput.value = u.avatar || '';
      if (bioInput) bioInput.value = u.bio || '';
    })
    .catch(() => { if (statusBox) statusBox.textContent = 'Erreur chargement profil'; });

  fetch('/api/users/me/stats', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.ok ? r.json() : Promise.reject(r))
    .then(s => {
      const el = id => document.getElementById(id);
      el('stats-totalGames').textContent = s.totalGames ?? 0;
      el('stats-wins').textContent = s.wins ?? 0;
      el('stats-losses').textContent = s.losses ?? 0;
      el('stats-winRate').textContent = s.winRate != null ? Math.round(s.winRate * 100) + '%' : '-';
      el('stats-currentStreak').textContent = s.currentStreak ?? 0;
      el('stats-bestStreak').textContent = s.bestStreak ?? 0;
      el('stats-level').textContent = s.level ?? 1;
      el('stats-xp').textContent = s.xp ?? 0;
      el('stats-nextLevelXp').textContent = (s.level ?? 1) * 100;
      el('stats-coins').textContent = s.coins ?? 0;
    })
    .catch(() => {});

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
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(() => { if (statusBox) statusBox.textContent = '✅ Profil mis à jour'; })
      .catch(() => { if (statusBox) statusBox.textContent = '❌ Échec mise à jour'; })
      .finally(() => { if (saveBtn) saveBtn.disabled = false; });
    });
  }
});
