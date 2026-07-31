/* Bonk Box - tiny synthesised one-shots. No audio files, no network.
   The context is created on the first user gesture because browsers will not
   let it start any earlier. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});
  var ctx = null;
  var master = null;
  var noiseBuffer = null;
  var lastCoin = 0;

  function ready() {
    if (Bonk.state.save.muted) return false;
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function start() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
    } catch (err) {
      return;
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    var len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  function env(node, t0, peak, rise, decay) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + rise);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + rise + decay);
  }

  function tone(opts) {
    if (!ready()) return;
    var t0 = ctx.currentTime + (opts.delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.from, t0);
    if (opts.to != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + (opts.glide || opts.decay || 0.2));
    if (opts.wobble) {
      var lfo = ctx.createOscillator();
      var lfoGain = ctx.createGain();
      lfo.frequency.value = opts.wobble;
      lfoGain.gain.value = opts.wobbleDepth || 30;
      lfo.connect(lfoGain).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + (opts.rise || 0.01) + (opts.decay || 0.2) + 0.05);
    }
    env(gain, t0, opts.gain == null ? 0.3 : opts.gain, opts.rise || 0.008, opts.decay || 0.2);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + (opts.rise || 0.008) + (opts.decay || 0.2) + 0.05);
  }

  function noise(opts) {
    if (!ready() || !noiseBuffer) return;
    var t0 = ctx.currentTime + (opts.delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = ctx.createBiquadFilter();
    filter.type = opts.filter || 'bandpass';
    filter.frequency.setValueAtTime(opts.from || 900, t0);
    if (opts.to != null) filter.frequency.exponentialRampToValueAtTime(Math.max(60, opts.to), t0 + (opts.decay || 0.2));
    filter.Q.value = opts.q == null ? 1.2 : opts.q;
    var gain = ctx.createGain();
    env(gain, t0, opts.gain == null ? 0.22 : opts.gain, opts.rise || 0.005, opts.decay || 0.2);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + (opts.decay || 0.2) + 0.1);
  }

  Bonk.Sound = {
    start: start,
    isOn: function () {
      return !!ctx;
    },

    /* A springy bounce. Strength 0..1 raises pitch and volume. */
    boing: function (strength) {
      var s = Bonk.clamp(strength == null ? 0.5 : strength, 0.05, 1);
      tone({ type: 'sine', from: 120 + s * 260, to: 60 + s * 90, decay: 0.16 + s * 0.14, gain: 0.12 + s * 0.2, wobble: 18, wobbleDepth: 40 });
    },

    /* Flat impact: prop meets buddy, or buddy meets floor. */
    thud: function (strength) {
      var s = Bonk.clamp(strength == null ? 0.5 : strength, 0.05, 1);
      tone({ type: 'sine', from: 150 + s * 60, to: 45, decay: 0.13 + s * 0.1, gain: 0.14 + s * 0.22 });
      noise({ filter: 'lowpass', from: 700 + s * 900, to: 120, decay: 0.1, gain: 0.06 + s * 0.12 });
    },

    pop: function (pitch) {
      tone({ type: 'triangle', from: 420 * (pitch || 1), to: 900 * (pitch || 1), glide: 0.05, decay: 0.07, gain: 0.16 });
    },

    splash: function () {
      noise({ filter: 'bandpass', from: 2600, to: 500, decay: 0.34, q: 0.7, gain: 0.2 });
      tone({ type: 'sine', from: 700, to: 200, decay: 0.2, gain: 0.09 });
    },

    whoosh: function () {
      noise({ filter: 'bandpass', from: 350, to: 2200, decay: 0.26, q: 0.5, gain: 0.11 });
    },

    /* Coin ticks stack up when a big payout lands. */
    coin: function (amount) {
      if (!ready()) return;
      var now = ctx.currentTime;
      if (now - lastCoin < 0.035) return;
      lastCoin = now;
      var ticks = Bonk.clamp(Math.ceil((amount || 1) / 6), 1, 4);
      for (var i = 0; i < ticks; i++) {
        tone({ type: 'square', from: 1180 + i * 190, decay: 0.06, gain: 0.05, delay: i * 0.045 });
        tone({ type: 'sine', from: 1770 + i * 240, decay: 0.09, gain: 0.035, delay: i * 0.045 });
      }
    },

    giggle: function () {
      if (!ready()) return;
      for (var i = 0; i < 3; i++) {
        tone({ type: 'sine', from: 560 + Math.random() * 240 + i * 70, decay: 0.06, gain: 0.06, delay: i * 0.075 });
      }
    },

    /* The hard hat deflecting a bonk. */
    ting: function () {
      tone({ type: 'triangle', from: 2100, decay: 0.4, gain: 0.11 });
      tone({ type: 'sine', from: 3150, decay: 0.28, gain: 0.05 });
    },

    poof: function () {
      noise({ filter: 'lowpass', from: 1600, to: 260, decay: 0.28, gain: 0.08 });
    },

    munch: function () {
      noise({ filter: 'bandpass', from: 620, to: 300, decay: 0.09, q: 2.2, gain: 0.13 });
      noise({ filter: 'bandpass', from: 520, to: 260, decay: 0.09, q: 2.2, gain: 0.11, delay: 0.13 });
    },

    /* Little rising arpeggio for confetti and purchases. */
    party: function () {
      var steps = [523, 659, 784, 1046];
      for (var i = 0; i < steps.length; i++) {
        tone({ type: 'triangle', from: steps[i], decay: 0.18, gain: 0.09, delay: i * 0.07 });
      }
    },

    page: function () {
      noise({ filter: 'highpass', from: 900, to: 3400, decay: 0.22, q: 0.6, gain: 0.08 });
    },

    /* One note off a falling piano. */
    note: function (freq) {
      tone({ type: 'triangle', from: freq, decay: 0.5, gain: 0.07 });
      tone({ type: 'sine', from: freq * 2, decay: 0.3, gain: 0.03 });
    }
  };
})();
