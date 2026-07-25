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

  function num(n) {
    const a = Math.round(n);
    if (a >= 1e8) return (a / 1e8).toFixed(1) + 'B';
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

/* ------------------------------- the market ------------------------------- */
KP.rivalArtists = ['SEVENSTAR', 'IZ:UM', 'RE:VIVE', 'KARMA', 'GLOW UP', 'MIRAE7', 'ODD:LY',
  'VELVET SKY', 'PRISM', 'NOVA:X', 'ICONIQ', 'TEMPEST9', 'LUV:LY', 'ARCANE', 'HANBIT',
  'SOLARA', 'CANDY RIOT', 'BLUE HOUR', 'ASTRA', 'MONO:CHROME', 'DAZZLE', 'HEXA'];

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
  bankruptcyFloor: -500e6
};

KP.income = {
  albumUnit: 12000,       // net won per physical album
  streamPerPoint: 180000, // weekly streaming revenue multiplier
  merchPerFan: 220,       // passive weekly won per fan (merch, CFs, fan meets)
  miscWeek: 7e6,          // studio rental, session work, extras casting
  miscPerRep: 0.5e6       // reputation makes the side business easier
};
