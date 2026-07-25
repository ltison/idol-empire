/* =============================================================================
   IDOL EMPIRE — game state: creation, people generation, persistence
   ============================================================================= */
(function () {
  const U = KP.util;
  const SAVE_KEY = 'idol_empire_save_v1';

  KP.state = null;

  /* --------------------------- person generation --------------------------- */
  function pickNation() {
    const total = KP.nations.reduce((s, n) => s + n.w, 0);
    let r = Math.random() * total;
    for (const n of KP.nations) { r -= n.w; if (r <= 0) return n; }
    return KP.nations[0];
  }

  function stageName(gender) {
    // Half the roster goes by a single given name, the rest by full name.
    const given = U.pick(KP.names.given[gender]);
    return U.chance(.55) ? given : U.pick(KP.names.surname) + ' ' + given;
  }

  /* quality 0..1 nudges both the floor and the ceiling of a generated trainee */
  KP.makeTrainee = function (quality) {
    const q = U.clamp(quality == null ? Math.random() : quality, 0, 1);
    const gender = KP.state && KP.state.company.gender ? KP.state.company.gender : 'f';
    const nation = pickNation();
    const id = U.uid('t');

    const stats = {}, potential = {};
    // One or two stats read as the trainee's "thing"; the rest trail behind.
    const specials = U.pickN(KP.STATS.map(s => s.k), U.irnd(1, 2));
    KP.STATS.forEach(s => {
      const spec = specials.includes(s.k);
      const base = U.rnd(4, 26) + q * 14 + (spec ? U.rnd(6, 16) : 0);
      const ceil = base + U.rnd(16, 40) + q * 26 + (spec ? 10 : 0);
      stats[s.k] = Math.round(U.clamp(base, 1, 70));
      potential[s.k] = Math.round(U.clamp(ceil, stats[s.k] + 4, 99));
    });

    // Aces only surface in strong auditions; flaws cluster in the cheap ones.
    const pool = KP.traits.filter(t => {
      if (t.k === 'ace') return q > .62;
      if (t.bad) return U.chance(.75 - q * .5);
      return true;
    });
    const traits = U.pickN(pool, U.chance(.2 + q * .4) ? 2 : 1).map(t => t.k);
    if (traits.includes('ace')) KP.STATS.forEach(s => potential[s.k] = Math.min(99, potential[s.k] + 8));

    return {
      id,
      name: stageName(gender),
      kr: U.pick(KP.names.korean),
      age: U.irnd(15, 22),
      nation: nation.c,
      flag: nation.flag,
      stats, potential, traits,
      stamina: U.irnd(72, 100),
      morale: U.irnd(60, 92),
      focus: 'dance',
      weeksTrained: 0,
      groupId: null,
      position: null,
      signCost: 0,
      status: 'ok',          // ok | injured
      statusWeeks: 0
    };
  };

  KP.signingCost = function (t) {
    const pot = KP.STATS.reduce((s, k) => s + t.potential[k.k], 0) / KP.STATS.length;
    const now = KP.overall(t);
    const youth = t.age <= 17 ? 1.25 : t.age <= 19 ? 1.0 : .8;
    return Math.round((pot * 2.2e6 + now * 1.2e6) * youth / 1e6) * 1e6;
  };

  KP.overall = function (t) {
    const s = t.stats;
    // Stage presence and visuals carry weight even for a "skills" number —
    // this is idol overall, not a conservatory grade.
    return Math.round(
      (s.vocal * 1.0 + s.dance * 1.0 + s.rap * .7 + s.visual * .9 + s.charisma * .9 + s.variety * .5) /
      (1.0 + 1.0 + .7 + .9 + .9 + .5)
    );
  };

  KP.potentialOverall = function (t) {
    const s = t.potential;
    return Math.round(
      (s.vocal * 1.0 + s.dance * 1.0 + s.rap * .7 + s.visual * .9 + s.charisma * .9 + s.variety * .5) /
      (1.0 + 1.0 + .7 + .9 + .9 + .5)
    );
  };

  /* ------------------------------- new game -------------------------------- */
  KP.newGame = function (opts) {
    const d = KP.difficulties[opts.difficulty] || KP.difficulties.normal;
    const st = {
      v: SAVE_V,
      year: 1,
      week: 1,
      calendarYear: 2026,
      over: null,
      company: {
        name: opts.company,
        ceo: opts.ceo,
        gender: opts.gender || 'f',
        difficulty: opts.difficulty,
        money: d.money,
        rep: d.rep,
        facilities: { training: 1, studio: 1, dorm: 1 },
        staff: { vocal: 1, dance: 1, producer: 1, marketing: 1 }
      },
      trainees: [],
      groups: [],
      scoutPool: [],
      scoutRefreshedWeek: 1,
      log: [],
      recap: [],
      chart: [],          // last simulated week's top list
      trendWeek: 0,
      trends: {},
      stats: { releases: 0, wins: 0, no1: 0 }
    };
    KP.concepts.forEach(c => { st.trends[c.k] = U.irnd(35, 70); });

    KP.state = st;
    KP.refreshScouts(true);
    // Start with three trainees already on the books so week 1 has decisions.
    for (let i = 0; i < 3; i++) {
      const t = KP.makeTrainee(U.rnd(.25, .55));
      t.focus = U.pick(['vocal', 'dance', 'visual']);
      st.trainees.push(t);
    }
    KP.log('Agency registered. ' + opts.company + ' opens its doors.', 'big');
    return st;
  };

  KP.refreshScouts = function (silent) {
    const st = KP.state;
    const n = 6;
    st.scoutPool = [];
    for (let i = 0; i < n; i++) {
      // Reputation opens the door to better auditions.
      const q = U.clamp(U.rnd(0, .55) + st.company.rep / 220, 0, 1);
      const t = KP.makeTrainee(q);
      t.signCost = KP.signingCost(t);
      st.scoutPool.push(t);
    }
    st.scoutRefreshedWeek = st.week + (st.year - 1) * 52;
    if (!silent) KP.log('New audition round posted — 6 hopefuls waiting.', 'info');
  };

  /* --------------------------------- log ----------------------------------- */
  KP.log = function (text, kind) {
    const st = KP.state;
    if (!st) return;
    const entry = { y: st.year, w: st.week, text, kind: kind || 'info' };
    st.log.unshift(entry);
    if (st.log.length > 300) st.log.pop();
    return entry;
  };

  /* ------------------------------ derived data ----------------------------- */
  KP.weeklyBurn = function (st) {
    const c = KP.costs;
    let sum = 0;
    sum += st.trainees.filter(t => !t.groupId).length * c.traineeWeek;
    // Idol pay scales with the group's fame — success is its own running cost.
    st.groups.forEach(g => {
      const mult = 1 + Math.min(g.fans / 400e3, 6);
      sum += g.memberIds.length * c.idolWeek * mult;
    });
    const f = st.company.facilities;
    sum += (f.training + f.studio + f.dorm) * c.facilityWeek;
    const s = st.company.staff;
    sum += (s.vocal + s.dance + s.producer + s.marketing) * c.staffWeek;
    st.groups.forEach(g => { if (g.active) sum += g.active.promoCost; });
    return sum;
  };

  /* Studio rental and session work keep the lights on before the first debut. */
  KP.weeklyMisc = function (st) {
    return KP.income.miscWeek + st.company.rep * KP.income.miscPerRep;
  };

  /* Line-by-line books, so the player can see where the money actually goes. */
  KP.ledger = function (st) {
    const c = KP.costs, f = st.company.facilities, s = st.company.staff;
    const outMap = {
      trainees: st.trainees.filter(t => !t.groupId).length * c.traineeWeek,
      idols: st.groups.reduce((n, g) =>
        n + g.memberIds.length * c.idolWeek * (1 + Math.min(g.fans / 400e3, 6)), 0),
      facilities: (f.training + f.studio + f.dorm) * c.facilityWeek,
      staff: (s.vocal + s.dance + s.producer + s.marketing) * c.staffWeek,
      promo: st.groups.reduce((n, g) => n + (g.active ? g.active.promoCost : 0), 0)
    };
    const inMap = {
      merch: st.groups.reduce((n, g) => n + g.fans * KP.income.merchPerFan, 0),
      side: KP.weeklyMisc(st)
    };
    const totalIn = inMap.merch + inMap.side;
    const totalOut = Object.values(outMap).reduce((a, b) => a + b, 0);
    return { in: inMap, out: outMap, totalIn, totalOut, net: totalIn - totalOut };
  };

  KP.totalFans = function (st) {
    return st.groups.reduce((s, g) => s + g.fans, 0);
  };

  KP.memberOf = function (st, g) {
    return g.memberIds.map(id => st.trainees.find(t => t.id === id)).filter(Boolean);
  };

  KP.concept = (k) => KP.concepts.find(c => c.k === k) || KP.concepts[0];
  KP.trait = (k) => KP.traits.find(t => t.k === k);

  /* ============================== persistence ==============================
     Two separate mechanisms, and picking the right one matters:

       normalise()    additive changes — a new field with a sane default. No
                      version bump: old saves are back-filled on the way in.
       KP.migrations  breaking changes — a field that changed meaning, shape or
                      units. Bump SAVE_V and add the matching rung.

     A downloaded save outlives the build that wrote it, so both paths have to
     stay honest: an unreadable save is reported, never silently discarded and
     never half-loaded into a running game.
     ========================================================================== */

  const SAVE_V = 1;              // schema version of the state object
  KP.SAVE_V = SAVE_V;

  /* migrations[n] upgrades a v=n state to v=n+1. Every version from 1 to
     SAVE_V-1 needs a rung; a gap is a hard failure, not a silent pass, because
     skipping one would hand the engine a state it cannot read. */
  KP.migrations = {
    // 1: function (st) { st.company.loans = []; return st; },
  };

  /* Fills in anything an older or hand-edited save may be missing. Additive
     fields belong here rather than in a migration — cheaper and it also
     hardens import against a file that lost a key somewhere along the way. */
  function normalise(st) {
    st.company = st.company || {};
    st.company.facilities = Object.assign({ training: 1, studio: 1, dorm: 1 }, st.company.facilities);
    st.company.staff = Object.assign({ vocal: 1, dance: 1, producer: 1, marketing: 1 }, st.company.staff);
    if (typeof st.company.rep !== 'number') st.company.rep = 0;
    if (!st.company.gender) st.company.gender = 'f';
    if (!Array.isArray(st.log)) st.log = [];
    if (!Array.isArray(st.recap)) st.recap = [];
    if (!Array.isArray(st.chart)) st.chart = [];
    if (!Array.isArray(st.scoutPool)) st.scoutPool = [];
    if (typeof st.calendarYear !== 'number') st.calendarYear = 2025 + st.year;
    if (typeof st.scoutRefreshedWeek !== 'number') st.scoutRefreshedWeek = st.week + (st.year - 1) * 52;
    st.stats = Object.assign({ releases: 0, wins: 0, no1: 0 }, st.stats);
    st.trends = st.trends || {};
    KP.concepts.forEach(c => { if (typeof st.trends[c.k] !== 'number') st.trends[c.k] = 50; });
    st.groups.forEach(g => {
      if (!Array.isArray(g.releases)) g.releases = [];
      if (typeof g.momentum !== 'number') g.momentum = 0;
      if (typeof g.fans !== 'number') g.fans = 0;
    });
    // st.market is deliberately left alone — ensureMarket() rebuilds it.
    return st;
  }

  /* The shape the game cannot run without. Anything softer belongs in
     normalise(); this is only what makes a file a save at all. */
  function structureError(st) {
    if (!st || typeof st !== 'object' || Array.isArray(st)) return 'not a save file';
    if (typeof st.v !== 'number') return 'no format version';
    if (typeof st.year !== 'number' || typeof st.week !== 'number') return 'no calendar';
    if (!st.company || typeof st.company !== 'object') return 'no company';
    if (typeof st.company.money !== 'number') return 'no balance';
    if (!Array.isArray(st.trainees) || !Array.isArray(st.groups)) return 'no roster';
    return null;
  }

  /* Takes a parsed state of any past version, returns { ok, state, from } or
     { ok:false, msg }. Works on a copy, so a failure leaves the caller's object
     — and any run currently in progress — untouched. */
  KP.migrate = function (input) {
    let st;
    try { st = JSON.parse(JSON.stringify(input)); }
    catch (e) { return { ok: false, msg: 'That save could not be read.' }; }

    const bad = structureError(st);
    if (bad) return { ok: false, msg: 'That file is not an IDOL EMPIRE save (' + bad + ').' };

    const from = st.v;
    if (st.v > SAVE_V) {
      return { ok: false, msg: 'That save is from a newer version of the game (format v' + st.v + ', this build reads v' + SAVE_V + ').' };
    }
    while (st.v < SAVE_V) {
      const step = KP.migrations[st.v];
      if (typeof step !== 'function') {
        return { ok: false, msg: 'No upgrade path from format v' + st.v + ' to v' + SAVE_V + '.' };
      }
      const at = st.v;
      try { st = step(st) || st; }
      catch (e) { return { ok: false, msg: 'Upgrading this save from v' + at + ' failed.' }; }
      st.v = at + 1;
    }

    normalise(st);
    return { ok: true, state: st, from, migrated: from !== st.v };
  };

  KP.save = function () {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(KP.state));
      return true;
    } catch (e) { return false; }
  };

  KP.hasSave = function () {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };

  KP.load = function () {
    let raw;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return null; }
    const r = KP.migrate(parsed);
    if (!r.ok) return null;
    KP.state = r.state;
    if (r.migrated) KP.save();          // pay the upgrade once, not every load
    return r.state;
  };

  KP.wipe = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
    KP.state = null;
  };

  /* ------------------------------ save files ------------------------------- */
  /* The download is wrapped in an envelope so a file can be identified on sight
     — by a human reading it and by an importer that has to reject other JSON.
     The envelope version is separate from the state version: the two can move
     independently, and the state carries its own `v` regardless. */
  KP.EXPORT_FMT = 1;

  KP.exportSave = function () {
    const st = KP.state;
    if (!st) return null;
    const env = {
      app: 'idol-empire',
      fmt: KP.EXPORT_FMT,
      stateVersion: st.v,
      savedAt: new Date().toISOString(),
      label: st.company.name + ' · Y' + st.year + ' W' + st.week,
      state: st
    };
    const slug = (st.company.name || 'agency').replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '').toLowerCase() || 'agency';
    return {
      json: JSON.stringify(env, null, 2),
      filename: 'idol-empire-' + slug + '-y' + st.year + 'w' + st.week + '.json'
    };
  };

  /* Accepts an envelope, or a bare state object — a raw localStorage dump is a
     save a player can plausibly end up holding, and refusing it would be pure
     pedantry. An envelope from a *newer* build is still unwrapped: its state
     carries its own version and KP.migrate is the one that gets to judge it. */
  KP.importSave = function (text) {
    let raw;
    try { raw = JSON.parse(text); }
    catch (e) { return { ok: false, msg: 'That file is not valid JSON.' }; }

    let state = raw;
    if (raw && typeof raw === 'object' && raw.state) {
      if (raw.app && raw.app !== 'idol-empire') {
        return { ok: false, msg: 'That save belongs to a different game.' };
      }
      state = raw.state;
    }

    const r = KP.migrate(state);
    if (!r.ok) return r;

    KP.state = r.state;
    KP.save();
    return { ok: true, state: r.state, migrated: r.migrated, from: r.from };
  };
})();
