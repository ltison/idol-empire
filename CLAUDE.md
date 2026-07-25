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

Keyboard handling is in the same file: `N` advances a week, `1`–`6` map to the tab list —
that array must stay in sync with the `.rail-btn` order in `index.html`.

### The weekly tick

`KP.engine.nextWeek()` is the heart of the game and runs eight numbered steps in order:
trends drift → training → market tick + chart build → group promo/decay + merch income →
books (`weeklyBurn` − `weeklyMisc`) → events → audition refresh → bankruptcy check, then
autosaves. Ordering matters for the economy — e.g. `releaseComeback` prepays the first
promo week precisely because the final promo week clears `g.active` before step 5 bills.

`E.planPreview()` is the single source of truth for release maths (quality, hype, points,
fatigue, debut penalty). `releaseComeback` calls it rather than recomputing, so the
planner's preview can never promise a number the release then undercuts. Keep it that way.

The rival chart is a persistent market (`st.market`) of ~22 decaying songs; player
releases are merged into it in `buildChart()` and ranked together.

### Save format

`localStorage` key `idol_empire_save_v1`, gated on `st.v === 1` — `KP.load()` returns
`null` for anything else, silently dropping the save. New state fields should be
back-filled lazily on read (see `ensureMarket()`) rather than bumping `v`, unless the
shape genuinely breaks. Autosave happens at the end of every tick and after debut/release.

## Conventions

- Money is Korean won as a raw number; `U.money()` renders 억/만 compound form. All
  balance constants live in `KP.costs`, `KP.income`, `KP.difficulties`, `KP.tiers` —
  tune there, never inline in `engine.js`.
- Trait effects are declarative in `KP.traits` and read generically by `traitMul()` /
  `traitAdd()` in the engine. A new trait is a data entry plus, if it needs a new effect
  path, one call site.
- Facility/staff kinds are the strings `'fac'` and `'staff'` throughout upgrade/downgrade.
- `css/style.css` is the whole visual system, tokens in `:root`. `--accent` is overridden
  per group card so a group renders in its own lightstick colour. Gold (`--gold`) is
  reserved for wins only — trophies, #1, all-kill. `prefers-reduced-motion` is respected.

`README.md` holds the design intent and the sprint backlog; read it before adding
features so new work lands in the planned direction.
