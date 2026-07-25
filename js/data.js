/* =============================================================================
   IDOL EMPIRE — static content + small utilities
   Everything here is data the designer tunes. No game logic lives in this file.
   ============================================================================= */
window.KP = window.KP || {};

/* ------------------------------- utilities ------------------------------- */
KP.util = (function () {
  let _id = 0;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
  const irnd = (lo, hi) => Math.floor(rnd(lo, hi + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  /* Box-Muller, clipped — used for rival chart scores so the field looks organic. */
  function gauss(mean, sd) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function pickN(arr, n) {
    const copy = arr.slice();
    const out = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    return out;
  }

  const uid = (p) => p + '_' + (Date.now().toString(36)) + '_' + (_id++).toString(36);

  /* Won in Korean units: 억 = 100M, 만 = 10k. Keeps big numbers readable. */
  function money(n) {
    const neg = n < 0;
    const a = Math.abs(Math.round(n));
    let s;
    if (a >= 1e4) {
      // Compound form. "3억 6000만" sits in the same column as a plain "4525만"
      // and stays comparable; "3.6억" next to "4525만" does not.
      let eok = Math.floor(a / 1e8);
      let man = Math.round((a % 1e8) / 1e4);
      if (man >= 1e4) { eok++; man -= 1e4; }        // rounding can carry into 억
      s = eok === 0 ? man + '만'
        : man > 0 ? eok + '억' + man + '만'   // no space: this has to survive an 84px column
        : eok + '억';
    } else s = String(a);
    return (neg ? '−₩' : '₩') + s;
  }

  /* K/M/B are the English decades, not the Korean ones — 억/만 belong to money()
     and only to money(). A hundred million fans is 100.0M; a billion is 1.0B. */
  function num(n) {
    const a = Math.round(n);
    if (a >= 1e9) return (a / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
    return String(a);
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* Deterministic hue from an id so an idol's avatar never changes colour. */
  function hue(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
  }

  return { clamp, rnd, irnd, pick, pickN, chance, gauss, uid, money, num, esc, hue };
})();

/* ------------------------------ people names ----------------------------- */
KP.names = {
  surname: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim',
    'Han', 'Oh', 'Seo', 'Shin', 'Kwon', 'Hwang', 'Ahn', 'Song', 'Ryu', 'Hong', 'Bae', 'Moon'],
  given: {
    f: ['Chaeyoung', 'Jiwoo', 'Yerin', 'Haeun', 'Soyeon', 'Minji', 'Nari', 'Eunbi', 'Hyejin',
      'Dain', 'Sowon', 'Yuna', 'Seoyeon', 'Areum', 'Chaewon', 'Sohee', 'Yeji', 'Damin',
      'Jiyoon', 'Nabi', 'Hyeri', 'Seul', 'Yeonhwa', 'Mina', 'Rina', 'Boram'],
    m: ['Minho', 'Jisung', 'Taehyun', 'Seojun', 'Doyun', 'Hyunwoo', 'Jaemin', 'Sungho',
      'Junseo', 'Yeonjun', 'Woojin', 'Sangwoo', 'Taeyang', 'Riwoo', 'Jaehyun', 'Kihoon',
      'Seungmin', 'Donghae', 'Baekho', 'Chanwoo', 'Hoseok', 'Namjun']
  },
  korean: ['채영', '지우', '예린', '하은', '소연', '민지', '나리', '은비', '혜진', '다인',
    '민호', '지성', '태현', '서준', '도윤', '현우', '재민', '성호', '준서', '연준']
};

KP.nations = [
  { c: 'KR', flag: '🇰🇷', name: 'Korea', w: 62 },
  { c: 'JP', flag: '🇯🇵', name: 'Japan', w: 12 },
  { c: 'CN', flag: '🇨🇳', name: 'China', w: 6 },
  { c: 'TH', flag: '🇹🇭', name: 'Thailand', w: 5 },
  { c: 'US', flag: '🇺🇸', name: 'USA', w: 6 },
  { c: 'AU', flag: '🇦🇺', name: 'Australia', w: 3 },
  { c: 'TW', flag: '🇹🇼', name: 'Taiwan', w: 3 },
  { c: 'VN', flag: '🇻🇳', name: 'Vietnam', w: 2 },
  { c: 'SK', flag: '🇸🇰', name: 'Slovakia', w: 1 }
];

/* ------------------------------- attributes ------------------------------ */
KP.STATS = [
  { k: 'vocal', label: 'Vocal', kr: '보컬' },
  { k: 'dance', label: 'Dance', kr: '댄스' },
  { k: 'rap', label: 'Rap', kr: '랩' },
  { k: 'visual', label: 'Visual', kr: '비주얼' },
  { k: 'charisma', label: 'Stage', kr: '무대' },
  { k: 'variety', label: 'Variety', kr: '예능' }
];

/* effects are read by the engine; every trait must earn its slot */
KP.traits = [
  { k: 'perfectionist', name: 'Perfectionist', desc: 'Trains vocal faster, burns stamina', train: { vocal: 1.35 }, stamina: 1.2 },
  { k: 'choreomachine', name: 'Choreo Machine', desc: 'Dance training is 40% faster', train: { dance: 1.4 } },
  { k: 'wordsmith', name: 'Wordsmith', desc: 'Writes their own verses', train: { rap: 1.4 } },
  { k: 'camera', name: 'Camera Genius', desc: 'Visual grows fast, fancams go viral', train: { visual: 1.35 }, viral: 1.5 },
  { k: 'moodmaker', name: 'Mood Maker', desc: 'Lifts the whole team\'s morale', morale: 2.2, teamMorale: 1.4 },
  { k: 'ironlung', name: 'Iron Stamina', desc: 'Recovers stamina quickly', stamina: .65 },
  { k: 'ace', name: 'Ace', desc: 'Higher ceiling on everything', potential: 8 },
  { k: 'slowstart', name: 'Slow Starter', desc: 'Slow now, blooms after a year', train: { all: .75 }, late: true },
  { k: 'varietystar', name: 'Variety Star', desc: 'Talk shows love them', train: { variety: 1.5 }, buzz: 1.15 },
  { k: 'fanmagnet', name: 'Fan Magnet', desc: 'Pulls extra fans on every release', fans: 1.18 },
  { k: 'glassankle', name: 'Injury Prone', desc: 'Higher risk of hiatus', bad: true, injury: 2.4 },
  { k: 'homesick', name: 'Homesick', desc: 'Morale drops without rest', bad: true, morale: -1.6 },
  { k: 'stagefright', name: 'Stage Fright', desc: 'Underperforms in the first weeks', bad: true, debutPenalty: .88 }
];

/* --------------------------------- concepts ------------------------------- */
/* Weights don't need to sum to 1 — the engine normalises them. */
KP.concepts = [
  { k: 'girlcrush', name: 'Girl Crush', kr: '걸크러쉬', w: { dance: 28, rap: 22, visual: 20, vocal: 18, charisma: 12 } },
  { k: 'cute', name: 'Cute Pop', kr: '큐티', w: { vocal: 25, dance: 22, visual: 23, charisma: 18, variety: 12 } },
  { k: 'fairy', name: 'Ethereal', kr: '요정', w: { vocal: 32, visual: 28, dance: 20, charisma: 20 } },
  { k: 'y2k', name: 'Y2K Retro', kr: '와이투케이', w: { dance: 28, charisma: 22, visual: 22, vocal: 18, rap: 10 } },
  { k: 'dark', name: 'Dark Fantasy', kr: '다크', w: { dance: 30, visual: 24, vocal: 22, rap: 14, charisma: 10 } },
  { k: 'hiphop', name: 'Hip-Hop Swag', kr: '힙합', w: { rap: 38, dance: 26, charisma: 20, visual: 16 } },
  { k: 'summer', name: 'Summer Fresh', kr: '여름', w: { dance: 26, vocal: 24, visual: 22, charisma: 18, variety: 10 } },
  { k: 'youth', name: 'School Youth', kr: '청춘', w: { vocal: 26, dance: 24, charisma: 24, visual: 16, variety: 10 } },
  { k: 'cyber', name: 'Cyber Punk', kr: '사이버', w: { dance: 30, visual: 26, rap: 20, vocal: 16, charisma: 8 } },
  { k: 'ballad', name: 'Emotional', kr: '발라드', w: { vocal: 45, visual: 20, charisma: 20, dance: 15 } }
];

KP.groupColors = ['#FF2E86', '#45E8FF', '#B78CFF', '#FFCB47', '#5BE7B0', '#FF7A45', '#7C9CFF', '#FF5CC8'];

/* --------------------------- comeback production -------------------------- */
KP.tiers = {
  producer: [
    { k: 'inhouse', name: 'In-house team', desc: 'Safe, cheap, forgettable', q: 34, cost: 30e6 },
    { k: 'rookie', name: 'Rising producer', desc: 'Hungry, one hit already', q: 52, cost: 80e6 },
    { k: 'hit', name: 'Hit-maker', desc: 'Three top-10 songs last year', q: 70, cost: 210e6 },
    { k: 'star', name: 'Star producer', desc: 'Books out a year in advance', q: 85, cost: 460e6, rep: 20 },
    { k: 'legend', name: 'Legend', desc: 'Only takes calls from majors', q: 96, cost: 900e6, rep: 45 }
  ],
  choreo: [
    { k: 'self', name: 'Members choreograph', desc: 'Free, and it shows', q: 30, cost: 8e6 },
    { k: 'local', name: 'Local studio', desc: 'Clean, coverable point move', q: 53, cost: 45e6 },
    { k: 'crew', name: 'Top crew', desc: 'The kind that trends on TikTok', q: 73, cost: 130e6 },
    { k: 'world', name: 'World-class', desc: 'Flown in for two weeks', q: 91, cost: 310e6, rep: 25 }
  ],
  mv: [
    { k: 'room', name: 'Practice-room MV', desc: 'One camera, real charm', q: 26, cost: 12e6 },
    { k: 'set', name: 'Studio set', desc: 'Two sets, three outfits', q: 50, cost: 60e6 },
    { k: 'cine', name: 'Cinematic', desc: 'Storyline, film crew, drone', q: 73, cost: 190e6 },
    { k: 'overseas', name: 'Overseas shoot', desc: 'Two countries, one week', q: 91, cost: 410e6, rep: 22 }
  ],
  styling: [
    { k: 'basic', name: 'In-house styling', desc: 'Rented, and the fans notice', q: 30, cost: 7e6 },
    { k: 'boutique', name: 'Boutique stylist', desc: 'Consistent concept run', q: 56, cost: 34e6 },
    { k: 'designer', name: 'Designer house', desc: 'Runway pieces, editorial press', q: 80, cost: 105e6, rep: 18 }
  ],
  promo: [
    { k: 'min', name: 'Minimal', desc: 'Music shows only', q: 0, cost: 5e6, weeks: 4 },
    { k: 'std', name: 'Standard', desc: 'Shows, radio, one variety', q: 9, cost: 22e6, weeks: 5 },
    { k: 'aggr', name: 'Aggressive', desc: 'Full variety run, subway ads', q: 20, cost: 58e6, weeks: 6 },
    { k: 'domin', name: 'Total domination', desc: 'Billboards, brand tie-ins, festivals', q: 34, cost: 125e6, weeks: 7, rep: 30 }
  ]
};

/* --------------------------------- the year ------------------------------- */
/* Fifty-two weeks with a shape. Every season covers a contiguous, inclusive
   block of weeks — the blocks must tile 1..WEEKS_PER_YEAR with no gap and no
   overlap — and carries knobs that pull in different directions:

     field      multiplier on a rival song's opening points. A comeback season
                is a wall; a lull is an open door. This decides your RANK.
     audience   how much the public is listening and spending. Multiplies
                weekly streaming revenue. This decides your MONEY.
     slotBonus  music-show and stage capacity, read by the booking schedule.
                Negative in the crowded seasons.
     entrants   extra rival songs entering the market per week.
     favours    concepts the season wants; trends are pulled toward them.

   `field` and `audience` rise together on purpose, so that no season is simply
   worse than another one: the weeks the public is spending in are the weeks
   every other agency is also releasing in. The choice is always the same shape
   — take the money and lose the rank, or take the rank and be ignored — and
   `slotBonus` is what stops the two crowded comeback seasons from being the
   obvious answer. Award season keeps its stages (the ceremonies and specials
   are extra stages) while carrying the hardest chart in the year. */
KP.WEEKS_PER_YEAR = 52;

KP.seasons = [
  { k: 'newyear', name: 'New Year quiet', kr: '신년', w1: 1, w2: 6,
    desc: 'The industry is still sleeping off the awards',
    field: .90, audience: .92, slotBonus: 1, entrants: -1, favours: ['ballad'] },
  { k: 'spring', name: 'Spring comeback season', kr: '봄 컴백', w1: 7, w2: 17,
    desc: 'Everybody comes back at once and the chart is a wall',
    field: 1.05, audience: 1.12, slotBonus: -1, entrants: 1, favours: ['youth', 'cute'] },
  { k: 'lull', name: 'Mid-year lull', kr: '비수기', w1: 18, w2: 25,
    desc: 'Empty stages, an empty chart, an empty till',
    field: .86, audience: .86, slotBonus: 1, entrants: -1, favours: ['y2k', 'fairy'] },
  { k: 'summer', name: 'Summer song season', kr: '여름', w1: 26, w2: 34,
    desc: 'Festivals, water parks, one anthem per agency',
    field: 1.02, audience: 1.06, slotBonus: 0, entrants: 0, favours: ['summer', 'girlcrush'] },
  { k: 'fall', name: 'Fall comeback season', kr: '가을 컴백', w1: 35, w2: 45,
    desc: 'The last serious run at a year-end trophy',
    field: 1.07, audience: 1.16, slotBonus: -1, entrants: 1, favours: ['dark', 'cyber'] },
  { k: 'yearend', name: 'Award season', kr: '연말', w1: 46, w2: 52,
    desc: 'Ceremonies, specials, and a public that buys everything',
    field: 1.10, audience: 1.22, slotBonus: 0, entrants: 0, favours: ['ballad', 'hiphop'] }
];

/* Concept trends are a pulled walk rather than a free one: every week each
   concept drifts by `drift` and is dragged `rate` of the way toward the level
   this season wants it at. The pull has to work in both directions — a nudge up
   with no counter-nudge ratchets every favoured concept to the ceiling and
   leaves it parked there for the rest of the run. */
KP.seasonPull = { drift: 4.2, rate: .10, favoured: 84, other: 48 };

/* --------------------------------- awards --------------------------------- */
/* The year has an ending. Every prize is scored from st.yearbook, which is
   accrued weekly while the data still exists — st.chart keeps twenty-five rows
   for one week and nothing else in the game remembers a chart ever happened.

   Rivals keep no books and have no fandom of their own, so theirs are
   synthesised from their chart record at ballot time and never stored. The three
   axes that are stocks rather than chart records — album sales, new fans, total
   fandom — are synthesised at a rate MEASURED off the player's own side of the
   same ballot, discounted by `rivalRateShare`; the constants below are only the
   floor a small early ballot is scored on. A fixed won-per-point cannot work:
   the player's stocks have no ceiling while a rival's chart credit is capped by
   a fifty-rung ladder over fifty-two weeks, so any constant rate is overtaken
   the moment the fandom is large, and every acts prize becomes a formality whose
   margin widens every year. Measured, the ceremony asks how much of the chart
   year an act owned and how well it converted it, and it asks that the same way
   at fifty thousand fans and at fifty million.

   A prize's `score` entry is a weighted sum over the axes of the year's
   record, read generically the way KP.traits is. That is what makes eight
   prizes eight different awards rather than the same one eight times: Album of
   the Year is mostly sales, Best Performance is mostly stages booked, and
   Rookie drops the sales axis entirely so a first-year group can take it on
   chart points alone.

   rep / fansPct / momentum / prestige are what winning DOES — awards pay no
   cash, because award shows never do. `prestige` is the permanent one: it
   feeds KP.standing(), which gates producers, broadcasters, venues and credit,
   so a trophy is spent on next year's board rather than on this one. */
KP.awards = {
  chartDepth: 50,           // ranks that earn credit: #1 is worth 50, #50 is worth 1
  rivalSalesPerPoint: 200,  // the FLOOR on synthesised books for an act that keeps none
  rivalFansPerPoint: 500,
  rivalPopMul: 1.4,         // a rival's crowd reads larger than its ledger
  /* Share of the player's own measured won-per-chart-point a rival is credited
     with. Below ~.4 the acts prizes go to whoever has the biggest fandom again;
     above ~.7 they go to whoever has the most chart points, which on a
     twenty-two name roster is always somebody else. */
  rivalRateShare: .5,
  rivalStagePerWeek: .8,    // ...and it was on a stage most weeks it charted
  minBallot: 40,            // chart points needed to be on any ballot at all
  historyYears: 20,         // st.awards ring size
  prestigeCap: 40,
  songsTracked: 220,        // st.yearbook.songs is trimmed to this

  /* Weights per prize, per axis. cp/no1 come straight off the chart; sales,
     fans, pop, stages and variety are the real-or-synthesised ones. */
  score: {
    daesang: { cp: 1, no1: 60, sales: .0018, fans: .00035 },
    record: { sales: .001, cp: .35 },
    popularity: { pop: .0006, cp: .12 },
    performance: { stages: 10, cp: .5 },
    variety: { variety: 1 },
    rookie: { cp: 1.2, no1: 70, fans: .0005 },
    bonsang: { cp: 1, no1: 60, sales: .0018, fans: .00035 }
  },
  songScore: { cp: 1, peak: 8, no1: 50, quality: 4 },
  /* A player's variety year is the appearances they booked and who they sent;
     a rival's is a flat read of how much of the year it spent visible. */
  varietySynth: { show: 14, best: 1.5, rival: .12 },

  prizes: [
    { k: 'daesang', name: 'Daesang — Artist of the Year', kr: '대상', ic: '🏆',
      pool: 'acts', rep: 12, fansPct: .12, momentum: 30, prestige: 6 },
    { k: 'record', name: 'Album of the Year', kr: '올해의 음반', ic: '💿',
      pool: 'acts', rep: 7, fansPct: .07, momentum: 18, prestige: 3 },
    { k: 'song', name: 'Song of the Year', kr: '올해의 노래', ic: '🎵',
      pool: 'songs', rep: 7, fansPct: .07, momentum: 18, prestige: 3 },
    { k: 'rookie', name: 'Rookie of the Year', kr: '신인상', ic: '🌱',
      pool: 'rookies', rep: 6, fansPct: .18, momentum: 25, prestige: 4 },
    { k: 'popularity', name: 'Popularity Award', kr: '인기상', ic: '💗',
      pool: 'acts', rep: 3, fansPct: .10, momentum: 12, prestige: 2 },
    { k: 'performance', name: 'Best Performance', kr: '퍼포먼스상', ic: '💃',
      pool: 'acts', rep: 4, fansPct: .04, momentum: 14, prestige: 2 },
    { k: 'variety', name: 'Entertainer of the Year', kr: '예능인상', ic: '🎤',
      pool: 'acts', rep: 5, fansPct: .02, momentum: 6, prestige: 2 },
    { k: 'bonsang', name: 'Bonsang', kr: '본상', ic: '🥇',
      pool: 'acts', winners: 5, rep: 2.5, fansPct: .03, momentum: 8, prestige: 1 }
  ]
};

/* ------------------------------ the schedule ------------------------------ */
/* Promotion used to be an abstraction folded into the promo tier. Here it is a
   diary the player fills in: every appearance is booked weeks ahead, paid for at
   the moment it is booked, and resolved on the week it happens.

   Three kinds, all on the same board:

     music     a stage for a title track that is currently promoting. Adds chart
               points BEFORE the week's chart is built, so a stage this week can
               move this week's ranking.
     variety   no chart effect at all. Sells the members: fandom, reputation and
               the `variety` stat, graded on whoever you send.
     live      a ticketed show of your own. Its spec lives in KP.venues below,
               because a venue is priced by seats rather than by a fee.

   Every number in a show entry:

     fee       paid once, at booking. Never a weekly line item.
     slots     the show's own capacity, before the season's slotBonus and before
               the rivals who are also on the bill.
     rep/fans  the gates. `rep` reads KP.standing(), not raw reputation.
     seasons   if present, the only seasons the show runs in at all.
     points    chart points a music stage adds to the active release.
     fansPct   new fans = g.fans × fansPct + fansFlat, then × the grade.
     repGain   reputation, × the grade for variety.
     need      variety only: the `variety` score the show is pitched at.
     train     variety only: the variety the appearance teaches the cast.
     stamina   flat, per member present. This is what over-booking costs.

   Reception is graded `(score − need)/needScale + rnd(±gradeSpread)`, so a cast
   comfortably above the show's level is reliably viral and a cast well below it
   is reliably flat — with a band in the middle where it is a real gamble. */
KP.bookings = {
  weeksAhead: 8,          // how far the board looks forward, and books
  cancelBack: .5,         // share of the fee recovered when cancelling early
  lateWeeks: 2,           // inside this, cancelling is a no-show: nothing back
  cancelRep: 1.5,         // reputation lost pulling out at short notice
  missRep: 2,             // ...and lost when nobody was fit to appear at all
  injuryFloor: 12,        // stamina below which an appearance can break someone
  injuryRoll: .12,        // per member, per over-booked appearance
  needScale: 40,          // variety points per point of grade
  gradeSpread: .35,       // the luck in a reception
  viralAt: .25,            // a cast a quarter of a band clear of the show is safe
  flatAt: -.30,
  flatMorale: -5,         // a room that did not laugh
  grades: {
    viral: { k: 'viral', label: 'went viral', ic: '🔥', fans: 1.9, rep: 1.5, momentum: 1.5 },
    good: { k: 'good', label: 'went well', ic: '🎬', fans: 1, rep: 1, momentum: 1 },
    flat: { k: 'flat', label: 'fell flat', ic: '😶', fans: .35, rep: -.8, momentum: -.5 }
  },
  shows: {
    music: [
      { k: 'cable', name: 'Cable music show', kr: '케이블 음방',
        desc: 'A pre-recorded stage at three on a Thursday afternoon',
        fee: 3.5e6, slots: 4, rep: 0, fans: 0,
        points: 1.4, fansPct: .010, fansFlat: 900,
        repGain: .12, momentum: 2, morale: 1, stamina: 6 },
      { k: 'major', name: 'Network music show', kr: '지상파 음방',
        desc: 'Live, national, and the fancam gets clipped by morning',
        fee: 14e6, slots: 2, rep: 25, fans: 45e3,
        points: 3.0, fansPct: .020, fansFlat: 2200,
        repGain: .35, momentum: 4, morale: 1, stamina: 12 },
      { k: 'special', name: 'Broadcast special', kr: '특집 무대',
        desc: 'Ten minutes, an orchestra, and every camera in the country',
        fee: 30e6, slots: 1, rep: 50, fans: 220e3, seasons: ['summer', 'yearend'],
        points: 6.0, fansPct: .040, fansFlat: 3600,
        repGain: .8, momentum: 7, morale: 2, stamina: 16 }
    ],
    variety: [
      { k: 'radio', name: 'Radio guest slot', kr: '라디오',
        desc: 'Two hours of chat and one live acoustic take',
        fee: 4.5e6, slots: 5, rep: 0, fans: 0, need: 20, train: 2.0,
        fansPct: .004, fansFlat: 300,
        repGain: .25, momentum: 1, morale: 2, stamina: 5 },
      { k: 'talk', name: 'Late-night talk show', kr: '토크쇼',
        desc: 'One sofa, one host, and a story you have to sell',
        fee: 9e6, slots: 3, rep: 15, fans: 20e3, need: 40, train: 1.6,
        fansPct: .012, fansFlat: 1200,
        repGain: .7, momentum: 2, morale: 3, stamina: 8 },
      { k: 'idolgame', name: 'Idol sports variety', kr: '아이돌 예능',
        desc: 'Games, forfeits, and a highlight reel of all of it',
        fee: 17e6, slots: 2, rep: 30, fans: 70e3, need: 52, train: 1.2,
        fansPct: .026, fansFlat: 3000,
        repGain: 1.4, momentum: 4, morale: 4, stamina: 14 },
      { k: 'flagship', name: 'Flagship variety', kr: '간판 예능',
        desc: 'The show the whole country has on at nine on a Saturday',
        fee: 44e6, slots: 1, rep: 40, fans: 300e3, need: 66, train: .8,
        fansPct: .050, fansFlat: 5000,
        repGain: 2.8, momentum: 6, morale: 5, stamina: 20 }
    ]
  }
};

/* --------------------------------- live shows ------------------------------ */
/* The first thing on the board that is meant to make money rather than spend it,
   and the only thing in the game that can lose ten weeks of profit in one night.
   Sized by fandom, priced so the wrong venue loses real money.

   cap      seats. Demand above this is turned away, so a venue that is too
            small caps your upside and one too large sells air.
   cost     production, prepaid at booking. This is the gamble.
   ticket   net won per seat after the venue's cut.
   pull     expected attendance = fans × pull × modifiers. Calibrated so that a
            group sitting exactly on the `fans` gate, with cold modifiers, fills
            ~40% — BELOW the ~42% break-even every tier shares. Momentum, an
            active comeback, standing and the season are what push a show into
            profit; the venue you have just unlocked is the venue you lose money
            on until something else is going right.
   rep      the gate, read off KP.standing() like every other gate.
   stamina  flat, per member present, as with any other booking.
   cooldown weeks before this group may play this tier again. */
KP.venues = [
  { k: 'fanmeet', name: 'Fan meeting', kr: '팬미팅',
    desc: 'A hall, a hi-touch line, and merchandise tables',
    cap: 1500, cost: 26e6, ticket: 42000, pull: .120,
    rep: 0, fans: 5e3, stamina: 9, cooldown: 4, repGain: .4, morale: 6 },
  { k: 'hall', name: 'Solo concert', kr: '단독 콘서트',
    desc: 'Your own two-hour set list in a concert hall',
    cap: 5000, cost: 130e6, ticket: 62000, pull: .0625,
    rep: 15, fans: 32e3, stamina: 15, cooldown: 8, repGain: 1.0, morale: 3 },
  { k: 'arena', name: 'Arena show', kr: '아레나',
    desc: 'Rigging, a B-stage, and a crew of two hundred',
    cap: 15000, cost: 520e6, ticket: 78000, pull: .0400,
    rep: 32, fans: 150e3, stamina: 21, cooldown: 14, repGain: 2.4, morale: 1 },
  { k: 'dome', name: 'Dome concert', kr: '돔 공연',
    desc: 'The show an agency is remembered for. Or bankrupted by',
    cap: 45000, cost: 1700e6, ticket: 92000, pull: .0321,
    rep: 55, fans: 560e3, stamina: 28, cooldown: 26, repGain: 6.0, morale: -2 }
];

/* The modifier stack on attendance, and the roll on top of it. Every one of
   these is a lever the player can move before show night — which is the point:
   a venue is unlocked by fandom and paid for by everything else. */
KP.live = {
  gap: 3,              // weeks between ANY two lives by the same group
  rollLo: .70,         // attendance roll — this is the undersell risk
  rollHi: 1.22,
  promoBoost: 1.10,    // touring off a live comeback sells
  heatDiv: 300,        // momentum → 1 + momentum/300
  standDiv: 500,       // standing → 1 + standing/500
  staleFrom: 30,       // weeks since last release before demand starts sagging
  staleStep: .012,
  staleFloor: .68,
  soldOutAt: .98,      // the fill a recap is allowed to call a sell-out
  gradeTriumph: 2.0,   // gross ÷ production cost, graded against break-even so
  gradeStrong: 1.35,   // that every tier reads the same way to the player
  gradeOk: 1.0,
  undersoldMorale: -7,
  // Per grade: multiplier on the venue's repGain, momentum swing, and the share
  // of the house that walks out an actual fan.
  repMul: { triumph: 1.5, strong: 1, ok: .4, undersold: -.8 },
  momentum: { triumph: 12, strong: 6, ok: 1, undersold: -9 },
  newFanRate: { triumph: .55, strong: .40, ok: .25, undersold: .15 },
  // A show pulled on the week: the production money is gone, the tickets are
  // refunded, and it costs several times what missing a taping costs.
  pullRepMul: 3,
  pullMomentum: -12
};

/* The board's columns, in the order the booking modal offers them. */
KP.bookingKinds = [
  { k: 'music', name: 'Music show', kr: '음악방송', ic: '🎵',
    desc: 'Chart points for a title track that is already promoting' },
  { k: 'variety', name: 'Variety show', kr: '예능', ic: '🎤',
    desc: 'Fandom, reputation and variety training — no chart effect' },
  { k: 'live', name: 'Live show', kr: '공연', ic: '🎫',
    desc: 'Your own ticketed show — the only booking that can pay for itself' }
];

/* ------------------------------- the market ------------------------------- */
/* The established roster. Everybody here is stamped as an act that was already
   charting when the run opened, which is correct — but it is also why the market
   needs a way to produce NEW acts: a name the game has always known can never
   satisfy the rookie ballot's `debutY === year`, so without debutants Rookie of
   the Year would be the player's own uncontested annuity from year 2 onward.
   Debutant names are generated from KP.groupNameParts the same way a player's
   group name is, so the supply never runs out, and a debutant that charts joins
   the draw for a couple of years the way a real rookie promotes and then either
   sticks or vanishes. */
KP.rivalArtists = ['SEVENSTAR', 'IZ:UM', 'RE:VIVE', 'KARMA', 'GLOW UP', 'MIRAE7', 'ODD:LY',
  'VELVET SKY', 'PRISM', 'NOVA:X', 'ICONIQ', 'TEMPEST9', 'LUV:LY', 'ARCANE', 'HANBIT',
  'SOLARA', 'CANDY RIOT', 'BLUE HOUR', 'ASTRA', 'MONO:CHROME', 'DAZZLE', 'HEXA'];

/* Per new market song, once a full year has been judged: the chance it belongs
   to a name nobody has seen chart. ~150 songs enter in a year, so this is about
   three genuine debutants a year — enough to make the rookie ballot a race
   without diluting the roster the other prizes are contested on. */
KP.rivalDebutChance = .02;
KP.rivalDebutActive = 1;   // years a debutant keeps releasing after its debut year

KP.titleWords = {
  a: ['Glass', 'Neon', 'Velvet', 'Cosmic', 'Bitter', 'Golden', 'Midnight', 'Paper', 'Silver',
    'Wild', 'Sugar', 'Crystal', 'Electric', 'Lonely', 'Scarlet', 'Static', 'Honey', 'Rebel'],
  b: ['Heart', 'Fever', 'Dream', 'Riot', 'Gravity', 'Signal', 'Diary', 'Bloom', 'Echo',
    'Runaway', 'Lullaby', 'Mirage', 'Halo', 'Circus', 'Orbit', 'Pulse', 'Mirror', 'Freefall']
};

KP.groupNameParts = {
  a: ['LUNA', 'AERI', 'NOVA', 'VIVA', 'HALO', 'ECHO', 'IRIS', 'ZENITH', 'ORBIT', 'CIEL', 'SOL', 'RUBY'],
  b: ['GLOW', 'WAVE', 'RISE', 'CODE', 'LINE', 'CLUB', 'STAR', 'VERSE', 'FLARE', 'BEAT']
};
KP.fandomSuffix = ['IE', 'LY', 'VERSE', 'LAND', 'STAR', 'MOON', 'WAVE', 'HEART', 'LIGHT'];

KP.positions = ['Leader', 'Main Vocal', 'Main Dancer', 'Main Rapper', 'Visual', 'Maknae', 'Sub Vocal', 'Sub Dancer'];

/* ------------------------------ company setup ----------------------------- */
KP.difficulties = {
  easy: { money: 3.0e9, rep: 12, label: 'Backed' },
  normal: { money: 2.0e9, rep: 6, label: 'Independent' },
  hard: { money: 1.5e9, rep: 2, label: 'Basement' }
};

KP.costs = {
  traineeWeek: 1.2e6,     // dorm, meals, lessons
  idolWeek: 2.8e6,        // salary once debuted
  facilityWeek: 3.0e6,    // per facility level
  staffWeek: 3.5e6,       // per staff level
  debutShowcase: 250e6,
  scoutRefresh: 20e6,
  bankruptcyFloor: -500e6,
  facilityUpgrade: 260e6, // × the current level, so Lv4→5 costs four times Lv1→2
  staffUpgrade: 175e6     // × the current level
};

KP.income = {
  albumUnit: 12000,       // net won per physical album
  streamPerPoint: 180000, // weekly streaming revenue multiplier
  merchPerFan: 220,       // passive weekly won per fan (merch, CFs, fan meets)
  miscWeek: 7e6,          // studio rental, session work, extras casting
  miscPerRep: 0.5e6,      // reputation makes the side business easier

  /* A fandom is harder to grow the bigger it already is, and this is the number
     that says how much harder: every fan gain is divided by 1 + fans/this, so a
     group at this size grows at half the raw rate and one at ten times it grows
     at a eleventh.

     It is load-bearing rather than flavour. Several fan sources are written as a
     PERCENTAGE of the fandom (a music show is fansPct of it, a variety show the
     same, a fancam five to fourteen percent of it), and a percentage gain applied
     every week is compound interest: undamped, a group with a full diary grows
     ~13% a week, which is ×600 a year and reaches astronomical numbers inside
     three in-game years — along with the merch income that keys off it. Damped,
     the percentage terms flatten into a roughly constant ceiling of new fans per
     week, so a fandom grows steadily and forever without ever running away.
     Anything that hands a group a percentage of its own fandom must go through
     fanGain() in engine.js. */
  fanSaturation: 8e5
};

/* --------------------------------- finance -------------------------------- */
/* Two instruments with opposite risk shapes, which is the whole decision.

   LOAN — a fixed weekly instalment billed by KP.ledger, so the runway number
   tells the truth. `rate` is SIMPLE weekly interest on the original principal,
   so weekly = principal × (1/weeks + rate). Cheap if you win, cheap if you
   lose, and it does not care which. Missing one starts the default ladder.

   INVESTOR — no instalment at all. `share` of every income credit for `weeks`
   weeks, taken at source in E.earn() and never billed a second time
   (`shareTags` decides which credits). Free if you fail, ruinous if you
   succeed, and the buyout is the only way to stop it early.

   Gates read KP.standing() and total fandom; a loan additionally has to fit
   inside KP.creditLimit(), which is what the collateral numbers price. */
KP.finance = {
  baseCredit: 400e6,        // credit you have before you own anything
  // Half the LIST price of every level above base — NOT half of what those
  // levels cost, which is ~2.5× larger (E.upgrade charges lvl × the constant, so
  // a Lv5 room costs 1+2+3+4 of them and KP.collateral counts 4). See the note
  // on KP.collateral in state.js: a lender values the room, not the receipts.
  collateralRate: .5,
  fanCollateral: 1400,      // won of credit per fan
  standingCollateral: 12e6, // won of credit per point of standing
  maxFacilities: 2,         // concurrent loans + investors
  origination: .02,         // deducted from the principal on the way in
  earlyPayoffDiscount: .5,  // half the remaining interest is forgiven
  buyoutMul: 1.6,           // an investor sells their share back at 1.6× principal
  investorGoodExit: 3,      // reputation if they made money on you
  investorBadExit: 6,       // ...and lost if they did not
  shareTags: { album: 1, stream: 1, live: 1, merch: 1, cf: 1, misc: 0 },
  watchBelow: 300e6,        // the cash level a lender starts calling at
  watchMin: 100e6,          // ...and the headroom worth calling about

  /* the default ladder — each step is one missed instalment on one facility */
  missRep: 3,               // reputation lost per miss
  missPenalty: .25,         // the missed instalment is capitalised at +25%
  missRateHike: 1.15,       // second miss raises the instalment
  seizeAtMiss: 3,           // third miss: an asset is taken, no refund
  defaultAtMiss: 4,         // fourth miss: the run ends as 'default'

  loans: [
    { k: 'micro', name: 'Credit union line', kr: '신용대출',
      desc: 'Small, instant, and expensive per won',
      principal: 300e6, weeks: 26, rate: .0045, rep: 0, fans: 0 },
    { k: 'bank', name: 'Bank term loan', kr: '은행 대출',
      desc: 'A year of runway against the building',
      principal: 1200e6, weeks: 52, rate: .0035, rep: 18, fans: 25e3 },
    { k: 'advance', name: 'Distributor advance', kr: '유통사 선급금',
      desc: 'They front three albums and take the paperwork',
      principal: 3000e6, weeks: 78, rate: .0030, rep: 38, fans: 120e3 }
  ],
  investors: [
    { k: 'angel', name: 'Angel investor', kr: '엔젤 투자',
      desc: 'A believer with a cheque and 10% of everything',
      principal: 600e6, weeks: 40, share: .10, rep: 8, fans: 8e3 },
    { k: 'fund', name: 'Entertainment fund', kr: '투자조합',
      desc: 'Professional money. They will read your books',
      principal: 2000e6, weeks: 60, share: .18, rep: 25, fans: 60e3 },
    { k: 'chaebol', name: 'Conglomerate stake', kr: '대기업 지분',
      desc: 'They will own your sound for the better part of two years',
      principal: 5000e6, weeks: 90, share: .27, rep: 45, fans: 250e3 }
  ]
};
