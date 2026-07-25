# IDOL EMPIRE — 아이돌 제국

A K-pop agency management sim that runs in the browser. You sign trainees, build them
up week by week, debut a group, and fight for the weekly chart against a living market
of rival releases.

## Run it

```bash
cd /Users/lukastison/Code/temp/opus5
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly with `file://` also works in most browsers (all scripts
are plain `<script>` tags, no modules, no build step), but some browsers block
`localStorage` on `file://`, which disables saving. The local server is the safe option.

Saves live in `localStorage` under `idol_empire_save_v1` and autosave every week.

## Controls

| Key | Action |
|---|---|
| `N` | Advance one week |
| `1`–`6` | Jump to Office / Trainees / Scouting / Groups / Chart / Feed |
| `Esc` | Close a dialog |

---

## Sprint 1 — shipped

The full loop is playable: audition → train → debut → comeback → chart → money → repeat.

**Company**
- Three starting capital levels (Backed ₩30억 / Independent ₩20억 / Basement ₩15억)
- Reputation gates the best producers, choreographers, MV budgets and auditions
- Seven upgradable slots: practice rooms, studio, dorm, vocal coach, dance coach,
  A&R producer, marketing lead (levels 1–5). Every level has a real effect — practice
  rooms and coaches drive training speed, the dorm drives recovery, the studio adds song
  quality, marketing adds hype
- Levels can be scaled back for 40% of what they cost, down to a floor of level 1. Buying
  and selling is always a loss, so it is an escape hatch and never an income source
- Weekly books, line by line: merch and side income against trainee upkeep, idol pay that
  scales with fame, facilities, staff and running promo. Runway is shown; −₩5억 ends the run.

**People**
- Generated trainees: 6 skills (vocal, dance, rap, visual, stage, variety), each with a
  hidden-ish ceiling shown as a tick on the bar, plus age, nationality and traits
- 13 traits with real effects — Ace, Choreo Machine, Fan Magnet, Slow Starter,
  Injury Prone, Homesick, Stage Fright and more
- Weekly training assignment per person, including Rest. Stamina and morale drive
  training speed; overwork causes injuries, low morale can end in a contract termination
- Signing costs scale with ceiling, current skill and youth

**Groups**
- Debut wizard: pick 3–7 members, concept, name, fandom name, lightstick colour
- Positions (Leader, Main Vocal, Main Dancer, Main Rapper, Visual, Maknae) auto-assigned
  from stats and age
- Fandom size drives merch income, album sales and the lightstick ocean on the group card

**Releases**
- Comeback planner with five production decisions — producer, choreography, MV,
  styling, promotion plan — each with a cost, a quality value and a reputation gate
- Concept fit is computed from the line-up; concept trends drift weekly, so timing matters
- Repeating your last concept costs hype; releasing too soon costs fandom freshness
  (full recovery at 16 weeks)
- Live preview of song quality, hype, opening chart points and total budget before you commit

**The chart**
- A persistent rival market: songs enter, chart, decay and drop out over ~12 weeks
- Your release is ranked against it every week. #1 wins reputation, momentum and a trophy
- First-week physical album sales, weekly streaming revenue, weekly fan growth, peak
  position and win count recorded in the group's discography

**Events**
- 10 weekly events: viral fancams, CF offers, dating rumours, variety bookings, internal
  conflict, scout finds, burnout and departures, dance challenges, live-stage clips,
  emergency investors

**Presentation**
- Concert-dark palette with a pink/cyan fandom duotone; gold is reserved for wins only
- The signature element is the lightstick ocean: fandom size rendered as a field of
  glowing lights in the group's own colour
- Responsive to mobile, keyboard-navigable, `prefers-reduced-motion` respected

## Backlog — what the next sprints add

**Sprint 2 — the calendar year**
Year-end awards (daesang, rookie of the year), seasonal chart pressure, music show
appearances as a schedule you book rather than an abstraction, variety show bookings,
fan meets and concerts as explicit revenue events, a proper loan/investor system.

**Sprint 3 — rivals with faces**
Rival agencies that sign the trainees you passed on, debut competing groups, and steal
your comeback week. A named rival roster you can scout, and a "who debuted this month"
rookie race.

**Sprint 4 — the fandom as a system**
Fandom loyalty and sentiment separate from size, international vs domestic split,
world tours, streaming platform deals, scandals with a management minigame
(statement, hiatus, denial), sasaeng and antifan pressure on member morale.

**Sprint 5 — depth on people**
Member relationships and unit chemistry, sub-units, solo debuts, contract renewals and
the 7-year cliff, graduations and line-up changes, survival-show recruitment.

**Sprint 6 — presentation**
Album art generator, per-group visual identity carried through the UI, a year-in-review
recap screen, and a stats/records hall.

## Layout

```
index.html          shell: start screen, topbar, rail, stage, modal root
css/style.css       the whole visual system
js/data.js          static content and utilities — names, concepts, tiers, costs
js/state.js         state creation, people generation, derived numbers, save/load
js/engine.js        the simulation: training, market, chart, releases, events, tick
js/ui.js            rendering — every screen is a function of state
js/main.js          bootstrap and input routing (all clicks go through data-act)
```

Adding content means editing `data.js`; adding a mechanic means one function in
`engine.js` and one block in `ui.js`.
