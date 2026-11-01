#!/usr/bin/env node
/* =============================================================================
   IDOL EMPIRE — save compatibility check
   =============================================================================
   The game is live and every player's run is a JSON blob in their own browser.
   A merge to `master` is a deploy, so a build that cannot read the saves the
   PREVIOUS build wrote breaks real runs in progress. This script is the gate:

     node test/saves.js                  # production (origin/master) vs working tree
     node test/saves.js --base <ref>     # any git ref as the "old" build
     node test/saves.js --snapshot       # also keep the old build's saves as fixtures

   What it does, with no dependencies beyond Node itself:

     1. Loads the OLD build's js/ straight out of git (`git show <ref>:js/...`)
        into a sandbox with a fake localStorage and a do-nothing DOM, and plays
        three seeded careers on autopilot — signing, debuting, releasing,
        booking, renewing, answering scandals, graduating, disbanding — keeping
        the raw localStorage value and the exported file at several points.
     2. Adds every committed fixture in test/saves/ — saves from builds long
        gone, which is the only way a three-releases-old file stays tested.
     3. For each save, boots the NEW build fresh and checks that:
          - KP.load() reads the localStorage value and KP.importSave() the file;
          - nothing a player would call data loss changed: identity, money, the
            calendar, the roster, every group, the discography, trophies,
            awards, reviews, records and career counters;
          - every tab renders with no NaN / undefined in the HTML;
          - 26 more weeks play with no exception and no non-finite number;
          - a save → load round trip on the new build is lossless.

   Exit code 0 = safe to merge, 1 = a save broke (each failure is printed).
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'saves');
const FILES = ['js/data.js', 'js/state.js', 'js/engine.js', 'js/ui.js'];
const SAVE_KEY = 'idol_empire_save_v1';
const SEEDS = [11, 2024, 90210];
const SNAP_WEEKS = [6, 60, 170];     // a fresh run, a second-year run, a long run
const PLAY_AFTER = 26;

/* ------------------------------- arguments -------------------------------- */
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const SNAPSHOT = args.includes('--snapshot');
let BASE = opt('--base');

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

if (!BASE) {
  // Production is whatever master holds on GitHub. Refresh it if we can; an
  // offline run falls back to the last fetched copy rather than refusing.
  try { git('fetch', '--quiet', 'origin', 'master'); } catch (e) { /* offline */ }
  BASE = ['origin/master', 'master'].find(r => { try { git('rev-parse', '--verify', r); return true; } catch (e) { return false; } });
  if (!BASE) { console.error('No origin/master or master to compare against — pass --base <ref>.'); process.exit(2); }
}

/* ------------------------------- the sandbox ------------------------------- */
function sourcesFromRef(ref) {
  return FILES.map(f => ({ f, src: git('show', ref + ':' + f) }));
}
function sourcesFromDisk() {
  return FILES.map(f => ({ f, src: fs.readFileSync(path.join(ROOT, f), 'utf8') }));
}
function tabsFrom(mainSrc) {
  const m = /const tabs = (\[[^\]]*\])/.exec(mainSrc);
  return m ? JSON.parse(m[1].replace(/'/g, '"')) : ['dash'];
}

// A seeded Math.random, so a failure is a run you can replay rather than a rumour.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function boot(sources, seed) {
  const store = new Map();
  const nodes = {};
  const el = () => ({
    textContent: '', innerHTML: '', scrollTop: 0, hidden: false, value: '', style: {}, dataset: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, remove() {}, addEventListener() {}, querySelector: () => el(), querySelectorAll: () => []
  });
  const ctx = {
    console,
    document: {
      querySelector: (s) => nodes[s] || (nodes[s] = el()),
      querySelectorAll: () => [],
      createElement: () => el(),
      addEventListener() {}
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); }
    },
    setTimeout: () => 0, clearTimeout() {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ctx.__rng = mulberry32(seed);
  vm.runInContext('Math.random = __rng;', ctx);
  sources.forEach(({ f, src }) => vm.runInContext(src, ctx, { filename: f }));
  return { ctx, KP: ctx.KP, store, stage: () => (nodes['#stage'] || el()).innerHTML };
}

/* ------------------------------- autopilot --------------------------------- */
/* Plays like a reasonable, slightly reckless person, so the saves it leaves are
   full of the things real saves are full of: groups, units, releases, bookings,
   debts, deals, contracts, scandals, departures. Every call is optional — an
   older build may not have the function — and a refusal is just a refusal. */
function act(fn) { try { return fn(); } catch (e) { return null; } }

function autopilotWeek(game, i) {
  const KP = game.KP, E = KP.engine, st = KP.state, U = KP.util;
  if (!st || st.over) return;
  // Keep the lights on: a broke agency stops producing interesting saves.
  if (st.company.money < 3e8) st.company.money += 2e9;

  // Answer any open question the way a player would, sometimes not at all.
  if (st.scandal && E.scandalOptions && i % 3) {
    const opts = E.scandalOptions(st).filter(o => !o.blocked);
    if (opts.length) act(() => E.scandalRespond(st, opts[i % opts.length].k));
  }
  if (st.survival && st.survival.ready && E.survivalSign) {
    act(() => E.survivalSign(st, st.survival.cast.slice(0, 2).map(t => t.id)));
  }

  // Sign whoever is best in the room while the room is small.
  const free = () => st.trainees.filter(t => !t.groupId);
  if (st.trainees.length < 16 && st.scoutPool && st.scoutPool.length) {
    const best = st.scoutPool.slice().sort((a, b) => KP.overall(b) - KP.overall(a))[0];
    act(() => E.sign(st, best.id));
  }
  if (i % 9 === 0 && E.refreshScoutsPaid) act(() => E.refreshScoutsPaid(st));

  // Debut whenever four people are free.
  const mains = KP.mainGroups ? KP.mainGroups(st) : st.groups;
  if (free().length >= 4 && mains.length < 4) {
    const ids = free().sort((a, b) => KP.overall(b) - KP.overall(a)).slice(0, 4 + (i % 2)).map(t => t.id);
    const c = KP.concepts[i % KP.concepts.length];
    act(() => E.debut(st, {
      memberIds: ids, name: 'Act ' + i, kr: '', concept: c.k,
      color: (KP.groupColors || ['#FF2E86'])[i % (KP.groupColors || [1]).length], fandom: 'Fans ' + i
    }));
  }

  st.groups.slice().forEach((grp, j) => {
    if (!st.groups.includes(grp)) return;
    // Release whenever resting.
    if (!grp.active && (i + j) % 3 === 0) {
      const sel = { producer: 'inhouse', choreo: 'local', mv: 'set', styling: 'boutique', promo: 'std' };
      const c = KP.concepts[(i + j) % KP.concepts.length];
      act(() => E.releaseComeback(st, grp, sel, c.k, 'Song ' + i + '-' + j));
    }
    // Book a music show, a variety slot, now and then a gig.
    const abs = KP.absWeek(st) + 1 + (i % 3);
    const shows = (KP.bookings && KP.bookings.shows) || {};
    if (E.book && shows.music && i % 2 === 0) act(() => E.book(st, grp.id, 'music', shows.music[(i + j) % shows.music.length].k, abs));
    if (E.book && shows.variety && i % 5 === 1) act(() => E.book(st, grp.id, 'variety', shows.variety[0].k, abs + 1));
    if (E.book && KP.venues && i % 13 === 4) act(() => E.book(st, grp.id, 'live', KP.venues[0].k, abs + 2));
  });

  // People: renew most of the cliff, form a unit, graduate, join, disband.
  (KP.renewals ? KP.renewals(st) : []).forEach((t, k) => { if (k % 3) act(() => E.renewContract(st, t.id)); });
  const big = mains.find(x => x.releases && x.releases.length >= 2 && !st.groups.some(u => u.parentId === x.id));
  if (big && E.formUnit && i % 17 === 0) {
    act(() => E.formUnit(st, { parentId: big.id, kind: 'sub', memberIds: big.memberIds.slice(0, 2),
      name: 'Unit ' + i, concept: big.concept, color: big.color }));
  }
  if (E.graduate && i % 41 === 20 && mains[0] && mains[0].memberIds.length > 3) act(() => E.graduate(st, mains[0].memberIds[0]));
  if (E.joinGroup && i % 41 === 30 && mains[0] && free()[0]) act(() => E.joinGroup(st, mains[0].id, free()[0].id));
  if (E.disband && i % 97 === 80 && mains.length > 1) {
    const victim = mains[mains.length - 1];
    act(() => E.disband(st, victim.id, victim.memberIds.filter((_, k) => k % 2 === 0)));
  }
  // Money things.
  if (E.takeDebt && i === 25) act(() => E.takeDebt(st, 'loan', KP.finance.loans[0].k));
  if (E.takeDeal && KP.platforms && i === 40) act(() => E.takeDeal(st, KP.platforms[0].k));
  if (E.startSurvival && i === 90) act(() => E.startSurvival(st));
  if (E.upgrade && i % 30 === 15) act(() => E.upgrade(st, 'fac', ['training', 'studio', 'dorm'][i % 3]));
}

function advance(game) {
  const st = game.KP.state;
  game.KP.engine.nextWeek();
  // Ceremonies and reviews are claimed by main.js in the browser; claim them
  // here too, or the pending flags pile up and the save is not a real one.
  ['claimReview', 'claimAwards'].forEach(k => { if (game.KP.engine[k]) act(() => game.KP.engine[k](st)); });
  game.KP.save();
}

/* ---------------------------- what must survive ---------------------------- */
/* Only things a player would notice and call data loss. normalise() is allowed
   to back-fill and to tidy; it is not allowed to touch any of these. */
function fingerprint(st) {
  const ids = (a) => (a || []).map(x => x.id).sort();
  const stats = Object.assign({}, st.stats || {});
  return {
    company: { name: st.company.name, ceo: st.company.ceo, money: st.company.money,
      rep: st.company.rep, facilities: st.company.facilities, staff: st.company.staff },
    calendar: [st.year, st.week, st.over || null],
    trainees: ids(st.trainees),
    groups: (st.groups || []).map(g => ({
      id: g.id, name: g.name, fans: g.fans, members: (g.memberIds || []).slice().sort(),
      releases: (g.releases || []).map(r => r.title), trophies: (g.trophies || []).length,
      active: !!g.active
    })).sort((a, b) => (a.id < b.id ? -1 : 1)),
    awards: (st.awards || []).length,
    reviews: (st.reviews || []).length,
    records: Object.keys(st.records || {}).sort(),
    bookings: (st.bookings || []).length,
    debts: (st.company.debts || []).length,
    stats
  };
}

// Old ⊆ new: everything the old file had must be there, unchanged. New keys
// (back-filled counters, new fields) are fine.
function diff(a, b, at, out) {
  if (a === b) return out;
  if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) { out.push(at + ': shape changed'); return out; }
    if (Array.isArray(a) && a.length !== b.length) { out.push(at + ': ' + a.length + ' → ' + b.length + ' entries'); }
    Object.keys(a).forEach(k => diff(a[k], b[k], at + '.' + k, out));
    return out;
  }
  out.push(at + ': ' + JSON.stringify(a) + ' → ' + JSON.stringify(b));
  return out;
}

function nonFinite(v, at, out, depth) {
  if (out.length > 5 || depth > 12) return out;
  if (typeof v === 'number' && !isFinite(v)) out.push(at + ' = ' + v);
  else if (v && typeof v === 'object') Object.keys(v).forEach(k => nonFinite(v[k], at + '.' + k, out, depth + 1));
  return out;
}

/* ---------------------------------- run ------------------------------------ */
const failures = [];
const fail = (label, msg) => failures.push(label + ' — ' + msg);

const oldSrc = sourcesFromRef(BASE);
const newSrc = sourcesFromDisk();
const tabs = tabsFrom(fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8'));
const baseSha = git('rev-parse', '--short', BASE);

const saves = [];   // { label, raw, file }

// 1. Saves written by the old build.
SEEDS.forEach(seed => {
  const game = boot(oldSrc, seed);
  game.KP.newGame({ company: 'Seed ' + seed + ' & <Co>', ceo: 'Ms. "Kim"', difficulty: 'normal' });
  game.KP.save();
  for (let i = 1; i <= Math.max(...SNAP_WEEKS); i++) {
    autopilotWeek(game, i);
    advance(game);
    if (SNAP_WEEKS.includes(i)) {
      const label = baseSha + '-s' + seed + '-w' + i;
      const exp = game.KP.exportSave ? game.KP.exportSave() : null;
      saves.push({ label, raw: game.store.get(SAVE_KEY), file: exp ? exp.json : null });
    }
    if (game.KP.state.over) break;
  }
});

if (SNAPSHOT) {
  fs.mkdirSync(FIXTURES, { recursive: true });
  // One long run per snapshot is enough history and keeps the repo small.
  const keep = saves.filter(s => s.label.endsWith('-w' + Math.max(...SNAP_WEEKS))).slice(0, 1);
  keep.forEach(s => fs.writeFileSync(path.join(FIXTURES, s.label + '.json'), s.raw));
  console.log('Snapshot written: ' + keep.map(s => 'test/saves/' + s.label + '.json').join(', '));
}

// 2. Saves from builds that are already gone.
if (fs.existsSync(FIXTURES)) {
  fs.readdirSync(FIXTURES).filter(f => f.endsWith('.json')).sort().forEach(f => {
    saves.push({ label: 'fixture ' + f, raw: fs.readFileSync(path.join(FIXTURES, f), 'utf8'), file: null });
  });
}

// 3. The new build reads every one of them.
saves.forEach((s, n) => {
  const before = fingerprint(JSON.parse(s.raw));

  // a) the localStorage path: what a returning player actually hits.
  const game = boot(newSrc, 7 + n);
  game.store.set(SAVE_KEY, s.raw);
  let st;
  try { st = game.KP.load(); } catch (e) { return fail(s.label, 'KP.load() threw: ' + e.message); }
  if (!st) return fail(s.label, 'KP.load() refused the save');
  const lost = diff(before, fingerprint(st), 'state', []);
  if (lost.length) fail(s.label, 'load changed player data:\n      ' + lost.slice(0, 8).join('\n      '));

  // b) the downloaded-file path.
  if (s.file) {
    const g2 = boot(newSrc, 7 + n);
    let r;
    try { r = g2.KP.importSave(s.file); } catch (e) { r = { ok: false, msg: 'threw: ' + e.message }; }
    if (!r || !r.ok) fail(s.label, 'KP.importSave() refused the exported file: ' + (r && r.msg));
  }

  // c) every screen draws.
  tabs.forEach(tab => {
    try {
      game.KP.ui.tab = tab;
      game.KP.ui.render();
      const html = game.stage();
      if (!html) fail(s.label, 'tab "' + tab + '" rendered nothing');
      const bad = /NaN|undefined/.exec(html);
      if (bad) {
        const at = html.indexOf(bad[0]);
        fail(s.label, 'tab "' + tab + '" prints ' + bad[0] + ': …' +
          html.slice(Math.max(0, at - 60), at + 20).replace(/\s+/g, ' ') + '…');
      }
    } catch (e) { fail(s.label, 'tab "' + tab + '" threw: ' + e.message); }
  });

  // d) the run carries on.
  try {
    for (let i = 0; i < PLAY_AFTER && !game.KP.state.over; i++) { autopilotWeek(game, 1000 + i); advance(game); }
  } catch (e) { return fail(s.label, 'playing on threw: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }
  const nf = nonFinite(game.KP.state, 'state', [], 0);
  if (nf.length) fail(s.label, 'non-finite numbers after playing on: ' + nf.join(', '));

  // e) and the new build reads its own save back without losing anything.
  const mid = fingerprint(game.KP.state);
  const g3 = boot(newSrc, 1);
  g3.store.set(SAVE_KEY, game.store.get(SAVE_KEY));
  const back = g3.KP.load();
  if (!back) fail(s.label, 'the new build cannot reload its own save');
  else {
    const rt = diff(mid, fingerprint(back), 'state', []);
    if (rt.length) fail(s.label, 'save → load round trip lost data:\n      ' + rt.slice(0, 8).join('\n      '));
  }
});

const kb = Math.round(saves.reduce((n, s) => n + s.raw.length, 0) / saves.length / 1024);
console.log('Base ' + BASE + ' (' + baseSha + ') → working tree · ' + saves.length + ' saves (avg ' + kb + ' KB) · ' +
  tabs.length + ' tabs · ' + PLAY_AFTER + ' weeks played on each');
if (failures.length) {
  console.log('\n✗ ' + failures.length + ' problem' + (failures.length === 1 ? '' : 's') + ':\n');
  failures.forEach(f => console.log('  • ' + f));
  process.exit(1);
}
console.log('✓ every save loads, keeps its data, renders and plays on');
