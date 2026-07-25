/* =============================================================================
   IDOL EMPIRE — bootstrap + input routing
   ============================================================================= */
(function () {
  const U = KP.util;
  const ui = KP.ui;
  const $ = (s) => document.querySelector(s);

  let difficulty = 'easy';

  /* ------------------------------ start screen ----------------------------- */

  function showGame() {
    $('#screen-start').hidden = true;
    $('#screen-game').hidden = false;
    ui.render();
  }

  function showStart() {
    $('#screen-game').hidden = true;
    $('#screen-start').hidden = false;
    $('#btn-continue').hidden = !KP.hasSave();
  }

  $('#seg-difficulty').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    difficulty = b.dataset.diff;
    document.querySelectorAll('#seg-difficulty .seg-btn').forEach(x => x.classList.toggle('is-on', x === b));
  });

  $('#form-newgame').addEventListener('submit', (e) => {
    e.preventDefault();
    KP.newGame({
      company: $('#in-company').value.trim() || 'STARLINE',
      ceo: $('#in-ceo').value.trim() || 'CEO',
      difficulty
    });
    KP.save();
    ui.tab = 'dash';
    showGame();
  });

  $('#btn-continue').addEventListener('click', () => {
    if (KP.load()) { ui.tab = 'dash'; showGame(); }
    else ui.toast('That save could not be read.', 'bad');
  });

  /* -------------------------------- topbar --------------------------------- */

  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('.rail-btn');
    if (!b) return;
    ui.tab = b.dataset.tab;
    ui.render();
  });

  $('#btn-week').addEventListener('click', advanceWeek);
  $('#btn-menu').addEventListener('click', () => ui.openMenu());

  function advanceWeek() {
    const st = KP.state;
    if (!st || st.over) return;
    const recap = KP.engine.nextWeek() || [];
    ui.render();
    recap.slice(0, 3).forEach((r, i) =>
      setTimeout(() => ui.toast(r.ic + '  ' + r.text, r.kind), i * 220));
    if (st.over) ui.gameOver();
  }

  /* ---------------------------- action routing ----------------------------- */

  const acts = {
    focus(d) {
      const t = KP.state.trainees.find(x => x.id === d.id);
      if (t && t.status !== 'injured') { t.focus = d.key; ui.render(); }
    },

    sign(d) {
      const r = KP.engine.sign(KP.state, d.id);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.render();
      ui.toast('Contract signed.', 'good');
    },

    'refresh-scouts'() {
      const st = KP.state;
      if (st.company.money < KP.costs.scoutRefresh) return ui.toast('Not enough cash.', 'bad');
      st.company.money -= KP.costs.scoutRefresh;
      KP.refreshScouts();
      ui.render();
    },

    upgrade(d) {
      const r = KP.engine.upgrade(KP.state, d.kind, d.key);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.render();
    },

    downgrade(d) {
      const r = KP.engine.downgrade(KP.state, d.kind, d.key);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.toast('Recovered ' + KP.util.money(r.back) + ' — weekly costs are lower now.', 'good');
      ui.render();
    },

    'open-debut'() { ui.openDebut(); },
    'open-comeback'(d) { ui.openComeback(d.id); },

    /* ---- debut wizard ---- */
    'wiz-pick'(d) {
      syncWiz();
      const w = ui.wiz, i = w.picked.indexOf(d.id);
      if (i >= 0) w.picked.splice(i, 1);
      else if (w.picked.length < 7) w.picked.push(d.id);
      else return ui.toast('Seven members is the cap.', 'bad');
      ui.drawDebut();
    },
    'wiz-concept'(d) { syncWiz(); ui.wiz.concept = d.key; ui.drawDebut(); },
    'wiz-color'(d) { syncWiz(); ui.wiz.color = d.key; ui.drawDebut(); },
    'wiz-debut'() {
      syncWiz();
      const w = ui.wiz;
      const r = KP.engine.debut(KP.state, {
        memberIds: w.picked, name: w.name.trim(), kr: w.kr,
        concept: w.concept, color: w.color, fandom: w.fandom.trim() || 'FANS'
      });
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.closeModal();
      ui.tab = 'groups';
      ui.render();
      KP.save();
      ui.toast('🎉 ' + r.group.name + ' has debuted.', 'big');
    },

    /* ---- comeback planner ---- */
    'plan-tier'(d) { syncPlan(); ui.plan.sel[d.kind] = d.key; ui.drawComeback(); },
    'plan-concept'(d) { syncPlan(); ui.plan.concept = d.key; ui.drawComeback(); },
    'plan-reroll'() {
      syncPlan();
      ui.plan.title = U.pick(KP.titleWords.a) + ' ' + U.pick(KP.titleWords.b);
      ui.drawComeback();
    },
    'plan-release'() {
      syncPlan();
      const st = KP.state, p = ui.plan;
      const g = st.groups.find(x => x.id === p.gid);
      const r = KP.engine.releaseComeback(st, g, p.sel, p.concept, p.title.trim() || 'Untitled');
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.closeModal();
      ui.tab = 'dash';
      ui.render();
      KP.save();
    },

    /* ---- menu ---- */
    'menu-save'() {
      const ok = KP.save();
      ui.toast(ok ? 'Saved.' : 'Saving is blocked in this browser.', ok ? 'good' : 'bad');
    },
    'menu-quit'() { KP.wipe(); ui.closeModal(); showStart(); },
    'modal-close'() { ui.closeModal(); },
    'modal-bg'(d, e) { if (e.target.classList.contains('modal-bg')) ui.closeModal(); }
  };

  /* Text inputs live inside modals that re-render, so their values are pulled
     back into state before every redraw. */
  function syncWiz() {
    const n = document.querySelector('[data-act="wiz-name"]');
    const f = document.querySelector('[data-act="wiz-fandom"]');
    if (n) ui.wiz.name = n.value;
    if (f) ui.wiz.fandom = f.value;
  }
  function syncPlan() {
    const t = document.querySelector('[data-act="plan-title"]');
    if (t) ui.plan.title = t.value;
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.tagName === 'INPUT') return;
    const fn = acts[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset, e); }
  });

  /* ------------------------------- keyboard -------------------------------- */

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || $('#screen-game').hidden) return;
    if (e.key === 'Escape') return ui.closeModal();
    if ($('#modal-root').children.length) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); advanceWeek(); }
    const tabs = ['dash', 'trainees', 'scout', 'groups', 'chart', 'log'];
    const i = parseInt(e.key, 10);
    if (i >= 1 && i <= tabs.length) { ui.tab = tabs[i - 1]; ui.render(); }
  });

  /* --------------------------------- boot ---------------------------------- */

  showStart();
})();
