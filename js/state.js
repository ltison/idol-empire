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

  /* A portrait key, drawn inside the pool that exists right now. Picking
     within the current count rather than unbounded is what makes adding art
     later safe: every key already handed out still addresses the same file.
     With no pool installed this returns null and the avatar stays a monogram. */
  KP.faceKey = function (gender) {
    const total = (KP.faces.count[gender] || 0);
    return total ? gender + U.irnd(0, total - 1) : null;
  };

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
      face: KP.faceKey(gender),
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
        staff: { vocal: 1, dance: 1, producer: 1, marketing: 1 },
        debts: [],          // open loans and investors, both of them
        prestige: 0         // permanent standing, ORDER 5's trophies write it
      },
      trainees: [],
      groups: [],
      scoutPool: [],
      scoutRefreshedWeek: 1,
      log: [],
      recap: [],
      chart: [],          // last simulated week's top list
      bookings: [],       // paid appearances waiting for their week
      // The year's record, accrued weekly because nothing else remembers it.
      yearbook: { y: 1, acts: {}, songs: {} },
      knownRivals: {},    // artist -> the year we first saw them chart
      awards: [],         // ceremonies, newest year first
      pendingAwards: null,// a year number the UI still owes the player a look at
      trendWeek: 0,
      trends: {},
      stats: { releases: 0, wins: 0, no1: 0, stages: 0, varietyShows: 0, lives: 0, tickets: 0 }
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
      // Standing opens the door to better auditions — a trophy on the wall is
      // exactly the kind of thing a hopeful's parents read about.
      const q = U.clamp(U.rnd(0, .55) + KP.standing(st) / 220, 0, 1);
      const t = KP.makeTrainee(q);
      t.signCost = KP.signingCost(t);
      st.scoutPool.push(t);
    }
    st.scoutRefreshedWeek = KP.absWeek(st);
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

  /* ------------------------------ derived data -----------------------------
     KP.ledger is the ONE derivation of the weekly books. weeklyBurn delegates
     to it and officeTab reads it — the three copies this file used to carry
     drifted the moment anything new was billed. A new weekly line item is one
     entry in outMap and one tuple in ui.js's ledger(), and nowhere else.

     PURITY IS LOAD-BEARING: this runs on every ui.render(). It must never
     mutate a loan, a booking or a balance. Amortisation lives in
     E.serviceDebt(), step 5b. */
  KP.ledger = function (st) {
    const c = KP.costs, f = st.company.facilities, s = st.company.staff;
    const debts = st.company.debts || [];

    const outMap = {
      trainees: st.trainees.filter(t => !t.groupId).length * c.traineeWeek,
      // Idol pay scales with the group's fame — success is its own running cost.
      idols: st.groups.reduce((n, g) =>
        n + g.memberIds.length * c.idolWeek * (1 + Math.min(g.fans / 400e3, 6)), 0),
      facilities: (f.training + f.studio + f.dorm) * c.facilityWeek,
      staff: (s.vocal + s.dance + s.producer + s.marketing) * c.staffWeek,
      promo: st.groups.reduce((n, g) => n + (g.active ? g.active.promoCost : 0), 0),
      debt: debts.reduce((n, d) => n + KP.debtInstalment(d), 0)
    };
    const inMap = {
      merch: st.groups.reduce((n, g) => n + g.fans * KP.income.merchPerFan, 0),
      side: KP.weeklyMisc(st)
    };
    // An investor's cut is taken at the moment income is credited (E.earn), so
    // it is NOT part of totalOut — step 5 must not bill it a second time. It is
    // surfaced here because a line the player cannot see is a line that lies.
    const shareRate = debts.reduce((n, d) => n + (d.type === 'investor' && d.weeksLeft > 0 ? d.share : 0), 0);
    const share = Math.round(inMap.merch * Math.min(shareRate, 1));

    const totalIn = inMap.merch + inMap.side;
    const totalOut = Object.values(outMap).reduce((a, b) => a + b, 0);
    return { in: inMap, out: outMap, share, shareRate, totalIn, totalOut, net: totalIn - share - totalOut };
  };

  /* What step 5 bills. Everything billable, nothing else. */
  KP.weeklyBurn = function (st) { return KP.ledger(st).totalOut; };

  /* Studio rental and session work keep the lights on before the first debut. */
  KP.weeklyMisc = function (st) {
    return KP.income.miscWeek + KP.standing(st) * KP.income.miscPerRep;
  };

  /* ------------------------------- the books -------------------------------
     `remaining` is the debt and `weekly` is the instalment, and the two have to
     agree: KP.debtOutstanding is what the HUD, the finance card and
     E.payoffCost all call Debt, while this is what step 5 actually takes out of
     the balance. Billing a full instalment against a smaller balance owed —
     which two missed payments used to arrange, because the miss branch stretched
     the term and the term was the only thing that retired the loan — puts a
     "Debt ₩0" beside a live "Weekly service" and takes money for a principal
     that is not there. So the last week bills what is left rather than a round
     instalment, and a loan whose balance is already clear bills nothing.
     E.serviceDebt amortises exactly this number. */
  KP.debtInstalment = function (d) {
    if (!d || d.type !== 'loan' || !(d.weeksLeft > 0)) return 0;
    return Math.max(0, Math.min(d.weekly, d.remaining));
  };

  KP.debtOutstanding = function (st) {
    return (st.company.debts || []).reduce((n, d) =>
      n + (d.type === 'loan' ? Math.max(0, d.remaining) : 0), 0);
  };

  /* What a lender thinks you are worth: half the LIST price of every level above
     base, plus your fandom, plus your standing — with a floor, so a brand new
     agency can still get a small line and the early game has a way out.
     Deliberately not half of what those levels cost, which is a different and
     much larger number: E.upgrade charges lvl × the constant, so a full Lv5 room
     costs 1+2+3+4 of them while this counts 4. A lender values the room, not the
     receipts. Making it triangular would raise the credit line in every existing
     save, so it is a balance change rather than a correction. */
  KP.collateral = function (st) {
    const f = st.company.facilities, s = st.company.staff, F = KP.finance;
    const built = (f.training + f.studio + f.dorm - 3) * KP.costs.facilityUpgrade
      + (s.vocal + s.dance + s.producer + s.marketing - 4) * KP.costs.staffUpgrade;
    return Math.round(built * F.collateralRate
      + KP.totalFans(st) * F.fanCollateral
      + KP.standing(st) * F.standingCollateral);
  };

  KP.creditLimit = (st) => KP.finance.baseCredit + KP.collateral(st);
  KP.creditFree = (st) => Math.max(0, KP.creditLimit(st) - KP.debtOutstanding(st));

  KP.totalFans = function (st) {
    return st.groups.reduce((s, g) => s + g.fans, 0);
  };

  KP.memberOf = function (st, g) {
    return g.memberIds.map(id => st.trainees.find(t => t.id === id)).filter(Boolean);
  };

  KP.concept = (k) => KP.concepts.find(c => c.k === k) || KP.concepts[0];
  KP.trait = (k) => KP.traits.find(t => t.k === k);

  /* ------------------------------ the calendar -----------------------------
     Absolute weeks are the game's real clock. A (year, week) pair does not
     compare or subtract — Y2 W1 is one week after Y1 W52 and no arithmetic on
     the pair says so — so anything measuring a distance in time (release gaps,
     audition refresh, and every schedule the later sprints add) works in
     absolute weeks and gets them from here. */
  KP.absWeek = (st) => st.week + (st.year - 1) * KP.WEEKS_PER_YEAR;

  KP.seasonOfWeek = function (week) {
    const w = U.clamp(Math.round(week), 1, KP.WEEKS_PER_YEAR);
    return KP.seasons.find(s => w >= s.w1 && w <= s.w2) || KP.seasons[0];
  };

  /* Pure and stable for a given absolute week — a schedule the player books
     weeks ahead has to read the same season every time it is redrawn. Weeks
     before the start of the run wrap backwards rather than clamping, so a
     market song aged in from "last year" lands in a plausible season. */
  KP.seasonOfAbs = function (abs) {
    const n = KP.WEEKS_PER_YEAR;
    return KP.seasonOfWeek(((Math.round(abs) - 1) % n + n) % n + 1);
  };

  KP.seasonNow = (st) => KP.seasonOfWeek(st.week);

  /* ------------------------------ the schedule -----------------------------
     Derived reads over KP.bookings. Everything here is pure: the booking board
     is redrawn on every render and a capacity number that moved between two
     redraws would be a slot the player watched disappear. */
  KP.show = function (kind, key) {
    const list = KP.bookings.shows[kind];
    return (list && list.find(s => s.k === key)) || null;
  };

  KP.venue = (key) => KP.venues.find(v => v.k === key) || null;

  /* A spec by kind and key, a booking record's spec, and every spec of a kind —
     the three seams the booking modal and the engine read so that neither has to
     know where a particular kind keeps its list. `live` keeps its specs in
     KP.venues because a venue is priced by seats, not by an appearance fee. */
  KP.showSpec = (kind, key) => kind === 'live' ? KP.venue(key) : KP.show(kind, key);

  KP.bookingSpec = function (b) { return KP.showSpec(b.kind, b.show); };

  KP.showsOf = (kind) => kind === 'live' ? KP.venues : (KP.bookings.shows[kind] || []);

  KP.bookingsFor = function (st, groupId, absWeek) {
    return (st.bookings || []).filter(b =>
      (groupId == null || b.groupId === groupId) &&
      (absWeek == null || b.absWeek === absWeek));
  };

  /* How many places are left on a given show in a given week.

     A show's own `slots` is shifted by the season — the crowded comeback
     seasons take one away, which is what makes a one-slot show disappear
     entirely for eleven weeks at a time — and then the rivals who are also on
     the bill take their share. That share is deterministic in the show and the
     week (never random, never stateful) for two reasons: a board the player is
     reading must not reshuffle under them, and floor() of a fraction below 1
     can never take the last slot, so a show the season permits is always
     bookable by somebody. */
  KP.slotsOpen = function (st, kind, key, absWeek) {
    const show = KP.show(kind, key);
    if (!show) return 0;
    const season = KP.seasonOfAbs(absWeek);
    if (show.seasons && show.seasons.indexOf(season.k) < 0) return 0;
    const base = (show.slots || 0) + season.slotBonus;
    if (base <= 0) return 0;
    const rivals = Math.floor(U.hue(kind + ':' + key + ':' + Math.round(absWeek)) / 360 * base);
    const mine = KP.bookingsFor(st, null, Math.round(absWeek))
      .filter(b => b.kind === kind && b.show === key).length;
    return Math.max(0, base - rivals - mine);
  };

  /* Reputation is what events move. Standing is what gates read: reputation
     plus the permanent prestige that trophies leave behind, capped so that a
     shelf of daesangs can carry an agency a long way up the board but never all
     the way to the top of it on its own. */
  KP.standing = (st) => U.clamp(
    st.company.rep + Math.min(st.company.prestige || 0, KP.awards.prestigeCap), 0, 100);

  /* -------------------------- the yearbook & awards ------------------------ */
  KP.prize = (k) => KP.awards.prizes.find(p => p.k === k) || null;

  /* Trophies a group has ever won, newest first, for the group card. */
  KP.trophyCount = (g) => (g.trophies || []).length;

  /* The player's own side of the running yearbook, totalled. This is the ballot
     the ceremony will be read from, so the office can show it months before the
     night — an award you cannot see coming is an award you cannot chase. */
  KP.yearTotals = function (st) {
    const acts = (st.yearbook && st.yearbook.acts) || {};
    const out = {
      cp: 0, no1: 0, top3: 0, top10: 0, weeks: 0,
      sales: 0, fans: 0, revenue: 0, stages: 0, variety: 0, tickets: 0
    };
    Object.keys(acts).forEach(k => {
      const a = acts[k];
      if (!a || !a.mine) return;
      Object.keys(out).forEach(f => { out[f] += a[f] || 0; });
    });
    return out;
  };

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
     skipping one would hand the engine a state it cannot read.

     The example is deliberately a field changing UNITS, because that is the only
     shape that belongs here. Adding a field — `st.company.debts = []` and every
     other new key this game has grown — is additive and belongs in normalise();
     writing it as a migration would bump SAVE_V for no reason and lock out every
     file written by the previous build. */
  KP.migrations = {
    // 1: function (st) { st.groups.forEach(g => { g.fans = Math.round(g.fans / 100); }); return st; },
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
    // ui.render() reads .name and .ceo on every redraw and .replace()s the name.
    if (typeof st.company.name !== 'string' || !st.company.name) st.company.name = 'STARLINE';
    if (typeof st.company.ceo !== 'string') st.company.ceo = '';
    // officeTab reads KP.difficulties[difficulty].label on every render, so a file
    // carrying a difficulty this build does not have would brick the default tab
    // rather than fail politely. Fall back to the middle setting.
    if (!KP.difficulties[st.company.difficulty]) st.company.difficulty = 'normal';
    // A save with no debt in it is a valid save, so both of these are additive.
    if (!Array.isArray(st.company.debts)) st.company.debts = [];
    // The records themselves, not just the container. A loan missing `weekly`
    // makes KP.ledger's debt line NaN, which makes weeklyBurn NaN, which makes
    // the balance NaN — and `NaN < bankruptcyFloor` is false, so the run becomes
    // unloseable and the next autosave writes `money: null`, which this build
    // then refuses to read at all. One missing `remaining` does the same to
    // KP.creditFree and hands out unlimited credit. These are the numbers
    // everything else in the books divides by, so they are sanitised here rather
    // than forgiven at each of the six sites that read them.
    st.company.debts = st.company.debts.filter(d =>
      d && (d.type === 'loan' || d.type === 'investor'));
    st.company.debts.forEach(d => {
      ['principal', 'weeks', 'weeksLeft', 'weekly', 'remaining', 'share', 'paid', 'missed']
        .forEach(k => { if (typeof d[k] !== 'number' || !isFinite(d[k])) d[k] = 0; });
      if (typeof d.id !== 'string') d.id = U.uid('fin');
      if (typeof d.name !== 'string') d.name = d.type === 'loan' ? 'A loan' : 'An investor';
    });
    if (typeof st.company.prestige !== 'number') st.company.prestige = 0;
    if (!Array.isArray(st.log)) st.log = [];
    if (!Array.isArray(st.recap)) st.recap = [];
    if (!Array.isArray(st.chart)) st.chart = [];
    if (!Array.isArray(st.scoutPool)) st.scoutPool = [];
    if (!Array.isArray(st.bookings)) st.bookings = [];
    // An empty yearbook is a valid state: the first ceremony after loading an
    // older save judges whatever the accumulator collected from here on.
    if (!st.yearbook || typeof st.yearbook !== 'object' || Array.isArray(st.yearbook)) {
      st.yearbook = { y: st.year, acts: {}, songs: {} };
    }
    if (typeof st.yearbook.y !== 'number') st.yearbook.y = st.year;
    if (!st.yearbook.acts || typeof st.yearbook.acts !== 'object') st.yearbook.acts = {};
    if (!st.yearbook.songs || typeof st.yearbook.songs !== 'object') st.yearbook.songs = {};
    if (!st.knownRivals || typeof st.knownRivals !== 'object') st.knownRivals = {};
    if (!Array.isArray(st.awards)) st.awards = [];
    if (typeof st.pendingAwards !== 'number') st.pendingAwards = null;
    if (typeof st.calendarYear !== 'number') st.calendarYear = 2025 + st.year;
    if (typeof st.scoutRefreshedWeek !== 'number') st.scoutRefreshedWeek = KP.absWeek(st);
    st.stats = Object.assign(
      { releases: 0, wins: 0, no1: 0, stages: 0, varietyShows: 0, lives: 0, tickets: 0 }, st.stats);
    st.trends = st.trends || {};
    KP.concepts.forEach(c => { if (typeof st.trends[c.k] !== 'number') st.trends[c.k] = 50; });
    // Portraits are additive: a file written before the pool existed carries no
    // face, and gets one derived from the id rather than rolled. Derived, so a
    // given trainee wears the same face on every load of the same save — a
    // random back-fill here would reshuffle the whole roster on each reload.
    // The bucket is the agency's, since that is what generated the roster.
    // U.hue() tops out at 359, so a pool grown past 360 would leave the art
    // above that index unreachable *here* — only on this back-fill path, since
    // KP.faceKey() draws across the whole pool. Widen the hash before the pool
    // ever gets that big.
    st.trainees.forEach(t => {
      if (typeof t.face === 'string' || t.face === null) return;
      const g = st.company.gender, total = KP.faces.count[g] || 0;
      t.face = total ? g + (U.hue(t.id) % total) : null;
    });
    st.groups.forEach(g => {
      if (!Array.isArray(g.releases)) g.releases = [];
      if (typeof g.momentum !== 'number') g.momentum = 0;
      if (typeof g.fans !== 'number') g.fans = 0;
      if (typeof g.stagesY !== 'number') g.stagesY = 0;
      if (typeof g.varietyY !== 'number') g.varietyY = 0;
      // The group card prints g.debut.y unconditionally, and the yearbook reads it
      // to decide who is a rookie. A group without one is a crash, not a blank.
      if (!g.debut || typeof g.debut.y !== 'number') g.debut = { y: st.year, w: st.week };
      // { venueKey: absWeek } — the last week that tier was played, which is
      // what every live cooldown is measured from.
      if (!g.liveAbs || typeof g.liveAbs !== 'object' || Array.isArray(g.liveAbs)) g.liveAbs = {};
      if (typeof g.livesY !== 'number') g.livesY = 0;
      if (typeof g.ticketsY !== 'number') g.ticketsY = 0;
      if (!Array.isArray(g.trophies)) g.trophies = [];   // [{ y, k, ic, name }]
      // A release that was mid-promotion when the file was written predates the
      // per-release counters. Its release week is recoverable rather than
      // guessed: it went out rel.week weeks ago.
      if (g.active) {
        if (typeof g.active.releasedAbs !== 'number') {
          const abs = KP.absWeek(st) - (g.active.week || 0);
          g.active.releasedAbs = abs;
          g.active.releasedY = Math.floor((abs - 1) / KP.WEEKS_PER_YEAR) + 1;
          g.active.releasedW = ((abs - 1) % KP.WEEKS_PER_YEAR) + 1;
        }
        if (typeof g.active.pointWeeks !== 'number') g.active.pointWeeks = 0;
        if (typeof g.active.weeksTop10 !== 'number') g.active.weeksTop10 = 0;
        if (typeof g.active.weeksTop3 !== 'number') g.active.weeksTop3 = 0;
      }
    });
    // A booking whose group or show no longer exists would resolve into nothing
    // and render as a blank row. Hand-edited files and disbands both produce it.
    st.bookings = st.bookings.filter(b =>
      b && KP.bookingSpec(b) && st.groups.some(g => g.id === b.groupId));
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
