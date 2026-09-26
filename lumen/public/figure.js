// Particle guide drawn by code on pure black, for hologram fans and transparent OLED.
// States: ambient (dim float), attention (brighter, turns to the visitor), speaking (pulses with the voice).
(function () {
  const pts = [];
  function add(n, fn) { for (let i = 0; i < n; i++) pts.push(fn(Math.random(), Math.random())); }
  // Head (ellipsoid surface), neck, shoulders and chest (curved sheet). Units: figure height ~2.
  add(900, (u, v) => { const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1); return [0.34 * Math.sin(ph) * Math.cos(th), -0.62 + 0.44 * Math.cos(ph), 0.36 * Math.sin(ph) * Math.sin(th), 'head']; });
  add(160, (u, v) => { const th = u * Math.PI * 2; return [0.14 * Math.cos(th), -0.14 + v * 0.22, 0.14 * Math.sin(th), 'neck']; });
  add(1300, (u, v) => { const x = (u - 0.5) * 1.5, y = 0.1 + v * 0.9; const w = 0.75 - 0.25 * Math.pow(1 - v, 3); return [x * w / 0.75, y + 0.18 * x * x, 0.22 * Math.cos(x * 2), 'body']; });

  const S = { level: 0.25, target: 0.25, yaw: 0, yawTarget: 0, pulse: 0, t: 0 };
  let ctx, W, H, dpr;

  function resize(c) { dpr = Math.min(2, window.devicePixelRatio || 1); W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr; }

  function frame() {
    S.t += 0.016;
    S.level += (S.target - S.level) * 0.05;
    S.yaw += (S.yawTarget - S.yaw) * 0.04;
    S.pulse *= 0.9;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const scale = Math.min(W, H) * 0.34, cx = W / 2, cy = H * 0.42;
    const breathe = 1 + Math.sin(S.t * 1.3) * 0.012;
    const cosY = Math.cos(S.yaw), sinY = Math.sin(S.yaw);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0, z0, part] = pts[i];
      const drift = Math.sin(S.t * 0.8 + i) * 0.006;
      let x = x0 * breathe, y = y0 * breathe + drift, z = z0;
      if (part === 'head' && S.pulse > 0.01 && y0 > -0.45 && y0 < -0.3 && z0 > 0.2) y += (Math.random() - 0.5) * 0.03 * S.pulse; // mouth area moves when speaking
      const xr = x * cosY + z * sinY, zr = -x * sinY + z * cosY;
      const persp = 1 / (1.9 - zr * 0.5);
      const px = cx + xr * scale * persp * 1.9, py = cy + y * scale * persp * 1.9;
      const depth = 0.45 + (zr + 0.4) * 0.8;
      const a = Math.max(0, Math.min(1, (S.level * 1.25 + S.pulse * 0.4) * depth * (part === 'body' ? 0.8 : 1)));
      ctx.fillStyle = `rgba(${120 + 80 * S.pulse | 0}, 224, ${96 + 100 * S.pulse | 0}, ${a})`;
      const r = (part === 'head' ? 2.8 : 2.3) * dpr * persp * 1.6;
      ctx.fillRect(px - r / 2, py - r / 2, r, r);
    }
    ctx.globalCompositeOperation = 'source-over';
    // Floor ring
    ctx.strokeStyle = `rgba(143,224,96,${0.08 + S.level * 0.25})`;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.ellipse(cx, cy + scale * 1.55, scale * 0.9, scale * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
    requestAnimationFrame(frame);
  }

  window.Figure = {
    start(canvas) { ctx = canvas.getContext('2d'); resize(canvas); addEventListener('resize', () => resize(canvas)); requestAnimationFrame(frame); },
    level(v) { S.target = v; },
    look(x) { S.yawTarget = Math.max(-0.6, Math.min(0.6, x)); }, // -1 left .. 1 right of the camera view
    pulse() { S.pulse = 1; },
    state: S
  };
})();
