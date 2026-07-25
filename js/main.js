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
    if (!KP.load()) return ui.toast('That save could not be read.', 'bad');
    ui.tab = 'dash';
    showGame();
    if (KP.state.over) return ui.gameOver();
    showPendingAwards();
  });

  /* ------------------------------ save files ------------------------------- */

  function downloadSave() {
    const out = KP.exportSave();
    if (!out) return ui.toast('There is no run to download yet.', 'bad');
    const url = URL.createObjectURL(new Blob([out.json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = out.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    ui.toast('Saved to ' + out.filename, 'good');
  }

  /* The same input serves the title screen and the in-game menu. Clearing value
     first means re-picking the same file still fires change. */
  function pickSaveFile() {
    const input = $('#file-save');
    input.value = '';
    input.click();
  }

  $('#file-save').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = KP.importSave(String(reader.result));
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.closeModal();
      ui.tab = 'dash';
      showGame();
      ui.toast(r.migrated
        ? 'Save imported and upgraded from format v' + r.from + '.'
        : 'Save imported — ' + KP.state.company.name + ', Y' + KP.state.year + ' W' + KP.state.week + '.', 'good');
      if (KP.state.over) return ui.gameOver();
      showPendingAwards();
    };
    reader.onerror = () => ui.toast('That file could not be read.', 'bad');
    reader.readAsText(file);
  });

  $('#btn-import').addEventListener('click', pickSaveFile);

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
    if (!st) return;
    if (st.over) return ui.gameOver();     // a finished run always says so, never just ignores you
    const recap = KP.engine.nextWeek() || [];
    ui.render();
    // There is one modal root, so the three things that want it are ranked: a
    // dead run outranks a ceremony, and a ceremony outranks the weekly toasts.
    if (st.over) return ui.gameOver();
    const awardYear = KP.engine.claimAwards(st);
    // Saved before it is shown, so a closed tab cannot make it happen twice.
    if (awardYear != null) { KP.save(); return ui.openAwards(awardYear); }
    recap.slice(0, 3).forEach((r, i) =>
      setTimeout(() => ui.toast(r.ic + '  ' + r.text, r.kind), i * 220));
  }

  /* A ceremony interrupted by a closed tab is still owed to the player, exactly
     once — both ways back into a run go through here. */
  function showPendingAwards() {
    const st = KP.state;
    if (!st || st.over) return;
    const y = KP.engine.claimAwards(st);
    if (y == null) return;
    KP.save();
    ui.openAwards(y);
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
      const r = KP.engine.refreshScoutsPaid(KP.state);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.render();
    },

    upgrade(d) {
      const r = KP.engine.upgrade(KP.state, d.kind, d.key);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.render();
    },

    release(d) {
      const t = KP.state.trainees.find(x => x.id === d.id);
      const r = KP.engine.release(KP.state, d.id);
      if (!r.ok) return ui.toast(r.msg || 'They cannot be released.', 'bad');
      ui.render();
      ui.toast((t ? t.name : 'They') + ' left the company.', '');
    },

    downgrade(d) {
      const r = KP.engine.downgrade(KP.state, d.kind, d.key);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.toast('Recovered ' + KP.util.money(r.back) + ' — weekly costs are lower now.', 'good');
      ui.render();
    },

    'open-debut'() { ui.openDebut(); },
    'open-comeback'(d) { ui.openComeback(d.id); },

    /* ---- the schedule ---- */
    'open-booking'(d) { ui.openBooking(d.gid, parseInt(d.abs, 10)); },
    'book-kind'(d) { ui.book.kind = d.key; ui.book.show = null; ui.drawBooking(); },
    'book-show'(d) { ui.book.show = d.key; ui.drawBooking(); },
    'book-confirm'() {
      const b = ui.book;
      const r = KP.engine.book(KP.state, b.gid, b.kind, b.show, b.abs);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.closeModal();
      ui.tab = 'sched';
      ui.render();
      KP.save();                    // a paid commitment must survive a closed tab
      ui.toast('Booked.', 'good');
    },
    'book-cancel'(d) {
      const r = KP.engine.cancelBooking(KP.state, d.id);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.render();
      KP.save();
      ui.toast(r.late ? 'Pulled out at short notice — reputation took the hit.'
        : 'Cancelled · ' + U.money(r.back) + ' recovered.', r.late ? 'bad' : '');
    },

    /* ---- finance ---- */
    'open-finance'() { ui.openFinance(); },
    'fin-mode'(d) { ui.fin.mode = d.key; ui.fin.pick = null; ui.drawFinance(); },
    'fin-pick'(d) { ui.fin.pick = d.key; ui.drawFinance(); },
    'fin-take'(d) {
      const r = KP.engine.takeDebt(KP.state, ui.fin.mode, d.key);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.closeModal();
      ui.render();
      KP.save();                    // signed money must survive a closed tab
      ui.toast(U.money(r.net) + ' received.', 'big');
    },
    'fin-clear'(d) {
      const r = KP.engine.repayDebt(KP.state, d.id);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.render();
      KP.save();
      ui.toast('Cleared for ' + U.money(r.paid) + '.', 'good');
    },

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
    'menu-export'() { downloadSave(); },
    'menu-import'() { pickSaveFile(); },
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
    // a locked modal has no backdrop hook — Escape must not get past it either
    if (e.key === 'Escape') {
      if ($('#modal-root').children.length && !$('#modal-root').querySelector('[data-act="modal-bg"]')) return;
      return ui.closeModal();
    }
    if ($('#modal-root').children.length) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); advanceWeek(); }
    // Same order as the .rail-btn list in index.html and ui.js's views map.
    const tabs = ['dash', 'trainees', 'scout', 'groups', 'sched', 'chart', 'log'];
    const i = parseInt(e.key, 10);
    if (i >= 1 && i <= tabs.length) { ui.tab = tabs[i - 1]; ui.render(); }
  });

  /* --------------------------------- boot ---------------------------------- */

  showStart();
})();
