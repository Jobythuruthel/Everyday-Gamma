// MUSE offline style engine: every look and frame is drawn by code, so any client colour, name or language changes in styles.json.
const OUT_W = 1080, OUT_H = 1350;

// Draws a source (video, image or canvas) into a canvas, cover-cropped to the target size, optionally mirrored.
function coverDraw(ctx, src, w, h, mirror) {
  const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
  const scale = Math.max(w / sw, h / sh), dw = sw * scale, dh = sh * scale;
  ctx.save();
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.restore();
}

function capture(src, w, h, mirror = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  coverDraw(c.getContext('2d'), src, w, h, mirror);
  return c;
}

function stylize(src, look, { tone = true, mirror = false } = {}) {
  const c = capture(src, OUT_W, OUT_H, mirror);
  const ctx = c.getContext('2d');
  if (tone) {
    const img = ctx.getImageData(0, 0, OUT_W, OUT_H), d = img.data;
    const [s, m, l] = [look.shadow, look.mid, look.light];
    const grain = (look.grain ?? 0) * 255;
    for (let i = 0; i < d.length; i += 4) {
      let y = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const curved = y < 0.5 ? 2 * y * y : 1 - 2 * (1 - y) * (1 - y);
      y = y * 0.4 + curved * 0.6;
      let a, b, t;
      if (y < 0.5) { a = s; b = m; t = y * 2; } else { a = m; b = l; t = (y - 0.5) * 2; }
      const n = grain ? (Math.random() - 0.5) * grain : 0;
      d[i] = a[0] + (b[0] - a[0]) * t + n;
      d[i + 1] = a[1] + (b[1] - a[1]) * t + n;
      d[i + 2] = a[2] + (b[2] - a[2]) * t + n;
    }
    ctx.putImageData(img, 0, 0);
  }
  if (look.scanlines) {
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    for (let y = 0; y < OUT_H; y += 4) ctx.fillRect(0, y, OUT_W, 1);
  }
  if (look.stars) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 220; i++) {
      const r = Math.random() * 1.8 + 0.3;
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.6 + 0.2})`;
      ctx.beginPath(); ctx.arc(Math.random() * OUT_W, Math.random() * OUT_H * 0.6, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  if (look.vignette) {
    const g = ctx.createRadialGradient(OUT_W / 2, OUT_H * 0.45, OUT_H * 0.25, OUT_W / 2, OUT_H * 0.45, OUT_H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${look.vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, OUT_W, OUT_H);
  }
  return c;
}

function frame(c, style, cfg, lang) {
  const ctx = c.getContext('2d');
  const accent = style.local.accent;
  const rtl = lang === 'ar';
  const pad = 44;
  // Legibility band behind the text
  const band = ctx.createLinearGradient(0, OUT_H - 380, 0, OUT_H);
  band.addColorStop(0, 'rgba(4,7,5,0)'); band.addColorStop(1, 'rgba(4,7,5,.92)');
  ctx.fillStyle = band; ctx.fillRect(0, OUT_H - 380, OUT_W, 380);
  ctx.strokeStyle = accent; ctx.lineWidth = 3;
  ctx.strokeRect(pad / 2, pad / 2, OUT_W - pad, OUT_H - pad);
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  const x = rtl ? OUT_W - pad - 20 : pad + 20;
  ctx.fillStyle = accent;
  ctx.font = '600 26px "Courier New", monospace';
  ctx.fillText(cfg.event[lang].toUpperCase(), x, pad + 44);
  ctx.fillStyle = '#F2F5F0';
  ctx.font = '700 84px Arial, sans-serif';
  ctx.fillText(style.title[lang], x, OUT_H - 170);
  ctx.font = '34px Arial, sans-serif';
  ctx.fillStyle = 'rgba(242,245,240,.8)';
  ctx.fillText(style.tagline[lang], x, OUT_H - 118);
  ctx.font = '600 26px "Courier New", monospace';
  ctx.fillStyle = accent;
  ctx.direction = 'ltr'; // hashtags are Latin; keep the # in front in Arabic frames too
  ctx.fillText(cfg.hashtag, x, OUT_H - 70);
  ctx.textAlign = rtl ? 'left' : 'right';
  ctx.fillStyle = 'rgba(242,245,240,.45)';
  ctx.font = '18px "Courier New", monospace';
  ctx.fillText('FAIM MUSE', rtl ? pad + 20 : OUT_W - pad - 20, OUT_H - 70);
  return c;
}

window.Muse = { capture, stylize, frame, OUT_W, OUT_H };
