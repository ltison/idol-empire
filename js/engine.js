/* =============================================================================
   IDOL EMPIRE — simulation engine
   One public entry point per player action, plus nextWeek() which advances time.
   ============================================================================= */
(function () {
  const U = KP.util;
  const E = KP.engine = {};

  /* ============================== helpers ================================== */

  function traitMul(t, path, stat) {
    let m = 1;
    t.traits.forEach(k => {
      const tr = KP.trait(k);
      if (!tr || !tr[path]) return;
      const v = tr[path];
      if (typeof v === 'object') { if (v[stat]) m *= v[stat]; if (v.all) m *= v.all; }
      else m *= v;
    });
    return m;
  }

  function traitAdd(t, path) {
    let a = 0;
    t.traits.forEach(k => { const tr = KP.trait(k); if (tr && typeof tr[path] === 'number') a += tr[path]; });
    return a;
  }

  /* Group strength for a concept: half the room's average, half its best member.
     A single monster vocalist genuinely carries a title track. */
  E.groupScore = function (members, conceptKey) {
    if (!members || !members.length) return 0;      // 0/0 would poison money and fans with NaN
    const c = KP.concept(conceptKey);
    const keys = Object.keys(c.w);
    const total = keys.reduce((s, k) => s + c.w[k], 0);
    let score = 0;
    keys.forEach(k => {
      const vals = members.map(m => m.stats[k]);
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      const best = Math.max.apply(null, vals);
      score += (c.w[k] / total) * (avg * .4 + best * .6);
    });
    return score;
  };

  E.conceptTrend = function (st, key) { return st.trends[key] != null ? st.trends[key] : 50; };

  /* The one law of fandom growth: a raw gain, damped by how big the fandom
     already is. EVERY new-fan number in the game goes through here.

     This matters most for the gains that are written as a share of the fandom
     itself — a music stage, a variety appearance, a viral fancam. Those are
     compound interest, and compound interest with no damping term is a runaway:
     a group with a full weekly diary takes on roughly 13% a week, which is a
     factor of six hundred a year, and by year four the fandom and the merch
     income keyed to it are past anything the number formatter can print. Damped,
     the percentage terms converge on a constant number of new fans per week, so
     a big fandom still grows every week and still grows forever — it just stops
     being exponential. Seat sales (a live show) are already bounded by the venue
     and are credited as they are. */
  function fanGain(g, raw) {
    return Math.round(raw / (1 + g.fans / KP.income.fanSaturation));
  }
  E.fanGain = fanGain;

  /* The one place fans are ADDED, as opposed to counted. fanGain stays pure
     because the previews quote it; this is the mutating half, and it does the
     second thing a new fan does: dilute.

     A newcomer arrives at KP.fandom.newFanLoyal and is averaged into the loyalty
     of everybody already holding a lightstick, which is what stops a viral week
     from being free. A fancam worth 14% of the fandom moves loyalty by about
     three and a half points; a stage worth 2% barely registers. Growth is real
     and it is shallow, and going out — a fan meeting, a variety slot — is what
     turns it back into a fandom that buys things. */
  function creditFans(g, n) {
    if (!(n > 0)) return 0;
    const F = KP.fandom;
    const before = Math.max(0, g.fans);
    g.loyal = U.clamp((KP.loyalOf(g) * before + F.newFanLoyal * n) / (before + n), 0, 100);
    g.fans += n;
    return n;
  }

  const gainFans = (g, raw) => creditFans(g, fanGain(g, raw));
  E.gainFans = gainFans;
  // Seat sales are already bounded by the venue, so they skip the damper and go
  // straight in — but they are still new fans, and new fans still dilute.
  E.creditFans = creditFans;

  /* Loyalty and sentiment move in a lot of places and are clamped in exactly
     one, so nothing can walk a group off either end of its own bar. */
  function bumpLoyal(g, d) { g.loyal = U.clamp(KP.loyalOf(g) + d, 0, 100); }
  function bumpSenti(g, d) { g.senti = U.clamp(KP.sentiOf(g) + d, 0, 100); }
  E.bumpLoyal = bumpLoyal;
  E.bumpSenti = bumpSenti;

  /* The single choke point for income. An investor's revenue share comes out
     here, at the moment money is earned, on every tagged credit — which is why
     KP.ledger must NOT bill it again in step 5. `tag` is what decides whether a
     credit is shareable at all. Borrowed money never passes through here: a
     financier does not take a cut of their own cheque. */
  E.earn = function (st, amount, tag) {
    if (!(amount > 0)) return 0;
    if (!KP.finance.shareTags[tag]) { st.company.money += amount; return amount; }
    const debts = st.company.debts || [];
    let rate = 0;
    debts.forEach(d => { if (d.type === 'investor' && d.weeksLeft > 0) rate += d.share; });
    rate = Math.min(rate, 1);
    const cut = Math.round(amount * rate);
    // Each of them books their own share, so a buyout price knows what they took.
    debts.forEach(d => {
      if (d.type === 'investor' && d.weeksLeft > 0) d.paid += Math.round(amount * d.share);
    });
    st.company.money += amount - cut;
    return amount - cut;
  };

  /* The single choke point for the counters, on exactly the terms E.earn is one
     for money. st.stats is the career and st.statsY is the year in progress,
     and they are the same fourteen numbers — written apart, the year-in-review
     would start disagreeing with the career total it is a slice of the first
     time somebody added a counter and updated one of them. */
  function bumpStat(st, key, n) {
    const d = n == null ? 1 : n;
    st.stats[key] = (st.stats[key] || 0) + d;
    st.statsY = st.statsY || KP.blankStats();
    st.statsY[key] = (st.statsY[key] || 0) + d;
  }
  E.bumpStat = bumpStat;

  /* ============================= the record books ==========================
     A high-water mark, and the only thing that ever writes one. Everything is a
     MAXIMUM (see the note on KP.recordKinds), so this is a comparison and a
     stamp and nothing else — no history, no ties, no second place. A record
     that is not beaten is not touched, which is what keeps ten records off the
     weekly save-size bill.

     Called from wherever the thing actually happens, the way E.ybAct is: a gate
     is recorded in resolveLive because that is the only place a gate exists. */
  E.record = function (st, key, value, by, sub) {
    if (!KP.recordSpec(key)) return null;
    const v = Math.round(value);
    if (!isFinite(v) || v <= 0) return null;
    st.records = st.records || {};
    const cur = st.records[key];
    if (cur && cur.v >= v) return null;
    const rec = { v, by: String(by || ''), sub: String(sub || ''), y: st.year, w: st.week };
    st.records[key] = rec;
    return rec;
  };

  /* ============================== the market =============================== */

  function ensureMarket(st) {
    if (st.market) return;
    st.market = [];
    for (let i = 0; i < 22; i++) st.market.push(newRivalSong(st, U.rnd(0, 6)));
  }

  /* Whose song this is. Most weeks it belongs to the established roster; from the
     second year on, a small share of them belong to somebody brand new.

     That share is the whole reason this function exists. Every artist in the
     opening market is stamped debutY 0 by E.accrueYearbook — deliberately, since
     no complete year has been watched yet — so a market that only ever drew on
     KP.rivalArtists could never again field an act with `debutY === year`, and
     the rookie ballot would contain nothing but the player's own groups for the
     rest of the run. A generated name gets stamped with the current year the week
     it first charts and stands in that ballot on its own chart record.

     A debutant that charted keeps releasing for KP.rivalDebutActive more years and
     is then dropped from the draw: rookies promote hard, and the ones that do not
     stick stop being names on a chart. That also keeps the roster the other
     prizes are contested on at roughly its opening size. */
  function rivalName(st) {
    const known = st.knownRivals || {};
    // Names that belong to an agency with actual members in it. They are stamped
    // into knownRivals at debut and their names come out of the same
    // KP.groupNameParts bag as a generated debutant's, so without this the
    // anonymous market would publish songs under a group the player can open and
    // read the line-up of — two different acts, one name, one chart.
    const owned = KP.rivalGroupNames(st);
    if (st.awards.length && U.chance(KP.rivalDebutChance)) {
      for (let i = 0; i < 12; i++) {
        const n = U.pick(KP.groupNameParts.a) + (U.chance(.5) ? ' ' : ':') + U.pick(KP.groupNameParts.b);
        if (known[n] == null && owned.indexOf(n) < 0 && !st.groups.some(g => g.name === n)) return n;
      }
    }
    const active = Object.keys(known).filter(n =>
      known[n] > 0 && st.year - known[n] <= KP.rivalDebutActive && owned.indexOf(n) < 0);
    return U.pick(active.length ? KP.rivalArtists.concat(active) : KP.rivalArtists);
  }

  function newRivalSong(st, agedWeeks) {
    // A song is as strong as the week it entered in, not the week we are in now,
    // so a song aged into the market carries its own season's field with it.
    const field = KP.seasonOfAbs(KP.absWeek(st) - agedWeeks).field;
    const strong = U.chance(.16);
    const base = (strong ? U.gauss(84, 7) : U.gauss(50, 16)) * field;
    const s = {
      artist: rivalName(st),
      title: U.pick(KP.titleWords.a) + ' ' + U.pick(KP.titleWords.b),
      points: U.clamp(base, 8, 99),
      week: 1
    };
    for (let i = 0; i < agedWeeks; i++) { s.points *= .86; s.week++; }
    return s;
  }

  function tickMarket(st) {
    ensureMarket(st);
    st.market.forEach(s => { s.points *= U.rnd(.85, .92); s.week++; });
    st.market = st.market.filter(s => s.points > 9 && s.week < 12);
    // Volume moves with the calendar as well as strength — a comeback season is
    // crowded, a lull is thin. Never below one: an empty week is not a chart.
    const incoming = Math.max(1, U.irnd(2, 4) + KP.seasonNow(st).entrants);
    for (let i = 0; i < incoming; i++) st.market.push(newRivalSong(st, 0));
  }

  /* Builds the full ranked table: rivals + every active release we own. */
  function buildChart(st) {
    // `rid` rides along on a rival agency's own release so step 4b can find its
    // row again. Every other consumer of a chart row ignores it.
    const rows = st.market.map(s => ({
      artist: s.artist, title: s.title, points: s.points, mine: false, rid: s.rid || null
    }));
    st.groups.forEach(g => {
      if (!g.active) return;
      rows.push({ artist: g.name, title: g.active.title, points: g.active.points, mine: true, groupId: g.id });
    });
    rows.sort((a, b) => b.points - a.points);
    rows.forEach((r, i) => r.rank = i + 1);
    return rows;
  }

  /* ============================ rival agencies ==============================
     The market above is a chart with nobody behind it. This is the other half:
     four buildings that audition, train, debut and come back on a diary, and
     whose releases go into the SAME st.market and are ranked by the same
     buildChart. A rival song is a market song with a `rid` on it — nothing else
     in the chart pipeline needs to know they exist, and a save that predates
     them is a save whose market is simply all anonymous.

     Two entry points, and the split between them is the ordering rule:

       E.rivalWeek      step 3c, BEFORE buildChart. They act, and a comeback
                        whose week has come enters the market in time to be on
                        THIS week's chart — the week the player was warned about.
       E.rivalChartWeek step 4b, AFTER buildChart. They read the same ranking the
                        player does: fandom, momentum, peak, and the moment a
                        song drops out of the market and the run is archived.

     Nothing here bills or credits the player's balance. The only won a rival
     ever moves is the cost of a scouting report, which the player chooses.
     ======================================================================== */

  /* They train too, and this is why passing on a fifteen-year-old ace has a
     price with a two-year fuse. Flat toward the ceiling rather than the player's
     whole stamina/morale/facility stack: an agency the player cannot manage does
     not need a management model, it needs to get better at a legible rate. */
  function trainRival(r, sp) {
    const rate = KP.rivals.trainRate * sp.pull;
    const bump = (t) => KP.STATS.forEach(s => {
      const gap = t.potential[s.k] - t.stats[s.k];
      if (gap <= 0) return;
      // Rounded on the way in, not on the way out: KP.save() stringifies the
      // whole state every week and sixty-odd rival people carrying six
      // full-precision floats each is most of a save file, for a number nothing
      // in the game ever reads past one decimal.
      const v = Math.min(t.potential[s.k], t.stats[s.k] + rate * (gap / 26));
      t.stats[s.k] = Math.round(v * 10) / 10;
    });
    r.trainees.forEach(bump);
    r.groups.forEach(g => g.members.forEach(bump));
  }

  /* The diary. A plan exists from the moment the last release wrapped, weeks or
     months before the player is allowed to see it — which is what a scouting
     report buys, and why the wall is a decision rather than a dice roll. */
  function planComeback(st, r, g, abs, gap) {
    const at = abs + gap;
    // Nothing gets booked past the end of the contract. An announcement four
    // weeks out is a promise the player plans around, and an act that retired
    // before its own comeback would be a wall that never arrived — so the last
    // release inside the term is simply the last one, and the diary goes empty.
    if (typeof g.retireAbs === 'number' && at > g.retireAbs) { g.plan = null; return; }
    const season = KP.seasonOfAbs(at);
    // They chase the season and the trend board exactly like the player does, so
    // the fashionable week is a contested week rather than a free one.
    const concept = U.chance(.55) ? U.pick(season.favours)
      : KP.concepts.slice().sort((a, b) => st.trends[b.k] - st.trends[a.k])[0].k;
    g.plan = {
      absWeek: at,
      title: U.pick(KP.titleWords.a) + ' ' + U.pick(KP.titleWords.b),
      concept,
      announced: false
    };
  }

  /* What a rival release is worth, with no roll in it — so the schedule board,
     the comeback planner and the release itself all quote one number.

     Deliberately the SAME SHAPE as E.planPreview's last line, `quality * .58 +
     hype * .42`, because the two numbers are ranked against each other on one
     chart and a formula of a different shape does not stay comparable as either
     side grows. `pull` stands in for everything the player buys a tier at a time
     — the producer, the choreographer, the film crew — which is what an agency's
     prestige actually is.

     Written the first way round (skill + fandom + trend, all multiplied) every
     established rival sat on the 99 clamp within three years: three uncapped
     terms and two multipliers on top, against a player whose two terms are each
     capped at 100 by construction. Every comeback was then the same
     unbeatable wall, which is the opposite of a wall being worth announcing. */
  E.rivalStrength = function (st, r, g, absWeek, conceptKey) {
    const sp = KP.rivalSpec(r);
    if (!sp) return 0;
    const key = conceptKey || (g.plan && g.plan.concept) || g.concept;
    const skill = E.groupScore(g.members, key);
    // Capped like the player's own fanPull, and lower: past a million fans every
    // agency would otherwise carry the identical term and the roster flattens.
    const fanPull = Math.min(26, Math.pow(Math.max(g.fans, 1), .42) / 6);
    const quality = U.clamp(skill * .46 + sp.pull * 32, 0, 100);
    const hype = U.clamp(fanPull + E.conceptTrend(st, key) * .28 + g.momentum * .18, 0, 100);
    // The last years of the contract, read at the week being asked about rather
    // than at today: a comeback four weeks out is quoted with the edge the act
    // will have on the night. This is the only term that can fall over a career
    // — everything above it plateaus — and it is what makes a veteran wall
    // beatable before it is gone rather than the week after.
    const fade = KP.rivalCareer(st, g, absWeek).fade;
    return U.clamp((quality * .58 + hype * .42) * KP.seasonOfAbs(absWeek).field * fade, 8, 99);
  };

  /* What an unscouted comeback is called. The player is told a rival is coming
     either way; the number is what the report is for. */
  E.rivalWall = function (points) {
    const R = KP.rivals;
    return points >= R.wallBig ? 'a wall' : points >= R.wallReal ? 'a serious comeback' : 'a small release';
  };

  function releaseRival(st, r, g, abs) {
    const plan = g.plan;
    g.plan = null;
    const points = U.clamp(E.rivalStrength(st, r, g, abs, plan.concept) * U.rnd(.92, 1.10), 8, 99);
    ensureMarket(st);
    // Into the same market as everything else, so tickMarket decays it, the
    // twelve-week window retires it and buildChart ranks it against the player.
    st.market.push({ artist: g.name, title: plan.title, points, week: 1, rid: g.id });
    g.active = { title: plan.title, concept: plan.concept, points, peak: 99, weeks: 0, no1: 0 };
    g.lastReleaseAbs = abs;
    g.momentum = U.clamp(g.momentum + 10, 0, 100);
    // The next one goes straight back in the diary — an agency is never between
    // plans, only between what the player can and cannot see.
    const sp = KP.rivalSpec(r);
    planComeback(st, r, g, abs, U.irnd(sp.pace[0], sp.pace[1]));
    KP.log(sp.name + '’s ' + g.name + ' is back with “' + plan.title + '”.', 'info');
    pushRecap(st, '⚔️', g.name + ' (' + sp.name + ') released “' + plan.title + '”', '');
  }

  function maybeRivalDebut(st, r, sp, abs) {
    const R = KP.rivals;
    if (r.groups.length >= sp.maxGroups) return;
    if (abs - (r.lastDebutAbs || 0) < R.debutGap) return;
    const ready = r.trainees.filter(t => KP.overall(t) >= R.debutOverall)
      .sort((a, b) => KP.overall(b) - KP.overall(a));
    if (ready.length < R.debutReady) return;

    const members = ready.slice(0, Math.min(ready.length, U.irnd(R.memberRange[0], R.memberRange[1])));
    const g = KP.newRivalGroup(st, r, members);
    r.trainees = r.trainees.filter(t => members.indexOf(t) < 0);
    r.lastDebutAbs = abs;
    planComeback(st, r, g, abs, U.irnd(R.firstGap[0], R.firstGap[1]));
    // Loud on purpose: this is the other half of the rookie race, and the player
    // may well be looking at somebody they auditioned two years ago.
    KP.log('🎬 ' + sp.name + ' debuted ' + g.name + ' — ' + members.length + ' members, ' +
      U.num(g.fans) + ' fans on day one.', 'big');
    pushRecap(st, '🎬', sp.name + ' debuted ' + g.name, 'big');
  }

  /* Step 3c. */
  E.rivalWeek = function (st) {
    KP.seedRivals(st);
    const R = KP.rivals;
    const abs = KP.absWeek(st);
    st.rivals.forEach(r => {
      const sp = KP.rivalSpec(r);
      if (!sp) return;
      trainRival(r, sp);
      // An agency with no room for another act stops auditioning. It can still
      // be poached into — a major always signs the best kid in the room — but it
      // stops manufacturing hopefuls it has nowhere to debut.
      if (r.groups.length < sp.maxGroups && r.trainees.length < R.rosterCap && U.chance(sp.recruit)) {
        r.trainees.push(KP.makeRivalPerson(U.rnd(sp.quality[0], sp.quality[1]), sp.gender));
      }
      maybeRivalDebut(st, r, sp, abs);

      // The contract runs out. This is the ONLY thing that frees a group slot,
      // and therefore the only thing that keeps agency debuts happening at all:
      // without it every agency reaches maxGroups inside two years and never
      // debuts again, the rookie race loses its agency half, and the hopeful the
      // player passed on sits in somebody else's building for the rest of the
      // run with nowhere to go. It is a term rather than a performance test
      // because these acts never stop charting — see the note in KP.rivals.
      // Never mid-promotion: an act sees its last release out first, so no song
      // vanishes off a chart the player is competing on.
      const gone = r.groups.filter(g => !g.active && KP.rivalCareer(st, g, abs).done);
      if (gone.length) {
        r.groups = r.groups.filter(g => gone.indexOf(g) < 0);
        gone.forEach(g => {
          const yrs = Math.max(1, Math.round(KP.rivalCareer(st, g, abs).years));
          KP.log(sp.name + ' and ' + g.name + ' did not renew — ' + yrs + ' years, ' +
            g.releases.length + ' single' + (g.releases.length === 1 ? '' : 's') + ', and that is the run.', 'info');
          pushRecap(st, '🕯', g.name + ' (' + sp.name + ') have disbanded', '');
        });
      }

      r.groups.forEach(g => {
        // A group loaded out of a save from before the diary existed, or one that
        // somehow lost its plan, gets one rather than going quiet forever — but
        // planComeback refuses to book past the term, so an act inside its last
        // months keeps an empty diary and simply waits for the block above.
        if (!g.plan) planComeback(st, r, g, abs, U.irnd(sp.pace[0], sp.pace[1]));
        if (!g.plan) return;
        if (g.plan.absWeek <= abs) return releaseRival(st, r, g, abs);
        // The week it becomes public knowledge. Checked with <= rather than ===
        // so a save loaded inside the window still announces exactly once.
        if (!g.plan.announced && g.plan.absWeek - abs <= R.announceLead) {
          g.plan.announced = true;
          const pts = E.rivalStrength(st, r, g, g.plan.absWeek);
          KP.log(sp.name + ' announced a ' + g.name + ' comeback for ' +
            weekLabel(st, g.plan.absWeek) + ' — ' + E.rivalWall(pts) + '.', 'info');
          pushRecap(st, '📣', g.name + ' comeback announced · ' + weekLabel(st, g.plan.absWeek), '');
        }
      });
    });
  };

  /* Step 4b. Reads the full chart, not st.chart's stored twenty-five: a rival
     group holding #34 for two months is a real year and its fandom should say so. */
  E.rivalChartWeek = function (st, chart) {
    if (!st.rivals || !st.rivals.length) return;
    const rows = {};
    chart.forEach(row => { if (row.rid) rows[row.rid] = row; });

    st.rivals.forEach(r => {
      const sp = KP.rivalSpec(r);
      r.groups.forEach(g => {
        const row = rows[g.id];
        if (row) {
          if (!g.active) g.active = { title: row.title, concept: g.concept, points: row.points, peak: 99, weeks: 0, no1: 0 };
          g.quiet = 0;
          g.active.points = row.points;
          g.active.peak = Math.min(g.active.peak, row.rank);
          g.active.weeks++;
          // Damped through the same fanGain the player's fandom is, for the same
          // reason: this is a percentage-free but unbounded source, and an
          // undamped rival fandom feeds straight back into their opening points.
          g.fans += fanGain(g, Math.pow(row.points, 1.5) * KP.rivals.fanPerPoint);
          if (row.rank === 1) {
            g.active.no1++;
            g.momentum = U.clamp(g.momentum + 8, 0, 100);
            KP.log('🏆 ' + g.name + ' (' + sp.name + ') took #1 with “' + row.title + '”.', 'bad');
          } else if (row.rank <= 10) {
            g.momentum = U.clamp(g.momentum + 2.5, 0, 100);
          }
          return;
        }
        // No row means the song has decayed out of the market: the run is over.
        if (g.active) {
          const a = g.active;
          g.releases.unshift({ title: a.title, concept: a.concept, peak: a.peak, weeks: a.weeks, no1: a.no1, y: st.year, w: st.week });
          while (g.releases.length > 12) g.releases.pop();
          g.momentum = U.clamp(g.momentum + (a.peak <= 3 ? 12 : a.peak <= 10 ? 5 : -6), 0, 100);
          g.active = null;
        }
        g.quiet = (g.quiet || 0) + 1;
        g.fans = Math.round(g.fans * KP.rivals.idleDecay);
        g.momentum = U.clamp(g.momentum - 1.6, 0, 100);
      });
    });
  };

  /* The audition room, from the other side. Called on the way OUT of a round —
     the hopefuls the player left on the table are the ones somebody else signs,
     and they turn up four years later with a name the player recognises.

     Only agencies auditioning for the player's own kind of group are in the
     room, which is also the rule that keeps a boy-group agency from debuting the
     girl trainee you passed on. */
  E.rivalPoach = function (st) {
    KP.seedRivals(st);
    const R = KP.rivals;
    if (!st.scoutPool.length || !U.chance(R.poachChance)) return null;
    const pool = st.rivals.filter(r => {
      const sp = KP.rivalSpec(r);
      return sp && sp.gender === st.company.gender;
    });
    if (!pool.length) return null;
    const best = st.scoutPool.slice().sort((a, b) => KP.potentialOverall(b) - KP.potentialOverall(a))[0];
    // Nobody makes the news for signing an average hopeful.
    if (!best || KP.potentialOverall(best) < R.poachFloor) return null;

    const r = U.pick(pool);
    const sp = KP.rivalSpec(r);
    // A full building still signs the best kid in the room — it lets somebody go
    // to do it. Gating the poach on a free desk instead is what quietly ended
    // this mechanic around year two: every roster reaches the cap and stays
    // there, and the one thing that makes an audition decision hurt stops
    // happening for the rest of the run.
    if (r.trainees.length >= R.rosterCap) {
      const worst = r.trainees.slice().sort((a, b) => KP.potentialOverall(a) - KP.potentialOverall(b))[0];
      if (!worst || KP.potentialOverall(worst) >= KP.potentialOverall(best)) return null;
      r.trainees = r.trainees.filter(t => t !== worst);
    }
    st.scoutPool = st.scoutPool.filter(t => t !== best);
    r.trainees.push(KP.stripRivalPerson(best));
    KP.log(sp.name + ' signed ' + best.name + ' out of the audition room you just closed — ceiling ' +
      KP.potentialOverall(best) + '.', 'bad');
    pushRecap(st, '🕵️', sp.name + ' signed ' + best.name + ' · ceiling ' + KP.potentialOverall(best), 'bad');
    return best;
  };

  /* A report on one building: their trainee roster, their line-ups, and the
     whole comeback diary rather than the four weeks of it that are public. It
     buys information and nothing else — no gate moves, no number improves. */
  E.scoutRival = function (st, id) {
    const r = (st.rivals || []).find(x => x.id === id);
    const sp = r && KP.rivalSpec(r);
    if (!sp) return { ok: false, msg: 'No such agency.' };
    const cost = KP.rivals.scoutCost;
    if (st.company.money < cost) return { ok: false, msg: 'A scouting report costs ' + U.money(cost) + '.' };
    st.company.money -= cost;
    r.scoutedAbs = KP.absWeek(st);
    KP.log('Commissioned a report on ' + sp.name + ' · ' + U.money(cost) +
      ' — their diary is open for ' + KP.rivals.scoutWeeks + ' weeks.', 'info');
    return { ok: true, cost };
  };

  /* ============================== training ================================= */

  function trainWeek(st, t) {
    // A name the public knows is a wasting asset. Ten weeks of television is
    // worth a fandom at the debut showcase and nothing at all three years later,
    // which is the pressure a survival-show signing puts on the training plan:
    // debut them before they are ready, or debut somebody nobody remembers.
    if (t.fame > 0 && !t.groupId) {
      t.fame = t.fame * KP.survival.fameDecay;
      if (t.fame < .5) t.fame = 0;
    }
    // Two ways to be off the schedule, and they are not the same week. An injury
    // is something that happened to somebody; a hiatus is a decision the agency
    // made about a story, and the point of it is that the person actually rests.
    if (t.status === 'injured' || t.status === 'hiatus') {
      const out = t.status;
      t.statusWeeks--;
      t.stamina = U.clamp(t.stamina + (out === 'hiatus' ? 20 : 12), 0, 100);
      t.morale = U.clamp(t.morale + (out === 'hiatus' ? 4 : -1.5), 0, 100);
      if (t.statusWeeks <= 0) {
        t.status = 'ok';
        KP.log(out === 'hiatus'
          ? t.name + ' is back from hiatus.'
          : t.name + ' is cleared to train again.', 'good');
      }
      return;
    }

    // A better dorm means people actually recover on their days off.
    const dorm = st.company.facilities.dorm;

    if (t.focus === 'rest') {
      t.stamina = U.clamp(t.stamina + U.rnd(24, 34) * (1 + .12 * (dorm - 1)) / traitMul(t, 'stamina'), 0, 100);
      t.morale = U.clamp(t.morale + U.rnd(7, 13) + (dorm - 1) * 1.6 + traitAdd(t, 'morale'), 0, 100);
      return;
    }

    const key = t.focus;
    const gap = t.potential[key] - t.stats[key];
    const facil = st.company.facilities.training;
    const staffKey = key === 'vocal' || key === 'rap' ? 'vocal' : key === 'dance' ? 'dance' : 'producer';
    const staff = st.company.staff[staffKey];

    const staminaF = .35 + .65 * (t.stamina / 100);
    const moraleF = .6 + .4 * (t.morale / 100);
    const ageF = t.age <= 17 ? 1.15 : t.age <= 20 ? 1 : .82;
    const lateF = t.traits.includes('slowstart') && t.weeksTrained > 46 ? 1.9 : 1;
    const base = .5 + .24 * facil + .18 * staff;

    let gain = base * (Math.max(gap, 0) / 26) * staminaF * moraleF * ageF * lateF
      * traitMul(t, 'train', key) * U.rnd(.75, 1.35);
    if (gap <= 0) gain = .04;

    t.stats[key] = Math.min(t.potential[key], t.stats[key] + gain);
    t.stamina = U.clamp(t.stamina - U.rnd(9, 16) * (1 - .05 * (dorm - 1)) * traitMul(t, 'stamina'), 0, 100);
    t.morale = U.clamp(t.morale - U.rnd(.8, 2.4) + (dorm - 1) * .4 + traitAdd(t, 'morale'), 0, 100);
    t.weeksTrained++;

    // Overwork has a real cost.
    if (t.stamina < 14 && U.chance(.10 * traitMul(t, 'injury'))) {
      t.status = 'injured';
      t.statusWeeks = U.irnd(2, 4);
      KP.log(t.name + ' collapsed in practice — out for ' + t.statusWeeks + ' weeks.', 'bad');
      pushRecap(st, '🚑', t.name + ' is injured (' + t.statusWeeks + 'w)', 'bad');
    }
  }

  /* ============================ release cycle ============================== */

  E.planCost = function (sel) {
    const T = KP.tiers;
    return T.producer.find(x => x.k === sel.producer).cost
      + T.choreo.find(x => x.k === sel.choreo).cost
      + T.mv.find(x => x.k === sel.mv).cost
      + T.styling.find(x => x.k === sel.styling).cost;
  };

  /* Preview numbers shown in the comeback planner — same maths as the release. */
  E.planPreview = function (st, g, sel, conceptKey) {
    const T = KP.tiers;
    const members = KP.memberOf(st, g);
    const prod = T.producer.find(x => x.k === sel.producer);
    const cho = T.choreo.find(x => x.k === sel.choreo);
    const mv = T.mv.find(x => x.k === sel.mv);
    const sty = T.styling.find(x => x.k === sel.styling);
    const promo = T.promo.find(x => x.k === sel.promo);

    const studio = st.company.facilities.studio;
    const mkt = st.company.staff.marketing;

    // The room, on top of the six stat blocks in it. Chemistry lands on quality
    // rather than on hype on purpose: what a line-up that gets on produces is a
    // better record, not a better press cycle — and it is the one number in the
    // planner the player cannot buy this week.
    const chem = KP.chemPerf(st, g);
    const skill = E.groupScore(members, conceptKey);
    const quality = U.clamp((.46 * skill + .32 * prod.q + .22 * cho.q + (studio - 1) * 1.6) * chem, 0, 100);
    const trend = E.conceptTrend(st, conceptKey);
    const fresh = g.lastConcept === conceptKey ? .93 : 1.04;   // repeating a concept gets stale
    const visualPull = .5 * mv.q + .5 * sty.q;

    const fanPull = Math.min(38, Math.pow(g.fans, .42) / 6);
    const repPull = KP.standing(st) * .22;

    // Comebacks stacked on top of each other wear the fandom out.
    const abs = KP.absWeek(st);
    const gap = g.lastReleaseAbs == null ? 99 : abs - g.lastReleaseAbs;
    const fatigue = gap >= 16 ? 1 : .58 + .42 * (gap / 16);

    let buzz = 1;
    members.forEach(m => { buzz *= traitMul(m, 'buzz'); });   // Variety Star finally earns its slot

    // What the public currently thinks of them, before anybody has heard the
    // song. A group coming off a scandal releases into a colder room, and the
    // planner says so rather than letting the release discover it.
    const mods = KP.fanMods(g);

    const hype = U.clamp((visualPull * .42 + fanPull + repPull + promo.q + (mkt - 1) * 2.2 + g.momentum * .18)
      * (.85 + trend / 320) * fresh * fatigue * buzz * mods.hype, 0, 100);

    // First-ever release: nerves show on stage. Applied here, not at release time,
    // so the preview cannot promise a number the release then quietly undercuts.
    let debutMul = 1;
    if (g.releases.length === 0) members.forEach(m => { debutMul *= traitMul(m, 'debutPenalty'); });

    const points = U.clamp((quality * .58 + hype * .42) * debutMul, 3, 99);
    // The season is carried out with the preview so the planner never has to go
    // looking for it: what the release is walking into is part of the estimate.
    // So are the fandom modifiers, for the same reason — the first-week album
    // number quoted below is the one E.releaseComeback will bank.
    const units = Math.round((g.fans * (.10 + hype / 700) + hype * 150) * mods.sales);
    return {
      quality, hype, points, cost: E.planCost(sel), promo, trend, fatigue, gap, debutMul,
      mods, units, chem, season: KP.seasonOfAbs(abs)
    };
  };

  E.releaseComeback = function (st, g, sel, conceptKey, title) {
    // The planner's locked rows are one render stale and every dataset payload
    // is just a string — the tier gates have to hold where they are
    // authoritative, and they read standing, not raw reputation.
    const gated = Object.keys(KP.tiers)
      .map(k => KP.tiers[k].find(x => x.k === sel[k]))
      .find(t => t && t.rep && KP.standing(st) < t.rep);
    if (gated) return { ok: false, msg: gated.name + ' will not take the call below standing ' + gated.rep + '.' };

    const pv = E.planPreview(st, g, sel, conceptKey);
    const upfront = pv.cost + KP.tiers.promo.find(x => x.k === sel.promo).cost;
    if (st.company.money < upfront) return { ok: false, msg: 'Not enough cash for this plan.' };

    // Production plus the first promo week are paid now; weeklyBurn covers the rest.
    // The final promo week clears g.active before step 5 bills, so without this
    // prepayment the player would only ever be charged for promoWeeks − 1 weeks.
    st.company.money -= pv.cost + pv.promo.cost;
    g.concept = conceptKey;
    g.lastConcept = conceptKey;

    const rel = {
      title,
      concept: conceptKey,
      quality: pv.quality,
      hype: pv.hype,
      basePoints: pv.points * U.rnd(.92, 1.1),
      points: 0,
      week: 0,
      promoWeeks: pv.promo.weeks,
      promoCost: pv.promo.cost,
      promoBoost: pv.promo.q / 100,
      peak: 99,
      wins: 0,
      sales: 0,
      revenue: 0,
      fansGained: 0,
      // Stamped now, not when promotions wrap. `y`/`w` on the archived record
      // mean the WRAP week and always did; these mean the week it came out, and
      // a week-50 release must not file itself under the following year.
      releasedY: st.year,
      releasedW: st.week,
      releasedAbs: KP.absWeek(st),
      pointWeeks: 0,
      weeksTop10: 0,
      weeksTop3: 0,
      sel: Object.assign({}, sel)
    };
    rel.points = rel.basePoints;
    g.active = rel;
    g.lastReleaseAbs = KP.absWeek(st);
    bumpStat(st, 'releases');

    // Physical sales land in release week — the fandom pre-ordered weeks ago, and
    // a loyal domestic fandom pre-ordered four copies each. The preview's own
    // `units` carries the modifiers so the planner's number is this number.
    const units = Math.round(pv.units * U.rnd(.88, 1.14));
    const rev = units * KP.income.albumUnit;
    rel.sales = units;
    rel.revenue += rev;              // the discography records gross, always
    E.earn(st, rev, 'album');
    const yba = E.ybAct(st, g);      // Album of the Year is decided here
    yba.sales += units;
    yba.revenue += rev;
    E.record(st, 'sales', units, g.name, title);

    KP.log('“' + title + '” is out. First-week albums: ' + U.num(units) + ' copies.', 'big');
    pushRecap(st, '💿', g.name + ' released “' + title + '” · ' + U.num(units) + ' albums', 'big');
    return { ok: true };
  };

  function promoWeek(st, g, chart) {
    const rel = g.active;
    rel.week++;

    const row = chart.find(r => r.mine && r.groupId === g.id);
    const rank = row ? row.rank : 99;
    rel.peak = Math.min(rel.peak, rank);
    // A peak is one week; how long a song held is a different song. All three
    // survive into the discography, which used to keep only the peak.
    rel.pointWeeks += rel.points;
    if (rank <= 10) rel.weeksTop10++;
    if (rank <= 3) rel.weeksTop3++;
    // The week's score, before the decay below spends it. A record is a thing
    // that happened, so it is stamped where it happened rather than read back
    // off an archive that only keeps the peak.
    E.record(st, 'points', rel.points, g.name, rel.title);

    // Revenue and fans both key off chart points, not rank alone. The season's
    // audience rides on top of streaming only: the field decides where a song
    // ranks, the audience decides what that rank is worth. A lull pays 86% of an
    // award-season week for the identical chart position.
    // An international fandom streams; a platform deal is bought to multiply
    // exactly this line and nothing else, which is why a deal signed with nothing
    // out is a weekly bill on its own.
    const mods = KP.fanMods(g);
    const streamRev = Math.pow(rel.points, 1.6) * KP.income.streamPerPoint * KP.seasonNow(st).audience
      * mods.stream * KP.streamMul(st);
    E.earn(st, streamRev, 'stream');
    creditDeals(st, streamRev);
    rel.revenue += streamRev;
    E.ybAct(st, g).revenue += streamRev;

    let fanMul = 1;
    KP.memberOf(st, g).forEach(m => { fanMul *= traitMul(m, 'fans'); });
    const gained = gainFans(g,
      Math.pow(rel.points, 1.5) * 70 * (1 + st.company.rep / 400) * fanMul * mods.acq * U.rnd(.85, 1.15));
    rel.fansGained += gained;
    E.ybAct(st, g).fans += gained;

    // A sub-unit promoting is the parent act on television under another name,
    // and some of what it picks up follows the whole group home. This is the
    // half that makes a unit worth forming rather than a second set of costs —
    // and it goes through gainFans like every other new-fan number, so the
    // feedback is damped by the parent's own size and never compounds.
    if (KP.isUnit(g)) {
      const parent = KP.parentOf(st, g);
      if (parent) gainFans(parent, gained * KP.units.feedback);
    }

    if (rank === 1) {
      rel.wins++;
      bumpStat(st, 'wins');
      st.company.rep = U.clamp(st.company.rep + 2.5, 0, 100);
      g.momentum = U.clamp(g.momentum + 9, 0, 100);
      KP.log('🏆 ' + g.name + ' takes #1 with “' + rel.title + '”.', 'big');
      pushRecap(st, '🏆', g.name + ' won #1 on the weekly chart', 'big');
    } else if (rank <= 10) {
      st.company.rep = U.clamp(st.company.rep + .7, 0, 100);
      g.momentum = U.clamp(g.momentum + 3, 0, 100);
    }

    // Decay, softened while the song is still winning.
    const decay = rank === 1 ? .93 : rank <= 5 ? .89 : rank <= 20 ? .855 : .8;
    rel.points = rel.points * decay * (1 + rel.promoBoost * .12) * U.rnd(.97, 1.04);

    if (rel.week >= rel.promoWeeks) {
      g.releases.unshift({
        title: rel.title, concept: rel.concept, peak: rel.peak, wins: rel.wins,
        sales: rel.sales, revenue: rel.revenue, fans: rel.fansGained,
        quality: rel.quality, hype: rel.hype,
        pointWeeks: rel.pointWeeks, weeksTop10: rel.weeksTop10, weeksTop3: rel.weeksTop3,
        // Two calendars on one record, deliberately: y/w is the week promotions
        // wrapped, releasedY/W is the week the song came out. Neither is the
        // other and tidying one into the other would misfile a year of history.
        releasedY: rel.releasedY, releasedW: rel.releasedW,
        y: st.year, w: st.week
      });
      if (rel.peak === 1) bumpStat(st, 'no1');
      E.record(st, 'reign', rel.wins, g.name, rel.title);
      g.momentum = U.clamp(g.momentum + (rel.peak <= 3 ? 18 : rel.peak <= 10 ? 8 : -6), 0, 100);
      // A run the fandom is proud of is a fandom that stays. Nothing here for a
      // quiet run: the dilution the promotion weeks already paid is the cost of
      // having grown at all.
      if (rel.peak <= 3) bumpLoyal(g, KP.fandom.loyalHit);
      // A run they can be proud of, or one they cannot. The only bond move in
      // the game that is decided by the chart rather than by a diary.
      bumpCast(st, g, KP.memberOf(st, g), rel.peak <= 3 ? KP.bonds.hit
        : rel.peak > 30 ? KP.bonds.flop : 0);
      if (KP.isUnit(g) && rel.peak <= 3) {
        const parent = KP.parentOf(st, g);
        if (parent) bumpLoyal(parent, KP.fandom.loyalHit * KP.units.loyalBack);
      }
      const verdict = rel.peak === 1 ? 'a #1 hit' : rel.peak <= 10 ? 'a top-10 run' : 'a quiet run';
      KP.log('Promotions for “' + rel.title + '” wrapped — ' + verdict +
        ' (peak #' + rel.peak + ', ' + U.num(rel.fansGained) + ' new fans).', rel.peak <= 10 ? 'good' : 'info');
      pushRecap(st, '🎬', g.name + ' finished promotions · peak #' + rel.peak, rel.peak <= 10 ? 'good' : '');
      g.active = null;
    }
  }

  /* ============================== the schedule =============================
     Bookings are paid commitments: the fee leaves the balance at the moment the
     booking is made, so KP.weeklyBurn never sees one and the runway number does
     not quietly change when a diary fills up. What a booking costs afterwards is
     stamina, and stamina is the thing the player actually runs out of.
     ======================================================================== */

  function presentMembers(st, g) {
    return KP.memberOf(st, g).filter(m => m.status === 'ok');
  }

  /* A flat, un-modified drain — a recording day does not care how tough anyone
     is — and then the bill for booking somebody who had nothing left to give. */
  function payStamina(st, cast, cost) {
    const B = KP.bookings;
    cast.forEach(m => {
      m.stamina = U.clamp(m.stamina - cost, 0, 100);
      if (m.stamina < B.injuryFloor && U.chance(B.injuryRoll * traitMul(m, 'injury'))) {
        m.status = 'injured';
        m.statusWeeks = U.irnd(2, 4);
        KP.log(m.name + ' came off the schedule injured — out for ' + m.statusWeeks + ' weeks.', 'bad');
        pushRecap(st, '🚑', m.name + ' is injured (' + m.statusWeeks + 'w)', 'bad');
      }
    });
  }

  /* Who carries a variety appearance: the funniest person in the room, with the
     Variety Star trait doing exactly what its description promises. */
  E.varietyScore = (m) => m.stats.variety * traitMul(m, 'buzz');

  function castTalker(cast) {
    return cast.slice().sort((a, b) => E.varietyScore(b) - E.varietyScore(a))[0] || null;
  }

  /* How well a variety booking is going to go, in one expression, because the
     modal quotes it and the week grades it. The funniest person in the room
     carries it — and the room carries them: a line-up that actually gets on is
     funnier on a panel show than the same six people who are not speaking.
     Chemistry lands here rather than on the fan numbers because this is the one
     booking that is GRADED, and a grade is a reception. */
  function varietyEdge(st, g, cast, show) {
    const t = castTalker(cast);
    const score = t ? E.varietyScore(t) * KP.chemEdge(st, g) : 0;
    return { talker: t, score, edge: (score - show.need) / KP.bookings.needScale };
  }
  E.varietyEdge = varietyEdge;

  E.grade = function (edge) {
    const B = KP.bookings;
    const v = edge + U.rnd(-B.gradeSpread, B.gradeSpread);
    return B.grades[v >= B.viralAt ? 'viral' : v < B.flatAt ? 'flat' : 'good'];
  };

  /* The only place live attendance maths lives. resolveLive() calls this and
     applies one roll to `expected` — so the preview's range is honest and the
     resolution can never fall outside it.

     Everything in the stack is something the player can move before show night,
     which is what makes a venue a decision rather than an unlock: an active
     comeback, the group's momentum, the agency's standing, how long it has been
     since anybody heard from them, and the week of the year. Pure. */
  E.livePreview = function (st, g, venueKey, absWeek, kind) {
    kind = kind || 'live';
    const v = KP.showSpec(kind, venueKey);
    if (!v) return null;
    const L = KP.live;
    const B = KP.bookings;
    const cast = presentMembers(st, g);
    const season = KP.seasonOfAbs(absWeek);
    // Every other term in the stack is evaluated at `absWeek`, and so is this
    // one: a title track promoting today is not promoting in eight weeks, and a
    // preview that reads g.active present-tense quotes a ×1.10 house the night
    // cannot deliver. Same horizon E.bookBlock uses to refuse a music show.
    const promoLeft = g.active ? g.active.promoWeeks - g.active.week : 0;
    const promo = g.active && absWeek <= KP.absWeek(st) + promoLeft ? L.promoBoost : 1;
    const heat = 1 + g.momentum / L.heatDiv;
    const stand = 1 + KP.standing(st) / L.standDiv;
    const gapW = g.lastReleaseAbs == null ? 99 : absWeek - g.lastReleaseAbs;
    const stale = gapW <= L.staleFrom ? 1
      : Math.max(L.staleFloor, 1 - (gapW - L.staleFrom) * L.staleStep);

    // A tour sells to the international half of the fandom and a home show sells
    // to the whole of it. That is the entire difference between the two kinds,
    // and it is why the split is a strategy: a group with 400,000 fans and 12%
    // abroad cannot fill a world tour that a group half its size at 40% can.
    const split = KP.fandomSplit(g);
    const crowd = kind === 'tour' ? split.intl : g.fans;
    // Loyalty is who actually buys the ticket, on either side of that.
    const loyal = KP.fanMods(g).pull;

    const expected = crowd * v.pull * loyal * promo * heat * stand * stale * season.audience;
    const legs = kind === 'tour' ? (v.legs || 1) : 1;
    const lo = Math.min(v.cap, Math.round(expected * L.rollLo));
    const hi = Math.min(v.cap, Math.round(expected * L.rollHi));
    const breakEven = Math.ceil(v.cost / v.ticket);
    return {
      v, show: v, kind, cast, season, expected, cap: v.cap, lo, hi, legs, crowd,
      grossLo: lo * v.ticket, grossHi: hi * v.ticket,
      // A tour is quoted per night AND as the whole commitment, because the whole
      // commitment is what leaves the balance the moment it is booked.
      cost: v.cost, totalCost: v.cost * legs, breakEven,
      fillLo: lo / v.cap, fillHi: hi / v.cap,
      safe: lo >= breakEven, doomed: hi < breakEven,
      exposed: cast.filter(m => m.stamina - v.stamina * legs < B.injuryFloor).length,
      mods: { promo, heat, stand, stale, audience: season.audience, loyal }
    };
  };

  /* Everything the booking modal is allowed to promise, and the only place the
     appearance maths is written down — resolveMusic/resolveVariety compute the
     same expression through the same damper, so the estimate cannot overshoot
     what the week then delivers. Pure. A live show is priced by seats rather
     than by reception, so it keeps its own preview and this is the seam that
     hands it over.

     The fan numbers go through fanGain() for the same reason the resolvers do:
     an appearance pays a PERCENTAGE of the fandom, and the damper on that
     percentage is worth 1 + fans/fanSaturation — nothing at zero fans and ×3.5
     at three million. Quoting the raw figure would not be optimism, it would be
     a number that gets less true the better the player is doing. */
  E.bookPreview = function (st, g, kind, showKey, absWeek) {
    if (KP.isGig(kind)) return E.livePreview(st, g, showKey, absWeek, kind);
    const show = KP.show(kind, showKey);
    if (!show) return null;
    const B = KP.bookings;
    const cast = presentMembers(st, g);
    // Sentiment is inside the quote for the same reason the damper is: an
    // appearance converts strangers at the rate the public currently likes them,
    // and a modal that quotes the undamped, unmodified figure is a modal that
    // gets less true the worse the week has gone.
    const rawFans = (g.fans * show.fansPct + show.fansFlat) * KP.fanMods(g).acq;
    const fansBase = fanGain(g, rawFans);
    const pv = {
      show, kind, cast,
      season: KP.seasonOfAbs(absWeek),
      slots: KP.slotsOpen(st, kind, showKey, absWeek),
      fansBase, fansLo: fansBase, fansHi: fansBase,
      points: show.points || 0,
      // How many of the cast this appearance would leave inside injury range.
      exposed: cast.filter(m => m.stamina - show.stamina < B.injuryFloor).length
    };
    if (kind === 'variety') {
      const ve = varietyEdge(st, g, cast, show);
      pv.talker = ve.talker;
      pv.score = ve.score;
      pv.edge = ve.edge;
      // The reception roll is uniform, so the odds are a straight read of it.
      pv.pViral = U.clamp((pv.edge - B.viralAt + B.gradeSpread) / (B.gradeSpread * 2), 0, 1);
      pv.pFlat = U.clamp((B.flatAt - pv.edge + B.gradeSpread) / (B.gradeSpread * 2), 0, 1);
      // fanGain is linear in its argument, so grading the raw figure and then
      // damping it is exactly what resolveVariety does — to the won.
      pv.fansLo = fanGain(g, rawFans * B.grades.flat.fans);
      pv.fansHi = fanGain(g, rawFans * B.grades.viral.fans);
    }
    return pv;
  };

  /* Why a group cannot take this booking this week, or null if it can. Shared by
     E.book and the modal's lock list so the two can never disagree. */
  E.bookBlock = function (st, g, kind, showKey, absWeek) {
    const show = KP.showSpec(kind, showKey);
    if (!show) return 'No such booking.';
    const now = KP.absWeek(st);
    const legs = kind === 'tour' ? (show.legs || 1) : 1;
    if (absWeek <= now) return 'That week has already been played.';
    // A tour has to fit inside the board whole — the last leg is a commitment
    // too, and a leg booked past the horizon is a week the player cannot see.
    if (absWeek + legs - 1 - now > KP.bookings.weeksAhead) {
      return legs > 1
        ? 'All ' + legs + ' legs have to fit inside the next ' + KP.bookings.weeksAhead + ' weeks.'
        : 'Nothing books more than ' + KP.bookings.weeksAhead + ' weeks out.';
    }
    // Injuries heal — a group with nobody in it at all does not.
    if (!KP.memberOf(st, g).length) return 'There is nobody left in that group.';
    if (KP.standing(st) < show.rep) return 'Needs standing ' + show.rep + '.';
    if (g.fans < show.fans) return 'Needs ' + U.num(show.fans) + ' fans.';
    if (kind === 'tour' && KP.intlOf(g) < show.intl) {
      return 'Needs ' + Math.round(show.intl * 100) + '% of the fandom overseas · ' +
        g.name + ' is at ' + Math.round(KP.intlOf(g) * 100) + '%.';
    }
    if (KP.bookingsFor(st, g.id, absWeek).some(b => b.kind === kind)) {
      return g.name + ' already has a ' + kind + ' schedule that week.';
    }
    if (kind === 'music') {
      if (!g.active) return 'Music shows only book a group that is promoting a title track.';
      const last = now + (g.active.promoWeeks - g.active.week);
      if (absWeek > last) {
        const left = Math.max(0, last - now);
        return 'Promotions end in ' + left + ' week' + (left === 1 ? '' : 's') + ' — there is no title track to stage by then.';
      }
    } else if (KP.isGig(kind)) {
      const L = KP.live;
      // Three rules, and they measure different things: `gap` is how often a
      // group can be put on a stage of its own at all, `cooldown` is how quickly
      // the same tier can be sold to the same fandom twice, and the span check is
      // the tour's own — consecutive legs are exempt from the gap among
      // themselves because they are one commitment, not five.
      const played = Object.keys(g.liveAbs || {}).reduce((mx, k) => Math.max(mx, g.liveAbs[k]), 0);
      if (played && absWeek - played < L.gap) {
        return 'Needs ' + L.gap + ' weeks between shows.';
      }
      const hi = absWeek + legs - 1;
      const clash = KP.bookingsFor(st, g.id, null).find(b => KP.isGig(b.kind)
        && b.absWeek + L.gap > absWeek && b.absWeek - L.gap < hi);
      if (clash) return 'Too close to another booked show.';
      const last = (g.liveAbs || {})[showKey];
      if (last != null && absWeek - last < show.cooldown) {
        const rest = show.cooldown - (absWeek - last);
        return rest + ' week' + (rest === 1 ? '' : 's') + ' of rest before another ' + show.name + '.';
      }
    }
    // Venues have no bill to share: a hall you have paid for is yours.
    if (!KP.isGig(kind) && KP.slotsOpen(st, kind, showKey, absWeek) <= 0) {
      const season = KP.seasonOfAbs(absWeek);
      return show.seasons && show.seasons.indexOf(season.k) < 0
        ? show.name + ' does not run in ' + season.name + '.'
        : 'No slot left on ' + show.name + ' that week.';
    }
    return null;
  };

  E.book = function (st, groupId, kind, showKey, absWeek) {
    const g = st.groups.find(x => x.id === groupId);
    if (!g) return { ok: false, msg: 'That group is gone.' };
    const show = KP.showSpec(kind, showKey);
    if (!show) return { ok: false, msg: 'No such booking.' };
    const abs = Math.round(absWeek);          // data-abs arrives as a string
    const blocked = E.bookBlock(st, g, kind, showKey, abs);
    if (blocked) return { ok: false, msg: blocked };

    // A live show has no appearance fee — what it has is a production budget,
    // and it is prepaid on exactly the same terms. A tour is the same rule
    // multiplied by its legs: the whole thing is paid the moment it is booked,
    // because the whole thing is what has been committed to.
    const live = KP.isGig(kind);
    const legs = kind === 'tour' ? (show.legs || 1) : 1;
    const fee = live ? show.cost : show.fee;
    const upfront = fee * legs;
    if (st.company.money < upfront) {
      return {
        ok: false,
        msg: (live ? 'Production costs ' : 'Appearance fees cost ') + U.money(upfront) +
          (legs > 1 ? ' for all ' + legs + ' legs.' : '.')
      };
    }
    st.company.money -= upfront;
    // One record per leg, sharing a tour id: the board shows the weeks it really
    // eats, step 3b resolves them one at a time, and cancelling pulls the whole
    // run rather than leaving a group stranded in the middle of a tour.
    const tourId = legs > 1 ? U.uid('tr') : null;
    const made = [];
    for (let i = 0; i < legs; i++) {
      const b = {
        id: U.uid('bk'), kind, show: showKey, groupId, absWeek: abs + i, fee
      };
      if (tourId) { b.tourId = tourId; b.leg = i + 1; b.legs = legs; }
      st.bookings.push(b);
      made.push(b);
    }
    KP.log(g.name + (live ? ' will play ' : ' is booked on ') + show.name +
      (legs > 1 ? ' — ' + legs + ' legs from ' : ' in week ') + weekLabel(st, abs) +
      ' · ' + U.money(upfront) + '.', 'info');
    return { ok: true, booking: made[0], bookings: made };
  };

  /* Y/W for an absolute week, for a log line the player can find on the board. */
  function weekLabel(st, abs) {
    const n = KP.WEEKS_PER_YEAR;
    return 'Y' + (Math.floor((abs - 1) / n) + 1) + ' W' + (((abs - 1) % n) + 1);
  }
  E.weekLabel = weekLabel;

  E.cancelBooking = function (st, id) {
    const i = (st.bookings || []).findIndex(b => b.id === id);
    if (i < 0) return { ok: false, msg: 'Nothing booked there.' };
    const b = st.bookings[i];
    const B = KP.bookings;
    const spec = KP.bookingSpec(b);
    const now = KP.absWeek(st);
    // A tour is one commitment, so it cancels as one: pulling out of the Tokyo
    // date does not leave a group booked into Jakarta three weeks later.
    const pulled = b.tourId
      ? st.bookings.filter(x => x.tourId === b.tourId)
      : [b];
    // Inside the notice window the slot has already been printed in a schedule
    // somebody else is holding: no refund, and the broadcaster remembers. Judged
    // per leg, so cancelling a tour early still recovers the legs that were far
    // enough out.
    let back = 0, late = false;
    pulled.forEach(x => {
      if (x.absWeek - now <= B.lateWeeks) late = true;
      else back += Math.round(x.fee * B.cancelBack);
    });
    st.bookings = st.bookings.filter(x => pulled.indexOf(x) < 0);
    st.company.money += back;
    if (late) st.company.rep = U.clamp(st.company.rep - B.cancelRep, 0, 100);
    KP.log(late
      ? 'Pulled out of ' + spec.name + ' at short notice — ' +
        (back > 0 ? 'only ' + U.money(back) + ' came back, ' : 'the fee is gone ') + 'and so is some goodwill.'
      : 'Cancelled ' + spec.name + ' · ' + U.money(back) + ' of the fee recovered.', late ? 'bad' : 'info');
    return { ok: true, back, late, legs: pulled.length };
  };

  function bookingMissed(st, g, spec) {
    st.company.rep = U.clamp(st.company.rep - KP.bookings.missRep, 0, 100);
    g.momentum = U.clamp(g.momentum - 5, 0, 100);
    KP.log(g.name + ' missed ' + spec.name + ' — nobody was fit to appear.', 'bad');
    pushRecap(st, '🚫', spec.name + ' missed · ' + g.name + ' sent nobody', 'bad');
  }

  function resolveMusic(st, g, b) {
    const show = KP.show('music', b.show);
    const cast = presentMembers(st, g);
    if (!cast.length) return bookingMissed(st, g, show);

    // Before the chart is built, on purpose: a stage this week is worth a rank
    // this week or it is worth nothing the player can see.
    if (g.active) g.active.points = U.clamp(g.active.points + show.points, 0, 99);
    const gained = gainFans(g, (g.fans * show.fansPct + show.fansFlat) * KP.fanMods(g).acq);
    st.company.rep = U.clamp(st.company.rep + show.repGain, 0, 100);
    g.momentum = U.clamp(g.momentum + show.momentum, 0, 100);
    bumpLoyal(g, KP.fandom.loyalStage);
    cast.forEach(m => { m.morale = U.clamp(m.morale + show.morale, 0, 100); });
    // Whoever was actually in the room. A booking is where bonds are built, and
    // it is per-cast rather than per-group so a member on hiatus does not come
    // back closer to people they never saw.
    bumpCast(st, g, cast, KP.bonds.together);
    payStamina(st, cast, show.stamina);
    g.stagesY++;
    bumpStat(st, 'stages');
    // Best Performance is decided by the diary, and this is where it is written.
    const yba = E.ybAct(st, g);
    yba.stages++;
    yba.fans += gained;

    const text = g.name + ' performed on ' + show.name + ' · +' + show.points.toFixed(1) +
      ' chart points · +' + U.num(gained) + ' fans';
    KP.log(text + '.', 'good');
    pushRecap(st, '🎵', text, 'good');
  }

  function resolveVariety(st, g, b) {
    const show = KP.show('variety', b.show);
    const cast = presentMembers(st, g);
    if (!cast.length) return bookingMissed(st, g, show);

    const ve = varietyEdge(st, g, cast, show);
    const talker = ve.talker;
    const grade = E.grade(ve.edge);
    const gained = gainFans(g, (g.fans * show.fansPct + show.fansFlat) * grade.fans * KP.fanMods(g).acq);
    st.company.rep = U.clamp(st.company.rep + show.repGain * grade.rep, 0, 100);
    g.momentum = U.clamp(g.momentum + show.momentum * grade.momentum, 0, 100);
    // Being liked in a living room is the cheapest loyalty in the game — and a
    // room that did not laugh takes some of it back out.
    bumpLoyal(g, KP.fandom.loyalVariety * (grade.k === 'flat' ? -.8 : grade.k === 'viral' ? 1.5 : 1));
    bumpSenti(g, grade.k === 'flat' ? -1 : grade.k === 'viral' ? 2.5 : 1);
    // A booking is also a lesson: the whole cast picks up variety, which is the
    // only way a group of stiff dancers ever gets to be funny.
    cast.forEach(m => {
      m.stats.variety = Math.min(m.potential.variety, m.stats.variety + U.rnd(show.train * .45, show.train));
      m.morale = U.clamp(m.morale + (grade.k === 'flat' ? KP.bookings.flatMorale : show.morale), 0, 100);
    });
    // A room that laughed is worth more than one that did not, both ways.
    bumpCast(st, g, cast, KP.bonds.together * (grade.k === 'flat' ? -1 : grade.k === 'viral' ? 2 : 1));
    payStamina(st, cast, show.stamina);
    g.varietyY++;
    bumpStat(st, 'varietyShows');
    // Entertainer of the Year reads both halves of this: how often you went out,
    // and how funny the person you sent actually was.
    const yba = E.ybAct(st, g);
    yba.variety++;
    yba.fans += gained;
    yba.bestVariety = Math.max(yba.bestVariety, talker.stats.variety);

    const text = talker.name + ' on ' + show.name + ' ' + grade.label + ' · +' + U.num(gained) + ' fans';
    KP.log(g.name + ' guested on ' + show.name + ' — ' + talker.name + ' carried it and it ' +
      grade.label + ' (+' + U.num(gained) + ' fans).', grade.k === 'flat' ? 'bad' : grade.k === 'viral' ? 'big' : 'good');
    pushRecap(st, grade.ic, text, grade.k === 'flat' ? 'bad' : grade.k === 'viral' ? 'big' : 'good');
  }

  /* Show night. The gate is the first income line in the game the player picked
     the size of, and the only one that can come in under what it cost. */
  function resolveLive(st, g, b) {
    const L = KP.live;
    const tour = b.kind === 'tour';
    const v = KP.showSpec(b.kind, b.show);
    const leg = tour ? ' · leg ' + b.leg + '/' + b.legs : '';
    const cast = presentMembers(st, g);
    if (!cast.length) {
      // A pulled show refunds tickets and costs far more than a missed taping:
      // the production money is gone and the apology is public.
      st.company.rep = U.clamp(st.company.rep - KP.bookings.missRep * L.pullRepMul, 0, 100);
      g.momentum = U.clamp(g.momentum + L.pullMomentum, 0, 100);
      KP.log(g.name + '\'s ' + v.name + ' was cancelled — nobody was fit to perform.', 'bad');
      pushRecap(st, '🚫', v.name + ' cancelled · refunds and apologies', 'bad');
      return;
    }

    // One roll, on the preview's own expectation, so the range the modal quoted
    // is the range the night can land in and nothing is recomputed here.
    const pv = E.livePreview(st, g, b.show, b.absWeek, b.kind);
    const sold = Math.min(v.cap, Math.max(0, Math.round(pv.expected * U.rnd(L.rollLo, L.rollHi))));
    const gross = sold * v.ticket;
    const fill = sold / v.cap;
    const ratio = v.cost > 0 ? gross / v.cost : 2;

    // Graded against break-even rather than against a raw fill percentage, so a
    // full fan meeting and a full dome read the same way to the player.
    const grade = ratio >= L.gradeTriumph ? 'triumph' : ratio >= L.gradeStrong ? 'strong'
      : ratio >= L.gradeOk ? 'ok' : 'undersold';

    E.earn(st, gross, 'live');
    const gained = creditFans(g, Math.round(sold * L.newFanRate[grade]));
    g.liveAbs = g.liveAbs || {};
    g.liveAbs[v.k] = b.absWeek;
    g.livesY++;
    g.ticketsY += sold;
    bumpStat(st, 'lives');
    bumpStat(st, 'tickets', sold);
    E.record(st, 'crowd', sold, g.name, v.name);
    E.record(st, 'gate', gross, g.name, v.name);
    const yba = E.ybAct(st, g);
    yba.tickets += sold;
    yba.fans += gained;

    st.company.rep = U.clamp(st.company.rep + v.repGain * L.repMul[grade], 0, 100);
    g.momentum = U.clamp(g.momentum + L.momentum[grade], 0, 100);
    // A room that came is a room that stays — and one that did not come was
    // photographed. Both are worth more to the fandom than to the books.
    bumpLoyal(g, grade === 'undersold' ? -(v.loyal || 0) : (v.loyal || 0) *
      (grade === 'triumph' ? 1.5 : grade === 'strong' ? 1 : .5));
    if (tour) {
      // A tour builds an audience where it plays, and it keeps it: the legs are
      // counted for life, which is what raises the international target for good.
      g.tourLegs = (g.tourLegs || 0) + 1;
      g.toursY = (g.toursY || 0) + 1;
      bumpStat(st, 'tourLegs');
    }
    cast.forEach(m => {
      m.morale = U.clamp(m.morale + (grade === 'undersold' ? L.undersoldMorale : v.morale), 0, 100);
    });
    // A night nobody came to is a long bus back. A sold-out one is not.
    bumpCast(st, g, cast, KP.bonds.together * (grade === 'undersold' ? -1 : grade === 'triumph' ? 2 : 1));
    payStamina(st, cast, v.stamina);

    const soldOut = fill >= L.soldOutAt;
    const text = g.name + ' played ' + v.name + leg + ' · ' + U.num(sold) + '/' + U.num(v.cap) +
      ' seats · ' + U.money(gross) + (soldOut ? ' · SOLD OUT' : '');
    KP.log(text + (grade === 'undersold' ? ' — the empty seats were photographed.' : '.'),
      grade === 'undersold' ? 'bad' : soldOut ? 'big' : 'good');
    pushRecap(st, grade === 'undersold' ? '🪑' : soldOut ? '🎇' : tour ? '🌏' : '🎫', text,
      grade === 'undersold' ? 'bad' : soldOut ? 'big' : 'good');
  }

  /* Step 3b. Everything whose week has come, then off the board. `<=` rather
     than `===` so a booking that somehow outlived its week is resolved once and
     never left behind to pile up. */
  E.resolveBookings = function (st) {
    const abs = KP.absWeek(st);
    const due = (st.bookings || []).filter(b => b.absWeek <= abs);
    if (!due.length) return;
    st.bookings = st.bookings.filter(b => b.absWeek > abs);
    due.forEach(b => {
      const g = st.groups.find(x => x.id === b.groupId);
      if (!g) return;                        // disbanded; the fee is not coming back
      if (b.kind === 'music') resolveMusic(st, g, b);
      else if (b.kind === 'variety') resolveVariety(st, g, b);
      else if (KP.isGig(b.kind)) resolveLive(st, g, b);
    });
  };

  /* Everything that is counted per calendar year rather than per run. Called at
     the rollover, and the only place these counters are cleared. `g.liveAbs` is
     deliberately not among them: a cooldown is measured in absolute weeks and
     does not care that the calendar turned over in the middle of it. Neither is
     `g.tourLegs`, which is a career total and the thing the international target
     is built out of — a fandom abroad does not reset in January.
     E.runAwards must have already read the yearbook by the time this runs. */
  E.rollYear = function (st) {
    st.groups.forEach(g => {
      g.stagesY = 0; g.varietyY = 0; g.livesY = 0; g.ticketsY = 0; g.toursY = 0;
    });
    // The agency's own per-year column, on exactly the same terms as the
    // per-group ones above. E.runReview must have already copied it.
    st.statsY = KP.blankStats();
    st.yearbook = { y: st.year, acts: {}, songs: {} };
  };

  /* ========================= the fandom as a system ========================
     Step 4c, and the only place loyalty, sentiment and the international split
     move on their own. It runs AFTER the week's fans have been counted (3b's
     bookings, 4's promotion) and BEFORE the money keyed to the fandom is
     credited — the merch line is inside this function for exactly that reason,
     so a scandal costs merch the same week it happens rather than the week
     after, and KP.ledger's projection of the same line reads the same
     derivation.
     ======================================================================== */

  /* What the international share is being pulled toward this week. A target
     rather than a bump, so nothing here can ratchet: stop touring and stop
     paying a platform, and the fandom drifts home again. */
  function intlTarget(st, g) {
    const F = KP.fandom;
    let t = Math.max(F.intlBase, KP.dealIntlPull(st));
    if (g.active && g.active.sel && g.active.sel.mv === 'overseas') t += F.intlMv;
    t += Math.min(F.intlPerLegCap, (g.tourLegs || 0) * F.intlPerLeg);
    return U.clamp(t, 0, F.intlCap);
  }

  E.intlTarget = intlTarget;

  E.fandomWeek = function (st) {
    const F = KP.fandom;
    const abs = KP.absWeek(st);
    st.groups.forEach(g => {
      // 1. loyalty settles toward its base, and a fandom nobody has released
      //    anything for settles faster. Going out is what holds it up, and every
      //    place that counts as going out has already bumped it this week.
      const quiet = g.lastReleaseAbs == null ? 99 : abs - g.lastReleaseAbs;
      bumpLoyal(g, (F.loyalBase - KP.loyalOf(g)) * F.loyalDrift
        - (!g.active && quiet > F.quietFrom ? F.quietLoyal : 0));

      // 2. sentiment recovers toward what the agency has earned. A scandal is a
      //    hole in this number and nothing else, which is why it heals — slowly,
      //    and faster for an agency with standing and a group with momentum.
      const base = U.clamp(F.sentiBase + g.momentum * F.sentiMomentum
        + KP.standing(st) * F.sentiStanding, 0, 100);
      bumpSenti(g, (base - KP.sentiOf(g)) * F.sentiDrift);

      // 3. the split follows the deals and the touring, in both directions.
      g.intl = U.clamp(KP.intlOf(g) + (intlTarget(st, g) - KP.intlOf(g)) * F.intlDrift, 0, F.intlCap);

      // 4. sasaeng and antifan pressure. Fame buys an audience outside the dorm;
      //    the dorm level is what buys it back, which is the second job that
      //    makes a Lv4 dormitory worth more than faster recovery.
      //    Main groups only: a sub-unit is the same people under a second name,
      //    and the crowd outside the dorm is not there twice. Running it over
      //    both would make forming a unit a standing morale tax on its members.
      const press = KP.isUnit(g) ? 0 : KP.pressure(st, g);
      if (press > F.pressFloor) {
        KP.memberOf(st, g).forEach(m => {
          m.morale = U.clamp(m.morale - press / F.pressDrag, 0, 100);
          if (U.chance(press / F.pressRoll)) {
            const hit = U.rnd(F.pressMorale[0], F.pressMorale[1]);
            m.morale = U.clamp(m.morale - hit, 0, 100);
            KP.log(m.name + ' was followed home again — the dorm called security.', 'bad');
            pushRecap(st, '👁', m.name + ' · sasaeng incident', 'bad');
          }
        });
      }

      // 5. and then the fandom pays. One derivation, shared with KP.ledger.
      E.earn(st, KP.merchWeek(g), 'merch');
    });
  };

  /* ============================== scandals =================================
     The one mechanic that asks the player a question and waits for an answer.
     A story is either true or it is not; that is rolled when it breaks, stored,
     and never shown. What the player gets is a read from the marketing lead,
     also rolled once, so a redraw cannot shop for a better opinion.
     ======================================================================== */

  E.openScandal = function (st, g, member, kindKey) {
    const S = KP.scandal;
    const spec = kindKey ? KP.scandals.find(x => x.k === kindKey) : U.pick(KP.scandals);
    if (!spec || !g || !member) return null;
    const truth = U.chance(spec.trueP);
    const sev = Math.round(U.rnd(spec.sev[0], spec.sev[1]) * (1 + KP.pressure(st, g) / 200));
    // The PR read: right this often, and rolled here rather than at render time.
    const conf = U.clamp(S.read.base + st.company.staff.marketing * S.read.marketing
      + KP.standing(st) / S.read.standing, .4, .95);
    st.scandal = {
      id: U.uid('sc'), k: spec.k, gid: g.id, mid: member.id, who: member.name,
      truth, sev, conf, read: U.chance(conf) ? truth : !truth,
      absWeek: KP.absWeek(st)
    };
    bumpStat(st, 'scandals');
    KP.log('⚠ ' + spec.name + ': a story about ' + member.name + ' (' + g.name +
      ') is running. The office needs an answer this week.', 'bad');
    pushRecap(st, spec.ic, spec.name + ' · ' + member.name, 'bad');
    return st.scandal;
  };

  /* What each response costs and is worth, with no roll in it — the modal quotes
     this and E.scandalRespond spends exactly it. The sentiment figure is a range
     only because the player does not know which half of the pair applies. */
  E.scandalOptions = function (st) {
    const s = st.scandal;
    if (!s) return [];
    const S = KP.scandal;
    return Object.keys(S.out).filter(k => k !== 'silence').map(k => {
      const o = S.out[k];
      const cost = k === 'statement' ? Math.round(S.statementCost * s.sev / 10) : 0;
      return {
        k, label: o.label, ic: o.ic, desc: o.desc, cost,
        sentiTrue: Math.round(o.senti[0] * s.sev),
        sentiFalse: Math.round(o.senti[1] * s.sev),
        loyal: o.loyal, rep: o.rep,
        blocked: cost > st.company.money ? 'Costs ' + U.money(cost) + '.' : null
      };
    });
  };

  /* One resolution path for all four answers, including the one the player never
     picks: `silence` is what E.nextWeek applies to a story that was still open
     when the week turned. */
  E.scandalRespond = function (st, choice) {
    const s = st.scandal;
    if (!s) return { ok: false, msg: 'Nothing to answer.' };
    const S = KP.scandal;
    const o = S.out[choice];
    if (!o) return { ok: false, msg: 'No such response.' };
    const g = st.groups.find(x => x.id === s.gid);
    if (!g) { st.scandal = null; return { ok: false, msg: 'That group is gone.' }; }
    // Only a priced answer can be refused for money. An agency in the red can
    // still deny a story, still take somebody off the schedule, and above all
    // still be answered FOR by step 0 — `cost > money` alone is true at cost
    // zero on a negative balance, which left a broke agency permanently unable
    // to resolve a scandal and the silence outcome unable to fire at all.
    const cost = choice === 'statement' ? Math.round(S.statementCost * s.sev / 10) : 0;
    if (cost > 0 && cost > st.company.money) {
      return { ok: false, msg: 'A statement costs ' + U.money(cost) + '.' };
    }

    st.company.money -= cost;
    const spec = KP.scandalSpec(s) || { name: 'The story', ic: '📰' };
    const swing = o.senti[s.truth ? 0 : 1] * s.sev;
    bumpSenti(g, swing);
    bumpLoyal(g, o.loyal);
    st.company.rep = U.clamp(st.company.rep + o.rep, 0, 100);
    g.momentum = U.clamp(g.momentum + S.momentum, 0, 100);
    // The fandom that leaves is the fandom that was never very loyal, so the
    // loss is taken off the size and the average survives it.
    const lost = Math.round(g.fans * (s.sev / S.fansDiv));
    g.fans = Math.max(0, g.fans - lost);
    const m = st.trainees.find(x => x.id === s.mid);
    if (m) m.morale = U.clamp(m.morale - U.rnd(S.moraleHit[0], S.moraleHit[1]), 0, 100);

    // Hiatus is the answer that costs the schedule rather than the balance: the
    // member is off every stage until they are back, which is the same shape an
    // injury has and reads completely differently in the feed.
    let weeks = 0;
    if (choice === 'hiatus' && m) {
      weeks = U.irnd(S.hiatusWeeks[0], S.hiatusWeeks[1]);
      m.status = 'hiatus';
      m.statusWeeks = weeks;
    }
    // A denial that was a lie does not cost more today. It costs more later,
    // which is the whole reason the option is free and tempting.
    if (choice === 'deny' && s.truth) {
      st.fallout = {
        gid: g.id, k: s.k, sev: s.sev, who: s.who,
        absWeek: KP.absWeek(st) + U.irnd(S.backfireIn[0], S.backfireIn[1])
      };
    }

    st.scandal = null;
    const line = choice === 'silence'
      ? g.name + ' said nothing about the ' + spec.name.toLowerCase() + '. The story ran all week.'
      : o.label + ' — ' + spec.name.toLowerCase() + ', ' + g.name + '.';
    KP.log(line + ' Sentiment ' + Math.round(swing) + ', ' + U.num(lost) + ' fans gone' +
      (weeks ? ', ' + s.who + ' off the schedule for ' + weeks + ' weeks' : '') + '.',
      swing < -10 ? 'bad' : 'info');
    pushRecap(st, o.ic, o.label + ' · ' + spec.name, swing < -10 ? 'bad' : '');
    return { ok: true, swing, lost, weeks, cost };
  };

  /* The bill for a denial that was a lie. Resolved inside the tick rather than
     on the night it was chosen, so the player watches it arrive. */
  function resolveFallout(st) {
    const f = st.fallout;
    if (!f || KP.absWeek(st) < f.absWeek) return;
    st.fallout = null;
    const g = st.groups.find(x => x.id === f.gid);
    if (!g) return;
    const B = KP.scandal.backfire;
    bumpSenti(g, B.senti * f.sev);
    bumpLoyal(g, B.loyal);
    st.company.rep = U.clamp(st.company.rep + B.rep, 0, 100);
    const lost = Math.round(g.fans * B.fansPct);
    g.fans = Math.max(0, g.fans - lost);
    KP.log('The denial has fallen apart — ' + f.who + '\'s story was true after all. ' +
      U.num(lost) + ' fans gone and the apology is public.', 'bad');
    pushRecap(st, '💣', 'Denial backfired · ' + f.who, 'bad');
  }

  /* ========================== streaming platforms ==========================
     The opposite risk shape to a tour: paid to you the week you sign, billed
     back every week of the term, and worth nothing at all unless something is
     charting. The weekly commitment is a KP.ledger line item like any other
     recurring cost, so the runway number never has to be corrected.
     ======================================================================== */

  E.dealBlock = function (st, key) {
    const spec = KP.platforms.find(p => p.k === key);
    if (!spec) return 'No such platform.';
    const deals = st.company.deals || [];
    if (deals.some(d => d.k === key)) return 'That deal is already running.';
    if (deals.length >= KP.deals.maxDeals) {
      return 'You are already signed to ' + KP.deals.maxDeals + ' platforms.';
    }
    if (KP.standing(st) < spec.rep) return spec.name + ' needs standing ' + spec.rep + '.';
    if (KP.totalFans(st) < spec.fans) {
      return spec.name + ' needs ' + U.num(spec.fans) + ' fans on the books.';
    }
    return null;
  };

  E.takeDeal = function (st, key) {
    const spec = KP.platforms.find(p => p.k === key);
    const blocked = E.dealBlock(st, key);
    if (blocked) return { ok: false, msg: blocked };
    const d = {
      id: U.uid('deal'), k: spec.k, weeks: spec.weeks, weeksLeft: spec.weeks,
      advance: spec.advance, paid: 0, earned: 0, tookAbs: KP.absWeek(st)
    };
    st.company.deals.push(d);
    // An advance is revenue against future streams, so an investor's share comes
    // out of it exactly as it comes out of the streams themselves.
    const net = E.earn(st, spec.advance, 'deal');
    KP.log(spec.name + ' signed · ' + U.money(net) + ' advance · ' + U.money(spec.weekly) +
      '/week for ' + spec.weeks + ' weeks · streaming ×' + spec.streamMul.toFixed(2) + '.', 'big');
    pushRecap(st, '🌐', spec.name + ' signed · ' + U.money(net), '');
    return { ok: true, net, deal: d };
  };

  /* How much of the week's streaming money the deals are responsible for, split
     between them by how much multiplier each one brought. Nothing is credited
     here — this only books who earned it, so the term can be judged when it
     ends. */
  function creditDeals(st, streamRev) {
    const deals = KP.activeDeals(st);
    if (!deals.length) return;
    const mul = KP.streamMul(st);
    if (!(mul > 1)) return;
    const extra = streamRev * (1 - 1 / mul);
    let denom = 0;
    deals.forEach(d => { const sp = KP.platformSpec(d); if (sp) denom += sp.streamMul - 1; });
    if (!(denom > 0)) return;
    deals.forEach(d => {
      const sp = KP.platformSpec(d);
      if (sp) d.earned += extra * (sp.streamMul - 1) / denom;
    });
  }

  /* Step 5c. The weekly fee is inside KP.ledger and has already been billed by
     step 5 — exactly the arrangement a loan instalment has — so this only counts
     the term down and judges the deal when it runs out. */
  E.serviceDeals = function (st) {
    const deals = st.company.deals || [];
    if (!deals.length) return;
    const done = [];
    deals.forEach(d => {
      const sp = KP.platformSpec(d);
      if (!sp) { done.push(d); return; }
      d.paid += sp.weekly;
      d.weeksLeft--;
      if (d.weeksLeft > 0) return;
      done.push(d);
      const won = d.earned >= d.paid;
      st.company.rep = U.clamp(st.company.rep +
        (won ? KP.deals.exitRep : -KP.deals.exitRepBad), 0, 100);
      KP.log(won
        ? sp.name + ' has run its term — ' + U.money(d.earned) + ' of streaming against ' +
          U.money(d.paid) + ' of fees. They want to re-sign.'
        : sp.name + ' has run its term — ' + U.money(d.earned) + ' of streaming against ' +
          U.money(d.paid) + ' of fees. Nobody is calling back.', won ? 'good' : 'bad');
      pushRecap(st, won ? '🌐' : '📉', sp.name + ' ended · ' + U.money(d.earned) + ' earned',
        won ? 'good' : 'bad');
    });
    if (done.length) st.company.deals = deals.filter(d => done.indexOf(d) < 0);
  };

  /* Ending one early. There is no buyout: a platform contract runs its term, and
     the only thing the player can do is not sign the next one. */
  E.dealsFull = (st) => (st.company.deals || []).length >= KP.deals.maxDeals;

  /* ====================== relationships and chemistry ======================
     One bond per pair, and this is the only place any of them move. Everything
     that writes one goes through bumpBond, which routes a sub-unit's write to
     the parent that actually owns the pair (KP.bondHost) and rounds on the way
     in — KP.save() stringifies the whole state every week, and a full-precision
     float per pair in every group is a real share of the file.
     ======================================================================== */

  function bumpBond(st, g, a, b, d) {
    if (a === b || !d) return;
    const host = KP.bondHost(st, g);
    host.bonds = host.bonds || {};
    const k = KP.bondKey(a, b);
    host.bonds[k] = Math.round(U.clamp(KP.bondOf(host, a, b) + d, 0, 100) * 10) / 10;
  }
  E.bumpBond = bumpBond;

  /* Every pair inside a cast, which is what "they were in the same room" means.
     A cast of one moves nothing, and that is correct: a solo variety booking is
     not a thing the group did together. */
  function bumpCast(st, g, cast, d) {
    for (let i = 0; i < cast.length; i++) {
      for (let j = i + 1; j < cast.length; j++) bumpBond(st, g, cast[i].id, cast[j].id, d);
    }
  }
  E.bumpCast = bumpCast;

  /* A line-up that debuted together starts somewhere; one that somebody joined
     later starts at `newcomer` against everybody already there. `only` limits
     the seeding to pairs touching one person, which is the join case. */
  function seedBonds(st, g, members, value, only) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j];
        if (only && a.id !== only && b.id !== only) continue;
        const host = KP.bondHost(st, g);
        host.bonds = host.bonds || {};
        host.bonds[KP.bondKey(a.id, b.id)] =
          Math.round(U.clamp(value(), 0, 100) * 10) / 10;
      }
    }
  }

  /* Step 2c. Bonds drift toward `base` with nothing happening, are built by
     being in the same place — a promotion cycle here, a booking's cast in the
     resolvers — and are spent by a schedule that left everybody empty. Then the
     room pays the people in it, which is the only thing chemistry does that the
     player does not have to go looking for. */
  E.bondWeek = function (st) {
    const B = KP.bonds;
    KP.mainGroups(st).forEach(g => {
      const members = KP.memberOf(st, g);
      const promoting = !!g.active;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const a = members[i], b = members[j];
          let d = (B.base - KP.bondOf(g, a.id, b.id)) * B.drift;
          if (promoting) d += B.promo;
          if (a.stamina < B.tiredBelow && b.stamina < B.tiredBelow) d += B.tired;
          bumpBond(st, g, a.id, b.id, d);
        }
      }
    });
    // A unit is the same people in a smaller room, and they come back closer.
    // Written against the parent's map, so it shows up on the group card that
    // the sub-unit was good for them.
    st.groups.forEach(g => {
      if (KP.isUnit(g) && g.active) bumpCast(st, g, KP.memberOf(st, g), KP.units.bondUnit);
    });
    // What the room is worth to the people in it. Small per week and signed both
    // ways: a group that gets on carries its own morale, and one that does not
    // grinds it down a fraction at a time until a renewal year arrives.
    KP.mainGroups(st).forEach(g => {
      const members = KP.memberOf(st, g);
      if (members.length < 2) return;
      const lift = U.clamp((KP.chemistry(st, g) - B.mid) * B.moralePer, -B.moraleCap, B.moraleCap);
      if (lift) members.forEach(m => { m.morale = U.clamp(m.morale + lift, 0, 100); });
    });
  };

  /* ========================== line-up changes ==============================
     Everything that removes a person from a group goes through E.leaveGroup and
     everything that removes a group goes through disbandGroup. Both used to be
     written inline inside the burnout event, which is why positions were never
     reassigned after a departure and a group could be left holding a Leader who
     had walked out eighteen months earlier.
     ======================================================================== */

  function disbandGroup(st, g, reason) {
    // A unit cannot outlive the act it was drawn out of.
    if (!KP.isUnit(g)) KP.unitsOf(st, g.id).forEach(u => disbandGroup(st, u, 'parent'));
    g.active = null;
    st.groups = st.groups.filter(x => x.id !== g.id);
    // Pulling their row out of the published chart leaves a hole in the
    // numbering and the Chart tab prints r.rank straight out, so everyone below
    // the withdrawn song moves up one.
    st.chart = (st.chart || []).filter(r => r.groupId !== g.id);
    st.chart.forEach((r, i) => { r.rank = i + 1; });
    // Their diary goes with them. The fees do not come back.
    st.bookings = (st.bookings || []).filter(b => b.groupId !== g.id);
    // ...and so does any story about them: a scandal pointing at a group that no
    // longer exists is a modal with nobody in it.
    if (st.scandal && st.scandal.gid === g.id) st.scandal = null;
    if (st.fallout && st.fallout.gid === g.id) st.fallout = null;
    // A unit's members were never on its payroll — they go back to being what
    // they already were, which is members of the parent.
    if (!KP.isUnit(g)) {
      st.trainees.forEach(t => { if (t.groupId === g.id) clearContract(t); });
    }
    return g.name;
  }
  E.disbandGroup = disbandGroup;

  /* Out of the line-up, still on the books. The term belongs to the PERSON,
     not to the act: whatever is left of it is held as `t.termAbs` while they sit
     in the trainee room and handed back by signTerm when they are next in a
     line-up. Clearing it instead is what used to make a graduation followed by
     a showcase a seven-year renewal for the price of the showcase. Called twice
     on one person (leaveGroup, then disbandGroup) it is a no-op the second time. */
  function clearContract(t) {
    if (typeof t.contractAbs === 'number') t.termAbs = t.contractAbs;
    t.groupId = null;
    t.position = null;
    delete t.debutAbs;
    delete t.contractAbs;
  }

  /* Into a line-up: E.debut and E.joinGroup both come through here, so a first
     debut and a re-debut can never disagree about what a contract is. A fresh
     term for somebody who has never had one; the rest of their own term for
     somebody who has — a new act is not a new contract, and a term that is
     already in its last year opens the renewal table the week they are back. */
  function signTerm(st, t) {
    t.debutAbs = KP.absWeek(st);
    t.contractAbs = typeof t.termAbs === 'number'
      ? t.termAbs
      : t.debutAbs + KP.contracts.termYears * KP.WEEKS_PER_YEAR;
    delete t.termAbs;
    // The cliff's warnings are equalities that fire on one exact week, and a
    // re-debut can land after both of them — so say it here, once, on the way in.
    const left = t.contractAbs - t.debutAbs;
    if (left <= KP.contracts.windowWeeks) {
      KP.log(t.name + ' is back in a line-up with ' + left + ' week' + (left === 1 ? '' : 's') +
        ' left on their contract — the renewal table is open.', 'bad');
    }
  }

  /* One person out of one line-up, whatever put them there: a contract that ran
     out, a graduation the player decided on, or somebody who stopped believing.
     Returns { ok, disbanded } — the caller decides what happens to the person
     afterwards, because a graduate goes back to the trainee room and an expired
     contract walks out of the building. */
  E.leaveGroup = function (st, t, reason) {
    const g = t.groupId ? st.groups.find(x => x.id === t.groupId) : null;
    if (!g) return { ok: false, msg: 'They are not in a group.' };
    const B = KP.bonds, C = KP.contracts;

    // A sub-unit shrinks if it can still field a line-up and folds if it cannot.
    KP.unitsOf(st, g.id).forEach(u => {
      if (u.memberIds.indexOf(t.id) < 0) return;
      const spec = KP.unitSpec(u);
      const left = u.memberIds.filter(id => id !== t.id);
      if (spec && left.length >= spec.min) {
        u.memberIds = left;
        KP.log(u.name + ' continues as ' + left.length + '.', 'info');
      } else {
        disbandGroup(st, u, 'member');
        KP.log(u.name + ' is over — ' + t.name + ' was half of it.', 'bad');
      }
    });

    // How close they were to the room decides how hard the room takes it.
    const rest = KP.memberOf(st, g).filter(m => m.id !== t.id);
    const close = rest.length
      ? rest.reduce((s, m) => s + KP.bondOf(g, t.id, m.id), 0) / rest.length
      : B.base;

    g.memberIds = g.memberIds.filter(id => id !== t.id);
    // Their pairs go with them; a bond map that keeps a departed member is a
    // chemistry reading averaging in somebody who is not in the building.
    Object.keys(g.bonds || {}).forEach(k => {
      if (k.split('|').indexOf(t.id) >= 0) delete g.bonds[k];
    });
    clearContract(t);

    if (!g.memberIds.length) {
      const name = disbandGroup(st, g, reason);
      KP.log(name + ' has disbanded — nobody is left in the group.', 'bad');
      pushRecap(st, '💔', name + ' disbanded', 'bad');
      bumpStat(st, 'departures');
      return { ok: true, disbanded: name };
    }

    // The three things a departure costs, and they are all about the people who
    // stayed: a room that has just watched somebody go, a public that has an
    // opinion about it, and the fans who were there for that member.
    const mul = close > B.leaveClose ? 2 : 1;
    rest.forEach((a, i) => rest.slice(i + 1).forEach(b => bumpBond(st, g, a.id, b.id, B.leaveBond * mul)));
    E.assignPositions(st, KP.memberOf(st, g));
    const lost = Math.round(g.fans * C.leaveFansPct * mul);
    g.fans = Math.max(0, g.fans - lost);
    bumpSenti(g, C.leaveSenti);
    st.company.rep = U.clamp(st.company.rep - C.leaveRep, 0, 100);
    g.momentum = U.clamp(g.momentum - 8, 0, 100);
    bumpStat(st, 'departures');
    return { ok: true, lost, left: g.memberIds.length };
  };

  /* The other half: somebody joins a line-up that already exists. They arrive as
     a stranger to everybody in it — KP.bonds.newcomer, against every existing
     pair's history — which is the whole cost of the move. The fee is for the
     showcase; what it actually costs is a season of chemistry. */
  E.joinGroup = function (st, groupId, traineeId) {
    const g = st.groups.find(x => x.id === groupId);
    const t = st.trainees.find(x => x.id === traineeId);
    if (!g || !t) return { ok: false, msg: 'Nobody by that name.' };
    if (KP.isUnit(g)) return { ok: false, msg: 'A unit takes its members from its parent group.' };
    if (t.groupId) return { ok: false, msg: t.name + ' is already in a group.' };
    if (g.memberIds.length >= 7) return { ok: false, msg: 'Seven members is the cap.' };
    const cost = KP.costs.lineupShowcase;
    if (st.company.money < cost) {
      return { ok: false, msg: 'Introducing a member costs ' + U.money(cost) + '.' };
    }
    st.company.money -= cost;
    t.groupId = g.id;
    t.focus = 'dance';
    signTerm(st, t);
    g.memberIds.push(t.id);
    seedBonds(st, g, KP.memberOf(st, g),
      () => KP.bonds.newcomer + U.rnd(-6, 6), t.id);
    E.assignPositions(st, KP.memberOf(st, g));
    // A new face is news, and the news is neither good nor bad: some of the
    // public turns up to look and some of the fandom is not having it.
    gainFans(g, g.fans * .02 + t.fame * KP.survival.fameFans);
    // Cashed. A name the public knows is spent at the showcase that used it,
    // or the next graduation and re-introduction would sell it a second time.
    t.fame = 0;
    bumpSenti(g, -2);
    g.momentum = U.clamp(g.momentum + 4, 0, 100);
    KP.log(t.name + ' has joined ' + g.name + ' · ' + U.money(cost) +
      ' — the room does not know them yet.', 'info');
    return { ok: true, cost };
  };

  /* A graduation: out of the line-up, back into the trainee room, still on the
     books. The contract goes with the group — they are not an idol any more. */
  E.graduate = function (st, traineeId) {
    const t = st.trainees.find(x => x.id === traineeId);
    if (!t) return { ok: false, msg: 'Nobody by that name.' };
    const g = t.groupId ? st.groups.find(x => x.id === t.groupId) : null;
    if (!g) return { ok: false, msg: 'They are not in a group.' };
    const name = g.name;
    const r = E.leaveGroup(st, t, 'graduate');
    if (!r.ok) return r;
    KP.log(t.name + ' has graduated from ' + name + '.', 'bad');
    pushRecap(st, '🎓', t.name + ' left ' + name, 'bad');
    return r;
  };

  /* =========================== disbanding a group ==========================
     The act ends and the people do not, so the decision is per person: kept on
     (the trainee room, the payroll, the rest of their own term held by
     clearContract, and a slice of the fandom as `t.fame` that evaporates there
     like a survival show's does) or released (off the books, and into the market
     through toMarket). There is no fee and no refusal on the way out: a contract
     is a contract wherever the person sits, and because the term travels with
     them a disbandment cannot reset it. E.disbandPreview is the single source of
     every number the modal prints; E.disband applies it rather than recomputing.
     ======================================================================== */

  E.disbandBlock = function (st, g) {
    if (!g) return 'That group is gone.';
    if (KP.isUnit(g)) return 'A unit is wrapped up, not disbanded.';
    // Ending the act is not an answer to a story about it. The question has a
    // deadline and step 0 is where it is answered, one way or another.
    if (st.scandal && st.scandal.gid === g.id) return 'There is a story about ' + g.name + ' waiting for an answer.';
    return null;
  };

  E.disbandPreview = function (st, gid) {
    const g = st.groups.find(x => x.id === gid);
    const D = KP.disband;
    const blocked = E.disbandBlock(st, g);
    if (!g || KP.isUnit(g)) return { ok: false, msg: blocked };
    const members = KP.memberOf(st, g);
    const n = Math.max(1, members.length);
    const follow = D.fameShare * U.clamp(KP.loyalOf(g) / KP.fandom.midLoyal, D.fameLoyal[0], D.fameLoyal[1]);
    const fame = Math.round(U.clamp(g.fans / n * follow / KP.survival.fameFans, 0, 100));
    const units = KP.unitsOf(st, g.id);
    const unitIds = units.map(u => u.id);
    return {
      ok: !blocked, msg: blocked, g,
      rows: members.map(t => ({ t, fame, left: KP.contractLeft(st, t), window: KP.inRenewWindow(st, t) })),
      rep: D.rep,
      bookings: (st.bookings || []).filter(b => b.groupId === g.id || unitIds.indexOf(b.groupId) >= 0).length,
      units: units.map(u => u.name),
      charting: (st.chart || []).some(r => r.groupId === g.id)
    };
  };

  /* `keepIds` is who the player chose to keep; anybody not in it is released. */
  E.disband = function (st, gid, keepIds) {
    const pv = E.disbandPreview(st, gid);
    if (!pv.ok) return { ok: false, msg: pv.msg };
    const keep = new Set(keepIds || []);
    const D = KP.disband;
    st.company.rep = U.clamp(st.company.rep - D.rep, 0, 100);
    // A denial that was a lie is not buried with the act. disbandGroup drops the
    // pending fallout because its fans and sentiment have nowhere left to land,
    // but the agency's share of the bill is the agency's: the press goes looking
    // the week a group ends, so it comes due tonight rather than never.
    if (st.fallout && st.fallout.gid === pv.g.id) {
      const f = st.fallout;
      st.company.rep = U.clamp(st.company.rep + KP.scandal.backfire.rep, 0, 100);
      KP.log('With ' + pv.g.name + ' gone, the denial falls apart — ' + f.who +
        '\'s story was true after all.', 'bad');
      pushRecap(st, '💣', 'Denial backfired · ' + f.who, 'bad');
    }
    // disbandGroup clears every member's contract into a held term and takes the
    // units, the diary, the chart row and any story about the act with it.
    const name = disbandGroup(st, pv.g, 'disband');

    const kept = [], released = [];
    pv.rows.forEach(r => {
      const t = r.t;
      if (keep.has(t.id)) {
        t.morale = U.clamp(t.morale - D.morale, 0, 100);
        t.fame = r.fame;
        kept.push(t.name);
        return;
      }
      st.trainees = st.trainees.filter(x => x.id !== t.id);
      released.push({ name: t.name, to: toMarket(st, t) });
    });
    // Everybody left a line-up tonight, kept or not — the same count five
    // graduations would have made.
    bumpStat(st, 'departures', pv.rows.length);

    KP.log(name + ' has disbanded. ' +
      (kept.length ? kept.join(', ') + (kept.length === 1 ? ' stays' : ' stay') + ' with the agency. ' : '') +
      (released.length ? released.map(r => r.name).join(', ') + ' — released.' : ''), 'bad');
    pushRecap(st, '💔', name + ' disbanded', 'bad');
    return { ok: true, name, kept: kept.length, released };
  };

  /* ============================== sub-units ================================
     A unit is a group record with a parent, which is why nothing below this
     comment had to learn about it: the chart, the books, the schedule board and
     the yearbook all take a group. What a unit costs is the roster it is drawn
     from — the same people, the same stamina, twice the diary.
     ======================================================================== */

  E.unitBlock = function (st, parent, kindKey, memberIds) {
    const spec = KP.unitKind(kindKey);
    if (!spec) return 'No such unit.';
    if (!parent) return 'That group is gone.';
    if (KP.isUnit(parent)) return 'A unit is drawn out of a group, not out of another unit.';
    if (parent.releases.length < spec.needReleases) {
      return spec.name + 's need ' + spec.needReleases + ' releases behind the group · ' +
        parent.name + ' has ' + parent.releases.length + '.';
    }
    if (parent.fans < spec.needFans) return 'Needs ' + U.num(spec.needFans) + ' fans.';
    if (KP.unitsOf(st, parent.id).length >= KP.units.maxPer) {
      return parent.name + ' is already running ' + KP.units.maxPer + ' units.';
    }
    const ids = memberIds || [];
    if (ids.length < spec.min || ids.length > spec.max) {
      return spec.min === spec.max
        ? spec.name + 's are ' + spec.min + ' member' + (spec.min === 1 ? '' : 's') + '.'
        : spec.name + 's are ' + spec.min + ' to ' + spec.max + ' members.';
    }
    if (ids.some(id => parent.memberIds.indexOf(id) < 0)) return 'They are not in that group.';
    const busy = ids.find(id => KP.inAUnit(st, id));
    if (busy) {
      const t = st.trainees.find(x => x.id === busy);
      return (t ? t.name : 'One of them') + ' is already in a unit.';
    }
    if (st.company.money < spec.cost) {
      return 'A ' + spec.name.toLowerCase() + ' showcase costs ' + U.money(spec.cost) + '.';
    }
    return null;
  };

  E.formUnit = function (st, opts) {
    const parent = st.groups.find(x => x.id === opts.parentId);
    const spec = KP.unitKind(opts.kind);
    const ids = (opts.memberIds || []).slice();
    const blocked = E.unitBlock(st, parent, opts.kind, ids);
    if (blocked) return { ok: false, msg: blocked };
    const name = String(opts.name || '').trim();
    if (!name) return { ok: false, msg: 'The unit needs a name.' };
    if (st.groups.some(g => g.name === name)) return { ok: false, msg: 'You already have an act called that.' };

    st.company.money -= spec.cost;
    const F = KP.fandom;
    const members = ids.map(id => st.trainees.find(t => t.id === id)).filter(Boolean);
    const g = {
      id: U.uid('u'),
      parentId: parent.id,
      unitKind: spec.k,
      name,
      kr: opts.kr || '',
      concept: opts.concept,
      lastConcept: null,
      color: opts.color || parent.color,
      fandom: parent.fandom,
      memberIds: members.map(m => m.id),
      // Drawn OUT of the parent's fandom rather than added to it: these are the
      // people who already follow them, which is why the merch line is
      // discounted and KP.totalFans does not count a unit at all.
      fans: Math.round(parent.fans * U.rnd(spec.share[0], spec.share[1])),
      momentum: 20,
      // The half of a fandom that follows a sub-unit is the invested half.
      loyal: U.clamp(KP.loyalOf(parent) + 6, 0, 100),
      senti: KP.sentiOf(parent),
      intl: KP.intlOf(parent),
      tourLegs: 0, toursY: 0,
      releases: [], active: null,
      stagesY: 0, varietyY: 0, liveAbs: {}, livesY: 0, ticketsY: 0,
      trophies: [],
      bonds: {},              // unused: a unit reads its parent's, see KP.bondHost
      debut: { y: st.year, w: st.week }
    };
    st.groups.push(g);
    bumpStat(st, 'units');
    st.company.rep = U.clamp(st.company.rep + 1, 0, 100);
    // Being picked out of the line-up is a good week for the people picked.
    members.forEach(m => { m.morale = U.clamp(m.morale + 8, 0, 100); });
    KP.log('✧ ' + name + ' — a ' + spec.name.toLowerCase() + ' out of ' + parent.name +
      ' (' + members.map(m => m.name).join(', ') + ').', 'big');
    pushRecap(st, spec.ic, name + ' · ' + spec.name.toLowerCase() + ' of ' + parent.name, 'big');
    return { ok: true, group: g };
  };

  E.disbandUnit = function (st, groupId) {
    const g = st.groups.find(x => x.id === groupId);
    if (!g || !KP.isUnit(g)) return { ok: false, msg: 'That is not a unit.' };
    const parent = KP.parentOf(st, g);
    const spec = KP.unitSpec(g);
    // Whatever it built goes back where it came from — a fandom that followed
    // two of them still follows the five.
    if (parent) bumpLoyal(parent, KP.units.loyalBack * (g.releases.length ? 1 : 0));
    st.company.rep = U.clamp(st.company.rep - KP.units.disbandRep, 0, 100);
    const name = disbandGroup(st, g, 'unit');
    KP.log(name + ' has wrapped up — ' + (spec ? spec.name.toLowerCase() : 'the unit') +
      ' activities are over.', 'info');
    return { ok: true, name };
  };

  /* ========================= contracts and the cliff =======================
     Seven years from debut, and the decision opens a year out. E.renewContract
     is the only way a term is extended and contractWeek is the only way one
     ends — which is what keeps the date on the trainee card, the price in the
     table and the week the person actually walks all quoting one number.
     ======================================================================== */

  E.renewContract = function (st, traineeId) {
    const t = st.trainees.find(x => x.id === traineeId);
    if (!t || !t.groupId) return { ok: false, msg: 'They have no contract to renew.' };
    if (!KP.inRenewWindow(st, t)) {
      const left = KP.contractLeft(st, t);
      return { ok: false, msg: 'Their term still has ' +
        Math.round((left - KP.contracts.windowWeeks) / KP.WEEKS_PER_YEAR * 10) / 10 +
        ' years to run before it can be renegotiated.' };
    }
    if (!KP.willRenew(st, t)) {
      return { ok: false, msg: t.name + ' will not re-sign at any price.' };
    }
    const cost = KP.renewCost(st, t);
    if (st.company.money < cost) {
      return { ok: false, msg: t.name + ' is asking ' + U.money(cost) + '.' };
    }
    const C = KP.contracts;
    st.company.money -= cost;
    const years = U.irnd(C.renewYears[0], C.renewYears[1]);
    t.contractAbs += years * KP.WEEKS_PER_YEAR;
    t.morale = U.clamp(t.morale + C.renewMorale, 0, 100);
    const g = st.groups.find(x => x.id === t.groupId);
    if (g) { bumpLoyal(g, C.renewLoyal); bumpSenti(g, C.renewSenti); }
    bumpStat(st, 'renewals');
    E.record(st, 'signature', cost, t.name, g ? g.name : '');
    KP.log(t.name + ' has re-signed for ' + years + ' more years · ' + U.money(cost) + '.', 'good');
    pushRecap(st, '✍️', t.name + ' re-signed · ' + years + ' years', 'good');
    return { ok: true, cost, years };
  };

  /* Step 6b. Two warnings and then the cliff — the warnings are stateless
     because the tick runs exactly once a week, so an `=== ` on the weeks left
     fires exactly once per person and needs no flag on the record. */
  E.contractWeek = function (st) {
    const C = KP.contracts;
    // A copy, because leaving mutates st.trainees through E.leaveGroup.
    st.trainees.slice().forEach(t => {
      // One reader for both shapes of a term: a member's contractAbs, and the
      // rest of it held as termAbs by somebody whose act ended. The second can
      // not be renewed from the trainee room — the renewal table is for idols
      // and prices off a group — so its warnings say where the decision is.
      const left = KP.contractLeft(st, t);
      if (left == null) return;
      const g = t.groupId ? st.groups.find(x => x.id === t.groupId) : null;
      if (left === C.windowWeeks) {
        KP.log(t.name + '\'s contract enters its final year — ' + (t.groupId
          ? 'the renewal table is open.' : 'they can only be re-signed from a line-up.'), 'info');
        pushRecap(st, '📄', t.name + ' · final year of their contract', '');
      } else if (left === 8) {
        KP.log(t.name + ' has eight weeks left on their contract' + (!t.groupId ? ' and is not in a line-up.'
          : KP.willRenew(st, t) ? ' and is asking ' + U.money(KP.renewCost(st, t)) + '.'
            : ' and is not re-signing.'), 'bad');
      }
      if (left > 0) return;

      if (t.groupId) {
        const r = E.leaveGroup(st, t, 'contract');
        if (!r.ok) return;
      }
      st.trainees = st.trainees.filter(x => x.id !== t.id);
      KP.log(t.name + '\'s contract' + (g ? ' with ' + g.name : '') +
        ' has expired. They are leaving the company.', 'bad');
      pushRecap(st, '🚪', t.name + ' left · contract expired', 'bad');
      toMarket(st, t);
    });
  };

  /* Somebody with years of stages behind them does not sit at home. Only
     agencies of the player's own kind are in the market for them, on the same
     rule the audition room's poach follows. One path for everybody who walks
     out of the building — an expired contract and a disbandment's release alike —
     so the two can never quote different odds. Returns the agency's name. */
  function toMarket(st, t) {
    if (!U.chance(KP.contracts.poachChance)) return null;
    const pool = (st.rivals || []).filter(rr => {
      const sp = KP.rivalSpec(rr);
      return sp && sp.gender === st.company.gender;
    });
    if (!pool.length) return null;
    const rr = U.pick(pool);
    const sp = KP.rivalSpec(rr);
    if (rr.trainees.length >= KP.rivals.rosterCap) rr.trainees.shift();
    rr.trainees.push(KP.stripRivalPerson(JSON.parse(JSON.stringify(t))));
    KP.log(sp.name + ' has signed ' + t.name + '.', 'bad');
    return sp.name;
  }

  /* ============================ the survival show ==========================
     Ten weeks of television for a finals night, and the finals night is the
     mechanic: the public has been voting on `KP.screenPresence` while the
     player has been reading ceilings, and the two rarely agree. Everything the
     player does not sign is signed by somebody else in the same scene.

     `ready` is a question with a deadline, on exactly the terms st.scandal is:
     step 0 answers it with nobody if the week turns without an answer.
     ======================================================================== */

  E.survivalBlock = function (st) {
    const S = KP.survival;
    if (st.survival) return 'A show is already on air.';
    if (KP.standing(st) < S.standing) return 'A broadcaster wants standing ' + S.standing + '.';
    if (st.company.money < S.cost) return 'A season costs ' + U.money(S.cost) + '.';
    return null;
  };

  E.startSurvival = function (st) {
    const S = KP.survival;
    const blocked = E.survivalBlock(st);
    if (blocked) return { ok: false, msg: blocked };
    st.company.money -= S.cost;
    const cast = [];
    for (let i = 0; i < S.cast; i++) {
      const t = KP.makeTrainee(U.rnd(S.quality[0], S.quality[1]));
      t.signCost = KP.signingCost(t);
      t.votes = Math.round(U.rnd(S.voteBase[0], S.voteBase[1]));
      t.fame = 0;
      cast.push(t);
    }
    st.survival = {
      startAbs: KP.absWeek(st),
      endAbs: KP.absWeek(st) + S.weeks,
      cast,
      ready: false
    };
    KP.log('📺 A survival show is commissioned · ' + U.money(S.cost) + ' — ' + S.cast +
      ' contestants, ' + S.weeks + ' weeks, and the public votes.', 'big');
    pushRecap(st, '📺', 'Survival show on air · ' + S.weeks + ' weeks', 'big');
    return { ok: true };
  };

  /* Step 6c. The votes accrue, the agency is on television every week whoever
     wins, and on the last week the finals are called and the fame is handed out
     by rank — which is what the player is really signing. */
  E.survivalWeek = function (st) {
    const S = KP.survival;
    const sv = st.survival;
    if (!sv || sv.ready) return;
    sv.cast.forEach(t => {
      t.votes = Math.max(0, t.votes + KP.screenPresence(t) * S.votePerWeek +
        U.rnd(-S.voteNoise, S.voteNoise));
    });
    st.company.rep = U.clamp(st.company.rep + S.repWeek, 0, 100);
    st.groups.forEach(g => bumpSenti(g, S.sentiWeek));
    if (KP.absWeek(st) < sv.endAbs) return;

    // Finals night. The cast is cut to the finalists and fame is handed out down
    // the ranking — a name the country watched for ten weeks walks into a debut
    // with a fandom, and that fame evaporates in the practice room.
    const ranked = KP.survivalRanked(st).slice(0, S.finalists);
    ranked.forEach((t, i) => {
      const share = ranked.length > 1 ? i / (ranked.length - 1) : 0;
      t.fame = Math.round(S.fameOf[1] + (S.fameOf[0] - S.fameOf[1]) * share);
      t.votes = Math.round(t.votes);
    });
    sv.cast = ranked;
    sv.ready = true;
    KP.log('📺 The finals are in. ' + ranked[0].name + ' won the public vote — you may sign ' +
      S.picks + ' of the ' + ranked.length + '.', 'big');
    pushRecap(st, '📺', 'Survival finals · ' + ranked[0].name + ' won the vote', 'big');
  };

  /* The finals night's one decision. An empty list is a legal answer and it is
     the one step 0 gives a player who closed the tab: everybody in that room is
     signed by somebody, and it will not be you. */
  E.survivalSign = function (st, ids) {
    const S = KP.survival;
    const sv = st.survival;
    if (!sv || !sv.ready) return { ok: false, msg: 'There are no finals to settle.' };
    const picked = (ids || [])
      .map(id => sv.cast.find(t => t.id === id))
      .filter(Boolean)
      .slice(0, S.picks);

    picked.forEach(t => {
      delete t.votes;
      t.signCost = 0;
      t.focus = 'dance';
      st.trainees.push(t);
      KP.log('Signed ' + t.name + ' out of the finals — ceiling ' + KP.potentialOverall(t) +
        ', and ' + t.fame + ' points of a name the public already knows.', 'good');
    });

    // Whatever is left is signed by somebody else in the same week, which is the
    // whole point of a finals night: the room does not go home.
    const left = sv.cast.filter(t => picked.indexOf(t) < 0)
      .sort((a, b) => KP.potentialOverall(b) - KP.potentialOverall(a));
    const pool = (st.rivals || []).filter(r => {
      const sp = KP.rivalSpec(r);
      return sp && sp.gender === st.company.gender;
    });
    left.slice(0, S.rivalTakes).forEach(t => {
      if (!pool.length) return;
      const r = U.pick(pool);
      const sp = KP.rivalSpec(r);
      if (r.trainees.length >= KP.rivals.rosterCap) r.trainees.shift();
      delete t.votes;
      r.trainees.push(KP.stripRivalPerson(t));
      KP.log(sp.name + ' signed ' + t.name + ' off the same stage.', 'bad');
    });

    st.survival = null;
    bumpStat(st, 'shows');
    if (!picked.length) {
      KP.log('The survival finals came and went without an offer from you.', 'bad');
    }
    return { ok: true, signed: picked.length };
  };

  /* ================================ finance ================================
     A loan and an investor are the same record with opposite risk: the loan
     carries a `weekly` that KP.ledger bills every week until the term runs out,
     the investor carries a `share` that E.earn skims off the top and never
     appears in the books at all. One of them can be missed; the other cannot.
     ======================================================================== */

  /* Simple weekly interest on the original principal — the player can do this
     arithmetic in their head, which is the point of quoting a flat instalment. */
  E.debtWeekly = function (spec) {
    return Math.round(spec.principal * (1 / spec.weeks + spec.rate));
  };

  /* Settling early. A loan forgives half the interest it has not yet charged; an
     investor sells their share back at a fixed multiple of what they put in, less
     whatever they have already taken — so the price falls every week they earn. */
  E.payoffCost = function (d) {
    const F = KP.finance;
    if (d.type === 'investor') return Math.max(0, Math.round(d.principal * F.buyoutMul - d.paid));
    const principalLeft = d.principal * (d.weeksLeft / d.weeks);
    const interestLeft = Math.max(0, d.remaining - principalLeft);
    return Math.max(0, Math.round(d.remaining - interestLeft * F.earlyPayoffDiscount));
  };

  E.financeSpecs = (type) => type === 'loan' ? KP.finance.loans
    : type === 'investor' ? KP.finance.investors : null;

  /* Why this facility is not available, or null if it is. Shared by E.takeDebt
     and the modal's lock list, on the same terms as E.bookBlock — the greyed-out
     row and the refusal message cannot disagree if there is only one of them. */
  E.debtBlock = function (st, type, key) {
    const F = KP.finance;
    const list = E.financeSpecs(type);
    if (!list) return 'No such facility.';
    const spec = list.find(x => x.k === key);
    if (!spec) return 'No such facility.';
    const debts = st.company.debts;
    if (debts.some(d => d.k === key)) return 'That one is already open.';
    if (debts.length >= F.maxFacilities) {
      return 'You are already carrying ' + F.maxFacilities + ' facilities.';
    }
    if (KP.standing(st) < spec.rep) return spec.name + ' needs standing ' + spec.rep + '.';
    if (KP.totalFans(st) < spec.fans) {
      return spec.name + ' needs ' + U.num(spec.fans) + ' fans on the books.';
    }
    if (type === 'loan' && KP.creditFree(st) < spec.principal) {
      return 'Your credit stretches to ' + U.money(KP.creditFree(st)) + '.';
    }
    return null;
  };

  E.takeDebt = function (st, type, key) {
    const F = KP.finance;
    const list = E.financeSpecs(type);
    const spec = list && list.find(x => x.k === key);
    const blocked = E.debtBlock(st, type, key);
    if (blocked) return { ok: false, msg: blocked };

    const weekly = type === 'loan' ? E.debtWeekly(spec) : 0;
    const net = Math.round(spec.principal * (1 - F.origination));
    const d = {
      id: U.uid('fin'), type, k: spec.k, name: spec.name,
      principal: spec.principal, weeks: spec.weeks, weeksLeft: spec.weeks,
      weekly, remaining: weekly * spec.weeks,
      share: type === 'investor' ? spec.share : 0,
      paid: 0, missed: 0, tookAbs: KP.absWeek(st)
    };
    st.company.debts.push(d);
    st.company.money += net;                    // NOT E.earn: borrowing is not income
    KP.log(spec.name + ' signed · ' + U.money(net) + ' received' +
      (type === 'loan' ? ' · ' + U.money(weekly) + '/week for ' + spec.weeks + ' weeks.'
        : ' · ' + Math.round(spec.share * 100) + '% of the top line for ' + spec.weeks + ' weeks.'), 'big');
    pushRecap(st, '🏦', spec.name + ' · ' + U.money(net), '');
    return { ok: true, net, debt: d };
  };

  E.repayDebt = function (st, id) {
    const i = st.company.debts.findIndex(d => d.id === id);
    if (i < 0) return { ok: false, msg: 'Nothing to clear.' };
    const d = st.company.debts[i];
    const cost = E.payoffCost(d);
    if (st.company.money < cost) return { ok: false, msg: 'Clearing it costs ' + U.money(cost) + '.' };
    st.company.money -= cost;
    if (d.type === 'loan') d.paid += cost;
    st.company.debts.splice(i, 1);
    KP.log(d.name + ' cleared early for ' + U.money(cost) + '.', 'good');
    pushRecap(st, '✅', d.name + ' paid off', 'good');
    return { ok: true, paid: cost };
  };

  /* Step 5b — AFTER step 5. KP.weeklyBurn already debited every live loan's
     instalment this week; this function only amortises, judges and retires.
     Running it before step 5 would skip the final instalment; prepaying instead
     would double-bill it. Neither. */
  E.serviceDebt = function (st) {
    const F = KP.finance;
    const debts = st.company.debts || [];
    if (!debts.length) return;
    const done = [];
    debts.forEach(d => {
      if (d.weeksLeft <= 0) { done.push(d); return; }

      if (d.type === 'loan') {
        const bill = KP.debtInstalment(d);
        // The instalment was paid with money you may not have had.
        if (st.company.money < 0) {
          // It bounced, so it comes back: step 5 has already taken it out of a
          // balance that could not cover it, and a miss that confiscates the
          // payment as well as capitalising it charges the player twice for one
          // week. What a miss costs is the penalty, the stretched term, the
          // reputation and the ladder below — not the instalment on top of all
          // four. (Only ever called from step 5b, immediately after
          // KP.weeklyBurn debited exactly this number.)
          st.company.money += bill;
          d.missed++;
          const penalty = Math.round(d.weekly * F.missPenalty);
          d.remaining += penalty;                         // capitalised, not paid
          st.company.rep = U.clamp(st.company.rep - F.missRep, 0, 100);
          if (d.missed === 2) d.weekly = Math.round(d.weekly * F.missRateHike);
          // `remaining` is the debt; the term is however many instalments it now
          // takes to clear it. Re-derived AFTER the rate hike, so the quoted
          // balance, the weekly bill and E.payoffCost all describe one loan —
          // and the term stretches by the missed week on its own.
          d.weeksLeft = Math.max(1, Math.ceil(d.remaining / Math.max(1, d.weekly)));
          if (d.missed === F.seizeAtMiss) E.seizeAsset(st, d);
          if (d.missed >= F.defaultAtMiss) {
            st.over = 'default';
            KP.log(d.name + ' has been called in. The agency is in the hands of its creditors.', 'bad');
          } else {
            KP.log('Missed a payment on ' + d.name + ' (' + d.missed + '/' + F.defaultAtMiss +
              ') — ' + U.money(penalty) + ' penalty, reputation down.', 'bad');
            pushRecap(st, '⚠️', 'Missed payment · ' + d.name + ' (' + d.missed + '/' + F.defaultAtMiss + ')', 'bad');
          }
          return;                                         // a missed week does not amortise
        }
        d.paid += bill;
        d.remaining = Math.max(0, d.remaining - bill);
        d.weeksLeft--;
        // Either counter reaching zero retires it. Cleared is cleared: a term
        // counter still running against a zero balance is what used to keep
        // billing an instalment nothing in the game admitted was owed.
        if (d.weeksLeft <= 0 || d.remaining <= 0) {
          done.push(d);
          KP.log(d.name + ' is paid off. The books are yours again.', 'good');
          pushRecap(st, '✅', d.name + ' paid off', 'good');
        }
      } else {
        d.weeksLeft--;
        if (d.weeksLeft <= 0) {
          done.push(d);
          const won = d.paid >= d.principal;
          st.company.rep = U.clamp(st.company.rep + (won ? F.investorGoodExit : -F.investorBadExit), 0, 100);
          KP.log(won
            ? d.name + ' exited happy — they took ' + U.money(d.paid) + ' and want back in.'
            : d.name + ' exited at a loss. They will tell people.', won ? 'good' : 'bad');
          pushRecap(st, won ? '🤝' : '📉', d.name + ' exited · ' + U.money(d.paid), won ? 'good' : 'bad');
        }
      }
    });
    // Retire AFTER the loop, and after step 5 — so the last instalment was billed.
    if (done.length) st.company.debts = debts.filter(d => done.indexOf(d) < 0);
  };

  /* Third miss: they take something. No refund, unlike E.downgrade — this is not
     a retreat you chose, and they take the best thing you own. */
  E.seizeAsset = function (st, d) {
    const pool = [];
    ['training', 'studio', 'dorm'].forEach(k => {
      if (st.company.facilities[k] > 1) pool.push(['fac', k, st.company.facilities[k]]);
    });
    ['vocal', 'dance', 'producer', 'marketing'].forEach(k => {
      if (st.company.staff[k] > 1) pool.push(['staff', k, st.company.staff[k]]);
    });
    if (!pool.length) return;
    pool.sort((a, b) => b[2] - a[2]);
    const kind = pool[0][0], key = pool[0][1];
    const target = kind === 'fac' ? st.company.facilities : st.company.staff;
    target[key] = target[key] - 1;
    KP.log('The creditors took a level of ' + key + ' against ' + d.name + '. Nothing came back.', 'bad');
    pushRecap(st, '🔒', 'Asset seized · ' + key + ' down to Lv' + target[key], 'bad');
  };

  /* ========================= the yearbook and awards =======================
     st.chart holds twenty-five rows for one week, a release records only its
     peak, and a rival song is deleted the moment it drops out of the market — so
     a year's record cannot be reconstructed after the fact. It has to be written
     while it still exists, and that is what the yearbook is: a live accumulator,
     filled in from the full chart every week and from the places the
     player-only axes actually happen, then judged once at the rollover and
     wiped. Everything in it is plain JSON — no Map, no Set, no Date — because
     KP.save() stringifies the whole state every single week.
     ======================================================================== */

  function blankAct(name, mine, groupId, debutY) {
    return {
      name, mine, groupId, debutY,
      cp: 0, no1: 0, top3: 0, top10: 0, weeks: 0,
      sales: 0, fans: 0, revenue: 0,
      stages: 0, variety: 0, tickets: 0, bestVariety: 0
    };
  }

  /* A ballot is a weighted sum over the axes of the record, read generically off
     KP.awards.score the way trait effects are read off KP.traits — so a new
     prize is a data entry and nothing else. The underscored axes are the ones
     E.runAwards synthesises for an act that keeps no books. */
  const BALLOT = {
    cp: a => a.cp, no1: a => a.no1, sales: a => a._sales, fans: a => a._fans,
    pop: a => a._pop, stages: a => a._stages, variety: a => a._variety
  };

  function ballotScore(a, prizeKey) {
    const w = KP.awards.score[prizeKey];
    if (!w) return 0;
    return Object.keys(w).reduce((s, ax) => s + w[ax] * (BALLOT[ax] ? BALLOT[ax](a) : 0), 0);
  }

  function songBallot(s) {
    const A = KP.awards, w = A.songScore;
    return s.cp * w.cp + (A.chartDepth + 1 - Math.min(s.peak, A.chartDepth)) * w.peak
      + s.no1 * w.no1 + (s.quality || 0) * w.quality;
  }

  /* Step 3d. Reads the FULL chart rather than the top 25 that gets stored: a song
     that spent a year hovering at #34 is a real year and the ballot has to be
     able to see it. Credit is rank-weighted over the top chartDepth ranks, so a
     #1 week is worth fifty of the weeks at the bottom of the ladder. */
  E.accrueYearbook = function (st, chart) {
    const A = KP.awards;
    const yb = st.yearbook;
    chart.forEach(r => {
      if (r.rank > A.chartDepth) return;
      const w = A.chartDepth + 1 - r.rank;
      const key = r.mine ? 'g:' + r.groupId : 'r:' + r.artist;
      if (!r.mine && st.knownRivals[r.artist] == null) {
        // Year 0 means "was already there". Until the first ceremony has been
        // held we have not watched a complete year, so every rival we meet is an
        // established act rather than a debutant — and filing the whole opening
        // market as this year's rookies would hand away the one prize a brand
        // new agency has a real shot at. The same applies to a save carried in
        // from a build that kept no yearbook.
        st.knownRivals[r.artist] = st.awards.length ? st.year : 0;
      }

      let a = yb.acts[key];
      if (!a) {
        const g = r.mine ? st.groups.find(x => x.id === r.groupId) : null;
        a = yb.acts[key] = blankAct(r.artist, !!r.mine, r.mine ? r.groupId : null,
          g && g.debut ? g.debut.y : (r.mine ? st.year : st.knownRivals[r.artist]));
      }
      a.cp += w;
      a.weeks++;
      if (r.rank === 1) a.no1++;
      if (r.rank <= 3) a.top3++;
      if (r.rank <= 10) a.top10++;

      const sk = key + '|' + r.title;
      let s = yb.songs[sk];
      if (!s) {
        s = yb.songs[sk] = {
          title: r.title, act: a.name, mine: !!r.mine,
          groupId: r.mine ? r.groupId : null,
          cp: 0, peak: 99, weeks: 0, no1: 0, quality: 0
        };
        // Song of the Year is partly a craft award, and this is the only moment
        // the song's quality is still reachable from a chart row. The concept
        // and the colour ride along for the same reason and are kept only for
        // our own songs: they are what KP.cover draws the sleeve from, and a
        // year of rival titles carrying two dead fields each is save size spent
        // on a jacket nothing ever prints.
        if (r.mine) {
          const g = st.groups.find(x => x.id === r.groupId);
          if (g && g.active && g.active.title === r.title) s.quality = g.active.quality;
          if (g) { s.concept = (g.active && g.active.title === r.title) ? g.active.concept : g.concept; }
          if (g) s.color = g.color;
        }
      }
      s.cp += w;
      s.weeks++;
      s.peak = Math.min(s.peak, r.rank);
      if (r.rank === 1) s.no1++;
    });

    // A year of rival songs runs to ~180 entries. Trim the weakest, and never a
    // release of the player's own — their discography is the one thing here that
    // has to be complete.
    const keys = Object.keys(yb.songs);
    if (keys.length > A.songsTracked) {
      keys.sort((a, b) => yb.songs[a].cp - yb.songs[b].cp)
        .slice(0, keys.length - A.songsTracked)
        .forEach(k => { if (!yb.songs[k].mine) delete yb.songs[k]; });
    }
  };

  /* The player-only axes — sales, fandom, stages, variety, tickets — happen
     nowhere near the chart, so they are credited where they happen. */
  E.ybAct = function (st, g) {
    const key = 'g:' + g.id;
    let a = st.yearbook.acts[key];
    if (!a) a = st.yearbook.acts[key] = blankAct(g.name, true, g.id, g.debut ? g.debut.y : st.year);
    return a;
  };

  /* ============================ the year in review =========================
     The ceremony judges the year; this remembers it. Same window as
     E.runAwards — after the calendar has turned and before E.rollYear wipes the
     accumulator — and for the same reason: st.yearbook is the only place a
     chart year exists, and in one more line of nextWeek it will not.

     Three rules it is built under:

     - It runs UNCONDITIONALLY, where the ceremony returns early on an empty
       ballot. A year with no releases in it is still a year the player spent —
       signing, building, going broke slowly — and it is the year they most want
       a page about.
     - It records the year BEFORE the trophies are handed out, which is why
       E.runReview is called first: the review is what you did, the ceremony is
       what it won, and a review that already knew the answer would spoil the
       modal that opens straight after it.
     - It stores numbers, never sentences. Which of them makes a headline is a
       reading of the year and belongs on the screen that shows it, the same way
       KP.fanMods is derived here and printed there. */
  E.runReview = function (st) {
    const yb = st.yearbook;
    const year = yb.y;
    const acts = Object.keys(yb.acts).map(k => yb.acts[k]);
    const ours = acts.filter(a => a.mine);
    const cp = ours.reduce((s, a) => s + a.cp, 0);

    // The chart year as a table, everybody's, because a year in which somebody
    // else owned the chart is the most useful thing this page can say. The top
    // five, and then OUR best act wherever it actually came — a scrapbook that
    // can leave the reader off its own page is a scrapbook nobody believes.
    //
    // Why it usually does: an anonymous market name is a catalogue rather than
    // an act. ~150 songs a year are shared between twenty-two of them, so each
    // aggregates seven releases where the player aggregates two, and raw chart
    // points rank a busy label above an agency that had the best year of its
    // life. That is the same distortion KP.awards.rivalRateShare exists to
    // discount, and it is why the tiles beside this table quote weeks at #1
    // rather than a share of the field.
    const ranked = acts.slice().sort((a, b) => b.cp - a.cp);
    const row = (a, i) => ({ rank: i + 1, name: a.name, cp: Math.round(a.cp), no1: a.no1, mine: !!a.mine });
    const table = ranked.slice(0, 5).map(row);
    const mineAt = ranked.findIndex(a => a.mine);
    if (mineAt >= 5) table.push(row(ranked[mineAt], mineAt));

    // The year's own song, off the same ballot Song of the Year is read from,
    // narrowed to ours: this is a scrapbook, not a second ceremony. The concept
    // is resolved here because the yearbook keys songs by title and the sleeve
    // is drawn from the concept — after the rollover the release is still in the
    // discography, but only for as long as we are standing in this function.
    const songs = Object.keys(yb.songs).map(k => yb.songs[k])
      .filter(s => s.mine).sort((a, b) => b.cp - a.cp);
    let best = null;
    if (songs[0]) {
      const s = songs[0];
      best = {
        title: s.title, act: s.act, groupId: s.groupId || null,
        concept: s.concept || null, color: s.color || null,
        cp: Math.round(s.cp), peak: s.peak, weeks: s.weeks
      };
    }

    const rec = {
      y: year,
      calendarYear: st.calendarYear - 1,
      stats: Object.assign({}, st.statsY),
      cp: Math.round(cp),
      fieldCp: Math.round(acts.reduce((s, a) => s + a.cp, 0)),
      sales: Math.round(ours.reduce((s, a) => s + a.sales, 0)),
      fans: Math.round(ours.reduce((s, a) => s + a.fans, 0)),
      revenue: Math.round(ours.reduce((s, a) => s + a.revenue, 0)),
      table, best,
      acts: ranked.length,
      // Weeks any song of ours spent at #1, which is a different year from the
      // number of singles that reached it: one song holding for six weeks and
      // six songs holding for one are both "six", and only one of them is a
      // year the public remembers.
      no1Weeks: ours.reduce((s, a) => s + a.no1, 0),
      // Where the agency stood on the last night of the year. Read before the
      // ceremony moves any of them, which is the honest reading of "the year".
      fansEnd: KP.totalFans(st),
      cash: Math.round(st.company.money),
      rep: Math.round(st.company.rep),
      standing: Math.round(KP.standing(st)),
      prestige: st.company.prestige || 0,
      groups: KP.mainGroups(st).length,
      units: st.groups.length - KP.mainGroups(st).length,
      trainees: st.trainees.filter(t => !t.groupId).length
    };
    st.reviews.unshift(rec);
    while (st.reviews.length > KP.awards.historyYears) st.reviews.pop();
    st.pendingReview = year;
    // The one record that is about a year rather than a week, so it is restamped
    // to the year it belongs to: the rollover has already moved the calendar on,
    // and a chart year filed under the first week of the following January is a
    // row that contradicts its own value. E.record returns the entry for exactly
    // this — nothing else is allowed to reach into st.records.
    const cr = E.record(st, 'chartYear', cp, st.company.name, '');
    if (cr) { cr.y = year; cr.w = KP.WEEKS_PER_YEAR; }
    return rec;
  };

  /* Claimed exactly once, the way a ceremony is — and separately, because the
     two are independent: a year with nothing on the ballot has a review and no
     ceremony at all. */
  E.claimReview = function (st) {
    const y = st.pendingReview;
    if (y == null) return null;
    st.pendingReview = null;
    return y;
  };

  /* The three records that are a LEVEL rather than an event, sampled once a
     week as the last thing the tick does — see step 7b for why it has to be
     last. Everything else in KP.recordKinds is stamped where it happens,
     because a gate and a first week only exist for one line of one function. */
  E.recordWeek = function (st) {
    // No `sub` on these two: the entry already carries the week it was set in,
    // and a row that prints "STARLINE · Y3 W17 · Y3 W17" is one label doing the
    // job twice.
    E.record(st, 'agency', KP.totalFans(st), st.company.name, '');
    E.record(st, 'cash', st.company.money, st.company.name, '');
    let top = null;
    st.groups.forEach(g => { if (!top || g.fans > top.fans) top = g; });
    if (top) E.record(st, 'fandom', top.fans, top.name, top.fandom || '');
  };

  /* The ceremony. Called at the rollover, BEFORE E.rollYear wipes the book, and
     it takes the year off st.yearbook.y rather than st.year — the calendar has
     already turned over by the time this runs, and reading st.year here would
     misfile every ceremony by exactly one year, every year. */
  E.runAwards = function (st) {
    const A = KP.awards;
    const yb = st.yearbook;
    const year = yb.y;
    const acts = Object.keys(yb.acts).map(k => yb.acts[k]).filter(a => a.cp >= A.minBallot);
    if (!acts.length) { st.pendingAwards = null; return null; }

    // Rivals keep no books and have no fandom we can count, so theirs are
    // synthesised from the chart record, and the RATE is measured off this
    // ballot rather than fixed in data. It has to be: the player's side of these
    // three axes is a pair of unbounded stocks — a year of album sales, a whole
    // fandom — while a rival's chart credit is capped by a fifty-rung ladder over
    // fifty-two weeks. At a constant won-per-point the sales and popularity terms
    // overtake every other axis the moment the fandom is large, and each acts
    // prize turns into an annuity whose margin widens every year. Measured, both
    // sides are in the same units and the ballot is settled by how much of the
    // chart year an act owned and how well it converted it — at any size.
    //
    // A.rivalRateShare is the discount on that measured rate: a rival's chart
    // year is an aggregate over a whole catalogue while the player's best act is
    // one group, so handing the market's busiest name the player's own conversion
    // rate would beat the player on every axis at once. The data constants stay
    // as the floor, which is what a small early ballot is scored on. None of it
    // is written back into the save.
    const isUnitAct = (a) => {
      const g = a.groupId ? st.groups.find(x => x.id === a.groupId) : null;
      return !!(g && KP.isUnit(g));
    };
    const ours = acts.filter(a => a.mine);
    const ourCp = ours.reduce((s, a) => s + a.cp, 0);
    const per = (total, floor) =>
      Math.max(floor, ourCp > 0 ? total / ourCp * A.rivalRateShare : 0);
    const salesPerCp = per(ours.reduce((s, a) => s + a.sales, 0), A.rivalSalesPerPoint);
    const fansPerCp = per(ours.reduce((s, a) => s + a.fans, 0), A.rivalFansPerPoint);
    // The Popularity Award is a vote, and a vote is cast by the half of a fandom
    // that actually turns up — so the player's own crowd is counted at its
    // loyalty. Read through one expression, because the rate the rivals are
    // synthesised at is MEASURED off this same sum: quoting it two different
    // ways here would silently re-price every rival on the ballot.
    const popOf = (a) => {
      const g = a.groupId ? st.groups.find(x => x.id === a.groupId) : null;
      return (g ? g.fans : a.fans) * (g ? KP.fanMods(g).merch : 1);
    };
    const popPerCp = per(ours.reduce((s, a) => s + popOf(a), 0), A.rivalFansPerPoint * A.rivalPopMul);

    acts.forEach(a => {
      a._sales = a.mine ? a.sales : Math.round(a.cp * salesPerCp);
      a._fans = a.mine ? a.fans : Math.round(a.cp * fansPerCp);
      a._pop = a.mine ? Math.round(popOf(a)) : Math.round(a.cp * popPerCp);
      a._stages = a.mine ? a.stages : Math.round(a.weeks * A.rivalStagePerWeek);
      a._variety = a.mine
        ? a.variety * A.varietySynth.show + a.bestVariety * A.varietySynth.best
        : a.cp * A.varietySynth.rival;
    });

    const songs = Object.keys(yb.songs).map(k => yb.songs[k]).filter(s => s.cp >= A.minBallot);

    const results = [];
    A.prizes.forEach(p => {
      let pool;
      if (p.pool === 'songs') pool = songs.slice().sort((a, b) => songBallot(b) - songBallot(a));
      // Rookie eligibility is a one-shot window: the year you first charted —
      // and a sub-unit is not a rookie. Its members debuted years ago and the
      // fandom it charts on was drawn out of an established act, so leaving them
      // in would make Rookie of the Year a prize you re-win every year by
      // splitting the same group a different way.
      else if (p.pool === 'rookies') pool = acts.filter(a => a.debutY === year && !isUnitAct(a))
        .sort((a, b) => ballotScore(b, p.k) - ballotScore(a, p.k));
      else pool = acts.slice().sort((a, b) => ballotScore(b, p.k) - ballotScore(a, p.k));
      if (!pool.length) return;

      pool.slice(0, p.winners || 1).forEach(w => {
        const isSong = p.pool === 'songs';
        results.push({
          k: p.k, name: p.name, kr: p.kr, ic: p.ic,
          winner: isSong ? w.title : w.name,
          by: isSong ? w.act : null,
          groupId: w.groupId || null,
          // What the sleeve is drawn from, for the one prize that is a song.
          // Stored on the result rather than looked up on the night the modal
          // opens: st.awards outlives the release it is about by twenty years.
          concept: isSong ? (w.concept || null) : null,
          color: isSong ? (w.color || null) : null,
          mine: !!w.mine,
          detail: isSong
            ? 'peak #' + w.peak + ' · ' + w.weeks + ' weeks charting'
            : w.cp + ' chart points · ' + w.no1 + ' weeks at #1',
          score: Math.round(isSong ? songBallot(w) : ballotScore(w, p.k))
        });
        if (w.mine && w.groupId) E.grantPrize(st, w.groupId, p, year);
      });
    });

    st.awards.unshift({ y: year, calendarYear: st.calendarYear - 1, results });
    while (st.awards.length > A.historyYears) st.awards.pop();
    st.pendingAwards = year;

    const mine = results.filter(r => r.mine);
    KP.log('🏆 The Y' + year + ' award ceremony: ' + (mine.length
      ? 'you took ' + mine.length + ' prize' + (mine.length === 1 ? '' : 's') + '.'
      : 'you went home empty-handed.'), mine.length ? 'big' : 'bad');
    pushRecap(st, '🏆', 'Y' + year + ' awards · ' + mine.length + ' won', mine.length ? 'big' : 'bad');
    return results;
  };

  /* Winning has to do something. Reputation and fandom tonight; prestige for the
     rest of the run, which is the half that changes what next year can reach. */
  E.grantPrize = function (st, groupId, p, year) {
    const g = st.groups.find(x => x.id === groupId);
    st.company.rep = U.clamp(st.company.rep + p.rep, 0, 100);
    st.company.prestige = Math.min(KP.awards.prestigeCap, (st.company.prestige || 0) + p.prestige);
    if (!g) return;                     // they disbanded between the year and the night
    // A trophy hands over a share of the fandom, which is the one shape that has
    // to be damped (KP.income.fanSaturation): undamped it is compound interest on
    // an annual timer, and the prizes it pays for are decided by the sales and
    // fandom axes it just inflated — the ceremony would be bidding for itself.
    gainFans(g, g.fans * p.fansPct);
    g.momentum = U.clamp(g.momentum + p.momentum, 0, 100);
    // A trophy is the one thing that moves both halves of the fandom at once:
    // the public thinks better of them tonight, and the people already there
    // have something to point at — which is what pays the dilution back.
    bumpSenti(g, 3 + p.prestige * 1.5);
    bumpLoyal(g, KP.fandom.loyalTrophy + p.prestige * .5);
    g.trophies = g.trophies || [];
    g.trophies.unshift({ y: year, k: p.k, ic: p.ic, name: p.name });
  };

  /* main.js asks for a pending ceremony rather than clearing the flag itself —
     the flag is state, and state belongs to the engine. */
  E.claimAwards = function (st) {
    const y = st.pendingAwards;
    if (y == null) return null;
    st.pendingAwards = null;
    return y;
  };

  /* =============================== events ================================== */

  const EVENTS = [
    {
      k: 'fancam', p: .10, need: st => st.groups.some(g => g.fans > 3000),
      run(st) {
        const g = U.pick(st.groups.filter(x => x.fans > 3000));
        const m = U.pick(KP.memberOf(st, g));
        if (!m) return null;
        // The purest example of what gainFans is for: a spike worth a tenth of
        // the fandom arrives at newFanLoyal and takes several points of loyalty
        // out of the average on the way in. Virality is real and it is shallow.
        const boost = gainFans(g, (g.fans * U.rnd(.05, .14) + 4000 * traitMul(m, 'viral'))
          * KP.fanMods(g).acq);
        g.momentum = U.clamp(g.momentum + 7, 0, 100);
        // A clip that travels travels everywhere, so a little of it lands abroad.
        g.intl = U.clamp(KP.intlOf(g) + U.rnd(.004, .012), 0, KP.fandom.intlCap);
        return { ic: '📱', text: m.name + '\'s fancam went viral — +' + U.num(boost) + ' fans', kind: 'good' };
      }
    },
    {
      k: 'brand', p: .09, need: st => st.groups.some(g => g.fans > 20000),
      run(st) {
        const g = U.pick(st.groups.filter(x => x.fans > 20000));
        const fee = Math.round((g.fans * 900 + st.company.rep * 8e6) * U.rnd(.7, 1.4));
        E.earn(st, fee, 'cf');
        return { ic: '💄', text: g.name + ' signed a cosmetics CF · ' + U.money(fee), kind: 'good' };
      }
    },
    /* A story breaks. This is the one event that does not resolve itself: it
       hands the player a decision and a week to make it, and E.nextWeek answers
       it with silence if they do not. Fame is what attracts it — a group nobody
       is watching is a group nobody is writing about — so the roll is taken
       against the same pressure number the sasaeng incidents are. */
    {
      k: 'scandal', p: .09,
      need: st => !st.scandal && st.groups.some(g =>
        g.fans > KP.scandal.minFans && KP.memberOf(st, g).length),
      run(st) {
        const pool = st.groups.filter(g => g.fans > KP.scandal.minFans && KP.memberOf(st, g).length);
        // Weighted by pressure, so the group living under a camera is the group
        // it happens to — and a quiet mid-table act is left alone for years.
        const total = pool.reduce((s, g) => s + 1 + KP.pressure(st, g), 0);
        let r = Math.random() * total, g = pool[pool.length - 1];
        for (const x of pool) { r -= 1 + KP.pressure(st, x); if (r <= 0) { g = x; break; } }
        if (!U.chance(.25 + KP.pressure(st, g) / 140)) return null;
        const m = U.pick(KP.memberOf(st, g));
        const s = E.openScandal(st, g, m);
        if (!s) return null;
        const spec = KP.scandalSpec(s);
        return { ic: spec.ic, text: spec.name + ' · ' + m.name + ' — the office needs an answer', kind: 'bad' };
      }
    },
    {
      k: 'variety', p: .07, need: st => st.groups.length > 0,
      run(st) {
        const g = U.pick(st.groups);
        const m = U.pick(KP.memberOf(st, g));
        if (!m) return null;
        m.stats.variety = Math.min(m.potential.variety, m.stats.variety + U.rnd(2, 5));
        st.company.rep = U.clamp(st.company.rep + 1, 0, 100);
        return { ic: '🎤', text: m.name + ' guested on a variety show — variety up', kind: 'good' };
      }
    },
    {
      k: 'conflict', p: .06, need: st => KP.mainGroups(st).some(g => KP.memberOf(st, g).length >= 3),
      run(st) {
        const g = U.pick(KP.mainGroups(st).filter(x => KP.memberOf(st, x).length >= 3));
        const members = KP.memberOf(st, g);
        members.forEach(m => { m.morale = U.clamp(m.morale - U.rnd(6, 14), 0, 100); });
        // Two of them, not all of them: an argument has two sides, and the pair
        // it happened between is the pair that has to live with it afterwards.
        const two = U.pickN(members, 2);
        bumpBond(st, g, two[0].id, two[1].id, -U.rnd(KP.bonds.strain[0], KP.bonds.strain[1]));
        return {
          ic: '⚡',
          text: two[0].name + ' and ' + two[1].name + ' fell out inside ' + g.name,
          kind: 'bad'
        };
      }
    },
    {
      k: 'scout', p: .06, need: st => true,
      run(st) {
        const t = KP.makeTrainee(U.clamp(U.rnd(.45, .95), 0, 1));
        t.signCost = Math.round(KP.signingCost(t) * .75);
        st.scoutPool.unshift(t);
        if (st.scoutPool.length > 8) st.scoutPool.pop();
        return { ic: '⭐', text: 'A scout found ' + t.name + ' — now in the audition list', kind: 'good' };
      }
    },
    {
      k: 'burnout', p: .07, need: st => st.trainees.some(t => t.morale < 28),
      run(st) {
        const t = U.pick(st.trainees.filter(x => x.morale < 28));
        if (U.chance(.35)) {
          // They walk. Contracts don't hold people who stopped believing — and
          // the departure goes through the one exit path, so a line-up that
          // loses somebody redistributes its positions, prunes their bonds and
          // takes the fandom hit here exactly as it does at the seven-year cliff.
          const wasIdol = !!t.groupId;
          const r = wasIdol ? E.leaveGroup(st, t, 'quit') : { ok: true };
          st.trainees = st.trainees.filter(x => x.id !== t.id);
          if (!wasIdol) st.company.rep = U.clamp(st.company.rep - 1, 0, 100);
          if (r.disbanded) {
            return { ic: '💔', text: r.disbanded + ' disbanded — the last member walked', kind: 'bad' };
          }
          return { ic: '🚪', text: t.name + ' terminated their contract and left', kind: 'bad' };
        }
        t.morale = U.clamp(t.morale + 12, 0, 100);
        return { ic: '🫂', text: t.name + ' asked for a break — you gave them one', kind: '' };
      }
    },
    {
      k: 'challenge', p: .07, need: st => st.groups.some(g => g.active),
      run(st) {
        const g = U.pick(st.groups.filter(x => x.active));
        g.active.points = U.clamp(g.active.points * U.rnd(1.06, 1.16), 0, 99);
        return { ic: '💃', text: 'The “' + g.active.title + '” challenge is trending — chart points up', kind: 'good' };
      }
    },
    {
      k: 'live', p: .05, need: st => st.groups.some(g => g.active),
      run(st) {
        const g = U.pick(st.groups.filter(x => x.active));
        const members = KP.memberOf(st, g);
        const weakest = members.sort((a, b) => a.stats.vocal - b.stats.vocal)[0];
        if (!weakest) return null;
        if (weakest.stats.vocal > 55) {
          st.company.rep = U.clamp(st.company.rep + 1.5, 0, 100);
          return { ic: '🎙️', text: g.name + '\'s live stage clip is being praised', kind: 'good' };
        }
        st.company.rep = U.clamp(st.company.rep - 2, 0, 100);
        g.active.points *= .95;
        return { ic: '😬', text: 'A rough live from ' + g.name + ' is circulating', kind: 'bad' };
      }
    },
    /* A lender noticing you are short is not a bailout — it credits nothing and
       costs nothing. The free emergency injection that used to sit here paid up
       to ₩7.5億 for two reputation, after the books and before the bankruptcy
       check, which made the whole finance facility optional. */
    {
      k: 'creditwatch', p: .12,
      need: st => st.company.money < KP.finance.watchBelow
        && st.company.debts.length < KP.finance.maxFacilities,
      run(st) {
        const free = KP.creditFree(st);
        if (free < KP.finance.watchMin) return null;
        return { ic: '🏦', text: 'A lender called — you could still raise ' + U.money(free) + '.', kind: '' };
      }
    }
  ];

  function runEvents(st) {
    const pool = EVENTS.filter(e => e.need(st) && U.chance(e.p));
    U.pickN(pool, Math.min(2, pool.length)).forEach(e => {
      // need() was evaluated for the whole pool up front; an earlier event this
      // tick may have removed the very trainee or group this one is about.
      if (!e.need(st)) return;
      const r = e.run(st);
      if (!r) return;
      KP.log(r.text, r.kind || 'info');
      pushRecap(st, r.ic, r.text, r.kind);
    });
  }

  function pushRecap(st, ic, text, kind) {
    st.recap.push({ ic, text, kind: kind || '' });
  }

  /* ============================== the tick ================================= */

  E.nextWeek = function () {
    const st = KP.state;
    if (!st || st.over) return;

    const wasSeason = KP.seasonNow(st).k;
    st.recap = [];

    // 0. A story that was still open when the week turned has been answered by
    //    not answering it. Before the clock moves, so the week it is filed under
    //    is the week it broke — and so a player who closes the tab on a scandal
    //    gets the silence outcome exactly once rather than a modal that follows
    //    them forever.
    if (st.scandal) E.scandalRespond(st, 'silence');
    // ...and the same rule for the other question the game asks and waits on. A
    // finals night nobody answered signs nobody: the contestants do not sit in
    // the studio until somebody remembers them, they are signed by whoever else
    // was in the room. Resolved here rather than on a timer for exactly the
    // reason the scandal is — one outcome, in the week it was asked.
    if (st.survival && st.survival.ready) E.survivalSign(st, []);

    st.week++;
    if (st.week > KP.WEEKS_PER_YEAR) {
      st.week = 1;
      st.year++;
      st.calendarYear++;
      KP.log('— Year ' + st.year + ' begins —', 'big');
      // Remember the year, judge the year that just ended, THEN wipe the book.
      // All three read st.yearbook and the third one empties it, so the order is
      // load-bearing: reversing the last two silently awards an empty year,
      // every year, and running the review after the ceremony would hand it a
      // reputation and a fandom the trophies had already moved.
      E.runReview(st);
      E.runAwards(st);
      E.rollYear(st);
    }

    // A new season changes what it takes to chart and what charting is worth, so
    // it is announced rather than left for the player to notice in the numbers.
    const season = KP.seasonNow(st);
    if (season.k !== wasSeason) {
      KP.log(season.name + ' (' + season.kr + ') — ' + season.desc + '.', 'info');
      pushRecap(st, '📅', season.name + ' · ' + season.desc, '');
    }

    // 1. concept trends drift; the market gets bored on its own schedule, and
    //    the season leans on the two or three concepts it wants to hear.
    const P = KP.seasonPull;
    KP.concepts.forEach(c => {
      const target = season.favours.indexOf(c.k) >= 0 ? P.favoured : P.other;
      st.trends[c.k] = U.clamp(
        st.trends[c.k] + U.gauss(0, P.drift) + (target - st.trends[c.k]) * P.rate, 5, 98);
    });

    // 2. training
    st.trainees.forEach(t => trainWeek(st, t));

    // 2b. Mood Makers lift the room, not just themselves — the trait's own
    //     promise. Main groups only: a unit is the same people, and running it
    //     over both would pay the trait twice for one line-up.
    KP.mainGroups(st).forEach(g => {
      const mates = KP.memberOf(st, g);
      const lift = mates.reduce((s, m) => s + traitAdd(m, 'teamMorale'), 0);
      if (lift > 0) mates.forEach(m => { m.morale = U.clamp(m.morale + lift, 0, 100); });
    });

    // 2c. the room settles: bonds drift, a promotion cycle or a unit builds
    //     them, an empty week grinds them down, and the chemistry pays the
    //     people in it. Before the bookings resolve rather than after, so a
    //     week's cast bonds on top of a settled number instead of being
    //     immediately averaged back toward base.
    E.bondWeek(st);

    // 3. market + chart
    tickMarket(st);

    // 3b. the week's bookings resolve BEFORE the chart is built. A music show
    //     adds chart points, and points added after buildChart would only show
    //     up a week late — the stage would look like it did nothing.
    E.resolveBookings(st);

    // 3c. the four agencies act: their people improve, a group debuts, and a
    //     comeback whose week has come enters the market. Before buildChart for
    //     the same reason 3b is — a rival release the player was warned about
    //     four weeks ago has to be on the chart of the week it was warned for,
    //     not the one after it.
    E.rivalWeek(st);

    const chart = buildChart(st);
    st.chart = chart.slice(0, 25);

    // 3d. the year's record, written from the full chart while it still exists.
    //     st.chart keeps 25 rows for one week; this is the only memory the game
    //     has that a chart ever happened, and the awards are read from it.
    E.accrueYearbook(st, chart);

    // 4. groups
    st.groups.forEach(g => {
      if (g.active) {
        promoWeek(st, g, chart);
      } else {
        g.fans = Math.round(g.fans * .996);
        g.momentum = U.clamp(g.momentum - 1.6, 0, 100);
      }
    });

    // 4b. the rival groups read the same ranking, off the full chart rather than
    //     the twenty-five rows that get stored. Nothing here touches the books.
    E.rivalChartWeek(st, chart);

    // 4c. the fandom settles — loyalty, sentiment, the international split, and
    //     whoever is standing outside the dorm — and THEN pays. The merch credit
    //     lives inside E.fandomWeek because it is keyed to numbers this step has
    //     just moved: billing it in step 4 would price the week before the
    //     scandal that happened in it. A denial that was a lie comes home here
    //     too, weeks after the week it was free in.
    resolveFallout(st);
    E.fandomWeek(st);

    // 5. books
    st.company.money -= KP.weeklyBurn(st);
    st.company.money += KP.weeklyMisc(st);

    // 5b. debt service. Strictly after step 5: the instalments are inside
    //     weeklyBurn, so this only amortises what was just paid — and judges
    //     whether it was paid with money that existed.
    E.serviceDebt(st);

    // 5c. platform deals, on exactly the same terms as 5b: the weekly commitment
    //     is a KP.ledger line and step 5 has already paid it, so this only counts
    //     the term down and judges the deal on the way out.
    E.serviceDeals(st);

    // 6. events
    runEvents(st);

    // 6b. the seven-year cliff. After the events on purpose: a person the
    //     burnout event has just removed from the building is not also served
    //     an expiry notice in the same week, and both go through E.leaveGroup so
    //     the group they were in is left in one consistent shape either way.
    E.contractWeek(st);

    // 6c. the survival show: the votes accrue, and on the last week the finals
    //     are called. Answering them is step 0's job next week.
    E.survivalWeek(st);

    // 7. audition list refreshes on its own every 4 weeks — and somebody else
    //    gets the room's best hopeful on the way out, which is the point.
    if (KP.absWeek(st) - st.scoutRefreshedWeek >= 4) {
      E.rivalPoach(st);
      KP.refreshScouts();
    }

    // 7b. the record books, and deliberately the LAST thing that reads the week.
    //     A high-water mark has to be a number the player could have seen: a
    //     fancam in step 6 adds fans and a scandal takes them away, so a level
    //     sampled before the events is a peak that existed for nobody. Taking it
    //     here means "the biggest it ever was on a Sunday night", which is the
    //     only reading the screen can honestly print.
    E.recordWeek(st);

    // 8. fail state — two ways to lose, and they are not the same failure. The
    //    guard keeps 5b's more specific reason rather than overwriting it.
    if (!st.over && st.company.money < KP.costs.bankruptcyFloor) {
      st.over = 'bankrupt';
      KP.log('The agency is insolvent. Doors closed.', 'bad');
    }

    KP.save();
    return st.recap;
  };

  /* =========================== player actions ============================== */

  E.sign = function (st, traineeId) {
    const idx = st.scoutPool.findIndex(t => t.id === traineeId);
    if (idx < 0) return { ok: false, msg: 'Already gone.' };
    const t = st.scoutPool[idx];
    if (st.company.money < t.signCost) return { ok: false, msg: 'Not enough cash to sign them.' };
    st.company.money -= t.signCost;
    st.scoutPool.splice(idx, 1);
    st.trainees.push(t);
    KP.log('Signed ' + t.name + ' (' + t.age + ') for ' + U.money(t.signCost) + '.', 'good');
    return { ok: true };
  };

  /* An audition round called early, on the agency's money. The cost used to sit
     in main.js, which put a balance constant and a debit in the router and left
     the payment out of the feed entirely. */
  E.refreshScoutsPaid = function (st) {
    const cost = KP.costs.scoutRefresh;
    if (st.company.money < cost) {
      return { ok: false, msg: 'An early audition round costs ' + U.money(cost) + '.' };
    }
    st.company.money -= cost;
    // Churning the room has the same cost as letting it lapse: whoever you did
    // not sign is on somebody else's books by the time the new list is posted.
    E.rivalPoach(st);
    KP.refreshScouts(true);
    KP.log('Called an early audition round for ' + U.money(cost) + ' — 6 hopefuls waiting.', 'info');
    return { ok: true, cost };
  };

  E.release = function (st, traineeId) {
    const t = st.trainees.find(x => x.id === traineeId);
    if (!t) return { ok: false };
    if (t.groupId) return { ok: false, msg: 'Remove them from their group first.' };
    st.trainees = st.trainees.filter(x => x.id !== traineeId);
    KP.log(t.name + ' left the company.', 'info');
    // Somebody who has stood on a stage is on the market the same way whichever
    // door they leave by — or keeping them on at a disbandment and tearing the
    // contract up a click later would be a way to keep them from the agencies.
    // A trainee who never debuted is nobody's headline.
    const to = typeof t.termAbs === 'number' ? toMarket(st, t) : null;
    return { ok: true, to };
  };

  /* Re-runnable, and it has to be: this is called on every line-up change as
     well as at the debut, and a member who is no longer the oldest in the room
     would otherwise keep the Leader chip they were handed four years ago —
     nothing below reassigns a position that is already set. Clearing first is
     what makes a departure actually redistribute the room. */
  E.assignPositions = function (st, members) {
    members.forEach(m => { m.position = null; });
    const by = (k) => members.slice().sort((a, b) => b.stats[k] - a.stats[k])[0];
    const taken = new Set();
    const give = (m, pos) => { if (m && !taken.has(m.id)) { m.position = pos; taken.add(m.id); } };

    give(members.slice().sort((a, b) => (b.age - a.age) || (b.stats.charisma - a.stats.charisma))[0], 'Leader');
    give(by('vocal'), 'Main Vocal');
    give(by('dance'), 'Main Dancer');
    give(by('rap'), 'Main Rapper');
    give(by('visual'), 'Visual');
    const youngest = members.slice().sort((a, b) => a.age - b.age)[0];
    give(youngest, 'Maknae');
    members.forEach(m => { if (!m.position) m.position = U.chance(.5) ? 'Sub Vocal' : 'Sub Dancer'; });
  };

  E.debut = function (st, opts) {
    const members = opts.memberIds.map(id => st.trainees.find(t => t.id === id)).filter(Boolean);
    if (members.length < 3) return { ok: false, msg: 'A group needs at least 3 members.' };
    // Reachable now that a line-up can change under an open wizard: the debut
    // modal's list is one render stale, and stamping a second groupId on
    // somebody would leave the first group holding a member it no longer has.
    if (members.some(m => m.groupId)) {
      return { ok: false, msg: 'Somebody in that line-up is already in a group.' };
    }
    // The wizard's disabled state is one render stale — validate where it is authoritative.
    const name = String(opts.name || '').trim();
    if (!name) return { ok: false, msg: 'Your group needs a name.' };
    // The same rule E.formUnit holds, and for more than tidiness: the market and
    // the agencies both generate names AROUND st.groups, the yearbook keys acts
    // by id but prints them by name, and two acts called the same thing on one
    // chart is a ladder the player cannot read.
    if (st.groups.some(g => g.name === name)) {
      return { ok: false, msg: 'You already have an act called that.' };
    }
    if (st.company.money < KP.costs.debutShowcase) return { ok: false, msg: 'A debut showcase costs ' + U.money(KP.costs.debutShowcase) + '.' };

    st.company.money -= KP.costs.debutShowcase;
    const g = {
      id: U.uid('g'),
      name: name,
      kr: opts.kr || '',
      concept: opts.concept,
      lastConcept: null,
      color: opts.color,
      fandom: opts.fandom,
      memberIds: members.map(m => m.id),
      // A name the country already knows debuts with the fandom it earned on
      // television. This is what a survival show is actually bought for, and it
      // is why the fame it hands out decays while they sit in the practice room.
      fans: Math.round(2200 + st.company.rep * 260 + E.groupScore(members, opts.concept) * 120
        + members.reduce((s, m) => s + (m.fame || 0), 0) * KP.survival.fameFans),
      momentum: 22,
      // The three numbers that say what kind of fandom this is, at the values
      // every modifier in KP.fandom is written as a deviation from: a group
      // debuts on 1.00 across the board and earns its shape from there.
      loyal: KP.fandom.loyal0,
      senti: KP.fandom.senti0,
      intl: KP.fandom.intl0,
      tourLegs: 0,
      toursY: 0,
      releases: [],
      active: null,
      stagesY: 0,
      varietyY: 0,
      liveAbs: {},
      livesY: 0,
      ticketsY: 0,
      bonds: {},
      debut: { y: st.year, w: st.week }
    };
    // Seven years from tonight for a first debut; the rest of their own term
    // for somebody re-debuting out of an act that ended (see signTerm).
    members.forEach(m => {
      m.groupId = g.id;
      m.focus = 'dance';
      signTerm(st, m);
      m.fame = 0;           // cashed into g.fans above — see E.joinGroup
    });
    seedBonds(st, g, members, () => U.rnd(KP.bonds.start[0], KP.bonds.start[1]));
    E.assignPositions(st, members);
    st.groups.push(g);
    st.company.rep = U.clamp(st.company.rep + 3, 0, 100);
    bumpStat(st, 'debuts');

    KP.log('🎉 ' + g.name + ' debuts! Fandom name: ' + g.fandom + '.', 'big');
    return { ok: true, group: g };
  };

  E.upgrade = function (st, kind, key) {
    const target = kind === 'fac' ? st.company.facilities : st.company.staff;
    const lvl = target[key];
    if (lvl >= 5) return { ok: false, msg: 'Already at maximum.' };
    const cost = lvl * (kind === 'fac' ? KP.costs.facilityUpgrade : KP.costs.staffUpgrade);
    if (st.company.money < cost) return { ok: false, msg: 'Costs ' + U.money(cost) + '.' };
    st.company.money -= cost;
    target[key] = lvl + 1;
    KP.log('Upgraded ' + key + ' to level ' + (lvl + 1) + ' for ' + U.money(cost) + '.', 'good');
    return { ok: true };
  };

  E.upgradeCost = function (st, kind, key) {
    const lvl = (kind === 'fac' ? st.company.facilities : st.company.staff)[key];
    return lvl >= 5 ? null : lvl * (kind === 'fac' ? KP.costs.facilityUpgrade : KP.costs.staffUpgrade);
  };

  /* Scaling back. You get 40% of what the level cost — enough to be a real
     escape hatch when the books are bleeding, never enough to farm. */
  E.REFUND = .4;

  E.refundValue = function (st, kind, key) {
    const lvl = (kind === 'fac' ? st.company.facilities : st.company.staff)[key];
    if (lvl <= 1) return null;                       // level 1 is the floor: a room, one coach
    const paid = (lvl - 1) * (kind === 'fac' ? KP.costs.facilityUpgrade : KP.costs.staffUpgrade);
    return Math.round(paid * E.REFUND);
  };

  E.downgrade = function (st, kind, key) {
    const target = kind === 'fac' ? st.company.facilities : st.company.staff;
    const back = E.refundValue(st, kind, key);
    if (back == null) return { ok: false, msg: 'Already at the minimum.' };
    target[key] = target[key] - 1;
    st.company.money += back;
    const noun = kind === 'fac' ? 'Scaled back' : 'Let go of a';
    KP.log(noun + ' ' + key + ' — down to level ' + target[key] + ', recovered ' + U.money(back) + '.', 'bad');
    return { ok: true, back };
  };
})();
