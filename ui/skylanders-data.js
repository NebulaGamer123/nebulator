/* Element + game lookup for portal figure ids. Elements are by figure id (not name) so every variant of a
   character shares one. A handful of newer figures are best-effort guesses; unknown ids fall back to "neutral". */
(() => {
  'use strict';
  const E = {};
  const set = (el, ...ids) => ids.forEach(i => { E[i] = el; });
  const range = (el, a, b) => { for (let i = a; i <= b; i++) E[i] = el; };

  // Spyro's Adventure
  range('air', 0, 3); range('earth', 4, 7); range('fire', 8, 11); range('water', 12, 15);
  set('magic', 16, 17, 18, 23, 28); range('tech', 19, 22); range('life', 24, 27); range('undead', 29, 32);
  // Giants
  set('air', 100, 101); set('earth', 102, 103); set('fire', 104, 105); set('water', 106, 107);
  set('magic', 108, 109); set('tech', 110, 111); set('life', 112, 113); set('undead', 114, 115);
  // traps
  set('undead', 210); set('water', 211); set('air', 212); set('magic', 213); set('tech', 214); set('fire', 215);
  set('earth', 216); set('life', 217); set('dark', 218); set('light', 219); set('kaos', 220);
  // legendaries
  set('earth', 404); set('magic', 416); set('tech', 419); set('undead', 430);
  // Swap Force
  range('air', 450, 453); range('earth', 454, 457); range('fire', 458, 461); range('water', 462, 465);
  range('magic', 466, 469); range('tech', 470, 473); range('life', 474, 477); range('undead', 478, 481);
  set('light', 482, 483); set('dark', 484, 485);
  // minis
  set('earth', 502, 505); set('magic', 503, 504, 542); set('air', 506, 508); set('fire', 507, 509, 540);
  set('tech', 510, 519); set('water', 514, 541); set('life', 526); set('undead', 543);
  // Trap Team
  const tt = { 601: 'water', 602: 'earth', 603: 'earth', 604: 'life', 605: 'fire', 606: 'magic', 607: 'air', 608: 'fire',
    609: 'life', 610: 'undead', 611: 'earth', 612: 'air', 613: 'earth', 614: 'undead', 615: 'magic', 616: 'magic',
    617: 'magic', 618: 'life', 619: 'water', 620: 'fire', 621: 'magic', 622: 'undead', 623: 'undead', 624: 'tech',
    625: 'life', 626: 'tech', 627: 'kaos', 628: 'air', 629: 'water' };
  Object.assign(E, tt);
  // Swap Force swappers (bottom 1000+, top 2000+)
  ['air', 'air', 'earth', 'earth', 'fire', 'fire', 'life', 'life', 'magic', 'magic', 'tech', 'tech', 'undead', 'undead', 'water', 'water']
    .forEach((el, i) => { E[1000 + i] = el; E[2000 + i] = el; });
  // SuperChargers
  ['air', 'air', 'earth', 'earth', 'fire', 'fire', 'life', 'life', 'magic', 'magic', 'tech', 'tech', 'undead', 'undead', 'water', 'water']
    .forEach((el, i) => { E[3000 + i] = el; });
  const veh = { 3220: 'air', 3221: 'earth', 3222: 'water', 3223: 'fire', 3224: 'fire', 3225: 'water', 3226: 'earth', 3227: 'undead',
    3228: 'life', 3231: 'air', 3232: 'air', 3233: 'magic', 3234: 'earth', 3235: 'tech', 3236: 'light', 3237: 'dark',
    3238: 'water', 3239: 'water', 3240: 'fire', 3241: 'air',
    3400: 'life', 3401: 'tech', 3402: 'magic', 3406: 'air', 3411: 'earth', 3412: 'fire', 3413: 'air', 3414: 'tech',
    3415: 'life', 3416: 'earth', 3417: 'undead', 3420: 'magic', 3421: 'fire', 3422: 'water', 3423: 'earth', 3424: 'fire',
    3425: 'water', 3426: 'light', 3427: 'dark', 3428: 'life' };
  Object.assign(E, veh);

  const EL = {
    air:     { name: 'Air',     color: '#6FC3EA', note: 330,
      glyph: 'M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7' },
    earth:   { name: 'Earth',   color: '#C48A45', note: 262,
      glyph: 'M12 3l8 5v8l-8 5-8-5V8zM12 3v18M4 8l8 5 8-5' },
    fire:    { name: 'Fire',    color: '#FF6A3D', note: 392,
      glyph: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z' },
    water:   { name: 'Water',   color: '#3E8BFF', note: 294,
      glyph: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z' },
    life:    { name: 'Life',    color: '#8BD04F', note: 349,
      glyph: 'M5 19C5 10 10 5 20 4c0 10-5 15-14 15M5 19l8-8' },
    undead:  { name: 'Undead',  color: '#6FD1B4', note: 220,
      glyph: 'M12 3a8 8 0 0 0-5 14v3h10v-3A8 8 0 0 0 12 3zM9 11h.01M15 11h.01M10 20v-3M14 20v-3' },
    tech:    { name: 'Tech',    color: '#F2B33D', note: 440,
      glyph: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2' },
    magic:   { name: 'Magic',   color: '#B06BFF', note: 370,
      glyph: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z' },
    light:   { name: 'Light',   color: '#FFE27A', note: 523,
      glyph: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19' },
    dark:    { name: 'Dark',    color: '#6B5BB5', note: 196,
      glyph: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z' },
    kaos:    { name: 'Kaos',    color: '#E0405F', note: 247,
      glyph: 'M4 4l16 16M20 4L4 20M12 3v18' },
    neutral: { name: 'Item',    color: '#8E9C9A', note: 311,
      glyph: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12v9M12 12l8-4.5M12 12L4 7.5' },
  };

  // Which game a figure belongs to, by figure id. Checked against the Skylanders wikis:
  //   Trap Masters (450-485) and Minis (502-543) are Trap Team, villains/senseis 601-631 are Imaginators,
  //   3000-3015 and the 1000/2000 swappers are Swap Force, 3400s are SuperChargers.
  const SA = "Spyro's Adventure", GI = 'Giants', SF = 'Swap Force', TT = 'Trap Team', SCH = 'SuperChargers', IM = 'Imaginators';
  const gameOf = id =>
    id <= 32 ? SA :
    id <= 115 ? GI :
    id <= 207 ? SA + ' · magic item' :
    id <= 209 ? GI + ' · battle pack' :
    id <= 220 ? TT + ' · trap' :
    id <= 233 ? TT + ' · magic item' :
    id <= 304 ? SA + ' · adventure pack' :
    id <= 308 ? TT + ' · adventure pack' :
    id <= 430 ? 'Legendary' :
    id <= 485 ? TT + ' · Trap Master' :
    id <= 543 ? TT + ' · Mini' :
    id <= 631 ? IM + ' · Sensei' :
    id <= 2015 ? SF + ' · swap half' :
    id <= 3015 ? SF :
    id <= 3204 ? SF + ' · magic item' :
    id <= 3241 ? SCH + ' · vehicle' :
    id <= 3301 ? SF + ' · adventure pack' :
    id <= 3303 ? GI + ' · battle pack' :
    id <= 3428 ? SCH :
    SCH + ' · trophy';
  // sort order for the picker: by game, then id
  const GAME_ORDER = [SA, 'Legendary', GI, SF, TT, SCH, IM];
  const gameRank = id => { const g = gameOf(id), i = GAME_ORDER.findIndex(x => g.startsWith(x)); return i < 0 ? 99 : i; };

  window.SKY = {
    EL,
    element: id => EL[E[id] || 'neutral'],
    elementKey: id => E[id] || 'neutral',
    gameOf, gameRank,
  };
})();
