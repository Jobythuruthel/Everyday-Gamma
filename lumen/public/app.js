// LUMEN player: presence (camera, sensor or keys) -> zones -> greeting -> follow-up -> visit log.
const $ = s => document.querySelector(s);
const LEVEL = { empty: 0.32, passing: 0.45, attention: 0.8, interaction: 1 };
const T = {
  en: { invite: 'Come closer', ask: ['Where is the keynote?', 'Where is registration?', 'Where is the prayer room?'], staff: 'Call a person', staffSay: 'A team member is on the way. Please wait here.', noCortex: 'Please ask our team at the desk. They will be happy to help.' },
  ar: { invite: 'اقترب', ask: ['أين الكلمة الرئيسية؟', 'أين التسجيل؟', 'أين المصلى؟'], staff: 'اطلب موظفاً', staffSay: 'أحد أعضاء الفريق في الطريق. يرجى الانتظار هنا.', noCortex: 'يرجى سؤال فريقنا في المكتب. يسعدهم مساعدتك.' }
};
const st = { cfg: null, zone: 'empty', visit: null, lang: 'en', code: '', camera: false, captionTimer: 0 };
const tracker = Presence.createTracker({ hold: 4, linger: 45 });

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'network');
  return data;
}

function caption(text, ms = 7000) {
  const c = $('#caption');
  c.textContent = text;
  c.dir = /[؀-ۿ]/.test(text) ? 'rtl' : 'ltr';
  c.classList.add('on');
  clearTimeout(st.captionTimer);
  if (ms) st.captionTimer = setTimeout(() => c.classList.remove('on'), ms);
}

function speak(text, lang) {
  caption(text);
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'ar' ? 'ar-SA' : 'en-GB';
  const voices = speechSynthesis.getVoices();
  const pick = voices.find(v => v.lang.startsWith(lang) && /female|zira|hoda|salma|zariyah|libby|sonia/i.test(v.name)) || voices.find(v => v.lang.startsWith(lang));
  if (pick) u.voice = pick;
  u.onboundary = () => Figure.pulse();
  u.onstart = () => Figure.pulse();
  speechSynthesis.speak(u);
  // Keep the mouth moving even where the voice engine sends no word events.
  const iv = setInterval(() => { if (speechSynthesis.speaking) Figure.pulse(); else clearInterval(iv); }, 180);
}

function greet(name) {
  if (!st.visit) return;
  if (st.visit.named || (st.visit.greeted && !name)) return;
  const text = Presence.greeting({ name, lang: st.lang, hour: new Date().getHours(), event: st.cfg.event });
  st.visit.greeted = true;
  if (name) st.visit.named = true;
  speak(text, st.lang);
  dock(true);
}

function dock(on) {
  const d = $('#dock');
  if (on) {
    const t = T[st.lang];
    const buttons = (st.cfg.cortex ? t.ask : []).map(q => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = q;
      b.onclick = () => ask(q); return b;
    });
    const staff = document.createElement('button'); staff.type = 'button'; staff.textContent = t.staff;
    staff.onclick = async () => {
      if (st.visit) st.visit.questions++;
      const r = await api('/api/handoff', { question: st.lastQuestion, lang: st.lang }).catch(() => ({ sent: false }));
      speak(r.sent ? t.staffSay : t.noCortex, st.lang);
    };
    d.replaceChildren(...buttons, staff);
    d.dir = st.lang === 'ar' ? 'rtl' : 'ltr';
  }
  d.classList.toggle('on', on);
}

async function ask(q) {
  if (st.visit) st.visit.questions++;
  st.lastQuestion = q;
  try {
    const r = await api('/api/ask', { text: q, lang: st.lang });
    speak(r.action === 'answer' ? r.answer : T[st.lang].noCortex, st.lang);
  } catch { speak(T[st.lang].noCortex, st.lang); }
}

function setZone(zone) {
  if (zone === st.zone) return;
  const prev = st.zone;
  st.zone = zone;
  Figure.level(LEVEL[zone]);
  $('#status').textContent = `${zone}${st.camera ? ' · camera' : ''}`;
  if (prev === 'empty' && zone !== 'empty') st.visit = { start: performance.now(), maxZone: zone, greeted: false, named: false, questions: 0 };
  if (st.visit && Presence.ZONES.indexOf(zone) > Presence.ZONES.indexOf(st.visit.maxZone)) st.visit.maxZone = zone;
  if (zone === 'attention' && !st.visit?.greeted) caption(T[st.lang].invite, 0);
  if (zone === 'interaction') greet(null);
  if (zone === 'passing' || zone === 'empty') { dock(false); if (!speechSynthesis.speaking) $('#caption').classList.remove('on'); }
  if (zone === 'empty' && st.visit) {
    const v = st.visit;
    st.visit = null;
    api('/api/visit', { maxZone: v.maxZone, greeted: v.greeted, named: v.named, questions: v.questions, dwellMs: performance.now() - v.start, lang: st.lang }).catch(() => {});
    st.lang = 'en';
    Figure.look(0);
  }
}

// Camera presence: 10 frames per second on a 160 x 90 greyscale image.
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: false });
    const v = $('#cam'); v.srcObject = stream; await v.play();
    st.camera = true;
    const c = $('#diff'), ctx = c.getContext('2d', { willReadFrequently: true });
    let prev = null;
    setInterval(() => {
      ctx.drawImage(v, 0, 0, 160, 90);
      const d = ctx.getImageData(0, 0, 160, 90).data;
      const cur = new Uint8Array(160 * 90);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) cur[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      if (prev && !st.sensorUntil) {
        const box = Presence.motionBox(prev, cur, 160, 90);
        setZone(tracker(Presence.zoneFor(box)));
        if (box.energy > 0.004) Figure.look(-((box.cx ?? 0.5) - 0.5) * 1.2);
      }
      prev = cur;
    }, 100);
  } catch { $('#status').textContent = 'no camera · sensor or keys'; }
}

// External sensors post to /api/presence; the server relays here. A sensor takes over from the camera for 10 s.
function listenSensor() {
  const es = new EventSource('/api/presence/stream');
  es.onmessage = e => {
    const m = JSON.parse(e.data);
    clearTimeout(st.sensorTimer);
    st.sensorUntil = true;
    st.sensorTimer = setTimeout(() => { st.sensorUntil = false; }, 10000);
    setZone(m.zone);
  };
}

// Keys: 0-3 force a zone (testing, or a USB trigger); anything else is a badge scan ending in Enter.
document.addEventListener('keydown', async e => {
  if (/^[0-3]$/.test(e.key) && !st.code) return setZone(Presence.ZONES[Number(e.key)]);
  if (e.key === 'Enter') {
    const code = st.code; st.code = '';
    if (!code) return;
    try {
      const g = await api(`/api/guest?code=${encodeURIComponent(code)}`);
      st.lang = g.lang;
      if (st.zone === 'empty' || st.zone === 'passing') setZone('interaction');
      if (st.visit) { st.visit.greeted = false; greet(g.name); }
    } catch { /* unknown badge: keep the generic greeting */ }
    return;
  }
  if (e.key.length === 1) st.code += e.key;
});
document.addEventListener('pointerdown', () => document.body.classList.add('touch'));
document.addEventListener('contextmenu', e => e.preventDefault());
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();

(async () => {
  st.cfg = await api('/api/config');
  Figure.start($('#holo'));
  Figure.level(LEVEL.empty);
  listenSensor();
  if (!new URLSearchParams(location.search).has('nocamera')) startCamera();
  $('#status').textContent = 'empty';
})();
