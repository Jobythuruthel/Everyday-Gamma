// CONCIERGE kiosk: scan (USB scanner types the code and presses Enter), find by email or mobile, or register as a walk-in.
const T = {
  en: {
    label: 'Reception', welcome: 'Welcome.', scanHelp: 'Scan the QR code from your confirmation email under the scanner.', codePh: 'or type your code',
    findMe: 'Find me by email or mobile', notRegistered: 'I\'m not registered', findTitle: 'Let\'s find your registration', emailOrMobile: 'Email or mobile number',
    back: 'Back', checkIn: 'Check in', walkinTitle: 'Register in 20 seconds', name: 'Full name', company: 'Company', email: 'Email', mobile: 'Mobile', getBadge: 'Get my badge',
    hello: n => `Welcome, ${n}.`, again: n => `Welcome back, ${n}.`, printing: 'Your badge is printing now. Please collect it from the printer.',
    preview: 'Your badge is ready. Staff will hand it to you.', reprintAsk: 'Your badge was already printed. If you lost it, please ask a staff member.',
    host: h => `${h} has been told you have arrived.`, hostGeneric: 'Your host has been told you have arrived.',
    err: { not_found: 'We couldn\'t find that registration. Try your email or mobile, or register now.', name_required: 'Please enter your full name.', email_invalid: 'That email does not look right.', contact_required: 'Please add an email or mobile number.', network: 'Connection problem. Please ask a staff member.' }
  },
  ar: {
    label: 'الاستقبال', welcome: 'أهلاً وسهلاً.', scanHelp: 'امسح رمز QR من رسالة التأكيد تحت الماسح.', codePh: 'أو اكتب رمزك',
    findMe: 'ابحث عني بالبريد أو الجوال', notRegistered: 'لست مسجلاً', findTitle: 'لنجد تسجيلك', emailOrMobile: 'البريد الإلكتروني أو رقم الجوال',
    back: 'رجوع', checkIn: 'تسجيل الحضور', walkinTitle: 'سجّل في ٢٠ ثانية', name: 'الاسم الكامل', company: 'الشركة', email: 'البريد الإلكتروني', mobile: 'الجوال', getBadge: 'احصل على بطاقتي',
    hello: n => `أهلاً بك، ${n}.`, again: n => `مرحباً بعودتك، ${n}.`, printing: 'تتم طباعة بطاقتك الآن. يرجى استلامها من الطابعة.',
    preview: 'بطاقتك جاهزة. سيسلمها لك الفريق.', reprintAsk: 'تمت طباعة بطاقتك سابقاً. إذا فقدتها يرجى مراجعة أحد الموظفين.',
    host: h => `تم إبلاغ ${h} بوصولك.`, hostGeneric: 'تم إبلاغ مضيفك بوصولك.',
    err: { not_found: 'لم نجد هذا التسجيل. جرّب البريد أو الجوال، أو سجّل الآن.', name_required: 'يرجى إدخال الاسم الكامل.', email_invalid: 'البريد الإلكتروني غير صحيح.', contact_required: 'يرجى إضافة بريد أو رقم جوال.', network: 'مشكلة في الاتصال. يرجى طلب المساعدة من الفريق.' }
  }
};
const $ = s => document.querySelector(s);
const st = { lang: 'en', screen: 'scan', timer: 0, busy: false };
const t = k => T[st.lang][k];

async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'network');
  return data;
}
const errText = e => T[st.lang].err[e.message] || T[st.lang].err.network;

function applyLang() {
  document.documentElement.lang = st.lang;
  document.documentElement.dir = st.lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-ph]').forEach(el => { el.placeholder = t(el.dataset.ph); });
  $('#lang').textContent = st.lang === 'ar' ? 'English' : 'العربية';
}
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === `s-${id}`));
  st.screen = id;
  clearTimeout(st.timer);
  if (id !== 'scan') st.timer = setTimeout(home, id === 'welcome' ? 7000 : 45000);
  const first = $(`#s-${id} input`);
  if (first) setTimeout(() => first.focus(), 50);
}
function home() {
  document.querySelectorAll('form').forEach(f => f.reset());
  document.querySelectorAll('.error').forEach(e => { e.textContent = ''; });
  if (st.lang !== 'en') { st.lang = 'en'; applyLang(); }
  show('scan');
}

function chime() {
  try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 1046; g.gain.value = .06; o.connect(g).connect(a.destination); o.start(); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + .4); o.stop(a.currentTime + .4); } catch {}
}

function welcome(r) {
  const first = r.name.split(/\s+/)[0];
  $('#w-cat').textContent = r.category;
  $('#w-cat').className = `chip-cat${r.vip ? ' vip' : ''}`;
  $('#w-title').textContent = r.first ? t('hello')(first) : t('again')(first);
  $('#w-company').textContent = r.company || '';
  $('#w-badge').textContent = !r.first ? t('reprintAsk') : r.badge === 'queued' ? t('printing') : t('preview');
  $('#w-host').textContent = r.vip && r.first ? (r.host ? t('host')(r.host) : t('hostGeneric')) : '';
  $('#w-ms').textContent = `${r.serverMs} ms`;
  if (r.first && r.badge === 'preview') window.open(`badge.html?code=${encodeURIComponent(r.code)}`, '_blank');
  chime();
  show('welcome');
}

async function run(errEl, call) {
  if (st.busy) return;
  st.busy = true;
  try { welcome(await call()); }
  catch (e) { $(errEl).textContent = errText(e); }
  finally { st.busy = false; }
}

$('#f-scan').onsubmit = e => {
  e.preventDefault();
  const code = $('#code').value.trim();
  $('#code').value = '';
  if (code) run('#scan-err', () => api('/api/checkin', { code }));
};
$('#f-find').onsubmit = e => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  run('#find-err', () => api('/api/checkin', q.includes('@') ? { email: q } : { mobile: q }));
};
$('#f-walkin').onsubmit = e => {
  e.preventDefault();
  const f = e.target;
  run('#walkin-err', () => api('/api/walkin', { name: f.name.value, company: f.company.value, email: f.email.value, mobile: f.mobile.value }));
};
document.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => show(b.dataset.go); });
document.querySelectorAll('[data-home]').forEach(b => { b.onclick = home; });
$('#lang').onclick = () => { st.lang = st.lang === 'en' ? 'ar' : 'en'; applyLang(); if (st.screen === 'scan') $('#code').focus(); };

// Keep the scan field focused so a USB scanner always lands in it.
setInterval(() => { if (st.screen === 'scan' && document.activeElement !== $('#code') && document.activeElement?.tagName !== 'BUTTON') $('#code').focus(); }, 1000);
document.addEventListener('pointerdown', () => { if (st.screen !== 'scan' && st.screen !== 'welcome') { clearTimeout(st.timer); st.timer = setTimeout(home, 45000); } });
document.addEventListener('contextmenu', e => e.preventDefault());

applyLang();
home();
