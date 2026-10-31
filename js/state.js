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

  /* quality 0..1 nudges both the floor and the ceiling of a generated trainee.
     `gender` is optional and defaults to the player's agency: it is passed only
     by the rival agencies, who audition for their own kind of group and whose
     people therefore draw their names and portraits from the other bucket. */
  KP.makeTrainee = function (quality, gender) {
    const q = U.clamp(quality == null ? Math.random() : quality, 0, 1);
    gender = gender || (KP.state && KP.state.company.gender ? KP.state.company.gender : 'f');
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
      // What the public already knows them for. Zero for everybody the audition
      // room produces — a name is earned on television, and only the survival
      // show hands one out. It decays every week they are not on a screen.
      fame: 0,
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

  /* The stat a training week is best spent on: the lowest one that still has
     room under its ceiling. A stat already at potential is not "weak", it is
     finished — pointing the player at it would spend a week on nothing. Null
     when every stat has topped out. */
  KP.weakestStat = function (t) {
    let best = null;
    KP.STATS.forEach(s => {
      const v = t.stats[s.k];
      if (t.potential[s.k] - v < 1) return;
      if (!best || v < t.stats[best]) best = s.k;
    });
    return best;
  };

  KP.potentialOverall = function (t) {
    const s = t.potential;
    return Math.round(
      (s.vocal * 1.0 + s.dance * 1.0 + s.rap * .7 + s.visual * .9 + s.charisma * .9 + s.variety * .5) /
      (1.0 + 1.0 + .7 + .9 + .9 + .5)
    );
  };

  /* --------------------------- the rival agencies --------------------------
     World generation, on the same terms as KP.makeTrainee and KP.refreshScouts:
     this file builds the people and the shape, the engine decides when. Nothing
     here simulates a week.

     A rival record stores only what changes — the key, the roster, the diary —
     and looks its numbers up in KP.rivalAgencies through KP.rivalSpec(), the way
     a booking stores a show key rather than a copy of the show. Rebalancing
     `pull` in data.js has to reach a save that is already running. */
  KP.rivalSpec = (r) => KP.rivalAgencies.find(a => a.k === (r && r.k)) || null;

  /* A rival person is generated by KP.makeTrainee, on exactly the player's own
     terms — the competition being drawn from a different, kinder distribution
     would be a cheat the numbers could not show — and then loses the half of the
     record that only means something to somebody on the payroll. Nobody assigns
     them a focus, rests them, injures them or pays to sign them.

     This is a save-size measure and not a tidy-up: KP.save() stringifies the
     whole state every single week, and sixty-odd rival people carrying eight
     dead fields each is a third of the file. */
  const RIVAL_DROP = ['focus', 'weeksTrained', 'signCost', 'status', 'statusWeeks',
    'position', 'stamina', 'morale', 'fame', 'votes', 'debutAbs', 'contractAbs'];

  KP.stripRivalPerson = function (t) {
    RIVAL_DROP.forEach(k => { delete t[k]; });
    return t;
  };

  KP.makeRivalPerson = (quality, gender) => KP.stripRivalPerson(KP.makeTrainee(quality, gender));

  /* Every name the four of them own. Read by the anonymous market so it can
     never publish a song under a group that has actual members: the generated
     debutant names and these come out of the same KP.groupNameParts bag. */
  KP.rivalGroupNames = function (st) {
    const out = [];
    (st.rivals || []).forEach(r => (r.groups || []).forEach(g => out.push(g.name)));
    return out;
  };

  KP.rivalGroupName = function (st) {
    const taken = KP.rivalGroupNames(st);
    // Names currently on the chart, as well as names that have ever charted.
    // st.knownRivals is only stamped when a song reaches the top of the ladder,
    // so an anonymous release hovering outside it is invisible to that check —
    // and a debut that took its name produced two acts under one name on one
    // chart, one of them with a line-up the player could open and read.
    const onChart = (st.market || []).map(s => s.artist);
    for (let i = 0; i < 30; i++) {
      const n = U.pick(KP.groupNameParts.a) + (U.chance(.5) ? ' ' : ':') + U.pick(KP.groupNameParts.b);
      if (taken.indexOf(n) < 0 && KP.rivalArtists.indexOf(n) < 0
        && onChart.indexOf(n) < 0
        && (st.knownRivals || {})[n] == null
        && !st.groups.some(g => g.name === n)) return n;
    }
    return 'UNIT ' + (taken.length + 1);
  };

  /* A rival group is the player's group with everything the player does not get
     to touch removed: no bookings, no books, no positions. Its members are held
     here rather than in st.trainees, which is the player's building and the
     thing the weekly upkeep counts. */
  KP.newRivalGroup = function (st, r, members, opts) {
    opts = opts || {};
    const R = KP.rivals;
    const name = KP.rivalGroupName(st);
    const g = {
      id: U.uid('rg'),
      name,
      // They chase the same trend board the player reads, which is what makes a
      // fashionable concept a contested one rather than a free win.
      concept: KP.concepts.slice().sort((a, b) => (st.trends[b.k] || 50) - (st.trends[a.k] || 50))[0].k,
      color: U.pick(KP.groupColors),
      members,
      // Year 0 is "already there when you opened", the same stamp the opening
      // market carries: a name the run has never watched debut is not a rookie.
      debutY: opts.established ? 0 : st.year,
      debutW: opts.established ? 0 : st.week,
      debutAbs: opts.established ? 0 : KP.absWeek(st),
      fans: opts.fans != null
        ? Math.round(opts.fans * U.rnd(.82, 1.2))
        : U.irnd(R.debutFans[0], R.debutFans[1]),
      momentum: opts.established ? 30 : 24,
      releases: [],
      active: null,       // { title, concept, points, peak, weeks, no1 }
      plan: null,         // { absWeek, title, concept } — the diary, from day one
      lastReleaseAbs: null,
      // The week the contract runs out, decided the day it is signed rather than
      // rolled on the night: it is what the fade in E.rivalStrength counts down
      // to, so it has to exist before the act's last years are simulated. The
      // opening four are mid-term, on their own spread, so they do not all reach
      // the end of the road in the same season.
      retireAbs: KP.absWeek(st) + KP.WEEKS_PER_YEAR *
        (opts.established ? U.irnd(R.seedContract[0], R.seedContract[1])
          : U.irnd(R.contract[0], R.contract[1]))
    };
    members.forEach(m => { m.groupId = g.id; });
    r.groups.push(g);
    // The rookie ballot reads st.knownRivals, so a debut we WATCHED is stamped
    // here rather than left to accrueYearbook's "first time we saw them chart"
    // heuristic. A group that debuts in week 40 and charts in week 44 is still
    // this year's rookie.
    st.knownRivals = st.knownRivals || {};
    if (st.knownRivals[name] == null) st.knownRivals[name] = opts.established ? 0 : st.year;
    return g;
  };

  /* Idempotent, and called from both ends: KP.newGame builds the world, and
     normalise() builds it again for a save written before the agencies existed.
     Same lazy world-building ensureMarket() does for the chart, except that this
     one can run on the load path because it needs nothing but data and state.

     Per agency rather than all-or-nothing, which matters twice: a save that lost
     one record to a hand edit gets that one back instead of running three short
     for the rest of its life, and a fifth name added to KP.rivalAgencies later
     opens its doors in every save already in progress. An agency built this late
     is stamped established, never as this year's debutant. */
  KP.seedRivals = function (st) {
    if (!Array.isArray(st.rivals)) st.rivals = [];
    const R = KP.rivals;
    KP.rivalAgencies.forEach(spec => {
      if (st.rivals.some(r => r.k === spec.k)) return;
      const r = {
        id: 'ag_' + spec.k, k: spec.k,
        trainees: [], groups: [],
        lastDebutAbs: 0,
        scoutedAbs: null        // absolute week the last report was bought
      };
      st.rivals.push(r);
      const q = () => U.rnd(spec.quality[0], spec.quality[1]);
      const n = U.irnd(R.seedTrainees[0], R.seedTrainees[1]);
      for (let i = 0; i < n; i++) r.trainees.push(KP.makeRivalPerson(q(), spec.gender));
      // ...and the act they were already running before you registered.
      const members = [];
      const size = U.irnd(R.memberRange[0], R.memberRange[1]);
      for (let i = 0; i < size; i++) members.push(KP.makeRivalPerson(q(), spec.gender));
      KP.newRivalGroup(st, r, members, { established: true, fans: spec.fans0 });
    });
    return st.rivals;
  };

  /* --------------------------- reading the rivals --------------------------
     Pure, and every one of them is read on a redraw, so none of them may write.
     `scouted` and `planVisible` are the two that decide how much of a rival is
     on screen at all: a report buys the diary, and the diary is the sprint. */
  KP.rivalScouted = function (st, r) {
    return r.scoutedAbs != null && KP.absWeek(st) - r.scoutedAbs < KP.rivals.scoutWeeks;
  };

  KP.rivalScoutLeft = function (st, r) {
    return KP.rivalScouted(st, r) ? KP.rivals.scoutWeeks - (KP.absWeek(st) - r.scoutedAbs) : 0;
  };

  /* Where an act is in its contract, at `abs` (default now). One derivation, read
     by the fade in E.rivalStrength, by the retirement in E.rivalWeek and by the
     Rivals tab, so a card can never disagree with the number it is describing.
     `fade` is 1 until the last `fadeYears` and then walks down to `fadeFloor`:
     an act on the way out is beatable before it is gone, which is the half the
     player gets to see. No roll in it, like every other rival number. */
  KP.rivalCareer = function (st, g, abs) {
    const R = KP.rivals, W = KP.WEEKS_PER_YEAR;
    const at = abs == null ? KP.absWeek(st) : abs;
    const end = typeof g.retireAbs === 'number' ? g.retireAbs : at + W;
    const left = (end - at) / W;
    const fade = U.clamp(1 - (1 - R.fadeFloor) * (1 - U.clamp(left / R.fadeYears, 0, 1)), R.fadeFloor, 1);
    return { years: (at - (g.debutAbs || 0)) / W, left, fade, done: at >= end };
  };

  KP.rivalPlanVisible = function (st, r, g) {
    if (!g.plan) return false;
    return KP.rivalScouted(st, r) || g.plan.absWeek - KP.absWeek(st) <= KP.rivals.announceLead;
  };

  /* Every rival group, flattened with the agency it belongs to. */
  KP.rivalActs = function (st) {
    const out = [];
    (st.rivals || []).forEach(r => (r.groups || []).forEach(g => out.push({ r, g })));
    return out;
  };

  KP.rivalAct = (st, gid) => KP.rivalActs(st).find(x => x.g.id === gid) || null;

  /* The comebacks the player is allowed to know about, in a week or a span.
     `to` is inclusive; omit it for a single week. Sorted, so the schedule board
     and the comeback planner list them in the same order. */
  KP.rivalPlansIn = function (st, from, to) {
    const hi = to == null ? from : to;
    return KP.rivalActs(st)
      .filter(x => KP.rivalPlanVisible(st, x.r, x.g) && x.g.plan.absWeek >= from && x.g.plan.absWeek <= hi)
      .sort((a, b) => a.g.plan.absWeek - b.g.plan.absWeek);
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
        deals: [],          // open streaming platform deals
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
      rivals: [],         // the four agencies, their rosters and their diaries
      awards: [],         // ceremonies, newest year first
      pendingAwards: null,// a year number the UI still owes the player a look at
      scandal: null,      // a story the agency has one week to answer
      fallout: null,      // a denial that was a lie, waiting to come back
      survival: null,     // the show on air, and the finals night it owes you
      reviews: [],        // one record per year that ended, newest first
      pendingReview: null,// a year the UI still owes the player a look back at
      records: {},        // the high-water marks, by KP.recordKinds key
      trendWeek: 0,
      trends: {},
      stats: KP.blankStats(),
      statsY: KP.blankStats()
    };
    KP.concepts.forEach(c => { st.trends[c.k] = U.irnd(35, 70); });

    KP.state = st;
    // The competition is older than the agency: four buildings with an act
    // each are already running when you register. What they DO with them —
    // cadence, debuts, who they poach — is the engine's, from the first tick.
    KP.seedRivals(st);
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
      // Units are skipped: a sub-unit is the same people wearing a second name,
      // and paying them twice would make a unit a running cost rather than a
      // second use of a roster you have already got.
      idols: KP.mainGroups(st).reduce((n, g) =>
        n + g.memberIds.length * c.idolWeek * (1 + Math.min(g.fans / 400e3, 6)), 0),
      facilities: (f.training + f.studio + f.dorm) * c.facilityWeek,
      staff: (s.vocal + s.dance + s.producer + s.marketing) * c.staffWeek,
      promo: st.groups.reduce((n, g) => n + (g.active ? g.active.promoCost : 0), 0),
      debt: debts.reduce((n, d) => n + KP.debtInstalment(d), 0),
      // A platform deal has no instalment and no principal — it is a marketing
      // commitment billed every week of its term, which is why it belongs here
      // and not in the finance card.
      platform: KP.activeDeals(st).reduce((n, d) => {
        const sp = KP.platformSpec(d);
        return n + (sp ? sp.weekly : 0);
      }, 0)
    };
    const inMap = {
      // One derivation, shared with step 4c. Loyalty and the international split
      // are both inside it, so a scandal shows up in this line the same week.
      merch: st.groups.reduce((n, g) => n + KP.merchWeek(g), 0),
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

  /* The agency's reach, and the number a lender prices collateral off. Units are
     not counted, for the reason KP.merchWeek discounts them: a sub-unit's fandom
     is drawn out of its parent's, and adding the two together would let a player
     raise their credit limit by forming a unit. */
  KP.totalFans = function (st) {
    return KP.mainGroups(st).reduce((s, g) => s + g.fans, 0);
  };

  KP.memberOf = function (st, g) {
    return g.memberIds.map(id => st.trainees.find(t => t.id === id)).filter(Boolean);
  };

  KP.concept = (k) => KP.concepts.find(c => c.k === k) || KP.concepts[0];
  KP.trait = (k) => KP.traits.find(t => t.k === k);

  /* ================================ sleeves ================================
     A cover is a pure function of the song and NOTHING is stored: three
     colours off KP.art, a motif, and ten numbers a painter can shape itself
     with. Given the same seed it returns the same jacket forever, which is the
     only reason the chart ladder can afford to draw fifty of them on a redraw
     and a save from an older build can still show its own discography.

     `conceptKey` decides the palette where there is one — a player release
     knows its concept — and where there is not (an anonymous market song is a
     title and an artist and nothing else) the hash picks one, so the whole
     ladder is covered rather than only the half the game has records for.
     `accent` is the act's lightstick colour and is what makes four sleeves
     read as one discography; it falls back to the palette's own light so a
     cover never depends on being handed one. */
  KP.cover = function (seed, conceptKey, accent) {
    const A = KP.art;
    const h = U.hash(seed);
    const names = Object.keys(A.palettes);
    const c = conceptKey ? KP.concepts.find(x => x.k === conceptKey) : null;
    const pal = A.palettes[(c && c.pal)] || A.palettes[names[h % names.length]];
    // A small LCG off the hash. The painter never rolls: everything it needs to
    // place a shape comes out of here, so ui.js stays a pure state → HTML
    // function and two renders of one song are byte-identical.
    const r = [];
    let s = (h ^ 0x9E3779B9) >>> 0;
    for (let i = 0; i < 10; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; r.push(s / 4294967296); }
    return {
      id: h.toString(36),
      pal,
      accent: typeof accent === 'string' && accent ? accent : pal[2],
      motif: A.motifs[(h >>> 7) % A.motifs.length],
      r
    };
  };

  /* THE seed. One song is drawn from one string, wherever it is being looked at
     — a chart rung this week, a discography row in year nine, a ceremony record
     that outlives the release by twenty years — and this is the only place that
     string is built. Written twice, a song grows a second face the week it moves
     from the ladder into the shelf, which is the single most visible way a
     generated jacket can be wrong.

     Ours is keyed by the group id, because two agencies may both have a song
     called "Neon Halo" and they are not the same record. Somebody else's is
     keyed by the artist name, because that is all the market ever tells us. */
  KP.songCover = function (o) {
    const seed = o.mine
      ? o.title + '|' + (o.concept || '') + '|' + (o.groupId || '')
      : o.title + '|' + (o.artist || '');
    return KP.cover(seed, o.concept || null, o.color || null);
  };

  /* The three readers. A release, a chart row, and an archived record — the last
     of which may carry no concept at all (a rival's song is never stored with
     one), in which case the hash picks the palette exactly as it does for the
     anonymous half of the ladder. */
  KP.relCover = (g, rel) => KP.songCover({
    mine: true, title: rel.title, concept: rel.concept, color: g.color, groupId: g.id
  });

  KP.rowCover = function (st, row) {
    if (row.mine) {
      const g = st.groups.find(x => x.id === row.groupId);
      if (g) {
        return KP.songCover({
          mine: true, title: row.title, groupId: g.id, color: g.color,
          concept: (g.active && g.active.title === row.title) ? g.active.concept : g.concept
        });
      }
    }
    // A rival agency's release wears its agency colour; the anonymous market
    // has nobody behind it and keeps the palette's own light.
    const act = row.rid ? KP.rivalAct(st, row.rid) : null;
    const sp = act ? KP.rivalSpec(act.r) : null;
    return KP.songCover({
      mine: false, title: row.title, artist: row.artist,
      concept: act ? act.g.concept : null, color: sp ? sp.color : null
    });
  };

  /* ============================= the record books =========================
     A high-water mark per kind, held in st.records as { k: {v, by, sub, y, w} }
     and written only by E.record(). Everything here is a read. */
  KP.recordSpec = (k) => KP.recordKinds.find(r => r.k === k) || null;

  KP.recordsOf = (st) => KP.recordKinds.map(spec => ({
    spec, rec: (st.records || {})[spec.k] || null
  }));

  KP.recordsSet = (st) => KP.recordKinds.reduce((n, s) => n + ((st.records || {})[s.k] ? 1 : 0), 0);

  KP.reviewOf = (st, y) => (st.reviews || []).find(r => r.y === y) || null;

  /* Every counter the run keeps, and the one place the list is written down.
     st.stats is the career total and st.statsY is the same set for the year in
     progress — E.bumpStat writes both, so a year-in-review can never disagree
     with the career figure it is a slice of. */
  const STAT_KEYS = ['releases', 'wins', 'no1', 'stages', 'varietyShows', 'lives', 'tickets',
    'tourLegs', 'scandals', 'units', 'renewals', 'departures', 'shows', 'debuts'];
  KP.STAT_KEYS = STAT_KEYS;
  KP.blankStats = () => STAT_KEYS.reduce((o, k) => { o[k] = 0; return o; }, {});

  /* ====================== relationships and chemistry ======================
     One bond per PAIR, stored on the group as { 'idA|idB': value }, and every
     one of these is pure — chemistry is printed on the group card, quoted by
     the comeback planner and read by the renewal table, all of which redraw.

     The key is order-independent because a pair is not a direction: writing it
     both ways round would give the same two people two different histories the
     moment one of them was added to the group by a different code path. */
  KP.bondKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;

  KP.bondOf = function (g, a, b) {
    const v = (g.bonds || {})[KP.bondKey(a, b)];
    return typeof v === 'number' && isFinite(v) ? v : KP.bonds.base;
  };

  /* Where a group's bonds actually live. A sub-unit's two members are the same
     two people as the parent's, so the pair has ONE history: the unit reads and
     writes its parent's map rather than keeping a second copy that would drift
     away from it the first week the two acts had different schedules. */
  KP.bondHost = (st, g) => KP.isUnit(g) ? (KP.parentOf(st, g) || g) : g;

  /* The room, as one number. A line-up of one has no room and reads exactly
     neutral rather than `base` — a soloist is not a group with bad chemistry,
     and anchoring them to `base` would quietly tax every solo debut by whatever
     distance the measured `mid` sits from it. */
  KP.chemistry = function (st, g) {
    const ids = g.memberIds || [];
    if (ids.length < 2) return KP.bonds.mid;
    const host = KP.bondHost(st, g);
    let sum = 0, n = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) { sum += KP.bondOf(host, ids[i], ids[j]); n++; }
    }
    return n ? sum / n : KP.bonds.mid;
  };

  /* What the room is worth, written as a deviation from KP.bonds.mid on exactly
     the terms KP.fanMods() is — so a settled line-up reads ×1.00 and what the
     player is buying is the spread. `perf` lands on song quality and `edge` on
     a variety room and a live house, which are graded rather than scored. */
  KP.chemPerf = (st, g) =>
    U.clamp(1 + (KP.chemistry(st, g) - KP.bonds.mid) * KP.bonds.perfPer,
      KP.bonds.perfLo, KP.bonds.perfHi);

  KP.chemEdge = (st, g) =>
    U.clamp(1 + (KP.chemistry(st, g) - KP.bonds.mid) * KP.bonds.edgePer,
      KP.bonds.edgeLo, KP.bonds.edgeHi);

  /* Every pair in a group, weakest first — the line-up modal's whole content,
     and the only place the pair list is built. */
  KP.bondPairs = function (st, g) {
    const members = KP.memberOf(st, g);
    const host = KP.bondHost(st, g);
    const out = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        out.push({ a: members[i], b: members[j], v: KP.bondOf(host, members[i].id, members[j].id) });
      }
    }
    return out.sort((x, y) => x.v - y.v);
  };

  /* ============================== sub-units ===============================
     A unit is a group record with a parent, so everything that takes a group
     takes a unit: releases, the chart, the schedule board, the books, the
     yearbook. What it is NOT is a second payroll — `t.groupId` still points at
     the parent, which is why the ledger's idol line and KP.totalFans skip units
     and KP.merchWeek discounts them. A unit member is one person.

     Same seam as a booking and a platform deal: the record stores the kind, and
     KP.unitSpec() is the only way it reaches the numbers. */
  KP.isUnit = (g) => !!(g && g.parentId);
  KP.unitSpec = (g) => KP.unitKinds.find(u => u.k === (g && g.unitKind)) || null;
  KP.unitKind = (k) => KP.unitKinds.find(u => u.k === k) || null;
  KP.unitsOf = (st, gid) => st.groups.filter(g => g.parentId === gid);
  KP.parentOf = (st, g) => KP.isUnit(g) ? (st.groups.find(x => x.id === g.parentId) || null) : null;

  /* The main groups, in the order they debuted — everything the player thinks
     of as "a group", with the units hanging off them. */
  KP.mainGroups = (st) => st.groups.filter(g => !KP.isUnit(g));

  /* Who is already spoken for. A person can be in one unit at a time: two units
     off one member is one schedule wearing two hats and no way to tell which
     one ran them into the ground. */
  KP.inAUnit = function (st, memberId) {
    return st.groups.some(g => KP.isUnit(g) && g.memberIds.indexOf(memberId) >= 0);
  };

  /* ========================= contracts and the cliff =======================
     `t.debutAbs` is stamped the week a person debuts and `t.contractAbs` is the
     week their term runs out — the same shape a rival act's `retireAbs` has,
     and derived rather than recomputed for the same reason: the renewal table,
     the trainee card and the tick all have to be quoting one date.

     A trainee has neither. A training agreement has nothing to renegotiate, and
     a person who has never debuted cannot walk out on a fandom. */
  KP.contractLeft = function (st, t) {
    if (typeof t.contractAbs !== 'number') return null;
    return t.contractAbs - KP.absWeek(st);
  };

  KP.inRenewWindow = function (st, t) {
    const left = KP.contractLeft(st, t);
    return left != null && left <= KP.contracts.windowWeeks;
  };

  /* Morale and the room, which is the whole reason bonds exist: what a group
     was put through is what the renewal costs. Pure — the table redraws. */
  KP.renewMood = function (st, t) {
    const g = t.groupId ? st.groups.find(x => x.id === t.groupId) : null;
    const chem = g ? KP.chemistry(st, g) : KP.bonds.mid;
    return U.clamp(t.morale * .55 + chem * .45, 0, 100);
  };

  /* What they are worth, and then what they think of you. `mood` is a
     multiplier on the fee rather than a separate gate, so a looked-after star
     is expensive and cheap at the same time — and below `refuseBelow` there is
     no number at all, which is the only place in the game money cannot answer. */
  KP.renewCost = function (st, t) {
    const C = KP.contracts;
    const g = t.groupId ? st.groups.find(x => x.id === t.groupId) : null;
    const worth = C.feeBase
      + Math.max(0, KP.overall(t) - 40) * C.feePerOverall
      + (g ? g.fans : 0) * C.feePerFan
      + (g ? (g.trophies || []).length : 0) * C.feePerTrophy;
    const mood = KP.renewMood(st, t);
    const mul = U.clamp(1 + (C.moodMid - mood) * C.moodPer, C.moodLo, C.moodHi);
    return Math.round(worth * mul / 1e6) * 1e6;
  };

  KP.willRenew = (st, t) => KP.renewMood(st, t) >= KP.contracts.refuseBelow;

  /* Everybody with a decision open on them, soonest first. One derivation, read
     by the rail badge and by the Trainees tab. */
  KP.renewals = function (st) {
    return st.trainees.filter(t => t.groupId && KP.inRenewWindow(st, t))
      .sort((a, b) => KP.contractLeft(st, a) - KP.contractLeft(st, b));
  };

  /* ============================ the survival show ==========================
     One show at a time, held in st.survival: a cast, a vote total per
     contestant that accrues while it runs, and a finals night the run owes the
     player exactly once — the same claim shape the awards ceremony uses, and
     for the same reason. A closed tab must not be able to lose it. */
  KP.survivalRunning = (st) => !!(st.survival && !st.survival.ready);
  KP.survivalLeft = function (st) {
    return st.survival ? Math.max(0, st.survival.endAbs - KP.absWeek(st)) : 0;
  };

  /* The cast, best-liked first. What the finals night is, and what the vote
     column on the Scouting tab reads while it is still running. */
  KP.survivalRanked = function (st) {
    if (!st.survival) return [];
    return st.survival.cast.slice().sort((a, b) => b.votes - a.votes);
  };

  /* How watchable somebody is, which is what the public is actually voting on —
     deliberately not KP.overall(). The contestant the audience wants and the
     contestant the scouting report wants are usually not the same person, and
     that is the entire decision the finals night exists to create. */
  KP.screenPresence = function (t) {
    const s = t.stats;
    return (s.visual * 1.2 + s.charisma * 1.0 + s.variety * .8 + s.dance * .5) / 3.5;
  };

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
  KP.tour = (key) => KP.tours.find(t => t.k === key) || null;

  KP.showSpec = (kind, key) => kind === 'live' ? KP.venue(key)
    : kind === 'tour' ? KP.tour(key) : KP.show(kind, key);

  KP.bookingSpec = function (b) { return KP.showSpec(b.kind, b.show); };

  KP.showsOf = (kind) => kind === 'live' ? KP.venues
    : kind === 'tour' ? KP.tours : (KP.bookings.shows[kind] || []);

  /* A tour leg is a live show with a different door: the same resolver, the same
     grading, the same stamina bill. This is the one question the two answer
     differently, so it is asked in one place. */
  KP.isGig = (kind) => kind === 'live' || kind === 'tour';

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

  /* ========================= the fandom as a system ========================
     Three numbers on a group say what kind of fandom it has, and everything
     they are worth is derived HERE and nowhere else — the engine spends the
     modifiers and the UI prints them, so a card can never quote a multiplier the
     week does not apply.

     Every modifier is written as a deviation from the starting values in
     KP.fandom, which is what makes this sprint additive in the balance sense as
     well as the save sense: a group at (55, 60, .12) has six modifiers of
     exactly 1.00 and the economy it walks into is the one it left.
     ====================================================================== */
  KP.loyalOf = (g) => typeof g.loyal === 'number' ? g.loyal : KP.fandom.loyal0;
  KP.sentiOf = (g) => typeof g.senti === 'number' ? g.senti : KP.fandom.senti0;
  KP.intlOf = (g) => typeof g.intl === 'number' ? g.intl : KP.fandom.intl0;

  KP.fanMods = function (g) {
    const F = KP.fandom;
    const dl = KP.loyalOf(g) - F.midLoyal;
    const ds = KP.sentiOf(g) - F.midSenti;
    const di = KP.intlOf(g) - F.intl0;
    const band = (v, lo, hi) => U.clamp(v, lo, hi);
    return {
      // Physical albums are a domestic ritual, and a loyal fandom buys four copies.
      sales: band(1 + dl * F.salesPer, F.salesLo, F.salesHi) * (1 + di * F.intlAlbum),
      // Goods sell to whoever is still holding a lightstick, at an overseas premium.
      merch: band(1 + dl * F.merchPer, F.merchLo, F.merchHi) * (1 + di * F.intlMerch),
      // Turning up is loyalty; a tour draws on the other half of the same number.
      pull: band(1 + dl * F.pullPer, F.pullLo, F.pullHi),
      // What the public thinks decides how fast strangers become fans...
      acq: band(1 + ds * F.acqPer, F.acqLo, F.acqHi),
      // ...and how a comeback is received before anybody has heard it.
      hype: band(1 + ds * F.hypePer, F.hypeLo, F.hypeHi),
      stream: 1 + di * F.intlStream
    };
  };

  /* How many of them are at home and how many are not. Rendered on the ocean and
     read by the tour, which sells to the right-hand number alone. */
  KP.fandomSplit = function (g) {
    const intl = Math.round(g.fans * KP.intlOf(g));
    return { intl, home: Math.max(0, g.fans - intl) };
  };

  /* Sasaeng and antifan pressure: fame buys it, a public that has turned on you
     multiplies it, and the dormitory is the only thing that buys it back. Pure,
     because the Fandom tab prints it beside the dorm level that is holding it
     down. */
  KP.pressure = function (st, g) {
    const F = KP.fandom;
    const fame = Math.min(F.pressFameCap,
      Math.pow(Math.max(g.fans, 1), F.pressFameExp) / F.pressFameDiv);
    const anti = Math.max(0, F.pressAntiFrom - KP.sentiOf(g)) * F.pressAnti;
    const dorm = (st.company.facilities.dorm - 1) * F.pressDorm;
    return U.clamp(fame + anti - dorm, 0, 100);
  };

  /* --------------------------- platform deals ------------------------------
     A deal record stores only what changes and looks its terms up in
     KP.platforms through KP.platformSpec(), the way a booking stores a show key
     and a rival stores an agency key. Re-pricing a platform reaches a save that
     is already running. */
  KP.platformSpec = (d) => KP.platforms.find(p => p.k === (d && d.k)) || null;

  KP.activeDeals = (st) => (st.company.deals || []).filter(d => d.weeksLeft > 0);

  /* Every live deal's multiplier, multiplied. Read by the streaming credit in
     promoWeek and quoted by the Fandom tab, so the two cannot disagree. */
  KP.streamMul = function (st) {
    return KP.activeDeals(st).reduce((m, d) => {
      const sp = KP.platformSpec(d);
      return m * (sp ? sp.streamMul : 1);
    }, 1);
  };

  /* Where the platforms are dragging the split. The strongest deal wins rather
     than the sum: two platforms do not make a fandom twice as foreign. */
  KP.dealIntlPull = function (st) {
    return KP.activeDeals(st).reduce((mx, d) => {
      const sp = KP.platformSpec(d);
      return sp ? Math.max(mx, sp.intlPull) : mx;
    }, 0);
  };

  /* A pending scandal stores the kind, not a copy of it — same seam as a booking
     and a rival agency, so re-writing a story's severity band reaches a save
     that is already holding one open. */
  KP.scandalSpec = (s) => KP.scandals.find(x => x.k === (s && s.k)) || null;

  /* The weekly merch line for one group, and the ONLY derivation of it: step 4c
     credits exactly this and KP.ledger projects exactly this. Two copies of it
     is how a HUD starts lying about income the week loyalty moves.

     A unit's fandom is a SUBSET of its parent's rather than a new one — the
     same person, holding the same lightstick, now also following two of them.
     A weekly line keyed to a head count therefore has to be discounted, or
     forming a sub-unit would print money by counting one fan one and a half
     times. Albums, tickets and streams are not discounted, because those are
     genuinely a second thing that fan bought. */
  KP.merchWeek = function (g) {
    const overlap = KP.isUnit(g) ? KP.units.merchShare : 1;
    return Math.round(g.fans * KP.income.merchPerFan * KP.fanMods(g).merch * overlap);
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
    // A save with no platform deal in it is a valid save. Sanitised on the same
    // terms as the debts, and for the same reason: `weekly` reaches KP.ledger,
    // and one NaN there is a NaN balance and an unloseable run.
    if (!Array.isArray(st.company.deals)) st.company.deals = [];
    st.company.deals = st.company.deals.filter(d => d && KP.platformSpec(d));
    st.company.deals.forEach(d => {
      ['weeks', 'weeksLeft', 'advance', 'paid', 'earned'].forEach(k => {
        if (typeof d[k] !== 'number' || !isFinite(d[k])) d[k] = 0;
      });
      if (typeof d.id !== 'string') d.id = U.uid('deal');
    });
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
    st.stats = Object.assign(KP.blankStats(), st.stats);
    // The same counters for the year in progress. Back-filled to ZERO rather
    // than to st.stats: a file written before the year-in-review existed has no
    // idea how much of its career happened since January, and starting the
    // year's column from the career total would print a first review claiming
    // every release the agency has ever made.
    st.statsY = Object.assign(KP.blankStats(), st.statsY);
    KP.STAT_KEYS.forEach(k => {
      if (typeof st.stats[k] !== 'number' || !isFinite(st.stats[k])) st.stats[k] = 0;
      if (typeof st.statsY[k] !== 'number' || !isFinite(st.statsY[k])) st.statsY[k] = 0;
    });
    // The record books and the years already looked back on. Both are additive
    // and both are dropped rather than repaired when they make no sense: a
    // record for a kind this build no longer has is a row nothing can label,
    // and a review with no year on it cannot be filed or found again.
    if (!st.records || typeof st.records !== 'object' || Array.isArray(st.records)) st.records = {};
    Object.keys(st.records).forEach(k => {
      const r = st.records[k];
      if (!KP.recordSpec(k) || !r || typeof r !== 'object'
        || typeof r.v !== 'number' || !isFinite(r.v)) { delete st.records[k]; return; }
      if (typeof r.by !== 'string') r.by = '';
      if (typeof r.sub !== 'string') r.sub = '';
      if (typeof r.y !== 'number' || !isFinite(r.y)) r.y = st.year;
      if (typeof r.w !== 'number' || !isFinite(r.w)) r.w = st.week;
    });
    if (!Array.isArray(st.reviews)) st.reviews = [];
    st.reviews = st.reviews
      .filter(r => r && typeof r === 'object' && typeof r.y === 'number' && isFinite(r.y))
      .slice(0, KP.awards.historyYears);
    if (typeof st.pendingReview !== 'number') st.pendingReview = null;
    // A story the run was in the middle of answering. Both of these are plain
    // records with a group id in them, and a group can disband between the week
    // the file was written and the week it is opened — a scandal about nobody is
    // dropped rather than carried into a modal with no group behind it.
    if (!st.scandal || typeof st.scandal !== 'object'
      || !st.groups.some(g => g.id === st.scandal.gid)
      || !KP.scandalSpec(st.scandal)) st.scandal = null;
    if (st.scandal && (typeof st.scandal.sev !== 'number' || !isFinite(st.scandal.sev))) st.scandal = null;
    if (!st.fallout || typeof st.fallout !== 'object'
      || typeof st.fallout.absWeek !== 'number' || !isFinite(st.fallout.absWeek)
      || !st.groups.some(g => g.id === st.fallout.gid)) st.fallout = null;
    st.trends = st.trends || {};
    KP.concepts.forEach(c => { if (typeof st.trends[c.k] !== 'number') st.trends[c.k] = 50; });
    // The rival agencies are additive: a file written before they existed has
    // none and gets the current roster built on the way in, with their groups
    // stamped as established rather than as this year's debutants — a name the
    // save has never watched debut is not a rookie, and handing an old file four
    // free rookie contenders would decide a prize it never saw contested.
    // An agency whose key this build no longer has goes with its groups: their
    // songs are already out in st.market and will decay out on their own.
    if (!Array.isArray(st.rivals)) st.rivals = [];
    st.rivals = st.rivals.filter(r => r && KP.rivalSpec(r));
    st.rivals.forEach(r => {
      if (typeof r.id !== 'string') r.id = 'ag_' + r.k;
      if (!Array.isArray(r.trainees)) r.trainees = [];
      if (!Array.isArray(r.groups)) r.groups = [];
      if (typeof r.lastDebutAbs !== 'number') r.lastDebutAbs = 0;
      if (typeof r.scoutedAbs !== 'number') r.scoutedAbs = null;
      r.groups = r.groups.filter(g => g && typeof g.name === 'string');
      r.groups.forEach(g => {
        if (!Array.isArray(g.members)) g.members = [];
        if (!Array.isArray(g.releases)) g.releases = [];
        // The numbers the tab and the release maths divide by. A NaN fandom here
        // spreads into their opening points and out onto the player's chart.
        ['fans', 'momentum', 'debutY', 'debutW', 'debutAbs', 'quiet'].forEach(k => {
          if (typeof g[k] !== 'number' || !isFinite(g[k])) g[k] = 0;
        });
        if (!KP.concepts.some(c => c.k === g.concept)) g.concept = KP.concepts[0].k;
        if (typeof g.color !== 'string') g.color = KP.groupColors[0];
        if (g.plan && typeof g.plan.absWeek !== 'number') g.plan = null;
        // A file written before contracts existed gets one derived from the id,
        // not rolled — the same rule the portrait back-fill follows, and for the
        // same reason: a rolled default would hand one save a different set of
        // farewells on every load. The floor keeps a long-running file from
        // losing its whole rival roster in the week it is opened, which is what
        // a term measured from a debut eight years ago would otherwise do.
        if (typeof g.retireAbs !== 'number' || !isFinite(g.retireAbs)) {
          const R = KP.rivals;
          const span = R.contract[1] - R.contract[0] + 1;
          const years = R.contract[0] + (U.hue(String(g.id || g.name)) % span);
          g.retireAbs = Math.max(g.debutAbs + years * KP.WEEKS_PER_YEAR,
            KP.absWeek(st) + KP.WEEKS_PER_YEAR);
        }
      });
    });
    KP.seedRivals(st);
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
      // `hiatus` is the third status, and it is additive in the same sense the
      // fields are: a file that has never heard of it simply has nobody on one.
      if (KP.STATUS.indexOf(t.status) < 0) { t.status = 'ok'; t.statusWeeks = 0; }
      // Pre-debut public awareness. A file from before the survival show existed
      // has nobody the public has heard of, which is exactly right.
      if (typeof t.fame !== 'number' || !isFinite(t.fame)) t.fame = 0;
      t.fame = U.clamp(t.fame, 0, 100);
      // The contract clock. A person already in a group when the file was
      // written has been on the payroll for an unknown length of time, so the
      // term is measured from the GROUP's debut rather than from now — an idol
      // who debuted six years ago walks into their renewal year, which is the
      // honest reading of a save that predates contracts. Somebody with no group
      // has no term to run, and a member whose group has no debut on record
      // starts the clock today rather than crashing the table.
      if (t.groupId && typeof t.contractAbs !== 'number') {
        const g = st.groups.find(x => x.id === t.groupId);
        const w = KP.WEEKS_PER_YEAR;
        const debutAbs = g && g.debut && typeof g.debut.y === 'number'
          ? (g.debut.y - 1) * w + (g.debut.w || 1) : KP.absWeek(st);
        t.debutAbs = typeof t.debutAbs === 'number' ? t.debutAbs : debutAbs;
        t.contractAbs = t.debutAbs + KP.contracts.termYears * w;
      }
      if (!t.groupId) { delete t.debutAbs; delete t.contractAbs; }
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
      // The three numbers that say what kind of fandom this is. Additive, and
      // back-filled to the starting values rather than to anything derived: the
      // whole modifier set is written as a deviation from exactly these, so a
      // save from before the sprint loads into the economy it was playing in and
      // then starts moving. A NaN here would reach album sales, merch, the gate
      // and the hype of every future comeback at once.
      const FD = KP.fandom;
      if (typeof g.loyal !== 'number' || !isFinite(g.loyal)) g.loyal = FD.loyal0;
      if (typeof g.senti !== 'number' || !isFinite(g.senti)) g.senti = FD.senti0;
      if (typeof g.intl !== 'number' || !isFinite(g.intl)) g.intl = FD.intl0;
      g.loyal = U.clamp(g.loyal, 0, 100);
      g.senti = U.clamp(g.senti, 0, 100);
      g.intl = U.clamp(g.intl, 0, FD.intlCap);
      if (typeof g.tourLegs !== 'number' || !isFinite(g.tourLegs)) g.tourLegs = 0;
      if (typeof g.toursY !== 'number') g.toursY = 0;
      // The room. Additive, and back-filled EMPTY rather than seeded: KP.bondOf
      // answers KP.bonds.base for a pair it has never heard of, so a save from
      // before the sprint loads as a line-up that has neither earned anything
      // nor been put through anything — which is the only honest reading of a
      // history the file never kept. A NaN in here reaches song quality.
      if (!g.bonds || typeof g.bonds !== 'object' || Array.isArray(g.bonds)) g.bonds = {};
      Object.keys(g.bonds).forEach(k => {
        const v = g.bonds[k];
        if (typeof v !== 'number' || !isFinite(v)) delete g.bonds[k];
        else g.bonds[k] = U.clamp(v, 0, 100);
      });
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
    // Units, after the group loop because every one of these reads a second
    // group. A unit is only a unit while all three of its dependencies hold: a
    // kind this build still has, a parent that still exists, and members the
    // parent still has. Anything else is a card with nobody in it — so it is
    // dropped, and the booking filter below takes its diary with it.
    st.groups = st.groups.filter(g => {
      if (!KP.isUnit(g)) return true;
      const p = st.groups.find(x => x.id === g.parentId && !KP.isUnit(x));
      if (!p || !KP.unitSpec(g)) return false;
      g.memberIds = g.memberIds.filter(id => p.memberIds.indexOf(id) >= 0);
      return g.memberIds.length > 0;
    });
    // A survival show is additive and self-contained: a file that never ran one
    // has none. A cast that lost its people is a finals night with nobody on the
    // stage, so it goes rather than being half-restored.
    if (!st.survival || typeof st.survival !== 'object'
      || !Array.isArray(st.survival.cast) || !st.survival.cast.length
      || typeof st.survival.endAbs !== 'number' || !isFinite(st.survival.endAbs)) {
      st.survival = null;
    } else {
      st.survival.ready = !!st.survival.ready;
      st.survival.cast.forEach(t => {
        if (typeof t.votes !== 'number' || !isFinite(t.votes)) t.votes = 0;
      });
    }
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
