(() => {
  window.__siteReady = true;

  /* ---------- Entrances ---------- */
  const reveal = (el) => el.classList.add('is-in');
  const revealables = document.querySelectorAll('[data-reveal]');

  // Whatever is on the first screen enters on a timer, never waiting on an observer.
  const firstScreen = [];
  const later = [];
  revealables.forEach((el) => (el.getBoundingClientRect().top < window.innerHeight ? firstScreen : later).push(el));
  firstScreen.forEach((el, i) => el.style.setProperty('--i', Math.min(i, 6)));
  setTimeout(() => firstScreen.forEach(reveal), 40);

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      let n = 0;
      entries
        .filter((e) => e.isIntersecting)
        .forEach((e) => {
          e.target.style.setProperty('--i', Math.min(n++, 6));
          reveal(e.target);
          io.unobserve(e.target);
        });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
    later.forEach((el) => io.observe(el));
  } else {
    later.forEach(reveal);
  }

  document.querySelectorAll('.mosaic-grid li').forEach((li, i) => li.style.setProperty('--i', i));
  document.querySelectorAll('.timeline-track li').forEach((li, i) => li.style.setProperty('--n', i));
  const mosaic = document.querySelector('.mosaic');
  if (mosaic) setTimeout(() => reveal(mosaic), 60);

})();
