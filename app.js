'use strict';

const BOOK_SHORT = {
  chudesa: 'Чудеса естественного ума',
  son: 'Йога сна и сновидений',
  telo: 'Пробуждение священного тела',
  iscelenie: 'Исцеление формой, энергией и светом',
  trum: 'Йога тела, речи и ума',
};

// Thematic collections: an item belongs to a topic when its name/summary mentions a keyword stem.
const TOPICS = [
  { id: 'mind', icon: '◯', title: 'Природа ума и Дзогчен', keys: ['ригпа', 'кунжи', 'природа ума', 'природы ума', 'дзогчен', 'пустот', 'трекчод', 'тхогел', 'созерцан', 'недвойствен', 'изначальн'] },
  { id: 'calm', icon: '◎', title: 'Шинэ и медитация', keys: ['шинэ', 'шиней', 'шине ', 'пребывание в покое', 'сосредоточ', 'медитац', 'ньямшаг', 'интегрир'] },
  { id: 'dream', icon: '☾', title: 'Сон и сновидения', keys: ['сновид', 'сон ', 'сна ', 'сне ', 'сном', 'йога сна', 'осознанн', 'засыпан'] },
  { id: 'energy', icon: '≋', title: 'Каналы, ветры, дыхание', keys: ['цалунг', 'лунг', 'прана', 'праны', 'канал', 'чакр', 'тигле', 'дыхан', 'ветер', 'ветра', 'ветр', 'трулкхор', 'хорло'] },
  { id: 'elements', icon: '✦', title: 'Пять элементов', keys: ['элемент', 'стихи', 'пространств', 'земл', 'огн', 'огон', 'воздух'] },
  { id: 'sound', icon: '♪', title: 'Звук, слоги, мантры', keys: ['мантр', 'слог', 'звук', 'речь', 'речи', 'а-ом-хум', 'хунг', 'хум'] },
  { id: 'death', icon: '☸', title: 'Смерть и бардо', keys: ['бардо', 'смерт', 'умира', 'перерожд'] },
  { id: 'guru', icon: '♁', title: 'Учитель и преданность', keys: ['гуру', 'учител', 'преданност', 'прибежищ', 'передач', 'линии'] },
  { id: 'bon', icon: '✺', title: 'Традиция Бон', keys: ['тонпа шенраб', 'бон', 'шанг-шунг', 'шангшунг', 'юнгдрунг', 'олмо', 'бонпо'] },
];

const state = {
  books: [],
  bookById: {},
  glossary: [],      // merged terms: {key, name, alts, entries:[{book, term}]}
  glossaryByKey: {},
  practices: [],     // {id, book, idx, p}
  ideas: [],         // {id, book, i}
  quotes: [],        // {id, book, q}
  filter: null,      // book id or null
  saved: null,
  linker: null,
};

const $view = document.getElementById('view');
const $q = document.getElementById('q');

const ICON_STAR = '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
const ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';

// ---------- storage ----------
function storeGet(k, d) {
  try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
}
function storeSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
}
state.saved = new Set(storeGet('saved', []));
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
function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function hl(text, q) {
  const t = esc(text);
  if (!q) return t;
  const words = norm(q).split(' ').filter(w => w.length > 1);
  if (!words.length) return t;
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
  return (name.trim()[0] || '#').toUpperCase().replace('Ё', 'Е');
}
function cut(s, n) { return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; }
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
function dayIndex(len) {
  const d = new Date();
  const n = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  return (n * 7919) % len;
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
    (b.practices || []).forEach((p, i) => state.practices.push({ id: `p:${b.id}:${i}`, book: b.id, idx: i, p }));
    (b.ideas || []).forEach((x, i) => state.ideas.push({ id: `i:${b.id}:${i}`, book: b.id, i: x }));
    (b.quotes || []).forEach((q, i) => state.quotes.push({ id: `q:${b.id}:${i}`, book: b.id, q }));
    (b.terms || []).forEach(t => {
      if (t.quote && t.quote.text) state.quotes.push({ id: `tq:${b.id}:${termKey(t.term)}`, book: b.id, q: { ...t.quote, topic: t.term } });
    });
  }
  for (const g of state.glossary) {
    for (const a of g.alts) {
      const k = termKey(a);
      if (k && !state.glossaryByKey[k]) state.glossaryByKey[k] = g;
    }
  }
  const coll = new Intl.Collator('ru');
  state.glossary.sort((a, b) => coll.compare(a.name, b.name));
  buildLinker();
}

// Auto-link glossary terms inside definitions. Allows a short Russian ending so «ригпы», «кунжи» etc. match.
function buildLinker() {
  const forms = [];
  for (const g of state.glossary) {
    const names = [g.name.replace(/\(.*?\)/g, '').trim(), ...[...g.alts].filter(a => /[а-яё]/i.test(a))];
    for (const n of names) {
      const base = n.toLowerCase().replace(/ё/g, 'е');
      if (base.length < 4 || /[^а-яa-z \-]/.test(base)) continue;
      const stem = base.length >= 5 && /[аяеиоыьй]$/.test(base) ? base.slice(0, -1) : base;
      forms.push({ stem, key: g.key });
    }
  }
  forms.sort((a, b) => b.stem.length - a.stem.length);
  const byStem = new Map(forms.map(f => [f.stem, f.key]));
  const alt = [...byStem.keys()].map(reEsc).join('|');
  state.linker = {
    re: new RegExp(`(^|[^а-яёa-z])(${alt})([а-яё]{0,3})(?=[^а-яёa-z]|$)`, 'gi'),
    byStem,
  };
}
function linkify(text, selfKey) {
  const t = esc(text);
  if (!state.linker) return t;
  const used = new Set([selfKey]);
  return t.replace(state.linker.re, (m, pre, word, end) => {
    const key = state.linker.byStem.get(word.toLowerCase().replace(/ё/g, 'е'));
    if (!key || used.has(key)) return m;
    used.add(key);
    return `${pre}<a class="tlink" href="#/term/${encodeURIComponent(key)}">${word}${end}</a>`;
  });
}

// ---------- shared bits ----------
function chapterTitle(bookId, cid) {
  const c = state.bookById[bookId]?.chapterById[cid];
  return c ? c.title : '';
}
// short: the book is already named on the card, so show chapter titles only
function refLinks(bookId, chapters, short) {
  const ids = (chapters || []).filter(c => state.bookById[bookId]?.chapterById[c]);
  if (!ids.length) return short ? '' : `<div class="refs"><a class="ref b-${bookId}" href="#/book/${bookId}">${esc(BOOK_SHORT[bookId])}</a></div>`;
  return `<div class="refs">${short ? '<span class="refs-label">Главы:</span>' : ''}` + ids.map(c =>
    `<a class="ref b-${bookId}" href="#/book/${bookId}/${c}">${short ? '' : esc(BOOK_SHORT[bookId]) + ' · '}${esc(chapterTitle(bookId, c))}</a>`
  ).join('') + '</div>';
}
function quoteHtml(bookId, q, query) {
  return `<blockquote>${hl(q.text, query)}<footer>«${esc(BOOK_SHORT[bookId])}», ${esc(chapterTitle(bookId, q.chapter))}</footer></blockquote>`;
}
function starBtn(id) {
  const on = state.saved.has(id);
  return `<button class="star${on ? ' on' : ''}" data-star="${esc(id)}" aria-label="${on ? 'Убрать из избранного' : 'В избранное'}">${ICON_STAR}</button>`;
}
function bookTag(id) { return `<span class="book-tag b-${id}">${esc(BOOK_SHORT[id])}</span>`; }
function bookChips() {
  const all = `<button class="chip${state.filter ? '' : ' on'}" data-filter="">Все книги</button>`;
  return '<div class="chips">' + all + state.books.map(b =>
    `<button class="chip b-${b.id}${state.filter === b.id ? ' on' : ''}" data-filter="${b.id}"><span class="dot"></span>${esc(BOOK_SHORT[b.id])}</button>`
  ).join('') + '</div>';
}
function inFilter(bookId) { return !state.filter || state.filter === bookId; }
function dotsFor(bookIds) {
  return `<span class="dots">${[...new Set(bookIds)].map(id => `<i class="b-${id}" title="${esc(BOOK_SHORT[id])}"></i>`).join('')}</span>`;
}
function termRow(g, sub) {
  return `<li><a href="#/term/${encodeURIComponent(g.key)}"><span class="main">${esc(g.name)}${sub ? `<span class="sub">${sub}</span>` : ''}</span>${dotsFor(g.entries.map(e => e.book))}${ICON_CHEV}</a></li>`;
}
function practiceHref(x) { return `#/practice/${x.book}/${x.idx}`; }
function practiceRow(x, showBook) {
  return `<li><a href="${practiceHref(x)}"><span class="main">${esc(x.p.name)}<span class="sub">${esc(showBook ? BOOK_SHORT[x.book] : cut(x.p.purpose || '', 90))}</span></span>${showBook ? dotsFor([x.book]) : ''}${ICON_CHEV}</a></li>`;
}
function ideaCard(x, q) {
  return `<div class="card book-accent b-${x.book}">
    ${bookTag(x.book)}
    <div class="head-row"><h3>${hl(x.i.title, q)}</h3>${starBtn(x.id)}</div>
    <p>${q ? hl(x.i.summary, q) : linkify(x.i.summary)}</p>
    ${refLinks(x.book, x.i.chapters, true)}
  </div>`;
}
function quoteCard(x, q) {
  return `<div class="card">
    <div class="head-row">${bookTag(x.book)}${starBtn(x.id)}</div>
    ${quoteHtml(x.book, x.q, q)}
    ${x.q.topic ? `<span class="muted small">Тема: ${esc(x.q.topic)}</span>` : ''}
  </div>`;
}
function groupByBook(items, render, opts = {}) {
  return state.books.filter(b => inFilter(b.id)).map(b => {
    const its = items.filter(x => x.book === b.id);
    if (!its.length) return '';
    return `<details class="group b-${b.id}"${opts.open ? ' open' : ''}>
      <summary>${esc(b.title)}<span class="count">${its.length}</span></summary>
      ${render(its)}
    </details>`;
  }).join('');
}

// ---------- topics ----------
function topicMatch(t, ...fields) {
  const hay = ' ' + norm(fields.flat().filter(Boolean).join(' ')) + ' ';
  return t.keys.some(k => hay.includes(k));
}
function topicItems(t) {
  return {
    terms: state.glossary.filter(g => topicMatch(t, g.name, [...g.alts])),
    practices: state.practices.filter(x => topicMatch(t, x.p.name, x.p.purpose)),
    ideas: state.ideas.filter(x => topicMatch(t, x.i.title)),
  };
}

// ---------- views ----------
function viewHome() {
  const q = state.quotes[dayIndex(state.quotes.length)];
  const topicCards = TOPICS.map(t => {
    const it = topicItems(t);
    const n = it.terms.length + it.practices.length + it.ideas.length;
    return `<a class="topic" href="#/topic/${t.id}"><span class="ico">${t.icon}</span><b>${esc(t.title)}</b><span>${n} ${plural(n, 'статья', 'статьи', 'статей')}</span></a>`;
  }).join('');
  return `
    <section class="hero">
      <img src="icons/icon-192.png" alt="">
      <h1>Бон и Дзогчен</h1>
      <p>Справочник по книгам Тензина Вангьяла Ринпоче: термины, практики, ключевые идеи и цитаты со ссылкой на книгу и главу.</p>
    </section>
    <div class="stats">
      <a href="#/terms"><b>${state.glossary.length}</b><span>терминов</span></a>
      <a href="#/practices"><b>${state.practices.length}</b><span>практик</span></a>
      <a href="#/ideas"><b>${state.ideas.length}</b><span>идей</span></a>
      <a href="#/quotes"><b>${state.quotes.length}</b><span>цитат</span></a>
    </div>
    ${q ? `<div class="card daily">
      <div class="label">Цитата дня</div>
      ${quoteHtml(q.book, q.q)}
      <div class="row-btns">
        <a class="btn" href="#/random/term">Случайный термин</a>
        <a class="btn" href="#/random/quote">Случайная цитата</a>
      </div>
    </div>` : ''}
    <h2>Для практики</h2>
    <div class="tools-row">
      <a class="tool" href="#/timer"><span class="ico">◎</span><b>Таймер</b></a>
      <a class="tool night-tool" href="#/night"><span class="ico">☾</span><b>Практика сна</b></a>
      <a class="tool" href="#/journal"><span class="ico">✎</span><b>Дневник</b></a>
      <a class="tool" href="#/cards"><span class="ico">❖</span><b>Карточки</b></a>
      <a class="tool" href="#/charts"><span class="ico">✦</span><b>Схемы</b></a>
    </div>
    <h2>Темы</h2>
    <div class="topics">${topicCards}</div>
    <h2>Книги</h2>
    ${bookCards()}
    <h2>Поделиться</h2>
    <div class="card share-card">
      <span class="ico"><svg viewBox="0 0 24 24"><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/></svg></span>
      <div><p>Отправьте приложение другу: оно откроется по ссылке на любом телефоне и компьютере.</p>
      <p class="row-btns"><button class="btn primary" data-share-app>Поделиться с другом</button></p></div>
    </div>
    <p class="muted small">Значок «Поделиться» вверху экрана отправляет ссылку на ту статью, которая сейчас открыта, например на термин или практику.</p>
    <h2>Установить на телефон</h2>
    <div class="card small">
      <p><b>iPhone:</b> откройте сайт в Safari → «Поделиться» → «На экран “Домой”».</p>
      <p><b>Android:</b> откройте в Chrome → ⋮ → «Установить приложение».</p>
      <p class="muted">После первого открытия справочник работает без интернета. Кнопка «Aa» вверху меняет размер текста.</p>
    </div>`;
}

function bookCards() {
  return '<div class="books">' + state.books.map(b =>
    `<a class="book-card b-${b.id}" href="#/book/${b.id}"><span class="spine"></span><span><b>${esc(b.title)}</b>
      <span>${(b.terms || []).length} терминов · ${(b.practices || []).length} практик · ${(b.ideas || []).length} идей</span></span></a>`
  ).join('') + '</div>';
}

function viewTopics() {
  return `<h1>Темы</h1><p class="lead">Термины, практики и идеи из всех книг, собранные по темам.</p>
    <div class="topics">${TOPICS.map(t => `<a class="topic" href="#/topic/${t.id}"><span class="ico">${t.icon}</span><b>${esc(t.title)}</b></a>`).join('')}</div>`;
}

function viewTopic(id) {
  const t = TOPICS.find(x => x.id === id);
  if (!t) return notFound();
  const it = topicItems(t);
  return `<a class="back" href="#/topics">‹ Все темы</a>
    <div class="page-head"><h1>${t.icon} ${esc(t.title)}</h1></div>
    ${it.terms.length ? `<h2>Термины</h2><ul class="list">${it.terms.map(g => termRow(g)).join('')}</ul>` : ''}
    ${it.practices.length ? `<h2>Практики</h2><ul class="list">${it.practices.map(x => practiceRow(x, true)).join('')}</ul>` : ''}
    ${it.ideas.length ? `<h2>Идеи</h2>${it.ideas.map(x => ideaCard(x)).join('')}` : ''}`;
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
  return `<h1>Термины</h1>
    <p class="lead">${items.length} ${plural(items.length, 'термин', 'термина', 'терминов')}. Цветные точки показывают, в каких книгах термин объясняется.</p>
    ${bookChips()}
    <div class="letters">${letters.map(L => `<a href="#" data-jump="L-${esc(L)}">${esc(L)}</a>`).join('')}</div>
    ${letters.map(L => `<div class="letter-head" id="L-${esc(L)}">${esc(L)}</div><ul class="list">` +
      groups.get(L).map(g => termRow(g, esc(cut(g.entries[0].term.definition, 80)))).join('') + '</ul>').join('')}
    ${items.length ? '' : '<p class="empty">Нет терминов.</p>'}`;
}

function relatedTerms(g) {
  // terms explained in the same chapters, ranked by how many chapters they share
  const chs = new Set(g.entries.flatMap(e => (e.term.chapters || []).map(c => e.book + '/' + c)));
  const score = [];
  for (const o of state.glossary) {
    if (o === g) continue;
    let s = 0;
    for (const e of o.entries) for (const c of e.term.chapters || []) if (chs.has(e.book + '/' + c)) s++;
    if (s) score.push([s, o]);
  }
  return score.sort((a, b) => b[0] - a[0]).slice(0, 10).map(x => x[1]);
}

function viewTerm(key) {
  const g = state.glossaryByKey[key];
  if (!g) return notFound();
  const id = `t:${g.key}`;
  const alts = [...g.alts].filter(a => termKey(a) !== g.key);
  const rel = relatedTerms(g);
  return `<a class="back" href="#/terms">‹ Все термины</a>
    <div class="page-head">
      <div class="head-row"><h1>${esc(g.name)}</h1>${starBtn(id)}</div>
      ${alts.length ? `<p class="alt">Также: ${alts.map(esc).join(', ')}</p>` : ''}
    </div>
    ${g.entries.length > 1 ? `<p class="muted small">Объясняется в ${g.entries.length} книгах.</p>` : ''}
    ${g.entries.map(e => `
      <div class="card book-accent b-${e.book}">
        ${bookTag(e.book)}
        <p>${linkify(e.term.definition, g.key)}</p>
        ${e.term.quote && e.term.quote.text ? quoteHtml(e.book, e.term.quote) : ''}
        ${refLinks(e.book, e.term.chapters, true)}
      </div>`).join('')}
    ${rel.length ? `<h2>Рядом в тех же главах</h2><div class="related">${rel.map(o =>
      `<a class="chip" href="#/term/${encodeURIComponent(o.key)}">${esc(o.name)}</a>`).join('')}</div>` : ''}
    ${noteBox(id)}`;
}

function viewPractices() {
  const items = state.practices.filter(x => inFilter(x.book));
  return `<h1>Практики</h1>
    <p class="lead">${items.length} ${plural(items.length, 'практика', 'практики', 'практик')}, сгруппированы по книгам. Нажмите на книгу, чтобы раскрыть список.</p>
    ${bookChips()}
    ${groupByBook(items, its => `<ul class="list">${its.map(x => practiceRow(x)).join('')}</ul>`, { open: !!state.filter })}`;
}

function viewPractice(book, idx) {
  const x = state.practices.find(p => p.id === `p:${book}:${idx}`);
  if (!x) return notFound();
  const p = x.p;
  const same = state.practices.filter(o => o.book === book);
  const pos = same.indexOf(x);
  const prev = same[pos - 1], next = same[pos + 1];
  return `<a class="back" href="#/practices">‹ Все практики</a>
    <div class="page-head b-${book}">
      ${bookTag(book)}
      <div class="head-row"><h1>${esc(p.name)}</h1>${starBtn(x.id)}</div>
    </div>
    <p class="purpose">${linkify(p.purpose)}</p>
    ${p.steps && p.steps.length ? `<div class="card b-${book}"><h3>Как выполнять</h3><ol class="steps">${p.steps.map(s => `<li>${linkify(s)}</li>`).join('')}</ol></div>` : ''}
    ${p.notes ? `<div class="callout"><b>Важно</b>${linkify(p.notes)}</div>` : ''}
    ${refLinks(book, p.chapters, true)}
    ${noteBox(x.id)}
    <p class="muted small">Это краткий пересказ для памяти. Подробные указания читайте в книге и получайте у учителя.</p>
    <div class="pager">
      ${prev ? `<a href="${practiceHref(prev)}"><small>‹ Предыдущая</small>${esc(prev.p.name)}</a>` : '<span></span>'}
      ${next ? `<a class="next" href="${practiceHref(next)}"><small>Следующая ›</small>${esc(next.p.name)}</a>` : '<span></span>'}
    </div>`;
}

function viewIdeas() {
  const items = state.ideas.filter(x => inFilter(x.book));
  return `<h1>Ключевые идеи</h1>
    <p class="lead">Главные мысли каждой книги в кратком пересказе.</p>
    ${bookChips()}
    ${groupByBook(items, its => `<div class="group-body">${its.map(x => ideaCard(x)).join('')}</div>`, { open: !!state.filter })}`;
}

function viewQuotes() {
  const items = state.quotes.filter(x => inFilter(x.book));
  return `<div class="head-row"><h1>Цитаты</h1><a class="btn" href="#/random/quote">Случайная</a></div>
    ${bookChips()}
    <div class="quote-grid">${items.map(x => quoteCard(x)).join('')}</div>`;
}

function viewBooks() {
  return `<h1>Книги</h1>${bookCards()}`;
}

function countFor(b, cid) {
  const has = arr => (arr || []).filter(x => (x.chapters || []).includes(cid)).length;
  return has(b.terms) + has(b.practices) + has(b.ideas) + (b.quotes || []).filter(q => q.chapter === cid).length;
}

function viewBook(id) {
  const b = state.bookById[id];
  if (!b) return notFound();
  return `<a class="back" href="#/books">‹ Все книги</a>
    <div class="book-hero b-${id}"><h1>${esc(b.title)}</h1></div>
    <p>${linkify(b.summary)}</p>
    <div class="stats">
      <a href="#/terms" data-filter-go="${id}"><b>${(b.terms || []).length}</b><span>терминов</span></a>
      <a href="#/practices" data-filter-go="${id}"><b>${(b.practices || []).length}</b><span>практик</span></a>
      <a href="#/ideas" data-filter-go="${id}"><b>${(b.ideas || []).length}</b><span>идей</span></a>
      <a href="#/quotes" data-filter-go="${id}"><b>${state.quotes.filter(q => q.book === id).length}</b><span>цитат</span></a>
    </div>
    <h2>Главы</h2>
    <ul class="list">${b.chapters.map(c => {
      const n = countFor(b, c.id);
      return `<li><a href="#/book/${id}/${c.id}"><span class="main">${esc(c.title)}<span class="sub">${n ? `${n} ${plural(n, 'статья', 'статьи', 'статей')}` : 'нет статей'}</span></span>${ICON_CHEV}</a></li>`;
    }).join('')}</ul>`;
}

function viewChapter(id, cid) {
  const b = state.bookById[id];
  const c = b && b.chapterById[cid];
  if (!c) return notFound();
  const terms = (b.terms || []).filter(t => (t.chapters || []).includes(cid)).map(t => state.glossaryByKey[termKey(t.term)]).filter(Boolean);
  const pr = state.practices.filter(x => x.book === id && (x.p.chapters || []).includes(cid));
  const ideas = state.ideas.filter(x => x.book === id && (x.i.chapters || []).includes(cid));
  const quotes = state.quotes.filter(x => x.book === id && x.q.chapter === cid);
  const i = b.chapters.indexOf(c), prev = b.chapters[i - 1], next = b.chapters[i + 1];
  return `<a class="back" href="#/book/${id}">‹ ${esc(b.title)}</a>
    <div class="book-hero b-${id}"><h1>${esc(c.title)}</h1></div>
    ${terms.length ? `<h2>Термины</h2><ul class="list">${terms.map(g => termRow(g)).join('')}</ul>` : ''}
    ${pr.length ? `<h2>Практики</h2><ul class="list">${pr.map(x => practiceRow(x)).join('')}</ul>` : ''}
    ${ideas.length ? `<h2>Идеи</h2>${ideas.map(x => ideaCard(x)).join('')}` : ''}
    ${quotes.length ? `<h2>Цитаты</h2>${quotes.map(x => quoteCard(x)).join('')}` : ''}
    ${terms.length + pr.length + ideas.length + quotes.length ? '' : '<p class="empty">По этой главе статей нет.</p>'}
    <div class="pager">
      ${prev ? `<a href="#/book/${id}/${prev.id}"><small>‹ Предыдущая глава</small>${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="next" href="#/book/${id}/${next.id}"><small>Следующая глава ›</small>${esc(next.title)}</a>` : '<span></span>'}
    </div>`;
}

function matches(q, ...fields) {
  const words = norm(q).split(' ').filter(Boolean);
  const hay = norm(fields.flat().filter(Boolean).join(' '));
  return words.every(w => hay.includes(w));
}

function viewSearch(q) {
  if (!norm(q)) return viewHome();
  const nq = norm(q);
  const terms = state.glossary.filter(g => matches(q, g.name, [...g.alts], g.entries.map(e => e.term.definition)));
  const rank = g => (norm(g.name).startsWith(nq) ? 2 : 0) + (norm(g.name).includes(nq) || [...g.alts].some(a => norm(a).includes(nq)) ? 1 : 0);
  terms.sort((a, b) => rank(b) - rank(a));
  const pr = state.practices.filter(x => matches(q, x.p.name, x.p.purpose, x.p.steps, x.p.notes));
  const ideas = state.ideas.filter(x => matches(q, x.i.title, x.i.summary));
  const quotes = state.quotes.filter(x => matches(q, x.q.text, x.q.topic));
  const total = terms.length + pr.length + ideas.length + quotes.length;
  return `<h1>Поиск</h1>
    <p class="lead">${total ? `По запросу «${esc(q)}» найдено ${total}` : `По запросу «${esc(q)}» ничего не найдено. Попробуйте другое написание, например «шинэ» или «шине».`}</p>
    ${terms.length ? `<h2>Термины · ${terms.length}</h2><ul class="list">${terms.map(g => {
      const def = g.entries[0].term.definition;
      return `<li><a href="#/term/${encodeURIComponent(g.key)}"><span class="main">${hl(g.name, q)}<span class="sub">${hl(cut(def, 110), q)}</span></span>${dotsFor(g.entries.map(e => e.book))}${ICON_CHEV}</a></li>`;
    }).join('')}</ul>` : ''}
    ${pr.length ? `<h2>Практики · ${pr.length}</h2><ul class="list">${pr.map(x =>
      `<li><a href="${practiceHref(x)}"><span class="main">${hl(x.p.name, q)}<span class="sub">${hl(cut(x.p.purpose || '', 110), q)}</span></span>${dotsFor([x.book])}${ICON_CHEV}</a></li>`).join('')}</ul>` : ''}
    ${ideas.length ? `<h2>Идеи · ${ideas.length}</h2>${ideas.map(x => ideaCard(x, q)).join('')}` : ''}
    ${quotes.length ? `<h2>Цитаты · ${quotes.length}</h2>${quotes.map(x => quoteCard(x, q)).join('')}` : ''}`;
}

function viewSaved() {
  const ids = state.saved;
  const terms = state.glossary.filter(g => ids.has(`t:${g.key}`));
  const pr = state.practices.filter(x => ids.has(x.id));
  const ideas = state.ideas.filter(x => ids.has(x.id));
  const quotes = state.quotes.filter(x => ids.has(x.id));
  const notes = notesList();
  const total = terms.length + pr.length + ideas.length + quotes.length + (notes ? 1 : 0);
  return `<h1>Избранное</h1>
    ${notes}
    ${total ? '' : `<p class="empty">Здесь появится то, что вы отметите звёздочкой.<br>Она есть у каждого термина, практики, идеи и цитаты.</p>`}
    ${terms.length ? `<h2>Термины</h2><ul class="list">${terms.map(g => termRow(g)).join('')}</ul>` : ''}
    ${pr.length ? `<h2>Практики</h2><ul class="list">${pr.map(x => practiceRow(x, true)).join('')}</ul>` : ''}
    ${ideas.length ? `<h2>Идеи</h2>${ideas.map(x => ideaCard(x)).join('')}` : ''}
    ${quotes.length ? `<h2>Цитаты</h2>${quotes.map(x => quoteCard(x)).join('')}` : ''}`;
}

function notFound() {
  return '<h1>Не найдено</h1><p><a href="#/">На главную</a></p>';
}

// ---------- router ----------
const TAB_OF = { term: 'terms', practice: 'practices', book: 'books', topic: 'topics', saved: '', search: '', random: '', quotes: 'tools', timer: 'tools', night: 'tools', journal: 'tools', cards: 'tools', charts: 'tools' };

function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query] = hash.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);

  if (parts[0] === 'random') {
    if (parts[1] === 'quote') {
      const x = state.quotes[Math.floor(Math.random() * state.quotes.length)];
      $view.innerHTML = `<a class="back" href="#/quotes">‹ Все цитаты</a><h1>Случайная цитата</h1>${quoteCard(x)}
        <div class="row-btns"><button class="btn" data-again>Ещё одну</button></div>`;
    } else {
      const g = state.glossary[Math.floor(Math.random() * state.glossary.length)];
      history.replaceState(null, '', '#/term/' + encodeURIComponent(g.key));
      return route();
    }
    setActive('quotes');
    window.scrollTo(0, 0);
    return;
  }

  const tab = parts[0] === undefined ? 'home' : (parts[0] in TAB_OF ? TAB_OF[parts[0]] : parts[0]);
  setActive(tab);

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
    case 'topics': html = viewTopics(); break;
    case 'topic': html = viewTopic(parts[1]); break;
    case 'saved': html = viewSaved(); break;
    case 'search': {
      const q = new URLSearchParams(query || '').get('q') || '';
      if ($q.value !== q && document.activeElement !== $q) $q.value = q;
      html = viewSearch(q);
      break;
    }
    default: html = Tools.views[parts[0]] ? Tools.views[parts[0]](parts, query) : notFound();
  }
  if (parts[0] !== 'search' && $q.value) $q.value = '';
  $view.innerHTML = html;
  if (parts[0] !== 'search') window.scrollTo(0, 0);
  if (Tools.after[parts[0]]) Tools.after[parts[0]](parts);
}
function setActive(tab) {
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
}

// ---------- events ----------
let searchTimer;
$q.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = $q.value.trim();
    const target = q ? '#/search?q=' + encodeURIComponent(q) : '#/';
    if (location.hash.startsWith('#/search')) { history.replaceState(null, '', target); route(); }
    else location.hash = target;
  }, 200);
});
document.getElementById('search-form').addEventListener('submit', e => { e.preventDefault(); $q.blur(); });

document.addEventListener('click', e => {
  const star = e.target.closest('[data-star]');
  if (star) {
    e.preventDefault();
    toggleSaved(star.dataset.star);
    const on = state.saved.has(star.dataset.star);
    star.classList.toggle('on', on);
    star.setAttribute('aria-label', on ? 'Убрать из избранного' : 'В избранное');
    return;
  }
  const chip = e.target.closest('[data-filter]');
  if (chip) {
    state.filter = chip.dataset.filter || null;
    storeSet('filter', state.filter);
    route();
    return;
  }
  const go = e.target.closest('[data-filter-go]');
  if (go) {
    state.filter = go.dataset.filterGo;
    storeSet('filter', state.filter);
    return; // the link itself navigates
  }
  const jump = e.target.closest('[data-jump]');
  if (jump) {
    e.preventDefault();
    document.getElementById(jump.dataset.jump)?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (e.target.closest('[data-again]')) route();
});

// theme
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0e0f1a' : '#1f2140';
}
applyTheme(storeGet('theme', null));
document.getElementById('theme').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  storeSet('theme', next);
});

// font size: 0 → 1 → 2 → 0
function applySize(n) {
  if (n) document.documentElement.dataset.size = n; else delete document.documentElement.dataset.size;
}
applySize(storeGet('size', 0));
document.getElementById('font').addEventListener('click', () => {
  const n = (storeGet('size', 0) + 1) % 3;
  applySize(n);
  storeSet('size', n);
});

window.addEventListener('hashchange', route);

// ---------- share ----------
const APP_URL = 'https://natalia19620603.github.io/BON-DZOGCHEN-/';
const APP_TEXT = 'Справочник по учению Бон и Дзогчен по книгам Тензина Вангьяла Ринпоче: термины, практики, таймер медитации, дневник снов.';
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}
// whole = share the app's home page; otherwise share the page that is open (a term, a practice…)
async function share(whole) {
  const hash = location.hash && !whole && !/^#\/(search|saved|journal|cards|random)/.test(location.hash) ? location.hash : '';
  const url = APP_URL + hash;
  const h1 = document.querySelector('#view h1');
  const title = hash && h1 ? `${h1.textContent.trim()} · Бон и Дзогчен` : 'Бон и Дзогчен';
  if (navigator.share) {
    try { await navigator.share({ title, text: hash ? title : APP_TEXT, url }); } catch { /* cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Ссылка скопирована. Отправьте её другу в мессенджере.');
  } catch {
    prompt('Скопируйте ссылку:', url);
  }
}
document.getElementById('share').addEventListener('click', () => share(false));
document.addEventListener('click', e => { if (e.target.closest('[data-share-app]')) share(true); });

// back-to-top button: shown once the page is scrolled more than about one screen
const $top = document.getElementById('to-top');
let topTick = false;
window.addEventListener('scroll', () => {
  if (topTick) return;
  topTick = true;
  requestAnimationFrame(() => {
    $top.classList.toggle('show', window.scrollY > window.innerHeight * 0.8);
    topTick = false;
  });
}, { passive: true });
$top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

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
