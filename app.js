'use strict';
// Pages: Play (choose units) -> Run (the cards) -> Results; Units + editor; History; Settings.
// Routing is by location.hash so the browser's back button works and nothing needs a server.

const $app = document.getElementById('app');
const dlg = document.getElementById('dialog');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const pct = (a, b) => (b ? Math.round((a * 100) / b) : 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
const fmtDate = iso => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fmtDay = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseTags(text) {
  const out = [];
  String(text).split(/[,，]/).forEach(t => {
    t = t.trim();
    if (t && !out.some(o => o.toLowerCase() === t.toLowerCase())) out.push(t);
  });
  return out;
}

// Modal with buttons; resolves to the clicked button's value, or '' when dismissed with Esc.
function ask(title, bodyHtml, buttons) {
  return new Promise(resolve => {
    dlg.innerHTML = `<form method="dialog">
      <h2>${esc(title)}</h2>
      <div class="dlg-body">${bodyHtml}</div>
      <div class="dlg-actions">${buttons.map(b =>
        `<button value="${esc(b.value)}" class="btn ${b.cls || ''}" ${b.focus ? 'autofocus' : ''}>${esc(b.label)}</button>`).join('')}</div>
    </form>`;
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true });
    dlg.showModal();
  });
}
const notice = (title, bodyHtml) => ask(title, bodyHtml, [{ label: 'OK', value: 'ok', cls: 'primary', focus: true }]);

function applyTheme() {
  const t = Store.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

const SIDES = {
  pm: 'Pinyin + Meaning',
  hanzi: 'Hanzi',
};

function frontChoiceHTML(name) {
  return `<div class="seg small" role="radiogroup" aria-label="Card front">
    ${Object.entries(SIDES).map(([k, label]) =>
      `<label><input type="radio" name="${name}" value="${k}" ${Store.prefs.front === k ? 'checked' : ''}>${label}</label>`).join('')}
  </div>`;
}
function bindFrontChoice(name) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(r => r.addEventListener('change', () => {
    Store.prefs.front = r.value;
    Store.save();
  }));
}

// ---------------------------------------------------------------- profiles

const PROFILE_COLORS = { p1: '#b8322a', p2: '#2f5fb8', p3: '#2c7a4b', p4: '#a35f0f', p5: '#7446a8', guest: '#7d756a' };

function avatarHTML(p, cls = '') {
  const initial = ([...p.name.trim()][0] || '?').toUpperCase();
  return `<span class="avatar ${cls}" style="--av:${PROFILE_COLORS[p.id]}" aria-hidden="true">${esc(initial)}</span>`;
}

function renderWhoChip() {
  const p = Store.profile();
  const chip = document.getElementById('who-chip');
  chip.innerHTML = `${avatarHTML(p)}<span class="who-chip-name">${esc(p.name)}</span>`;
  chip.title = `Playing as ${p.name}. Tap to switch.`;
}

function viewWho() {
  const active = Store.profile().id;
  $app.innerHTML = `
  <section class="who">
    <h1>Who's playing?</h1>
    <div class="who-grid">${Store.profiles().map(p => {
      const n = Store.sessionCount(p.id);
      const meta = p.id === 'guest' ? 'Nothing is saved'
        : `${plural(n, 'session')}${p.id === 'p1' ? ' · edits units' : ''}`;
      return `<button class="who-tile ${p.id === active ? 'last' : ''}" data-id="${p.id}">
        ${avatarHTML(p, 'lg')}
        <span class="who-name">${esc(p.name)}</span>
        <span class="who-meta">${meta}</span>
      </button>`;
    }).join('')}</div>
    <p class="muted who-foot">Units are shared by everyone. Each player has their own history and stats.</p>
  </section>`;
  $app.querySelector('.who-grid').addEventListener('click', e => {
    const tile = e.target.closest('.who-tile');
    if (!tile) return;
    Store.setActive(tile.dataset.id);
    pick.selected = null;
    pick.tags.clear();
    pick.search = '';
    renderWhoChip();
    location.hash = '#/play';
  });
}

// ---------------------------------------------------------------- routing

let cleanup = null;
let pendingGame = null;

function setNav(page) {
  const active = page === 'run' || page === 'results' || !page ? 'play' : page;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === active));
  renderWhoChip();
}

function route() {
  if (cleanup) { const c = cleanup; cleanup = null; c(); }
  if (dlg.open) dlg.close();
  const [page, id, sub] = location.hash.replace(/^#\/?/, '').split('/');
  setNav(page);
  window.scrollTo(0, 0);
  switch (page) {
    case 'who': return viewWho();
    case 'units':
      if ((id === 'new' || sub === 'edit') && !Store.isOwner()) { location.replace('#/units'); return; }
      if (id === 'new') return viewEditor(null);
      if (id && sub === 'edit') return viewEditor(id);
      return viewUnits();
    case 'run': return viewRun();
    case 'results': return viewResults(id);
    case 'history': return viewHistory();
    case 'settings': return viewSettings();
    default: return viewPicker();
  }
}

// ---------------------------------------------------------------- sample unit

const SAMPLE = `你好 | ni3 hao3 | hello
谢谢 | xie4xie5 | thank you
再见 | zai4jian4 | goodbye
不客气 | bu2 ke4qi5 | you're welcome
对不起 | dui4bu5qi3 | sorry
没关系 | mei2 guan1xi5 | it doesn't matter
请问 | qing3wen4 | excuse me, may I ask…
我很好 | wo3 hen3 hao3 | I'm fine
你叫什么名字？ | ni3 jiao4 shen2me5 ming2zi5? | what's your name?
绿色 | lv4se4 | green`;

function addSampleUnit() {
  const now = new Date().toISOString();
  Store.putUnit({
    id: Store.uid(),
    name: 'Sample – Greetings',
    tags: ['sample', 'HSK1'],
    cards: Pinyin.parseBulk(SAMPLE).cards.map(c => ({ id: Store.uid(), hanzi: c.hanzi, pinyin: c.pinyin, meaning: c.meaning })),
    createdAt: now,
    updatedAt: now,
  });
}

function emptyUnitsHTML() {
  if (!Store.isOwner()) {
    return `<section class="empty">
      <div class="big-hz">学</div>
      <h1>No units yet</h1>
      <p>Only ${esc(Store.ownerName())} can add units. Switch to that profile to add some.</p>
      <div class="actions"><a class="btn" href="#/who">Switch player</a></div>
    </section>`;
  }
  return `<section class="empty">
    <div class="big-hz">学</div>
    <h1>No units yet</h1>
    <p>Paste in a list of vocab to make your first unit, or try the sample to see how it works.</p>
    <div class="actions">
      <a class="btn primary" href="#/units/new">Add a unit</a>
      <button class="btn" id="sample">Try a sample unit</button>
    </div>
  </section>`;
}
function bindSample() {
  const b = document.getElementById('sample');
  if (b) b.addEventListener('click', () => { addSampleUnit(); route(); });
}

// ---------------------------------------------------------------- play: choose units

const pick = { tags: new Set(), mode: 'any', search: '', selected: null };

function unitPlays() {
  const m = new Map();
  Store.sessions().forEach(s => s.units.forEach(u => {
    const p = m.get(u.id) || { count: 0, last: null };
    p.count++;
    if (!p.last || s.startedAt > p.last) p.last = s.startedAt;
    m.set(u.id, p);
  }));
  return m;
}

function viewPicker() {
  const units = Store.units();
  if (!units.length) { $app.innerHTML = emptyUnitsHTML(); bindSample(); return; }

  if (!pick.selected) pick.selected = new Set(Store.prefs.lastSelection);
  for (const id of pick.selected) if (!Store.unit(id)) pick.selected.delete(id);
  const tags = Store.allTags();
  const tagKeys = new Set(tags.map(t => t.name.toLowerCase()));
  for (const t of pick.tags) if (!tagKeys.has(t)) pick.tags.delete(t);
  const plays = unitPlays();

  $app.innerHTML = `
  <section>
    <div class="page-head">
      <div><h1>Choose units to play</h1><p>Pick one or more units. Their cards are shuffled into one deck.</p></div>
      ${Store.isOwner() ? '<a class="btn" href="#/units/new">+ New unit</a>' : ''}
    </div>
    <div class="panel">
      <div class="filter-row">
        <input type="search" id="p-search" placeholder="Search unit names" value="${esc(pick.search)}" aria-label="Search unit names">
      </div>
      ${tags.length ? `
      <div class="filter-row">
        <span class="label">Filter by tag</span>
        <div class="chips" id="p-tags">${tags.map(t =>
          `<button type="button" class="chip ${pick.tags.has(t.name.toLowerCase()) ? 'on' : ''}" data-tag="${esc(t.name.toLowerCase())}" aria-pressed="${pick.tags.has(t.name.toLowerCase())}">${esc(t.name)}<span class="n">${t.count}</span></button>`).join('')}
        </div>
        <div class="seg small" role="radiogroup" aria-label="Tag match">
          <label title="Units with any of the chosen tags"><input type="radio" name="p-mode" value="any" ${pick.mode === 'any' ? 'checked' : ''}>Any tag</label>
          <label title="Units with every chosen tag"><input type="radio" name="p-mode" value="all" ${pick.mode === 'all' ? 'checked' : ''}>All tags</label>
        </div>
      </div>` : ''}
    </div>
    <div class="panel start-bar">
      <div class="summary" id="p-summary"></div>
      <div class="front-choice">Card front ${frontChoiceHTML('p-front')}</div>
      <button class="btn primary big" id="p-start">Start ▶</button>
    </div>
    <div class="list-head">
      <span id="p-shown"></span><span class="spacer"></span>
      <button class="link" id="p-all">Select all shown</button>
      <button class="link" id="p-none">Clear selection</button>
    </div>
    <div class="unit-list" id="p-list"></div>
  </section>`;

  const $list = document.getElementById('p-list');
  const $summary = document.getElementById('p-summary');
  const $start = document.getElementById('p-start');
  let visible = [];

  function matches(u) {
    if (pick.search && !u.name.toLowerCase().includes(pick.search.toLowerCase())) return false;
    if (!pick.tags.size) return true;
    const own = new Set(u.tags.map(t => t.toLowerCase()));
    const wanted = [...pick.tags];
    return pick.mode === 'all' ? wanted.every(t => own.has(t)) : wanted.some(t => own.has(t));
  }

  function renderSummary() {
    const sel = units.filter(u => pick.selected.has(u.id));
    const cards = sel.reduce((n, u) => n + u.cards.length, 0);
    const hidden = sel.filter(u => !visible.includes(u)).length;
    $summary.innerHTML = sel.length
      ? `<strong>${plural(sel.length, 'unit')}</strong> · <strong>${plural(cards, 'card')}</strong>${hidden ? ` <span class="muted">(${hidden} hidden by the filter)</span>` : ''}`
      : 'No units selected';
    $start.disabled = !cards;
  }

  function renderList() {
    visible = units.filter(matches);
    document.getElementById('p-shown').textContent = `Showing ${visible.length} of ${plural(units.length, 'unit')}`;
    $list.innerHTML = visible.length ? visible.map(u => {
      const p = plays.get(u.id);
      return `<label class="unit-row">
        <input type="checkbox" value="${u.id}" ${pick.selected.has(u.id) ? 'checked' : ''}>
        <div class="info">
          <div class="name">${esc(u.name)}</div>
          <div class="meta">${u.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}
            <span>${p ? `played ${plural(p.count, 'time')}, last ${fmtDay(new Date(p.last))}` : 'not played yet'}</span></div>
        </div>
        <span class="count">${plural(u.cards.length, 'card')}</span>
      </label>`;
    }).join('') : `<p class="muted">No units match this filter.</p>`;
    renderSummary();
  }

  $list.addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) pick.selected.add(e.target.value); else pick.selected.delete(e.target.value);
    renderSummary();
  });
  document.getElementById('p-search').addEventListener('input', e => { pick.search = e.target.value.trim(); renderList(); });
  const $tags = document.getElementById('p-tags');
  if ($tags) $tags.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const t = chip.dataset.tag;
    if (pick.tags.has(t)) pick.tags.delete(t); else pick.tags.add(t);
    chip.classList.toggle('on', pick.tags.has(t));
    chip.setAttribute('aria-pressed', pick.tags.has(t));
    renderList();
  });
  document.querySelectorAll('input[name="p-mode"]').forEach(r => r.addEventListener('change', () => { pick.mode = r.value; renderList(); }));
  document.getElementById('p-all').addEventListener('click', () => { visible.forEach(u => pick.selected.add(u.id)); renderList(); });
  document.getElementById('p-none').addEventListener('click', () => { pick.selected.clear(); renderList(); });
  bindFrontChoice('p-front');
  $start.addEventListener('click', () => {
    const ids = units.filter(u => pick.selected.has(u.id)).map(u => u.id);
    Store.prefs.lastSelection = ids;
    Store.save();
    play(gameFromUnits(ids));
  });

  renderList();
}

// ---------------------------------------------------------------- games

function makeGame(entries, source) {
  const units = [...new Map(entries.map(e => [e.unit.id, { id: e.unit.id, name: e.unit.name }])).values()];
  return {
    source,
    units,
    entries: new Map(entries.map(e => [e.card.id, e])),
    total: entries.length,
    queue: shuffle(entries.slice()),
    misses: new Map(),
    knownIds: new Set(),
    knownFirstTry: 0,
    unknownPresses: 0,
    front: Store.prefs.front,
    startedAt: null,
    flipped: false,
    done: false,
  };
}

function gameFromUnits(unitIds) {
  const entries = [];
  unitIds.forEach(id => {
    const u = Store.unit(id);
    if (u) u.cards.forEach(c => entries.push({ card: c, unit: u }));
  });
  return entries.length ? makeGame(entries, { type: 'units', unitIds }) : null;
}

function gameFromCards(cardIds) {
  const map = Store.cardMap();
  const entries = cardIds.map(id => map.get(id)).filter(Boolean);
  return entries.length ? makeGame(entries, { type: 'cards', cardIds }) : null;
}

function gameFromSource(src) {
  return src.type === 'cards' ? gameFromCards(src.cardIds) : gameFromUnits(src.unitIds);
}

function play(game) {
  if (!game) { notice('Nothing to play', 'Those cards no longer exist. They may have been deleted or edited.'); return; }
  pendingGame = game;
  location.hash = '#/run';
}

// ---------------------------------------------------------------- run

function sizeClass(text, steps) {
  const n = [...text].length;
  for (let i = 0; i < steps.length; i++) if (n <= steps[i]) return 's' + (i + 1);
  return 's' + (steps.length + 1);
}

// side: what this face shows ('pm' or 'hanzi'). On the back, `prompt` is the front side, repeated small.
function faceHTML(entry, side, label, prompt, showUnit) {
  const c = entry.card;
  const main = side === 'hanzi'
    ? `<div class="f-hanzi ${sizeClass(c.hanzi, [3, 5, 10])}">${esc(c.hanzi)}</div>`
    : `<div class="f-pinyin">${c.pinyin ? esc(c.pinyin) : '<span class="muted">(no pinyin)</span>'}</div>
       <div class="f-meaning ${c.meaning.length > 60 ? 'long' : ''}">${esc(c.meaning)}</div>`;
  let small = '';
  if (prompt === 'hanzi') small = `<div class="f-prompt"><span class="hz">${esc(c.hanzi)}</span></div>`;
  if (prompt === 'pm') small = `<div class="f-prompt">${esc(c.pinyin)}${c.pinyin ? ' · ' : ''}${esc(c.meaning)}</div>`;
  return `<span class="face-label">${label}</span>${showUnit ? `<span class="face-unit">${esc(entry.unit.name)}</span>` : ''}${main}${small}`;
}

function viewRun() {
  const g = pendingGame;
  if (!g || g.done) { location.replace('#/play'); return; }

  $app.innerHTML = `
  <section class="run">
    <div class="run-bar">
      <div class="run-units" title="${esc(g.units.map(u => u.name).join(', '))}">${esc(g.units.map(u => u.name).join(' · '))}</div>
      <div class="run-stats"><b id="r-known">0</b> / ${g.total} known · <b id="r-miss">0</b> don't know · <b id="r-left">${g.total}</b> left in deck</div>
      <div class="timer" id="r-timer" aria-label="Elapsed time">0:00</div>
    </div>
    <div class="progress" aria-hidden="true"><div id="r-prog"></div></div>
    <div class="card-stage" id="r-stage">
      <div class="card-drag" id="r-drag">
        <div class="card" id="r-card" aria-live="polite">
          <div class="face front" id="r-front"></div>
          <div class="face back" id="r-back"></div>
        </div>
        <div class="swipe-hint yes" id="r-hint-yes">Know ✓</div>
        <div class="swipe-hint no" id="r-hint-no">✗ Don't know</div>
      </div>
    </div>
    <div class="run-controls">
      <button class="btn no" id="r-no">← Don't know</button>
      <button class="btn" id="r-flip">Flip</button>
      <button class="btn yes" id="r-yes">Know →</button>
    </div>
    <p class="hint keys"><kbd>Space</kbd> or <kbd>↑</kbd> flip · <kbd>→</kbd> know · <kbd>←</kbd> don't know (the card goes back into the deck) · <kbd>Esc</kbd> end session</p>
    <p class="hint touch">Tap the card to flip · swipe right if you know it · swipe left if you don't (it goes back into the deck)</p>
    <div class="actions run-end"><button class="btn small" id="r-end">End session</button></div>
  </section>`;

  const $ = id => document.getElementById(id);
  const $card = $('r-card'), $front = $('r-front'), $back = $('r-back'), $stage = $('r-stage');
  const $drag = $('r-drag'), $hintYes = $('r-hint-yes'), $hintNo = $('r-hint-no');
  const backSide = g.front === 'pm' ? 'hanzi' : 'pm';
  const multiUnit = g.units.length > 1;
  let flashTimer = null;

  g.startedAt = Date.now();
  const tick = () => { $('r-timer').textContent = fmtDuration(Date.now() - g.startedAt); };
  const timer = setInterval(tick, 250);

  function show() {
    const e = g.queue[0];
    // back to the front face without animating, so the next card's answer never flashes past
    $card.classList.add('no-anim');
    $card.classList.remove('flipped');
    g.flipped = false;
    $front.innerHTML = faceHTML(e, g.front, SIDES[g.front], null, multiUnit);
    $back.innerHTML = faceHTML(e, backSide, SIDES[backSide], g.front, multiUnit);
    void $card.offsetWidth;
    $card.classList.remove('no-anim');
    $('r-known').textContent = g.knownIds.size;
    $('r-miss').textContent = g.unknownPresses;
    $('r-left').textContent = g.queue.length;
    $('r-prog').style.width = pct(g.knownIds.size, g.total) + '%';
  }

  function flash(kind) {
    clearTimeout(flashTimer);
    $stage.classList.remove('flash-yes', 'flash-no');
    $stage.classList.add('flash-' + kind);
    flashTimer = setTimeout(() => $stage.classList.remove('flash-' + kind), 260);
  }

  function flip() {
    g.flipped = !g.flipped;
    $card.classList.toggle('flipped', g.flipped);
  }

  function know() {
    const e = g.queue.shift();
    g.knownIds.add(e.card.id);
    if (!g.misses.has(e.card.id)) g.knownFirstTry++;
    if (!g.queue.length) { finish(true, true); return; }
    flash('yes');
    show();
  }

  function dontKnow() {
    const e = g.queue.shift();
    g.misses.set(e.card.id, (g.misses.get(e.card.id) || 0) + 1);
    g.unknownPresses++;
    // back into the deck, a few cards later when there are enough left, so it is not seen again straight away
    const min = Math.min(3, g.queue.length);
    g.queue.splice(min + Math.floor(Math.random() * (g.queue.length - min + 1)), 0, e);
    flash('no');
    show();
  }

  async function endEarly() {
    const ans = await ask('End this session?',
      `${plural(g.queue.length, 'card')} still in the deck. What you have answered so far is saved to History.`,
      [{ label: 'Keep playing', value: 'stay' }, { label: 'End session', value: 'end', cls: 'primary', focus: true }]);
    if (ans === 'end') finish(false, true);
  }

  function finish(completed, navigate) {
    if (g.done) return;
    g.done = true;
    clearInterval(timer);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', guard);
    pendingGame = null;

    if (!g.knownIds.size && !g.unknownPresses) {
      if (navigate) location.hash = '#/play';
      return;
    }

    const now = new Date();
    const touched = new Set([...g.knownIds, ...g.misses.keys()]);
    touched.forEach(id => {
      const st = Store.stats(id);
      const m = g.misses.get(id) || 0;
      st.seen++;
      st.misses += m;
      if (g.knownIds.has(id) && !m) st.firstTry++;
      st.lastSeen = now.toISOString();
    });

    const session = {
      id: Store.uid(),
      startedAt: new Date(g.startedAt).toISOString(),
      endedAt: now.toISOString(),
      durationMs: now - g.startedAt,
      completed,
      front: g.front,
      source: g.source,
      units: g.units,
      total: g.total,
      known: g.knownIds.size,
      knownFirstTry: g.knownFirstTry,
      unknownPresses: g.unknownPresses,
      // every card answered, so a merge can rebuild the card stats from sessions
      answered: [...touched],
      // snapshot, so the results page still reads right after a unit is edited or deleted
      missed: [...g.misses].map(([id, misses]) => {
        const { card, unit } = g.entries.get(id);
        return { id, unitId: unit.id, hanzi: card.hanzi, pinyin: card.pinyin, meaning: card.meaning, misses, known: g.knownIds.has(id) };
      }),
    };
    Store.addSession(session);
    if (navigate) location.hash = '#/results/' + session.id;
  }

  function onKey(e) {
    if (dlg.open || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    // Escape too: otherwise the same keypress closes the end-session dialog it just opened
    if (k === ' ' || k === 'Escape' || k.startsWith('Arrow')) e.preventDefault();
    if (e.repeat || busy) return;
    if (k === ' ' || k === 'ArrowUp') flip();
    else if (k === 'ArrowRight') know();
    else if (k === 'ArrowLeft') dontKnow();
    else if (k === 'Escape') endEarly();
  }
  const guard = e => { e.preventDefault(); e.returnValue = ''; };

  // ---- touch / mouse: tap the card to flip, drag it sideways past SWIPE px (or flick it) to answer
  const SWIPE = 90;
  let gesture = null;
  let busy = false;   // true while a swiped card flies off, so nothing answers the next card early

  function setDrag(dx) {
    $drag.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 24}deg)` : '';
    const p = Math.min(1, Math.abs(dx) / SWIPE);
    $hintYes.style.opacity = dx > 0 ? p : 0;
    $hintNo.style.opacity = dx < 0 ? p : 0;
  }

  function flyOut(dir) {
    busy = true;
    $drag.style.transform = `translateX(${dir * window.innerWidth}px) rotate(${dir * 18}deg)`;
    setTimeout(() => {
      $drag.classList.add('dragging');   // snap back to the middle without animating
      setDrag(0);
      busy = false;
      if (dir > 0) know(); else dontKnow();
      void $drag.offsetWidth;
      $drag.classList.remove('dragging');
    }, 180);
  }

  $drag.addEventListener('pointerdown', e => {
    if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dragging: false, samples: [[e.timeStamp, e.clientX]] };
  });
  $drag.addEventListener('pointermove', e => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    if (!gesture.dragging) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
      gesture.dragging = true;
      $drag.setPointerCapture(e.pointerId);
      $drag.classList.add('dragging');
    }
    gesture.dx = dx;
    gesture.samples.push([e.timeStamp, e.clientX]);
    if (gesture.samples.length > 5) gesture.samples.shift();
    setDrag(dx);
  });
  function endGesture(e, cancelled) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const gs = gesture;
    gesture = null;
    if (!gs.dragging) {
      if (!cancelled) flip();
      return;
    }
    $drag.classList.remove('dragging');
    const [t0, x0] = gs.samples[0];
    const [t1, x1] = gs.samples[gs.samples.length - 1];
    const v = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;   // px per ms
    const flick = Math.abs(gs.dx) > 40 && Math.abs(v) > 0.6 && Math.sign(v) === Math.sign(gs.dx);
    if (cancelled || (Math.abs(gs.dx) < SWIPE && !flick)) { setDrag(0); return; }
    flyOut(Math.sign(gs.dx));
  }
  $drag.addEventListener('pointerup', e => endGesture(e, false));
  $drag.addEventListener('pointercancel', e => endGesture(e, true));

  const press = fn => e => { e.currentTarget.blur(); if (!busy) fn(); };
  $('r-yes').addEventListener('click', press(know));
  $('r-no').addEventListener('click', press(dontKnow));
  $('r-flip').addEventListener('click', press(flip));
  $('r-end').addEventListener('click', press(endEarly));
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', guard);
  // leaving through the nav mid-game still records what was answered
  cleanup = () => { if (!g.done) finish(false, false); };

  show();
}

// ---------------------------------------------------------------- results

function missedTableHTML(rows, showKnown) {
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>Hanzi</th><th>Pinyin</th><th>Meaning</th><th class="num">Don't know</th>${showKnown ? '<th></th>' : ''}</tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td class="hz">${esc(r.hanzi)}</td><td>${esc(r.pinyin)}</td><td>${esc(r.meaning)}</td>
      <td class="num">${r.misses}×</td>
      ${showKnown ? `<td>${r.known ? '' : '<span class="badge warn">not finished</span>'}</td>` : ''}
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function viewResults(id) {
  const s = Store.session(id);
  if (!s) { location.replace('#/history'); return; }
  const missed = s.missed.slice().sort((a, b) => b.misses - a.misses);
  const acc = pct(s.knownFirstTry, s.known);

  $app.innerHTML = `
  <section>
    <div class="page-head">
      <div>
        <h1>${s.completed ? 'Session complete' : 'Session ended early'}</h1>
        <p>${esc(s.units.map(u => u.name).join(' · '))} · ${fmtDate(s.startedAt)}</p>
      </div>
    </div>
    <div class="tiles">
      <div class="tile"><div class="k">Time</div><div class="v">${fmtDuration(s.durationMs)}</div><div class="s">${s.known ? `${(s.durationMs / 1000 / s.known).toFixed(1)} s per card` : '&nbsp;'}</div></div>
      <div class="tile"><div class="k">Known</div><div class="v">${s.known} / ${s.total}</div><div class="s">${s.completed ? 'whole deck cleared' : `${s.total - s.known} not reached`}</div></div>
      <div class="tile"><div class="k">Knew first time</div><div class="v">${acc}%</div><div class="s">${plural(s.knownFirstTry, 'card')}</div></div>
      <div class="tile"><div class="k">Don't know presses</div><div class="v">${s.unknownPresses}</div><div class="s">on ${plural(missed.length, 'card')}</div></div>
    </div>
    <div class="panel actions" style="justify-content:flex-start">
      <button class="btn primary" id="x-again" autofocus>Play again</button>
      ${missed.length ? `<button class="btn" id="x-missed">Practice the ${plural(missed.length, 'card')} I missed</button>` : ''}
      <a class="btn" href="#/play">Choose other units</a>
    </div>
    <div class="section">
      <h2>${missed.length ? 'Cards you didn\'t know' : 'You knew every card first time 🎉'}</h2>
      ${missed.length ? `<div class="panel">${missedTableHTML(missed, !s.completed)}</div>` : ''}
    </div>
  </section>`;

  document.getElementById('x-again').addEventListener('click', () => play(gameFromSource(s.source)));
  const $m = document.getElementById('x-missed');
  if ($m) $m.addEventListener('click', () => play(gameFromCards(missed.map(r => r.id))));
  document.getElementById('x-again').focus();
}

// ---------------------------------------------------------------- units

function viewUnits() {
  const units = Store.units();
  if (!units.length) { $app.innerHTML = emptyUnitsHTML(); bindSample(); return; }
  const plays = unitPlays();
  const owner = Store.isOwner();

  $app.innerHTML = `
  <section>
    <div class="page-head">
      <div><h1>Units</h1><p>${plural(units.length, 'unit')} · ${plural(units.reduce((n, u) => n + u.cards.length, 0), 'card')}${owner ? '' : ` · only ${esc(Store.ownerName())} can add or change units`}</p></div>
      ${owner ? '<a class="btn primary" href="#/units/new">+ New unit</a>' : ''}
    </div>
    <div class="unit-list">${units.map(u => {
      const p = plays.get(u.id);
      const seen = u.cards.filter(c => Store.peekStats(c.id).seen).length;
      return `<div class="unit-row">
        <div class="info">
          <div class="name">${esc(u.name)}</div>
          <div class="meta">${u.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}
            <span>${plural(u.cards.length, 'card')} · ${seen} reviewed · ${p ? `played ${plural(p.count, 'time')}` : 'not played yet'}</span></div>
        </div>
        <div class="row-actions">
          <button class="btn small primary" data-play="${u.id}">Play</button>
          ${owner ? `<a class="btn small" href="#/units/${u.id}/edit">Edit</a>
          <button class="btn small danger" data-del="${u.id}">Delete</button>` : ''}
        </div>
      </div>`;
    }).join('')}</div>
  </section>`;

  $app.querySelector('.unit-list').addEventListener('click', async e => {
    const playBtn = e.target.closest('[data-play]');
    if (playBtn) { play(gameFromUnits([playBtn.dataset.play])); return; }
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const u = Store.unit(del.dataset.del);
    const ans = await ask('Delete this unit?',
      `<b>${esc(u.name)}</b> and its ${plural(u.cards.length, 'card')} will be removed for every player. Past sessions stay in History.`,
      [{ label: 'Cancel', value: '', focus: true }, { label: 'Delete', value: 'del', cls: 'primary' }]);
    if (ans === 'del') { Store.deleteUnit(u.id); viewUnits(); }
  });
}

function viewEditor(id) {
  const unit = id ? Store.unit(id) : null;
  if (id && !unit) { location.replace('#/units'); return; }
  const allTags = Store.allTags();

  $app.innerHTML = `
  <section>
    <div class="page-head"><h1>${unit ? 'Edit unit' : 'New unit'}</h1></div>
    <div class="panel">
      <label class="field"><span>Unit name</span>
        <input id="e-name" maxlength="80" placeholder="e.g. HSK 2 – Lesson 3" value="${esc(unit ? unit.name : '')}"></label>
      <label class="field"><span>Tags <em>comma separated</em></span>
        <input id="e-tags" placeholder="e.g. HSK2, food" value="${esc(unit ? unit.tags.join(', ') : '')}"></label>
      ${allTags.length ? `<div class="filter-row" style="margin:-6px 0 14px"><span class="label">Existing tags</span>
        <div class="chips" id="e-tagpick">${allTags.map(t => `<button type="button" class="chip" data-tag="${esc(t.name)}">+ ${esc(t.name)}</button>`).join('')}</div></div>` : ''}
      <label class="field"><span>Cards <em>— one per line: Hanzi, Pinyin, Meaning, split by Tab (a paste from Excel / Google Sheets) or by |</em></span>
        <textarea id="e-cards" rows="12" spellcheck="false" placeholder="你好 | ni3 hao3 | hello&#10;谢谢 | xie4xie5 | thank you">${esc(unit ? unit.cards.map(c => `${c.hanzi} | ${c.pinyin} | ${c.meaning}`).join('\n') : '')}</textarea></label>
      <p class="help">Tone numbers turn into tone marks: <code>ni3 hao3</code> → nǐ hǎo, <code>lv4</code> → lǜ, <code>5</code> = neutral tone. ${unit ? 'Editing keeps each card\'s review stats as long as its Hanzi stays the same.' : ''}</p>
    </div>
    <div class="panel" id="e-preview"></div>
    <div class="actions">
      <a class="btn" href="#/units">Cancel</a>
      <button class="btn primary" id="e-save">Save unit</button>
    </div>
  </section>`;

  const $name = document.getElementById('e-name');
  const $tags = document.getElementById('e-tags');
  const $cards = document.getElementById('e-cards');
  const $preview = document.getElementById('e-preview');
  let timer = null;

  function preview() {
    const r = Pinyin.parseBulk($cards.value);
    if (!r.cards.length && !r.problems.length) {
      $preview.innerHTML = '<p class="muted" style="margin:0">Paste your vocab above and a preview of the cards appears here.</p>';
      return;
    }
    $preview.innerHTML = `
      <div class="preview-head"><strong>${plural(r.cards.length, 'card')} ready</strong>${r.problems.length ? ` · <span class="bad">${plural(r.problems.length, 'line')} will be skipped</span>` : ''}</div>
      ${r.problems.length ? `<ul class="problems">${r.problems.map(p => `<li><b>Line ${p.lineNo}:</b> ${esc(p.reason)} — <code>${esc(p.text.length > 60 ? p.text.slice(0, 60) + '…' : p.text)}</code></li>`).join('')}</ul>` : ''}
      ${r.cards.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th class="num">Line</th><th>Hanzi</th><th>Pinyin</th><th>Meaning</th></tr></thead>
        <tbody>${r.cards.map(c => `<tr><td class="num muted">${c.lineNo}</td><td class="hz">${esc(c.hanzi)}</td><td>${esc(c.pinyin)}</td><td>${esc(c.meaning)}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}`;
  }

  $cards.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(preview, 150); });
  $name.addEventListener('input', () => $name.classList.remove('invalid'));
  const $pick = document.getElementById('e-tagpick');
  if ($pick) $pick.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) $tags.value = parseTags($tags.value + ',' + chip.dataset.tag).join(', ');
  });

  document.getElementById('e-save').addEventListener('click', async () => {
    const name = $name.value.trim();
    if (!name) { $name.classList.add('invalid'); $name.focus(); return; }
    const r = Pinyin.parseBulk($cards.value);
    if (!r.cards.length) { notice('No cards to save', 'Add at least one line with Hanzi, Pinyin and Meaning.'); return; }
    if (r.problems.length) {
      const ans = await ask('Some lines have problems',
        `${plural(r.problems.length, 'line')} will be skipped. Save the other ${plural(r.cards.length, 'card')}?`,
        [{ label: 'Go back and fix', value: '', focus: true }, { label: 'Save anyway', value: 'save', cls: 'primary' }]);
      if (ans !== 'save') return;
    }

    // keep the id (every player's stats hang off it) for cards that survive the edit:
    // same Hanzi and Pinyin first, then same Hanzi alone
    const old = unit ? unit.cards.slice() : [];
    const used = new Set();
    const take = test => { const c = old.find(o => !used.has(o.id) && test(o)); if (c) used.add(c.id); return c; };
    const matched = r.cards.map(c => take(o => o.hanzi === c.hanzi && o.pinyin === c.pinyin));
    const cards = r.cards.map((c, i) => {
      const prev = matched[i] || take(o => o.hanzi === c.hanzi);
      return { id: prev ? prev.id : Store.uid(), hanzi: c.hanzi, pinyin: c.pinyin, meaning: c.meaning };
    });

    const now = new Date().toISOString();
    Store.putUnit({
      id: unit ? unit.id : Store.uid(),
      name,
      tags: parseTags($tags.value),
      cards,
      createdAt: unit ? unit.createdAt : now,
      updatedAt: now,
    });
    location.hash = '#/units';
  });

  preview();
  if (!unit) $name.focus();
}

// ---------------------------------------------------------------- history

function viewHistory() {
  const sessions = Store.sessions().slice().sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  if (!sessions.length) {
    $app.innerHTML = `<section class="empty"><div class="big-hz">史</div><h1>No sessions yet</h1>
      <p>Play a unit and your time, scores and the cards you found hard show up here.</p>
      <div class="actions"><a class="btn primary" href="#/play">Play now</a></div></section>`;
    return;
  }

  const totalMs = sessions.reduce((n, s) => n + s.durationMs, 0);
  const known = sessions.reduce((n, s) => n + s.known, 0);
  const firstTry = sessions.reduce((n, s) => n + s.knownFirstTry, 0);

  // day streak: consecutive days with a session, ending today (or yesterday, if today has none yet)
  const days = new Set(sessions.map(s => dayKey(new Date(s.startedAt))));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }

  const recent = sessions.slice(-30);
  const accPoints = recent.map(s => {
    const a = pct(s.knownFirstTry, s.known);
    return {
      value: a,
      label: fmtDay(new Date(s.startedAt)),
      tip: `<b>${a}%</b> knew first time<br>${esc(s.units.map(u => u.name).join(', '))}<br>${fmtDate(s.startedAt)} · ${fmtDuration(s.durationMs)}`,
    };
  });

  const minutesByDay = new Map();
  sessions.forEach(s => {
    const k = dayKey(new Date(s.startedAt));
    minutesByDay.set(k, (minutesByDay.get(k) || 0) + s.durationMs / 60000);
  });
  const dayPoints = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const mins = minutesByDay.get(dayKey(day)) || 0;
    const count = sessions.filter(s => dayKey(new Date(s.startedAt)) === dayKey(day)).length;
    dayPoints.push({
      value: mins,
      label: i === 0 ? 'Today' : fmtDay(day),
      tip: `<b>${mins < 1 && mins > 0 ? '<1' : Math.round(mins)} min</b><br>${fmtDay(day)} · ${plural(count, 'session')}`,
    });
  }

  const hardest = [...Store.cardMap().values()]
    .map(e => ({ ...e, st: Store.peekStats(e.card.id) }))
    .filter(e => e.st.misses > 0)
    .sort((a, b) => (b.st.misses / b.st.seen) - (a.st.misses / a.st.seen) || b.st.misses - a.st.misses)
    .slice(0, 15);

  $app.innerHTML = `
  <section>
    <div class="page-head"><div><h1>History</h1><p>Stats and progress for <b>${esc(Store.profile().name)}</b>.</p></div></div>
    <div class="tiles">
      <div class="tile"><div class="k">Sessions</div><div class="v">${sessions.length}</div><div class="s">${plural(days.size, 'day')} studied</div></div>
      <div class="tile"><div class="k">Study time</div><div class="v">${fmtDuration(totalMs)}</div><div class="s">${fmtDuration(totalMs / sessions.length)} per session</div></div>
      <div class="tile"><div class="k">Cards known</div><div class="v">${known}</div><div class="s">${pct(firstTry, known)}% first time</div></div>
      <div class="tile"><div class="k">Day streak</div><div class="v">${streak}</div><div class="s">${streak ? 'keep it going' : 'play today to start one'}</div></div>
    </div>
    <div class="charts">
      <div class="panel"><h2>Knew first time</h2><p class="chart-sub">Share of cards you pressed → on without a ← first · last ${plural(recent.length, 'session')}</p><div id="h-acc"></div></div>
      <div class="panel"><h2>Minutes studied</h2><p class="chart-sub">Per day · last 14 days</p><div id="h-days"></div></div>
    </div>

    ${hardest.length ? `
    <div class="section">
      <div class="page-head" style="margin-bottom:10px"><h2 style="margin:0">Hardest cards</h2>
        <button class="btn small" id="h-practice">Practice these ${hardest.length}</button></div>
      <div class="panel"><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Hanzi</th><th>Pinyin</th><th>Meaning</th><th>Unit</th><th class="num">Sessions</th><th class="num">Don't know</th></tr></thead>
        <tbody>${hardest.map(({ card: c, unit: u, st }) => `<tr>
          <td class="hz">${esc(c.hanzi)}</td><td>${esc(c.pinyin)}</td><td>${esc(c.meaning)}</td><td class="muted">${esc(u.name)}</td>
          <td class="num">${st.seen}</td><td class="num">${st.misses}×</td></tr>`).join('')}</tbody>
      </table></div></div>
    </div>` : ''}

    <div class="section">
      <h2>All sessions</h2>
      <div class="panel"><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Units</th><th class="num">Cards</th><th class="num">First time</th><th class="num">Don't know</th><th class="num">Time</th></tr></thead>
        <tbody id="h-rows">${sessions.slice().reverse().map(s => `<tr class="clickable" data-id="${s.id}">
          <td style="white-space:nowrap"><a href="#/results/${s.id}">${fmtDate(s.startedAt)}</a></td>
          <td>${esc(s.units.map(u => u.name).join(', '))}${s.completed ? '' : ' <span class="badge warn">ended early</span>'}</td>
          <td class="num">${s.known}/${s.total}</td>
          <td class="num">${pct(s.knownFirstTry, s.known)}%</td>
          <td class="num">${s.unknownPresses}</td>
          <td class="num">${fmtDuration(s.durationMs)}</td></tr>`).join('')}</tbody>
      </table></div></div>
    </div>
  </section>`;

  const draw = () => {
    Charts.line(document.getElementById('h-acc'), accPoints, { ariaLabel: 'Percent of cards known first time, per session' });
    Charts.bars(document.getElementById('h-days'), dayPoints, { ariaLabel: 'Minutes studied per day, last 14 days' });
  };
  draw();
  let rt = null;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(draw, 120); };
  window.addEventListener('resize', onResize);
  cleanup = () => window.removeEventListener('resize', onResize);

  document.getElementById('h-rows').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && !e.target.closest('a')) location.hash = '#/results/' + tr.dataset.id;
  });
  const $p = document.getElementById('h-practice');
  if ($p) $p.addEventListener('click', () => play(gameFromCards(hardest.map(e => e.card.id))));
}

// ---------------------------------------------------------------- settings

function viewSettings() {
  const s = Store.settings;
  const me = Store.profile();
  const owner = Store.isOwner();
  const rows = owner ? Store.profiles().filter(p => p.id !== 'guest') : [me];

  $app.innerHTML = `
  <section>
    <div class="page-head"><div><h1>Settings</h1><p>Playing as <b>${esc(me.name)}</b> · <a href="#/who">switch player</a></p></div></div>
    <div class="panel">
      <div class="setting">
        <div><b>Card front</b><div class="desc">Which side ${esc(me.name)} sees first. The other side is the answer.</div></div>
        ${frontChoiceHTML('s-front')}
      </div>
      <div class="setting">
        <div><b>Theme</b><div class="desc">For everyone on this device.</div></div>
        <div class="seg small" role="radiogroup" aria-label="Theme">
          ${['auto', 'light', 'dark'].map(t => `<label><input type="radio" name="s-theme" value="${t}" ${s.theme === t ? 'checked' : ''}>${t[0].toUpperCase() + t.slice(1)}</label>`).join('')}
        </div>
      </div>
    </div>
    ${me.id === 'guest' ? `
    <div class="panel">
      <h2>Guest</h2>
      <p class="muted" style="margin:0">Guest can play everything, but nothing is kept: the history is cleared each time a player is picked on the Who's playing screen.</p>
    </div>` : `
    <div class="panel" id="s-profiles">
      <h2>${owner ? 'Players' : 'Your profile'}</h2>
      ${rows.map(p => `
      <div class="setting profile-row">
        <label class="profile-name">${avatarHTML(p)}<input data-rename="${p.id}" value="${esc(p.name)}" maxlength="24" aria-label="Name of ${esc(p.name)}"></label>
        <div class="row-actions">
          <span class="desc">${plural(Store.sessionCount(p.id), 'session')}</span>
          <button class="btn small danger" data-clear="${p.id}">Clear history</button>
        </div>
      </div>`).join('')}
      ${owner ? '<p class="desc muted" style="margin:8px 0 0">The first player owns the units: only they can add, edit or delete them. Guest is always called Guest.</p>' : ''}
    </div>`}
    ${owner ? `
    <div class="panel">
      <h2>Backup and other devices</h2>
      <p class="desc muted" style="margin-top:-6px">Units and every player's history are stored only on this device. To copy them to another device, export here and import the file there. Importing adds what is new and keeps what is already on the device, so two devices can swap files back and forth. On iPhone and iPad, the Home Screen app and Safari keep separate data.</p>
      <div class="actions" style="justify-content:flex-start">
        <button class="btn" id="s-export">Export everything</button>
        <button class="btn" id="s-export-units">Export units only</button>
        <button class="btn" id="s-import">Import…</button>
        <input type="file" id="s-file" accept=".json,application/json" hidden>
      </div>
      <p class="desc muted" style="margin:10px 0 0">Units only leaves out the players and their history: use it to give your units to someone for their own phone.</p>
    </div>
    <div class="panel">
      <h2>Reset</h2>
      <div class="actions" style="justify-content:flex-start">
        <button class="btn danger" id="s-clear-all">Delete everything</button>
      </div>
    </div>` : ''}
  </section>`;

  bindFrontChoice('s-front');
  document.querySelectorAll('input[name="s-theme"]').forEach(r => r.addEventListener('change', () => {
    s.theme = r.value;
    Store.save();
    applyTheme();
  }));

  const $profiles = document.getElementById('s-profiles');
  if ($profiles) {
    $profiles.addEventListener('change', e => {
      const id = e.target.dataset.rename;
      if (!id) return;
      const p = Store.profiles().find(x => x.id === id);
      if (!Store.renameProfile(id, e.target.value)) { e.target.value = p.name; return; }
      e.target.value = p.name;
      e.target.previousElementSibling.outerHTML = avatarHTML(p);
      renderWhoChip();
    });
    $profiles.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.rename) e.target.blur(); });
    $profiles.addEventListener('click', async e => {
      const b = e.target.closest('[data-clear]');
      if (!b) return;
      const p = Store.profiles().find(x => x.id === b.dataset.clear);
      const ans = await ask(`Clear ${p.name}'s history?`, 'Their sessions and card stats are removed. The units stay.',
        [{ label: 'Cancel', value: '', focus: true }, { label: 'Clear history', value: 'go', cls: 'primary' }]);
      if (ans === 'go') { Store.clearHistory(p.id); viewSettings(); }
    });
  }

  if (!owner) return;

  async function sendFile(json, name, title) {
    // phones and tablets: the share sheet (Save to Files, AirDrop, …); a download is unreliable in a Home Screen app
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare) {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title }); } catch (err) { /* closed the share sheet */ }
        return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  document.getElementById('s-export').addEventListener('click', () =>
    sendFile(Store.exportJSON(), `flashcards-backup-${dayKey(new Date())}.json`, 'Flashcards backup'));
  document.getElementById('s-export-units').addEventListener('click', () =>
    sendFile(Store.exportUnitsJSON(), `flashcards-units-${dayKey(new Date())}.json`, 'Flashcards units'));

  const names = list => esc(list.slice(0, 3).join(', ')) + (list.length > 3 ? ` and ${list.length - 3} more` : '');
  function mergeItems(m) {
    const li = [];
    if (m.added.length) li.push(`adds ${plural(m.added.length, 'unit')}: ${names(m.added)}`);
    if (m.updated.length) li.push(`updates ${plural(m.updated.length, 'unit')} to the newer version in the file: ${names(m.updated)}`);
    if (m.removed.length) li.push(`deletes ${plural(m.removed.length, 'unit')} that ${m.removed.length === 1 ? 'was' : 'were'} deleted on the device the file came from: ${names(m.removed)}`);
    m.renamed.forEach(r => li.push(`renames ${esc(r.from)} to ${esc(r.to)}`));
    m.sessions.forEach(s => li.push(`adds ${plural(s.count, 'session')} to ${esc(s.name)}'s history${s.nameThere ? ` (called ${esc(s.nameThere)} in the file)` : ''}`));
    return li.length ? `<ul class="dlg-list">${li.map(x => `<li>${x}</li>`).join('')}</ul>` : '';
  }

  const $file = document.getElementById('s-file');
  document.getElementById('s-import').addEventListener('click', () => $file.click());
  $file.addEventListener('change', async () => {
    const f = $file.files[0];
    $file.value = '';
    if (!f) return;
    let plan;
    try {
      plan = Store.planImport(await f.text());
    } catch (err) {
      notice('Import failed', esc(err.message || 'The file could not be read.'));
      return;
    }

    const file = `<b>${esc(f.name)}</b>`;
    const when = plan.exportedAt ? ` from ${esc(fmtDate(plan.exportedAt))}` : '';
    const items = mergeItems(plan.merge);
    let ans;
    if (plan.kind === 'units') {
      if (!items) { notice('Nothing new', `This device already has every unit in ${file}.`); return; }
      ans = await ask('Import units?',
        `<p>${file} is a units file${when} with ${plural(plan.units, 'unit')}. Importing it:</p>${items}
         <p class="muted">Players and their history are not touched.</p>`,
        [{ label: 'Cancel', value: '' }, { label: 'Import units', value: 'merge', cls: 'primary', focus: true }]);
    } else {
      const who = plan.players.length ? ` (${esc(plan.players.join(', '))})` : '';
      const byPlace = plan.merge.sessions.some(s => s.nameThere) ? '<p class="muted">Players are matched by their place in the list, not by name.</p>' : '';
      ans = await ask('Import backup?',
        `<p>${file} is a full backup${when}: ${plural(plan.units, 'unit')} and ${plural(plan.sessions, 'session')}${who}.</p>
         ${items ? `<p>Merging keeps everything on this device and:</p>${items}${byPlace}` : '<p>This device already has everything in it, so merging changes nothing.</p>'}
         <p class="muted">Replace everything makes this device an exact copy of the file instead.</p>`,
        [{ label: 'Cancel', value: '', focus: !items }, { label: 'Replace everything', value: 'replace', cls: 'danger' }]
          .concat(items ? [{ label: 'Merge', value: 'merge', cls: 'primary', focus: true }] : []));
    }
    if (ans !== 'merge' && ans !== 'replace') return;

    const { units, edited, sessions } = plan.lost || {};
    if (ans === 'replace' && (units || edited || sessions)) {
      const only = [units && plural(units, 'unit'), sessions && plural(sessions, 'session')].filter(Boolean).join(' and ');
      const lost = [only && `deletes ${only} that ${units + sessions === 1 ? 'is' : 'are'} only on this device`,
        edited && `undoes newer edits to ${plural(edited, 'unit')}`].filter(Boolean).join(' and ');
      const sure = await ask('Replace everything?', `Replacing ${lost}.`,
        [{ label: 'Cancel', value: '', focus: true }, { label: 'Replace everything', value: 'go', cls: 'primary' }]);
      if (sure !== 'go') return;
    }

    plan.apply(ans);
    pick.selected = null;
    if (ans === 'replace') {
      applyTheme();
      await notice('Backup imported', `This device is now a copy of the file: ${plural(Store.units().length, 'unit')}.`);
      location.hash = '#/who';
    } else {
      viewSettings();
      renderWhoChip();
      notice('Imported', `This device now has ${plural(Store.units().length, 'unit')}.`);
    }
  });

  document.getElementById('s-clear-all').addEventListener('click', async () => {
    const ans = await ask('Delete everything?', 'All units, players\' names and every player\'s history on this device are removed. Export a backup first if you might want them back.',
      [{ label: 'Cancel', value: '', focus: true }, { label: 'Delete everything', value: 'go', cls: 'primary' }]);
    if (ans === 'go') { Store.clearAll(); pick.selected = null; applyTheme(); location.hash = '#/who'; }
  });
}

// ---------------------------------------------------------------- start

Store.load();
applyTheme();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
// offline support for the Home Screen app; service workers don't run from a file:// page
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

// "Who's playing?" every time the app opens, and again when it comes back after a long time away
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 10 * 60 * 1000 && !pendingGame && !location.hash.startsWith('#/who')) location.hash = '#/who';
});

window.addEventListener('hashchange', route);
history.replaceState(null, '', '#/who');
route();
