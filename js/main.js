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
    ui.openWelcome();
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
    // There is one modal root, so the four things that want it are ranked: a
    // dead run outranks a ceremony, a ceremony outranks a scandal, and a scandal
    // outranks the weekly toasts. Nothing is lost by being outranked — the story
    // stays in st.scandal with its own banner on the Fandom tab and its own week
    // to be answered in.
    if (st.over) return ui.gameOver();
    // The year that just ended, in two acts: what you did, and then what it won.
    // Two independent claims rather than one — a year with nothing on the ballot
    // has a review and no ceremony at all — and the review's own button is what
    // hands over to the ceremony, so the ranking below never has to arbitrate
    // between them. Saved before either is shown, so a closed tab cannot make it
    // happen twice; both are archived on the Chart tab regardless.
    const reviewYear = KP.engine.claimReview(st);
    if (reviewYear != null) { KP.save(); return ui.openReview(reviewYear); }
    const awardYear = KP.engine.claimAwards(st);
    if (awardYear != null) { KP.save(); return ui.openAwards(awardYear); }
    // A finals night is the second thing in the game that asks a question and
    // waits, so it is ranked beside the scandal and above the weekly toasts.
    // Being outranked loses nothing: both keep their own panel and their own
    // week, and step 0 answers whichever one the player walked away from.
    if (st.survival && st.survival.ready) return ui.openFinals();
    if (st.scandal) return ui.openScandal();
    recap.slice(0, 3).forEach((r, i) =>
      setTimeout(() => ui.toast(r.ic + '  ' + r.text, r.kind), i * 220));
  }

  /* A ceremony interrupted by a closed tab is still owed to the player, exactly
     once — both ways back into a run go through here. */
  function showPendingAwards() {
    const st = KP.state;
    if (!st || st.over) return;
    const rev = KP.engine.claimReview(st);
    if (rev != null) { KP.save(); return ui.openReview(rev); }
    const y = KP.engine.claimAwards(st);
    if (y == null) {
      // A run reopened in the middle of a story still owes the player the
      // decision — and still has the week it broke in to make it, because the
      // silence outcome is applied by the tick and not by the clock. Same for a
      // finals night the tab was closed on.
      if (st.survival && st.survival.ready) ui.openFinals();
      else if (st.scandal) ui.openScandal();
      return;
    }
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

    /* ---- the fandom ---- */
    'open-scandal'() { ui.openScandal(); },
    'scandal-pick'(d) {
      const r = KP.engine.scandalRespond(KP.state, d.key);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.closeModal();
      ui.render();
      KP.save();                    // an answer given is an answer given
      ui.toast(r.weeks
        ? 'Statement filed — they are off the schedule for ' + r.weeks + ' weeks.'
        : 'Answered. ' + U.num(r.lost) + ' fans gone.', r.swing < -10 ? 'bad' : '');
    },
    'deal-take'(d) {
      const r = KP.engine.takeDeal(KP.state, d.key);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.render();
      KP.save();                    // signed money must survive a closed tab
      ui.toast(U.money(r.net) + ' advance received.', 'big');
    },

    /* ---- people: line-ups, units, contracts, the survival show ---- */
    'open-lineup'(d) { ui.openLineup(d.id); },
    graduate(d) {
      const st = KP.state;
      const t = st.trainees.find(x => x.id === d.id);
      const r = KP.engine.graduate(st, d.id);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      // The modal is redrawn rather than closed: a line-up change is usually
      // more than one change, and the pair list underneath it has just moved.
      if (r.disbanded) ui.closeModal(); else ui.drawLineup();
      ui.render();
      KP.save();
      ui.toast(r.disbanded
        ? r.disbanded + ' has disbanded.'
        : (t ? t.name : 'They') + ' left the line-up · ' + U.num(r.lost || 0) + ' fans gone.', 'bad');
    },
    'join-group'(d) {
      const r = KP.engine.joinGroup(KP.state, d.gid, d.id);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.drawLineup();
      ui.render();
      KP.save();
      ui.toast('Introduced — the room does not know them yet.', '');
    },

    'open-unit'(d) { ui.openUnit(d.id); },
    'unit-kind'(d) { syncUnit(); ui.unit.kind = d.key; ui.unit.picked = []; ui.drawUnit(); },
    'unit-pick'(d) {
      syncUnit();
      const w = ui.unit, spec = KP.unitKind(w.kind);
      const i = w.picked.indexOf(d.id);
      if (i >= 0) w.picked.splice(i, 1);
      else if (!spec || w.picked.length < spec.max) w.picked.push(d.id);
      else return ui.toast(spec.name + 's are ' + spec.max + ' at most.', 'bad');
      ui.drawUnit();
    },
    'unit-concept'(d) { syncUnit(); ui.unit.concept = d.key; ui.drawUnit(); },
    'unit-color'(d) { syncUnit(); ui.unit.color = d.key; ui.drawUnit(); },
    'unit-form'() {
      syncUnit();
      const w = ui.unit;
      const r = KP.engine.formUnit(KP.state, {
        parentId: w.gid, kind: w.kind, memberIds: w.picked,
        name: w.name.trim(), kr: w.kr, concept: w.concept, color: w.color
      });
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.closeModal();
      ui.tab = 'groups';
      ui.render();
      KP.save();
      ui.toast('✧ ' + r.group.name + ' has debuted.', 'big');
    },
    'unit-disband'(d) {
      const r = KP.engine.disbandUnit(KP.state, d.id);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.render();
      KP.save();
      ui.toast(r.name + ' has wrapped up.', '');
    },

    renew(d) {
      const r = KP.engine.renewContract(KP.state, d.id);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.render();
      KP.save();                    // a signature must survive a closed tab
      ui.toast('Re-signed for ' + r.years + ' years · ' + U.money(r.cost) + '.', 'good');
    },

    'survival-start'() {
      const r = KP.engine.startSurvival(KP.state);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.render();
      KP.save();
      ui.toast('📺 The season is commissioned.', 'big');
    },
    'open-finals'() { ui.openFinals(); },
    'finals-pick'(d) {
      const p = ui.finals.picked, i = p.indexOf(d.id);
      if (i >= 0) p.splice(i, 1);
      else if (p.length < KP.survival.picks) p.push(d.id);
      else return ui.toast('You may sign ' + KP.survival.picks + ' of them.', 'bad');
      ui.drawFinals();
    },
    'finals-confirm'() {
      const r = KP.engine.survivalSign(KP.state, ui.finals.picked);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.finals = { picked: [] };
      ui.closeModal();
      ui.render();
      KP.save();                    // a signature must survive a closed tab
      ui.toast(r.signed ? 'Signed ' + r.signed + ' off the finals stage.'
        : 'The agencies took the room.', r.signed ? 'good' : 'bad');
    },

    /* ---- looking back ---- */
    'open-review'(d) { ui.openReview(parseInt(d.y, 10)); },
    // The hand-off from the scrapbook to the ceremony. It claims rather than
    // reads, so the ceremony is owed exactly once however the player got here —
    // straight off the tick, or by re-opening the review from the Chart tab
    // after closing the modal on it.
    'review-next'() {
      const y = KP.engine.claimAwards(KP.state);
      if (y == null) return ui.closeModal();
      KP.save();
      ui.openAwards(y);
    },

    'scout-rival'(d) {
      const r = KP.engine.scoutRival(KP.state, d.id);
      if (!r.ok) return ui.toast(r.msg, 'bad');
      ui.render();
      KP.save();                    // paid intelligence must survive a closed tab
      ui.toast('Report filed — their diary is open.', 'good');
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
    goto(d) { ui.closeModal(); ui.tab = d.tab; ui.render(); },
    'guide-hide'() {
      KP.state.guideOff = true;
      ui.render();
      KP.save();
      ui.toast('Guide hidden — the ⋯ menu brings it back.');
    },
    'guide-show'() {
      KP.state.guideOff = false;
      ui.tab = 'dash';
      ui.render();
      KP.save();
      ui.openWelcome();
    },
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
  function syncUnit() {
    const n = document.querySelector('[data-act="unit-name"]');
    if (n) ui.unit.name = n.value;
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
    const tabs = ['dash', 'trainees', 'scout', 'groups', 'sched', 'chart', 'rivals', 'fandom', 'log'];
    const i = parseInt(e.key, 10);
    if (i >= 1 && i <= tabs.length) { ui.tab = tabs[i - 1]; ui.render(); }
  });

  /* --------------------------------- boot ---------------------------------- */

  showStart();
})();
