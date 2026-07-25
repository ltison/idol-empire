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
    if (t.status === 'injured') {
      t.statusWeeks--;
      t.stamina = U.clamp(t.stamina + 12, 0, 100);
      t.morale = U.clamp(t.morale - 1.5, 0, 100);
      if (t.statusWeeks <= 0) { t.status = 'ok'; KP.log(t.name + ' is cleared to train again.', 'good'); }
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

    const skill = E.groupScore(members, conceptKey);
    const quality = U.clamp(.46 * skill + .32 * prod.q + .22 * cho.q + (studio - 1) * 1.6, 0, 100);
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

    const hype = U.clamp((visualPull * .42 + fanPull + repPull + promo.q + (mkt - 1) * 2.2 + g.momentum * .18)
      * (.85 + trend / 320) * fresh * fatigue * buzz, 0, 100);

    // First-ever release: nerves show on stage. Applied here, not at release time,
    // so the preview cannot promise a number the release then quietly undercuts.
    let debutMul = 1;
    if (g.releases.length === 0) members.forEach(m => { debutMul *= traitMul(m, 'debutPenalty'); });

    const points = U.clamp((quality * .58 + hype * .42) * debutMul, 3, 99);
    // The season is carried out with the preview so the planner never has to go
    // looking for it: what the release is walking into is part of the estimate.
    return {
      quality, hype, points, cost: E.planCost(sel), promo, trend, fatigue, gap, debutMul,
      season: KP.seasonOfAbs(abs)
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
    st.stats.releases++;

    // Physical sales land in release week — the fandom pre-ordered weeks ago.
    const units = Math.round(g.fans * (.10 + rel.hype / 700) + rel.hype * 150 * U.rnd(.8, 1.25));
    const rev = units * KP.income.albumUnit;
    rel.sales = units;
    rel.revenue += rev;              // the discography records gross, always
    E.earn(st, rev, 'album');
    const yba = E.ybAct(st, g);      // Album of the Year is decided here
    yba.sales += units;
    yba.revenue += rev;

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

    // Revenue and fans both key off chart points, not rank alone. The season's
    // audience rides on top of streaming only: the field decides where a song
    // ranks, the audience decides what that rank is worth. A lull pays 86% of an
    // award-season week for the identical chart position.
    const streamRev = Math.pow(rel.points, 1.6) * KP.income.streamPerPoint * KP.seasonNow(st).audience;
    E.earn(st, streamRev, 'stream');
    rel.revenue += streamRev;
    E.ybAct(st, g).revenue += streamRev;

    let fanMul = 1;
    KP.memberOf(st, g).forEach(m => { fanMul *= traitMul(m, 'fans'); });
    const gained = fanGain(g,
      Math.pow(rel.points, 1.5) * 70 * (1 + st.company.rep / 400) * fanMul * U.rnd(.85, 1.15));
    g.fans += gained;
    rel.fansGained += gained;
    E.ybAct(st, g).fans += gained;

    if (rank === 1) {
      rel.wins++;
      st.stats.wins++;
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
      if (rel.peak === 1) st.stats.no1++;
      g.momentum = U.clamp(g.momentum + (rel.peak <= 3 ? 18 : rel.peak <= 10 ? 8 : -6), 0, 100);
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
    return KP.memberOf(st, g).filter(m => m.status !== 'injured');
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
  E.livePreview = function (st, g, venueKey, absWeek) {
    const v = KP.venue(venueKey);
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

    const expected = g.fans * v.pull * promo * heat * stand * stale * season.audience;
    const lo = Math.min(v.cap, Math.round(expected * L.rollLo));
    const hi = Math.min(v.cap, Math.round(expected * L.rollHi));
    const breakEven = Math.ceil(v.cost / v.ticket);
    return {
      v, show: v, kind: 'live', cast, season, expected, cap: v.cap, lo, hi,
      grossLo: lo * v.ticket, grossHi: hi * v.ticket,
      cost: v.cost, breakEven,
      fillLo: lo / v.cap, fillHi: hi / v.cap,
      safe: lo >= breakEven, doomed: hi < breakEven,
      exposed: cast.filter(m => m.stamina - v.stamina < B.injuryFloor).length,
      mods: { promo, heat, stand, stale, audience: season.audience }
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
    if (kind === 'live') return E.livePreview(st, g, showKey, absWeek);
    const show = KP.show(kind, showKey);
    if (!show) return null;
    const B = KP.bookings;
    const cast = presentMembers(st, g);
    const rawFans = g.fans * show.fansPct + show.fansFlat;
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
      const t = castTalker(cast);
      pv.talker = t;
      pv.score = t ? E.varietyScore(t) : 0;
      pv.edge = (pv.score - show.need) / B.needScale;
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
    if (absWeek <= now) return 'That week has already been played.';
    if (absWeek - now > KP.bookings.weeksAhead) {
      return 'Nothing books more than ' + KP.bookings.weeksAhead + ' weeks out.';
    }
    // Injuries heal — a group with nobody in it at all does not.
    if (!KP.memberOf(st, g).length) return 'There is nobody left in that group.';
    if (KP.standing(st) < show.rep) return 'Needs standing ' + show.rep + '.';
    if (g.fans < show.fans) return 'Needs ' + U.num(show.fans) + ' fans.';
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
    } else if (kind === 'live') {
      const L = KP.live;
      // Two rules, and they measure different things: `gap` is how often a group
      // can be put on a stage of its own at all, `cooldown` is how quickly the
      // same tier can be sold to the same fandom twice.
      const played = Object.keys(g.liveAbs || {}).reduce((mx, k) => Math.max(mx, g.liveAbs[k]), 0);
      if (played && absWeek - played < L.gap) {
        return 'Needs ' + L.gap + ' weeks between shows.';
      }
      if (KP.bookingsFor(st, g.id, null).some(b => b.kind === 'live'
        && Math.abs(b.absWeek - absWeek) < L.gap)) {
        return 'Too close to another booked show.';
      }
      const last = (g.liveAbs || {})[showKey];
      if (last != null && absWeek - last < show.cooldown) {
        const rest = show.cooldown - (absWeek - last);
        return rest + ' week' + (rest === 1 ? '' : 's') + ' of rest before another ' + show.name + '.';
      }
    }
    // Venues have no bill to share: a hall you have paid for is yours.
    if (kind !== 'live' && KP.slotsOpen(st, kind, showKey, absWeek) <= 0) {
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
    // and it is prepaid on exactly the same terms.
    const live = kind === 'live';
    const fee = live ? show.cost : show.fee;
    if (st.company.money < fee) {
      return { ok: false, msg: (live ? 'Production costs ' : 'Appearance fees cost ') + U.money(fee) + '.' };
    }
    st.company.money -= fee;
    const b = { id: U.uid('bk'), kind, show: showKey, groupId, absWeek: abs, fee };
    st.bookings.push(b);
    KP.log(g.name + (live ? ' will play ' : ' is booked on ') + show.name + ' in week ' +
      weekLabel(st, abs) + ' · ' + U.money(fee) + '.', 'info');
    return { ok: true, booking: b };
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
    // Inside the notice window the slot has already been printed in a schedule
    // somebody else is holding: no refund, and the broadcaster remembers.
    const late = b.absWeek - KP.absWeek(st) <= B.lateWeeks;
    const back = late ? 0 : Math.round(b.fee * B.cancelBack);
    st.bookings.splice(i, 1);
    st.company.money += back;
    if (late) st.company.rep = U.clamp(st.company.rep - B.cancelRep, 0, 100);
    KP.log(late
      ? 'Pulled out of ' + spec.name + ' at short notice — the fee is gone and so is some goodwill.'
      : 'Cancelled ' + spec.name + ' · ' + U.money(back) + ' of the fee recovered.', late ? 'bad' : 'info');
    return { ok: true, back, late };
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
    const gained = fanGain(g, g.fans * show.fansPct + show.fansFlat);
    g.fans += gained;
    st.company.rep = U.clamp(st.company.rep + show.repGain, 0, 100);
    g.momentum = U.clamp(g.momentum + show.momentum, 0, 100);
    cast.forEach(m => { m.morale = U.clamp(m.morale + show.morale, 0, 100); });
    payStamina(st, cast, show.stamina);
    g.stagesY++;
    st.stats.stages++;
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

    const talker = castTalker(cast);
    const grade = E.grade((E.varietyScore(talker) - show.need) / KP.bookings.needScale);
    const gained = fanGain(g, (g.fans * show.fansPct + show.fansFlat) * grade.fans);
    g.fans += gained;
    st.company.rep = U.clamp(st.company.rep + show.repGain * grade.rep, 0, 100);
    g.momentum = U.clamp(g.momentum + show.momentum * grade.momentum, 0, 100);
    // A booking is also a lesson: the whole cast picks up variety, which is the
    // only way a group of stiff dancers ever gets to be funny.
    cast.forEach(m => {
      m.stats.variety = Math.min(m.potential.variety, m.stats.variety + U.rnd(show.train * .45, show.train));
      m.morale = U.clamp(m.morale + (grade.k === 'flat' ? KP.bookings.flatMorale : show.morale), 0, 100);
    });
    payStamina(st, cast, show.stamina);
    g.varietyY++;
    st.stats.varietyShows++;
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
    const v = KP.venue(b.show);
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
    const pv = E.livePreview(st, g, b.show, b.absWeek);
    const sold = Math.min(v.cap, Math.max(0, Math.round(pv.expected * U.rnd(L.rollLo, L.rollHi))));
    const gross = sold * v.ticket;
    const fill = sold / v.cap;
    const ratio = v.cost > 0 ? gross / v.cost : 2;

    // Graded against break-even rather than against a raw fill percentage, so a
    // full fan meeting and a full dome read the same way to the player.
    const grade = ratio >= L.gradeTriumph ? 'triumph' : ratio >= L.gradeStrong ? 'strong'
      : ratio >= L.gradeOk ? 'ok' : 'undersold';

    E.earn(st, gross, 'live');
    const gained = Math.round(sold * L.newFanRate[grade]);
    g.fans += gained;
    g.liveAbs = g.liveAbs || {};
    g.liveAbs[v.k] = b.absWeek;
    g.livesY++;
    g.ticketsY += sold;
    st.stats.lives++;
    st.stats.tickets += sold;
    const yba = E.ybAct(st, g);
    yba.tickets += sold;
    yba.fans += gained;

    st.company.rep = U.clamp(st.company.rep + v.repGain * L.repMul[grade], 0, 100);
    g.momentum = U.clamp(g.momentum + L.momentum[grade], 0, 100);
    cast.forEach(m => {
      m.morale = U.clamp(m.morale + (grade === 'undersold' ? L.undersoldMorale : v.morale), 0, 100);
    });
    payStamina(st, cast, v.stamina);

    const soldOut = fill >= L.soldOutAt;
    const text = g.name + ' played ' + v.name + ' · ' + U.num(sold) + '/' + U.num(v.cap) +
      ' seats · ' + U.money(gross) + (soldOut ? ' · SOLD OUT' : '');
    KP.log(text + (grade === 'undersold' ? ' — the empty seats were photographed.' : '.'),
      grade === 'undersold' ? 'bad' : soldOut ? 'big' : 'good');
    pushRecap(st, grade === 'undersold' ? '🪑' : soldOut ? '🎇' : '🎫', text,
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
      else if (b.kind === 'live') resolveLive(st, g, b);
    });
  };

  /* Everything that is counted per calendar year rather than per run. Called at
     the rollover, and the only place these counters are cleared. `g.liveAbs` is
     deliberately not among them: a cooldown is measured in absolute weeks and
     does not care that the calendar turned over in the middle of it.
     E.runAwards must have already read the yearbook by the time this runs. */
  E.rollYear = function (st) {
    st.groups.forEach(g => { g.stagesY = 0; g.varietyY = 0; g.livesY = 0; g.ticketsY = 0; });
    st.yearbook = { y: st.year, acts: {}, songs: {} };
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
        // the song's quality is still reachable from a chart row.
        if (r.mine) {
          const g = st.groups.find(x => x.id === r.groupId);
          if (g && g.active && g.active.title === r.title) s.quality = g.active.quality;
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
    const ours = acts.filter(a => a.mine);
    const ourCp = ours.reduce((s, a) => s + a.cp, 0);
    const per = (total, floor) =>
      Math.max(floor, ourCp > 0 ? total / ourCp * A.rivalRateShare : 0);
    const salesPerCp = per(ours.reduce((s, a) => s + a.sales, 0), A.rivalSalesPerPoint);
    const fansPerCp = per(ours.reduce((s, a) => s + a.fans, 0), A.rivalFansPerPoint);
    const popPerCp = per(ours.reduce((s, a) => {
      const g = a.groupId ? st.groups.find(x => x.id === a.groupId) : null;
      return s + (g ? g.fans : a.fans);
    }, 0), A.rivalFansPerPoint * A.rivalPopMul);

    acts.forEach(a => {
      const g = a.mine && a.groupId ? st.groups.find(x => x.id === a.groupId) : null;
      a._sales = a.mine ? a.sales : Math.round(a.cp * salesPerCp);
      a._fans = a.mine ? a.fans : Math.round(a.cp * fansPerCp);
      a._pop = a.mine ? (g ? g.fans : a.fans) : Math.round(a.cp * popPerCp);
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
      // Rookie eligibility is a one-shot window: the year you first charted.
      else if (p.pool === 'rookies') pool = acts.filter(a => a.debutY === year)
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
    g.fans += fanGain(g, g.fans * p.fansPct);
    g.momentum = U.clamp(g.momentum + p.momentum, 0, 100);
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
        const boost = fanGain(g, g.fans * U.rnd(.05, .14) + 4000 * traitMul(m, 'viral'));
        g.fans += boost;
        g.momentum = U.clamp(g.momentum + 7, 0, 100);
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
    {
      k: 'dating', p: .05, need: st => st.groups.some(g => g.fans > 40000),
      run(st) {
        const g = U.pick(st.groups.filter(x => x.fans > 40000));
        const m = U.pick(KP.memberOf(st, g));
        const lost = Math.round(g.fans * U.rnd(.03, .09));
        g.fans = Math.max(0, g.fans - lost);
        g.momentum = U.clamp(g.momentum - 10, 0, 100);
        if (m) m.morale = U.clamp(m.morale - 14, 0, 100);
        return { ic: '📰', text: 'Dating rumour about ' + (m ? m.name : g.name) + ' — −' + U.num(lost) + ' fans', kind: 'bad' };
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
      k: 'conflict', p: .06, need: st => st.groups.some(g => KP.memberOf(st, g).length >= 3),
      run(st) {
        const g = U.pick(st.groups.filter(x => KP.memberOf(st, x).length >= 3));
        KP.memberOf(st, g).forEach(m => { m.morale = U.clamp(m.morale - U.rnd(6, 14), 0, 100); });
        return { ic: '⚡', text: 'Tension inside ' + g.name + ' — morale dropped', kind: 'bad' };
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
          // They walk. Contracts don't hold people who stopped believing.
          const wasIdol = !!t.groupId;
          let disbanded = null;
          if (wasIdol) {
            const g = st.groups.find(x => x.id === t.groupId);
            if (g) {
              g.memberIds = g.memberIds.filter(id => id !== t.id);
              // A group with nobody left cannot promote, chart or be scored.
              if (!g.memberIds.length) {
                g.active = null;
                st.groups = st.groups.filter(x => x.id !== g.id);
                // Pulling their row out of the published chart leaves a hole in
                // the numbering, and the Chart tab prints r.rank straight out —
                // so the ladder would read #5, #6, #8 with nothing to explain the
                // missing rung. Everyone below the withdrawn song moves up one.
                st.chart = (st.chart || []).filter(r => r.groupId !== g.id);
                st.chart.forEach((r, i) => { r.rank = i + 1; });
                // Their diary goes with them. The fees do not come back.
                st.bookings = (st.bookings || []).filter(b => b.groupId !== g.id);
                disbanded = g.name;
              }
            }
          }
          st.trainees = st.trainees.filter(x => x.id !== t.id);
          st.company.rep = U.clamp(st.company.rep - (wasIdol ? 5 : 1), 0, 100);
          if (disbanded) {
            KP.log(disbanded + ' has disbanded — nobody is left in the group.', 'bad');
            return { ic: '💔', text: disbanded + ' disbanded — the last member walked', kind: 'bad' };
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
    st.week++;
    if (st.week > KP.WEEKS_PER_YEAR) {
      st.week = 1;
      st.year++;
      st.calendarYear++;
      KP.log('— Year ' + st.year + ' begins —', 'big');
      // Judge the year that just ended, THEN wipe the book. Reversing these two
      // lines silently awards an empty year, every year.
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

    // 2b. Mood Makers lift the room, not just themselves — the trait's own promise.
    st.groups.forEach(g => {
      const mates = KP.memberOf(st, g);
      const lift = mates.reduce((s, m) => s + traitAdd(m, 'teamMorale'), 0);
      if (lift > 0) mates.forEach(m => { m.morale = U.clamp(m.morale + lift, 0, 100); });
    });

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
      E.earn(st, g.fans * KP.income.merchPerFan, 'merch');
    });

    // 4b. the rival groups read the same ranking, off the full chart rather than
    //     the twenty-five rows that get stored. Nothing here touches the books.
    E.rivalChartWeek(st, chart);

    // 5. books
    st.company.money -= KP.weeklyBurn(st);
    st.company.money += KP.weeklyMisc(st);

    // 5b. debt service. Strictly after step 5: the instalments are inside
    //     weeklyBurn, so this only amortises what was just paid — and judges
    //     whether it was paid with money that existed.
    E.serviceDebt(st);

    // 6. events
    runEvents(st);

    // 7. audition list refreshes on its own every 4 weeks — and somebody else
    //    gets the room's best hopeful on the way out, which is the point.
    if (KP.absWeek(st) - st.scoutRefreshedWeek >= 4) {
      E.rivalPoach(st);
      KP.refreshScouts();
    }

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
    return { ok: true };
  };

  E.assignPositions = function (st, members) {
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
    // The wizard's disabled state is one render stale — validate where it is authoritative.
    const name = String(opts.name || '').trim();
    if (!name) return { ok: false, msg: 'Your group needs a name.' };
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
      fans: Math.round(2200 + st.company.rep * 260 + E.groupScore(members, opts.concept) * 120),
      momentum: 22,
      releases: [],
      active: null,
      stagesY: 0,
      varietyY: 0,
      liveAbs: {},
      livesY: 0,
      ticketsY: 0,
      debut: { y: st.year, w: st.week }
    };
    members.forEach(m => { m.groupId = g.id; m.focus = 'dance'; });
    E.assignPositions(st, members);
    st.groups.push(g);
    st.company.rep = U.clamp(st.company.rep + 3, 0, 100);

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
