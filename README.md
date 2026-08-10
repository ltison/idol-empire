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

Saves live in `localStorage` under `idol_empire_save_v1` and autosave every week. The
agency menu (`⋯`) can also download the run as a JSON file and load one back — including
on the title screen, so a save moves between browsers. Files written by older versions
stay importable: additive fields are back-filled on read, and a breaking change adds a
rung to the migration ladder in `js/state.js`. A save from a *newer* build is refused with
a message rather than half-loaded.

## Controls

| Key | Action |
|---|---|
| `N` | Advance one week |
| `1`–`9` | Jump to Office / Trainees / Scouting / Groups / Schedule / Chart / Rivals / Fandom / Feed |
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

## Sprint 2 — shipped

The run used to be an endless queue of weeks. Now it is a **year**: it has seasons that
change what charting is worth, a diary you fill in yourself, and an ending in December.

**The calendar**
- 52 weeks to a year, six named seasons — New Year quiet, spring comebacks, the mid-year
  lull, summer songs, fall comebacks, award season — each with its own rival strength,
  audience multiplier, stage capacity and set of concepts the public currently wants
- Concept trends are pulled toward what the season favours instead of drifting freely, so
  the fashionable concept is a moving target you can plan a comeback around
- The season that pays best is the season you are least likely to win, and the dead weeks
  you could dominate are the weeks nobody is spending. Both are shown as numbers
- Everything that measures a distance in time works in absolute weeks, so cooldowns and
  bookings survive a year boundary

**The schedule** — a fifth tab, and the biggest change to how a week is played
- A board of the next 8 weeks, one row per group per week. Every appearance is booked
  ahead, paid **in full at the moment you book it**, and resolved on its week — so a diary
  never quietly changes the runway. What it costs afterwards is stamina
- Three music shows (cable / network / broadcast special). A stage is performed *before*
  the week's chart is counted, so the points land on this ranking rather than the next one
- Four variety shows, pitched at a `variety` level and graded on whoever is funniest in the
  room: went viral / went well / fell flat. A booking is also a lesson — the whole cast
  picks up variety, which is the only way a stiff line-up ever learns to be entertaining
- Slots are finite: a show's capacity shifts with the season and the rivals on the bill
  take their share, deterministically, so a one-slot flagship can vanish for weeks at a time
- Cancelling more than two weeks out returns half the fee. Inside that window the slot is
  already printed in somebody else's schedule: nothing back, and it costs goodwill
- Book somebody with nothing left and they get injured. Book a group with nobody fit and
  the appearance is missed in public
- Every figure in the booking modal is the figure the week will actually credit. New fans
  are damped where they are quoted, not only where they are paid, and a show is quoted for
  *its* week rather than for today — a live booked past the last week of promotions is
  priced as the cold house it will be, which is the difference between a decision and a sales
  pitch

**Live shows** — the first thing on the board meant to make money
- Fan meeting → solo concert → arena → dome, unlocked by fandom, prepaid as a production
  budget, and paid back by ticket sales. The only booking that can come in under cost
- Attendance is fandom × the venue's pull × a stack of things you can move before show
  night: an active comeback, momentum, standing, how long since anybody heard from them,
  and the week of the year. The modal shows break-even, the attendance band, the gate and
  a plain verdict — safe, a risk, or do not book it
- A newly unlocked venue *loses money* until something else is going right. Sold-out nights
  pay reputation and momentum; empty seats get photographed
- Cooldowns per tier, plus three weeks between any two shows by the same group

**Year-end awards**
- Eight prizes: the daesang, Album and Song of the Year, Rookie of the Year, Popularity,
  Best Performance, Entertainer of the Year, and five bonsangs
- Scored from a **yearbook** accrued every week from the full ranked chart, because nothing
  else in the game remembers that a chart ever happened. Credit is rank-weighted over the
  top 50, so a week at #1 is worth fifty weeks at the bottom of the ladder
- Each prize is a weighted sum over a different set of axes, so eight prizes are eight
  different awards: Album of the Year is mostly sales, Best Performance is mostly stages
  booked, Entertainer is who you sent to variety, and Rookie drops sales entirely so a
  first-year group can take it on chart points alone
- Rivals keep no books, so theirs are synthesised from their chart record at a rate
  measured against *your* year — a market act with an unbounded fandom to compare against
  is the difference between a ceremony and a formality
- The market produces genuine debutants from the second year on, so the rookie race has
  somebody in it besides your own new group
- Awards pay no cash, because award shows never do. They pay reputation, fandom, momentum
  and **prestige** — permanent standing that gates producers, broadcasters, venues and
  credit for the rest of the run. A trophy is spent on next year's board
- The running ballot is on the office wall from week one: an award you cannot see coming is
  an award you cannot chase. The ceremony itself is a modal on the night, and every year is
  kept on the chart tab

**Money you do not have**
- Three loans and three investor deals, with opposite risk shapes. A loan is a fixed weekly
  instalment billed in the books — cheap whether you win or lose, and it does not care
  which. An investor takes no instalment at all and a share of every won you earn, at
  source: free if you fail, ruinous if you succeed
- A credit limit priced off real collateral (the building, the fandom, your standing), shown
  as a line you have drawn against
- Clearing a loan early forgives half the interest you have not been charged yet; buying an
  investor out costs a fixed multiple of the principal, less whatever they have already taken
- Missing an instalment starts a ladder: a capitalised penalty and lost reputation, then a
  rate hike, then an asset seized with no refund, then the run ends in the hands of your
  creditors — a second, different way to lose. The payment itself bounces back into the
  balance, so what a miss costs is the penalty, the stretched term and the goodwill, never
  the instalment on top of all three
- The balance owed and the weekly bill are one loan seen twice: the last week bills what is
  left rather than a round instalment, and a loan whose balance is clear stops billing —
  there is no week where the HUD says ₩0 and the books still take money
- The free emergency investor that used to appear as an event is gone. A lender now just
  calls to remind you what you could still raise, which made borrowing a decision

## Sprint 3 — shipped

The chart used to be weather: twenty-two names that entered, decayed and dropped out,
and nobody behind any of them. Now four of the acts on it belong to **buildings you
compete with**, and everything they do is something you can watch happen.

**The four agencies** — a seventh tab, `⚔ Rivals`
- PRISM MEDIA, HANRIVER ENT., NEON9 and BLUEPRINT LAB, each with a different shape:
  prestige against cadence, so the two that hit hardest are the two that show up least
  often. A crowded week is rarely the dangerous week
- Two of them run boy groups, which is where the other half of the portrait pool lives
- They audition, sign, train for years, debut, and come back on a diary
- An act has a **contract**, six to nine years, and when it runs out the group disbands
  and the slot goes to whoever is next in the trainee room. You see it coming: the last
  couple of years cost them their edge, so a veteran wall is beatable before it is gone,
  and a scouting report will tell you which year is their last
- Their releases go into the same `st.market` and are ranked by the same chart. A rival
  song carries the agency's name on the ladder; the rest of the chart is still the
  anonymous market it always was

**The audition room, from the other side**
- Every time an audition list turns over — on its own timer or because you paid to
  refresh it early — one of the agencies auditioning for your kind of group signs the
  best hopeful you left on the table, by name, with their ceiling in the log line
- A full building still signs the best kid in the room; it lets somebody go to do it
- Four years later they debut, and the group beating you is one you had first refusal on

**Their comeback week, and yours**
- A comeback exists in their diary from the moment the last one wrapped. What changes is
  whether you can see it: four weeks out it becomes public and appears on the schedule
  board, in the comeback planner and on the rail badge
- A **scouting report** (₩60,000,000, good for 26 weeks) opens the rest of that diary —
  the whole comeback schedule, priced in opening points, plus the trainees they have
  under contract. It buys information and nothing else: no gate moves and no number
  improves. What it is worth is moving a release off somebody else's week
- Rival opening points are built in the same shape as your own — `quality × .58 +
  hype × .42` — because the two are ranked against each other on one chart

**The rookie race**
- This year's debutants on one board: your groups, the agencies' groups and the
  anonymous debutants the market produces, sorted by the chart points the Rookie of the
  Year ballot is actually settled on. The prize, months early, rather than a view of it

Also in this sprint: **portraits**, because "with faces" ought to be literal. A pool of
generated head-and-shoulders portraits under `img/faces/<gender>/NNN.webp`, one shared
studio style, addressed by index. Three rules hold it together:

- A save stores the key `f37`, never a filename. `KP.faces.src()` in `data.js` is the
  only place a path is built, so re-exporting the art at another size or format is a
  one-line change instead of a breaking save change.
- `t.face` is additive — `normalise()` back-fills an older file from `U.hue(t.id)`, so
  the same save shows the same roster on every load. It is derived rather than rolled
  precisely so a reload cannot reshuffle everyone's face.
- `KP.faces.count` at `0` turns portraits off and every avatar falls back to the
  gradient monogram. The game stays playable with an empty `img/faces/`, which is what
  keeps the art optional rather than a load-bearing dependency.

## Sprint 4 — shipped

A fandom used to be one number that only ever went up. Now it has a **shape**, and
three of its numbers are things you manage rather than watch: who actually buys, what
everybody else thinks, and how much of the crowd is not at home. An eighth tab, `♥ Fandom`.

**The three numbers**
- **Loyalty** — who buys, votes and turns up. Built by *going out*: a fan meeting, a
  variety slot, a stage, a run that peaked top three. Spent by *growing* — every new fan
  arrives at 30 loyalty and is averaged into everybody already there, so the fancam that
  doubles your fandom leaves you with a shallower one. It multiplies album sales, merch
  and ticket demand
- **Public sentiment** — what the people who are *not* fans think. It decides how fast
  strangers convert and how a comeback is received before anybody has heard it. It settles
  in a narrow band off momentum and standing; above that band it has to be bought a
  variety booking and a trophy at a time, and below it is where a scandal puts you
- **International share** — home fans buy albums and vote, overseas fans stream, pay a
  premium for goods, and are the only people a world tour can sell a seat to. Moving the
  split trades one business for the other: at 60% overseas your physical sales are down a
  fifth and your streaming is up a third
- Every modifier is written as a deviation from where the simulation says a group
  *settles*, so a brand-new group's six multipliers all read exactly ×1.00 and the sprint
  changes nothing on day one. Measured over ten in-game years against the Sprint 3 build,
  the same seeds and the same play end within ~8% on fandom and cash

**World tours** — a fourth column on the booking board
- Two routings, 3 and 5 legs, booked and paid for as one commitment and resolved a leg at
  a time on consecutive weeks the group cannot be anywhere else
- Gated on the international share rather than reputation, and priced like every venue:
  a group sitting exactly on both gates with cold modifiers comes in *under* break-even.
  The routing you have just unlocked is the one you lose money on
- Cancelling pulls the whole tour. Every leg played raises the international share for
  good, which is the half a platform deal cannot buy

**Streaming platform deals**
- Three terms, from a domestic playlist push to a global exclusive: an advance the week
  you sign, a commitment fee in the weekly books every week after, and a multiplier on
  streaming revenue and nothing else — so a deal signed with nothing out is a bill
- They drag the fandom overseas while they run, and when the term ends the books say
  whether it paid for itself. There is no buyout

**Scandals** — the one thing in the game that asks you a question and waits
- Five kinds, from an airport clip to a bullying allegation, each either true or not.
  Fame is what attracts them: the roll is weighted by the same pressure number the
  sasaeng incidents are
- Four answers. A **statement** costs money and settles it either way. A **denial** is
  free, wins outright when the story is false and the fandom loves a fight — and comes
  back weeks later, far worse, when it was true. A **hiatus** protects the public mood
  best and costs the schedule a member for weeks. **Say nothing** and the week answers
  for you, which is the worst of the four and the one you get by closing the tab
- You are never told the truth. Your marketing lead gives you a read, right about half
  the time at Lv1 and four times in five at Lv5, and it is rolled once when the story
  breaks so a redraw cannot shop for a better opinion
- The Sprint 1 "dating rumour" event is gone: it is one of the five scandal kinds now, so
  the thing that used to happen *to* you is a decision you get to make badly

**Sasaeng and antifan pressure**
- Fame buys an audience that does not go home, and low sentiment multiplies it. Above a
  threshold it drains morale every week and somebody has a bad week on a roll
- The dormitory is the only thing that buys it back, which is a second job for a building
  that used to only speed up recovery

## Backlog — what the next sprints add

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
