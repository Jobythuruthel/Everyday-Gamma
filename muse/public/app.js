// MUSE kiosk: attract -> style -> face consent -> camera -> generate -> result -> lead -> QR -> reset
const T = {
  en: {
    attractTitle: 'Become the future.', attractSub: 'Step up. Pose. See yourself as a hero of the event.', start: 'Start',
    step1: 'Step 1 of 4', pickWorld: 'Choose your world', back: 'Back', step2: 'Step 2 of 4', consentTitle: 'Before we take your photo',
    consentLocal: 'Your photo is styled on this kiosk only. The camera image is not stored or sent anywhere. The finished portrait is kept for 30 days so you can download it, and staff may show approved portraits on the booth screen.',
    consentApi: 'Your photo is sent to our image service to create the portrait, then deleted there. The finished portrait is kept for 30 days so you can download it, and staff may show approved portraits on the booth screen.',
    consentBox: 'I agree to have my face photographed and processed to create this portrait.', continue: 'Continue', consentNeeded: 'Please tick the box to continue.',
    step3: 'Step 3 of 4 · Fit your face in the oval', shoot: 'Take my photo', camError: 'Camera not available. Please ask a staff member.',
    working: 'Creating', workLocal: 'Styling your portrait…', workApi: 'Our AI is painting your portrait. About 20 seconds…',
    getPhoto: 'Get my photo', retake: 'Retake', step4: 'Step 4 of 4', leadTitle: 'Where should we send it?', email: 'Email', mobile: 'Mobile',
    marketing: 'Optional: send me news about this event.', unlock: 'Unlock my photo', ready: 'Your portrait is ready',
    scanTitle: 'Scan with your phone camera', scanSub: 'Connect to the booth Wi-Fi if the link does not open.', done: 'Done',
    err: { email_invalid: 'That email does not look right.', contact_required: 'Please add an email or mobile number.', network: 'Something went wrong. Please ask a staff member.' }
  },
  ar: {
    attractTitle: 'كن المستقبل.', attractSub: 'تقدّم. اتخذ وضعية. شاهد نفسك بطلاً في الفعالية.', start: 'ابدأ',
    step1: 'الخطوة ١ من ٤', pickWorld: 'اختر عالمك', back: 'رجوع', step2: 'الخطوة ٢ من ٤', consentTitle: 'قبل التقاط صورتك',
    consentLocal: 'تتم معالجة صورتك على هذا الجهاز فقط. لا يتم حفظ صورة الكاميرا أو إرسالها. تُحفظ الصورة النهائية ٣٠ يوماً لتتمكن من تنزيلها، وقد يعرض الفريق الصور المعتمدة على شاشة الجناح.',
    consentApi: 'تُرسل صورتك إلى خدمة الصور لإنشاء اللوحة ثم تُحذف هناك. تُحفظ الصورة النهائية ٣٠ يوماً لتتمكن من تنزيلها، وقد يعرض الفريق الصور المعتمدة على شاشة الجناح.',
    consentBox: 'أوافق على تصوير وجهي ومعالجته لإنشاء هذه الصورة.', continue: 'متابعة', consentNeeded: 'يرجى تحديد المربع للمتابعة.',
    step3: 'الخطوة ٣ من ٤ · ضع وجهك داخل الشكل', shoot: 'التقط صورتي', camError: 'الكاميرا غير متاحة. يرجى طلب المساعدة من الفريق.',
    working: 'جارٍ الإنشاء', workLocal: 'نصمم صورتك…', workApi: 'الذكاء الاصطناعي يرسم صورتك. حوالي ٢٠ ثانية…',
    getPhoto: 'احصل على صورتي', retake: 'إعادة', step4: 'الخطوة ٤ من ٤', leadTitle: 'أين نرسلها؟', email: 'البريد الإلكتروني', mobile: 'الجوال',
    marketing: 'اختياري: أرسلوا لي أخبار هذه الفعالية.', unlock: 'افتح صورتي', ready: 'صورتك جاهزة',
    scanTitle: 'امسح الرمز بكاميرا هاتفك', scanSub: 'اتصل بشبكة واي فاي الجناح إذا لم يفتح الرابط.', done: 'تم',
    err: { email_invalid: 'البريد الإلكتروني غير صحيح.', contact_required: 'يرجى إضافة بريد أو رقم جوال.', network: 'حدث خطأ. يرجى طلب المساعدة من الفريق.' }
  }
};
const IDLE_RESET_MS = 60000;
const $ = s => document.querySelector(s);
const st = { lang: 'en', cfg: null, style: null, photoId: null, stream: null, idle: 0, busy: false };
const t = k => T[st.lang][k];

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'network');
  return data;
}
const errText = e => T[st.lang].err[e.message] || T[st.lang].err.network;

function applyLang() {
  document.documentElement.lang = st.lang;
  document.documentElement.dir = st.lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  $('#lang').textContent = st.lang === 'ar' ? 'English' : 'العربية';
  if (st.cfg) { $('#event').textContent = st.cfg.event[st.lang]; renderStyles(); }
}
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === `s-${id}`));
  st.screen = id;
  $('#lang').hidden = !['attract', 'style'].includes(id);
  bumpIdle();
}
function bumpIdle() {
  clearTimeout(st.idle);
  if (st.screen !== 'attract' && st.screen !== 'work') st.idle = setTimeout(reset, IDLE_RESET_MS);
}

function renderStyles() {
  $('#styles').replaceChildren(...st.cfg.styles.map(s => {
    const b = document.createElement('button');
    b.type = 'button';
    const sw = document.createElement('div'); sw.className = 'sw';
    const rgb = a => `rgb(${a.join(',')})`;
    sw.style.background = `linear-gradient(160deg, ${rgb(s.local.light)} 0%, ${rgb(s.local.mid)} 45%, ${rgb(s.local.shadow)} 100%)`;
    const title = document.createElement('strong'); title.textContent = s.title[st.lang];
    const tag = document.createElement('span'); tag.textContent = s.tagline[st.lang];
    b.append(sw, title, tag);
    b.onclick = () => { st.style = s; openConsent(); };
    return b;
  }));
}

async function renderGallery() {
  try {
    const list = await api('/api/gallery');
    $('#gallery').replaceChildren(...list.slice(0, 6).map(p => { const img = new Image(); img.src = `/g/${p.id}.jpg`; img.alt = ''; return img; }));
  } catch { /* keep last */ }
}

function openConsent() {
  $('#consent').checked = false;
  $('#consent-err').textContent = '';
  $('#consent-body').textContent = st.cfg.engine === 'api' ? t('consentApi') : t('consentLocal');
  show('consent');
}

async function openCamera() {
  show('camera');
  $('#cam-err').textContent = '';
  $('#shoot').disabled = true;
  try {
    st.stream ??= await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' }, audio: false });
    $('#video').srcObject = st.stream;
    await $('#video').play();
    $('#shoot').disabled = false;
  } catch { $('#cam-err').textContent = t('camError'); }
}
function stopCamera() {
  st.stream?.getTracks().forEach(tr => tr.stop());
  st.stream = null;
}

function beep(f, ms = 90) { try { st.ac ??= new AudioContext(); const o = st.ac.createOscillator(), g = st.ac.createGain(); o.frequency.value = f; g.gain.value = .07; o.connect(g).connect(st.ac.destination); o.start(); g.gain.exponentialRampToValueAtTime(.0001, st.ac.currentTime + ms / 1000); o.stop(st.ac.currentTime + ms / 1000); } catch {} }

async function shoot() {
  if (st.busy) return;
  st.busy = true;
  $('#shoot').disabled = true;
  for (const n of [3, 2, 1]) { $('#count').textContent = n; beep(660); await new Promise(r => setTimeout(r, 800)); }
  $('#count').textContent = '';
  $('#flash').classList.remove('go'); void $('#flash').offsetWidth; $('#flash').classList.add('go');
  beep(1200, 160);
  const raw = Muse.capture($('#video'), 1024, 1536, true); // mirrored like the preview
  stopCamera();
  $('#work-line').textContent = st.cfg.engine === 'api' ? t('workApi') : t('workLocal');
  show('work');
  try {
    let styled = null, engine = 'local';
    if (st.cfg.engine === 'api') {
      const r = await api('/api/generate', { styleId: st.style.id, image: raw.toDataURL('image/jpeg', 0.9), consentFace: true });
      if (r.image) {
        const img = new Image();
        await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = r.image; });
        styled = Muse.stylize(img, st.style.local, { tone: false });
        engine = 'api';
      }
    }
    await new Promise(r => setTimeout(r, 50));
    styled ??= Muse.stylize(raw, st.style.local);
    Muse.frame(styled, st.style, st.cfg, st.lang);
    const jpeg = styled.toDataURL('image/jpeg', 0.9);
    const saved = await api('/api/photos', { image: jpeg, styleId: st.style.id, engine, lang: st.lang, consentFace: true });
    st.photoId = saved.id;
    $('#result').src = jpeg;
    show('result');
  } catch (e) {
    alertAndReset(e);
  } finally { st.busy = false; }
}
function alertAndReset(e) {
  $('#work-line').textContent = errText(e);
  setTimeout(reset, 4000);
}

$('#f-lead').onsubmit = async e => {
  e.preventDefault();
  if (st.busy) return;
  const f = e.target;
  st.busy = true;
  try {
    const r = await api('/api/lead', { id: st.photoId, email: f.email.value, mobile: f.mobile.value, marketing: f.marketing.checked });
    const qr = qrcode(0, 'M'); qr.addData(r.url); qr.make();
    $('#qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    $('#qr').dataset.url = r.url;
    show('qr');
  } catch (err) { $('#lead-err').textContent = errText(err); }
  finally { st.busy = false; }
};

function reset() {
  stopCamera();
  Object.assign(st, { style: null, photoId: null, busy: false });
  document.querySelectorAll('form').forEach(f => f.reset());
  document.querySelectorAll('.error').forEach(el => { el.textContent = ''; });
  $('#result').removeAttribute('src');
  if (st.lang !== 'en') { st.lang = 'en'; applyLang(); }
  renderGallery();
  show('attract');
}

$('#go').onclick = () => show('style');
document.querySelectorAll('[data-home]').forEach(b => { b.onclick = reset; });
$('#consent-go').onclick = () => { if (!$('#consent').checked) { $('#consent-err').textContent = t('consentNeeded'); return; } openCamera(); };
$('#shoot').onclick = shoot;
$('#retake').onclick = openCamera;
$('#want').onclick = () => show('lead');
$('#lang').onclick = () => { st.lang = st.lang === 'en' ? 'ar' : 'en'; applyLang(); };
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, bumpIdle));
document.addEventListener('contextmenu', e => e.preventDefault());

(async () => {
  st.cfg = await api('/api/config');
  applyLang();
  reset();
  setInterval(() => { if (st.screen === 'attract') renderGallery(); }, 20000);
})();
