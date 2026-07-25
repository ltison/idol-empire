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
    return `<div class="ava ${cls || ''}" style="background:${bg}">${initial}<span class="ava-flag">${t.flag}</span></div>`;
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
      ['in', 'Merch & fan meets', L.in.merch, U.num(KP.totalFans(st)) + ' fans × ₩' + KP.income.merchPerFan],
      ['in', 'Session work & extras', L.in.side, 'base + reputation'],
      ['out', 'Trainees', L.out.trainees, st.trainees.filter(t => !t.groupId).length + ' unsigned to a group'],
      ['out', 'Idol pay', L.out.idols, 'scales with fame'],
      ['out', 'Facilities', L.out.facilities, 'practice · studio · dorm'],
      ['out', 'Staff', L.out.staff, 'coaches · producer · marketing'],
      ['out', 'Promotion', L.out.promo, 'active campaigns']
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

  /* ================================ screens ================================ */

  function officeTab(st) {
    const c = st.company;
    const burn = KP.weeklyBurn(st);
    const misc = KP.weeklyMisc(st) + st.groups.reduce((s, g) => s + g.fans * KP.income.merchPerFan, 0);
    const net = burn - misc;
    const runway = net > 0 ? Math.floor((c.money - KP.costs.bankruptcyFloor) / net) : 99;
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

    const trendRows = KP.concepts.slice()
      .sort((a, b) => st.trends[b.k] - st.trends[a.k]).slice(0, 5)
      .map(cc => `<div class="trend">
        <span class="nm">${cc.name}<em>${cc.kr}</em></span>
        <i>${Math.round(st.trends[cc.k])}</i>
        <div class="bar calm"><u style="width:${st.trends[cc.k]}%"></u></div>
      </div>`).join('');

    return `
    <div class="dash-hero">
      <div class="kr">${st.calendarYear}년 ${st.week}주차</div>
      <h2>Year ${st.year}, Week ${st.week}</h2>
      <p class="muted" style="margin:8px 0 0">${U.esc(c.ceo)} · ${U.esc(c.name)} · ${KP.difficulties[c.difficulty].label} run</p>
      <div class="recap" style="margin-top:16px">${recap}</div>
    </div>

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
        </div>
        <div class="bar" style="margin-top:6px"><u style="width:${c.rep}%"></u></div>
        ${ledger(st)}
        <p class="tiny muted" style="margin:10px 0 0">Runway ignores release revenue — a comeback is how you actually get paid. Reputation unlocks star producers and better auditions.</p>
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
      <div class="card">
        <div class="sec-head"><h2>What's trending</h2><span class="kr">트렌드</span></div>
        <p class="tiny muted" style="margin:-6px 0 12px">Concepts the public is hungry for right now. Riding a trend raises hype; repeating your own last concept lowers it.</p>
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
      <p>Reputation ${Math.round(st.company.rep)} — better applicants show up as you grow</p>
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

        <div class="member-strip">${strip}</div>

        <div class="kv">
          <div><b>${U.num(g.fans)}</b><span>Fans</span></div>
          <div><b>${Math.round(g.momentum)}</b><span>Momentum</span></div>
          <div><b>${g.releases.length}</b><span>Releases</span></div>
          <div><b class="gold">${g.releases.reduce((s, r) => s + r.wins, 0)}</b><span>Wins</span></div>
        </div>

        ${ocean(g.fans, g.color)}
        ${disc}

        <div class="row" style="margin-top:14px">
          <button class="btn btn-primary" data-act="open-comeback" data-id="${g.id}" ${g.active ? 'disabled' : ''}>
            ${g.releases.length ? 'Plan comeback' : 'Plan debut single'}
          </button>
          ${g.active ? `<span class="tiny muted">Promotions end in ${g.active.promoWeeks - g.active.week} weeks</span>` : ''}
        </div>
      </article>`;
    }).join('');

    return head + `<div class="grid g-2">${cards}</div>`;
  }

  function chartTab(st) {
    const head = `<div class="sec-head"><h2>Weekly chart</h2><span class="kr">주간 차트</span>
      <p>Digital + physical combined, Y${st.year} W${st.week}</p></div>`;
    if (!st.chart || !st.chart.length) {
      return head + `<div class="empty"><b>Chart not published yet</b>Advance a week to see where the market stands.</div>`;
    }
    const rows = st.chart.slice(0, 20).map(r => `<div class="rung ${r.mine ? 'mine' : ''} ${r.rank === 1 ? 'top1' : ''}">
      <div class="rk">${r.rank}</div>
      <div><div class="ttl">${U.esc(r.title)}</div><div class="art">${U.esc(r.artist)}</div></div>
      <div class="pts">${r.points.toFixed(1)}</div>
    </div>`).join('');
    return head + `<div class="card"><div class="ladder">${rows}</div></div>`;
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
    const net = KP.ledger(st).net;
    const burnEl = $('#ui-burn');
    burnEl.textContent = (net >= 0 ? '+' : '') + U.money(net);
    burnEl.className = 'hud-val ' + (net >= 0 ? 'pos' : 'neg');
    $('#ui-rep').textContent = Math.round(st.company.rep);
    $('#ui-fans').textContent = U.num(KP.totalFans(st));

    $('#badge-trainees').textContent = st.trainees.filter(t => !t.groupId).length || '';
    $('#badge-scout').textContent = st.scoutPool.length || '';
    $('#badge-groups').textContent = st.groups.length || '';

    document.querySelectorAll('.rail-btn').forEach(b =>
      b.classList.toggle('is-on', b.dataset.tab === ui.tab));

    const views = { dash: officeTab, trainees: traineesTab, scout: scoutTab, groups: groupsTab, chart: chartTab, log: logTab };
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

  function tierList(kind, label, sel, rep) {
    return `<div class="wiz-step">
      <span class="eyebrow">${label}</span>
      <div class="opt-list">${KP.tiers[kind].map(t => {
      const locked = t.rep && rep < t.rep;
      return `<button class="opt ${sel === t.k ? 'is-on' : ''} ${locked ? 'locked' : ''}"
          ${locked ? 'disabled' : ''} data-act="plan-tier" data-kind="${kind}" data-key="${t.k}">
          <div><b>${t.name}</b><small>${t.desc}${locked ? ' · needs reputation ' + t.rep : ''}</small></div>
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

      ${tierList('producer', 'Producer', p.sel.producer, st.company.rep)}
      ${tierList('choreo', 'Choreography', p.sel.choreo, st.company.rep)}
      ${tierList('mv', 'Music video', p.sel.mv, st.company.rep)}
      ${tierList('styling', 'Styling', p.sel.styling, st.company.rep)}
      ${tierList('promo', 'Promotion plan', p.sel.promo, st.company.rep)}

      <div class="est">
        <div><b>${Math.round(pv.quality)}</b><span>Song quality</span></div>
        <div><b>${Math.round(pv.hype)}</b><span>Hype</span></div>
        <div><b>${Math.round(pv.points)}</b><span>Opening points</span></div>
        <div><b class="${pv.fatigue < 1 ? 'neg' : 'pos'}">${Math.round(pv.fatigue * 100)}%</b><span>Fandom freshness</span></div>
        <div><b>${U.money(pv.cost)}</b><span>Production</span></div>
        <div><b>${U.money(totalPromo)}</b><span>Promo over ${promo.weeks}w</span></div>
      </div>
      ${pv.fatigue < 1 ? `<p class="tiny neg" style="margin:8px 2px 0">Only ${pv.gap} weeks since the last release — waiting until week 16 removes the fatigue penalty.</p>` : ''}

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
    ui.modal(`
      <div class="modal-head"><div><div class="kr">폐업</div><h3>The agency folded</h3></div></div>
      <p class="muted">You ran ${U.esc(st.company.name)} for ${(st.year - 1) * 52 + st.week} weeks,
        debuted ${st.groups.length} group${st.groups.length === 1 ? '' : 's'},
        released ${st.stats.releases} title tracks and won ${st.stats.wins} music shows.</p>
      <div class="est">
        <div><b>${U.num(KP.totalFans(st))}</b><span>Fans at the end</span></div>
        <div><b>${Math.round(st.company.rep)}</b><span>Reputation</span></div>
        <div><b class="gold">${st.stats.no1}</b><span>#1 singles</span></div>
      </div>
      <div class="modal-foot"><span class="spacer"></span>
        <button class="btn btn-primary" data-act="menu-quit">Start over</button></div>`, { locked: true });
  };
})();
