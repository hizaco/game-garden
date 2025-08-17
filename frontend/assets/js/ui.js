// Generic UI helpers without inline JS, CSP-safe

// Modal open/close utilities
export function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.hidden = false;
}
export function closeModal(el) {
  const m = el?.closest?.('.modal') || el;
  if (m) m.hidden = true;
}

// Wire close buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('[data-modal-close]');
  if (btn) {
    e.preventDefault();
    closeModal(btn);
  }
});

// Close when clicking on modal backdrop
document.addEventListener('click', (e) => {
  const target = e.target;
  if (target.classList?.contains('modal')) {
    closeModal(target);
  }
});

// Simple navigation
document.addEventListener('DOMContentLoaded', () => {
  const back = document.getElementById('back-home-btn');
  if (back) {
    back.addEventListener('click', () => {
      window.location.href = '/';
    });
  }
});

// Utility to fill generic modal
export function showGenericModal(title, bodyHTML) {
  const modal = document.getElementById('generic-modal');
  const titleEl = document.getElementById('generic-modal-title');
  const bodyEl = document.getElementById('generic-modal-body');
  if (!modal || !titleEl || !bodyEl) return;
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHTML || '';
  modal.hidden = false;
}
