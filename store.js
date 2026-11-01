'use strict';
// All data lives in this browser's localStorage under one key.
// Export / Import on the Settings page is the backup and the way to move to another device.
// Importing merges by default (see merge()), so two devices can swap files back and forth.
//
// Units are shared by every profile; only the owner profile changes them. Each profile keeps its
// own sessions, per-card stats and preferences under play[profileId]. Guest's are wiped whenever
// a profile is picked on the "Who's playing?" screen.

const Store = (() => {
  const KEY = 'cnFlashcards.v2';
  const V1_KEY = 'cnFlashcards.v1';
  const PROFILE_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'guest'];
  let data = null;

  const blankStats = () => ({ seen: 0, firstTry: 0, misses: 0, lastSeen: null });
  const blankPlay = () => ({ sessions: [], stats: {}, prefs: { front: 'pm', lastSelection: [] } });
  const defaultName = id => (id === 'p1' ? 'Me' : id === 'guest' ? 'Guest' : 'Player ' + id.slice(1));

  function blank() {
    const play = {};
    PROFILE_IDS.forEach(id => { play[id] = blankPlay(); });
    return {
      version: 2,
      units: [],
      profiles: PROFILE_IDS.map(id => ({ id, name: defaultName(id) })),
      active: 'p1',
      play,
      settings: { theme: 'auto' },
      // unit id -> when it was deleted, so a merge deletes it on the other device too
      removed: {},
    };
  }

  function cleanUnits(units) {
    return units.filter(u => u && typeof u === 'object' && u.id).map(u => ({
      id: u.id, name: String(u.name || 'Untitled'),
      tags: Array.isArray(u.tags) ? u.tags : [],
      cards: (Array.isArray(u.cards) ? u.cards : []).map(c => ({ id: c.id, hanzi: c.hanzi, pinyin: c.pinyin || '', meaning: c.meaning || '' })),
      createdAt: u.createdAt, updatedAt: u.updatedAt,
    }));
  }

  // v1 had one person: stats on each card, sessions and settings at the top. It all becomes "Me".
  function fromV1(d) {
    const b = blank();
    b.units = cleanUnits(d.units);
    const me = b.play.p1;
    d.units.forEach(u => (u.cards || []).forEach(c => { if (c.stats && c.stats.seen) me.stats[c.id] = Object.assign(blankStats(), c.stats); }));
    me.sessions = Array.isArray(d.sessions) ? d.sessions : [];
    if (d.settings) {
      if (d.settings.front) me.prefs.front = d.settings.front;
      if (Array.isArray(d.settings.lastSelection)) me.prefs.lastSelection = d.settings.lastSelection;
      if (d.settings.theme) b.settings.theme = d.settings.theme;
    }
    return b;
  }

  function normalize(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.units)) return null;
    if (d.version !== 2) return fromV1(d);
    const b = blank();
    b.units = cleanUnits(d.units);
    const names = new Map((Array.isArray(d.profiles) ? d.profiles : []).map(p => [p.id, p.name]));
    b.profiles.forEach(p => { if (names.get(p.id) && p.id !== 'guest') p.name = String(names.get(p.id)); });
    PROFILE_IDS.forEach(id => {
      const src = (d.play && d.play[id]) || {};
      const dst = b.play[id];
      dst.sessions = Array.isArray(src.sessions) ? src.sessions : [];
      dst.stats = src.stats && typeof src.stats === 'object' ? src.stats : {};
      Object.assign(dst.prefs, src.prefs || {});
    });
    if (PROFILE_IDS.includes(d.active)) b.active = d.active;
    Object.assign(b.settings, d.settings || {});
    b.removed = cleanRemoved(d.removed);
    return b;
  }

  function cleanRemoved(r) {
    return Object.fromEntries(Object.entries(r && typeof r === 'object' ? r : {}).filter(([, t]) => typeof t === 'string'));
  }

  function load() {
    try {
      data = normalize(JSON.parse(localStorage.getItem(KEY))) || normalize(JSON.parse(localStorage.getItem(V1_KEY))) || blank();
    } catch (e) {
      data = blank();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      alert('Could not save: browser storage is full or blocked. Export a backup from Settings.');
      return false;
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const mine = () => data.play[data.active];

  // stats left behind by cards that no longer exist, in every profile
  function pruneStats(d = data) {
    const live = new Set();
    d.units.forEach(u => u.cards.forEach(c => live.add(c.id)));
    PROFILE_IDS.forEach(id => {
      const st = d.play[id].stats;
      Object.keys(st).forEach(k => { if (!live.has(k)) delete st[k]; });
      const p = d.play[id].prefs;
      p.lastSelection = p.lastSelection.filter(uidSel => d.units.some(u => u.id === uidSel));
    });
  }

  // ---- merging an imported file

  const stamp = u => u.updatedAt || u.createdAt || '';
  const latest = (...ts) => ts.filter(Boolean).sort().pop() || null;

  // The card stats a list of sessions adds up to. Sessions from before `answered` was recorded
  // add nothing: their share is only in the stored stats (see legacyStats).
  function statsFromSessions(sessions) {
    const out = {};
    sessions.forEach(s => {
      if (!Array.isArray(s.answered)) return;
      const missed = new Map((s.missed || []).map(m => [m.id, m.misses]));
      s.answered.forEach(id => {
        const st = out[id] || (out[id] = blankStats());
        const m = missed.get(id) || 0;
        st.seen++;
        st.misses += m;
        if (!m) st.firstTry++;
        st.lastSeen = latest(st.lastSeen, s.endedAt);
      });
    });
    return out;
  }

  // The part of a profile's stats its sessions can't rebuild.
  function legacyStats(play) {
    const rebuilt = statsFromSessions(play.sessions);
    const out = {};
    Object.entries(play.stats).forEach(([id, st]) => {
      const r = rebuilt[id] || blankStats();
      const seen = (st.seen || 0) - r.seen;
      if (seen > 0) out[id] = { seen, firstTry: Math.max(0, (st.firstTry || 0) - r.firstTry), misses: Math.max(0, (st.misses || 0) - r.misses), lastSeen: st.lastSeen || null };
    });
    return out;
  }

  // Sessions are matched by id and both sides' are kept. Stats are rebuilt from the merged
  // sessions, so a card played on both devices counts every time and a file imported twice
  // counts once. The older un-rebuildable part takes the larger side rather than adding the two,
  // since both devices usually got it from the same backup.
  function mergePlay(here, there) {
    const have = new Set(here.sessions.map(s => s.id));
    const added = there.sessions.filter(s => s && s.id && !have.has(s.id));
    const sessions = here.sessions.concat(added).sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
    const stats = statsFromSessions(sessions);
    const a = legacyStats(here), b = legacyStats(there);
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach(id => {
      const x = a[id], y = b[id];
      const old = !y || (x && x.seen >= y.seen) ? x : y;
      const st = stats[id] || (stats[id] = blankStats());
      st.seen += old.seen;
      st.firstTry += old.firstTry;
      st.misses += old.misses;
      st.lastSeen = latest(st.lastSeen, x && x.lastSeen, y && y.lastSeen);
    });
    return { play: { sessions, stats, prefs: here.prefs }, added: added.length };
  }

  // Combines a file into a copy of this device's data; nothing on either side is lost.
  // Units are matched by id and the later edit wins; a unit deleted on one side is deleted on the
  // other unless it was edited after that. Players are matched by position (player 2 with
  // player 2). Names stay as they are here, except one this device never changed; card front and
  // theme stay as they are here. Guest is skipped.
  function merge(local, file, unitsOnly) {
    const out = JSON.parse(JSON.stringify(local));
    const sum = { added: [], updated: [], removed: [], renamed: [], sessions: [] };

    Object.entries(file.removed).forEach(([id, t]) => { if (!out.removed[id] || t > out.removed[id]) out.removed[id] = t; });
    const fresh = [];
    file.units.forEach(u => {
      const i = out.units.findIndex(x => x.id === u.id);
      if (i < 0) {
        if (out.removed[u.id] && out.removed[u.id] >= stamp(u)) return;
        fresh.push(u);
        sum.added.push(u.name);
      } else if (stamp(u) > stamp(out.units[i])) {
        out.units[i] = u;
        sum.updated.push(u.name);
      }
    });
    out.units = fresh.concat(out.units).filter(u => {
      const t = out.removed[u.id];
      if (!t) return true;
      if (stamp(u) > t) { delete out.removed[u.id]; return true; }
      sum.removed.push(u.name);
      return false;
    });

    if (!unitsOnly) {
      out.profiles.forEach(p => {
        if (p.id === 'guest') return;
        const theirs = (file.profiles.find(x => x.id === p.id) || {}).name;
        const nameThere = theirs && theirs !== p.name && theirs !== defaultName(p.id) ? theirs : null;
        if (nameThere && p.name === defaultName(p.id)) {
          sum.renamed.push({ from: p.name, to: theirs });
          p.name = theirs;
        }
        const m = mergePlay(out.play[p.id], file.play[p.id]);
        out.play[p.id] = m.play;
        if (m.added) sum.sessions.push({ name: p.name, count: m.added, nameThere: p.name === theirs ? null : nameThere });
      });
    }

    pruneStats(out);
    sum.changed = !!(sum.added.length || sum.updated.length || sum.removed.length || sum.renamed.length || sum.sessions.length);
    return { result: out, summary: sum };
  }

  // What "Replace everything" would throw away: units and sessions only this device has, and
  // units edited here after the file's copy.
  function lostOnReplace(file) {
    const theirs = new Map(file.units.map(u => [u.id, u]));
    const units = data.units.filter(u => !theirs.has(u.id)).length;
    const edited = data.units.filter(u => theirs.has(u.id) && stamp(u) > stamp(theirs.get(u.id))).length;
    let sessions = 0;
    PROFILE_IDS.forEach(id => {
      if (id === 'guest') return;
      const ids = new Set(file.play[id].sessions.map(s => s.id));
      sessions += data.play[id].sessions.filter(s => !ids.has(s.id)).length;
    });
    return { units, edited, sessions };
  }

  return {
    load, save, uid, blankStats,

    // ---- profiles
    profiles: () => data.profiles,
    profile: () => data.profiles.find(p => p.id === data.active),
    isOwner: () => data.active === 'p1',
    ownerName: () => data.profiles[0].name,
    // has anyone made anything on this device yet
    inUse: () => data.units.length > 0 || PROFILE_IDS.some(id => id !== 'guest' && data.play[id].sessions.length > 0),
    sessionCount: id => data.play[id].sessions.length,
    // Picking a profile always starts Guest from nothing: a new guest is a new person.
    setActive(id) {
      if (!PROFILE_IDS.includes(id)) return;
      data.play.guest = blankPlay();
      data.active = id;
      save();
    },
    renameProfile(id, name) {
      const p = data.profiles.find(x => x.id === id);
      name = String(name).trim().slice(0, 24);
      if (!p || id === 'guest' || !name) return false;
      p.name = name;
      save();
      return true;
    },

    // ---- per profile
    get prefs() { return mine().prefs; },
    sessions: () => mine().sessions,
    session: id => mine().sessions.find(s => s.id === id),
    addSession(s) { mine().sessions.push(s); save(); },
    stats(cardId) {
      const st = mine().stats;
      if (!st[cardId]) st[cardId] = blankStats();
      return st[cardId];
    },
    peekStats: cardId => mine().stats[cardId] || blankStats(),
    clearHistory(id = data.active) {
      const prefs = data.play[id].prefs;
      data.play[id] = blankPlay();
      data.play[id].prefs = prefs;
      save();
    },

    // ---- shared by every profile on this device
    get settings() { return data.settings; },
    units: () => data.units,
    unit: id => data.units.find(u => u.id === id),
    putUnit(u) {
      const i = data.units.findIndex(x => x.id === u.id);
      if (i >= 0) data.units[i] = u; else data.units.unshift(u);
      pruneStats();
      save();
    },
    deleteUnit(id) {
      data.units = data.units.filter(u => u.id !== id);
      data.removed[id] = new Date().toISOString();
      pruneStats();
      save();
    },

    // [{ name, count }] sorted by name; tags match case-insensitively
    allTags() {
      const m = new Map();
      data.units.forEach(u => u.tags.forEach(t => {
        const k = t.toLowerCase();
        if (m.has(k)) m.get(k).count++; else m.set(k, { name: t, count: 1 });
      }));
      return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    // card id -> { card, unit }
    cardMap() {
      const m = new Map();
      data.units.forEach(u => u.cards.forEach(c => m.set(c.id, { card: c, unit: u })));
      return m;
    },

    exportJSON: () => JSON.stringify({ ...data, kind: 'backup', exportedAt: new Date().toISOString() }, null, 1),
    // no players or history: for giving the units to someone else
    exportUnitsJSON: () => JSON.stringify({ version: 2, kind: 'units', exportedAt: new Date().toISOString(), units: data.units, removed: data.removed }, null, 1),

    // Reads a file and works out what importing it would do, without changing anything yet.
    // A backup from before profiles (v1) is accepted too; its history lands on profile 1.
    planImport(text) {
      let d = null;
      try { d = JSON.parse(text); } catch (e) { /* not JSON: refused below */ }
      const unitsOnly = !!(d && d.kind === 'units' && Array.isArray(d.units));
      const file = unitsOnly ? { units: cleanUnits(d.units), removed: cleanRemoved(d.removed) } : normalize(d);
      if (!file) throw new Error('This is not a flashcards backup or units file.');
      const { result, summary } = merge(data, file, unitsOnly);
      const players = unitsOnly ? [] : file.profiles.filter(p => p.id !== 'guest' && file.play[p.id].sessions.length);
      return {
        kind: unitsOnly ? 'units' : 'backup',
        exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : null,
        units: file.units.length,
        sessions: players.reduce((n, p) => n + file.play[p.id].sessions.length, 0),
        players: players.map(p => p.name),
        merge: summary,
        lost: unitsOnly ? null : lostOnReplace(file),
        apply(how) {
          if (how === 'replace' && !unitsOnly) { data = file; data.active = 'p1'; } else data = result;
          save();
        },
      };
    },
    clearAll() { data = blank(); save(); },
  };
})();
