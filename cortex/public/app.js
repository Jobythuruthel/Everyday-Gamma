// CORTEX kiosk front end: ask by voice or text, get an approved answer with its source, or a human.
const T = {
  en: {
    title: 'Ask the event.', sub: 'Speak or type your question. I answer only from approved event information.',
    placeholder: 'Where is the keynote?', human: 'Talk to a person', source: 'Source', mute: 'Sound off', unmute: 'Sound on',
    refuse: 'I don\'t have verified information on that. A staff member can help you.', clarify: 'Did you mean one of these?',
    handoff: 'A staff member has been called and is on the way. Please wait here.', error: 'Connection problem. Please ask a staff member.',
    listening: 'Listening…'
  },
  ar: {
    title: 'اسأل الفعالية.', sub: 'تحدث أو اكتب سؤالك. أجيب فقط من معلومات الفعالية المعتمدة.',
    placeholder: 'أين الكلمة الرئيسية؟', human: 'التحدث مع موظف', source: 'المصدر', mute: 'كتم الصوت', unmute: 'تشغيل الصوت',
    refuse: 'ليست لدي معلومات موثقة عن ذلك. يمكن لأحد الموظفين مساعدتك.', clarify: 'هل تقصد أحد هذه؟',
    handoff: 'تم استدعاء أحد الموظفين وهو في الطريق. يرجى الانتظار هنا.', error: 'مشكلة في الاتصال. يرجى طلب المساعدة من الفريق.',
    listening: 'أستمع…'
  }
};
const IDLE_RESET_MS = 60000;
const $ = s => document.querySelector(s);
const st = { lang: 'en', muted: false, lastQuestion: '', idle: 0, busy: false };
const t = k => T[st.lang][k];

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'network');
  return data;
}

function orb(state) { $('#orb').className = `orb ${state || ''}`; }

async function applyLang() {
  document.documentElement.lang = st.lang;
  document.documentElement.dir = st.lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  $('#lang').textContent = st.lang === 'ar' ? 'English' : 'العربية';
  $('#q').placeholder = t('placeholder');
  $('#mute').textContent = st.muted ? t('unmute') : t('mute');
  try {
    const cfg = await api(`/api/config?lang=${st.lang}`);
    $('#event').textContent = cfg.event;
    chips($('#chips'), cfg.trending);
  } catch { /* keep last */ }
}

function chips(el, list) {
  el.replaceChildren(...list.map(c => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = c.label;
    b.onclick = () => { st.lastQuestion = c.label; show(c.label, () => api(`/api/entry?id=${encodeURIComponent(c.entryId)}&lang=${st.lang}`)); };
    return b;
  }));
}

function speak(text) {
  if (st.muted || !('speechSynthesis' in window)) return orb();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = st.lang === 'ar' ? 'ar-SA' : 'en-GB';
  const voices = speechSynthesis.getVoices();
  const pick = voices.find(v => v.lang.startsWith(st.lang) && /female|zira|hoda|salma|zariyah|libby|sonia/i.test(v.name)) || voices.find(v => v.lang.startsWith(st.lang));
  if (pick) u.voice = pick;
  u.onstart = () => orb('speak');
  u.onend = u.onerror = () => orb();
  speechSynthesis.speak(u);
}

async function show(question, fetcher) {
  if (st.busy) return;
  st.busy = true;
  bumpIdle();
  orb('think');
  $('#reply').hidden = false;
  $('#you').textContent = `“${question}”`;
  $('#answer').textContent = '…';
  $('#source').textContent = '';
  $('#suggest').replaceChildren();
  try {
    const r = await fetcher();
    if (r.action === 'answer') {
      $('#answer').textContent = r.answer;
      $('#source').textContent = `${t('source')}: ${r.source}`;
      speak(r.answer);
    } else {
      const msg = r.action === 'clarify' ? t('clarify') : t('refuse');
      $('#answer').textContent = msg;
      chips($('#suggest'), r.suggestions ?? []);
      speak(msg);
    }
  } catch {
    $('#answer').textContent = t('error'); orb();
  } finally { st.busy = false; }
}

$('#ask').onsubmit = e => {
  e.preventDefault();
  const text = $('#q').value.trim();
  if (!text) return;
  $('#q').value = '';
  $('#q').blur();
  st.lastQuestion = text;
  show(text, () => api('/api/ask', { text, lang: st.lang, via: st.via || 'text' }));
  st.via = 'text';
};

$('#human').onclick = async () => {
  try {
    await api('/api/handoff', { question: st.lastQuestion, lang: st.lang });
    $('#answer').textContent = t('handoff'); $('#source').textContent = ''; $('#suggest').replaceChildren();
    speak(t('handoff'));
  } catch { $('#answer').textContent = t('error'); }
};
$('#mute').onclick = () => { st.muted = !st.muted; if (st.muted) speechSynthesis?.cancel(); $('#mute').textContent = st.muted ? t('unmute') : t('mute'); };
$('#lang').onclick = () => { st.lang = st.lang === 'en' ? 'ar' : 'en'; applyLang(); };

// Voice input (Chrome and Edge). Hidden when the browser has no speech recognition.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const mic = $('#mic');
  mic.hidden = false;
  let rec = null;
  mic.onclick = () => {
    if (rec) return rec.stop();
    speechSynthesis?.cancel();
    rec = new SR();
    rec.lang = st.lang === 'ar' ? 'ar-SA' : 'en-US';
    rec.interimResults = true;
    rec.onstart = () => { mic.classList.add('on'); orb('listen'); $('#q').placeholder = t('listening'); };
    rec.onresult = e => {
      const text = [...e.results].map(r => r[0].transcript).join(' ');
      $('#q').value = text;
      if (e.results[e.results.length - 1].isFinal) { st.via = 'voice'; $('#ask').requestSubmit(); }
    };
    rec.onend = rec.onerror = () => { mic.classList.remove('on'); rec = null; $('#q').placeholder = t('placeholder'); if ($('#orb').classList.contains('listen')) orb(); };
    rec.start();
  };
}

function reset() {
  speechSynthesis?.cancel();
  $('#reply').hidden = true; $('#q').value = ''; st.lastQuestion = '';
  orb();
  if (st.lang !== 'en') { st.lang = 'en'; applyLang(); }
}
function bumpIdle() { clearTimeout(st.idle); st.idle = setTimeout(reset, IDLE_RESET_MS); }
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, bumpIdle));
document.addEventListener('contextmenu', e => e.preventDefault());
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();

applyLang();
setInterval(() => { if ($('#reply').hidden) applyLang(); }, 60000);
