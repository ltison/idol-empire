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

## Sprint 5 — shipped

A group used to be a bag of six stat blocks with a name on it. Now it is a **room**: the
people in it have a history with each other, a contract that runs out, and a second act
they can be split into.

**Relationships and chemistry**
- One bond per **pair** of members, not one number per group — because an average never
  tells you which two people are the problem. The line-up modal lists every pair, weakest
  first
- Built by being in the same place: a booking's cast, a promotion cycle, a run that peaked
  top three. Spent by strain — an argument, a week where everybody was empty, and above
  all a line-up that keeps changing
- Chemistry is the average, and it is worth ×0.90–×1.10 on song quality and a little more
  on a variety room, which is the one number in the comeback planner you cannot buy this
  week. It also carries the group's morale, up or down, a fraction at a time
- Anchored to where the simulation says a played line-up *settles* (57.0, measured over
  sixty ten-year games), never to where one starts — the same rule Sprint 4's fandom
  modifiers follow, for the same reason

**Sub-units and solo debuts** — one mechanic, because a unit is a group record with a parent
- Two or three of them, or one name on the poster. Its own concept, its own colour, its
  own chart run, its own discography, its own place on the booking board
- Its fandom is drawn **out of** the parent's rather than added to it — the same person
  holding the same lightstick — so the weekly goods line is discounted to 35% and the
  agency's total fandom does not count it twice. Albums, tickets and streams are not
  discounted, because those are genuinely a second thing that fan bought
- What a unit really costs is the roster: `t.groupId` still points at the parent, so a unit
  member is paid once, trains once and runs out of stamina once — while appearing on two
  diaries. A sub-unit promoting during the main group's comeback is the same four people
- What it pays back is a share of every fan it wins, which follows the whole group home
- A unit is not a rookie. Its members debuted years ago and its fandom came out of an
  established act, so it is off the Rookie of the Year ballot — otherwise the prize would
  be an annuity you re-win by splitting the same group a different way

**Contracts and the seven-year cliff**
- Seven years from debut, and the last of them is a negotiation on the Trainees tab
- What they ask is what they are worth — their own ceiling, the fandom behind them, the
  trophies on the shelf — multiplied by **what they think of you**: morale and the room,
  which is what bonds are ultimately for. A looked-after star re-signs for a third of what
  a worked-into-the-ground one will not re-sign for at any price
- Below mood 30 there is no number. It is the only place in the game money cannot answer
- Miss it and they walk the week the term ends, and about half the time they turn up in one
  of the four agencies' buildings. Measured over ten in-game years, an agency that never
  opens the renewal table finishes with **a quarter of the trophies** of one that does —
  and dies no more often, which is what makes it a decision rather than a difficulty

**Graduations and line-up changes**
- A member can be taken out of the line-up, and a free trainee can be brought in
- Whoever leaves takes the fandom that was there for them, the public mood and some of the
  agency's reputation with them — and the room takes it twice as hard if they were close
- Whoever arrives starts as a stranger to everybody: months of chemistry, which is the real
  price of a replacement rather than the showcase fee
- Positions redistribute the same week, and a group with nobody left disbands. Every exit —
  a graduation, a burnout, an expired contract — now goes through one path, which is how the
  Leader chip stopped being handed to somebody who had walked out eighteen months earlier

**Disbanding a group**
- A group can be ended from its card. The fandom goes with the act — and the people are the
  decision: for every member, kept on or released
- Whoever stays goes back to the trainee room carrying a slice of the fandom as 📺 fame, more
  of it the more loyal the fandom was. It is fans at their next debut or line-up showcase, and
  it fades in the practice room exactly like a survival show's does: reboot them fast or lose it
- Anybody in their final contract year has to be re-signed to stay — the disbandment brings the
  renewal table forward — and anybody who would not re-sign at any price walks. That is what
  stops a disbandment being a free seven-year contract reset
- Whoever is released is off the payroll and, about half the time, signed by a rival agency
- Not while a story about the act is waiting for an answer: ending the group is not a reply

**Survival-show recruitment**
- Ten weeks of television for a finals night. Reputation and public mood every week it is on
  air, whoever wins
- The public votes on what it can see — visuals, presence, whether they are entertaining —
  which is deliberately not the ceiling column. The contestant the audience wants and the
  contestant the scouting report wants are rarely the same person, and you sign two
- Pre-debut fame is a fandom at the debut showcase and it **evaporates in the practice
  room**: debut them before they are ready, or debut somebody nobody remembers
- Everything you leave in that room is signed by the agencies in the same week. If the week
  turns without an offer, all of it is

## Sprint 6 — shipped

Five sprints of mechanics, and the game still had no memory and no face. Every song was a
row of text, every group looked like every other group, and a chart year vanished at the
rollover with nothing but a list of prize-winners left behind. This sprint is entirely
about what is on the screen — no rule changed, and the A/B against the previous build came
back bit-identical on every economic metric.

**A sleeve for every song, and not one byte of art**
- A cover is a pure function of the song: three colours, a motif and ten numbers, all
  derived from the title, the concept and the act, painted as inline SVG. Nothing is stored
  in the save, so a discography exported three builds ago still shows the right jackets and
  re-skinning the whole catalogue is an edit to one object in `data.js`
- **The palette is the concept and the motif is the song.** Every Dark Fantasy title track
  is cut from the same three colours across four different agencies, so a discography reads
  as a run of eras; the motif comes from the hash, so two songs of one concept are still two
  different sleeves. Six motifs × ten palettes, and a ten-year run uses all of both
- The act's lightstick colour rides on top as the accent, which is what makes four sleeves
  read as one shelf
- One song is one jacket **wherever** it is looked at — the ladder this week, the shelf in
  year nine, a ceremony record twenty years old — because the seed is built in exactly one
  place. That is an invariant, not a convention: a song changing its face when it stops
  promoting is the most visible way a generated cover can be wrong
- The comeback planner shows the real sleeve as you retype the title and switch concepts.
  It is not a mock-up; it is already decided before the song is

**An act that looks like itself, everywhere**
- The chart ladder used to paint every one of the player's rows the same pink. Now each rung
  carries the act's own colour — and a rival agency's rows carry theirs, so a week where
  four buildings are all on the chart is legible at a glance
- The same colour reaches the group card, its line-up's avatars, its rows on the schedule
  board, and the chip on every trainee card that says which act they are in

**The year in review**
- A page for the year that just ended: the song it is remembered by at sleeve size, what was
  released, played, sold and lost, where the agency stood on the last night of December, and
  the chart year as a table with the player's own best act shown at its real position even
  when that is #25
- It opens **before** the ceremony, because the two answer different questions — this is what
  you did, the ceremony is what it won — and hands over to it with a button
- Written for every year, including the ones with nothing on the ballot. A year spent
  signing, building and nearly going under is the year you most want a page about
- Both are archived on the Chart tab for as long as the save lives

**The hall of records**
- Ten high-water marks for the whole run: the largest fandom, the deepest the balance ever
  got, the biggest first week, the longest reign at #1, the biggest crowd and gate, the
  costliest signature, the best chart year
- Records nobody has set yet are shown rather than hidden — an empty row is a thing to go
  and do, and a hall that only grows hides what is missing
- One door writes them (`E.record`), one data entry defines them, and nothing is ever taken
  off the board

The whole sprint costs **8% of the save file** — the ten years of reviews are what that
buys, and they are the only permanent record of a chart year in the game.

## Backlog

Empty. Six sprints in, the planned direction is fully built: the week, the year, the
schedule, the market, the four rival agencies, the fandom, the people, and now the face and
the memory. Anything after this is a new plan rather than the rest of the old one — the
clearest openings are the rival agencies growing the halves the player already has (units,
member contracts, a fandom of their own) and a second win condition that is not the chart.

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
