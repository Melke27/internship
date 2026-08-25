const menu = document.querySelector('.mobile-menu');
const sidebar = document.querySelector('.sidebar');
menu?.addEventListener('click', () => sidebar.classList.toggle('open'));
document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(link => link.classList.remove('active'));
  item.classList.add('active');
  if (window.innerWidth < 760) sidebar.classList.remove('open');
}));
