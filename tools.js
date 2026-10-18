'use strict';
// Practice tools: meditation timer, evening sleep practice, journal, flashcards, notes, charts.
// Uses globals from app.js (state, esc, linkify, refLinks, bookTag, starBtn, plural, storeGet, storeSet, termKey, cut).

const Tools = { views: {}, after: {} };

// ---------- notes ----------
function getNotes() { return storeGet('notes', {}); }
function noteBox(id) {
  const text = getNotes()[id] || '';
  return `<details class="note"${text ? ' open' : ''}>
    <summary>✎ Моя заметка${text ? '' : ' <span class="muted">(добавить)</span>'}</summary>
    <textarea data-note="${esc(id)}" rows="4" placeholder="Ваши мысли, вопросы, опыт практики…">${esc(text)}</textarea>
    <span class="muted small" data-note-status="${esc(id)}">Сохраняется автоматически на этом устройстве.</span>
  </details>`;
}
let noteTimer;
document.addEventListener('input', e => {
  const ta = e.target.closest('[data-note]');
  if (!ta) return;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    const notes = getNotes();
    const v = ta.value.trim();
    if (v) notes[ta.dataset.note] = v; else delete notes[ta.dataset.note];
    storeSet('notes', notes);
    const st = document.querySelector(`[data-note-status="${CSS.escape(ta.dataset.note)}"]`);
    if (st) st.textContent = 'Сохранено ✓';
  }, 400);
});
function noteTarget(id) {
  // id formats: t:<key>, p:<book>:<idx>
  if (id.startsWith('t:')) {
    const g = state.glossaryByKey[id.slice(2)];
    return g && { title: g.name, href: `#/term/${encodeURIComponent(g.key)}`, kind: 'Термин' };
  }
  if (id.startsWith('p:')) {
    const x = state.practices.find(p => p.id === id);
    return x && { title: x.p.name, href: `#/practice/${x.book}/${x.idx}`, kind: 'Практика' };
  }
  return null;
}
function notesList() {
  const notes = getNotes();
  const items = Object.entries(notes).map(([id, text]) => ({ id, text, t: noteTarget(id) })).filter(x => x.t);
  if (!items.length) return '';
  return `<h2>Мои заметки</h2>` + items.map(x => `<div class="card">
    <span class="book-tag">${x.t.kind}</span>
    <h3><a href="${x.t.href}">${esc(x.t.title)}</a></h3>
    <p class="pre">${esc(x.text)}</p></div>`).join('');
}

// ---------- sound: synthesized singing bowl ----------
let audioCtx;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function bowl(when = 0, gain = 0.5) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const master = ctx.createGain();
  master.gain.value = gain;
  master.connect(ctx.destination);
  // partials of a Tibetan bowl with slight detune for the characteristic beating
  const base = 196;
  [[1, 1, 9], [1.004, 0.6, 8], [2.71, 0.45, 6], [2.715, 0.3, 6], [5.13, 0.18, 3.5], [8.3, 0.08, 2]].forEach(([r, a, dur]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = base * r;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(a, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.1);
  });
}
function bowls(n) { for (let i = 0; i < n; i++) bowl(i * 3.2); }

// ---------- timer ----------
const TIMER_KINDS = ['Шинэ', 'Девять очистительных дыханий', 'Цалунг', 'Созерцание', 'Гуру-йога', 'Другое'];
const timer = {
  total: 0, endAt: 0, remainingPaused: 0, running: false, paused: false,
  interval: 0, nextBell: 0, prepUntil: 0, tick: null, wake: null, kind: 'Шинэ',
};
function tset() { return storeGet('timer', { min: 15, interval: 0, prep: 10, kind: 'Шинэ' }); }
function fmt(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
Tools.views.timer = () => {
  const s = tset();
  const mins = [5, 10, 15, 20, 30, 45, 60];
  const C = 2 * Math.PI * 90;
  return `<a class="back" href="#/tools">‹ Практикум</a>
    <h1>Таймер медитации</h1>
    <div class="timer-face">
      <svg viewBox="0 0 200 200" class="ring">
        <circle cx="100" cy="100" r="90" class="ring-bg"/>
        <circle cx="100" cy="100" r="90" class="ring-fg" id="ring" stroke-dasharray="${C}" stroke-dashoffset="0"/>
      </svg>
      <div class="timer-center">
        <div class="timer-time" id="ttime">${fmt(s.min * 60)}</div>
        <div class="timer-sub" id="tsub">${esc(s.kind)}</div>
      </div>
    </div>
    <div class="timer-btns">
      <button class="btn big primary" id="tstart">Начать</button>
      <button class="btn big" id="tpause" hidden>Пауза</button>
      <button class="btn big" id="tstop" hidden>Завершить</button>
    </div>
    <div id="tsettings">
      <h3>Практика</h3>
      <div class="chips wrap">${TIMER_KINDS.map(k => `<button class="chip${k === s.kind ? ' on' : ''}" data-tkind="${esc(k)}">${esc(k)}</button>`).join('')}</div>
      <h3>Длительность</h3>
      <div class="chips wrap">${mins.map(m => `<button class="chip${m === s.min ? ' on' : ''}" data-tmin="${m}">${m} мин</button>`).join('')}
        <span class="stepper"><button class="chip" data-tstep="-1">−</button><b id="tmin">${s.min}</b><button class="chip" data-tstep="1">+</button></span></div>
      <h3>Промежуточный удар чаши</h3>
      <div class="chips wrap">${[[0, 'нет'], [5, 'каждые 5 мин'], [10, 'каждые 10 мин'], [15, 'каждые 15 мин']].map(([v, l]) => `<button class="chip${v === s.interval ? ' on' : ''}" data-tint="${v}">${l}</button>`).join('')}</div>
      <h3>Время, чтобы сесть</h3>
      <div class="chips wrap">${[[0, 'сразу'], [10, '10 сек'], [30, '30 сек']].map(([v, l]) => `<button class="chip${v === s.prep ? ' on' : ''}" data-tprep="${v}">${l}</button>`).join('')}</div>
      <p class="row-btns"><button class="btn" data-ttest>♪ Послушать чашу</button></p>
      <p class="muted small">Чаша звучит три раза в начале и в конце. Пока идёт таймер, экран не гаснет (если телефон это поддерживает). Завершённые сессии попадают в дневник.</p>
    </div>`;
};
function saveT(patch) { storeSet('timer', { ...tset(), ...patch }); }
function timerRender() {
  const t = document.getElementById('ttime');
  if (!t) return;
  const now = Date.now();
  const ring = document.getElementById('ring');
  const C = 2 * Math.PI * 90;
  if (timer.prepUntil > now) {
    t.textContent = fmt((timer.prepUntil - now) / 1000);
    document.getElementById('tsub').textContent = 'Устройтесь удобно…';
    ring.style.strokeDashoffset = 0;
    return;
  }
  const left = timer.paused ? timer.remainingPaused : (timer.endAt - now) / 1000;
  t.textContent = fmt(left);
  document.getElementById('tsub').textContent = timer.paused ? 'Пауза' : timer.kind;
  ring.style.strokeDashoffset = C * (1 - left / timer.total);
}
function timerLoop() {
  const now = Date.now();
  if (timer.prepUntil && now >= timer.prepUntil) {
    timer.prepUntil = 0;
    timer.endAt = now + timer.total * 1000;
    timer.nextBell = timer.interval ? now + timer.interval * 1000 : 0;
    bowls(3);
  }
  if (!timer.prepUntil && !timer.paused) {
    if (timer.nextBell && now >= timer.nextBell && now < timer.endAt - 2000) {
      bowl(0, 0.35);
      timer.nextBell += timer.interval * 1000;
    }
    if (now >= timer.endAt) {
      timerFinish(true);
      return;
    }
  }
  timerRender();
}
async function wakeLock(on) {
  try {
    if (on && 'wakeLock' in navigator) timer.wake = await navigator.wakeLock.request('screen');
    else if (!on && timer.wake) { await timer.wake.release(); timer.wake = null; }
  } catch { /* not supported */ }
}
function timerUI() {
  const r = timer.running;
  const $ = id => document.getElementById(id);
  if (!$('tstart')) return;
  $('tstart').hidden = r;
  $('tpause').hidden = !r;
  $('tstop').hidden = !r;
  $('tpause').textContent = timer.paused ? 'Продолжить' : 'Пауза';
  $('tsettings').hidden = r;
}
function timerStart() {
  const s = tset();
  ensureAudio();
  Object.assign(timer, { total: s.min * 60, interval: s.interval * 60, running: true, paused: false, kind: s.kind });
  const now = Date.now();
  if (s.prep) {
    timer.prepUntil = now + s.prep * 1000;
  } else {
    timer.prepUntil = 0;
    timer.endAt = now + timer.total * 1000;
    timer.nextBell = timer.interval ? now + timer.interval * 1000 : 0;
    bowls(3);
  }
  clearInterval(timer.tick);
  timer.tick = setInterval(timerLoop, 250);
  wakeLock(true);
  timerUI(); timerRender();
}
function timerFinish(completed) {
  clearInterval(timer.tick);
  const done = completed ? timer.total : timer.total - Math.max(0, (timer.paused ? timer.remainingPaused : (timer.endAt - Date.now()) / 1000));
  const minutes = Math.round(done / 60);
  if (completed) bowls(3);
  if (!timer.prepUntil && minutes >= 1) {
    addEntry({ type: 'practice', practice: timer.kind, minutes, text: '' });
  }
  Object.assign(timer, { running: false, paused: false, prepUntil: 0 });
  wakeLock(false);
  timerUI();
  const t = document.getElementById('ttime');
  if (t) {
    t.textContent = completed ? 'Готово' : fmt(tset().min * 60);
    document.getElementById('tsub').textContent = minutes >= 1 ? `${minutes} мин записано в дневник` : timer.kind;
    document.getElementById('ring').style.strokeDashoffset = 0;
  }
}
Tools.after.timer = () => { timerUI(); if (timer.running) timerRender(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden && timer.running) wakeLock(true); });
document.addEventListener('click', e => {
  const el = e.target.closest('[data-tkind],[data-tmin],[data-tstep],[data-tint],[data-tprep],[data-ttest],#tstart,#tpause,#tstop');
  if (!el) return;
  if (el.id === 'tstart') return timerStart();
  if (el.id === 'tstop') return timerFinish(false);
  if (el.id === 'tpause') {
    if (timer.paused) { timer.endAt = Date.now() + timer.remainingPaused * 1000; timer.paused = false; if (timer.interval) timer.nextBell = Date.now() + timer.interval * 1000; }
    else { timer.remainingPaused = (timer.endAt - Date.now()) / 1000; timer.paused = true; }
    timerUI(); timerRender();
    return;
  }
  if (el.dataset.ttest !== undefined) return bowl();
  if (el.dataset.tkind) saveT({ kind: el.dataset.tkind });
  if (el.dataset.tmin) saveT({ min: +el.dataset.tmin });
  if (el.dataset.tstep) saveT({ min: Math.min(180, Math.max(1, tset().min + +el.dataset.tstep)) });
  if (el.dataset.tint) saveT({ interval: +el.dataset.tint });
  if (el.dataset.tprep) saveT({ prep: +el.dataset.tprep });
  route();
});

// ---------- evening sleep practice ----------
// Night sequence from «Тибетская йога сна и сновидений», part 3 (practice indices in that book's data).
const NIGHT = [
  { label: 'Перед сном', idx: 7 },
  { label: 'Перед сном', idx: 8 },
  { label: 'Перед сном', idx: 9 },
  { label: 'Первая смена ночи', idx: 10 },
  { label: 'Вторая смена ночи', idx: 11 },
  { label: 'Третья смена ночи', idx: 12 },
  { label: 'Четвёртая смена ночи', idx: 13 },
];
const DAY_PREP = [3, 4, 5, 6];
function nightPractice(i) { return state.practices.find(p => p.book === 'son' && p.idx === i); }
Tools.views.night = parts => {
  const step = parts[1] === undefined ? -1 : +parts[1];
  if (step < 0 || !NIGHT[step]) {
    return `<a class="back" href="#/tools">‹ Практикум</a>
      <div class="night-hero"><span class="moon">☾</span><h1>Вечерняя практика сна</h1>
      <p>Последовательность из книги «Тибетская йога сна и сновидений»: подготовка перед сном и четыре смены ночи. Каждый шаг на отдельном экране, крупным шрифтом.</p>
      <a class="btn big primary" href="#/night/0">Начать</a></div>
      <h2>Порядок</h2>
      <ul class="list">${NIGHT.map((n, i) => { const x = nightPractice(n.idx); return x ? `<li><a href="#/night/${i}"><span class="main">${esc(x.p.name)}<span class="sub">${esc(n.label)}</span></span>${ICON_CHEV}</a></li>` : ''; }).join('')}</ul>
      <h2>Днём</h2>
      <p class="lead">Четыре подготовительные практики, которые книга советует выполнять в течение дня.</p>
      <ul class="list">${DAY_PREP.map(i => { const x = nightPractice(i); return x ? `<li><a href="#/practice/son/${i}"><span class="main">${esc(x.p.name)}</span>${ICON_CHEV}</a></li>` : ''; }).join('')}</ul>
      <p class="row-btns"><a class="btn" href="#/journal/new/dream">☾ Утром: записать сон</a></p>`;
  }
  const n = NIGHT[step];
  const x = nightPractice(n.idx);
  if (!x) return notFound();
  const p = x.p;
  return `<div class="night">
    <div class="night-top"><a href="#/night">✕</a><span>${step + 1} из ${NIGHT.length}</span></div>
    <div class="night-dots">${NIGHT.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('')}</div>
    <div class="night-label">${esc(n.label)}</div>
    <h1>${esc(p.name)}</h1>
    <p class="purpose">${esc(p.purpose)}</p>
    ${p.steps && p.steps.length ? `<ol class="steps b-son">${p.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    ${p.notes ? `<div class="callout">${esc(p.notes)}</div>` : ''}
    ${refLinks('son', p.chapters, true)}
    <div class="pager">
      ${step > 0 ? `<a href="#/night/${step - 1}"><small>‹ Назад</small>${esc(nightPractice(NIGHT[step - 1].idx).p.name)}</a>` : '<span></span>'}
      ${step < NIGHT.length - 1 ? `<a class="next" href="#/night/${step + 1}"><small>Далее ›</small>${esc(nightPractice(NIGHT[step + 1].idx).p.name)}</a>`
        : `<a class="next" href="#/journal/new/dream"><small>Утром ›</small>Записать сон</a>`}
    </div>
  </div>`;
};

// ---------- journal ----------
const DREAM_KINDS = ['', 'Самсарный сон', 'Сон ясности', 'Сон ясного света'];
function entries() { return storeGet('journal', []); }
function saveEntries(list) { storeSet('journal', list); }
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addEntry(e) {
  const list = entries();
  list.unshift({ id: Date.now().toString(36), date: today(), ...e });
  saveEntries(list);
}
function fmtDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
function journalStats(list) {
  const dreams = list.filter(e => e.type === 'dream');
  const lucid = dreams.filter(e => e.lucid).length;
  const minutes = list.filter(e => e.type === 'practice').reduce((s, e) => s + (+e.minutes || 0), 0);
  const days = new Set(list.map(e => e.date));
  let streak = 0;
  const d = new Date();
  for (;;) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (days.has(k)) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  return { dreams: dreams.length, lucid, minutes, streak };
}
Tools.views.journal = parts => {
  if (parts[1] === 'new' || parts[1] === 'edit') return journalForm(parts);
  const f = parts[1] || 'all';
  const list = entries();
  const st = journalStats(list);
  const shown = list.filter(e => f === 'all' || e.type === f || (f === 'lucid' && e.lucid));
  const byDate = new Map();
  for (const e of shown) { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); }
  return `<a class="back" href="#/tools">‹ Практикум</a>
    <h1>Дневник</h1>
    <div class="stats">
      <a href="#/journal/dream"><b>${st.dreams}</b><span>снов</span></a>
      <a href="#/journal/lucid"><b>${st.lucid}</b><span>осознанных</span></a>
      <a href="#/journal/practice"><b>${st.minutes >= 600 ? Math.round(st.minutes / 60) + ' ч' : st.minutes}</b><span>${st.minutes >= 600 ? 'практики' : 'мин практики'}</span></a>
      <a href="#/journal"><b>${st.streak}</b><span>${plural(st.streak, 'день', 'дня', 'дней')} подряд</span></a>
    </div>
    <div class="row-btns">
      <a class="btn primary" href="#/journal/new/dream">☾ Записать сон</a>
      <a class="btn primary" href="#/journal/new/practice">◎ Записать практику</a>
    </div>
    <div class="chips" style="margin-top:14px">${[['all', 'Все'], ['dream', 'Сны'], ['lucid', 'Осознанные'], ['practice', 'Практика']].map(([k, l]) =>
      `<a class="chip${f === k ? ' on' : ''}" href="#/journal${k === 'all' ? '' : '/' + k}">${l}</a>`).join('')}</div>
    ${shown.length ? [...byDate].map(([d, es]) => `<div class="letter-head">${esc(fmtDate(d))}</div>` + es.map(e => `
      <div class="card entry ${e.type}">
        <div class="head-row"><span class="book-tag">${e.type === 'dream' ? '☾ Сон' + (e.lucid ? ' · осознанный' : '') + (e.kind ? ' · ' + esc(e.kind) : '') : '◎ ' + esc(e.practice || 'Практика') + (e.minutes ? ` · ${e.minutes} мин` : '')}</span>
        <a class="small" href="#/journal/edit/${e.id}">изменить</a></div>
        ${e.title ? `<h3>${esc(e.title)}</h3>` : ''}
        ${e.text ? `<p class="pre">${esc(e.text)}</p>` : ''}
      </div>`).join('')).join('') : '<p class="empty">Записей пока нет.</p>'}
    <h2>Сохранность</h2>
    <p class="muted small">Записи хранятся только на этом устройстве. Время от времени сохраняйте копию файлом: при очистке браузера записи могут пропасть.</p>
    <div class="row-btns">
      <button class="btn" data-jexport="txt">Скачать текстом</button>
      <button class="btn" data-jexport="json">Скачать копию (для восстановления)</button>
      <label class="btn">Восстановить из копии<input type="file" accept=".json,application/json" data-jimport hidden></label>
    </div>`;
};
function journalForm(parts) {
  const editing = parts[1] === 'edit' ? entries().find(e => e.id === parts[2]) : null;
  const type = editing ? editing.type : (parts[2] === 'practice' ? 'practice' : 'dream');
  const e = editing || { date: today(), type, lucid: false, kind: '', text: '', title: '', practice: tset().kind, minutes: '' };
  return `<a class="back" href="#/journal">‹ Дневник</a>
    <h1>${editing ? 'Изменить запись' : type === 'dream' ? 'Записать сон' : 'Записать практику'}</h1>
    <form class="jform" data-jform="${editing ? esc(editing.id) : ''}" data-type="${type}">
      <label>Дата<input type="date" name="date" value="${esc(e.date)}" required></label>
      ${type === 'dream' ? `
        <label>Название<input name="title" value="${esc(e.title || '')}" placeholder="Коротко, о чём сон"></label>
        <label class="check"><input type="checkbox" name="lucid"${e.lucid ? ' checked' : ''}> Осознанный сон (я понял, что сплю)</label>
        <label>Вид сна (по книге)<select name="kind">${DREAM_KINDS.map(k => `<option${k === e.kind ? ' selected' : ''} value="${esc(k)}">${k || 'не знаю'}</option>`).join('')}</select></label>
        <a class="small" href="#/book/son/c6">Что такое три вида снов?</a>
        <label>Сон<textarea name="text" rows="8" placeholder="Что снилось, какие чувства, образы, знаки…">${esc(e.text)}</textarea></label>`
      : `
        <label>Практика<input name="practice" list="plist" value="${esc(e.practice || '')}"></label>
        <datalist id="plist">${[...new Set([...TIMER_KINDS, ...state.practices.map(x => x.p.name)])].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <label>Минут<input type="number" name="minutes" min="0" max="600" value="${esc(e.minutes)}"></label>
        <label>Заметки<textarea name="text" rows="6" placeholder="Что заметили, что получалось, что мешало…">${esc(e.text)}</textarea></label>`}
      <div class="row-btns">
        <button class="btn primary big" type="submit">Сохранить</button>
        ${editing ? '<button class="btn" type="button" data-jdelete>Удалить</button>' : ''}
      </div>
    </form>`;
}
document.addEventListener('submit', ev => {
  const form = ev.target.closest('[data-jform]');
  if (!form) return;
  ev.preventDefault();
  const fd = new FormData(form);
  const rec = { date: fd.get('date') || today(), type: form.dataset.type, text: (fd.get('text') || '').trim() };
  if (rec.type === 'dream') Object.assign(rec, { title: (fd.get('title') || '').trim(), lucid: !!fd.get('lucid'), kind: fd.get('kind') || '' });
  else Object.assign(rec, { practice: (fd.get('practice') || '').trim(), minutes: +fd.get('minutes') || 0 });
  const list = entries();
  const id = form.dataset.jform;
  if (id) {
    const i = list.findIndex(e => e.id === id);
    if (i >= 0) list[i] = { ...list[i], ...rec };
  } else list.unshift({ id: Date.now().toString(36), ...rec });
  list.sort((a, b) => b.date.localeCompare(a.date));
  saveEntries(list);
  location.hash = '#/journal';
});
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
document.addEventListener('click', ev => {
  const del = ev.target.closest('[data-jdelete]');
  if (del) {
    const id = del.closest('[data-jform]').dataset.jform;
    if (confirm('Удалить запись?')) { saveEntries(entries().filter(e => e.id !== id)); location.hash = '#/journal'; }
    return;
  }
  const ex = ev.target.closest('[data-jexport]');
  if (ex) {
    const list = entries();
    if (ex.dataset.jexport === 'json') {
      download(`dnevnik-${today()}.json`, JSON.stringify({ journal: list, notes: getNotes(), saved: [...state.saved], cards: storeGet('cards', {}) }, null, 1), 'application/json');
    } else {
      const txt = list.map(e => `${fmtDate(e.date)}\n${e.type === 'dream' ? 'Сон' + (e.lucid ? ' (осознанный)' : '') + (e.kind ? ', ' + e.kind : '') + (e.title ? ': ' + e.title : '') : 'Практика: ' + (e.practice || '') + (e.minutes ? ', ' + e.minutes + ' мин' : '')}\n${e.text || ''}\n`).join('\n');
      download(`dnevnik-${today()}.txt`, txt, 'text/plain;charset=utf-8');
    }
  }
});
document.addEventListener('change', async ev => {
  const inp = ev.target.closest('[data-jimport]');
  if (!inp || !inp.files[0]) return;
  try {
    const data = JSON.parse(await inp.files[0].text());
    const cur = entries();
    const ids = new Set(cur.map(e => e.id));
    const merged = [...cur, ...(data.journal || []).filter(e => !ids.has(e.id))].sort((a, b) => b.date.localeCompare(a.date));
    saveEntries(merged);
    if (data.notes) storeSet('notes', { ...data.notes, ...getNotes() });
    if (data.saved) { data.saved.forEach(s => state.saved.add(s)); storeSet('saved', [...state.saved]); }
    if (data.cards) storeSet('cards', { ...data.cards, ...storeGet('cards', {}) });
    alert(`Восстановлено. Записей в дневнике: ${merged.length}.`);
    route();
  } catch {
    alert('Не удалось прочитать файл. Выберите файл копии .json, скачанный из дневника.');
  }
});

// ---------- flashcards (Leitner boxes) ----------
const BOX_DAYS = [0, 1, 3, 7, 16, 35];
const DAY = 86400000;
const deck = { queue: [], pos: 0, shown: false, right: 0, wrong: 0 };
function cardsState() { return storeGet('cards', {}); }
function cardsPool() {
  return state.glossary.filter(g => g.entries.some(e => inFilter(e.book)));
}
function cardsStart() {
  const cs = cardsState();
  const now = Date.now();
  const pool = cardsPool();
  const due = pool.filter(g => cs[g.key] && cs[g.key].due <= now);
  const fresh = pool.filter(g => !cs[g.key]).sort(() => Math.random() - 0.5);
  deck.queue = [...due.sort(() => Math.random() - 0.5), ...fresh].slice(0, 15).map(g => g.key);
  Object.assign(deck, { pos: 0, shown: false, right: 0, wrong: 0 });
}
Tools.views.cards = parts => {
  const cs = cardsState();
  const pool = cardsPool();
  const learned = pool.filter(g => cs[g.key] && cs[g.key].box >= 3).length;
  const inProgress = pool.filter(g => cs[g.key] && cs[g.key].box < 3).length;
  const due = pool.filter(g => cs[g.key] && cs[g.key].due <= Date.now()).length;
  if (parts[1] !== 'go') {
    return `<a class="back" href="#/tools">‹ Практикум</a>
      <h1>Карточки</h1>
      <p class="lead">Вы видите термин, вспоминаете его смысл и открываете ответ. Что помните, повторяется реже, что забыли, чаще.</p>
      ${bookChips()}
      <div class="stats three">
        <span><b>${learned}</b><span>выучено</span></span>
        <span><b>${inProgress}</b><span>в работе</span></span>
        <span><b>${pool.length - learned - inProgress}</b><span>новых</span></span>
      </div>
      <p class="row-btns"><a class="btn big primary" href="#/cards/go" data-cstart>Начать${due ? ` (повторить: ${due})` : ''}</a></p>
      ${Object.keys(cs).length ? '<p><button class="btn" data-creset>Начать заново</button></p>' : ''}`;
  }
  if (!deck.queue.length) cardsStart();
  if (deck.pos >= deck.queue.length) {
    const r = `<div class="card center"><h2>Готово!</h2><p>Помню: ${deck.right} · Повторить: ${deck.wrong}</p>
      <p class="row-btns" style="justify-content:center"><a class="btn primary" href="#/cards/go" data-cstart>Ещё 15</a><a class="btn" href="#/cards">К карточкам</a></p></div>`;
    deck.queue = [];
    return `<a class="back" href="#/cards">‹ Карточки</a>${r}`;
  }
  const g = state.glossaryByKey[deck.queue[deck.pos]];
  const e = g.entries.find(x => inFilter(x.book)) || g.entries[0];
  return `<a class="back" href="#/cards">‹ Карточки</a>
    <div class="fc-progress"><i style="width:${(deck.pos / deck.queue.length) * 100}%"></i></div>
    <div class="card flash b-${e.book}">
      <span class="muted small">${deck.pos + 1} из ${deck.queue.length}</span>
      <div class="fc-term">${esc(g.name)}</div>
      ${deck.shown ? `<div class="fc-answer"><p>${esc(e.term.definition)}</p>${bookTag(e.book)}</div>` : '<p class="muted">Вспомните, что это значит…</p>'}
    </div>
    <div class="row-btns center">
      ${deck.shown
        ? '<button class="btn big" data-cans="0">Не помню</button><button class="btn big primary" data-cans="1">Помню</button>'
        : '<button class="btn big primary" data-cshow>Показать ответ</button>'}
    </div>
    ${deck.shown ? `<p class="center small"><a href="#/term/${encodeURIComponent(g.key)}">Открыть статью</a></p>` : ''}`;
};
document.addEventListener('click', ev => {
  if (ev.target.closest('[data-cstart]')) { cardsStart(); if (location.hash === '#/cards/go') { ev.preventDefault(); route(); } return; }
  if (ev.target.closest('[data-cshow]')) { deck.shown = true; route(); return; }
  if (ev.target.closest('[data-creset]')) { if (confirm('Сбросить прогресс карточек?')) { storeSet('cards', {}); route(); } return; }
  const a = ev.target.closest('[data-cans]');
  if (a) {
    const key = deck.queue[deck.pos];
    const cs = cardsState();
    const cur = cs[key] || { box: 0 };
    const box = a.dataset.cans === '1' ? Math.min(cur.box + 1, BOX_DAYS.length - 1) : 0;
    cs[key] = { box, due: Date.now() + BOX_DAYS[box] * DAY };
    storeSet('cards', cs);
    if (a.dataset.cans === '1') deck.right++; else deck.wrong++;
    deck.pos++; deck.shown = false;
    route();
  }
});

// ---------- charts ----------
let charts = null;
async function loadCharts() {
  if (charts) return charts;
  try { charts = await (await fetch('data/charts.json')).json(); } catch { charts = {}; }
  return charts;
}
const CHART_META = {
  elements: { title: 'Пять элементов', cols: [['element', 'Элемент'], ['color', 'Цвет'], ['syllable', 'Слог'], ['chakra', 'Чакра'], ['emotion', 'Эмоция'], ['wisdom', 'Мудрость'], ['other', 'Ещё']] },
  lights: { title: 'Пять чистых светов', cols: [['light', 'Свет'], ['element', 'Элемент'], ['wisdom', 'Мудрость'], ['emotion', 'Эмоция']] },
  channels: { title: 'Три канала', cols: [['name', 'Канал'], ['color', 'Цвет'], ['position', 'Где проходит'], ['quality', 'Связан с'], ['notes', 'Примечание']] },
  chakras: { title: 'Чакры', cols: [['name', 'Чакра'], ['location', 'Где'], ['color', 'Цвет'], ['syllable', 'Слог'], ['element_or_quality', 'Элемент, качество'], ['notes', 'Примечание']] },
  winds: { title: 'Пять ветров (пран)', cols: [['name', 'Ветер'], ['location', 'Где'], ['function', 'Функция'], ['element', 'Элемент'], ['notes', 'Примечание']] },
  lokas: { title: 'Шесть миров (лок)', cols: [['realm', 'Мир'], ['emotion', 'Эмоция'], ['chakra', 'Чакра'], ['syllable', 'Слог'], ['color', 'Цвет'], ['antidote', 'Противоядие']] },
  night: { title: 'Четыре смены ночи', cols: [['session', 'Смена'], ['chakra', 'Чакра'], ['visualization', 'Визуализация'], ['quality', 'Что развивается']] },
};
const COLOR_WORDS = [['бел', '#f4f1e8'], ['зел', '#3fa66b'], ['красн', '#d64545'], ['син', '#3a6fd0'], ['голуб', '#5aa6e0'], ['желт', '#f2c94c'], ['жёлт', '#f2c94c'], ['оранж', '#ef8a34'], ['черн', '#222'], ['чёрн', '#222'], ['дымч', '#8a8a8a'], ['прозрачн', '#e8eef5']];
function swatch(text) {
  const t = (text || '').toLowerCase();
  const hit = COLOR_WORDS.filter(([w]) => t.includes(w)).slice(0, 2);
  return hit.map(([, c]) => `<i class="sw" style="background:${c}"></i>`).join('');
}
function rowCard(key, r, cols) {
  const swatchHead = ['elements', 'lights', 'channels', 'chakras'].includes(key);
  return `<div class="card row-card">
      <h3>${swatchHead ? swatch(r.color || r.light) : ''}${esc(r[cols[0][0]])}</h3>
      <dl>${cols.slice(1).filter(([k]) => r[k]).map(([k, l]) => `<dt>${l}</dt><dd>${esc(r[k])}</dd>`).join('')}</dl>
    </div>`;
}
function chartTable(key, sec) {
  const meta = CHART_META[key];
  if (!sec || !sec.rows || !sec.rows.length) return '';
  const cols = meta.cols.filter(([k]) => sec.rows.some(r => r[k]));
  const books = [...new Set(sec.rows.map(r => r.book || ''))];
  const single = books.length === 1;
  const body = single
    ? `<div class="rows">${sec.rows.map(r => rowCard(key, r, cols)).join('')}</div>`
    : books.map((bk, i) => {
      const rows = sec.rows.filter(r => (r.book || '') === bk);
      const title = bk.split(',').map(x => BOOK_SHORT[x.trim()] || x).join(', ');
      return `<details class="group b-${esc(bk)}"${i === 0 ? ' open' : ''}><summary>${esc(title)}<span class="count">${rows.length}</span></summary>
        <div class="rows group-body">${rows.map(r => rowCard(key, r, cols)).join('')}</div></details>`;
    }).join('');
  return `<section class="chart" id="ch-${key}">
    <h2>${meta.title}</h2>
    ${sec.note ? `<p class="lead">${esc(sec.note)}</p>` : ''}
    ${!single ? '<p class="muted small">Книги описывают это по-разному, поэтому версии показаны отдельно по книгам.</p>' : single && books[0] ? `<p>${books[0].split(',').map(x => bookTag(x.trim())).join(' ')}</p>` : ''}
    ${body}
    ${(sec.refs || []).length ? `<div class="refs"><span class="refs-label">Источники:</span>${sec.refs.map(rf => `<a class="ref b-${rf.book}" href="#/book/${rf.book}/${rf.chapter}">${esc(BOOK_SHORT[rf.book] || rf.book)} · ${esc(chapterTitle(rf.book, rf.chapter))}</a>`).join('')}</div>` : ''}
  </section>`;
}
function bodyFigure() {
  // schematic of the three channels; colours as in «Исцеление формой, энергией и светом», гл. 2–3,
  // syllables on the chakras as in «Тибетская йога тела, речи и ума», гл. 7
  const ys = [22, 92, 142, 196, 244];
  return `<figure class="body-fig">
    <div class="body-stage"><div class="body-inner">
      <svg viewBox="0 0 220 320" role="img" aria-label="Схема трёх каналов и пяти чакр со слогами">
        <ellipse cx="110" cy="48" rx="30" ry="34" class="silh"/>
        <path d="M96 80 L124 80 Q168 92 168 150 L160 240 Q150 300 110 306 Q70 300 60 240 L52 150 Q52 92 96 80 Z" class="silh"/>
        <line x1="110" y1="18" x2="110" y2="252" stroke="#3a6fd0" stroke-width="7" stroke-linecap="round" opacity=".85"/>
        <path d="M102 62 C94 50 94 34 101 28 M101 28 C95 60 97 80 97 110 L97 236 Q100 248 110 252" stroke="#f4f1e8" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>
        <path d="M118 62 C126 50 126 34 119 28 M119 28 C125 60 123 80 123 110 L123 236 Q120 248 110 252" stroke="#d64545" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9"/>
        <text x="76" y="290" class="lbl" text-anchor="end">правый</text><text x="144" y="290" class="lbl">левый</text>
      </svg>
      ${SYLLABLES.map((sy, i) => `<span class="glyph-box on-body" style="top:${(ys[i] / 320) * 100}%">${glyph(sy, 30)}</span>`).join('')}
      ${SYLLABLES.map((sy, i) => `<span class="body-tag" style="top:${(ys[i] / 320) * 100}%">${esc(sy.chakra)}</span>`).join('')}
    </div></div>
    <figcaption class="muted small">Синий центральный канал, белый правый и красный левый (вид спереди, у мужчин; у женщин, по «Исцелению» и «Йоге сна», цвета боковых каналов меняются местами). На чакрах пять слогов из «Тибетской йоги тела, речи и ума». <a href="#/syllables">О пяти слогах</a></figcaption>
  </figure>`;
}
Tools.views.charts = () => `<a class="back" href="#/tools">‹ Практикум</a><h1>Схемы и таблицы</h1><div id="charts-body"><p class="muted">Загрузка…</p></div>`;
Tools.after.charts = async () => {
  const c = await loadCharts();
  const el = document.getElementById('charts-body');
  if (!el) return;
  const keys = Object.keys(CHART_META).filter(k => c[k] && c[k].rows && c[k].rows.length);
  el.innerHTML = `<div class="chips wrap">${keys.map(k => `<a class="chip" href="#" data-jump="ch-${k}">${CHART_META[k].title}</a>`).join('')}</div>
    ${c.channels && c.channels.rows.length ? bodyFigure() : ''}
    ${keys.map(k => chartTable(k, c[k])).join('')}
    ${keys.length ? '' : '<p class="empty">Схемы пока не готовы.</p>'}`;
  centerGlyphs();
};

// ---------- hub ----------
Tools.views.tools = () => {
  const st = journalStats(entries());
  return `<h1>Практикум</h1>
  <p class="lead">Для ежедневной практики. Всё, что вы записываете, хранится только на этом устройстве.</p>
  <div class="tools-grid">
    <a class="tool" href="#/timer"><span class="ico">◎</span><b>Таймер медитации</b><span>Тибетская чаша в начале и в конце</span></a>
    <a class="tool night-tool" href="#/night"><span class="ico">☾</span><b>Вечерняя практика сна</b><span>Пошагово, от подготовки до четырёх смен ночи</span></a>
    <a class="tool" href="#/journal"><span class="ico">✎</span><b>Дневник</b><span>${st.dreams} ${plural(st.dreams, 'сон', 'сна', 'снов')} · ${st.minutes} мин практики</span></a>
    <a class="tool" href="#/cards"><span class="ico">❖</span><b>Карточки</b><span>Запоминание терминов</span></a>
    <a class="tool" href="#/charts"><span class="ico">✦</span><b>Схемы и таблицы</b><span>Элементы, каналы, чакры, миры</span></a>
    <a class="tool syl-tool" href="#/syllables"><span class="ico"><span class="tib" data-glyph style="--c:#7fb0ff;--c2:#2449a8;font-size:22px">ཧཱུྃ</span></span><b>Пять слогов</b><span>А, ОМ, ХУНГ, РАМ, ДЗА</span></a>
    <a class="tool" href="#/quotes"><span class="ico">❝</span><b>Цитаты</b><span>Все цитаты из книг</span></a>
  </div>`;
};

// ---------- the five warrior syllables (glowing Tibetan letters) ----------
// Colours and chakras as in «Тибетская йога тела, речи и ума», ч. 2, гл. 7.
const SYLLABLES = [
  { id: 'a', tib: 'ཨ', ru: 'А', chakra: 'Макушка', light: 'белый', c: '#ffffff', c2: '#9fb6ff', scale: 1,
    quality: 'Пространство, неизменное тело, мудрость пустоты' },
  { id: 'om', tib: 'ཨོཾ', ru: 'ОМ', chakra: 'Горло', light: 'красный', c: '#ff7a6b', c2: '#c9302c', scale: 0.85,
    quality: 'Речь, спонтанное совершенство, сострадание, зеркальная мудрость' },
  { id: 'hung', tib: 'ཧཱུྃ', ru: 'ХУНГ', alt: ['ХУМ'], chakra: 'Сердце', light: 'синий', c: '#7fb0ff', c2: '#2449a8', scale: 0.74,
    quality: 'Ум, проявление качества, мудрость равностности' },
  { id: 'ram', tib: 'རཾ', ru: 'РАМ', chakra: 'Пупок', light: 'красный', c: '#ff9466', c2: '#c9302c', scale: 0.92,
    quality: 'Огонь, созревание качества, различающая мудрость' },
  { id: 'dza', tib: 'ཛ', ru: 'ДЗА', chakra: 'Тайная чакра', light: 'зелёный', c: '#8fe0a8', c2: '#23874b', scale: 1,
    quality: 'Действие, всесовершающая мудрость' },
];
function glyph(s, size) {
  return `<span class="tib" data-glyph style="--c:${s.c};--c2:${s.c2};font-size:${Math.round(size * s.scale)}px" aria-label="${esc(s.ru)}">${s.tib}</span>`;
}
// Tibetan letters hang from the top of the line box, so centre each glyph on its ink box.
let tibCtx;
function centerGlyphs() {
  const els = document.querySelectorAll('[data-glyph]:not([data-centered])');
  if (!els.length || !document.fonts) return;
  document.fonts.load('700 40px TibSyl', 'ཨ').then(() => {
    tibCtx = tibCtx || document.createElement('canvas').getContext('2d');
    els.forEach(el => {
      tibCtx.font = `700 ${getComputedStyle(el).fontSize} TibSyl`;
      const m = tibCtx.measureText(el.textContent);
      el.style.transform = `translateY(${(m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2}px)`;
      el.dataset.centered = '1';
    });
  }).catch(() => {});
}
// syllables mentioned in a practice: by name, or at least two of the five in its description
// syllables named in the title, or at least two of the five mentioned in the text
function findSyllables(name, text) {
  const has = (txt, s) => [s.ru, ...(s.alt || [])].some(w => new RegExp(`(^|[^А-ЯЁа-яё])${w}([^А-ЯЁа-яё]|$)`).test(txt));
  const inName = SYLLABLES.filter(s => has(name, s));
  if (inName.length) return inName;
  const found = SYLLABLES.filter(s => has(text, s));
  return found.length >= 2 ? found : [];
}
function practiceSyllables(p) {
  return findSyllables(p.name, [p.name, p.purpose, ...(p.steps || []), p.notes].filter(Boolean).join(' '));
}
function termSyllables(g) {
  return findSyllables(g.name, [g.name, ...g.alts, ...g.entries.map(e => e.term.definition)].join(' '));
}
function syllableStrip(p) {
  const list = p.entries ? termSyllables(p) : practiceSyllables(p);
  if (!list.length) return '';
  return `<a class="syl-strip" href="#/syllables">
    ${list.map(s => `<span class="syl-mini"><span class="glyph-box">${glyph(s, 44)}</span><small>${esc(s.ru)}</small></span>`).join('')}
  </a>`;
}
Tools.views.syllables = () => `<a class="back" href="#/tools">‹ Практикум</a>
  <div class="syl-page">
    <h1>Пять слогов</h1>
    <p class="lead">Пять нерушимых слогов-воинов, сущность пяти мудростей. Цвета и чакры по книге «Тибетская йога тела, речи и ума».</p>
    ${SYLLABLES.map(s => `<div class="syl-card">
      <span class="glyph-box big">${glyph(s, 64)}</span>
      <div><b>${esc(s.ru)}</b><div class="small">${esc(s.chakra)} · ${esc(s.light)} свет</div><div class="small muted2">${esc(s.quality)}</div></div>
    </div>`).join('')}
    ${refLinks('trum', ['c7', 'c8'], false)}
    <p class="row-btns"><a class="btn" href="#/practice/trum/9">Практика пяти слогов-воинов</a><a class="btn" href="#/charts">Схема с телом</a></p>
  </div>`;
