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

Keyboard handling is in the same file: `N` advances a week, `1`–`9` map to the tab list.
Adding or reordering a tab means editing three places together: the `tabs` array in
`main.js`, the `.rail-btn` order in `index.html`, and the `views` map in `ui.js` — plus
`TABS` in `test/game.js`, or the new screen is never rendered by the harness and its
first NaN ships.

### The weekly tick

`KP.engine.nextWeek()` is the heart of the game and runs eight numbered steps in order,
plus seven lettered ones wedged inside steps 3, 4 and 5, and a step 0 above all of them:
**0 an unanswered scandal is answered with silence and an unanswered finals night signs
nobody** → trends drift → training → **2c the room settles** → market tick → **3b booked
schedules resolve** → **3c the rival agencies act** → chart build → **3d the yearbook
accrues** → group promo/decay → **4b rival groups read the chart** → **4c the fandom
settles and then pays** → books (`weeklyBurn` − `weeklyMisc`) → **5b debt service** →
**5c platform deals** → events → **6b the seven-year cliff** → **6c the survival show** →
audition refresh (**and a rival poaches on the way out**) → **7b the record books** → fail state, then autosaves. An unnumbered rollover block above step 1
announces a new season and, on a year boundary, **remembers the year and then** holds the ceremony. Ordering matters
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
- **4c runs after every fan gain and credits the merch line itself.** Loyalty, sentiment
  and the international split all move in `E.fandomWeek`, and the merch credit sits
  *inside* it rather than in step 4 — the money is keyed to numbers this step has just
  moved, so billing it earlier would price the week before the scandal that happened in
  it. `KP.merchWeek(g)` is the one derivation: step 4c credits it and `KP.ledger()`
  projects it. Two copies is how a HUD starts lying about income.
- **2c runs before the bookings resolve, and 6b runs after the events.** `E.bondWeek`
  drifts every pair toward `KP.bonds.base` before the week's cast bonds on top of it —
  reversed, a booking's gain is immediately averaged back toward the middle and the diary
  looks like it did nothing. `E.contractWeek` is last of the three because the burnout
  event can remove the very person an expiry notice would be served to, and both leave
  through `E.leaveGroup`, so whichever fires first leaves the group in one consistent shape.
- **Step 0 answers a story nobody answered.** `st.scandal` is a question with a deadline,
  and the deadline is the tick. Resolving it at the top of `nextWeek` — before the clock
  moves — is what makes closing the tab a decision with one outcome rather than a modal
  that follows the player forever, and it is why `E.scandalRespond` must never refuse a
  free answer: gating it on `cost > money` alone is true at cost zero on a negative
  balance, which left a broke agency permanently unable to resolve anything. A survival
  show's finals night is the second question of exactly this shape and is answered in
  exactly the same place: `st.survival.ready` with no picks means the agencies took the
  room. Anything the game asks and waits on belongs in step 0, never on a timer.
- **7b is the last thing the tick does, on purpose.** A record is a high-water mark, and a
  high-water mark has to be a number the player could have seen. A fancam in step 6 adds
  fans and a scandal takes them away, so a level sampled before the events is a peak that
  existed for nobody; sampled at the end it means "the biggest it ever was on a Sunday
  night", which is the only reading a screen can honestly print. Only the three records that
  are a *level* are sampled here — a gate, a first week and a reign only exist for one line
  of one function and are stamped where they happen.
- **`E.runReview()` runs before `E.runAwards()`, and both before `E.rollYear()`.** All three
  read `st.yearbook` and the third empties it. The review comes first because it records
  what the year *was*: run after the ceremony it would report a reputation, a fandom and a
  standing the trophies had already moved, and the modal that opens straight after it would
  have been spoiled by the page before. It is also the only one of the three that runs
  unconditionally — the ceremony returns early on an empty ballot, and a year with no
  releases in it is exactly the year a player most wants a page about.
- **3d reads the full chart, and `E.runAwards()` runs before `E.rollYear()`.** `st.chart`
  keeps twenty-five rows for one week and nothing else in the game remembers a chart ever
  happened, so `st.yearbook` is a live accumulator written while the data still exists —
  from the full ranked table, not the stored slice. `E.runAwards()` takes its year off
  `st.yearbook.y` and never off `st.year`, which the rollover has already incremented;
  reversing the two calls awards an empty year, every year.

Bookings come in four kinds — `music`, `variety`, `live`, `tour` — sharing one board, one
resolver, one modal and one cancel path. `music`/`variety` specs live in
`KP.bookings.shows`; `live` specs are venues in `KP.venues` and `tour` specs are routings
in `KP.tours`, because a venue is priced by seats rather than by an appearance fee.
`KP.showSpec(kind, key)` is the seam that hides that split, so nothing outside `state.js`
needs to know where a kind keeps its list, and `KP.isGig(kind)` is the one place the
question "is this a ticketed show?" is asked — `live` and `tour` share `E.livePreview`,
`resolveLive`, the gap rules and the `g.liveAbs` cooldown map.

**A tour is one commitment stored as one record per leg**, sharing a `tourId`: the whole
production budget leaves the balance at booking (so the "a fee is never a weekly line
item" rule holds per leg), the board shows the consecutive weeks it really eats, step 3b
resolves them one at a time, and `E.cancelBooking` pulls every leg of the run — a group
stranded mid-tour with the rest of its dates cancelled is not a state the schedule should
be able to reach. Legs are exempt from `KP.live.gap` among themselves and from nothing
else.
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

### The fandom as a system

`g.fans` is how many. `g.loyal`, `g.senti` and `g.intl` are what kind, and everything they
are worth is derived in `KP.fanMods(g)` in `state.js` — six multipliers (sales, merch,
pull, acq, hype, stream) that the engine spends and the Fandom tab prints. Four rules hold
it together:

- **The modifiers are anchored to `KP.fandom.midLoyal` / `midSenti`, not to the starting
  values.** Those two constants are where the *simulation says a group settles*, measured
  over ten in-game years, and they are deliberately not `loyal0` / `senti0`. Anchored to
  the starting values instead, the sprint is a standing bonus for everybody rather than a
  spread between the agency that works its fandom and the one that does not: the first
  cut had sentiment parked at 80 within two years, worth ~12% on fan acquisition every
  week, which compounded into three times the fandom over five years. Re-anchored and
  re-based, the same seeds playing the same Sprint 3 game land within ~8% of the Sprint 3
  build — which is the target. **Re-tune these by measuring, never by reasoning.**
- **`E.gainFans()` is the only place fans are added**, and it dilutes: a newcomer arrives
  at `newFanLoyal` and is averaged into the loyalty of everybody already there. `fanGain()`
  stays pure because the previews quote it; `E.creditFans()` is the undamped door seat
  sales come through. A percentage-of-the-fandom gain that skips this is a free fandom.
- **Sentiment settles in a narrow band** (`sentiBase` + momentum + standing ≈ 48–62).
  Above it is bought a variety slot and a trophy at a time and decays back; below it is
  where a scandal puts you. A wide band makes the number a tax or a gift, not a decision.
- **A scandal is state, not a modal.** `st.scandal` holds the truth (rolled once, never
  shown), the PR read (rolled once so a redraw cannot shop for a better opinion) and the
  severity; `E.scandalOptions()` is pure so the modal can be redrawn; `E.scandalRespond()`
  is the single resolution path for all four answers including `silence`; and `st.fallout`
  is a denial that was a lie, resolved weeks later in 4c. The UI only ever picks a key.

A platform deal is the third facility shape after the loan and the investor, and it is
its own: no principal, no instalment, no buyout. An advance through `E.earn(…, 'deal')`,
a weekly commitment in `KP.ledger`'s `out.platform`, a multiplier on streaming revenue
only, and `E.serviceDeals()` as step 5c on exactly the terms 5b has — step 5 has already
billed the fee, so 5c only counts the term down and judges the deal on the way out.

### The people as a system

A group used to be `memberIds` and nothing else. Four things now hang off the people in
it, and the first of them is what the other three are priced in.

**A bond is per PAIR, and it lives in exactly one place.** `g.bonds` is
`{ 'idA|idB': value }`, keyed order-independently by `KP.bondKey` — a pair is not a
direction, and writing it both ways round would give two people two histories the first
time a different code path touched them. `KP.chemistry()` averages them, `KP.chemPerf()`
and `KP.chemEdge()` are the only things that read the average, and `E.bumpBond` is the
only thing that writes one. Three rules hold it:

- **A sub-unit has no bonds of its own.** `KP.bondHost()` routes a unit's reads and writes
  to its parent, because the two people in a sub-unit are the same two people in the group.
  A second copy would drift from the first the week the two acts had different schedules.
- **`KP.bonds.mid` is measured, never reasoned about** — 57.0 over sixty ten-year games,
  and deliberately not `base` (50, where a bond drifts with nothing happening). Anchored to
  `base`, every group that does the ordinary thing carries a standing +2% on song quality,
  which is Sprint 4's sentiment mistake in a different currency. A line-up of one returns
  `mid` rather than `base`: a soloist is not a group with bad chemistry, and anchoring them
  to `base` would tax every solo debut by the distance between the two constants.
- **Bonds are rounded to one decimal on write.** `KP.save()` stringifies the whole state
  every week and a 7-member group is 21 pairs.

**A unit is a group record with a `parentId`**, which is why nothing in the chart pipeline,
the books, the schedule board or the yearbook had to learn about it — all of them take a
group. What a unit is *not* is a second payroll: `t.groupId` still points at the parent, so
the same person is paid once, trains once and is injured once while appearing on two
diaries. That single fact is what the following three exceptions exist to protect, and they
are the whole of the special-casing:

- `KP.ledger`'s `idols` line and `KP.totalFans` iterate `KP.mainGroups(st)`. Paying a unit
  member twice would make a unit a running cost; counting its fandom twice would let a
  player raise their own credit limit by forming one.
- `KP.merchWeek` multiplies a unit by `KP.units.merchShare`. A unit's fandom is a *subset*
  of its parent's — one person, one lightstick, now following two acts — so a weekly line
  keyed to a head count has to be discounted. Albums, tickets and streams are not, because
  those genuinely are a second thing that fan bought.
- Sasaeng pressure (4c) and the Mood Maker lift (2b) run over main groups only. The crowd
  outside the dorm is not there twice.

A unit is also off the Rookie ballot (`E.runAwards`), or the prize becomes an annuity you
re-win every year by splitting the same group a different way.

**Every exit goes through `E.leaveGroup` and every disband through `disbandGroup`.** Both
used to be written inline inside the burnout event, which is why positions were never
redistributed after a departure — `E.assignPositions` now clears `m.position` before it
assigns, so it is re-runnable and a group could no longer be left holding a Leader who
walked out eighteen months earlier. `E.leaveGroup` prunes the leaver's pairs (a bond map
that keeps a departed member averages in somebody who is not in the building), shrinks or
folds any unit they were in, charges the fandom, the public mood and the reputation, and
disbands the group if it empties. What happens to the *person* afterwards is the caller's:
a graduate goes back to the trainee room, an expired contract walks out of the building.

**A disbandment the player chooses is `E.disband`, and it decides per person.** It still
ends through `disbandGroup` (units, diary, chart row and any story go with the act), but the
people are the decision: kept on (trainee room, `KP.disband.morale` off, and a slice of the
fandom as `t.fame`, scaled by loyalty, which the existing debut/join paths already cash and
`trainWeek` already decays) or released (out of `st.trainees` and through `toMarket`, the same
poach path an expired contract takes). It is not a free contract reset: anybody inside the
renewal window costs `KP.renewCost` to keep — priced in `E.disbandPreview` *before*
`disbandGroup` clears the group the fee is read off — and anybody `KP.willRenew` refuses
walks whatever the player ticked. It refuses while `st.scandal` points at the group (ending
the act is not an answer), and the fee gate is `fee > 0 && fee > money`, so a broke agency
can still end an act. `E.disbandPreview` is the single source of the modal's numbers.

**A contract is `t.debutAbs` + `t.contractAbs`, stamped at debut and nowhere else.** A
trainee has neither — a training agreement has nothing to renegotiate — and `normalise()`
strips them from anybody without a `groupId` for the same reason. `KP.renewCost()` is what
they are worth × what they think of you, and `KP.willRenew()` is the floor under that: below
`refuseBelow` there is no number, which is the only place in the game money cannot answer.
The two warnings `E.contractWeek` logs are stateless (`left === 52`, `left === 8`) because
the tick runs exactly once a week, so an equality fires exactly once per person and needs no
flag on the record.

The cliff is a real decision and it is priced like one: measured over ten in-game years on
the same seeds, an agency that never opens the renewal table finishes with **a quarter of
the trophies** of one that does, and dies no more often. That is the shape a new decision
should have — neutral before it, expensive to ignore after it.

**A survival show is one record with a deadline.** `st.survival` holds the cast and the
votes; `E.survivalWeek` accrues them and calls the finals on `endAbs`; `st.survival.ready`
is a question step 0 answers with nobody. `t.fame` is what the finals actually hand out — a
fandom at the debut showcase (`E.debut` reads it) that decays every week the person is not
on a screen (`trainWeek`), so the show creates a deadline on the training plan rather than
a free trainee.

### The face and the memory

Sprint 6 changed no rule — the A/B against the previous build is bit-identical on every
economic metric — and it is still the sprint most likely to be broken by a tidy-up, because
all of it is derived and none of it is stored.

**A sleeve is a pure function of the song and nothing about it is in the save.**
`KP.cover(seed, conceptKey, accent)` in `state.js` returns three colours off `KP.art`, a
motif and ten numbers; `coverArt()` in `ui.js` is the only thing that paints one. The split
is `KP.traits`' split with the engine: **palette is meaning, motif is identity.** The
palette comes from the concept (`c.pal`), so a Dark Fantasy era looks like one across four
agencies; the motif comes from the hash, so two songs of one concept are two sleeves. A new
palette is one entry in `KP.art.palettes` plus one `pal` on a concept; a new motif is one
name in `KP.art.motifs` plus one branch in the painter.

Three rules hold it:

- **`KP.songCover()` is the only place a seed is built.** `KP.relCover` (a release),
  `KP.rowCover` (a chart row) and every archived record funnel through it, and the harness
  asserts they still agree. Written in two places, a song grows a second face the week it
  moves off the ladder and onto the shelf — the most visible way a generated cover can be
  wrong. Ours is keyed by group id (two agencies may both have a "Neon Halo"); somebody
  else's is keyed by the artist name, because that is all the market ever tells us.
- **The painter never rolls.** Every placement comes out of `cv.r`, which `KP.cover` derived
  from the song, so `ui.js` stays a pure `state → HTML` function and two renders of one song
  are byte-identical. `U.hash` is the wider hash everything new derives from; `U.hue` is
  deliberately left alone because it is baked into two save back-fills (`t.face`,
  `g.retireAbs`) and widening it would re-roll every portrait in every existing file.
- **Only our own songs store a concept.** `accrueYearbook` stamps `concept`/`color` on a
  yearbook song when `r.mine`, and a rival's archived song simply has none — the hash picks
  its palette exactly as it does for the anonymous half of the ladder. A year of rival
  titles carrying two dead fields each is save size spent on a jacket nothing prints.

**`--accent` now travels with `--wash`.** CSS cannot fade an arbitrary hex without
`color-mix`, and an act's identity has to reach a background as well as a border, so
`skin(color)` in `ui.js` writes both at once and every surface that carries an act — the
group card, a chart rung, a schedule row, a trainee's group chip — gets them together.

**`E.bumpStat` is the one door for the counters** the way `E.earn` is for money: `st.stats`
is the career and `st.statsY` is the year in progress, they are the same fourteen keys
(`KP.STAT_KEYS`), and `E.rollYear` clears the second. Written apart, a year-in-review starts
disagreeing with the career total it is a slice of the first time somebody adds a counter and
updates one of them. **`E.record` is the same door for the record books**: every entry in
`KP.recordKinds` is a MAXIMUM, so one comparison and one stamp covers all ten, and a
"lowest" or a "best rank" would need its own empty state and its own comparison. It returns
the entry it wrote, which is the only sanctioned way to reach into `st.records` — used once,
by `runReview`, to restamp the one record that is about a year rather than a week.

**A review is stored, a headline is not.** `E.runReview` writes numbers; which of them is
*the* number is a reading of the year and is built in `ui.js`, the same way `KP.fanMods` is
derived in `state.js` and printed in `ui.js`. The review also deliberately does **not**
quote a share of the chart year: the ladder is fifty ranks deep and sixty acts wide, and an
anonymous market name is a catalogue of seven releases rather than an act, so a year that
won the daesang prints as "2% of the chart". `KP.awards.rivalRateShare` exists to discount
exactly that distortion on the ballot; the review answers it by quoting weeks at #1 and by
showing the player's own best act at its true position however far down that is.

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
  week it is loaded. Sprint 4 went in the same way, and it is the clearest case of why the
  *value* of a default matters as much as its existence: `g.loyal` / `g.senti` / `g.intl`
  back-fill to `KP.fandom`'s starting values, which are the exact values every modifier is
  written as a deviation from — so an older save loads into the economy it was playing in
  and starts moving from there rather than being repriced on open. `st.company.deals`
  (`[]`), `st.scandal` / `st.fallout` (`null`, and dropped outright when they point at a
  group the file no longer has), the per-group `g.tourLegs` / `g.toursY` (`0`) and
  `st.stats.tourLegs` / `st.stats.scandals` (`0`) are the rest of it. `t.status` gained a
  third value, `hiatus`, and `normalise()` sanitises anything it does not recognise back to
  `ok`: a file that has never heard of it simply has nobody on one.

  Sprint 5 is additive too, and two of its defaults are worth reading before touching:
  `g.bonds` back-fills **empty**, not seeded, because `KP.bondOf` answers `KP.bonds.base`
  for a pair it has never heard of — an older file loads as a line-up that has neither
  earned anything nor been put through anything, which is the only honest reading of a
  history it never kept. `t.contractAbs` is *derived from the group's debut* rather than
  from the load week: an idol who debuted six years ago walks straight into their renewal
  year, which is what the save actually says happened. Stamping the term from "now" would
  hand every long-running file seven free years. `t.fame` (`0`), `st.survival` (`null`, and
  dropped whole rather than half-restored when its cast is gone), the per-group unit fields
  and `st.stats.units` / `renewals` / `departures` / `shows` (`0`) are the rest. A unit whose
  parent, kind or members the file no longer has is dropped in `normalise()` — after the
  group loop, because every one of those checks reads a second group — and the booking
  filter below it takes its diary with it.

  Sprint 6 is additive too, and it is the cheapest sprint to load because none of the new
  presentation is stored: a cover is derived every time. What *is* stored back-fills as
  `st.reviews` (`[]`), `st.pendingReview` (`null`), `st.records` (`{}`) and `st.statsY`.
  Three of its defaults are worth reading before touching. `st.statsY` back-fills to **zero,
  not to `st.stats`** — an older file has no idea how much of its career happened since
  January, and starting the year's column from the career total would print a first review
  claiming every release the agency ever made. A record whose kind this build no longer has
  is *dropped* rather than repaired, because it is a row nothing can label; a review with no
  year on it goes the same way, because it cannot be filed or found again. And an older save
  simply has no reviews for the years it already played: that history was never kept, and
  inventing one would be worse than the gap. The two fields the yearbook grew
  (`songs[k].concept` / `.color`) are absent on an older file and the sleeve falls back to
  the hash palette — the same jacket the anonymous half of the ladder has always worn.

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
  nothing in it may be billed anywhere else. A platform deal's weekly commitment is a line
  item here (`out.platform`) for the same reason a loan instalment is, and 5c amortises it
  on the same terms 5b does.
- **An income line with two readers has one derivation.** `KP.merchWeek(g)` is credited by
  step 4c and projected by `in.merch`; the moment the two are written separately, a
  scandal moves one and not the other and the HUD is quoting a week that does not happen.
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
- **Every new-fan number goes through `E.gainFans(g, raw)`** in `engine.js`, which damps a
  raw gain by `1 + g.fans / KP.income.fanSaturation` (`fanGain`, still pure and still what
  the previews quote) and then credits it and dilutes loyalty. This is not decoration. Several fan
  sources are written as a *share of the fandom* — a music stage is `fansPct` of it, a
  variety appearance the same, a fancam five to fourteen percent of it — and a percentage
  applied every week is compound interest. Undamped, a group with a full diary takes on
  ~13% a week, ×600 a year, and by year four the fandom and the merch income keyed to it
  are past what the number formatter can print. Damped, the percentage terms converge on a
  constant number of new fans per week. Seat sales are already bounded by the venue and go
  through `E.creditFans()`, which skips the damper and dilutes anyway. The previews damp at
  the *quote* too (`E.bookPreview`): `fanGain` is linear
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
- A unit kind is a data entry on the same terms: `KP.unitKinds` says what a sub-unit and a
  solo debut are, `KP.units` holds the constants both share, and `KP.unitSpec()` /
  `KP.unitKind()` are the only way state reaches either. A third kind is one entry.
- **Anything that is worth ×1.00 somewhere is anchored to a MEASURED equilibrium, never to
  a starting value.** `KP.fandom.midLoyal` / `midSenti` and `KP.bonds.mid` all exist for
  this and all three were set from the harness rather than from reasoning. A modifier
  anchored to where a number *starts* is a standing bonus for everybody instead of a spread
  between the agency that works the system and the one that does not — see
  `test/README.md`, which has the receipts for both times it was got wrong.
- A tour routing, a streaming platform and a scandal are data entries, on the same terms:
  `KP.tours`, `KP.platforms`, `KP.scandals` say what they are, `KP.fandom` / `KP.deals` /
  `KP.scandal` hold the constants they share, and state reaches them only through
  `KP.showSpec()`, `KP.platformSpec()` and `KP.scandalSpec()` — so a fifth scandal kind or
  a fourth platform is one entry in `data.js`, including for saves already in progress.
- A record is a data entry: `KP.recordKinds` says what it is and how it prints (`fmt`),
  `E.record()` is the only thing that writes one, and a new record is one entry plus one
  call at the place the thing actually happens. Every one of them is a maximum.
- A palette and a motif are data entries: `KP.art` says what a sleeve can be made of and a
  concept's `pal` says which palette it means. A new palette is one entry plus one `pal`; a
  new motif is one name plus one branch in `coverArt()`.
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
