// Presence from camera motion: frame differencing on a small greyscale frame. No model download, works offline.
// The height of the moving area is a distance proxy: a person close to the camera fills more of the frame.
(function (root) {
  const ZONES = ['empty', 'passing', 'attention', 'interaction'];

  function motionBox(prev, cur, w, h, threshold = 28) {
    let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (Math.abs(cur[i] - prev[i]) > threshold) {
          count++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    return { energy: count / (w * h), height: maxY < 0 ? 0 : (maxY - minY + 1) / h, width: maxX < 0 ? 0 : (maxX - minX + 1) / w, cx: maxX < 0 ? 0.5 : (minX + maxX) / 2 / w };
  }

  function zoneFor({ energy, height }, cfg = {}) {
    const { minEnergy = 0.004, attention = 0.35, interaction = 0.6 } = cfg;
    if (energy < minEnergy) return 'empty';
    if (height >= interaction) return 'interaction';
    if (height >= attention) return 'attention';
    return 'passing';
  }

  // Smooths noisy readings: a zone must be seen for `hold` consecutive frames before it becomes current,
  // and a person standing still keeps their zone for `linger` frames (standing still makes no motion).
  function createTracker({ hold = 4, linger = 45 } = {}) {
    let current = 'empty', candidate = 'empty', streak = 0, quiet = 0;
    return function update(reading) {
      if (reading === 'empty' && current !== 'empty') {
        quiet++;
        if (quiet < linger) return current;
      } else quiet = 0;
      if (reading === candidate) streak++;
      else { candidate = reading; streak = 1; }
      if (streak >= hold && candidate !== current) current = candidate;
      return current;
    };
  }

  function greeting({ name, lang, hour, event }) {
    const part = hour < 12 ? 0 : hour < 17 ? 1 : 2;
    if (lang === 'ar') {
      const salute = ['صباح الخير', 'مساء الخير', 'مساء الخير'][part];
      return name ? `${salute} يا ${name}. أهلاً بك في ${event.ar}.` : `${salute}. أهلاً بك في ${event.ar}. كيف يمكنني مساعدتك؟`;
    }
    const salute = ['Good morning', 'Good afternoon', 'Good evening'][part];
    return name ? `${salute}, ${name}. Welcome to ${event.en}.` : `${salute}, and welcome to ${event.en}. How can I help?`;
  }

  const api = { ZONES, motionBox, zoneFor, createTracker, greeting };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Presence = api;
})(typeof self !== 'undefined' ? self : globalThis);
