/* Small synthesized UI sounds (no audio files). */
(() => {
  'use strict';
  let ac = null;
  const ctx = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; } catch { return null; } };
  const on = () => !(window.NEB && NEB.S && NEB.S.sound === false);

  function tone(type, f0, f1, dur, vol, delay = 0, dest) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, f0, f1, q = 4, delay = 0) {
    const a = ctx(); if (!a) return;
    const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + delay;
    src.buffer = buf; f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * .25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination); src.start(t);
  }
  const wrap = fn => (...a) => { if (on()) fn(...a); };

  window.SFX = {
    unlock: () => { ctx(); },
    tick: wrap(() => tone('square', 1700, 700, .045, .03)),
    tab: wrap(() => { tone('triangle', 520, 780, .07, .05); noise(.05, .02, 3000, 1200, 2); }),
    arm: wrap(() => { tone('sine', 620, 620, .07, .06); tone('sine', 930, 930, .09, .06, .075); }),
    bind: wrap(() => { tone('sine', 880, 880, .28, .07); tone('sine', 1109, 1109, .3, .055, .06); tone('sine', 1319, 1319, .34, .04, .12); noise(.03, .03, 5000, 2500, 1); }),
    clear: wrap(() => { tone('triangle', 520, 190, .16, .06); }),
    error: wrap(() => { tone('square', 150, 120, .14, .04); tone('square', 140, 110, .14, .04, .16); }),
    select: wrap(() => tone('sine', 740, 740, .05, .04)),
    // portal: whoomp rising pad with a tonal ring; pitch differs per element
    place: wrap((base = 330) => {
      noise(.45, .12, 300, 2600, 3);
      tone('sine', base, base * 2, .4, .08);
      tone('triangle', base * 1.5, base * 3, .3, .035, .08);
      tone('sine', base * 3, base * 3, .5, .03, .28);
    }),
    remove: wrap((base = 330) => {
      noise(.3, .09, 2400, 250, 3);
      tone('sine', base * 2, base * .8, .28, .06);
    }),
    launch: wrap(() => { noise(.5, .1, 200, 3000, 2); tone('sawtooth', 110, 440, .5, .035); }),
  };
})();
