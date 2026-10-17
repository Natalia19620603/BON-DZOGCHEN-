'use strict';

const BOOK_SHORT = {
  chudesa: 'Чудеса естественного ума',
  son: 'Йога сна и сновидений',
  telo: 'Пробуждение священного тела',
  iscelenie: 'Исцеление формой, энергией и светом',
  trum: 'Йога тела, речи и ума',
};

const state = {
  books: [],
  bookById: {},
  glossary: [],      // merged terms: {key, name, alts, entries:[{book, term}]}
  glossaryByKey: {},
  practices: [],     // {id, book, p}
  ideas: [],         // {id, book, i}
  quotes: [],        // {id, book, q}
  filter: null,      // book id or null
  saved: loadSaved(),
};

const $view = document.getElementById('view');
const $q = document.getElementById('q');

// ---------- storage helpers ----------
function storeGet(k, d) {
  try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
}
function storeSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
}
function loadSaved() { return new Set(storeGet('saved', [])); }
function toggleSaved(id) {
  if (state.saved.has(id)) state.saved.delete(id); else state.saved.add(id);
  storeSet('saved', [...state.saved]);
}

// ---------- text helpers ----------
function norm(s) {
  return (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”()\[\]]/g, '').replace(/\s+/g, ' ').trim();
}
function termKey(name) {
  return norm(name.replace(/\(.*?\)/g, '')).replace(/[^a-zа-я0-9 \-']/g, '').trim();
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function hl(text, q) {
  const t = esc(text);
  if (!q) return t;
  const words = norm(q).split(' ').filter(w => w.length > 1);
  if (!words.length) return t;
  // highlight on a normalized copy, map positions back (lengths match: ё→е is 1:1)
  const lower = String(text).toLowerCase().replace(/ё/g, 'е');
  const marks = [];
  for (const w of words) {
    let i = 0;
    while ((i = lower.indexOf(w, i)) !== -1) { marks.push([i, i + w.length]); i += w.length; }
  }
  if (!marks.length) return t;
  marks.sort((a, b) => a[0] - b[0]);
  let out = '', pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    out += esc(text.slice(pos, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>';
    pos = e;
  }
  return out + esc(text.slice(pos));
}
function firstLetter(name) {
  const c = name.trim()[0] || '#';
  return c.toUpperCase().replace('Ё', 'Е');
}

// ---------- data ----------
async function load() {
  const res = await fetch('data/all.json');
  const data = await res.json();
  state.books = data.books;
  for (const b of data.books) {
    state.bookById[b.id] = b;
    b.chapterById = {};
    for (const c of b.chapters) b.chapterById[c.id] = c;

    for (const t of b.terms || []) {
      const key = termKey(t.term);
      let g = state.glossaryByKey[key];
      if (!g) {
        g = { key, name: t.term, alts: new Set(), entries: [] };
        state.glossaryByKey[key] = g;
        state.glossary.push(g);
      }
      (t.alt || []).forEach(a => g.alts.add(a));
      g.entries.push({ book: b.id, term: t });
    }
    (b.practices || []).forEach((p, i) => state.practices.push({ id: `p:${b.id}:${i}`, book: b.id, p }));
    (b.ideas || []).forEach((x, i) => state.ideas.push({ id: `i:${b.id}:${i}`, book: b.id, i: x }));
    (b.quotes || []).forEach((q, i) => state.quotes.push({ id: `q:${b.id}:${i}`, book: b.id, q }));
    (b.terms || []).forEach(t => {
      if (t.quote && t.quote.text) state.quotes.push({ id: `tq:${b.id}:${termKey(t.term)}`, book: b.id, q: { ...t.quote, topic: t.term } });
    });
  }
  // also link alt spellings to the same glossary entry
  for (const g of state.glossary) {
    for (const a of g.alts) {
      const k = termKey(a);
      if (k && !state.glossaryByKey[k]) state.glossaryByKey[k] = g;
    }
  }
  const coll = new Intl.Collator('ru');
  state.glossary.sort((a, b) => coll.compare(a.name, b.name));
  state.practices.sort((a, b) => coll.compare(a.p.name, b.p.name));
}

// ---------- shared bits ----------
function chapterTitle(bookId, cid) {
  const b = state.bookById[bookId];
  const c = b && b.chapterById[cid];
  return c ? c.title : '';
}
function refLinks(bookId, chapters) {
  const ids = (chapters || []).filter(c => state.bookById[bookId]?.chapterById[c]);
  if (!ids.length) return `<div class="refs"><a class="ref" href="#/book/${bookId}">${esc(BOOK_SHORT[bookId] || bookId)}</a></div>`;
  return '<div class="refs">' + ids.map(c =>
    `<a class="ref" href="#/book/${bookId}/${c}">${esc(BOOK_SHORT[bookId])} · ${esc(chapterTitle(bookId, c))}</a>`
  ).join('') + '</div>';
}
function quoteHtml(bookId, q, query) {
  return `<blockquote>${hl(q.text, query)}<footer>«${esc(BOOK_SHORT[bookId])}», ${esc(chapterTitle(bookId, q.chapter))}</footer></blockquote>`;
}
function starBtn(id) {
  const on = state.saved.has(id);
  return `<button class="star${on ? ' on' : ''}" data-star="${esc(id)}" aria-label="${on ? 'Убрать из избранного' : 'В избранное'}">${on ? '★' : '☆'}</button>`;
}
function bookChips() {
  const all = `<button class="chip${state.filter ? '' : ' on'}" data-filter="">Все книги</button>`;
  return '<div class="chips">' + all + state.books.map(b =>
    `<button class="chip${state.filter === b.id ? ' on' : ''}" data-filter="${b.id}">${esc(BOOK_SHORT[b.id] || b.title)}</button>`
  ).join('') + '</div>';
}
function inFilter(bookId) { return !state.filter || state.filter === bookId; }

// ---------- views ----------
function viewHome() {
  const nTerms = state.glossary.length;
  return `
    <h1>Справочник по учению Бон и Дзогчен</h1>
    <p class="muted">По книгам Тензина Вангьяла Ринпоче: термины, практики, ключевые идеи и короткие цитаты. У каждой статьи указаны книга и глава.</p>
    <div class="grid home-links">
      <a class="card" href="#/terms"><div class="num">${nTerms}</div>терминов</a>
      <a class="card" href="#/practices"><div class="num">${state.practices.length}</div>практик</a>
      <a class="card" href="#/ideas"><div class="num">${state.ideas.length}</div>ключевых идей</a>
      <a class="card" href="#/quotes"><div class="num">${state.quotes.length}</div>цитат</a>
    </div>
    <h2>Книги</h2>
    ${booksList()}
    <h2>Как установить на телефон</h2>
    <p><b>iPhone:</b> откройте сайт в Safari, нажмите «Поделиться» и выберите «На экран “Домой”».<br>
    <b>Android:</b> откройте сайт в Chrome, нажмите ⋮ и выберите «Установить приложение» или «Добавить на главный экран».<br>
    После первого открытия справочник работает и без интернета.</p>`;
}

function booksList() {
  return '<ul class="list">' + state.books.map(b =>
    `<li><a href="#/book/${b.id}">${esc(b.title)}<span class="sub">${b.chapters.length} глав · ${(b.terms || []).length} терминов · ${(b.practices || []).length} практик</span></a></li>`
  ).join('') + '</ul>';
}

function viewTerms() {
  const items = state.glossary.filter(g => g.entries.some(e => inFilter(e.book)));
  const groups = new Map();
  for (const g of items) {
    const L = firstLetter(g.name);
    if (!groups.has(L)) groups.set(L, []);
    groups.get(L).push(g);
  }
  const letters = [...groups.keys()];
  return `<h1>Термины</h1>${bookChips()}
    <div class="letters">${letters.map(L => `<a href="#L-${encodeURIComponent(L)}" data-jump="L-${esc(L)}">${esc(L)}</a>`).join('')}</div>
    ${letters.map(L => `<div class="letter-head" id="L-${esc(L)}">${esc(L)}</div><ul class="list">` +
      groups.get(L).map(g => {
        const books = [...new Set(g.entries.map(e => e.book))].map(id => BOOK_SHORT[id]).join(' · ');
        return `<li><a href="#/term/${encodeURIComponent(g.key)}">${esc(g.name)}<span class="sub">${esc(books)}</span></a></li>`;
      }).join('') + '</ul>').join('')}
    ${items.length ? '' : '<p class="muted">Нет терминов.</p>'}`;
}

function viewTerm(key) {
  const g = state.glossaryByKey[key];
  if (!g) return notFound();
  const id = `t:${g.key}`;
  const alts = [...g.alts].filter(a => termKey(a) !== g.key);
  return `<a class="back" href="#/terms">← Все термины</a>
    <div class="head-row"><h1>${esc(g.name)}</h1>${starBtn(id)}</div>
    ${alts.length ? `<p class="alt">Также: ${alts.map(esc).join(', ')}</p>` : ''}
    ${g.entries.map(e => `
      <div class="card">
        <span class="book-tag">«${esc(state.bookById[e.book].title)}»</span>
        <p>${esc(e.term.definition)}</p>
        ${e.term.quote && e.term.quote.text ? quoteHtml(e.book, e.term.quote) : ''}
        ${refLinks(e.book, e.term.chapters)}
      </div>`).join('')}`;
}

function practiceCard(x, q, full) {
  const p = x.p;
  return `<div class="card">
    <div class="head-row">${full ? `<span class="book-tag">«${esc(BOOK_SHORT[x.book])}»</span>` : `<h3><a href="#/practice/${x.book}/${x.id.split(':')[2]}">${hl(p.name, q)}</a></h3>`}${starBtn(x.id)}</div>
    ${full ? '' : `<span class="book-tag">«${esc(BOOK_SHORT[x.book])}»</span>`}
    <p>${hl(p.purpose, q)}</p>
    ${full && p.steps && p.steps.length ? `<h3>Как выполнять</h3><ol class="steps">${p.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    ${full && p.notes ? `<p class="muted">${esc(p.notes)}</p>` : ''}
    ${refLinks(x.book, p.chapters)}
  </div>`;
}

function viewPractices() {
  const items = state.practices.filter(x => inFilter(x.book));
  return `<h1>Практики</h1>${bookChips()}
    <ul class="list">${items.map(x =>
      `<li><a href="#/practice/${x.book}/${x.id.split(':')[2]}">${esc(x.p.name)}<span class="sub">${esc(BOOK_SHORT[x.book])}</span></a></li>`).join('')}</ul>`;
}

function viewPractice(book, idx) {
  const x = state.practices.find(p => p.id === `p:${book}:${idx}`);
  if (!x) return notFound();
  return `<a class="back" href="#/practices">← Все практики</a><h1>${esc(x.p.name)}</h1>${practiceCard(x, '', true)}
    <p class="muted small">Это краткий пересказ для памяти. Подробные указания читайте в книге и получайте у учителя.</p>`;
}

function ideaCard(x, q) {
  return `<div class="card">
    <div class="head-row"><h3>${hl(x.i.title, q)}</h3>${starBtn(x.id)}</div>
    <span class="book-tag">«${esc(BOOK_SHORT[x.book])}»</span>
    <p>${hl(x.i.summary, q)}</p>
    ${refLinks(x.book, x.i.chapters)}
  </div>`;
}

function viewIdeas() {
  const items = state.ideas.filter(x => inFilter(x.book));
  return `<h1>Ключевые идеи</h1>${bookChips()}${items.map(x => ideaCard(x)).join('')}`;
}

function quoteCard(x, q) {
  return `<div class="card">
    <div class="head-row"><span class="book-tag">${esc(x.q.topic || '')}</span>${starBtn(x.id)}</div>
    ${quoteHtml(x.book, x.q, q)}
    ${refLinks(x.book, [x.q.chapter])}
  </div>`;
}

function viewQuotes() {
  const items = state.quotes.filter(x => inFilter(x.book));
  return `<h1>Цитаты</h1>${bookChips()}${items.map(x => quoteCard(x)).join('')}`;
}

function viewBooks() {
  return `<h1>Книги</h1>${booksList()}`;
}

function countFor(b, cid) {
  const has = arr => (arr || []).filter(x => (x.chapters || []).includes(cid)).length;
  return has(b.terms) + has(b.practices) + has(b.ideas) + (b.quotes || []).filter(q => q.chapter === cid).length;
}

function viewBook(id) {
  const b = state.bookById[id];
  if (!b) return notFound();
  return `<a class="back" href="#/books">← Все книги</a><h1>${esc(b.title)}</h1>
    <p>${esc(b.summary)}</p>
    <h2>Главы</h2>
    <ul class="list">${b.chapters.map(c => {
      const n = countFor(b, c.id);
      return `<li><a href="#/book/${id}/${c.id}">${esc(c.title)}<span class="sub">${n ? n + ' статей' : 'нет статей'}</span></a></li>`;
    }).join('')}</ul>`;
}

function viewChapter(id, cid) {
  const b = state.bookById[id];
  const c = b && b.chapterById[cid];
  if (!c) return notFound();
  const terms = (b.terms || []).filter(t => (t.chapters || []).includes(cid));
  const pr = state.practices.filter(x => x.book === id && (x.p.chapters || []).includes(cid));
  const ideas = state.ideas.filter(x => x.book === id && (x.i.chapters || []).includes(cid));
  const quotes = state.quotes.filter(x => x.book === id && x.q.chapter === cid);
  return `<a class="back" href="#/book/${id}">← ${esc(b.title)}</a><h1>${esc(c.title)}</h1>
    ${terms.length ? `<h2>Термины</h2><ul class="list">${terms.map(t =>
      `<li><a href="#/term/${encodeURIComponent(termKey(t.term))}">${esc(t.term)}</a></li>`).join('')}</ul>` : ''}
    ${pr.length ? `<h2>Практики</h2>${pr.map(x => practiceCard(x)).join('')}` : ''}
    ${ideas.length ? `<h2>Идеи</h2>${ideas.map(x => ideaCard(x)).join('')}` : ''}
    ${quotes.length ? `<h2>Цитаты</h2>${quotes.map(x => quoteCard(x)).join('')}` : ''}
    ${terms.length + pr.length + ideas.length + quotes.length ? '' : '<p class="muted">По этой главе статей нет.</p>'}`;
}

function matches(q, ...fields) {
  const words = norm(q).split(' ').filter(Boolean);
  const hay = norm(fields.flat().filter(Boolean).join(' '));
  return words.every(w => hay.includes(w));
}

function viewSearch(q) {
  if (!norm(q)) return viewHome();
  const nq = norm(q);
  const terms = state.glossary.filter(g =>
    matches(q, g.name, [...g.alts], g.entries.map(e => e.term.definition)));
  // put name matches first
  terms.sort((a, b) => (norm(b.name).includes(nq) ? 1 : 0) - (norm(a.name).includes(nq) ? 1 : 0));
  const pr = state.practices.filter(x => matches(q, x.p.name, x.p.purpose, x.p.steps, x.p.notes));
  const ideas = state.ideas.filter(x => matches(q, x.i.title, x.i.summary));
  const quotes = state.quotes.filter(x => matches(q, x.q.text, x.q.topic));
  const total = terms.length + pr.length + ideas.length + quotes.length;
  return `<h1>Поиск: «${esc(q)}»</h1>
    <p class="muted">${total ? `Найдено: ${total}` : 'Ничего не найдено. Попробуйте другое написание (например, «шинэ» или «шине»).'}</p>
    ${terms.length ? `<h2>Термины (${terms.length})</h2><ul class="list">${terms.map(g => {
      const def = g.entries[0].term.definition;
      return `<li><a href="#/term/${encodeURIComponent(g.key)}">${hl(g.name, q)}<span class="sub">${hl(def.length > 140 ? def.slice(0, 140) + '…' : def, q)}</span></a></li>`;
    }).join('')}</ul>` : ''}
    ${pr.length ? `<h2>Практики (${pr.length})</h2>${pr.map(x => practiceCard(x, q)).join('')}` : ''}
    ${ideas.length ? `<h2>Идеи (${ideas.length})</h2>${ideas.map(x => ideaCard(x, q)).join('')}` : ''}
    ${quotes.length ? `<h2>Цитаты (${quotes.length})</h2>${quotes.map(x => quoteCard(x, q)).join('')}` : ''}`;
}

function viewSaved() {
  const ids = state.saved;
  const terms = state.glossary.filter(g => ids.has(`t:${g.key}`));
  const pr = state.practices.filter(x => ids.has(x.id));
  const ideas = state.ideas.filter(x => ids.has(x.id));
  const quotes = state.quotes.filter(x => ids.has(x.id));
  const total = terms.length + pr.length + ideas.length + quotes.length;
  return `<h1>Избранное</h1>
    ${total ? '' : '<p class="muted">Здесь появится то, что вы отметите звёздочкой ☆.</p>'}
    ${terms.length ? `<h2>Термины</h2><ul class="list">${terms.map(g =>
      `<li><a href="#/term/${encodeURIComponent(g.key)}">${esc(g.name)}</a></li>`).join('')}</ul>` : ''}
    ${pr.length ? `<h2>Практики</h2>${pr.map(x => practiceCard(x)).join('')}` : ''}
    ${ideas.length ? `<h2>Идеи</h2>${ideas.map(x => ideaCard(x)).join('')}` : ''}
    ${quotes.length ? `<h2>Цитаты</h2>${quotes.map(x => quoteCard(x)).join('')}` : ''}`;
}

function notFound() {
  return '<h1>Не найдено</h1><p><a href="#/">На главную</a></p>';
}

// ---------- router ----------
function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query] = hash.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const tab = parts[0] === 'term' ? 'terms' : parts[0] === 'practice' ? 'practices' : parts[0] === 'book' ? 'books' : parts[0];
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));

  let html;
  switch (parts[0]) {
    case undefined: html = viewHome(); break;
    case 'terms': html = viewTerms(); break;
    case 'term': html = viewTerm(parts[1]); break;
    case 'practices': html = viewPractices(); break;
    case 'practice': html = viewPractice(parts[1], parts[2]); break;
    case 'ideas': html = viewIdeas(); break;
    case 'quotes': html = viewQuotes(); break;
    case 'books': html = viewBooks(); break;
    case 'book': html = parts[2] ? viewChapter(parts[1], parts[2]) : viewBook(parts[1]); break;
    case 'saved': html = viewSaved(); break;
    case 'search': {
      const q = new URLSearchParams(query || '').get('q') || '';
      if ($q.value !== q) $q.value = q;
      html = viewSearch(q);
      break;
    }
    default: html = notFound();
  }
  if (parts[0] !== 'search' && $q.value) $q.value = '';
  $view.innerHTML = html;
  if (parts[0] !== 'search') window.scrollTo(0, 0);
}

// ---------- events ----------
let searchTimer;
$q.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = $q.value.trim();
    const target = q ? '#/search?q=' + encodeURIComponent(q) : '#/';
    if (location.hash.startsWith('#/search')) history.replaceState(null, '', target), route();
    else location.hash = target;
  }, 200);
});
document.getElementById('search-form').addEventListener('submit', e => { e.preventDefault(); $q.blur(); });

$view.addEventListener('click', e => {
  const star = e.target.closest('[data-star]');
  if (star) {
    e.preventDefault();
    toggleSaved(star.dataset.star);
    const on = state.saved.has(star.dataset.star);
    star.classList.toggle('on', on);
    star.textContent = on ? '★' : '☆';
    return;
  }
  const chip = e.target.closest('[data-filter]');
  if (chip) {
    state.filter = chip.dataset.filter || null;
    storeSet('filter', state.filter);
    route();
    return;
  }
  const jump = e.target.closest('[data-jump]');
  if (jump) {
    e.preventDefault();
    document.getElementById(jump.dataset.jump)?.scrollIntoView({ behavior: 'smooth' });
  }
});

// theme
const $theme = document.getElementById('theme');
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
applyTheme(storeGet('theme', null));
$theme.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  storeSet('theme', next);
});

window.addEventListener('hashchange', route);

load().then(() => {
  const f = storeGet('filter', null);
  state.filter = state.bookById[f] ? f : null;
  route();
}).catch(err => {
  $view.innerHTML = `<p>Не удалось загрузить данные: ${esc(err.message)}</p>`;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
