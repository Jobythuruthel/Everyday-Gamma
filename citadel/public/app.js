// CITADEL kiosk front end. States: attract -> identify -> modes -> play -> result -> profile -> done -> attract
const T = {
  en: {
    alert: 'City under attack', attractTitle: 'Stop the breach.', attractSub: 'Three missions. 60 seconds each. Can you beat today\'s top defender?',
    start: 'Start mission', todayTop: 'Today\'s top defenders', step1: 'Step 1 of 2', identifyTitle: 'Who is defending the city?',
    name: 'Your name', mobile: 'Mobile number', back: 'Back', continue: 'Continue',
    consentGame: 'I agree that [Event organiser] stores my name, mobile and scores to run this game and the leaderboard. Deleted after the event.',
    consentMarketing: 'Optional: contact me about cybersecurity events and services.',
    step2: 'Step 2 of 2', chooseMission: 'Choose your mission', finish: 'Finish',
    missionComplete: 'Mission complete', another: 'Play another mission', certificate: 'Defender certificate',
    profileTitle: 'Unlock your certificate', email: 'Work email', company: 'Company', jobTitle: 'Job title', skip: 'Skip', getCert: 'Get certificate',
    thanks: 'Thank you', doneTitle: 'City defended.', correct: 'Correct', wrong: 'Not quite', timeout: 'Time\'s up',
    resLine: (c, t, r) => `${c} of ${t} right${r ? ` · rank #${r} today` : ''}`, doneLine: 'Your certificate is ready. Staff can print it for you.',
    doneNoCert: 'Your score is on the wall. Come back and beat it.', played: 'Played',
    err: { name_required: 'Please enter your name.', mobile_invalid: 'Please enter a valid mobile number.', consent_required: 'Please tick the first box to play.', email_invalid: 'That email does not look right.', play_limit: 'You have reached today\'s limit for this mission.', network: 'Connection problem. Please ask a staff member.' }
  },
  ar: {
    alert: 'المدينة تحت الهجوم', attractTitle: 'أوقف الاختراق.', attractSub: 'ثلاث مهام. ٦٠ ثانية لكل مهمة. هل تتفوق على أفضل مدافع اليوم؟',
    start: 'ابدأ المهمة', todayTop: 'أفضل المدافعين اليوم', step1: 'الخطوة ١ من ٢', identifyTitle: 'من يدافع عن المدينة؟',
    name: 'اسمك', mobile: 'رقم الجوال', back: 'رجوع', continue: 'متابعة',
    consentGame: 'أوافق على أن يحفظ [منظّم الفعالية] اسمي ورقم جوالي ونتائجي لتشغيل اللعبة ولوحة الصدارة. تُحذف بعد الفعالية.',
    consentMarketing: 'اختياري: تواصلوا معي بخصوص فعاليات وخدمات الأمن السيبراني.',
    step2: 'الخطوة ٢ من ٢', chooseMission: 'اختر مهمتك', finish: 'إنهاء',
    missionComplete: 'اكتملت المهمة', another: 'العب مهمة أخرى', certificate: 'شهادة المدافع',
    profileTitle: 'احصل على شهادتك', email: 'البريد الإلكتروني للعمل', company: 'الشركة', jobTitle: 'المسمى الوظيفي', skip: 'تخطي', getCert: 'احصل على الشهادة',
    thanks: 'شكراً لك', doneTitle: 'تم الدفاع عن المدينة.', correct: 'إجابة صحيحة', wrong: 'ليست صحيحة', timeout: 'انتهى الوقت',
    resLine: (c, t, r) => `${c} من ${t} صحيحة${r ? ` · المركز ${r} اليوم` : ''}`, doneLine: 'شهادتك جاهزة. يمكن للفريق طباعتها لك.',
    doneNoCert: 'نتيجتك على الشاشة. عد وتفوّق عليها.', played: 'تم اللعب',
    err: { name_required: 'يرجى إدخال اسمك.', mobile_invalid: 'يرجى إدخال رقم جوال صحيح.', consent_required: 'يرجى تحديد المربع الأول للعب.', email_invalid: 'البريد الإلكتروني غير صحيح.', play_limit: 'وصلت إلى الحد اليومي لهذه المهمة.', network: 'مشكلة في الاتصال. يرجى طلب المساعدة من الفريق.' }
  }
};

const IDLE_RESET_MS = 45000;
const FEEDBACK_MS = 1800;
const $ = s => document.querySelector(s);
const st = { lang: 'en', visitor: null, round: null, played: new Set(), timer: 0, idle: 0, busy: false };
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
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === `s-${id}`));
  st.screen = id;
  const first = $(`#s-${id} input, #s-${id} button.primary, #s-${id} button`);
  if (first && id !== 'attract') first.focus({ preventScroll: true });
}

// Sound: short synthesized cues, no audio files needed offline.
let ac;
function beep(freq, ms = 120) {
  try {
    ac ??= new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = freq; g.gain.value = .08;
    o.connect(g).connect(ac.destination); o.start();
    g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + ms / 1000);
    o.stop(ac.currentTime + ms / 1000);
  } catch { /* audio is optional */ }
}

function renderBoard(el, rows) {
  el.replaceChildren(...rows.map(r => {
    const li = document.createElement('li');
    if (st.visitor && r.visitorId === st.visitor.id) li.className = 'me';
    const n = document.createElement('span'); n.textContent = r.name;
    const s = document.createElement('b'); s.textContent = r.score;
    li.append(n, s); return li;
  }));
}
async function refreshBoard(el) { try { renderBoard(el, await api('/api/board')); } catch { /* keep last board */ } }

function reset() {
  clearInterval(st.timer);
  Object.assign(st, { visitor: null, round: null, played: new Set(), busy: false });
  document.querySelectorAll('form').forEach(f => f.reset());
  document.querySelectorAll('.error').forEach(e => { e.textContent = ''; });
  if (st.lang !== 'en') { st.lang = 'en'; applyLang(); }
  refreshBoard($('#mini-board'));
  show('attract');
}

function bumpIdle() {
  clearTimeout(st.idle);
  if (st.screen !== 'attract' && st.screen !== 'play') st.idle = setTimeout(reset, IDLE_RESET_MS);
}

async function renderModes() {
  const modes = await api(`/api/modes?lang=${st.lang}`);
  $('#modes').replaceChildren(...modes.map((m, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.mode = m.id;
    const k = document.createElement('span'); k.className = 'key'; k.textContent = i + 1;
    const title = document.createElement('strong'); title.textContent = m.title;
    const intro = document.createElement('div'); intro.className = 'sub';
    intro.style.cssText = 'font-weight:400;color:var(--ink-2);font-size:15px';
    intro.textContent = st.played.has(m.id) ? `✓ ${t('played')}` : m.intro;
    b.append(k, title, intro);
    b.onclick = () => startRound(m.id);
    return b;
  }));
}

async function startRound(mode) {
  if (st.busy) return;
  st.busy = true;
  try {
    st.round = await api('/api/rounds', { visitorId: st.visitor.id, mode });
    st.round.score = 0;
    $('#play-title').textContent = st.round.title;
    $('#play-score').textContent = '0';
    show('play');
    renderQuestion(st.round.question, 0);
    beep(660);
  } catch (e) { $('#modes-err').textContent = errText(e); }
  finally { st.busy = false; }
}

function renderQuestion(q, index) {
  $('#feedback').hidden = true;
  $('#play-count').textContent = `${index + 1} / ${st.round.total}`;
  $('#prompt').textContent = q.prompt;
  $('#options').replaceChildren(...q.options.map((label, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    const k = document.createElement('span'); k.className = 'key'; k.textContent = i + 1;
    b.append(k, document.createTextNode(label));
    b.onclick = () => submit(i);
    return b;
  }));
  const limit = st.round.timeLimitMs, t0 = performance.now(), bar = $('#timer i');
  clearInterval(st.timer);
  st.timer = setInterval(() => {
    const left = Math.max(0, 1 - (performance.now() - t0) / limit);
    bar.style.transform = `scaleX(${left})`;
    $('#timer').classList.toggle('low', left < .25);
    if (left === 0) submit(null);
  }, 50);
}

async function submit(choice) {
  if (st.busy || !st.round) return;
  st.busy = true;
  clearInterval(st.timer);
  document.querySelectorAll('#options button').forEach(b => { b.disabled = true; });
  try {
    const r = await api('/api/answer', { roundId: st.round.roundId, choice });
    const opts = document.querySelectorAll('#options button');
    opts[r.answer]?.classList.add('right');
    if (choice !== null) opts[choice]?.classList.add('picked');
    const fb = $('#feedback');
    fb.className = `feedback ${r.correct ? 'ok' : 'bad'}`;
    fb.textContent = `${r.correct ? t('correct') : choice === null ? t('timeout') : t('wrong')}${r.points ? ` +${r.points}` : ''}. ${r.why}`;
    fb.hidden = false;
    $('#play-score').textContent = r.score;
    beep(r.correct ? 880 : 220, r.correct ? 120 : 260);
    setTimeout(() => {
      st.busy = false;
      if (r.done) finishRound(r.result);
      else renderQuestion(r.question, r.index);
    }, FEEDBACK_MS);
  } catch (e) {
    st.busy = false;
    $('#feedback').className = 'feedback bad'; $('#feedback').textContent = errText(e); $('#feedback').hidden = false;
    setTimeout(reset, 4000);
  }
}

function finishRound(res) {
  st.played.add(res.mode);
  st.round = null;
  $('#res-score').textContent = res.score;
  $('#res-line').textContent = T[st.lang].resLine(res.correct, res.total, res.rank);
  $('[data-again]').hidden = st.played.size >= 3;
  show('result');
  bumpIdle();
}

async function done(withCert) {
  $('#done-line').textContent = withCert ? t('doneLine') : t('doneNoCert');
  await refreshBoard($('#done-board'));
  show('done');
  setTimeout(reset, 12000);
}

// Wiring
$('#lang').onclick = () => { st.lang = st.lang === 'en' ? 'ar' : 'en'; applyLang(); if (st.screen === 'modes') renderModes(); };
$('#go').onclick = () => show('identify');
document.querySelectorAll('[data-back]').forEach(b => { b.onclick = reset; });
$('[data-again]').onclick = async () => { await renderModes(); show('modes'); };
document.querySelectorAll('[data-finish]').forEach(b => { b.onclick = () => st.played.size ? show('profile') : reset(); });
$('[data-skip]').onclick = () => done(false);

$('#f-identify').onsubmit = async e => {
  e.preventDefault();
  if (st.busy) return;
  const f = e.target;
  st.busy = true;
  try {
    st.visitor = await api('/api/visitors', {
      name: f.name.value, mobile: f.mobile.value, lang: st.lang,
      consentGame: f.consentGame.checked, consentMarketing: f.consentMarketing.checked
    });
    await renderModes();
    show('modes');
  } catch (err) { $('#identify-err').textContent = errText(err); }
  finally { st.busy = false; }
};

$('#f-profile').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/profile', { visitorId: st.visitor.id, email: f.email.value, company: f.company.value, jobTitle: f.jobTitle.value });
    window.open(`certificate.html?visitorId=${encodeURIComponent(st.visitor.id)}`, '_blank');
    done(true);
  } catch (err) { $('#profile-err').textContent = errText(err); }
};

// Arcade encoders send keys 1-4 and Enter, so no drivers are needed.
document.addEventListener('keydown', e => {
  bumpIdle();
  if (e.target.tagName === 'INPUT') return;
  const n = Number(e.key);
  if (st.screen === 'attract' && (e.key === 'Enter' || n)) return show('identify');
  if (st.screen === 'play' && n >= 1) { const b = document.querySelectorAll('#options button')[n - 1]; if (b && !b.disabled) b.click(); }
  if (st.screen === 'modes' && n >= 1) document.querySelectorAll('#modes button')[n - 1]?.click();
});
['pointerdown', 'input'].forEach(ev => document.addEventListener(ev, bumpIdle));
document.addEventListener('contextmenu', e => e.preventDefault());

applyLang();
reset();
setInterval(() => { if (st.screen === 'attract') refreshBoard($('#mini-board')); }, 10000);
