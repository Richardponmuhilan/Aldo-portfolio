// Pauses this viewer's animation loops while its frame is off-screen or inside a collapsed project.
(function () {
  const COL = ['#FF8A3D', '#4AB3FF', '#FF7A85', '#4CC870', '#B69CFF'];
  let acc = '#FF8A3D';
  try { const p = window.frameElement && window.frameElement.closest('[data-accent],[data-proj-panel]'); if (p) acc = p.dataset.accent || COL[+p.dataset.projPanel] || acc; } catch (e) {}
  window.ACCENT = acc;
  document.documentElement.style.setProperty('--accent', acc);
  const st = document.createElement('style');
  st.textContent = ['#ff8a3d', '#ff6a2b', '#f08a3c'].map(c => '[fill="' + c + '" i]{fill:var(--accent)!important}[stroke="' + c + '" i]{stroke:var(--accent)!important}').join('');
  (document.head || document.documentElement).appendChild(st);
  const raf = window.requestAnimationFrame.bind(window);
  let visible = true, queue = [];
  window.requestAnimationFrame = function (cb) { if (visible) return raf(cb); queue.push(cb); return 0; };
  const wake = () => { const q = queue; queue = []; q.forEach(cb => raf(cb)); };
  const io = new IntersectionObserver((es) => {
    const v = es[es.length - 1].intersectionRatio > 0;
    if (v && !visible) { visible = true; wake(); } else if (!v) visible = false;
  }, { rootMargin: '120px', threshold: [0, 0.01] });
  io.observe(document.documentElement);
})();
