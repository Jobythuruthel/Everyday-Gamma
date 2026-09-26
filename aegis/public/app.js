// AEGIS kiosk front end. attract -> identify -> modules -> (hazard | loto | ppe | reaction) -> result -> done
const T = {
  en: {
    alert: 'Facility opens in 4 minutes', attractTitle: 'Zero Incident Mission.', attractSub: 'Four drills stand between the crew and startup. Learn it, feel it, prove it.',
    start: 'Start the inspection', todayTop: 'Today\'s safest controllers', step1: 'Step 1 of 2', identifyTitle: 'Who is the safety controller?',
    name: 'Your name', employeeNo: 'Employee number (optional)', department: 'Department (optional)', back: 'Back', continue: 'Continue',
    step2: 'Step 2 of 2', chooseDrill: 'Choose a drill', finish: 'Finish', done: 'Done', next: 'Next',
    modules: {
      hazard: ['Hazard Hunt', 'Flag every hazard before the siren.'], loto: ['Lockout-Tagout', 'Put the six steps in the right order.'],
      ppe: ['PPE Loadout', 'Equip the crew for each task.'], reaction: ['Emergency Reaction', 'Hit the pad the moment the alarm fires.']
    },
    hazardHelp: 'Tap each hazard to flag it. Tap again to unflag. Random tapping costs points.', slowDown: 'Slow down. Inspect first.',
    lotoTitle: 'Lockout-Tagout', lotoHelp: 'Tap the steps in the order you would do them. Tap a placed step to remove it.', steps: 'Steps', yourSequence: 'Your sequence', lockIt: 'Lock it in',
    ppeTitle: 'PPE Loadout', ppeHelp: 'Pick everything this worker needs, and nothing they don\'t.',
    reactionTitle: 'Emergency Reaction', reactionHelp: 'Wait for red. Tap the pad or press any button as fast as you can.', wait: 'Wait…', now: 'NOW!', early: 'Too early!',
    drillComplete: 'Drill complete', another: 'Another drill', thanks: 'Thank you', played: 'Done',
    resLine: (c, t, extra) => `${c} of ${t} right${extra ? ` · ${extra}` : ''}`, avg: ms => `average ${ms} ms`,
    fbTitle: { hazard: 'Hazards you missed', loto: 'The correct order', ppe: 'Correct gear', reaction: '' }, allFound: 'You found every hazard.',
    doneCert: 'Certified safety controller.', donePartial: 'Crew is safer today.', doneLine: 'Your certificate is printing. Complete all four drills to be fully certified.', doneLineFull: 'All four drills complete. Collect your certificate from staff.',
    err: { name_required: 'Please enter your name.', network: 'Connection problem. Please ask a staff member.' }
  },
  ar: {
    alert: 'تفتح المنشأة خلال ٤ دقائق', attractTitle: 'مهمة صفر حوادث.', attractSub: 'أربعة تمارين تفصل الطاقم عن بدء التشغيل. تعلّم، اشعر، أثبت.',
    start: 'ابدأ التفتيش', todayTop: 'أفضل مراقبي السلامة اليوم', step1: 'الخطوة ١ من ٢', identifyTitle: 'من هو مراقب السلامة؟',
    name: 'اسمك', employeeNo: 'الرقم الوظيفي (اختياري)', department: 'القسم (اختياري)', back: 'رجوع', continue: 'متابعة',
    step2: 'الخطوة ٢ من ٢', chooseDrill: 'اختر تمريناً', finish: 'إنهاء', done: 'تم', next: 'التالي',
    modules: {
      hazard: ['اصطياد المخاطر', 'حدّد كل خطر قبل صفارة الإنذار.'], loto: ['القفل والتعليق', 'رتّب الخطوات الست بالترتيب الصحيح.'],
      ppe: ['معدات الوقاية', 'جهّز الطاقم لكل مهمة.'], reaction: ['الاستجابة للطوارئ', 'اضغط فور انطلاق الإنذار.']
    },
    hazardHelp: 'اضغط على كل خطر لتحديده. اضغط مرة أخرى لإلغائه. الضغط العشوائي يخصم نقاطاً.', slowDown: 'تمهّل. افحص أولاً.',
    lotoTitle: 'القفل والتعليق', lotoHelp: 'اضغط على الخطوات بالترتيب الذي تنفذها به. اضغط على خطوة مضافة لإزالتها.', steps: 'الخطوات', yourSequence: 'ترتيبك', lockIt: 'تأكيد',
    ppeTitle: 'معدات الوقاية', ppeHelp: 'اختر كل ما يحتاجه هذا العامل، ولا شيء غير ذلك.',
    reactionTitle: 'الاستجابة للطوارئ', reactionHelp: 'انتظر اللون الأحمر. اضغط على اللوحة أو أي زر بأسرع ما يمكن.', wait: 'انتظر…', now: 'الآن!', early: 'مبكر جداً!',
    drillComplete: 'اكتمل التمرين', another: 'تمرين آخر', thanks: 'شكراً لك', played: 'تم',
    resLine: (c, t, extra) => `${c} من ${t} صحيحة${extra ? ` · ${extra}` : ''}`, avg: ms => `المتوسط ${ms} ملّي ثانية`,
    fbTitle: { hazard: 'مخاطر فاتتك', loto: 'الترتيب الصحيح', ppe: 'المعدات الصحيحة', reaction: '' }, allFound: 'وجدت كل المخاطر.',
    doneCert: 'مراقب سلامة معتمد.', donePartial: 'الطاقم أكثر أماناً اليوم.', doneLine: 'تتم طباعة شهادتك. أكمل التمارين الأربعة لتحصل على الاعتماد الكامل.', doneLineFull: 'أكملت التمارين الأربعة. استلم شهادتك من الفريق.',
    err: { name_required: 'يرجى إدخال اسمك.', network: 'مشكلة في الاتصال. يرجى طلب المساعدة من الفريق.' }
  }
};
const MODULES = ['hazard', 'loto', 'ppe', 'reaction'];
const IDLE_RESET_MS = 45000;
const $ = s => document.querySelector(s);
const st = { lang: 'en', visitor: null, round: null, done: new Set(), timer: 0, idle: 0, busy: false };
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
  $('#lang').hidden = !['attract', 'identify'].includes(id); // language is fixed once a visitor registers
  bumpIdle();
}

let ac;
function tone(freq, ms = 120, type = 'sine', vol = .08) {
  try {
    ac ??= new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g).connect(ac.destination); o.start();
    g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + ms / 1000);
    o.stop(ac.currentTime + ms / 1000);
  } catch { /* audio optional */ }
}

function timer(bar, label, limitMs, onEnd) {
  clearInterval(st.timer);
  const t0 = performance.now();
  st.timer = setInterval(() => {
    const left = Math.max(0, 1 - (performance.now() - t0) / limitMs);
    bar.style.transform = `scaleX(${left})`;
    bar.parentElement.classList.toggle('low', left < .25);
    if (label) label.textContent = `${Math.ceil(left * limitMs / 1000)}s`;
    if (left === 0) { clearInterval(st.timer); onEnd(); }
  }, 100);
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
async function refreshBoard(el) { try { renderBoard(el, await api('/api/board')); } catch { /* keep last */ } }

function reset() {
  clearInterval(st.timer); clearTimeout(st.rxTimeout);
  Object.assign(st, { visitor: null, round: null, done: new Set(), busy: false });
  document.querySelectorAll('form').forEach(f => f.reset());
  document.querySelectorAll('.error').forEach(e => { e.textContent = ''; });
  if (st.lang !== 'en') { st.lang = 'en'; applyLang(); }
  refreshBoard($('#mini-board'));
  show('attract');
}
function bumpIdle() {
  clearTimeout(st.idle);
  if (['identify', 'modules', 'result', 'done'].includes(st.screen)) st.idle = setTimeout(reset, IDLE_RESET_MS);
}

function renderModules() {
  $('#modules').replaceChildren(...MODULES.map((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    const k = document.createElement('span'); k.className = 'key'; k.textContent = i + 1;
    const title = document.createElement('strong'); title.textContent = t('modules')[m][0];
    const intro = document.createElement('div'); intro.style.cssText = 'font-weight:400;color:var(--ink-2);font-size:15px';
    intro.textContent = st.done.has(m) ? `✓ ${t('played')}` : t('modules')[m][1];
    b.append(k, title, intro);
    b.onclick = () => start(m);
    return b;
  }));
}

async function start(module) {
  if (st.busy) return;
  st.busy = true;
  try {
    st.round = await api('/api/rounds', { visitorId: st.visitor.id, module });
    ({ hazard: playHazard, loto: playLoto, ppe: playPpe, reaction: playReaction })[module](st.round);
    tone(660);
  } catch (e) { $('#modules-err').textContent = errText(e); }
  finally { st.busy = false; }
}

async function submit(payload) {
  if (!st.round || st.submitting) return;
  st.submitting = true;
  clearInterval(st.timer);
  try {
    const r = await api('/api/submit', { roundId: st.round.roundId, ...payload });
    st.last = r;
    return r;
  } catch (e) {
    console.error(e); reset();
  } finally { st.submitting = false; }
}

// Hazard Hunt
function playHazard(round) {
  $('#hz-title').textContent = round.title;
  const flagged = new Set();
  let empties = [], emptyTotal = 0, cooling = false;
  const count = () => { $('#hz-count').textContent = `${flagged.size} / ${round.hazards}`; };
  const scene = $('#scene');
  drawScene(scene, round.elements, (id, g) => {
    if (cooling) return;
    flagged.has(id) ? flagged.delete(id) : flagged.add(id);
    g.classList.toggle('flag', flagged.has(id));
    tone(flagged.has(id) ? 740 : 440, 80);
    count();
  }, () => {
    if (cooling) return;
    emptyTotal++;
    const now = performance.now();
    empties = empties.filter(x => now - x < 2000).concat(now);
    if (empties.length > 3) { // anti random tapping: short cooldown
      cooling = true; empties = [];
      const c = document.createElement('div'); c.className = 'cool'; c.textContent = t('slowDown');
      scene.append(c); tone(180, 300, 'square', .05);
      setTimeout(() => { c.remove(); cooling = false; }, 1500);
    }
  });
  count();
  show('hazard');
  const finish = async () => {
    const r = await submit({ tapped: [...flagged], emptyTaps: emptyTotal });
    if (!r) return;
    scene.querySelectorAll('.el').forEach(g => {
      const id = g.dataset.id;
      g.classList.remove('flag');
      if (r.wrong.includes(id)) g.classList.add('wrong');
      else if (r.missed.includes(id)) g.classList.add('missed');
      else if (flagged.has(id)) g.classList.add('found');
    });
    setTimeout(() => result(r), 2200);
  };
  $('#hz-done').onclick = finish;
  timer($('#hz-bar'), $('#hz-time'), round.timeLimitMs, finish);
}

// Lockout-Tagout
function playLoto(round) {
  const seq = [];
  const render = () => {
    const mk = (s, onClick) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = s.label; b.onclick = onClick; return b; };
    $('#lt-pool').replaceChildren(...round.steps.filter(s => !seq.includes(s)).map(s => mk(s, () => { seq.push(s); tone(700, 60); render(); })));
    $('#lt-seq').replaceChildren(...seq.map(s => mk(s, () => { seq.splice(seq.indexOf(s), 1); render(); })));
    $('#lt-done').disabled = seq.length !== round.steps.length;
  };
  render();
  show('loto');
  const finish = async () => {
    // On timeout, unplaced steps are appended in their shuffled order so the round still scores.
    const order = [...seq, ...round.steps.filter(s => !seq.includes(s))].map(s => s.id);
    const r = await submit({ order });
    if (r) result(r);
  };
  $('#lt-done').onclick = finish;
  timer($('#lt-bar'), $('#lt-time'), round.timeLimitMs, finish);
}

// PPE Loadout
function playPpe(round) {
  const selections = {};
  let i = 0;
  const renderTask = () => {
    const task = round.tasks[i];
    selections[task.id] = new Set();
    $('#pp-task').textContent = task.label;
    $('#pp-count').textContent = `${i + 1} / ${round.tasks.length}`;
    $('#pp-items').replaceChildren(...round.items.map(item => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = item.label;
      b.onclick = () => { const s = selections[task.id]; s.has(item.id) ? s.delete(item.id) : s.add(item.id); b.classList.toggle('on', s.has(item.id)); tone(620, 50); };
      return b;
    }));
  };
  const finish = async () => {
    const r = await submit({ selections: Object.fromEntries(Object.entries(selections).map(([k, v]) => [k, [...v]])) });
    if (r) result(r);
  };
  $('#pp-next').onclick = () => { if (++i < round.tasks.length) renderTask(); else finish(); };
  renderTask();
  show('ppe');
  timer($('#pp-bar'), $('#pp-time'), round.timeLimitMs, finish);
}

// Emergency Reaction
function playReaction(round) {
  const pad = $('#pad'), trials = [];
  let armedAt = 0, state = 'wait';
  const next = () => {
    if (trials.length === round.delays.length) {
      state = 'over';
      return submit({ trials }).then(r => r && result(r));
    }
    $('#rx-count').textContent = `${trials.length + 1} / ${round.delays.length}`;
    state = 'wait'; pad.className = 'pad'; pad.textContent = t('wait');
    st.rxTimeout = setTimeout(() => {
      state = 'go'; armedAt = performance.now(); pad.className = 'pad go'; pad.textContent = t('now');
      tone(880, 400, 'sawtooth', .06);
      st.rxTimeout = setTimeout(() => { if (state === 'go') { trials.push(null); next(); } }, round.maxMs);
    }, round.delays[trials.length]);
  };
  st.rxHit = () => {
    if (st.screen !== 'reaction') return;
    if (state === 'go') {
      clearTimeout(st.rxTimeout); state = 'hit';
      const ms = Math.round(performance.now() - armedAt);
      trials.push(ms); pad.className = 'pad'; pad.textContent = `${ms} ms`;
      setTimeout(next, 900);
    } else if (state === 'wait') {
      clearTimeout(st.rxTimeout); state = 'hit';
      trials.push(-1); pad.className = 'pad early'; pad.textContent = t('early'); tone(160, 250, 'square', .05);
      setTimeout(next, 1200);
    }
  };
  show('reaction');
  next();
}
$('#pad').addEventListener('pointerdown', () => st.rxHit?.());

function result(r) {
  st.done.add(r.module);
  st.round = null;
  $('#res-score').textContent = r.score;
  $('#res-line').textContent = T[st.lang].resLine(r.correct, r.total, r.module === 'reaction' && r.avgMs ? T[st.lang].avg(r.avgMs) : '');
  const items = r.module === 'hazard' && !r.feedback.length ? [t('allFound')] : r.feedback;
  $('#res-fb-title').textContent = t('fbTitle')[r.module];
  $('#res-fb').replaceChildren(...items.map(x => { const li = document.createElement('li'); li.textContent = x; return li; }));
  $('#res-fb-wrap').hidden = !items.length;
  $('[data-again]').hidden = st.done.size >= MODULES.length;
  show('result');
  tone(988, 160);
}

async function finish() {
  if (!st.done.size) return reset();
  const full = st.done.size === MODULES.length;
  $('#done-title').textContent = full ? t('doneCert') : t('donePartial');
  $('#done-line').textContent = full ? t('doneLineFull') : t('doneLine');
  window.open(`certificate.html?visitorId=${encodeURIComponent(st.visitor.id)}`, '_blank');
  await refreshBoard($('#done-board'));
  show('done');
  setTimeout(reset, 12000);
}

$('#lang').onclick = () => { st.lang = st.lang === 'en' ? 'ar' : 'en'; applyLang(); };
$('#go').onclick = () => show('identify');
document.querySelectorAll('[data-back]').forEach(b => { b.onclick = reset; });
$('[data-again]').onclick = () => { renderModules(); show('modules'); };
document.querySelectorAll('[data-finish]').forEach(b => { b.onclick = finish; });

$('#f-identify').onsubmit = async e => {
  e.preventDefault();
  if (st.busy) return;
  const f = e.target;
  st.busy = true;
  try {
    st.visitor = await api('/api/visitors', { name: f.name.value, employeeNo: f.employeeNo.value, department: f.department.value, lang: st.lang });
    renderModules();
    show('modules');
  } catch (err) { $('#identify-err').textContent = errText(err); }
  finally { st.busy = false; }
};

// Arcade: keys 1-4 pick drills; any key or button hits the reaction pad.
document.addEventListener('keydown', e => {
  bumpIdle();
  if (e.target.tagName === 'INPUT') return;
  if (st.screen === 'reaction') return st.rxHit?.();
  const n = Number(e.key);
  if (st.screen === 'attract' && (e.key === 'Enter' || n)) return show('identify');
  if (st.screen === 'modules' && n >= 1) document.querySelectorAll('#modules button')[n - 1]?.click();
});
['pointerdown', 'input'].forEach(ev => document.addEventListener(ev, bumpIdle));
document.addEventListener('contextmenu', e => e.preventDefault());

applyLang();
reset();
setInterval(() => { if (st.screen === 'attract') refreshBoard($('#mini-board')); }, 10000);
