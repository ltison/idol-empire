/* =============================================================================
   IDOL EMPIRE — rendering
   Every screen is a pure function of state; interaction goes through data-act.
   ============================================================================= */
(function () {
  const U = KP.util;
  const ui = KP.ui = {};
  const $ = (s) => document.querySelector(s);

  ui.tab = 'dash';

  /* ============================== components =============================== */

  function avatar(t, cls) {
    const h = U.hue(t.id);
    const bg = `linear-gradient(135deg, hsl(${h} 90% 66%), hsl(${(h + 58) % 360} 88% 58%))`;
    const initial = U.esc(t.name.trim()[0] || '?');
    const src = KP.faces.src(t.face);
    // The portrait is a background layer over the gradient, not an <img>, because
    // ui.render() replaces #stage wholesale on every click: a fresh <img> node
    // each redraw re-decodes and flashes, a repainted background does not. The
    // gradient stays underneath as the fallback for an empty pool and as the
    // placeholder while the file loads, so a missing portrait degrades to the
    // monogram this game shipped with rather than to a hole.
    // url() goes unquoted: the attribute is delimited by double quotes, so a
    // quoted url() inside it would close the attribute early and cost the tile
    // both its photo and its gradient. The path is built from a bucket letter
    // and an integer, so it needs no quoting to survive.
    return `<div class="ava ${src ? 'ava-photo ' : ''}${cls || ''}" ` +
      `style="background-image:${src ? `url(${src}),` : ''}${bg}">${
      src ? '' : initial}<span class="ava-flag">${t.flag}</span></div>`;
  }

  function statRows(t) {
    return KP.STATS.map(s => {
      const v = t.stats[s.k], p = t.potential[s.k];
      return `<div class="stat">
        <b>${s.label.slice(0, 3)}</b>
        <div class="bar"><u style="width:${v}%"></u><s style="left:${p}%"></s></div>
        <i>${Math.round(v)}</i>
      </div>`;
    }).join('');
  }

  function traitChips(t) {
    return t.traits.map(k => {
      const tr = KP.trait(k);
      if (!tr) return '';
      return `<span class="trait ${tr.bad ? 'bad' : ''}" title="${U.esc(tr.desc)}">${U.esc(tr.name)}</span>`;
    }).join('');
  }

  const FOCI = [
    { k: 'vocal', l: 'VOC' }, { k: 'dance', l: 'DAN' }, { k: 'rap', l: 'RAP' },
    { k: 'visual', l: 'VIS' }, { k: 'charisma', l: 'STG' }, { k: 'variety', l: 'VAR' },
    { k: 'rest', l: 'REST' }
  ];

  function focusGrid(t) {
    return `<div class="focus-grid">` + FOCI.map(f =>
      `<button class="focus-btn ${f.k === 'rest' ? 'rest' : ''} ${t.focus === f.k ? 'is-on' : ''}"
        data-act="focus" data-id="${t.id}" data-key="${f.k}">${f.l}</button>`).join('') + `</div>`;
  }

  function vitals(t) {
    return `<div class="vitals">
      <div class="vital">
        <span>Stamina<i>${Math.round(t.stamina)}</i></span>
        <div class="bar thin warm"><u style="width:${t.stamina}%"></u></div>
      </div>
      <div class="vital">
        <span>Morale<i>${Math.round(t.morale)}</i></span>
        <div class="bar thin life"><u style="width:${t.morale}%"></u></div>
      </div>
    </div>`;
  }

  function idolCard(t, mode) {
    const st = KP.state;
    const ovr = KP.overall(t), pot = KP.potentialOverall(t);
    const injured = t.status === 'injured';
    const group = t.groupId ? st.groups.find(g => g.id === t.groupId) : null;

    let footer = '';
    if (mode === 'trainee') {
      footer = injured
        ? `<div class="chip hot">Injured · ${t.statusWeeks}w left</div>`
        : group
          ? `<div class="row"><span class="chip cool">${U.esc(group.name)}</span><span class="chip">${U.esc(t.position || '')}</span></div>${focusGrid(t)}`
          : focusGrid(t) + `<div class="row" style="margin-top:8px"><span class="spacer"></span>
              <button class="btn btn-sm btn-cut" data-act="release" data-id="${t.id}"
                title="Tear up the contract — no refund">Release</button></div>`;
    } else if (mode === 'scout') {
      footer = `<div class="row">
        <button class="btn btn-sm btn-primary" data-act="sign" data-id="${t.id}">Sign · ${U.money(t.signCost)}</button>
        <span class="tiny muted">est. ceiling ${pot}</span>
      </div>`;
    }

    return `<article class="card idol">
      <div class="idol-top">
        ${avatar(t)}
        <div>
          <div class="idol-name">${U.esc(t.name)}</div>
          <div class="idol-kr">${U.esc(t.kr)}</div>
          <div class="idol-meta">${t.age}y · ${U.esc(KP.nations.find(n => n.c === t.nation).name)}</div>
        </div>
        <div class="idol-ovr"><b>${ovr}</b><span>ceiling ${pot}</span></div>
      </div>
      <div>${statRows(t)}</div>
      ${vitals(t)}
      <div class="row">
        ${t.stamina < 20 && t.status !== 'injured' ? '<span class="chip hot">Exhausted — rest them</span>' : ''}
        ${traitChips(t)}
      </div>
      ${footer}
    </article>`;
  }

  /* the signature element — a fandom rendered as a lightstick ocean */
  function ocean(fans, color) {
    const dots = U.clamp(Math.round(Math.sqrt(fans) / 12), 0, 150);
    return `<div class="ocean" style="--accent:${color}">
      ${'<i></i>'.repeat(dots)}
      ${dots === 0 ? '<span class="tiny muted">No ocean yet. Nobody is holding a lightstick for you.</span>' : ''}
    </div>
    <div class="ocean-scale">1 light ≈ ${U.num(dots ? fans / dots : 0)} fans</div>`;
  }

  /* Where the money comes from and where it goes, one line each. */
  function ledger(st) {
    const L = KP.ledger(st);
    const rows = [
      ['in', 'Merch & goods', L.in.merch, U.num(KP.totalFans(st)) + ' fans × ₩' + KP.income.merchPerFan],
      ['in', 'Session work & extras', L.in.side, 'base + standing'],
      ['out', 'Trainees', L.out.trainees, st.trainees.filter(t => !t.groupId).length + ' unsigned to a group'],
      ['out', 'Idol pay', L.out.idols, 'scales with fame'],
      ['out', 'Facilities', L.out.facilities, 'practice · studio · dorm'],
      ['out', 'Staff', L.out.staff, 'coaches · producer · marketing'],
      ['out', 'Promotion', L.out.promo, 'active campaigns'],
      ['out', 'Debt service', L.out.debt, 'principal + interest'],
      // Not billed here — E.earn already took it. Shown because a line the
      // player cannot see is a line that lies.
      // ...and the note says merch rather than "the top line" because that is
      // what the amount is: the ledger models the recurring week, and album,
      // stream and gate money are episodic and not in it either.
      ['out', 'Investor share', L.share, Math.round(L.shareRate * 100) + '% of the merch line']
    ].filter(r => r[2] > 0);

    return `<div class="ledger">
      ${rows.map(([dir, label, amt, note]) => `<div class="led-row">
        <span class="led-label">${label}<i>${note}</i></span>
        <b class="${dir === 'in' ? 'pos' : 'neg'}">${dir === 'in' ? '+' : '−'}${U.money(amt).replace('−', '')}</b>
      </div>`).join('')}
      <div class="led-row led-net">
        <span class="led-label">Net per week</span>
        <b class="${L.net >= 0 ? 'pos' : 'neg'}">${L.net >= 0 ? '+' : ''}${U.money(L.net)}</b>
      </div>
    </div>`;
  }

  /* Borrowed money, and what it is doing to the books. Deliberately unglamorous:
     no gold, no primary button, no bar that fills up like an achievement. */
  function financeCard(st) {
    const F = KP.finance;
    const L = KP.ledger(st);
    const debts = st.company.debts;
    const owed = KP.debtOutstanding(st);
    const limit = KP.creditLimit(st);
    const full = debts.length >= F.maxFacilities;

    const rows = debts.length ? `<div class="ledger">${debts.map(d => {
      const note = d.missed
        ? d.missed + ' missed of ' + F.defaultAtMiss + ' · penalties added'
        : d.type === 'loan' ? U.money(d.weekly) + ' every week'
          : Math.round(d.share * 100) + '% of the top line · ' + U.money(d.paid) + ' taken';
      return `<div class="led-row">
        <span class="led-label">${U.esc(d.name)}<i class="${d.missed ? 'neg' : ''}">${d.weeksLeft}w left · ${note}</i></span>
        <button class="btn btn-sm" data-act="fin-clear" data-id="${d.id}"
          title="${d.type === 'loan' ? 'Settle it now — half the interest you have not been charged yet is forgiven'
        : 'Buy their share back at ' + F.buyoutMul + '× the principal, less what they have already taken'}">Clear
          · ${U.money(KP.engine.payoffCost(d))}</button>
      </div>`;
    }).join('')}</div>`
      : `<p class="tiny muted" style="margin:6px 0 0">Nothing owed. Every won in the building is yours.</p>`;

    return `<div class="card">
      <div class="sec-head"><h2>Finance</h2><span class="kr">자금</span>
        <p>${debts.length} of ${F.maxFacilities} facilities open</p></div>
      <div class="kv" style="margin-top:0">
        <div><b class="${owed > 0 ? 'neg' : ''}">${U.money(owed)}</b><span>Debt</span></div>
        <div><b class="${L.out.debt > 0 ? 'neg' : ''}">${U.money(L.out.debt)}</b><span>Weekly service</span></div>
        <div><b class="${L.shareRate > 0 ? 'neg' : ''}">${Math.round(L.shareRate * 100)}%</b><span>Investor share</span></div>
        <div><b class="pos">${U.money(KP.creditFree(st))}</b><span>Credit free</span></div>
      </div>
      <!-- calm, not the pink duotone: a line filling up is not an achievement -->
      <div class="bar calm"><u style="width:${Math.min(100, limit > 0 ? owed / limit * 100 : 0).toFixed(1)}%"></u></div>
      <p class="tiny muted" style="margin:8px 0 0">${U.money(owed)} drawn against a ${U.money(limit)} line —
        ${U.money(F.baseCredit)} to start with, then half the list price of every facility and staff level above base,
        ₩${F.fanCollateral} per fan and ${U.money(F.standingCollateral)} per point of standing.</p>
      ${rows}
      <div class="row" style="margin-top:14px">
        <button class="btn" data-act="open-finance" ${full ? 'disabled' : ''}>Raise money</button>
        <span class="tiny muted">${full
        ? 'No lender will be the third name on your books.'
        : 'A loan is cheap whether you win or lose. An investor is free if you fail and ruinous if you succeed.'}</span>
      </div>
    </div>`;
  }

  /* The year has a shape, so it gets a picture: six blocks sized by length, a
     needle on this week, and the numbers the season is currently pushing. */
  function seasonCard(st) {
    const s = KP.seasonNow(st);
    const left = s.w2 - st.week + 1;
    const next = KP.seasons[(KP.seasons.indexOf(s) + 1) % KP.seasons.length];
    const favours = s.favours.map(k => KP.concept(k).name).join(' · ');

    // The running ballot. The ceremony is a whole year away when you start
    // filling it in, so the numbers it will be read from are on the wall from
    // week one rather than announced on the night.
    const y = KP.yearTotals(st);
    const A = KP.awards;
    const board = !st.groups.length ? '' : `
      <span class="eyebrow" style="display:block;margin:18px 0 -4px">Year ${st.year} so far · what the ceremony reads</span>
      <div class="kv" style="margin-bottom:0">
        <div><b>${U.num(y.cp)}</b><span>Chart points</span></div>
        <div><b class="${y.no1 ? 'gold' : ''}">${y.no1}</b><span>Weeks at #1</span></div>
        <div><b>${U.num(y.sales)}</b><span>Albums sold</span></div>
        <div><b>${y.stages}</b><span>Stages</span></div>
        <div><b>${y.variety}</b><span>Variety</span></div>
        <div><b>${U.num(y.tickets)}</b><span>Tickets</span></div>
      </div>
      <p class="tiny muted" style="margin:10px 0 0">Chart points are rank-weighted over the top ${A.chartDepth}:
        a week at #1 is worth ${A.chartDepth}, a week at #${A.chartDepth} is worth 1, and ${A.minBallot} of them is the
        minimum to be on any ballot at all. Stages carry Best Performance, variety appearances carry Entertainer of the
        Year, and the daesang wants all of it plus the sales.</p>`;

    return `<div class="card">
      <div class="sec-head">
        <h2>${U.esc(s.name)}</h2><span class="kr">${U.esc(s.kr)}</span>
        <p>Week ${st.week} of ${KP.WEEKS_PER_YEAR} · ${left} week${left === 1 ? '' : 's'} of it left</p>
        <span class="spacer"></span>
        <span class="chip">Next · ${U.esc(next.name)} · W${next.w1}</span>
      </div>
      <p class="tiny muted" style="margin:-6px 0 12px">${U.esc(s.desc)}. The public wants ${U.esc(favours)}.</p>
      <div class="season-strip">
        ${KP.seasons.map(x => `<div class="season-seg ${x.k === s.k ? 'is-on' : ''}" style="flex:${x.w2 - x.w1 + 1}"
          title="W${x.w1}–W${x.w2} · ${U.esc(x.name)}"><b>${U.esc(x.kr)}</b></div>`).join('')}
        <i style="left:${((st.week - .5) / KP.WEEKS_PER_YEAR * 100).toFixed(2)}%"></i>
      </div>
      <div class="kv" style="margin-bottom:0">
        <div><b class="${s.field > 1 ? 'neg' : 'pos'}">×${s.field.toFixed(2)}</b><span>Rival strength</span></div>
        <div><b class="${s.audience < 1 ? 'neg' : 'pos'}">×${s.audience.toFixed(2)}</b><span>Audience</span></div>
        <div><b class="${s.slotBonus > 0 ? 'pos' : s.slotBonus < 0 ? 'neg' : ''}">${s.slotBonus > 0 ? '+' + s.slotBonus : s.slotBonus < 0 ? s.slotBonus : '—'}</b><span>Stage slots</span></div>
        <div><b>${KP.WEEKS_PER_YEAR - st.week}</b><span>Weeks to year end</span></div>
      </div>
      <p class="tiny muted" style="margin:12px 0 0">Rival strength is what it takes to chart; audience is a straight
        multiplier on streaming revenue; stage slots shift what the broadcasters have room for. The season that pays best
        is the season you are least likely to win — and the one with the fewest stages to book — while the dead weeks you
        can dominate are the weeks nobody is spending.</p>
      ${board}
    </div>`;
  }

  /* ================================ screens ================================ */

  function officeTab(st) {
    const c = st.company;
    // One derivation, read three ways. The investor share is not billed in step 5
    // but it does leave the building, so the displayed cost has to include it.
    const L = KP.ledger(st);
    const burn = L.totalOut + L.share;
    const misc = L.totalIn;
    const runway = L.net < 0 ? Math.floor((c.money - KP.costs.bankruptcyFloor) / -L.net) : 99;
    const active = st.groups.filter(g => g.active);

    const recap = st.recap.length
      ? st.recap.map(r => `<div class="recap-item ${r.kind}">
          <span class="ic">${r.ic}</span><span>${U.esc(r.text)}</span></div>`).join('')
      : `<div class="recap-empty">A quiet week. Training continued, bills were paid.</div>`;

    const promoCards = active.map(g => {
      const rel = g.active;
      const row = (st.chart || []).find(r => r.mine && r.groupId === g.id);
      const rank = row ? row.rank : '—';
      return `<div class="card group-card" style="--accent:${g.color}">
        <div class="eyebrow">Promoting · week ${rel.week}/${rel.promoWeeks}</div>
        <h3 style="font-size:19px;margin:6px 0 2px">${U.esc(rel.title)}</h3>
        <div class="group-kr">${U.esc(g.name)} · ${U.esc(KP.concept(rel.concept).name)}</div>
        <div class="kv">
          <div><b>${rank === 1 ? '🏆 #1' : '#' + rank}</b><span>This week</span></div>
          <div><b>#${rel.peak}</b><span>Peak</span></div>
          <div><b>${rel.wins}</b><span>Wins</span></div>
          <div><b>${U.num(rel.fansGained)}</b><span>New fans</span></div>
          <div><b>${U.money(rel.revenue)}</b><span>Earned</span></div>
        </div>
      </div>`;
    }).join('');

    const facRows = [
      ['fac', 'training', 'Practice rooms', 'Faster skill growth'],
      ['fac', 'studio', 'Recording studio', 'Better in-house production'],
      ['fac', 'dorm', 'Dormitory', 'Morale and stamina recovery'],
      ['staff', 'vocal', 'Vocal coach', 'Vocal & rap training'],
      ['staff', 'dance', 'Dance coach', 'Dance training'],
      ['staff', 'producer', 'A&R producer', 'Visual, stage, variety training'],
      ['staff', 'marketing', 'Marketing lead', 'Promotion reach']
    ].map(([kind, key, label, desc]) => {
      const lvl = (kind === 'fac' ? c.facilities : c.staff)[key];
      const cost = KP.engine.upgradeCost(st, kind, key);
      const back = KP.engine.refundValue(st, kind, key);
      const weekly = kind === 'fac' ? KP.costs.facilityWeek : KP.costs.staffWeek;
      return `<div class="opt">
        <div><b>${label} <span class="mono tiny muted">Lv${lvl}</span></b><small>${desc}</small></div>
        <div class="bar" style="width:70px"><u style="width:${lvl * 20}%"></u></div>
        <div class="opt-buys">
          ${back == null ? '' : `<button class="btn btn-sm btn-cut" data-act="downgrade"
            data-kind="${kind}" data-key="${key}"
            title="Drop to Lv${lvl - 1}: +${U.money(back)} now, ${U.money(weekly)} less every week">−Lv</button>`}
          ${cost == null
            ? `<span class="chip win">MAX</span>`
            : `<button class="btn btn-sm" data-act="upgrade" data-kind="${kind}" data-key="${key}">${U.money(cost)}</button>`}
        </div>
      </div>`;
    }).join('');

    const favours = KP.seasonNow(st).favours;
    const trendRows = KP.concepts.slice()
      .sort((a, b) => st.trends[b.k] - st.trends[a.k]).slice(0, 5)
      .map(cc => `<div class="trend">
        <span class="nm">${cc.name}<em>${cc.kr}</em>${favours.indexOf(cc.k) >= 0
        ? '<span class="chip cool" style="margin-left:7px">in season</span>' : ''}</span>
        <i>${Math.round(st.trends[cc.k])}</i>
        <div class="bar calm"><u style="width:${st.trends[cc.k]}%"></u></div>
      </div>`).join('');

    return `
    <div class="dash-hero">
      <div class="kr">${st.calendarYear}년 ${st.week}주차 · ${U.esc(KP.seasonNow(st).kr)}</div>
      <h2>Year ${st.year}, Week ${st.week}</h2>
      <p class="muted" style="margin:8px 0 0">${U.esc(c.ceo)} · ${U.esc(c.name)} · ${KP.difficulties[c.difficulty].label} run</p>
      <div class="recap" style="margin-top:16px">${recap}</div>
    </div>

    <div style="margin-top:16px">${seasonCard(st)}</div>

    ${promoCards ? `<div class="grid g-2" style="margin-top:16px">${promoCards}</div>` : ''}

    <div class="grid g-2" style="margin-top:16px">
      <div class="card">
        <div class="sec-head"><h2>Books</h2><span class="kr">재무</span></div>
        <div class="kv">
          <div><b class="${c.money < 0 ? 'neg' : ''}">${U.money(c.money)}</b><span>Cash</span></div>
          <div><b class="neg">${U.money(burn)}</b><span>Weekly costs</span></div>
          <div><b class="pos">${U.money(misc)}</b><span>Weekly income</span></div>
          <div><b class="${runway < 8 ? 'neg' : ''}">${runway > 90 ? '∞' : runway + 'w'}</b><span>Runway</span></div>
          <div><b>${Math.round(c.rep)}</b><span>Reputation</span></div>
          ${c.prestige ? `<div><b>${Math.round(KP.standing(st))}</b><span>Standing</span></div>` : ''}
        </div>
        <div class="bar" style="margin-top:6px"><u style="width:${c.rep}%"></u></div>
        ${ledger(st)}
        <p class="tiny muted" style="margin:10px 0 0">Runway ignores release revenue — a comeback is how you actually get paid.
          ${c.prestige
        ? 'Standing is reputation plus the ' + c.prestige + ' prestige your trophies left behind, and standing is what every gate reads.'
        : 'Reputation unlocks star producers and better auditions; trophies add permanent prestige on top of it.'}</p>
      </div>

      <div class="card">
        <div class="sec-head"><h2>Fandom</h2><span class="kr">팬덤</span></div>
        ${ocean(KP.totalFans(st), st.groups.length ? st.groups[0].color : '#B78CFF')}
        <div class="kv" style="margin-bottom:0">
          <div><b>${U.num(KP.totalFans(st))}</b><span>Total fans</span></div>
          <div><b>${st.stats.releases}</b><span>Releases</span></div>
          <div><b class="gold">${st.stats.wins}</b><span>Show wins</span></div>
        </div>
      </div>
    </div>

    <div class="grid g-2" style="margin-top:16px">
      <div class="card">
        <div class="sec-head"><h2>Build out</h2><span class="kr">투자</span></div>
        <div class="opt-list">${facRows}</div>
      </div>
      ${financeCard(st)}
    </div>

    <div style="margin-top:16px">
      <div class="card">
        <div class="sec-head"><h2>What's trending</h2><span class="kr">트렌드</span></div>
        <p class="tiny muted" style="margin:-6px 0 12px">Concepts the public is hungry for right now. Riding a trend raises hype; repeating your own last concept lowers it. The season pulls its own concepts up and lets the rest settle back.</p>
        ${trendRows}
      </div>
    </div>`;
  }

  function traineesTab(st) {
    const undebuted = st.trainees.filter(t => !t.groupId);
    const debuted = st.trainees.filter(t => t.groupId);
    const ready = undebuted.filter(t => KP.overall(t) >= 30).length;

    const head = `<div class="sec-head">
      <h2>Trainees</h2><span class="kr">연습생</span>
      <p>${undebuted.length} in training · ${ready} debut-ready</p>
      <span class="spacer"></span>
      <button class="btn btn-primary" data-act="open-debut" ${undebuted.length < 3 ? 'disabled' : ''}>Form a group</button>
    </div>`;

    if (!st.trainees.length) {
      return head + `<div class="empty"><b>Nobody in the building</b>Head to Scouting and sign your first trainee.</div>`;
    }

    return head +
      `<div class="grid g-3">${undebuted.map(t => idolCard(t, 'trainee')).join('')}</div>` +
      (debuted.length ? `<div class="sec-head" style="margin-top:28px"><h2>Debuted idols</h2><span class="kr">아이돌</span>
        <p>Still training between schedules</p></div>
        <div class="grid g-3">${debuted.map(t => idolCard(t, 'trainee')).join('')}</div>` : '');
  }

  function scoutTab(st) {
    const head = `<div class="sec-head">
      <h2>Auditions</h2><span class="kr">오디션</span>
      <p>Standing ${Math.round(KP.standing(st))} (reputation ${Math.round(st.company.rep)}) — better applicants show up as you grow</p>
      <span class="spacer"></span>
      <button class="btn" data-act="refresh-scouts">New round · ${U.money(KP.costs.scoutRefresh)}</button>
    </div>`;
    if (!st.scoutPool.length) return head + `<div class="empty"><b>Room's empty</b>Call a new audition round.</div>`;
    return head + `<div class="grid g-3">${st.scoutPool.map(t => idolCard(t, 'scout')).join('')}</div>`;
  }

  function groupsTab(st) {
    const head = `<div class="sec-head">
      <h2>Groups</h2><span class="kr">그룹</span>
      <p>${st.groups.length} active</p>
      <span class="spacer"></span>
      <button class="btn btn-primary" data-act="open-debut">Form a group</button>
    </div>`;

    if (!st.groups.length) {
      return head + `<div class="empty"><b>No group yet</b>Three trainees and a showcase budget is all it takes.</div>`;
    }

    const cards = st.groups.map(g => {
      const members = KP.memberOf(st, g);
      const strip = members.map(m => `<div class="member">
        ${avatar(m)}<em>${U.esc(m.name.split(' ')[0])}</em><i>${U.esc((m.position || '').replace('Main ', ''))}</i>
      </div>`).join('');

      const disc = g.releases.length ? `<div class="disc">${g.releases.slice(0, 5).map(r =>
        `<div class="disc-row">
          <span class="pk ${r.peak === 1 ? 'gold' : ''}">#${r.peak}</span>
          <span>${U.esc(r.title)}</span>
          <span class="mono tiny muted">${U.num(r.sales)} sold</span>
          <span class="mono tiny ${r.wins ? 'gold' : 'muted'}">${r.wins}🏆</span>
        </div>`).join('')}</div>` : `<p class="tiny muted">No releases yet.</p>`;

      return `<article class="card group-card" style="--accent:${g.color}">
        <div class="group-head">
          <div>
            <div class="group-name">${U.esc(g.name)}</div>
            <div class="group-kr">${g.kr ? U.esc(g.kr) + ' · ' : ''}${U.esc(KP.concept(g.concept).name)}</div>
            <div class="idol-meta">Debut Y${g.debut.y} W${g.debut.w} · fandom ${U.esc(g.fandom)}</div>
          </div>
          <span class="spacer"></span>
          ${g.active ? `<span class="chip hot">Promoting</span>` : `<span class="chip">Resting</span>`}
        </div>

        ${(g.trophies || []).length ? `<div class="row" style="margin-bottom:10px">${g.trophies.slice(0, 6).map(t =>
        `<span class="chip win" title="Year ${t.y} · ${U.esc(t.name)}">${U.esc(t.ic)} Y${t.y}</span>`).join('')}
        ${g.trophies.length > 6 ? `<span class="tiny muted">+${g.trophies.length - 6} more</span>` : ''}</div>` : ''}

        <div class="member-strip">${strip}</div>

        <div class="kv">
          <div><b>${U.num(g.fans)}</b><span>Fans</span></div>
          <div><b>${Math.round(g.momentum)}</b><span>Momentum</span></div>
          <div><b>${g.releases.length}</b><span>Releases</span></div>
          <div><b>${g.stagesY}</b><span>Stages this year</span></div>
          <div><b>${U.num(g.ticketsY)}</b><span>Tickets this year</span></div>
          <div><b class="gold">${g.releases.reduce((s, r) => s + r.wins, 0)}</b><span>Wins</span></div>
        </div>

        ${ocean(g.fans, g.color)}
        ${disc}

        <div class="row" style="margin-top:14px">
          <button class="btn btn-primary" data-act="open-comeback" data-id="${g.id}" ${g.active ? 'disabled' : ''}>
            ${g.releases.length ? 'Plan comeback' : 'Plan debut single'}
          </button>
          <button class="btn" data-act="open-booking" data-gid="${g.id}" data-abs="${KP.absWeek(st) + 1}">Book a schedule</button>
          ${g.active ? `<span class="tiny muted">Promotions end in ${g.active.promoWeeks - g.active.week} weeks</span>` : ''}
        </div>
      </article>`;
    }).join('');

    return head + `<div class="grid g-2">${cards}</div>`;
  }

  /* The week board. One card per upcoming week, one row per group, every booking
     a chip you can pull back out of — at a price, if the week is close. */
  function schedTab(st) {
    const B = KP.bookings;
    const now = KP.absWeek(st);
    const prepaid = st.bookings.reduce((s, b) => s + b.fee, 0);

    const head = `<div class="sec-head"><h2>Schedule</h2><span class="kr">스케줄</span>
      <p>${st.bookings.length} appearance${st.bookings.length === 1 ? '' : 's'} booked · ${B.weeksAhead} weeks ahead</p></div>`;

    if (!st.groups.length) {
      return head + `<div class="empty"><b>Nobody to book</b>Debut a group and the broadcasters will start taking your calls.</div>`;
    }

    // A live is booked against the fandom it will have on the night, and a group
    // can lose fans between the two. A show that has slipped under break-even
    // since it was paid for is the one thing on this board worth interrupting for.
    const lives = st.bookings.filter(b => b.kind === 'live').map(b => {
      const g = st.groups.find(x => x.id === b.groupId);
      return { b, g, pv: g ? KP.engine.livePreview(st, g, b.show, b.absWeek) : null };
    });
    const production = lives.reduce((s, x) => s + x.b.fee, 0);
    const doomed = lives.filter(x => x.pv && x.pv.doomed).map(x =>
      `<p class="tiny neg" style="margin:6px 0 0">⚠ ${U.esc(KP.engine.weekLabel(st, x.b.absWeek))}:
        ${U.esc(x.g.name)}'s fandom has slipped below break-even for the booked
        ${U.esc(x.pv.v.name)} — ${U.num(x.pv.hi)} seats at best against ${U.num(x.pv.breakEven)} needed.</p>`).join('');

    const summary = `<div class="card">
      <div class="kv" style="margin:0">
        <div><b class="${prepaid > 0 ? 'neg' : ''}">${U.money(prepaid)}</b><span>Prepaid</span></div>
        <div><b class="${production > 0 ? 'neg' : ''}">${U.money(production)}</b><span>Of it, production</span></div>
        <div><b>${st.bookings.length}</b><span>Booked</span></div>
        <div><b>${st.groups.reduce((s, g) => s + g.stagesY, 0)}</b><span>Stages this year</span></div>
        <div><b>${st.groups.reduce((s, g) => s + g.varietyY, 0)}</b><span>Variety this year</span></div>
        <div><b>${U.num(st.groups.reduce((s, g) => s + g.ticketsY, 0))}</b><span>Tickets this year</span></div>
      </div>
      <p class="tiny muted" style="margin:12px 0 0">Fees and production budgets are paid in full the moment you book, so a
        schedule never shows up in the weekly books. What it costs afterwards is stamina: ${B.injuryFloor} is the line below
        which an appearance starts breaking people, and a group booked solid cannot train. A live show is the only booking
        that pays you back, and the only one that can come in under what it cost.</p>
      ${doomed}
    </div>`;

    const weeks = [];
    for (let i = 1; i <= B.weeksAhead; i++) {
      const abs = now + i;
      const season = KP.seasonOfAbs(abs);
      const booked = KP.bookingsFor(st, null, abs);
      const rows = st.groups.map(g => {
        const mine = KP.bookingsFor(st, g.id, abs);
        const chips = mine.map(b => {
          const spec = KP.bookingSpec(b);
          const tone = b.kind === 'music' ? 'hot' : b.kind === 'variety' ? 'cool' : '';
          const late = abs - now <= B.lateWeeks;
          return `<span class="chip ${tone}">${U.esc(spec.name)}</span>
            <button class="btn btn-sm btn-cut" data-act="book-cancel" data-id="${b.id}"
              title="${late ? 'Too late for a refund — pulling out now costs reputation'
              : 'Cancel · ' + U.money(Math.round(b.fee * B.cancelBack)) + ' recovered'}">✕</button>`;
        }).join('');
        return `<div class="sw-row" style="--accent:${g.color}">
          <span class="sw-g" title="${U.esc(g.name)}">${U.esc(g.name)}</span>
          <div class="row">
            ${chips || '<span class="tiny muted">Nothing booked</span>'}
            <button class="btn btn-sm" data-act="open-booking" data-gid="${g.id}" data-abs="${abs}">Book</button>
          </div>
        </div>`;
      }).join('');

      // Somebody else's week, on the board you are filling in. A booked stage is
      // worth more against a thin chart, so the wall belongs next to the button.
      const wall = KP.rivalPlansIn(st, abs).map(({ r, g }) =>
        `<span class="chip hot" title="${U.esc(KP.rivalSpec(r).name)} · ${U.esc(KP.concept(g.plan.concept).name)} · ${U.esc(KP.engine.rivalWall(KP.engine.rivalStrength(st, r, g, abs)))}">⚔ ${U.esc(g.name)}</span>`).join('');

      weeks.push(`<div class="card sched-week" style="margin-bottom:10px">
        <div class="sw-head">
          <b class="mono">${U.esc(KP.engine.weekLabel(st, abs))}</b>
          <span class="chip">${U.esc(season.kr)} · ${U.esc(season.name)}</span>
          ${wall}
          <span class="spacer"></span>
          <span class="tiny muted">${booked.length
        ? booked.length + ' booked · ' + U.money(booked.reduce((s, b) => s + b.fee, 0)) + ' paid'
        : 'open'}</span>
        </div>
        ${rows}
      </div>`);
    }

    return head + summary + `<div style="margin-top:16px">${weeks.join('')}</div>`;
  }

  function chartTab(st) {
    const s = KP.seasonNow(st);
    const head = `<div class="sec-head"><h2>Weekly chart</h2><span class="kr">주간 차트</span>
      <p>Digital + physical combined, Y${st.year} W${st.week}</p>
      <span class="spacer"></span>
      <span class="chip ${s.field > 1 ? 'hot' : 'cool'}">${U.esc(s.name)} · rivals ×${s.field.toFixed(2)}</span></div>`;

    // Every ceremony the run has held, newest first. This is the only permanent
    // record of a chart year anywhere in the game, so it lives next to the chart.
    const hist = !st.awards.length ? '' : `<div class="sec-head" style="margin-top:28px">
      <h2>Year-end honours</h2><span class="kr">시상식</span>
      <p>${st.awards.length} year${st.awards.length === 1 ? '' : 's'} on record</p></div>
      ${st.awards.map(a => `<div class="card" style="margin-bottom:10px">
        <div class="eyebrow">Year ${a.y}${a.calendarYear ? ' · ' + a.calendarYear : ''}</div>
        <div class="disc" style="margin-top:8px">${a.results.map(r => `<div class="disc-row">
          <span class="pk ${r.mine ? 'gold' : ''}">${U.esc(r.ic)}</span>
          <span>${U.esc(r.winner)}${r.by ? ' <span class="muted">— ' + U.esc(r.by) + '</span>' : ''}</span>
          <span class="mono tiny muted">${U.esc(r.name)}</span>
          <span class="mono tiny ${r.mine ? 'gold' : 'muted'}">${r.mine ? 'YOURS' : ''}</span>
        </div>`).join('')}</div></div>`).join('')}`;

    if (!st.chart || !st.chart.length) {
      return head + `<div class="empty"><b>Chart not published yet</b>Advance a week to see where the market stands.</div>` + hist;
    }
    const rows = st.chart.slice(0, 20).map(r => {
      // A song with an agency behind it says so — the rest of the ladder is the
      // anonymous market, and the difference is the whole of this sprint.
      const act = r.rid ? KP.rivalAct(st, r.rid) : null;
      const by = act ? ' · ' + KP.rivalSpec(act.r).name : '';
      return `<div class="rung ${r.mine ? 'mine' : ''} ${r.rank === 1 ? 'top1' : ''}">
      <div class="rk">${r.rank}</div>
      <div><div class="ttl">${U.esc(r.title)}</div><div class="art">${U.esc(r.artist)}${U.esc(by)}</div></div>
      <div class="pts">${r.points.toFixed(1)}</div>
    </div>`;
    }).join('');
    return head + `<div class="card"><div class="ladder">${rows}</div></div>` + hist;
  }

  /* ------------------------------ the rivals -------------------------------
     Four buildings, and the whole screen is one question: how much of them are
     you allowed to see? Everything public is here for nothing — their groups,
     their line-ups, their chart year, a comeback inside the announcement window.
     A report opens the rest of the diary, and the diary is what lets you move a
     release off somebody else's week. */

  function topStat(t) {
    const best = KP.STATS.slice().sort((a, b) => t.stats[b.k] - t.stats[a.k])[0];
    return best.label.slice(0, 3).toUpperCase() + ' ' + Math.round(t.stats[best.k]);
  }

  /* Rival people are trainee records with no position on them — they are not on
     the player's books and never get one — so the caption is their best stat. */
  function rivalStrip(people) {
    if (!people.length) return `<p class="tiny muted" style="margin:0">Nobody signed.</p>`;
    return `<div class="member-strip">${people.map(m => `<div class="member">
      ${avatar(m)}<em>${U.esc(m.name.split(' ')[0])}</em><i>${topStat(m)}</i>
    </div>`).join('')}</div>`;
  }

  /* This year's debutants, everybody's. Read straight off the running yearbook,
     which is the same accumulator the Rookie of the Year ballot is settled from —
     so this board is the prize, months early, rather than a view of it. */
  function rookieRace(st) {
    const acts = (st.yearbook && st.yearbook.acts) || {};
    const owner = {};
    KP.rivalActs(st).forEach(x => { owner[x.g.name] = KP.rivalSpec(x.r).name; });

    const seen = {};
    const rows = [];
    Object.keys(acts).forEach(k => {
      const a = acts[k];
      if (a.debutY !== st.year) return;
      seen[a.name] = 1;
      rows.push({ name: a.name, mine: !!a.mine, cp: a.cp, no1: a.no1, tag: a.mine ? 'yours' : (owner[a.name] || 'independent') });
    });
    // A debut you watched happen belongs on the board the week it happens, not
    // the week it first charts.
    KP.rivalActs(st).forEach(({ r, g }) => {
      if (g.debutY !== st.year || seen[g.name]) return;
      rows.push({ name: g.name, mine: false, cp: 0, no1: 0, tag: KP.rivalSpec(r).name });
    });
    st.groups.forEach(g => {
      if (!g.debut || g.debut.y !== st.year || seen[g.name]) return;
      rows.push({ name: g.name, mine: true, cp: 0, no1: 0, tag: 'yours' });
    });
    if (!rows.length) return '';
    rows.sort((a, b) => b.cp - a.cp);

    return `<div class="card" style="margin-bottom:16px">
      <div class="sec-head"><h2>The rookie race</h2><span class="kr">신인상 경쟁</span>
        <p>Year ${st.year} debutants · ${rows.length} on the board</p></div>
      <div class="disc" style="margin-top:0">${rows.map((r, i) => `<div class="disc-row">
        <span class="pk ${r.mine ? 'gold' : ''}">${i + 1}</span>
        <span>${U.esc(r.name)} <span class="muted tiny">${U.esc(r.tag)}</span></span>
        <span class="mono tiny ${r.cp >= KP.awards.minBallot ? '' : 'muted'}">${U.num(r.cp)} pts</span>
        <span class="mono tiny ${r.no1 ? 'gold' : 'muted'}">${r.no1}🏆</span>
      </div>`).join('')}</div>
      <p class="tiny muted" style="margin:10px 0 0">Rookie of the Year is settled on chart points and weeks at #1 —
        the sales axis is dropped entirely, which is what gives a first-year group a real shot at it.
        ${KP.awards.minBallot} points is the minimum to be on the ballot at all.</p>
    </div>`;
  }

  function rivalsTab(st) {
    const R = KP.rivals;
    const now = KP.absWeek(st);
    const head = `<div class="sec-head"><h2>Rival agencies</h2><span class="kr">경쟁사</span>
      <p>${st.rivals.length} buildings · the same chart, the same audition rooms</p></div>`;
    if (!st.rivals.length) {
      return head + `<div class="empty"><b>Nobody on the board</b>Advance a week and the market will introduce itself.</div>`;
    }

    const acts = (st.yearbook && st.yearbook.acts) || {};

    const cards = st.rivals.map(r => {
      const sp = KP.rivalSpec(r);
      if (!sp) return '';
      const scouted = KP.rivalScouted(st, r);
      const year = (g) => acts['r:' + g.name] || null;
      const cpY = r.groups.reduce((s, g) => { const a = year(g); return s + (a ? a.cp : 0); }, 0);
      const no1Y = r.groups.reduce((s, g) => { const a = year(g); return s + (a ? a.no1 : 0); }, 0);
      const fans = r.groups.reduce((s, g) => s + g.fans, 0);

      const groups = r.groups.map(g => {
        const row = (st.chart || []).find(x => x.rid === g.id);
        const last = g.releases[0];
        const plan = KP.rivalPlanVisible(st, r, g) ? g.plan : null;
        const pts = plan ? KP.engine.rivalStrength(st, r, g, plan.absWeek) : 0;
        const away = plan ? plan.absWeek - now : 0;

        const status = row
          ? `<span class="chip ${row.rank === 1 ? 'win' : 'hot'}">#${row.rank} · “${U.esc(row.title)}”</span>`
          : g.active
            ? `<span class="chip hot">Promoting “${U.esc(g.active.title)}”</span>`
            : `<span class="chip">Resting</span>`;

        // The whole point of the tab: a week with somebody else's name on it.
        const wall = plan
          ? `<p class="tiny ${away <= 2 ? 'neg' : ''}" style="margin:8px 0 0">⚔ Comeback ${U.esc(KP.engine.weekLabel(st, plan.absWeek))}
              — in ${away} week${away === 1 ? '' : 's'} · ${U.esc(KP.concept(plan.concept).name)} ·
              ${scouted
              ? '≈' + Math.round(pts) + ' opening points'
              : U.esc(KP.engine.rivalWall(pts)) + ' (a report would price it)'}</p>`
          : `<p class="tiny muted" style="margin:8px 0 0">No comeback announced${scouted ? '' : ' — anything more than ' + R.announceLead + ' weeks out is behind a report'}.</p>`;

        // An act on the way out is worth saying out loud: the fade is already in
        // the opening points quoted above, so a wall getting beatable should not
        // read as the numbers wobbling. The year it ends is a scouted fact —
        // unscouted you get told they are late in the run and nothing sharper.
        const career = KP.rivalCareer(st, g);
        const era = career.left > R.fadeYears ? ''
          : scouted
            ? `<span class="chip">Final ${career.left <= 1 ? 'year' : Math.ceil(career.left) + ' years'}</span>`
            : `<span class="chip">Late in their run</span>`;

        return `<div class="riv-g">
          <div class="riv-head">
            <span class="riv-nm">${U.esc(g.name)}</span>
            <span class="tiny muted">${U.esc(KP.concept(g.concept).name)} ·
              ${g.debutY ? 'debut Y' + g.debutY + ' W' + g.debutW : 'established'}</span>
            ${era}
            <span class="spacer" style="margin-left:auto"></span>${status}
          </div>
          ${rivalStrip(g.members)}
          <div class="kv" style="margin:12px 0 0">
            <div><b>${U.num(g.fans)}</b><span>Est. fandom</span></div>
            <div><b>${Math.round(g.momentum)}</b><span>Momentum</span></div>
            <div><b>${g.releases.length}</b><span>Releases</span></div>
            <div><b class="${last && last.peak === 1 ? 'gold' : ''}">${last ? '#' + last.peak : '—'}</b><span>Last peak</span></div>
          </div>
          ${wall}
        </div>`;
      }).join('');

      return `<article class="card group-card" style="--accent:${sp.color}">
        <div class="group-head">
          <div>
            <div class="group-name">${U.esc(sp.name)}</div>
            <div class="group-kr">${U.esc(sp.kr)}</div>
            <div class="idol-meta">${sp.gender === 'f' ? 'Girl groups' : 'Boy groups'} ·
              ${r.groups.length}/${sp.maxGroups} acts · comeback every ${sp.pace[0]}–${sp.pace[1]} weeks</div>
          </div>
          <span class="spacer"></span>
          ${scouted ? `<span class="chip cool">Report · ${KP.rivalScoutLeft(st, r)}w left</span>` : ''}
        </div>
        <p class="tiny muted" style="margin:-6px 0 12px">${U.esc(sp.desc)}</p>

        <div class="kv">
          <div><b>${U.num(fans)}</b><span>Est. fandom</span></div>
          <div><b>${U.num(cpY)}</b><span>Chart points Y${st.year}</span></div>
          <div><b class="${no1Y ? 'gold' : ''}">${no1Y}</b><span>Weeks at #1</span></div>
          <div><b>${r.trainees.length}</b><span>Trainees</span></div>
        </div>

        ${groups}

        <div class="riv-g">
          <div class="riv-head"><span class="riv-nm">The building</span>
            <span class="tiny muted">${r.trainees.length} under contract, none of them debuted</span></div>
          ${scouted ? rivalStrip(r.trainees)
          : `<p class="tiny muted" style="margin:0">Who they signed is not public. A report names them, prices their
             comebacks and stays good for ${R.scoutWeeks} weeks.</p>`}
        </div>

        <div class="row" style="margin-top:14px">
          <button class="btn" data-act="scout-rival" data-id="${r.id}" ${scouted ? 'disabled' : ''}>
            ${scouted ? 'Report active' : 'Scouting report · ' + U.money(R.scoutCost)}</button>
          <span class="tiny muted">${scouted
          ? 'Their whole diary is open for another ' + KP.rivalScoutLeft(st, r) + ' weeks.'
          : 'Buys information and nothing else — no gate moves and no number improves.'}</span>
        </div>
      </article>`;
    }).join('');

    return head + rookieRace(st) + `<div class="grid g-2">${cards}</div>`;
  }

  function logTab(st) {
    const head = `<div class="sec-head"><h2>Feed</h2><span class="kr">소식</span><p>Everything that happened</p></div>`;
    if (!st.log.length) return head + `<div class="empty"><b>Nothing yet</b></div>`;
    return head + `<div class="card"><div class="feed">${st.log.map(l => `
      <div class="feed-row ${l.kind}">
        <time>Y${l.y} · W${String(l.w).padStart(2, '0')}</time>
        <span></span>
        <span>${U.esc(l.text)}</span>
      </div>`).join('')}</div></div>`;
  }

  /* ================================ render ================================= */

  ui.render = function () {
    const st = KP.state;
    if (!st) return;

    $('#ui-company').textContent = st.company.name;
    $('#ui-ceo').textContent = 'CEO ' + st.company.ceo;
    $('#ui-logo').textContent = st.company.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'IE';
    $('#ui-date').textContent = 'Y' + st.year + ' · W' + st.week;
    $('#ui-money').textContent = U.money(st.company.money);
    $('#ui-money').classList.toggle('neg', st.company.money < 0);
    const owed = KP.debtOutstanding(st);
    const debtEl = $('#ui-debt');
    debtEl.textContent = owed > 0 ? U.money(owed) : '—';
    debtEl.className = 'hud-val ' + (owed > 0 ? 'neg' : 'muted');
    const net = KP.ledger(st).net;
    const burnEl = $('#ui-burn');
    burnEl.textContent = (net >= 0 ? '+' : '') + U.money(net);
    burnEl.className = 'hud-val ' + (net >= 0 ? 'pos' : 'neg');
    $('#ui-rep').textContent = Math.round(st.company.rep);
    $('#ui-fans').textContent = U.num(KP.totalFans(st));

    $('#badge-trainees').textContent = st.trainees.filter(t => !t.groupId).length || '';
    $('#badge-scout').textContent = st.scoutPool.length || '';
    $('#badge-groups').textContent = st.groups.length || '';
    $('#badge-sched').textContent = st.bookings.length || '';
    // The rail is where a wall is worth noticing: how many announced rival
    // comebacks are inside the window you can still move a release around.
    $('#badge-rivals').textContent =
      KP.rivalPlansIn(st, KP.absWeek(st) + 1, KP.absWeek(st) + KP.rivals.announceLead).length || '';

    document.querySelectorAll('.rail-btn').forEach(b =>
      b.classList.toggle('is-on', b.dataset.tab === ui.tab));

    // Same order as the rail in index.html and the tabs array in main.js.
    const views = {
      dash: officeTab, trainees: traineesTab, scout: scoutTab, groups: groupsTab,
      sched: schedTab, chart: chartTab, rivals: rivalsTab, log: logTab
    };
    $('#stage').innerHTML = (views[ui.tab] || officeTab)(st);
    $('#stage').scrollTop = 0;
  };

  /* ================================ modal ================================== */

  ui.closeModal = function () { $('#modal-root').innerHTML = ''; };

  /* opts.locked drops the backdrop's dismiss hook — used for the end of a run,
     which must not be clickable-away into a dead, still-interactive game. */
  ui.modal = function (html, opts) {
    const dismiss = opts && opts.locked ? '' : ' data-act="modal-bg"';
    $('#modal-root').innerHTML = `<div class="modal-bg"${dismiss}><div class="modal">${html}</div></div>`;
  };

  ui.toast = function (text, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  };

  /* --------------------------- debut wizard -------------------------------- */

  ui.openDebut = function () {
    const st = KP.state;
    const pool = st.trainees.filter(t => !t.groupId);
    if (pool.length < 3) { ui.toast('You need at least 3 free trainees.', 'bad'); return; }

    ui.wiz = {
      picked: [],
      concept: KP.concepts.slice().sort((a, b) => st.trends[b.k] - st.trends[a.k])[0].k,
      color: KP.groupColors[0],
      name: U.pick(KP.groupNameParts.a) + (U.chance(.5) ? '' : ' ' + U.pick(KP.groupNameParts.b)),
      kr: '',
      fandom: ''
    };
    ui.wiz.fandom = ui.wiz.name.split(' ')[0] + U.pick(KP.fandomSuffix);
    ui.drawDebut();
  };

  ui.drawDebut = function () {
    const st = KP.state;
    const w = ui.wiz;
    const pool = st.trainees.filter(t => !t.groupId);
    const members = w.picked.map(id => st.trainees.find(t => t.id === id));

    const score = members.length ? KP.engine.groupScore(members, w.concept) : 0;
    const canGo = members.length >= 3 && st.company.money >= KP.costs.debutShowcase && w.name.trim().length > 0;

    const picks = pool.map(t => `<div class="card sel-idol ${w.picked.includes(t.id) ? 'is-on' : ''}"
        data-act="wiz-pick" data-id="${t.id}" style="padding:12px">
        <div class="idol-top" style="pointer-events:none">
          ${avatar(t)}
          <div><div class="idol-name" style="font-size:13px">${U.esc(t.name)}</div>
          <div class="idol-meta">${t.age}y · ovr ${KP.overall(t)}</div></div>
        </div>
      </div>`).join('');

    const concepts = KP.concepts.map(c => `<button class="opt ${w.concept === c.k ? 'is-on' : ''}"
        data-act="wiz-concept" data-key="${c.k}">
        <div><b>${c.name} <span style="font-family:var(--kr);font-weight:400;color:var(--lilac)">${c.kr}</span></b>
        <small>${Object.keys(c.w).sort((a, b) => c.w[b] - c.w[a]).slice(0, 3).map(k => KP.STATS.find(s => s.k === k).label).join(' · ')}</small></div>
        <span class="q">trend ${Math.round(st.trends[c.k])}</span>
        <span class="c">${members.length ? Math.round(KP.engine.groupScore(members, c.k)) : '—'}</span>
      </button>`).join('');

    ui.modal(`
      <div class="modal-head">
        <div><div class="kr">데뷔</div><h3>Form a group</h3></div>
        <button class="modal-close" data-act="modal-close">✕</button>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">1 — Line-up (${members.length} selected, 3–7)</span>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${picks}</div>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">2 — Concept · the right-hand number is this line-up's fit</span>
        <div class="opt-list">${concepts}</div>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">3 — Identity</span>
        <div class="grid" style="grid-template-columns:1fr 1fr">
          <label><span class="tiny muted">Group name</span>
            <input class="text-in" data-act="wiz-name" value="${U.esc(w.name)}" maxlength="18"></label>
          <label><span class="tiny muted">Fandom name</span>
            <input class="text-in" data-act="wiz-fandom" value="${U.esc(w.fandom)}" maxlength="18"></label>
        </div>
        <div class="row" style="margin-top:12px">
          <span class="tiny muted">Lightstick colour</span>
          <div class="swatches">${KP.groupColors.map(c =>
      `<button class="swatch ${w.color === c ? 'is-on' : ''}" style="background:${c}"
              data-act="wiz-color" data-key="${c}"></button>`).join('')}</div>
        </div>
      </div>

      <div class="est">
        <div><b>${Math.round(score)}</b><span>Concept fit</span></div>
        <div><b>${U.money(KP.costs.debutShowcase)}</b><span>Showcase cost</span></div>
        <div><b>${U.money(st.company.money)}</b><span>Cash after: ${U.money(st.company.money - KP.costs.debutShowcase)}</span></div>
      </div>

      <div class="modal-foot">
        <span class="tiny muted">Positions are assigned automatically from stats and age.</span>
        <span class="spacer"></span>
        <button class="btn" data-act="modal-close">Cancel</button>
        <button class="btn btn-primary" data-act="wiz-debut" ${canGo ? '' : 'disabled'}>Debut them</button>
      </div>
    `);
  };

  /* -------------------------- comeback planner ----------------------------- */

  ui.openComeback = function (gid) {
    const st = KP.state;
    const g = st.groups.find(x => x.id === gid);
    if (!g || g.active) return;
    ui.plan = {
      gid,
      concept: g.concept,
      title: U.pick(KP.titleWords.a) + ' ' + U.pick(KP.titleWords.b),
      sel: { producer: 'inhouse', choreo: 'local', mv: 'set', styling: 'boutique', promo: 'std' }
    };
    ui.drawComeback();
  };

  /* `standing` rather than raw reputation, and the same number E.releaseComeback
     validates against, so a row that looks open cannot be refused. */
  function tierList(kind, label, sel, standing) {
    return `<div class="wiz-step">
      <span class="eyebrow">${label}</span>
      <div class="opt-list">${KP.tiers[kind].map(t => {
      const locked = t.rep && standing < t.rep;
      return `<button class="opt ${sel === t.k ? 'is-on' : ''} ${locked ? 'locked' : ''}"
          ${locked ? 'disabled' : ''} data-act="plan-tier" data-kind="${kind}" data-key="${t.k}">
          <div><b>${t.name}</b><small>${t.desc}${locked ? ' · needs standing ' + t.rep : ''}</small></div>
          <span class="q">${kind === 'promo' ? '+' + t.q + ' hype · ' + t.weeks + 'w' : 'Q' + t.q}</span>
          <span class="c">${U.money(t.cost)}${kind === 'promo' ? '/w' : ''}</span>
        </button>`;
    }).join('')}</div>
    </div>`;
  }

  ui.drawComeback = function () {
    const st = KP.state;
    const p = ui.plan;
    const g = st.groups.find(x => x.id === p.gid);
    const pv = KP.engine.planPreview(st, g, p.sel, p.concept);
    const promo = KP.tiers.promo.find(x => x.k === p.sel.promo);
    const upfront = pv.cost + promo.cost;
    const totalPromo = promo.cost * promo.weeks;
    const afford = st.company.money >= upfront;

    // What else is coming out while this song is still promoting. Only the plans
    // the player is allowed to see, and priced only for an agency they have a
    // report on — the point of the line is that waiting a week is a move.
    const from = KP.absWeek(st);
    const walls = KP.rivalPlansIn(st, from, from + promo.weeks).map(({ r, g }) => {
      const pts = KP.engine.rivalStrength(st, r, g, g.plan.absWeek);
      const scouted = KP.rivalScouted(st, r);
      return `<li>${U.esc(KP.engine.weekLabel(st, g.plan.absWeek))} — <b>${U.esc(g.name)}</b>
        (${U.esc(KP.rivalSpec(r).name)}) · ${U.esc(KP.concept(g.plan.concept).name)} ·
        ${scouted ? '≈' + Math.round(pts) + ' opening points' : U.esc(KP.engine.rivalWall(pts))}</li>`;
    }).join('');

    const conceptOpts = KP.concepts.map(c => `<button class="opt ${p.concept === c.k ? 'is-on' : ''}"
        data-act="plan-concept" data-key="${c.k}">
        <div><b>${c.name} <span style="font-family:var(--kr);font-weight:400;color:var(--lilac)">${c.kr}</span></b>
        <small>${g.lastConcept === c.k ? 'Same as last time — hype penalty' : 'Fresh direction'}</small></div>
        <span class="q">trend ${Math.round(st.trends[c.k])}</span>
        <span class="c">fit ${Math.round(KP.engine.groupScore(KP.memberOf(st, g), c.k))}</span>
      </button>`).join('');

    ui.modal(`
      <div class="modal-head">
        <div><div class="kr">컴백</div><h3>${U.esc(g.name)} — ${g.releases.length ? 'comeback' : 'debut single'}</h3></div>
        <button class="modal-close" data-act="modal-close">✕</button>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">Title track</span>
        <div class="row">
          <input class="text-in" style="flex:1;min-width:200px" data-act="plan-title" value="${U.esc(p.title)}" maxlength="26">
          <button class="btn" data-act="plan-reroll">Suggest another</button>
        </div>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">Concept</span>
        <div class="opt-list">${conceptOpts}</div>
      </div>

      ${tierList('producer', 'Producer', p.sel.producer, KP.standing(st))}
      ${tierList('choreo', 'Choreography', p.sel.choreo, KP.standing(st))}
      ${tierList('mv', 'Music video', p.sel.mv, KP.standing(st))}
      ${tierList('styling', 'Styling', p.sel.styling, KP.standing(st))}
      ${tierList('promo', 'Promotion plan', p.sel.promo, KP.standing(st))}

      <div class="est">
        <div><b>${Math.round(pv.quality)}</b><span>Song quality</span></div>
        <div><b>${Math.round(pv.hype)}</b><span>Hype</span></div>
        <div><b>${Math.round(pv.points)}</b><span>Opening points</span></div>
        <div><b class="${pv.fatigue < 1 ? 'neg' : 'pos'}">${Math.round(pv.fatigue * 100)}%</b><span>Fandom freshness</span></div>
        <div><b>${U.money(pv.cost)}</b><span>Production</span></div>
        <div><b>${U.money(totalPromo)}</b><span>Promo over ${promo.weeks}w</span></div>
      </div>
      <p class="tiny muted" style="margin:8px 2px 0">Releasing into <b>${U.esc(pv.season.name)}</b> · ${U.esc(pv.season.kr)} —
        rival opening points ×${pv.season.field.toFixed(2)}, streaming revenue ×${pv.season.audience.toFixed(2)}.
        ${pv.season.field > 1
        ? 'A crowded chart: the same song ranks lower here.'
        : 'A thin chart: the same song ranks higher here.'}</p>
      ${pv.fatigue < 1 ? `<p class="tiny neg" style="margin:8px 2px 0">Only ${pv.gap} weeks since the last release — waiting until week 16 removes the fatigue penalty.</p>` : ''}
      ${walls ? `<p class="tiny neg" style="margin:8px 2px 0">Announced comebacks inside these ${promo.weeks} promotion weeks:</p>
        <ul class="tiny muted" style="margin:4px 2px 0;padding-left:18px">${walls}</ul>` : ''}

      <div class="modal-foot">
        <span class="tiny ${afford ? 'muted' : 'neg'}">
          ${afford ? 'Production and the first promo week are paid now; the rest is billed weekly.' : 'Not enough cash for production plus the first promo week.'}
        </span>
        <span class="spacer"></span>
        <button class="btn" data-act="modal-close">Cancel</button>
        <button class="btn btn-primary" data-act="plan-release" ${afford ? '' : 'disabled'}>Release it</button>
      </div>
    `);
  };

  /* ---------------------------- booking modal ------------------------------ */
  /* Two steps: what kind of appearance, then which show. No text inputs, so no
     sync-before-redraw is needed here. */

  ui.openBooking = function (gid, abs) {
    const st = KP.state;
    const g = st.groups.find(x => x.id === gid);
    if (!g) return;
    // A music show is meaningless without a title track out, so don't open on it.
    ui.book = { gid, abs, kind: g.active ? 'music' : 'variety', show: null };
    ui.drawBooking();
  };

  ui.drawBooking = function () {
    const st = KP.state;
    const bk = ui.book;
    const g = st.groups.find(x => x.id === bk.gid);
    if (!g) return ui.closeModal();

    const kinds = KP.bookingKinds.map(k => {
      const taken = KP.bookingsFor(st, g.id, bk.abs).some(x => x.kind === k.k);
      return `<button class="opt ${bk.kind === k.k ? 'is-on' : ''}" data-act="book-kind" data-key="${k.k}">
        <div><b>${k.ic} ${U.esc(k.name)}
          <span style="font-family:var(--kr);font-weight:400;color:var(--lilac)">${U.esc(k.kr)}</span></b>
          <small>${U.esc(k.desc)}</small></div>
        <span class="q">${taken ? 'already booked' : ''}</span>
        <span class="c">${KP.showsOf(k.k).length} shows</span>
      </button>`;
    }).join('');

    const isLive = bk.kind === 'live';
    const shows = KP.showsOf(bk.kind).map(s => {
      const block = KP.engine.bookBlock(st, g, bk.kind, s.k, bk.abs);
      const pv = KP.engine.bookPreview(st, g, bk.kind, s.k, bk.abs);
      const note = block ? ' · ' + block
        : isLive ? ' · ' + U.num(pv.breakEven) + ' seats to break even'
          : ' · ' + pv.slots + ' slot' + (pv.slots === 1 ? '' : 's') + ' left';
      return `<button class="opt ${bk.show === s.k ? 'is-on' : ''} ${block ? 'locked' : ''}"
          ${block ? 'disabled' : ''} data-act="book-show" data-key="${s.k}">
        <div><b>${U.esc(s.name)}
          <span style="font-family:var(--kr);font-weight:400;color:var(--lilac)">${U.esc(s.kr)}</span></b>
          <small>${U.esc(s.desc)}${isLive ? ' · ' + U.num(s.cap) + ' seats' : ''}${U.esc(note)}</small></div>
        <span class="q">${isLive
          ? U.num(pv.lo) + '–' + U.num(pv.hi) + ' seats'
          : bk.kind === 'music'
            ? '+' + s.points.toFixed(1) + ' pts'
            : 'variety ' + s.need + '+'}</span>
        <span class="c">${U.money(isLive ? s.cost : s.fee)}</span>
      </button>`;
    }).join('');

    const s = bk.show ? KP.showSpec(bk.kind, bk.show) : null;
    const pv = s ? KP.engine.bookPreview(st, g, bk.kind, bk.show, bk.abs) : null;
    const block = s ? KP.engine.bookBlock(st, g, bk.kind, bk.show, bk.abs) : 'Pick a show.';
    const upfront = s ? (isLive ? s.cost : s.fee) : 0;
    const afford = s ? st.company.money >= upfront : false;

    let est = '';
    if (pv && bk.kind === 'music') {
      est = `<div class="est">
        <div><b class="neg">${U.money(s.fee)}</b><span>Fee, paid now</span></div>
        <div><b class="pos">+${pv.points.toFixed(1)}</b><span>Chart points</span></div>
        <div><b>+${U.num(pv.fansBase)}</b><span>New fans</span></div>
        <div><b>+${s.repGain.toFixed(2)}</b><span>Reputation</span></div>
        <div><b>${s.stamina}</b><span>Stamina each</span></div>
        <div><b>${pv.slots}</b><span>Slots left</span></div>
      </div>
      <p class="tiny muted" style="margin:8px 2px 0">The stage is performed before the week's chart is counted, so the points
        land on this ranking rather than the next one. ${U.esc(pv.season.name)} gives ${U.esc(s.name)}
        ${pv.season.slotBonus === 0 ? 'its usual capacity' : pv.season.slotBonus > 0
          ? 'an extra slot' : 'one slot fewer'}.</p>`;
    } else if (pv && isLive) {
      est = `<div class="est">
        <div><b class="neg">${U.money(pv.cost)}</b><span>Paid up front</span></div>
        <div><b>${U.num(pv.breakEven)}</b><span>Seats to break even</span></div>
        <div><b>${U.num(pv.lo)}–${U.num(pv.hi)}</b><span>Likely attendance</span></div>
        <div><b>${Math.round(pv.fillLo * 100)}–${Math.round(pv.fillHi * 100)}%</b><span>Fill</span></div>
        <div><b class="${pv.doomed ? 'neg' : pv.safe ? 'pos' : ''}">${U.money(pv.grossLo)}–${U.money(pv.grossHi)}</b><span>Gate</span></div>
        <div><b>${s.stamina}</b><span>Stamina each</span></div>
      </div>
      <p class="tiny ${pv.doomed ? 'neg' : pv.safe ? 'pos' : 'muted'}" style="margin:8px 2px 0">
        ${pv.doomed
          ? 'This venue cannot break even on your fandom. Do not book it.'
          : pv.safe
            ? 'Even a soft week clears the production cost.'
            : 'A soft week loses money here. Momentum, an active comeback and the season all move the gate.'}
        Modifiers: comeback ×${pv.mods.promo.toFixed(2)} · momentum ×${pv.mods.heat.toFixed(2)} ·
        standing ×${pv.mods.stand.toFixed(2)} · ${U.esc(pv.season.name)} ×${pv.mods.audience.toFixed(2)}${pv.mods.stale < 1
        ? ' · no recent release ×' + pv.mods.stale.toFixed(2) : ''}</p>`;
    } else if (pv) {
      est = `<div class="est">
        <div><b class="neg">${U.money(s.fee)}</b><span>Fee, paid now</span></div>
        <div><b class="${pv.score >= s.need ? 'pos' : 'neg'}">${Math.round(pv.score)}</b><span>Your best talker</span></div>
        <div><b class="pos">${Math.round(pv.pViral * 100)}%</b><span>Goes viral</span></div>
        <div><b class="${pv.pFlat > .25 ? 'neg' : ''}">${Math.round(pv.pFlat * 100)}%</b><span>Falls flat</span></div>
        <div><b>+${U.num(pv.fansLo)}–${U.num(pv.fansHi)}</b><span>New fans</span></div>
        <div><b>${s.stamina}</b><span>Stamina each</span></div>
      </div>
      <p class="tiny muted" style="margin:8px 2px 0">${pv.talker
          ? U.esc(pv.talker.name) + ' would carry it at variety ' + Math.round(pv.score) + ', against a show pitched at ' + s.need + '.'
          : 'Nobody is fit to appear.'}
        Everyone who appears picks up variety, up to their own ceiling — a cheap slot is the only way a stiff line-up ever learns to be funny.</p>`;
    }

    const warn = pv && pv.exposed
      ? `<p class="tiny neg" style="margin:8px 2px 0">${pv.exposed} member${pv.exposed === 1 ? '' : 's'} would come out of this
        below ${KP.bookings.injuryFloor} stamina — that is where injuries start. Rest them or book something cheaper.</p>`
      : '';

    ui.modal(`
      <div class="modal-head">
        <div><div class="kr">스케줄</div><h3>${U.esc(g.name)} — ${U.esc(KP.engine.weekLabel(st, bk.abs))}</h3></div>
        <button class="modal-close" data-act="modal-close">✕</button>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">1 — What kind of appearance</span>
        <div class="opt-list">${kinds}</div>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">2 — ${isLive ? 'The venue · production is paid the moment you confirm'
        : 'The booking · the fee is paid the moment you confirm'}</span>
        <div class="opt-list">${shows}</div>
      </div>

      ${est}${warn}

      <div class="modal-foot">
        <span class="tiny ${!s ? 'muted' : block ? 'neg' : afford ? 'muted' : 'neg'}">
          ${!s ? (isLive ? 'Pick a venue.' : 'Pick a show.') : block ? U.esc(block) : afford
        ? 'Cancelling more than ' + KP.bookings.lateWeeks + ' weeks out returns half of what you paid. Inside that, nothing.'
        : isLive ? 'Not enough cash for the production budget.' : 'Not enough cash for the appearance fee.'}
        </span>
        <span class="spacer"></span>
        <button class="btn" data-act="modal-close">Cancel</button>
        <button class="btn btn-primary" data-act="book-confirm" ${s && !block && afford ? '' : 'disabled'}>Book it</button>
      </div>
    `);
  };

  /* ----------------------------- raising money ----------------------------- */
  /* Two steps: which kind of money, then whose. No text inputs, so no
     sync-before-redraw is needed here either. */

  ui.openFinance = function () {
    ui.fin = { mode: 'loan', pick: null };
    ui.drawFinance();
  };

  ui.drawFinance = function () {
    const st = KP.state;
    const F = KP.finance;
    const f = ui.fin;
    const L = KP.ledger(st);
    const loan = f.mode === 'loan';
    const list = KP.engine.financeSpecs(f.mode);

    const modes = [
      ['loan', 'Borrow', '대출', 'A fixed weekly instalment, billed in the books until the term ends'],
      ['investor', 'Sell a share', '투자', 'No instalment at all — a cut of everything you earn, for years']
    ].map(([k, name, kr, desc]) => `<button class="opt ${f.mode === k ? 'is-on' : ''}"
        data-act="fin-mode" data-key="${k}">
        <div><b>${name} <span style="font-family:var(--kr);font-weight:400;color:var(--lilac)">${kr}</span></b>
          <small>${desc}</small></div>
        <span class="q"></span>
        <span class="c">${(k === 'loan' ? F.loans : F.investors).length} offers</span>
      </button>`).join('');

    const offers = list.map(o => {
      const block = KP.engine.debtBlock(st, f.mode, o.k);
      const weekly = loan ? KP.engine.debtWeekly(o) : 0;
      return `<button class="opt ${f.pick === o.k ? 'is-on' : ''} ${block ? 'locked' : ''}"
          ${block ? 'disabled' : ''} data-act="fin-pick" data-key="${o.k}">
        <div><b>${U.esc(o.name)}
          <span style="font-family:var(--kr);font-weight:400;color:var(--lilac)">${U.esc(o.kr)}</span></b>
          <small>${U.esc(o.desc)}${block ? ' · ' + U.esc(block) : ''}</small></div>
        <span class="q">${loan ? U.money(weekly) + '/w · ' + o.weeks + 'w'
        : Math.round(o.share * 100) + '% · ' + o.weeks + 'w'}</span>
        <span class="c">${U.money(o.principal)}</span>
      </button>`;
    }).join('');

    const spec = f.pick ? list.find(x => x.k === f.pick) : null;
    const block = spec ? KP.engine.debtBlock(st, f.mode, spec.k) : 'Pick an offer.';

    let est = '';
    if (spec) {
      const weekly = loan ? KP.engine.debtWeekly(spec) : 0;
      const received = Math.round(spec.principal * (1 - F.origination));
      // What the money changes about the week: an instalment for a loan, and for
      // an investor the cut they would take off the one income line that recurs.
      const cut = loan ? 0 : Math.round(L.in.merch * spec.share);
      const netAfter = L.net - weekly - cut;
      const cashAfter = st.company.money + received;
      const runway = netAfter < 0
        ? Math.floor((cashAfter - KP.costs.bankruptcyFloor) / -netAfter) : 99;
      const limit = KP.creditLimit(st);
      const used = KP.debtOutstanding(st) + (loan ? spec.principal : 0);

      est = `<div class="est">
        <div><b class="pos">${U.money(received)}</b><span>Received now</span></div>
        <div><b class="neg">${loan ? U.money(weekly) + '/w' : Math.round(spec.share * 100) + '%'}</b>
          <span>${loan ? 'Weekly' : 'Share of income'}</span></div>
        <div><b>${U.money(loan ? weekly * spec.weeks : spec.principal * F.buyoutMul)}</b>
          <span>${loan ? 'Total repaid' : 'Buyout ceiling'}</span></div>
        <div><b class="${runway < 12 ? 'neg' : ''}">${runway > 90 ? '∞' : runway + 'w'}</b><span>Runway after</span></div>
        <div><b>${limit > 0 ? Math.round(used / limit * 100) : 0}%</b><span>Credit used</span></div>
        <div><b>${spec.weeks}w</b><span>Term</span></div>
      </div>
      <p class="tiny ${loan ? 'muted' : 'neg'}" style="margin:8px 2px 0">${loan
        ? U.money(spec.principal * F.origination) + ' of the principal goes on origination, and the instalment is billed in the '
        + 'weekly books from next week — so the runway above is the honest one. Clearing it early forgives half the interest you '
        + 'have not been charged yet.'
        : 'No instalment, nothing to miss, and no way to default on it. What it costs instead is uncapped: '
        + Math.round(spec.share * 100) + '% of every album, stream, gate and merch won for ' + spec.weeks
        + ' weeks. Succeed and they take far more than they lent — the buyout above is the only way to stop it.'}</p>`;
    }

    ui.modal(`
      <div class="modal-head">
        <div><div class="kr">자금 조달</div><h3>Raise money</h3></div>
        <button class="modal-close" data-act="modal-close">✕</button>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">1 — What kind of money</span>
        <div class="opt-list">${modes}</div>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">2 — ${loan ? 'Who lends it · credit free ' + U.money(KP.creditFree(st))
        : 'Who buys in · they take their cut from the week you sign'}</span>
        <div class="opt-list">${offers}</div>
      </div>

      ${est}

      <div class="modal-foot">
        <span class="tiny ${block ? 'neg' : 'muted'}">${block ? U.esc(block)
        : 'Nothing about this is reversible except by paying it off.'}</span>
        <span class="spacer"></span>
        <button class="btn" data-act="modal-close">Cancel</button>
        <button class="btn" data-act="fin-take" data-key="${spec ? spec.k : ''}"
          ${spec && !block ? '' : 'disabled'}>Sign it</button>
      </div>
    `);
  };

  /* ------------------------------- the ceremony ---------------------------- */
  /* Not locked: the player is allowed to close it. main.js therefore opens it
     after ui.render() and only when the run is still alive — a dead run outranks
     a ceremony, and there is exactly one modal root to argue over. */

  ui.openAwards = function (y) {
    const st = KP.state;
    const rec = st.awards.find(a => a.y === y);
    if (!rec) return;
    const mine = rec.results.filter(r => r.mine);

    // Gold on a trophy is the one thing --gold was reserved for.
    const rows = rec.results.map(r => `<div class="opt ${r.mine ? 'is-on' : ''}">
      <div><b>${r.mine ? '<span class="gold">' + U.esc(r.ic) + '</span> ' : U.esc(r.ic) + ' '}${U.esc(r.winner)}${r.by
      ? ' <span class="muted">— ' + U.esc(r.by) + '</span>' : ''}</b>
        <small>${U.esc(r.name)} · ${U.esc(r.kr)} · ${U.esc(r.detail)}</small></div>
      <span class="q">${r.mine ? 'YOURS' : ''}</span>
      <span class="c mono">${r.score}</span>
    </div>`).join('');

    ui.modal(`
      <div class="modal-head">
        <div><div class="kr">시상식</div><h3>Year ${rec.y} — Year-End Awards</h3></div>
        <button class="modal-close" data-act="modal-close">✕</button>
      </div>
      <p class="${mine.length ? 'muted' : 'neg'}" style="margin:0 0 14px">
        ${mine.length
        ? 'You go home with ' + mine.length + ' trophy' + (mine.length === 1 ? '' : 's') + '. Reputation, fandom and standing all move tonight.'
        : 'The cameras were somewhere else all night. Nothing here is out of reach next year.'}
      </p>
      <div class="opt-list">${rows}</div>
      <div class="est">
        <div><b class="gold">${mine.length}</b><span>Trophies</span></div>
        <div><b>${Math.round(st.company.rep)}</b><span>Reputation</span></div>
        <div><b>${st.company.prestige}</b><span>Prestige</span></div>
        <div><b>${Math.round(KP.standing(st))}</b><span>Standing</span></div>
      </div>
      <div class="modal-foot">
        <span class="tiny muted">Standing is what producers, broadcasters, venues and lenders read.
          Prestige is permanent, and caps at ${KP.awards.prestigeCap}.</span>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-act="modal-close">Take the stage</button>
      </div>`);
  };

  /* ----------------------------- misc modals ------------------------------- */

  ui.openMenu = function () {
    const st = KP.state;
    ui.modal(`
      <div class="modal-head">
        <div><div class="kr">설정</div><h3>Agency menu</h3></div>
        <button class="modal-close" data-act="modal-close">✕</button>
      </div>
      <div class="opt-list">
        <button class="opt" data-act="menu-save"><div><b>Save now</b><small>The run also autosaves every week</small></div><span></span><span class="c">⌘</span></button>
        <button class="opt" data-act="menu-export"><div><b>Download save</b><small>A JSON file you can keep, move to another browser or re-import later</small></div><span></span><span class="c">↓</span></button>
        <button class="opt" data-act="menu-import"><div><b>Load save file</b><small>Replaces the run in progress</small></div><span></span><span class="c">↑</span></button>
        <button class="opt" data-act="menu-quit"><div><b>Abandon run</b><small>Deletes the save and returns to the title</small></div><span></span><span class="c">✕</span></button>
      </div>
      <div class="modal-foot">
        <span class="tiny muted">${U.esc(st.company.name)} · Y${st.year} W${st.week} · ${st.stats.releases} releases · ${st.stats.wins} wins</span>
      </div>`);
  };

  ui.gameOver = function () {
    const st = KP.state;
    // Two ways to lose, and the player is owed the difference: insolvency is
    // running out of money, default is somebody else deciding you had.
    const bust = st.over === 'default';
    const debts = st.company.debts || [];
    const called = debts.slice().sort((a, b) => b.missed - a.missed)[0];
    const missed = debts.reduce((n, d) => n + d.missed, 0);

    ui.modal(`
      <div class="modal-head"><div><div class="kr">${bust ? '부도' : '폐업'}</div>
        <h3>${bust ? 'The creditors took it' : 'The agency folded'}</h3></div></div>
      <p class="muted">You ran ${U.esc(st.company.name)} for ${KP.absWeek(st)} weeks,
        debuted ${st.groups.length} group${st.groups.length === 1 ? '' : 's'},
        released ${st.stats.releases} title tracks and won ${st.stats.wins} music shows.</p>
      ${bust ? `<p class="neg">${called ? U.esc(called.name) : 'A lender'} was called in after
        ${missed} missed payment${missed === 1 ? '' : 's'}. The building, the contracts and the
        catalogue went with it.</p>` : ''}
      <div class="est">
        <div><b>${U.num(KP.totalFans(st))}</b><span>Fans at the end</span></div>
        <div><b>${Math.round(st.company.rep)}</b><span>Reputation</span></div>
        <div><b class="${bust ? 'neg' : ''}">${U.money(KP.debtOutstanding(st))}</b><span>Still owed</span></div>
        <div><b class="gold">${st.stats.no1}</b><span>#1 singles</span></div>
        <div><b class="gold">${st.groups.reduce((n, g) => n + KP.trophyCount(g), 0)}</b><span>Trophies</span></div>
      </div>
      <div class="modal-foot"><span class="spacer"></span>
        <button class="btn btn-primary" data-act="menu-quit">Start over</button></div>`, { locked: true });
  };
})();
