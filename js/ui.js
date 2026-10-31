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

  /* ------------------------------- the sleeve ------------------------------
     KP.cover() decides what a song looks like; this is the only place that
     paints one. Inline SVG rather than an <img>, for the reason avatar() gives:
     #stage is rebuilt wholesale on every click, and a raster node re-decodes and
     flashes where a vector costs nothing. Everything is drawn in a 64×64
     viewBox and sized entirely by CSS, so one function is a 26px row thumbnail,
     a 72px now-playing tile and a 200px sleeve.

     Nothing here rolls. Every placement comes out of cv.r, which KP.cover
     derived from the song itself — so two renders of one song are byte-identical
     and ui.js stays a pure state → HTML function.

     A new motif is one name in KP.art.motifs plus one branch below, the same
     seam a new trait effect has with traitMul(). */
  function coverArt(cv, cls) {
    const p = cv.pal, r = cv.r, ac = cv.accent;
    const id = 'sl' + cv.id;
    const n = (x) => Math.round(x * 10) / 10;
    let art;

    if (cv.motif === 'rings') {
      const cx = n(14 + r[0] * 36), cy = n(14 + r[1] * 36);
      art = [30, 22, 15, 9].map((rad, i) =>
        `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${i % 2 ? p[2] : ac}"
          stroke-width="${n(1 + r[i] * 2.4)}" opacity=".85"/>`).join('') +
        `<circle cx="${cx}" cy="${cy}" r="4" fill="${p[2]}"/>`;

    } else if (cv.motif === 'bars') {
      art = r.slice(0, 7).map((v, i) => {
        const h = n(10 + v * 46), x = n(4 + i * 8.4);
        return `<rect x="${x}" y="${n(64 - h)}" width="6" height="${h}" rx="1.5"
          fill="${i === 3 ? ac : p[2]}" opacity="${i === 3 ? '1' : '.78'}"/>`;
      }).join('');

    } else if (cv.motif === 'wave') {
      art = [0, 1, 2].map(i => {
        const y = n(19 + i * 13 + r[i] * 7);
        return `<path d="M-2 ${y} Q16 ${n(y - 8 - r[i + 3] * 9)} 32 ${y} T66 ${y}" fill="none"
          stroke="${i === 1 ? ac : p[2]}" stroke-width="${n(2 + r[i + 6] * 2)}" opacity=".9"/>`;
      }).join('');

    } else if (cv.motif === 'prism') {
      art = [0, 1, 2].map(i => {
        const x = n(4 + r[i] * 26), y = n(6 + r[i + 3] * 20), s = n(24 + r[i + 6] * 22);
        return `<path d="M${x} ${n(y + s)} L${n(x + s / 2)} ${y} L${n(x + s)} ${n(y + s)} Z"
          fill="${i === 0 ? ac : p[2]}" opacity=".55"/>`;
      }).join('');

    } else if (cv.motif === 'grid') {
      const cells = [];
      for (let i = 0; i < 16; i++) {
        const rad = n(1.6 + r[i % 10] * 4.4);
        cells.push(`<circle cx="${n(11 + (i % 4) * 14)}" cy="${n(11 + ((i / 4) | 0) * 14)}"
          r="${rad}" fill="${rad > 4.2 ? ac : p[2]}" opacity=".85"/>`);
      }
      art = cells.join('');

    } else {
      const cx = n(20 + r[0] * 26), cy = n(22 + r[1] * 16), rad = n(13 + r[2] * 12);
      art = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${ac}" opacity=".9"/>` +
        `<rect x="-2" y="${n(cy + rad - 2)}" width="68" height="${n(2 + r[3] * 3)}" fill="${p[2]}" opacity=".8"/>` +
        `<circle cx="${n(cx + rad * .9)}" cy="${n(cy - rad * .7)}" r="${n(2.5 + r[4] * 3)}" fill="${p[2]}"/>`;
    }

    return `<svg class="cover ${cls || ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="${n(r[7])}" y2="1">
        <stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/>
      </linearGradient></defs>
      <rect width="64" height="64" fill="url(#${id})"/>${art}</svg>`;
  }

  /* A lightstick colour at low opacity. CSS cannot fade an arbitrary hex without
     color-mix, and an act's identity has to reach a background wash as well as a
     border — so the one place a colour is diluted is here, and every card that
     wants one gets `--wash` beside `--accent`. */
  function tint(hex, a) {
    const h = String(hex || '').replace('#', '');
    const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const num = parseInt(v, 16);
    if (v.length !== 6 || !isFinite(num)) return 'rgba(255,46,134,' + a + ')';
    return 'rgba(' + ((num >> 16) & 255) + ',' + ((num >> 8) & 255) + ',' + (num & 255) + ',' + a + ')';
  }

  /* The two custom properties an act's identity travels on. Written once so
     that a card, a chart rung and a schedule row can never drift apart. */
  const skin = (color) => `--accent:${color};--wash:${tint(color, .20)}`;

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
    // The weakest stat with room left is marked on its own button, so the most
    // common training call is read off the button rather than the bars above it.
    // An exhausted idol's card already says "rest them"; an arrow pointing at a
    // stat would be the opposite advice on the same card.
    const weak = t.stamina < KP.trainHint.exhausted ? null : KP.weakestStat(t);
    return `<div class="focus-grid">` + FOCI.map(f => {
      const isWeak = f.k === weak;
      const tip = isWeak
        ? ` title="Weakest stat · ${Math.round(t.stats[f.k])} of ${Math.round(t.potential[f.k])} ceiling"` : '';
      return `<button class="focus-btn ${f.k === 'rest' ? 'rest' : ''} ${t.focus === f.k ? 'is-on' : ''} ${isWeak ? 'is-weak' : ''}"
        data-act="focus" data-id="${t.id}" data-key="${f.k}"${tip}>${f.l}${isWeak ? '<em>▼</em>' : ''}</button>`;
    }).join('') + `</div>`;
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

    // Seven years from debut, and the last of them is a decision. The chip is on
    // the person rather than only in the table because that is where the player
    // is already looking when they wonder who is worth keeping.
    const left = KP.contractLeft(st, t);
    const contract = left == null ? '' : KP.inRenewWindow(st, t)
      ? `<span class="chip hot" title="Renew them or they walk when the term ends">📄 ${left}w left</span>`
      : `<span class="chip" title="Contract runs to the end of the term">📄 ${
        (left / KP.WEEKS_PER_YEAR).toFixed(1)}y</span>`;
    const fame = t.fame > 0
      ? `<span class="chip cool" title="What the public already knows them for — it fades every week they are not on screen">📺 ${Math.round(t.fame)}</span>`
      : '';

    let footer = '';
    if (mode === 'trainee') {
      footer = injured
        ? `<div class="chip hot">Injured · ${t.statusWeeks}w left</div>`
        : group
          // The act's own colour on the chip, so a roster of twenty faces sorts
          // itself into groups at a glance rather than by reading every card.
          ? `<div class="row"><span class="chip act" style="${skin(group.color)}">${U.esc(group.name)}</span><span class="chip">${U.esc(t.position || '')}</span>${contract}${fame}</div>${focusGrid(t)}`
          : focusGrid(t) + `<div class="row" style="margin-top:8px">${fame}<span class="spacer"></span>
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
        ${t.stamina < KP.trainHint.exhausted && t.status !== 'injured' ? '<span class="chip hot">Exhausted — rest them</span>' : ''}
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
      ['out', 'Platform fees', L.out.platform, 'streaming commitments'],
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
      return `<div class="card group-card" style="${skin(g.color)}">
        <div class="now-playing">
          ${coverArt(KP.relCover(g, rel), 'lg')}
          <div>
            <div class="eyebrow">Promoting · week ${rel.week}/${rel.promoWeeks}</div>
            <h3 style="font-size:19px;margin:6px 0 2px">${U.esc(rel.title)}</h3>
            <div class="group-kr">${U.esc(g.name)} · ${U.esc(KP.concept(rel.concept).name)}</div>
          </div>
        </div>
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

  /* The renewal table. Everybody inside the last year of their term, what they
     are asking, and — the number the whole system exists for — what they think
     of you. Nothing here is computed for display: the price and the mood are
     the ones E.renewContract charges and judges. */
  function contractsCard(st) {
    const C = KP.contracts;
    const due = KP.renewals(st);
    if (!due.length) return '';
    const rows = due.map(t => {
      const g = st.groups.find(x => x.id === t.groupId);
      const left = KP.contractLeft(st, t);
      const mood = KP.renewMood(st, t);
      const will = KP.willRenew(st, t);
      const cost = KP.renewCost(st, t);
      const poor = st.company.money < cost;
      return `<div class="led-row">
        <span class="led-label">${U.esc(t.name)}
          <i>${U.esc(g ? g.name : '')} · ovr ${KP.overall(t)} · ${left} week${left === 1 ? '' : 's'} left ·
            morale ${Math.round(t.morale)} and a room at ${Math.round(g ? KP.chemistry(st, g) : 50)} →
            mood ${Math.round(mood)}</i></span>
        ${will
          ? `<button class="btn btn-sm ${poor ? '' : 'btn-primary'}" data-act="renew" data-id="${t.id}"
              ${poor ? 'disabled' : ''}>Re-sign · ${U.money(cost)}</button>`
          : `<b class="neg">Will not re-sign</b>`}
      </div>`;
    }).join('');
    return `<div class="card" style="margin-bottom:20px;border-color:var(--hot)">
      <div class="sec-head"><h2>Contracts</h2><span class="kr">재계약</span>
        <p>${due.length} inside the final year of a ${C.termYears}-year term</p></div>
      <div class="ledger">${rows}</div>
      <p class="tiny muted" style="margin:12px 0 0">Seven years from debut, and the last of them is a
        negotiation. What they are asking is what they are worth — their own ceiling, the fandom behind them,
        the trophies on the shelf — multiplied by what they think of you. Below mood ${C.refuseBelow} there is no
        number: a group that was worked into the ground walks out and signs somewhere else, and the week the
        term ends it happens whether the office was watching or not.</p>
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

    // Debuted idols are filed under their act, in the act's own line-up order,
    // so a roster of twenty faces reads as four groups rather than one pile.
    // Units are skipped: their members already sit under the parent group.
    const seen = {};
    const byGroup = KP.mainGroups(st).map(g => {
      const members = KP.memberOf(st, g).filter(t => t.groupId === g.id && !seen[t.id]);
      members.forEach(t => { seen[t.id] = true; });
      return { g, members };
    }).filter(x => x.members.length);
    const stray = debuted.filter(t => !seen[t.id]);
    const groupBlock = ({ g, members }) => `<div class="roster-group" style="${skin(g.color)}">
        <div class="roster-head"><span class="chip act" style="${skin(g.color)}">${U.esc(g.name)}</span>
          <span class="tiny muted">${members.length} member${members.length === 1 ? '' : 's'}</span></div>
        <div class="grid g-3">${members.map(t => idolCard(t, 'trainee')).join('')}</div>
      </div>`;

    return head + contractsCard(st) +
      (undebuted.length ? `<div class="grid g-3">${undebuted.map(t => idolCard(t, 'trainee')).join('')}</div>` : '') +
      (debuted.length ? `<div class="sec-head" style="margin-top:28px"><h2>Debuted idols</h2><span class="kr">아이돌</span>
        <p>${debuted.length} across ${byGroup.length} group${byGroup.length === 1 ? '' : 's'} · still training between schedules</p></div>
        ${byGroup.map(groupBlock).join('')}
        ${stray.length ? `<div class="grid g-3">${stray.map(t => idolCard(t, 'trainee')).join('')}</div>` : ''}` : '');
  }

  /* The other end of the audition room: a broadcaster's budget, ten weeks of
     television, and a finals night the public has already decided. While it runs
     this is a vote board — which is the point, because the name at the top of it
     is rarely the name at the top of the ceiling column. */
  function survivalCard(st) {
    const S = KP.survival;
    const sv = st.survival;

    if (!sv) {
      const block = KP.engine.survivalBlock(st);
      return `<div class="card" style="margin-bottom:20px">
        <div class="sec-head"><h2>Survival show</h2><span class="kr">서바이벌</span>
          <p>${S.weeks} weeks on air · ${S.cast} contestants · sign ${S.picks} of the ${S.finalists} finalists</p>
          <span class="spacer"></span>
          <button class="btn btn-primary" data-act="survival-start" ${block ? 'disabled' : ''}>
            Commission · ${U.money(S.cost)}</button></div>
        <p class="tiny ${block ? 'neg' : 'muted'}" style="margin:-6px 0 0">${block ? U.esc(block) + ' ' : ''}An
          audition round is six names and whoever you leave is signed by somebody else. A season is the other end
          of that: a cast the country watches for ten weeks, reputation and public mood every week it is on, and a
          finals night where the two contestants worth signing are the one the public voted for and the one the
          scouting report likes. They are almost never the same person, and you get ${S.picks}.</p>
      </div>`;
    }

    const ranked = KP.survivalRanked(st);
    const top = ranked[0] ? ranked[0].votes : 1;
    const rows = ranked.map((t, i) => `<div class="led-row">
      <span class="led-label">${i + 1}. ${U.esc(t.name)}
        <i>${t.age}y · ovr ${KP.overall(t)} · ceiling ${KP.potentialOverall(t)} ·
          screen ${Math.round(KP.screenPresence(t))}</i></span>
      <div class="bar thin ${i === 0 ? 'life' : 'calm'}" style="max-width:120px">
        <u style="width:${U.clamp(t.votes / (top || 1) * 100, 2, 100).toFixed(0)}%"></u></div>
      <b class="mono">${U.num(Math.round(t.votes))}</b>
    </div>`).join('');

    return `<div class="card" style="margin-bottom:20px;border-color:var(--cool)">
      <div class="sec-head"><h2>Survival show</h2><span class="kr">서바이벌</span>
        <p>${sv.ready ? 'The finals are in' : KP.survivalLeft(st) + ' weeks to the finals'} ·
          public vote</p>
        <span class="spacer"></span>
        ${sv.ready ? `<button class="btn btn-primary" data-act="open-finals">Finals night</button>` : ''}</div>
      <div class="ledger">${rows}</div>
      <p class="tiny ${sv.ready ? 'neg' : 'muted'}" style="margin:12px 0 0">${sv.ready
        ? 'Sign up to ' + S.picks + ' of them before the week turns. Whoever you leave in that room is signed by '
          + 'somebody else in the same week — and if the week turns without an offer, all of them are.'
        : 'The public is voting on what it can see: visuals, presence and whether they are entertaining. '
          + 'Reputation and public mood go up every week it is on air, whoever wins.'}</p>
    </div>`;
  }

  function scoutTab(st) {
    const head = `<div class="sec-head">
      <h2>Auditions</h2><span class="kr">오디션</span>
      <p>Standing ${Math.round(KP.standing(st))} (reputation ${Math.round(st.company.rep)}) — better applicants show up as you grow</p>
      <span class="spacer"></span>
      <button class="btn" data-act="refresh-scouts">New round · ${U.money(KP.costs.scoutRefresh)}</button>
    </div>`;
    if (!st.scoutPool.length) {
      return head + survivalCard(st) + `<div class="empty"><b>Room's empty</b>Call a new audition round.</div>`;
    }
    return head + survivalCard(st) +
      `<div class="grid g-3">${st.scoutPool.map(t => idolCard(t, 'scout')).join('')}</div>`;
  }

  /* Chemistry reads as what it is worth, not as a raw average: a settled room is
     ×1.00 and everything the player can see is the spread away from it. */
  function chemChip(st, g) {
    const c = KP.chemistry(st, g);
    const p = KP.chemPerf(st, g);
    return `<span class="chip ${p > 1.02 ? 'cool' : p < .98 ? 'hot' : ''}"
      title="Average bond across the line-up. Song quality ${mul(p)}.">♥ ${Math.round(c)}</span>`;
  }

  function groupCard(st, g) {
    const members = KP.memberOf(st, g);
    const unit = KP.isUnit(g);
    const spec = KP.unitSpec(g);
    const parent = unit ? KP.parentOf(st, g) : null;
    const units = unit ? [] : KP.unitsOf(st, g.id);
    // A renewal is a deadline, so the card carries it rather than making the
    // player go and look: whoever is closest to their cliff, and how close.
    const due = unit ? [] : members.filter(m => KP.inRenewWindow(st, m))
      .sort((a, b) => KP.contractLeft(st, a) - KP.contractLeft(st, b));

    const strip = members.map(m => `<div class="member">
      ${avatar(m)}<em>${U.esc(m.name.split(' ')[0])}</em><i>${unit ? '' :
        U.esc((m.position || '').replace('Main ', ''))}</i>
    </div>`).join('');

    // The discography, with its jackets. A row that is only a peak and a number
    // reads as a spreadsheet; the same row with the sleeve beside it reads as a
    // shelf, which is what a discography is.
    const disc = g.releases.length ? `<div class="disc">${g.releases.slice(0, 5).map(r =>
      `<div class="disc-row has-art">
          ${coverArt(KP.relCover(g, r), 'xs')}
          <span class="pk ${r.peak === 1 ? 'gold' : ''}">#${r.peak}</span>
          <span>${U.esc(r.title)}</span>
          <span class="mono tiny muted">${U.num(r.sales)} sold</span>
          <span class="mono tiny ${r.wins ? 'gold' : 'muted'}">${r.wins}🏆</span>
        </div>`).join('')}</div>` : `<p class="tiny muted">No releases yet.</p>`;

    // The act's own face on its own card: whatever it is putting out right now,
    // or the last thing it did.
    const front = g.active || g.releases[0] || null;

    return `<article class="card group-card ${unit ? 'is-unit' : ''}" style="${skin(g.color)}">
        <div class="group-head">
          ${front ? coverArt(KP.relCover(g, front), 'md') : ''}
          <div>
            <div class="group-name">${U.esc(g.name)}</div>
            <div class="group-kr">${unit && spec
        ? U.esc(spec.name) + ' · ' + U.esc(parent ? parent.name : '')
        : (g.kr ? U.esc(g.kr) + ' · ' : '') + U.esc(KP.concept(g.concept).name)}</div>
            <div class="idol-meta">Debut Y${g.debut.y} W${g.debut.w} · fandom ${U.esc(g.fandom)}</div>
          </div>
          <span class="spacer"></span>
          ${chemChip(st, g)}
          ${g.active ? `<span class="chip hot">Promoting</span>` : `<span class="chip">Resting</span>`}
        </div>

        ${(g.trophies || []).length ? `<div class="row" style="margin-bottom:10px">${g.trophies.slice(0, 6).map(t =>
          `<span class="chip win" title="Year ${t.y} · ${U.esc(t.name)}">${U.esc(t.ic)} Y${t.y}</span>`).join('')}
        ${g.trophies.length > 6 ? `<span class="tiny muted">+${g.trophies.length - 6} more</span>` : ''}</div>` : ''}

        ${due.length ? `<div class="row" style="margin-bottom:10px">
          <span class="chip hot" title="Seven years from debut. Renew them or they walk.">📄 ${U.esc(due[0].name)}
            · ${KP.contractLeft(st, due[0])}w left${due.length > 1 ? ' (+' + (due.length - 1) + ')' : ''}</span>
        </div>` : ''}

        <div class="member-strip">${strip}</div>

        <div class="kv">
          <div><b>${U.num(g.fans)}</b><span>Fans</span></div>
          <div><b>${Math.round(g.momentum)}</b><span>Momentum</span></div>
          <div><b>${Math.round(KP.loyalOf(g))}</b><span>Loyalty</span></div>
          <div><b class="${KP.sentiOf(g) < 40 ? 'neg' : ''}">${Math.round(KP.sentiOf(g))}</b><span>Sentiment</span></div>
          <div><b>${Math.round(KP.intlOf(g) * 100)}%</b><span>Overseas</span></div>
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
          ${unit
        ? `<button class="btn btn-cut" data-act="unit-disband" data-id="${g.id}"
              title="Wrap the unit up — its members go back to the group full time">Wrap up</button>`
        : `<button class="btn" data-act="open-lineup" data-id="${g.id}">Line-up</button>
             <button class="btn" data-act="open-unit" data-id="${g.id}"
               ${units.length >= KP.units.maxPer ? 'disabled' : ''}>Form a unit</button>`}
          ${g.active ? `<span class="tiny muted">Promotions end in ${g.active.promoWeeks - g.active.week} weeks</span>` : ''}
        </div>
      </article>`;
  }

  function groupsTab(st) {
    const mains = KP.mainGroups(st);
    const units = st.groups.length - mains.length;
    const head = `<div class="sec-head">
      <h2>Groups</h2><span class="kr">그룹</span>
      <p>${mains.length} active${units ? ' · ' + units + ' unit' + (units === 1 ? '' : 's') : ''}</p>
      <span class="spacer"></span>
      <button class="btn btn-primary" data-act="open-debut">Form a group</button>
    </div>`;

    if (!st.groups.length) {
      return head + `<div class="empty"><b>No group yet</b>Three trainees and a showcase budget is all it takes.</div>`;
    }

    // A unit is drawn immediately after the group it came out of, because that
    // is what it is: the same people, and the same stamina, under a second name.
    const cards = mains.map(g =>
      [groupCard(st, g)].concat(KP.unitsOf(st, g.id).map(u => groupCard(st, u))).join('')).join('');

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
    const lives = st.bookings.filter(b => KP.isGig(b.kind)).map(b => {
      const g = st.groups.find(x => x.id === b.groupId);
      return { b, g, pv: g ? KP.engine.livePreview(st, g, b.show, b.absWeek, b.kind) : null };
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
          const leg = b.tourId ? ' · leg ' + b.leg + '/' + b.legs : '';
          return `<span class="chip ${tone}">${U.esc(spec.name)}${U.esc(leg)}</span>
            <button class="btn btn-sm btn-cut" data-act="book-cancel" data-id="${b.id}"
              title="${b.tourId ? 'Cancels the whole tour — legs inside ' + B.lateWeeks + ' weeks return nothing'
              : late ? 'Too late for a refund — pulling out now costs reputation'
                : 'Cancel · ' + U.money(Math.round(b.fee * B.cancelBack)) + ' recovered'}">✕</button>`;
        }).join('');
        return `<div class="sw-row" style="${skin(g.color)}">
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

  /* How a record prints itself. The only thing this screen reads off an entry
     it does not otherwise understand, which is why `fmt` is a data field on
     KP.recordKinds rather than a switch keyed to the record's name. */
  function recordValue(spec, v) {
    if (spec.fmt === 'money') return U.money(v);
    if (spec.fmt === 'weeks') return v + ' week' + (v === 1 ? '' : 's');
    if (spec.fmt === 'pts') return v.toFixed ? v.toFixed(0) + ' pts' : v + ' pts';
    return U.num(v);
  }

  /* The hall. Ten high-water marks, and the empty ones are shown rather than
     hidden: a record nobody has set yet is a thing to go and do, and a hall that
     grows a row every time you break one is a hall that hides what is missing. */
  function recordsCard(st) {
    const set = KP.recordsSet(st);
    const rows = KP.recordsOf(st).map(({ spec, rec }) => `<div class="rec ${rec ? '' : 'is-empty'}">
      <span class="rec-ic">${U.esc(spec.ic)}</span>
      <div class="rec-nm">${U.esc(spec.name)}<i>${U.esc(spec.desc)}</i></div>
      <div class="rec-v">${rec
        ? `<b>${U.esc(recordValue(spec, rec.v))}</b>
           <i>${U.esc(rec.by)}${rec.sub ? ' · ' + U.esc(rec.sub) : ''} · Y${rec.y} W${rec.w}</i>`
        : `<b class="muted">—</b><i>not set</i>`}</div>
    </div>`).join('');

    return `<div class="sec-head" style="margin-top:28px">
      <h2>Hall of records</h2><span class="kr">기록실</span>
      <p>${set} of ${KP.recordKinds.length} set</p></div>
      <div class="card"><div class="recs">${rows}</div>
        <p class="tiny muted" style="margin:14px 0 0">Every line here is a high-water mark for the whole run:
          the week it happened, who did it, and nothing about the week it was beaten in. Nothing is ever taken
          off this board — a record you no longer hold is a record somebody in this building still set.</p>
      </div>`;
  }

  /* One year, as a card: the numbers first, then whatever it won. The two are
     stored apart — a year with nothing on the ballot has a review and no
     ceremony — so the card renders whichever of them exists. */
  function yearCard(st, y) {
    const rev = KP.reviewOf(st, y);
    const aw = st.awards.find(a => a.y === y);
    const s = rev ? rev.stats : null;
    const cal = (rev && rev.calendarYear) || (aw && aw.calendarYear) || 0;

    const nums = !rev ? '' : `<div class="kv" style="margin:10px 0 0">
      <div><b>${s.releases}</b><span>Releases</span></div>
      <div><b class="${s.no1 ? 'gold' : ''}">${s.no1}</b><span>#1 singles</span></div>
      <div><b>${U.num(rev.cp)}</b><span>Chart points</span></div>
      <div><b>${U.num(rev.sales)}</b><span>Albums</span></div>
      <div><b>${U.num(rev.fansEnd)}</b><span>Fans at year end</span></div>
      <div><b>${U.money(rev.cash)}</b><span>Cash</span></div>
    </div>`;

    const prizes = !aw ? `<p class="tiny muted" style="margin:10px 0 0">No ceremony — nothing charted far
      enough to reach a ballot.</p>`
      : `<div class="disc" style="margin-top:10px">${aw.results.map(r => `<div class="disc-row">
          <span class="pk ${r.mine ? 'gold' : ''}">${U.esc(r.ic)}</span>
          <span>${U.esc(r.winner)}${r.by ? ' <span class="muted">— ' + U.esc(r.by) + '</span>' : ''}</span>
          <span class="mono tiny muted">${U.esc(r.name)}</span>
          <span class="mono tiny ${r.mine ? 'gold' : 'muted'}">${r.mine ? 'YOURS' : ''}</span>
        </div>`).join('')}</div>`;

    return `<div class="card" style="margin-bottom:10px">
      <div class="sw-head" style="border:0;padding:0;margin:0">
        <b class="mono">Year ${y}${cal ? ' · ' + cal : ''}</b>
        ${rev && rev.best ? `<span class="chip cool">🎵 ${U.esc(rev.best.title)}</span>` : ''}
        <span class="spacer"></span>
        ${rev ? `<button class="btn btn-sm" data-act="open-review" data-y="${y}">The year in review</button>` : ''}
      </div>
      ${nums}
      ${prizes}
    </div>`;
  }

  function chartTab(st) {
    const s = KP.seasonNow(st);
    const head = `<div class="sec-head"><h2>Weekly chart</h2><span class="kr">주간 차트</span>
      <p>Digital + physical combined, Y${st.year} W${st.week}</p>
      <span class="spacer"></span>
      <span class="chip ${s.field > 1 ? 'hot' : 'cool'}">${U.esc(s.name)} · rivals ×${s.field.toFixed(2)}</span></div>`;

    // Every year the run has finished, newest first. This tab is the game's
    // memory: nothing else anywhere keeps a chart year after the rollover.
    const years = [];
    (st.reviews || []).forEach(r => { if (years.indexOf(r.y) < 0) years.push(r.y); });
    st.awards.forEach(a => { if (years.indexOf(a.y) < 0) years.push(a.y); });
    years.sort((a, b) => b - a);
    const hist = !years.length ? '' : `<div class="sec-head" style="margin-top:28px">
      <h2>The years</h2><span class="kr">연혁</span>
      <p>${years.length} year${years.length === 1 ? '' : 's'} on record</p></div>
      ${years.map(y => yearCard(st, y)).join('')}`;

    const tail = recordsCard(st) + hist;

    if (!st.chart || !st.chart.length) {
      return head + `<div class="empty"><b>Chart not published yet</b>Advance a week to see where the market stands.</div>` + tail;
    }
    const rows = st.chart.slice(0, 20).map(r => {
      // A song with an agency behind it says so — the rest of the ladder is the
      // anonymous market, and the difference is the whole of Sprint 3. What is
      // new here is that all three kinds now have a face: the sleeve is derived
      // from the song, so the ladder is covered end to end rather than only the
      // rows the game keeps records for.
      const act = r.rid ? KP.rivalAct(st, r.rid) : null;
      const by = act ? ' · ' + KP.rivalSpec(act.r).name : '';
      const g = r.mine ? st.groups.find(x => x.id === r.groupId) : null;
      const color = g ? g.color : act ? KP.rivalSpec(act.r).color : '';
      return `<div class="rung ${r.mine ? 'mine' : ''} ${r.rank === 1 ? 'top1' : ''}"
        ${color ? `style="${skin(color)}"` : ''}>
      <div class="rk">${r.rank}</div>
      ${coverArt(KP.rowCover(st, r), 'sm')}
      <div><div class="ttl">${U.esc(r.title)}</div><div class="art">${U.esc(r.artist)}${U.esc(by)}</div></div>
      <div class="pts">${r.points.toFixed(1)}</div>
    </div>`;
    }).join('');
    return head + `<div class="card"><div class="ladder">${rows}</div></div>` + tail;
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

      return `<article class="card group-card" style="${skin(sp.color)}">
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

  /* ------------------------------ the fandom ------------------------------
     One screen for the three numbers that say what kind of fandom a group has,
     what each of them is currently worth as a multiplier, who is standing
     outside the dormitory, and the two contracts that move the split. Every
     number here is read from the same derivations the engine spends — nothing
     on this screen is computed for display. */

  function meter(label, kr, value, pct, tone) {
    return `<div class="trend">
      <span class="nm">${U.esc(label)}<em>${U.esc(kr)}</em></span>
      <i>${U.esc(value)}</i>
      <div class="bar ${tone || 'calm'}"><u style="width:${U.clamp(pct, 0, 100).toFixed(1)}%"></u></div>
    </div>`;
  }

  /* A multiplier reads as a multiplier: 1.00 is the group you debuted. */
  function mul(x) { return '×' + x.toFixed(2); }
  function mulTone(x) { return x > 1.02 ? 'pos' : x < .98 ? 'neg' : ''; }

  function fandomCard(st, g) {
    const F = KP.fandom;
    const m = KP.fanMods(g);
    const split = KP.fandomSplit(g);
    const press = KP.pressure(st, g);
    const dorm = st.company.facilities.dorm;
    const target = KP.engine.intlTarget(st, g);
    const quiet = g.lastReleaseAbs == null ? null : KP.absWeek(st) - g.lastReleaseAbs;

    return `<article class="card group-card" style="${skin(g.color)}">
      <div class="group-head">
        <div>
          <div class="group-name">${U.esc(g.name)}</div>
          <div class="group-kr">${U.num(g.fans)} fans · ${U.esc(g.fandom || '')}</div>
        </div>
        <span class="spacer"></span>
        ${g.active ? `<span class="chip hot">Promoting</span>` : `<span class="chip">Resting</span>`}
      </div>

      ${meter('Loyalty', '충성도', Math.round(KP.loyalOf(g)) + ' / 100', KP.loyalOf(g), 'life')}
      ${meter('Public sentiment', '여론', Math.round(KP.sentiOf(g)) + ' / 100', KP.sentiOf(g))}
      ${meter('International', '해외 비중', Math.round(KP.intlOf(g) * 100) + '% · heading for '
        + Math.round(target * 100) + '%', KP.intlOf(g) * 100, 'warm')}

      <div class="kv" style="margin-top:14px">
        <div><b>${U.num(split.home)}</b><span>At home</span></div>
        <div><b>${U.num(split.intl)}</b><span>Overseas</span></div>
        <div><b class="${mulTone(m.sales)}">${mul(m.sales)}</b><span>Album sales</span></div>
        <div><b class="${mulTone(m.merch)}">${mul(m.merch)}</b><span>Merch</span></div>
        <div><b class="${mulTone(m.stream)}">${mul(m.stream)}</b><span>Streaming</span></div>
        <div><b class="${mulTone(m.acq)}">${mul(m.acq)}</b><span>New fans</span></div>
        <div><b class="${mulTone(m.pull)}">${mul(m.pull)}</b><span>Ticket demand</span></div>
        <div><b class="${mulTone(m.hype)}">${mul(m.hype)}</b><span>Comeback hype</span></div>
      </div>

      <div class="riv-g">
        <div class="riv-head">
          <span class="riv-nm">Outside the dorm</span>
          <span class="tiny muted">sasaeng &amp; antifan pressure</span>
          <span class="spacer" style="margin-left:auto"></span>
          <span class="chip ${press > F.pressFloor ? 'hot' : ''}">${Math.round(press)}${
            press > F.pressFloor ? '' : ' · quiet'}</span>
        </div>
        <div class="bar ${press > F.pressFloor ? 'warm' : 'calm'}"><u style="width:${press.toFixed(0)}%"></u></div>
        <p class="tiny muted" style="margin:8px 0 0">${press > F.pressFloor
        ? 'Fame buys an audience that does not go home, and low sentiment multiplies it. Every week above '
          + F.pressFloor + ' costs morale, and somebody has a bad week roughly every '
          + Math.max(1, Math.round(KP.memberOf(st, g).length ? F.pressRoll / press / KP.memberOf(st, g).length : 99))
          + ' weeks. ' + (dorm > 1
            ? 'The dormitory at Lv' + dorm + ' is already holding ' + ((dorm - 1) * F.pressDorm)
              + ' points of it down; another level takes off ' + F.pressDorm + ' more.'
            : 'A bigger dormitory is the only thing that buys it back — Lv2 would take '
              + F.pressDorm + ' points off this number.')
        : 'Nobody is camping outside. The dormitory at Lv' + dorm + ' is comfortably ahead of the attention.'}</p>
      </div>

      <p class="tiny muted" style="margin:12px 0 0">${quiet != null && quiet > F.quietFrom && !g.active
        ? '⚠ ' + quiet + ' weeks since the last release — a fandom with nothing to talk about loses '
          + F.quietLoyal.toFixed(2) + ' loyalty a week on top of the drift.'
        : 'Loyalty is built by going out — a fan meeting, a variety slot, a stage — and spent by growing: '
          + 'every new fan arrives at ' + F.newFanLoyal + ' and is averaged in.'}</p>
    </article>`;
  }

  /* The platform deals: an advance now, a bill every week, and a multiplier on
     streaming revenue only. Signed straight from the row — there is nothing to
     configure, so there is nothing to put in a modal. */
  function dealsCard(st) {
    const D = KP.deals;
    const open = st.company.deals || [];
    const mulNow = KP.streamMul(st);

    const rows = open.length ? `<div class="ledger">${open.map(d => {
      const sp = KP.platformSpec(d);
      const won = d.earned >= d.paid;
      return `<div class="led-row">
        <span class="led-label">${U.esc(sp.name)}<i class="${won ? 'pos' : ''}">${d.weeksLeft}w left ·
          ${U.money(sp.weekly)} a week · ${U.money(d.earned)} of streaming earned against
          ${U.money(d.paid)} paid</i></span>
        <b class="${won ? 'pos' : 'neg'}">${mul(sp.streamMul)}</b>
      </div>`;
    }).join('')}</div>` : `<p class="tiny muted" style="margin:6px 0 0">No platform behind you. Streaming
      revenue is whatever the chart gives you.</p>`;

    const offers = KP.platforms.map(p => {
      const block = KP.engine.dealBlock(st, p.k);
      return `<button class="opt ${block ? 'locked' : ''}" ${block ? 'disabled' : ''}
          data-act="deal-take" data-key="${p.k}">
        <div><b>${U.esc(p.name)}
          <span style="font-family:var(--kr);font-weight:400;color:var(--lilac)">${U.esc(p.kr)}</span></b>
          <small>${U.esc(p.desc)}${block ? ' · ' + U.esc(block) : ''}</small></div>
        <span class="q">${mul(p.streamMul)} streams · ${Math.round(p.intlPull * 100)}% overseas · ${p.weeks}w</span>
        <span class="c">+${U.money(p.advance)} / −${U.money(p.weekly)}w</span>
      </button>`;
    }).join('');

    return `<div class="card">
      <div class="sec-head"><h2>Platform deals</h2><span class="kr">플랫폼</span>
        <p>${open.length} of ${D.maxDeals} signed · streaming ${mul(mulNow)}</p></div>
      ${rows}
      <div class="opt-list" style="margin-top:14px">${offers}</div>
      <p class="tiny muted" style="margin:12px 0 0">An advance the week you sign, a commitment fee in the weekly
        books every week after it, and a multiplier that lands on streaming revenue and nothing else — so a deal
        signed with nothing out is a bill and no more. The term runs to the end; there is no buyout. What it also
        does is drag the fandom overseas, which is the half a tour cannot do on its own.</p>
    </div>`;
  }

  function scandalBanner(st) {
    const s = st.scandal;
    if (!s) return '';
    const g = st.groups.find(x => x.id === s.gid);
    const spec = KP.scandalSpec(s);
    if (!g || !spec) return '';
    return `<div class="card" style="margin-bottom:16px;border-color:var(--hot)">
      <div class="sec-head"><h2>${U.esc(spec.ic)} ${U.esc(spec.name)}</h2><span class="kr">${U.esc(spec.kr)}</span>
        <p>${U.esc(s.who)} · ${U.esc(g.name)} · severity ${s.sev}</p>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-act="open-scandal">Answer it</button></div>
      <p class="tiny neg" style="margin:-6px 0 0">${U.esc(spec.desc)}. An answer is owed this week — if the week
        turns without one, the agency has answered with silence.</p>
    </div>`;
  }

  function fandomTab(st) {
    const head = `<div class="sec-head"><h2>The fandom</h2><span class="kr">팬덤</span>
      <p>${U.num(KP.totalFans(st))} people, and what kind of people they are</p></div>`;

    // The deals card stays even with nobody on the roster: a platform contract is
    // signed by the agency rather than by a group, and the terms are worth
    // reading long before the fandom gate opens.
    if (!st.groups.length) {
      return head + scandalBanner(st) +
        `<div class="empty"><b>No fandom yet</b>Debut a group and it starts the week it plays its first stage.</div>` +
        `<div style="margin-top:16px">${dealsCard(st)}</div>`;
    }

    const totalIntl = st.groups.reduce((s, g) => s + KP.fandomSplit(g).intl, 0);
    const totalFans = KP.totalFans(st);
    const summary = `<div class="card" style="margin-bottom:16px">
      <div class="kv" style="margin:0">
        <div><b>${U.num(totalFans)}</b><span>Total fans</span></div>
        <div><b>${U.num(totalIntl)}</b><span>Overseas</span></div>
        <div><b>${totalFans ? Math.round(totalIntl / totalFans * 100) : 0}%</b><span>International share</span></div>
        <div><b>${U.money(KP.ledger(st).in.merch)}</b><span>Merch per week</span></div>
        <div><b>${st.stats.tourLegs}</b><span>Tour legs played</span></div>
        <div><b class="${st.stats.scandals ? 'neg' : ''}">${st.stats.scandals}</b><span>Scandals</span></div>
      </div>
      <p class="tiny muted" style="margin:12px 0 0">Loyalty is who buys, sentiment is what everybody else thinks,
        and the international share decides which of the two halves of the business you are in: home fans buy
        albums and vote, overseas fans stream, pay a premium for goods and are the only people a world tour can
        sell a seat to.</p>
    </div>`;

    return head + scandalBanner(st) + summary +
      `<div class="grid g-2">${st.groups.map(g => fandomCard(st, g)).join('')}</div>` +
      `<div style="margin-top:16px">${dealsCard(st)}</div>`;
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

    // A renewal outranks a head count: one is a number the player already knows
    // and the other is a deadline that ends a career if it is missed.
    const due = KP.renewals(st).length;
    $('#badge-trainees').textContent = due ? '!' + due : (st.trainees.filter(t => !t.groupId).length || '');
    // Same rule on Scouting: a finals night is a decision with one week on it.
    $('#badge-scout').textContent = st.survival && st.survival.ready ? '!'
      : KP.survivalRunning(st) ? String(KP.survivalLeft(st))
        : (st.scoutPool.length || '');
    $('#badge-groups').textContent = st.groups.length || '';
    $('#badge-sched').textContent = st.bookings.length || '';
    // The rail is where a wall is worth noticing: how many announced rival
    // comebacks are inside the window you can still move a release around.
    $('#badge-rivals').textContent =
      KP.rivalPlansIn(st, KP.absWeek(st) + 1, KP.absWeek(st) + KP.rivals.announceLead).length || '';
    // A story waiting for an answer is the one badge that is a deadline rather
    // than a count, so it says so with a mark instead of a number.
    $('#badge-fandom').textContent = st.scandal ? '!' : '';

    document.querySelectorAll('.rail-btn').forEach(b =>
      b.classList.toggle('is-on', b.dataset.tab === ui.tab));

    // Same order as the rail in index.html and the tabs array in main.js.
    const views = {
      dash: officeTab, trainees: traineesTab, scout: scoutTab, groups: groupsTab,
      sched: schedTab, chart: chartTab, rivals: rivalsTab, fandom: fandomTab, log: logTab
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
    const nameTaken = st.groups.some(g => g.name === w.name.trim());
    const canGo = members.length >= 3 && st.company.money >= KP.costs.debutShowcase
      && w.name.trim().length > 0 && !nameTaken;

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
        <span class="tiny ${nameTaken ? 'neg' : 'muted'}">${nameTaken
          ? 'You already have an act called that.'
          : 'Positions are assigned automatically from stats and age.'}</span>
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
        <div class="row" style="align-items:stretch">
          <!-- The sleeve is a pure function of the title, the concept and the
               act, so it is already decided before the song is: this is the
               real one, not a mock-up of it. -->
          ${coverArt(KP.songCover({ mine: true, title: p.title, concept: p.concept, color: g.color, groupId: g.id }), 'lg')}
          <div class="grid" style="flex:1;min-width:200px;gap:8px;align-content:center">
            <input class="text-in" data-act="plan-title" value="${U.esc(p.title)}" maxlength="26">
            <div class="row">
              <button class="btn btn-sm" data-act="plan-reroll">Suggest another</button>
              <span class="tiny muted">${U.esc(KP.concept(p.concept).name)} sleeve</span>
            </div>
          </div>
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
      <p class="tiny muted" style="margin:8px 2px 0">First-week albums ≈ <b>${U.num(pv.units)}</b> copies at
        loyalty ${Math.round(KP.loyalOf(g))} and ${Math.round(KP.intlOf(g) * 100)}% overseas (×${pv.mods.sales.toFixed(2)}),
        and the public is currently worth ×${pv.mods.hype.toFixed(2)} on hype${pv.mods.hype < .99
        ? ' — a cold room is a smaller opening than the same song deserves.' : '.'}</p>
      <p class="tiny ${pv.chem < .99 ? 'neg' : 'muted'}" style="margin:8px 2px 0">The room is at
        <b>${Math.round(KP.chemistry(st, g))}</b>, worth ×${pv.chem.toFixed(2)} on song quality${pv.chem < .99
        ? ' — the one number in this planner you cannot buy this week.' : '.'}</p>
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

    const isTour = bk.kind === 'tour';
    const isLive = KP.isGig(bk.kind);
    const shows = KP.showsOf(bk.kind).map(s => {
      const block = KP.engine.bookBlock(st, g, bk.kind, s.k, bk.abs);
      const pv = KP.engine.bookPreview(st, g, bk.kind, s.k, bk.abs);
      const note = block ? ' · ' + block
        : isLive ? ' · ' + U.num(pv.breakEven) + ' seats a night to break even'
          : ' · ' + pv.slots + ' slot' + (pv.slots === 1 ? '' : 's') + ' left';
      return `<button class="opt ${bk.show === s.k ? 'is-on' : ''} ${block ? 'locked' : ''}"
          ${block ? 'disabled' : ''} data-act="book-show" data-key="${s.k}">
        <div><b>${U.esc(s.name)}
          <span style="font-family:var(--kr);font-weight:400;color:var(--lilac)">${U.esc(s.kr)}</span></b>
          <small>${U.esc(s.desc)}${isLive ? ' · ' + U.num(s.cap) + ' seats' : ''}${
        isTour ? ' × ' + s.legs + ' legs · needs ' + Math.round(s.intl * 100) + '% overseas' : ''}${U.esc(note)}</small></div>
        <span class="q">${isLive
          ? U.num(pv.lo) + '–' + U.num(pv.hi) + ' seats' + (isTour ? '/night' : '')
          : bk.kind === 'music'
            ? '+' + s.points.toFixed(1) + ' pts'
            : 'variety ' + s.need + '+'}</span>
        <span class="c">${U.money(isTour ? s.cost * s.legs : isLive ? s.cost : s.fee)}</span>
      </button>`;
    }).join('');

    const s = bk.show ? KP.showSpec(bk.kind, bk.show) : null;
    const pv = s ? KP.engine.bookPreview(st, g, bk.kind, bk.show, bk.abs) : null;
    const block = s ? KP.engine.bookBlock(st, g, bk.kind, bk.show, bk.abs) : 'Pick a show.';
    const upfront = s ? (isLive ? pv.totalCost : s.fee) : 0;
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
        <div><b class="neg">${U.money(pv.totalCost)}</b><span>Paid up front${isTour ? ' · ' + pv.legs + ' legs' : ''}</span></div>
        <div><b>${U.num(pv.breakEven)}</b><span>Seats to break even</span></div>
        <div><b>${U.num(pv.lo)}–${U.num(pv.hi)}</b><span>Attendance${isTour ? ' a night' : ''}</span></div>
        <div><b>${Math.round(pv.fillLo * 100)}–${Math.round(pv.fillHi * 100)}%</b><span>Fill</span></div>
        <div><b class="${pv.doomed ? 'neg' : pv.safe ? 'pos' : ''}">${U.money(pv.grossLo * pv.legs)}–${U.money(pv.grossHi * pv.legs)}</b><span>Gate${isTour ? ', all legs' : ''}</span></div>
        <div><b>${s.stamina}${isTour ? ' ×' + pv.legs : ''}</b><span>Stamina each</span></div>
      </div>
      <p class="tiny ${pv.doomed ? 'neg' : pv.safe ? 'pos' : 'muted'}" style="margin:8px 2px 0">
        ${pv.doomed
          ? 'This ' + (isTour ? 'tour' : 'venue') + ' cannot break even on your fandom. Do not book it.'
          : pv.safe
            ? 'Even a soft week clears the production cost.'
            : 'A soft week loses money here. Momentum, an active comeback and the season all move the gate.'}
        ${isTour
          ? 'A tour sells to the ' + U.num(pv.crowd) + ' fans you have overseas and to nobody else, over '
            + pv.legs + ' consecutive weeks the group cannot be anywhere else. '
          : ''}Modifiers: comeback ×${pv.mods.promo.toFixed(2)} · momentum ×${pv.mods.heat.toFixed(2)} ·
        standing ×${pv.mods.stand.toFixed(2)} · loyalty ×${pv.mods.loyal.toFixed(2)} ·
        ${U.esc(pv.season.name)} ×${pv.mods.audience.toFixed(2)}${pv.mods.stale < 1
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
        <span class="eyebrow">2 — ${isTour ? 'The routing · every leg is paid the moment you confirm'
        : isLive ? 'The venue · production is paid the moment you confirm'
          : 'The booking · the fee is paid the moment you confirm'}</span>
        <div class="opt-list">${shows}</div>
      </div>

      ${est}${warn}

      <div class="modal-foot">
        <span class="tiny ${!s ? 'muted' : block ? 'neg' : afford ? 'muted' : 'neg'}">
          ${!s ? (isTour ? 'Pick a routing.' : isLive ? 'Pick a venue.' : 'Pick a show.') : block ? U.esc(block) : afford
        ? (isTour ? 'Cancelling pulls the whole tour — half back per leg, nothing inside '
          + KP.bookings.lateWeeks + ' weeks.'
          : 'Cancelling more than ' + KP.bookings.lateWeeks + ' weeks out returns half of what you paid. Inside that, nothing.')
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

  /* ---------------------------- the year in review -------------------------
     The scrapbook, and the one screen in the game that looks backwards. It
     opens before the ceremony because the two answer different questions — this
     is what you did, the ceremony is what it won — and it reads a record
     E.runReview stored rather than recomputing anything: st.yearbook was wiped
     one line after that record was written and there is nothing left to derive
     a year from.

     The headline is the one thing built here rather than stored. Which of a
     year's numbers is THE number is a reading of the year and belongs on the
     screen that shows it, on the same terms KP.fanMods is derived in state.js
     and printed in this file. */
  function reviewHeadline(rev) {
    const s = rev.stats;
    const w = rev.no1Weeks || 0;
    if (!rev.groups && !s.debuts) return 'A year spent building. Nobody debuted, and nobody had to.';
    if (!s.releases) return 'A year with nothing out. The fandom had nothing to talk about, and said so.';
    if (s.no1 >= 4) return s.no1 + ' singles went to number one. That is not a good year, that is the year an agency is remembered for.';
    if (w >= 8) return 'You held the top of the chart for ' + w + ' weeks of the year. Everybody else was working around you.';
    if (s.no1 >= 1) return 'A year with a number one in it — which is the only kind of year that changes what next year can reach.';
    if (s.departures > 0 && s.departures >= s.debuts) return 'A year of goodbyes. More people left the building than came into it.';
    if (s.lives + s.tourLegs >= 6) return 'A year on the road. The rooms were the point, and the rooms were full.';
    if (s.releases >= 3) return 'A busy year. ' + s.releases + ' campaigns, and the chart never quite gave you the week you wanted.';
    return 'A working year. Nothing broke, nothing burned, and the doors are still open.';
  }

  ui.openReview = function (y) {
    ui.review = y;
    ui.drawReview();
  };

  ui.drawReview = function () {
    const st = KP.state;
    const rev = KP.reviewOf(st, ui.review);
    if (!rev) return ui.closeModal();
    const s = rev.stats;
    const ceremony = st.pendingAwards === rev.y;

    const best = rev.best ? `<div class="rev-song">
      ${coverArt(KP.songCover({
      mine: true, title: rev.best.title, concept: rev.best.concept,
      color: rev.best.color, groupId: rev.best.groupId
    }), 'xl')}
      <div>
        <span class="eyebrow">The year's own song</span>
        <h3 style="font-size:22px;margin:6px 0 2px">${U.esc(rev.best.title)}</h3>
        <div class="group-kr" style="color:${U.esc(rev.best.color || '#B78CFF')}">${U.esc(rev.best.act)}</div>
        <p class="tiny muted" style="margin:10px 0 0">Peak #${rev.best.peak} · ${rev.best.weeks}
          week${rev.best.weeks === 1 ? '' : 's'} on the chart · ${U.num(rev.best.cp)} points of the year's
          ${U.num(rev.cp)}.</p>
      </div>
    </div>` : `<p class="tiny muted" style="margin:0 0 14px">Nothing of yours charted this year, so there is no
      song to put at the top of the page. That is a sentence worth reading again next December.</p>`;

    const table = rev.table.length ? `<div class="wiz-step">
      <span class="eyebrow">Most weeks on the chart · all ${rev.acts} acts</span>
      <div class="disc" style="margin-top:0">${rev.table.map(t => `<div class="disc-row">
        <span class="pk ${t.mine ? 'gold' : ''}">${t.rank}</span>
        <span>${U.esc(t.name)}${t.mine ? ' <span class="muted tiny">yours</span>' : ''}</span>
        <span class="mono tiny muted">${U.num(t.cp)} pts</span>
        <span class="mono tiny ${t.no1 ? 'gold' : 'muted'}">${t.no1}🏆</span>
      </div>`).join('')}</div>
      <p class="tiny muted" style="margin:8px 2px 0">Chart points are weeks charting, rank-weighted — so a
        market name that is really a label with seven releases a year outranks an agency that had the best
        year of its life. The ceremony discounts exactly that; this table does not.</p>
    </div>` : '';

    ui.modal(`
      <div class="modal-head">
        <div><div class="kr">${rev.calendarYear || ''}년 결산</div>
          <h3>Year ${rev.y} in review</h3></div>
        <button class="modal-close" data-act="modal-close">✕</button>
      </div>
      <p class="muted" style="margin:0 0 16px">${U.esc(reviewHeadline(rev))}</p>

      ${best}

      <div class="est g3">
        <div><b>${s.releases}</b><span>Releases</span></div>
        <div><b class="${s.no1 ? 'gold' : ''}">${s.no1}</b><span>#1 singles</span></div>
        <div><b class="${s.wins ? 'gold' : ''}">${s.wins}</b><span>Show wins</span></div>
        <div><b class="${rev.no1Weeks ? 'gold' : ''}">${rev.no1Weeks || 0}</b><span>Weeks at #1</span></div>
        <div><b>${U.num(rev.cp)}</b><span>Chart points</span></div>
        <div><b>${U.num(rev.sales)}</b><span>Albums sold</span></div>
      </div>

      <div class="est g3" style="margin-top:10px">
        <div><b>${U.num(rev.fans)}</b><span>New fans</span></div>
        <div><b>${s.stages}</b><span>Stages</span></div>
        <div><b>${s.varietyShows}</b><span>Variety</span></div>
        <div><b>${s.lives + s.tourLegs}</b><span>Shows played</span></div>
        <div><b>${U.num(s.tickets)}</b><span>Tickets</span></div>
        <div><b class="${s.departures ? 'neg' : ''}">${s.departures}</b><span>Departures</span></div>
      </div>

      ${table}

      <div class="est">
        <div><b>${U.num(rev.fansEnd)}</b><span>Fans at year end</span></div>
        <div><b class="${rev.cash < 0 ? 'neg' : ''}">${U.money(rev.cash)}</b><span>In the bank</span></div>
        <div><b>${rev.standing}</b><span>Standing</span></div>
        <div><b>${rev.groups}${rev.units ? ' + ' + rev.units : ''}</b><span>Acts${rev.units ? ' + units' : ''}</span></div>
        <div><b>${s.debuts}</b><span>Debuted this year</span></div>
      </div>

      <div class="modal-foot">
        <span class="tiny muted">Every year the run finishes keeps a page like this one, on the Chart tab,
          for as long as the save lives.</span>
        <span class="spacer"></span>
        <button class="btn ${ceremony ? 'btn-primary' : ''}" data-act="review-next">${ceremony
        ? 'And now the ceremony →' : 'Close'}</button>
      </div>`);
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

    // Gold on a trophy is the one thing --gold was reserved for. Song of the
    // Year gets its sleeve: it is the only prize awarded to an object rather
    // than to an act, and the object has a face.
    const rows = rec.results.map(r => {
      const prize = KP.prize(r.k);
      // Keyed off the prize's pool rather than off whether the record happens to
      // carry a concept: only our own songs are stored with one, and a list where
      // half the rows have a jacket is worse than one where none of them do.
      const art = prize && prize.pool === 'songs'
        ? coverArt(KP.songCover({
          mine: !!r.mine, title: r.winner, artist: r.by,
          concept: r.concept, color: r.color, groupId: r.groupId
        }), 'sm')
        : '';
      return `<div class="opt ${r.mine ? 'is-on' : ''} ${art ? 'has-art' : ''}">
      ${art}
      <div><b>${r.mine ? '<span class="gold">' + U.esc(r.ic) + '</span> ' : U.esc(r.ic) + ' '}${U.esc(r.winner)}${r.by
        ? ' <span class="muted">— ' + U.esc(r.by) + '</span>' : ''}</b>
        <small>${U.esc(r.name)} · ${U.esc(r.kr)} · ${U.esc(r.detail)}</small></div>
      <span class="q">${r.mine ? 'YOURS' : ''}</span>
      <span class="c mono">${r.score}</span>
    </div>`;
    }).join('');

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
        ${KP.reviewOf(st, rec.y) ? `<button class="btn" data-act="open-review" data-y="${rec.y}">The year in review</button>` : ''}
        <button class="btn btn-primary" data-act="modal-close">Take the stage</button>
      </div>`);
  };

  /* ------------------------------ the scandal ------------------------------
     The only modal in the game that is a question rather than a form. Three
     answers, priced by E.scandalOptions so the numbers here are the numbers the
     engine spends, and a fourth the player gets for free by doing nothing — said
     out loud at the bottom, because a deadline nobody told you about is not a
     decision.

     The PR read is the marketing lead's, it was rolled once when the story
     broke, and it is wrong often enough to be worth thinking about. */

  ui.openScandal = function () {
    const st = KP.state;
    const s = st.scandal;
    if (!s) return;
    const g = st.groups.find(x => x.id === s.gid);
    const spec = KP.scandalSpec(s);
    if (!g || !spec) return;
    const S = KP.scandal;
    const opts = KP.engine.scandalOptions(st);

    const rows = opts.map(o => `<button class="opt ${o.blocked ? 'locked' : ''}"
        ${o.blocked ? 'disabled' : ''} data-act="scandal-pick" data-key="${o.k}">
      <div><b>${U.esc(o.ic)} ${U.esc(o.label)}</b>
        <small>${U.esc(o.desc)}${o.blocked ? ' · ' + U.esc(o.blocked) : ''}</small></div>
      <span class="q">${o.sentiTrue} if true / ${o.sentiFalse} if not</span>
      <span class="c">${o.cost ? U.money(o.cost) : 'free'}</span>
    </button>`).join('');

    const sil = S.out.silence;
    ui.modal(`
      <div class="modal-head">
        <div><div class="kr">${U.esc(spec.kr)}</div><h3>${U.esc(spec.ic)} ${U.esc(spec.name)}</h3></div>
        <button class="modal-close" data-act="modal-close">✕</button>
      </div>
      <p class="muted" style="margin:0 0 6px">${U.esc(spec.desc)} — ${U.esc(s.who)} of
        <b>${U.esc(g.name)}</b>, and every desk in the building is waiting on you.</p>
      <div class="est">
        <div><b class="neg">${s.sev}</b><span>Severity</span></div>
        <div><b>${Math.round(KP.sentiOf(g))}</b><span>Sentiment now</span></div>
        <div><b>${Math.round(KP.loyalOf(g))}</b><span>Loyalty now</span></div>
        <div><b>${U.num(Math.round(g.fans * s.sev / S.fansDiv))}</b><span>Fans it will cost</span></div>
      </div>
      <p class="tiny ${s.read ? 'neg' : 'muted'}" style="margin:10px 2px 0">
        🕵️ Your marketing lead's read: <b>the story is ${s.read ? 'probably true' : 'probably nonsense'}</b>
        — and they are right about ${Math.round(s.conf * 100)}% of the time at Lv${st.company.staff.marketing}.
        A denial that turns out to have been a lie comes back in a few weeks, worse.</p>
      <div class="opt-list" style="margin-top:14px">${rows}</div>
      <div class="modal-foot">
        <span class="tiny neg">Say nothing and the week answers for you:
          ${Math.round(sil.senti[0] * s.sev)} to ${Math.round(sil.senti[1] * s.sev)} sentiment,
          ${sil.loyal} loyalty, ${sil.rep} reputation. The sentiment column above is the same trade —
          you are told what each answer is worth, never which half applies.</span>
        <span class="spacer"></span>
        <button class="btn" data-act="modal-close">Decide later</button>
      </div>`);
  };

  /* ------------------------------- the line-up -----------------------------
     Every pair in the room, weakest first, and the two ways a line-up changes.
     The pair list is the whole point: chemistry is an average, and an average
     never tells you which two people are the problem. */

  ui.openLineup = function (gid) {
    ui.lineup = gid;
    ui.drawLineup();
  };

  ui.drawLineup = function () {
    const st = KP.state;
    const g = st.groups.find(x => x.id === ui.lineup);
    if (!g || KP.isUnit(g)) return ui.closeModal();
    const B = KP.bonds;
    const members = KP.memberOf(st, g);
    const free = st.trainees.filter(t => !t.groupId);
    const chem = KP.chemistry(st, g);
    const cost = KP.costs.lineupShowcase;

    const roster = members.map(m => {
      const left = KP.contractLeft(st, m);
      return `<div class="led-row">
        <span class="led-label">${U.esc(m.name)}
          <i>${U.esc(m.position || '')} · ovr ${KP.overall(m)} · morale ${Math.round(m.morale)}${
            left == null ? '' : ' · ' + (left / KP.WEEKS_PER_YEAR).toFixed(1) + 'y on contract'}</i></span>
        <button class="btn btn-sm btn-cut" data-act="graduate" data-id="${m.id}"
          ${members.length <= 1 ? 'disabled' : ''}
          title="They leave the line-up and go back to the trainee room">Graduate</button>
      </div>`;
    }).join('');

    const pairs = KP.bondPairs(st, g).map(p => `<div class="trend">
      <span class="nm">${U.esc(p.a.name.split(' ')[0])} &amp; ${U.esc(p.b.name.split(' ')[0])}</span>
      <i>${Math.round(p.v)}</i>
      <div class="bar ${p.v >= 65 ? 'life' : p.v < 35 ? 'warm' : 'calm'}">
        <u style="width:${U.clamp(p.v, 0, 100).toFixed(0)}%"></u></div>
    </div>`).join('');

    const adds = free.length ? free.map(t => `<button class="opt"
        data-act="join-group" data-gid="${g.id}" data-id="${t.id}"
        ${st.company.money < cost || members.length >= 7 ? 'disabled' : ''}>
      <div><b>${U.esc(t.name)}</b><small>${t.age}y · ovr ${KP.overall(t)} · ceiling ${KP.potentialOverall(t)}${
        t.fame > 0 ? ' · ' + Math.round(t.fame) + ' points of a name the public knows' : ''}</small></div>
      <span class="q">joins at ${B.newcomer}</span>
      <span class="c">${U.money(cost)}</span>
    </button>`).join('')
      : `<p class="tiny muted">Nobody free in the building.</p>`;

    ui.modal(`
      <div class="modal-head">
        <div><div class="kr">라인업</div><h3>${U.esc(g.name)} — line-up</h3></div>
        <button class="modal-close" data-act="modal-close">✕</button>
      </div>

      <div class="est">
        <div><b>${Math.round(chem)}</b><span>Chemistry</span></div>
        <div><b class="${mulTone(KP.chemPerf(st, g))}">${mul(KP.chemPerf(st, g))}</b><span>Song quality</span></div>
        <div><b class="${mulTone(KP.chemEdge(st, g))}">${mul(KP.chemEdge(st, g))}</b><span>Variety room</span></div>
        <div><b>${members.length}</b><span>Members</span></div>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">Who is in it</span>
        <div class="ledger">${roster}</div>
      </div>

      ${members.length > 1 ? `<div class="wiz-step">
        <span class="eyebrow">Who gets on with whom — weakest pair first</span>
        ${pairs}
      </div>` : ''}

      <div class="wiz-step">
        <span class="eyebrow">Bring somebody in</span>
        <div class="opt-list">${adds}</div>
      </div>

      <div class="modal-foot">
        <span class="tiny muted">Bonds are built by being in the same room — a booking's cast, a promotion
          cycle, a run that peaked — and spent by strain and by weeks where everybody was empty. A member
          brought in later starts at ${B.newcomer} against everybody, which is what a replacement really
          costs. A graduation costs the fandom, the public mood and the reputation of the agency, and the
          positions redistribute the same week.</span>
      </div>`);
  };

  /* -------------------------------- the unit -------------------------------
     The debut wizard, shorter: the line-up can only come out of one group and
     the numbers it debuts on are drawn out of that group's fandom. */

  ui.openUnit = function (gid) {
    const st = KP.state;
    const g = st.groups.find(x => x.id === gid);
    if (!g || KP.isUnit(g)) return;
    ui.unit = {
      gid,
      kind: 'sub',
      picked: [],
      concept: g.concept,
      color: g.color,
      name: U.pick(KP.groupNameParts.a) + ':' + U.pick(KP.groupNameParts.b),
      kr: ''
    };
    ui.drawUnit();
  };

  ui.drawUnit = function () {
    const st = KP.state;
    const w = ui.unit;
    const parent = st.groups.find(x => x.id === w.gid);
    if (!parent) return ui.closeModal();
    const spec = KP.unitKind(w.kind);
    const pool = KP.memberOf(st, parent);
    const members = w.picked.map(id => st.trainees.find(t => t.id === id)).filter(Boolean);
    const block = KP.engine.unitBlock(st, parent, w.kind, w.picked);
    const nameTaken = st.groups.some(g => g.name === w.name.trim());
    const canGo = !block && w.name.trim().length > 0 && !nameTaken;

    const kinds = KP.unitKinds.map(u => {
      const gate = KP.engine.unitBlock(st, parent, u.k, new Array(u.min).fill('?'));
      // Only the gates that are about the KIND, never the ones about the picks:
      // this row is choosing what to form, not who is in it.
      const hard = gate && /releases|fans|already running|showcase/.test(gate) ? gate : null;
      return `<button class="opt ${w.kind === u.k ? 'is-on' : ''} ${hard ? 'locked' : ''}"
          ${hard ? 'disabled' : ''} data-act="unit-kind" data-key="${u.k}">
        <div><b>${U.esc(u.ic)} ${U.esc(u.name)}
          <span style="font-family:var(--kr);font-weight:400;color:var(--lilac)">${U.esc(u.kr)}</span></b>
          <small>${U.esc(u.desc)}${hard ? ' · ' + U.esc(hard) : ''}</small></div>
        <span class="q">${u.min === u.max ? u.min : u.min + '–' + u.max} member${u.max === 1 ? '' : 's'} ·
          ${Math.round(u.share[0] * 100)}–${Math.round(u.share[1] * 100)}% of the fandom</span>
        <span class="c">${U.money(u.cost)}</span>
      </button>`;
    }).join('');

    const picks = pool.map(t => {
      const busy = KP.inAUnit(st, t.id) && w.picked.indexOf(t.id) < 0;
      return `<div class="card sel-idol ${w.picked.indexOf(t.id) >= 0 ? 'is-on' : ''} ${busy ? 'locked' : ''}"
          ${busy ? '' : `data-act="unit-pick" data-id="${t.id}"`} style="padding:12px">
        <div class="idol-top" style="pointer-events:none">
          ${avatar(t)}
          <div><div class="idol-name" style="font-size:13px">${U.esc(t.name)}</div>
          <div class="idol-meta">${busy ? 'already in a unit' : 'ovr ' + KP.overall(t)}</div></div>
        </div>
      </div>`;
    }).join('');

    const concepts = KP.concepts.map(c => `<button class="opt ${w.concept === c.k ? 'is-on' : ''}"
        data-act="unit-concept" data-key="${c.k}">
        <div><b>${c.name} <span style="font-family:var(--kr);font-weight:400;color:var(--lilac)">${c.kr}</span></b>
        <small>${Object.keys(c.w).sort((a, b) => c.w[b] - c.w[a]).slice(0, 3).map(k => KP.STATS.find(s => s.k === k).label).join(' · ')}</small></div>
        <span class="q">trend ${Math.round(st.trends[c.k])}</span>
        <span class="c">${members.length ? Math.round(KP.engine.groupScore(members, c.k)) : '—'}</span>
      </button>`).join('');

    ui.modal(`
      <div class="modal-head">
        <div><div class="kr">유닛</div><h3>A unit out of ${U.esc(parent.name)}</h3></div>
        <button class="modal-close" data-act="modal-close">✕</button>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">1 — What kind</span>
        <div class="opt-list">${kinds}</div>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">2 — Who (${members.length} of ${spec ? (spec.min === spec.max ? spec.min
          : spec.min + '–' + spec.max) : '?'})</span>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${picks}</div>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">3 — Concept</span>
        <div class="opt-list">${concepts}</div>
      </div>

      <div class="wiz-step">
        <span class="eyebrow">4 — Identity</span>
        <div class="grid" style="grid-template-columns:1fr 1fr">
          <label><span class="tiny muted">Unit name</span>
            <input class="text-in" data-act="unit-name" value="${U.esc(w.name)}" maxlength="18"></label>
          <div class="row" style="align-items:flex-end">
            <div class="swatches">${KP.groupColors.map(c =>
              `<button class="swatch ${w.color === c ? 'is-on' : ''}" style="background:${c}"
                data-act="unit-color" data-key="${c}"></button>`).join('')}</div>
          </div>
        </div>
      </div>

      <div class="est">
        <div><b>${members.length ? Math.round(KP.engine.groupScore(members, w.concept)) : '—'}</b><span>Concept fit</span></div>
        <div><b>${spec ? U.num(Math.round(parent.fans * spec.share[0])) + '–'
          + U.num(Math.round(parent.fans * spec.share[1])) : '—'}</b><span>Starting fandom</span></div>
        <div><b>${spec ? U.money(spec.cost) : '—'}</b><span>Showcase cost</span></div>
      </div>

      <div class="modal-foot">
        <span class="tiny ${block || nameTaken ? 'neg' : 'muted'}">${nameTaken
          ? 'You already have an act called that.'
          : block ? U.esc(block)
            : 'Its fandom is drawn out of ' + U.esc(parent.name) + '’s rather than added to it, so the goods '
              + 'line is discounted to ' + Math.round(KP.units.merchShare * 100) + '%. What a unit really costs is '
              + 'the stamina of the same people: they are on both diaries.'}</span>
        <span class="spacer"></span>
        <button class="btn" data-act="modal-close">Cancel</button>
        <button class="btn btn-primary" data-act="unit-form" ${canGo ? '' : 'disabled'}>Debut the unit</button>
      </div>`);
  };

  /* ------------------------------ finals night -----------------------------
     Ranked by the public vote, and the ceiling column is right next to it so the
     disagreement is on one screen. Everything not signed here is signed by
     somebody else this week, including if the answer is nothing. */

  ui.openFinals = function () {
    ui.finals = ui.finals && ui.finals.picked ? ui.finals : { picked: [] };
    ui.drawFinals();
  };

  ui.drawFinals = function () {
    const st = KP.state;
    const S = KP.survival;
    const sv = st.survival;
    if (!sv || !sv.ready) return ui.closeModal();
    const picked = ui.finals.picked;
    const ranked = KP.survivalRanked(st);

    const cards = ranked.map((t, i) => `<div class="card sel-idol ${picked.indexOf(t.id) >= 0 ? 'is-on' : ''}"
        data-act="finals-pick" data-id="${t.id}" style="padding:12px">
      <div class="idol-top" style="pointer-events:none">
        ${avatar(t)}
        <div><div class="idol-name" style="font-size:13px">#${i + 1} ${U.esc(t.name)}</div>
        <div class="idol-meta">${U.num(Math.round(t.votes))} votes · ovr ${KP.overall(t)} ·
          ceiling ${KP.potentialOverall(t)}</div>
        <div class="idol-meta">📺 ${Math.round(t.fame)} of a name the public knows</div></div>
      </div>
    </div>`).join('');

    ui.modal(`
      <div class="modal-head">
        <div><div class="kr">파이널</div><h3>Finals night</h3></div>
        <button class="modal-close" data-act="modal-close">✕</button>
      </div>
      <p class="muted" style="margin:0 0 14px">The public has voted. You may sign ${S.picks} of them, and the
        offer is already paid for — what is left of this list is signed by the agencies before the week is out.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${cards}</div>
      <div class="est">
        <div><b>${picked.length} / ${S.picks}</b><span>Signed tonight</span></div>
        <div><b>${U.num(Math.round(ranked[0] ? ranked[0].votes : 0))}</b><span>Winning vote</span></div>
        <div><b>${S.rivalTakes}</b><span>The agencies take</span></div>
      </div>
      <div class="modal-foot">
        <span class="tiny muted">Fame is a fandom at the debut showcase and it evaporates while they learn to
          sing — ${Math.round((1 - KP.survival.fameDecay) * 100 * 52)}% of it a year in the practice room.</span>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-act="finals-confirm">${picked.length
          ? 'Sign ' + picked.length : 'Sign nobody'}</button>
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
