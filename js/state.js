/* Bonk Box - shared state, palette, tuning constants, and localStorage.
   Classic script: everything hangs off the window.Bonk namespace so the page
   runs from file:// with no build step and no ES module imports. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});

  /* ---- the sketchbook palette ------------------------------------------ */
  Bonk.PALETTE = {
    paper: '#FAF7F2',
    grid: '#D9E4EE',
    ink: '#2B2B33',
    marker: '#E0533D',
    highlighter: '#FFD84D',
    pencil: '#8A8F98'
  };

  /* Ink colours the buddy can wear. 'graphite' is free and default. */
  Bonk.INKS = {
    graphite: { label: 'Graphite', color: '#2B2B33' },
    marker: { label: 'Marker Red', color: '#E0533D' },
    blueprint: { label: 'Blueprint', color: '#2F5D7C' }
  };

  /* ---- tuning ----------------------------------------------------------
     Physics numbers are in Matter units: forces are compared against gravity,
     which lands at mass * 0.001 per step. Anything labelled K is a gain. */
  Bonk.CONFIG = {
    maxProps: 16,
    buddyHeight: 144,

    /* muscles */
    muscleBlendIn: 0.9, // seconds for muscle strength to ramp 0 -> 1
    muscleGain: 0.24, // how hard a joint chases its target angle per step
    balanceK: 0.000055, // positional pull of the chest toward its stand point
    balanceDamp: 0.0011, // just past critical damping: settles without wobble
    uprightGain: 0.16,

    /* what counts as a bonk */
    bonkSpeed: 5.5,
    bigBonkSpeed: 13,

    /* scuffs and mood drift, per second */
    scuffHeal: 0.012,
    moodDrift: 0.05,
    moodRest: 0.55,

    /* recovery */
    calmSpeed: 1.6, // below this average speed he counts as settled
    calmHold: 0.45 // seconds settled before he starts getting up
  };

  /* ---- persistence ------------------------------------------------------ */
  var SAVE_KEY = 'bonkbox.save.v1';

  function defaultSave() {
    return {
      coins: 0,
      owned: ['hand', 'feather', 'beachball'],
      hat: null,
      ink: 'graphite',
      name: 'your agent',
      muted: false,
      visits: 0
    };
  }

  function loadSave() {
    var save = defaultSave();
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.coins === 'number' && isFinite(parsed.coins)) save.coins = Math.max(0, Math.floor(parsed.coins));
          if (Array.isArray(parsed.owned)) {
            parsed.owned.forEach(function (id) {
              if (typeof id === 'string' && save.owned.indexOf(id) === -1) save.owned.push(id);
            });
          }
          if (typeof parsed.hat === 'string' || parsed.hat === null) save.hat = parsed.hat;
          if (typeof parsed.ink === 'string' && Bonk.INKS[parsed.ink]) save.ink = parsed.ink;
          if (typeof parsed.name === 'string' && parsed.name.trim()) save.name = parsed.name.slice(0, 18);
          if (typeof parsed.muted === 'boolean') save.muted = parsed.muted;
          if (typeof parsed.visits === 'number' && isFinite(parsed.visits)) save.visits = parsed.visits;
        }
      }
    } catch (err) {
      /* Private mode, or file:// storage turned off. Play on without saving. */
    }
    return save;
  }

  var state = {
    save: loadSave(),
    returning: false,

    mood: 0.65, // 0 grumpy .. 1 happy
    scuffs: 0, // 0 pristine .. 1 thoroughly scuffed

    tool: 'hand',
    shopOpen: false,
    paused: false,

    tickle: 0,
    reducedMotion: false,
    time: 0,
    pointer: { x: 0, y: 0, vx: 0, vy: 0, down: false, inside: false }
  };
  state.returning = state.save.visits > 0;
  Bonk.state = state;

  Bonk.persist = function () {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(state.save));
    } catch (err) {
      /* Saving is a nicety, never a requirement. */
    }
  };

  Bonk.owns = function (id) {
    return state.save.owned.indexOf(id) !== -1;
  };

  Bonk.clamp = function (v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  };

  Bonk.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  /* Shortest signed distance between two angles. */
  Bonk.angleDelta = function (from, to) {
    var d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  Bonk.rand = function (lo, hi) {
    return lo + Math.random() * (hi - lo);
  };

  Bonk.pick = function (arr) {
    return arr[(Math.random() * arr.length) | 0];
  };

  /* ---- mood, scuffs, coins --------------------------------------------- */
  Bonk.addMood = function (delta) {
    state.mood = Bonk.clamp(state.mood + delta, 0, 1);
  };

  Bonk.addScuffs = function (delta) {
    state.scuffs = Bonk.clamp(state.scuffs + delta, 0, 1);
  };

  /* Every interaction pays. `at` is a world point so the tally can fly to the
     counter from wherever the fun happened. */
  Bonk.pay = function (amount, at) {
    amount = Math.max(1, Math.round(amount));
    state.save.coins += amount;
    Bonk.persist();
    if (Bonk.UI) Bonk.UI.flashCoins();
    if (at && Bonk.Particles) Bonk.Particles.tally(at.x, at.y, amount);
    if (Bonk.Sound) Bonk.Sound.coin(amount);
    return amount;
  };

  Bonk.spend = function (amount) {
    if (state.save.coins < amount) return false;
    state.save.coins -= amount;
    Bonk.persist();
    return true;
  };
})();
