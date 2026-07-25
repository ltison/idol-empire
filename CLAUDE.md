# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

IDOL EMPIRE — a browser K-pop agency management sim. Zero dependencies, zero build step,
zero tests. Plain `<script>` tags, no modules, no bundler, no package.json.

## Running it

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

`file://` mostly works too, but some browsers block `localStorage` there, which kills
saving. There is nothing to build, lint or test — verifying a change means loading the
page and playing a few weeks.

## Architecture

Five scripts share one global namespace `KP`, loaded in a fixed order from `index.html`
(`data → state → engine → ui → main`). Each is an IIFE that hangs its exports off `KP`;
later files depend on earlier ones, so the order in `index.html` is load-bearing.

The layering is strict and worth preserving:

| File | Owns | Never contains |
|---|---|---|
| `js/data.js` | static content + `KP.util` (rng, `money()`, `esc()`, `hue()`) | game logic |
| `js/state.js` | state shape, trainee generation, derived numbers (`ledger`, `weeklyBurn`, `overall`), save/load | simulation, DOM |
| `js/engine.js` | the simulation: `KP.engine.*` | DOM |
| `js/ui.js` | `KP.ui.*` — every screen is a pure `state → HTML string` function | game rules |
| `js/main.js` | bootstrap, event wiring, action routing | game rules, HTML |

Adding content (a trait, concept, production tier, rival name, cost) = edit `data.js`
only. Adding a mechanic = one function in `engine.js` + one block in `ui.js`.

### Rendering

`ui.render()` is a full redraw: it patches the topbar HUD nodes by id, then replaces
`#stage`'s `innerHTML` with `views[ui.tab](state)`. There is no diffing and no component
state — anything the UI needs to remember between redraws lives in `ui.wiz` / `ui.plan`
or in `KP.state`.

Because screens are built with template strings, **every dynamic string must go through
`U.esc()`** (agency names, group names, song titles and CEO name are all player input).

Modals redraw the same way (`ui.drawDebut()` / `ui.drawComeback()`), which wipes any
`<input>` the user is typing in. `main.js` therefore calls `syncWiz()` / `syncPlan()`
to pull input values back into `ui.wiz` / `ui.plan` *before* every modal redraw. Any new
text field inside a modal needs the same treatment.

### Action routing

There is exactly one click listener (`main.js`, delegated on `[data-act]`) dispatching
into the `acts` map. A new button is `data-act="thing"` plus `data-*` payload attributes
in `ui.js`, and a `thing(d)` entry in `acts`. Handlers read `el.dataset`, so all payload
values arrive as strings.

Engine mutators return `{ ok: false, msg }` on refusal and `{ ok: true, ... }` on success;
`acts` handlers surface `msg` via `ui.toast(msg, 'bad')` and then call `ui.render()`.
Engine functions never touch the DOM and never toast.

Keyboard handling is in the same file: `N` advances a week, `1`–`8` map to the tab list.
Adding or reordering a tab means editing three places together: the `tabs` array in
`main.js`, the `.rail-btn` order in `index.html`, and the `views` map in `ui.js`.

### The weekly tick

`KP.engine.nextWeek()` is the heart of the game and runs eight numbered steps in order,
plus five lettered ones wedged inside steps 3, 4 and 5: trends drift → training → market
tick → **3b booked schedules resolve** → **3c the rival agencies act** → chart build →
**3d the yearbook accrues** → group promo/decay + merch income → **4b rival groups read
the chart** → books (`weeklyBurn` − `weeklyMisc`) → **5b debt service** → events →
audition refresh (**and a rival poaches on the way out**) → fail state, then autosaves. An unnumbered rollover block above
step 1 announces a new season and, on a year boundary, holds the ceremony. Ordering matters
for the economy — e.g. `releaseComeback` prepays the first promo week precisely because the
final promo week clears `g.active` before step 5 bills.

The four ordering rules that are load-bearing rather than incidental:

- **3b runs before `buildChart()`.** A music-show booking adds chart points to
  `g.active`, and points added after the chart is built would only surface a week later —
  the stage would look like it did nothing.
- **A booking's fee is charged once, in `E.book()`.** It is a paid commitment, never a
  weekly line item, so `KP.weeklyBurn()` must never learn about `st.bookings`. A live
  show's production budget is prepaid on exactly the same terms.
- **5b runs after step 5.** A loan's instalment *is* a weekly line item, inside
  `KP.ledger()`, so step 5 has already paid it by the time `E.serviceDebt()` runs;
  5b only amortises, judges whether it was paid with money that existed, and retires the
  facility. Running it before step 5 would skip the final instalment and prepaying instead
  would double-bill it.
- **3c runs before `buildChart()` and 4b runs after it.** A rival agency's comeback is
  announced four weeks ahead, so it has to enter the market in time to be on the chart of
  the week it was announced for — releasing it after the build would put the wall a week
  late, on a ranking nobody was warned about. 4b is the other half: the rival groups read
  the same finished ranking the player's do, off the full chart rather than the
  twenty-five rows `st.chart` keeps. Nothing in either step touches the books.
- **3d reads the full chart, and `E.runAwards()` runs before `E.rollYear()`.** `st.chart`
  keeps twenty-five rows for one week and nothing else in the game remembers a chart ever
  happened, so `st.yearbook` is a live accumulator written while the data still exists —
  from the full ranked table, not the stored slice. `E.runAwards()` takes its year off
  `st.yearbook.y` and never off `st.year`, which the rollover has already incremented;
  reversing the two calls awards an empty year, every year.

Bookings come in three kinds — `music`, `variety`, `live` — sharing one board, one
resolver, one modal and one cancel path. `music`/`variety` specs live in
`KP.bookings.shows`; `live` specs are venues in `KP.venues`, because a venue is priced by
seats rather than by an appearance fee. `KP.showSpec(kind, key)` is the seam that hides
that split, so nothing outside `state.js` needs to know where a kind keeps its list.
`E.livePreview()` is to a live show what `E.planPreview()` is to a release: the single
source of truth, and `resolveLive()` applies one roll to the preview's own `expected`
rather than recomputing anything.

`E.planPreview()` is the single source of truth for release maths (quality, hype, points,
fatigue, debut penalty). `releaseComeback` calls it rather than recomputing, so the
planner's preview can never promise a number the release then undercuts. Keep it that way.

The rival chart is a persistent market (`st.market`) of ~22 decaying songs; player
releases are merged into it in `buildChart()` and ranked together.

### The rival agencies

`st.rivals` is four named agencies with rosters, line-ups and a comeback diary, and they
share the market rather than replacing it: **a rival agency's release is a market song
with a `rid` on it.** Nothing else in the chart pipeline knows they exist — `tickMarket`
decays it, the twelve-week window retires it, `buildChart` ranks it, and
`accrueYearbook` files it under `r:NAME` like any other artist. `KP.rivalArtists`
remains what it always was: names with nobody behind them.

Five things hold that split together:

- **A rival record stores only what changes.** The key, the roster, the diary — and it
  looks its numbers up in `KP.rivalAgencies` through `KP.rivalSpec()`, the way a booking
  stores a show key rather than a copy of the show. Rebalancing `pull` has to reach a
  save already in progress. `KP.seedRivals()` builds *missing* agencies rather than
  refusing when the array is non-empty, so a fifth name added to the data opens its
  doors in every existing save.
- **`E.rivalStrength()` is the single source of truth for what a rival release is
  worth, and it has no roll in it** — the schedule board, the comeback planner and the
  release itself all quote one number, the way `E.planPreview` and `E.livePreview` do.
  It is deliberately the *same shape* as the player's own opening points
  (`quality × .58 + hype × .42`), because the two are ranked against each other on one
  chart: written as a sum of uncapped terms with multipliers on top, every established
  rival sat on the 99 clamp within three years and every comeback became the same
  unbeatable wall.
- **A comeback plan exists from the moment the last one wrapped; visibility is what
  changes.** `KP.rivalPlanVisible()` is the only gate — `announceLead` weeks out, or the
  whole diary while a scouting report is live. A wall the player could not have known
  about is not a decision they made badly, which is why the plan is stored rather than
  rolled on the night.
- **Rival people are `KP.makeTrainee()` output, on the player's own distribution**,
  stripped by `KP.stripRivalPerson()` of the eight fields that only mean something to
  somebody on the payroll. Competition drawn from a kinder distribution would be a cheat
  the numbers could not show; sixty rival people carrying dead fields and full-precision
  floats is a third of a save file, and `KP.save()` writes the whole state every week.
- **An act has a contract and it runs out.** `g.retireAbs` is stamped the week the group
  is formed and `KP.rivalCareer()` is the one derivation off it, read by the fade inside
  `E.rivalStrength()`, by the retirement in `E.rivalWeek` and by the Rivals tab alike.
  It is a *term*, not a performance test, and that is the whole point: measured over ten
  years, 432 rival chart runs peaked between #3 and #16 — not one worse than #20 — on a
  chart that is only 32–57 rows deep, so a rule that waits for an act to stop charting
  waits forever. The first version did exactly that (`disbandQuiet`, "weeks outside the
  top fifty"), never fired once in a decade, and the market silted up: every agency hit
  `maxGroups` by year two and never debuted again, which quietly turned a poach into a
  trainee the player watches sit in somebody else's building for the rest of the run.
  Two rules keep the promise honest — nothing is booked past the term (`planComeback`
  refuses, so an announced wall always arrives) and nobody retires mid-promotion, so no
  song vanishes off a chart the player is competing on.

Three loops keep the market from silting up, and all three are load-bearing rather than
flavour: an agency at `maxGroups` stops auditioning, a **full roster still poaches** by
letting its weakest go, and a contract ending frees the slot the next debut needs. Gating
the poach on a free desk instead is what quietly ended that mechanic around year two —
every roster reaches the cap and stays there, and the one thing that makes an audition
decision hurt stops happening for the rest of the run.

### Save format

`localStorage` key `idol_empire_save_v1`; autosave at the end of every tick and after
debut/release. `KP.exportSave()` also writes a downloadable envelope
(`{app, fmt, stateVersion, savedAt, label, state}`) and `KP.importSave()` reads one back
— including a bare state object, since a raw localStorage dump is a file players end up
holding.

Because a downloaded save outlives the build that wrote it, there are two distinct ways
to change the state shape, and picking the wrong one breaks old files:

- **Additive** (a new field with a sane default) → add it to `normalise()` in `state.js`.
  No version bump; old saves get back-filled on the way in. `ensureMarket()` is the same
  idea done lazily in the engine. `st.bookings` (`[]`), `st.stats.stages` /
  `st.stats.varietyShows` / `st.stats.lives` / `st.stats.tickets` (`0`) and the per-group
  `g.stagesY` / `g.varietyY` / `g.livesY` / `g.ticketsY` (`0`) and `g.liveAbs` (`{}`) all
  went in this way: a save with no schedule in it is a valid save. So did
  `st.company.debts` (`[]`) and `st.company.prestige` (`0`) — a save with no debt in it is
  a valid save too — and so did `st.yearbook` (`{ y: st.year, acts: {}, songs: {} }`),
  `st.knownRivals` (`{}`), `st.awards` (`[]`), `st.pendingAwards` (`null`) and the
  per-group `g.trophies` (`[]`). An empty yearbook is a valid state: the first ceremony
  after loading an older file judges whatever the accumulator collected from the load
  point on, which is an honest degradation rather than a crash. The per-trainee
  `t.face` (`null`) went in the same way, with one wrinkle worth keeping: its back-fill
  is *derived* from `U.hue(t.id)`, not rolled, because a random default would hand the
  same save a different roster of faces on every single load. `st.rivals` (`[]`) is the
  same idea one size up: an older file has no agencies and `KP.seedRivals()` builds them
  on the way in, with every group stamped `debutY: 0` — established, never this year's
  debutant, because handing an old save four free rookie contenders would decide a prize
  it never watched being contested. The per-rival-group `g.retireAbs` follows `t.face`'s
  rule for the same reason and adds one of its own: it is *derived* from `U.hue(g.id)` so
  a file does not get a different set of farewells on every load, and it is floored at a
  year out so opening a long-running save does not wind up its entire rival roster in the
  week it is loaded.

A record with two calendars on it, which nobody should tidy: on `g.releases[]`, **`y`/`w`
mean the week promotions *wrapped*** (they always did, and 4–7 weeks after the fact),
while **`releasedY`/`releasedW` mean the week the song came *out*** (`g.active` carries a
third, `releasedAbs`, for as long as the release is live; archiving keeps the year and week
and drops it). Both calendars are stored because a week-50 release wraps in the following
year and would otherwise file its whole chart run under the wrong year's awards. Collapsing
one into the other is a breaking change, not a clean-up.
- **Breaking** (a field changes meaning, shape or units) → bump `SAVE_V` *and* add the
  matching rung to `KP.migrations`, where `migrations[n]` upgrades a `v=n` state to
  `v=n+1`. A missing rung is a hard, reported failure, never a silent pass.

Everything funnels through `KP.migrate()`, which works on a copy: a rejected file leaves
the run in progress untouched, and both `KP.load()` and `KP.importSave()` go through it,
so a save carried over in `localStorage` migrates exactly like an imported file.

### The weekly books

`KP.ledger()` is the single derivation of the weekly books; `KP.weeklyBurn()` delegates to
it and `officeTab` reads it. A new weekly line item is one entry in `outMap` and one tuple
in `ui.js`'s `ledger()`, and nowhere else — the three hand-rolled copies this file used to
carry drifted the moment anything new was billed.

Two invariants hold it together:

- **`totalOut` is exactly what step 5 debits.** Nothing else may be added to it, and
  nothing in it may be billed anywhere else.
- **An investor's revenue share is taken at source in `E.earn()` and must never appear in
  `totalOut`.** It is surfaced as `ledger().share` and folded into `net` for display only;
  billing it in step 5 would charge it twice, and leaving it out of `net` would make the
  HUD overstate income. Every income credit goes through `E.earn(st, amount, tag)`, and
  `KP.finance.shareTags` decides which tags are shareable. Borrowed money never goes
  through it: a financier does not take a cut of their own cheque.

`KP.ledger()` runs on every `ui.render()`, so it must never mutate a loan, a booking or a
balance. Amortisation lives in `E.serviceDebt()`, step 5b.

A loan is described by two counters that have to keep agreeing, so neither the ledger nor
5b reads `d.weekly` directly: **`KP.debtInstalment(d)` is the one number both use** —
`min(weekly, remaining)`, zero once the balance is clear. `KP.debtOutstanding()` (the HUD's
"Debt", the finance card, `E.payoffCost`) reads `remaining`, while step 5 debits the
instalment, so a term counter left running against a zero balance bills money nothing in
the game admits is owed. Hence: a loan retires on *either* counter hitting zero, and
anything that stretches the term (the miss branch) re-derives `weeksLeft` from
`remaining / weekly` after the rate hike rather than incrementing it.

## Conventions

- Money is Korean won as a raw number; `U.money()` renders 억/만 compound form. All
  balance constants live in `KP.costs`, `KP.income`, `KP.difficulties`, `KP.tiers` —
  tune there, never inline in `engine.js`.
- Trait effects are declarative in `KP.traits` and read generically by `traitMul()` /
  `traitAdd()` in the engine. A new trait is a data entry plus, if it needs a new effect
  path, one call site.
- Facility/staff kinds are the strings `'fac'` and `'staff'` throughout upgrade/downgrade.
- **Every new-fan number goes through `fanGain(g, raw)`** in `engine.js`, which damps a raw
  gain by `1 + g.fans / KP.income.fanSaturation`. This is not decoration. Several fan
  sources are written as a *share of the fandom* — a music stage is `fansPct` of it, a
  variety appearance the same, a fancam five to fourteen percent of it — and a percentage
  applied every week is compound interest. Undamped, a group with a full diary takes on
  ~13% a week, ×600 a year, and by year four the fandom and the merch income keyed to it
  are past what the number formatter can print. Damped, the percentage terms converge on a
  constant number of new fans per week. Seat sales are already bounded by the venue and are
  credited raw. The previews damp at the *quote* too (`E.bookPreview`): `fanGain` is linear
  in `raw`, so quoting the raw figure and crediting the damped one is a modal that lies by
  exactly `1 + fans / fanSaturation` — a number that gets less true the better the player
  is doing.
- `st.company.rep` is what events move; `KP.standing(st)` is what gates read —
  `clamp(rep + min(prestige, KP.awards.prestigeCap), 0, 100)`, where prestige is the
  permanent residue of trophies. Every gate, pull and lock reads `KP.standing()`, in
  `state.js`, `engine.js` and `ui.js` alike, so that a new source of standing lands
  everywhere at once and a greyed-out row can never disagree with the engine that refuses
  it.
- A prize is a data entry: `KP.awards.prizes` says what it is worth and
  `KP.awards.score[k]` is the weighted sum of the year's record that decides it, read
  generically by `ballotScore()` the way `KP.traits` is read by `traitMul()`.
- A rival agency is a data entry: `KP.rivalAgencies` says who they are and how they
  behave, `KP.rivals` holds the constants every one of them shares, and `KP.rivalSpec()`
  is the only way state reaches either. Adding a fifth agency is one entry in `data.js`
  and nothing else — including for saves already in progress.
- A portrait is addressed by index, never by filename. `KP.faces.count` in `data.js` is
  the only number to touch when the pool grows and `KP.faces.src()` the only place a path
  is built; `count: 0` disables portraits and every avatar falls back to the gradient
  monogram, so `img/faces/` is optional art rather than a dependency. `avatar()` in
  `ui.js` paints it as a background layer rather than an `<img>` on purpose — `render()`
  rebuilds `#stage` on every click, and a fresh node each redraw flashes.
- `css/style.css` is the whole visual system, tokens in `:root`. `--accent` is overridden
  per group card so a group renders in its own lightstick colour. Gold (`--gold`) is
  reserved for wins only — trophies, #1, all-kill. `prefers-reduced-motion` is respected.

`README.md` holds the design intent and the sprint backlog; read it before adding
features so new work lands in the planned direction.
