type ToastTone = 'success' | 'error' | 'info';

export function showToast(message: string, tone: ToastTone = 'success') {
  const existing = document.querySelector('.app-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `app-toast toast-${tone}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('toast-hide');
    window.setTimeout(() => toast.remove(), 220);
  }, 3200);
}
