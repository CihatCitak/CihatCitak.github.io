(() => {
  window.__siteReady = true;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* ---------- Netcode demo ---------- */
  const laneA = document.getElementById('lane-a');
  const laneB = document.getElementById('lane-b');
  if (!laneA || !laneB) return;

  const ping = document.getElementById('ping');
  const pingOut = document.getElementById('ping-out');
  const waitA = document.getElementById('wait-a');
  const toggle = document.getElementById('demo-toggle');
  const demo = laneA.closest('.demo');

  const css = getComputedStyle(document.documentElement);
  const LIME = css.getPropertyValue('--lime').trim() || '#d4f53c';
  const SOFT = 'rgba(236, 238, 231, 0.62)';
  const FAINT = 'rgba(236, 238, 231, 0.14)';

  const W = 1;
  const H = 0.625;            // arena is 16:10
  const SPEED = 0.55;         // arena widths per second
  const RADIUS = 0.034;
  const EDGE = 0.06;

  const lanes = [laneA, laneB].map((canvas) => ({ canvas, ctx: canvas.getContext('2d'), w: 0, h: 0 }));

  let rtt = Number(ping.value);
  let auto = !reduceMotion;
  let visible = false;
  let raf = 0;
  let last = performance.now();
  let lastInput = -Infinity;
  let nextAuto = 0;

  const ideal = { x: 0.22, y: H / 2 };
  let target = { x: 0.22, y: H / 2 };
  let marker = null;          // { x, y, t } where the last input landed
  const history = [];         // { t, x, y } of the predicted position

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function setTarget(x, y, now, fromUser) {
    target = { x: clamp(x, EDGE, W - EDGE), y: clamp(y, EDGE, H - EDGE) };
    marker = { ...target, t: now };
    if (fromUser) lastInput = now;
  }

  function sampleAt(t) {
    if (!history.length) return { x: ideal.x, y: ideal.y };
    if (t >= history[history.length - 1].t) return history[history.length - 1];
    for (let i = history.length - 1; i > 0; i--) {
      const a = history[i - 1];
      const b = history[i];
      if (a.t <= t) {
        const k = (t - a.t) / (b.t - a.t || 1);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    return history[0];
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    lanes.forEach((lane) => {
      const r = lane.canvas.getBoundingClientRect();
      lane.w = r.width;
      lane.h = r.height;
      lane.canvas.width = Math.round(r.width * dpr);
      lane.canvas.height = Math.round(r.height * dpr);
      lane.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  function drawLane(lane, player, confirmed, now) {
    const { ctx, w, h } = lane;
    if (!w) return;
    const sx = w / W;
    const sy = h / H;
    const r = Math.max(9, RADIUS * w);
    ctx.clearRect(0, 0, w, h);

    if (marker) {
      const age = (now - marker.t) / 900;
      if (age < 1) {
        const mx = marker.x * sx;
        const my = marker.y * sy;
        const s = r * 0.7;
        ctx.strokeStyle = SOFT;
        ctx.globalAlpha = 1 - age;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx - s, my); ctx.lineTo(mx + s, my);
        ctx.moveTo(mx, my - s); ctx.lineTo(mx, my + s);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // soft disc so the player reads at a glance
    ctx.fillStyle = FAINT;
    circle(ctx, player.x * sx, player.y * sy, r * 1.9);
    ctx.fill();

    if (confirmed) {
      ctx.strokeStyle = SOFT;
      ctx.lineWidth = 2;
      circle(ctx, confirmed.x * sx, confirmed.y * sy, r + 3);
      ctx.stroke();
    }

    ctx.fillStyle = LIME;
    circle(ctx, player.x * sx, player.y * sy, r);
    ctx.fill();
  }

  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (auto && now - lastInput > 3500 && now >= nextAuto) {
      setTarget(EDGE + Math.random() * (W - 2 * EDGE), EDGE + Math.random() * (H - 2 * EDGE), now, false);
      nextAuto = now + 1500 + Math.random() * 1000;
    }

    const dx = target.x - ideal.x;
    const dy = target.y - ideal.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-4) {
      const s = Math.min(d, SPEED * dt);
      ideal.x += (dx / d) * s;
      ideal.y += (dy / d) * s;
    }

    history.push({ t: now, x: ideal.x, y: ideal.y });
    while (history.length > 2 && history[1].t < now - 1200) history.shift();

    const confirmed = sampleAt(now - rtt);
    drawLane(lanes[0], confirmed, null, now);
    drawLane(lanes[1], ideal, confirmed, now);
  }

  function loop(now) {
    step(now);
    raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
  }

  function start() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function onPointer(e) {
    const r = e.currentTarget.getBoundingClientRect();
    setTarget(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, performance.now(), true);
    start();
  }

  function onKey(e) {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setTarget(target.x + m[0] * 0.12, target.y + m[1] * 0.12, performance.now(), true);
    start();
  }

  lanes.forEach(({ canvas }) => {
    canvas.addEventListener('pointerdown', onPointer);
    canvas.addEventListener('keydown', onKey);
  });

  ping.addEventListener('input', () => {
    rtt = Number(ping.value);
    pingOut.value = `${rtt} ms`;
    pingOut.textContent = `${rtt} ms`;
    waitA.textContent = String(rtt);
  });

  const syncToggle = () => { toggle.textContent = auto ? 'Pause demo' : 'Play demo'; };
  toggle.addEventListener('click', () => {
    auto = !auto;
    if (auto) nextAuto = 0;
    syncToggle();
    start();
  });
  syncToggle();

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { resize(); step(performance.now()); }).observe(laneA);
  } else {
    window.addEventListener('resize', resize);
  }
  resize();
  step(performance.now());

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    }).observe(demo);
  } else {
    visible = true;
    start();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) start(); });
})();
