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

  /* ============================== the market =============================== */

  function ensureMarket(st) {
    if (st.market) return;
    st.market = [];
    for (let i = 0; i < 22; i++) st.market.push(newRivalSong(st, U.rnd(0, 6)));
  }

  function newRivalSong(st, agedWeeks) {
    const strong = U.chance(.16);
    const base = strong ? U.gauss(84, 7) : U.gauss(50, 16);
    const s = {
      artist: U.pick(KP.rivalArtists),
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
    const incoming = U.irnd(2, 4);
    for (let i = 0; i < incoming; i++) st.market.push(newRivalSong(st, 0));
  }

  /* Builds the full ranked table: rivals + every active release we own. */
  function buildChart(st) {
    const rows = st.market.map(s => ({ artist: s.artist, title: s.title, points: s.points, mine: false }));
    st.groups.forEach(g => {
      if (!g.active) return;
      rows.push({ artist: g.name, title: g.active.title, points: g.active.points, mine: true, groupId: g.id });
    });
    rows.sort((a, b) => b.points - a.points);
    rows.forEach((r, i) => r.rank = i + 1);
    return rows;
  }

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
    const repPull = st.company.rep * .22;

    // Comebacks stacked on top of each other wear the fandom out.
    const abs = st.week + (st.year - 1) * 52;
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
    return { quality, hype, points, cost: E.planCost(sel), promo, trend, fatigue, gap, debutMul };
  };

  E.releaseComeback = function (st, g, sel, conceptKey, title) {
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
      sel: Object.assign({}, sel)
    };
    rel.points = rel.basePoints;
    g.active = rel;
    g.lastReleaseAbs = st.week + (st.year - 1) * 52;
    st.stats.releases++;

    // Physical sales land in release week — the fandom pre-ordered weeks ago.
    const units = Math.round(g.fans * (.10 + rel.hype / 700) + rel.hype * 150 * U.rnd(.8, 1.25));
    const rev = units * KP.income.albumUnit;
    rel.sales = units;
    rel.revenue += rev;
    st.company.money += rev;

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

    // Revenue and fans both key off chart points, not rank alone.
    const streamRev = Math.pow(rel.points, 1.6) * KP.income.streamPerPoint;
    st.company.money += streamRev;
    rel.revenue += streamRev;

    let fanMul = 1;
    KP.memberOf(st, g).forEach(m => { fanMul *= traitMul(m, 'fans'); });
    const gained = Math.round(
      Math.pow(rel.points, 1.5) * 70 * (1 + st.company.rep / 400) * fanMul /
      (1 + g.fans / 8e5) * U.rnd(.85, 1.15)
    );
    g.fans += gained;
    rel.fansGained += gained;

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

  /* =============================== events ================================== */

  const EVENTS = [
    {
      k: 'fancam', p: .10, need: st => st.groups.some(g => g.fans > 3000),
      run(st) {
        const g = U.pick(st.groups.filter(x => x.fans > 3000));
        const m = U.pick(KP.memberOf(st, g));
        if (!m) return null;
        const boost = Math.round(g.fans * U.rnd(.05, .14) + 4000 * traitMul(m, 'viral'));
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
        st.company.money += fee;
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
                st.chart = (st.chart || []).filter(r => r.groupId !== g.id);
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
    {
      k: 'investor', p: .04, need: st => st.company.money < 300e6,
      run(st) {
        const amt = Math.round(150e6 + st.company.rep * 6e6);
        st.company.money += amt;
        st.company.rep = U.clamp(st.company.rep - 2, 0, 100);
        return { ic: '🏦', text: 'Emergency investor injection · ' + U.money(amt) + ' (reputation cost)', kind: '' };
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

    st.recap = [];
    st.week++;
    if (st.week > 52) { st.week = 1; st.year++; st.calendarYear++; KP.log('— Year ' + st.year + ' begins —', 'big'); }

    // 1. concept trends drift; the market gets bored on its own schedule
    KP.concepts.forEach(c => {
      st.trends[c.k] = U.clamp(st.trends[c.k] + U.gauss(0, 4.2), 5, 98);
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
    const chart = buildChart(st);
    st.chart = chart.slice(0, 25);

    // 4. groups
    st.groups.forEach(g => {
      if (g.active) {
        promoWeek(st, g, chart);
      } else {
        g.fans = Math.round(g.fans * .996);
        g.momentum = U.clamp(g.momentum - 1.6, 0, 100);
      }
      st.company.money += g.fans * KP.income.merchPerFan;
    });

    // 5. books
    st.company.money -= KP.weeklyBurn(st);
    st.company.money += KP.weeklyMisc(st);

    // 6. events
    runEvents(st);

    // 7. audition list refreshes on its own every 4 weeks
    const abs = st.week + (st.year - 1) * 52;
    if (abs - st.scoutRefreshedWeek >= 4) KP.refreshScouts();

    // 8. fail state
    if (st.company.money < KP.costs.bankruptcyFloor) {
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
    const cost = kind === 'fac' ? lvl * 260e6 : lvl * 175e6;
    if (st.company.money < cost) return { ok: false, msg: 'Costs ' + U.money(cost) + '.' };
    st.company.money -= cost;
    target[key] = lvl + 1;
    KP.log('Upgraded ' + key + ' to level ' + (lvl + 1) + ' for ' + U.money(cost) + '.', 'good');
    return { ok: true };
  };

  E.upgradeCost = function (st, kind, key) {
    const lvl = (kind === 'fac' ? st.company.facilities : st.company.staff)[key];
    return lvl >= 5 ? null : (kind === 'fac' ? lvl * 260e6 : lvl * 175e6);
  };

  /* Scaling back. You get 40% of what the level cost — enough to be a real
     escape hatch when the books are bleeding, never enough to farm. */
  E.REFUND = .4;

  E.refundValue = function (st, kind, key) {
    const lvl = (kind === 'fac' ? st.company.facilities : st.company.staff)[key];
    if (lvl <= 1) return null;                       // level 1 is the floor: a room, one coach
    const paid = kind === 'fac' ? (lvl - 1) * 260e6 : (lvl - 1) * 175e6;
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
