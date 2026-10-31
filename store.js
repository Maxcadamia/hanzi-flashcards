'use strict';
// All data lives in this browser's localStorage under one key.
// Export / Import on the Settings page is the backup and the way to move to another device.
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
    };
  }

  function cleanUnits(units) {
    return units.filter(u => u && typeof u === 'object').map(u => ({
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
    return b;
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
  function pruneStats() {
    const live = new Set();
    data.units.forEach(u => u.cards.forEach(c => live.add(c.id)));
    PROFILE_IDS.forEach(id => {
      const st = data.play[id].stats;
      Object.keys(st).forEach(k => { if (!live.has(k)) delete st[k]; });
      const p = data.play[id].prefs;
      p.lastSelection = p.lastSelection.filter(uidSel => data.units.some(u => u.id === uidSel));
    });
  }

  return {
    load, save, uid, blankStats,

    // ---- profiles
    profiles: () => data.profiles,
    profile: () => data.profiles.find(p => p.id === data.active),
    isOwner: () => data.active === 'p1',
    ownerName: () => data.profiles[0].name,
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

    exportJSON: () => JSON.stringify(data, null, 1),
    // a backup from before profiles (v1) is accepted too; its history lands on profile 1
    importJSON(text) {
      const d = normalize(JSON.parse(text));
      if (!d) throw new Error('This file is not a flashcards backup.');
      d.active = 'p1';
      data = d;
      save();
    },
    clearAll() { data = blank(); save(); },
  };
})();
