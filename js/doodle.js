/* Bonk Box - hand-drawn line primitives.
   Everything on the page should look like it was drawn with a pen that has a
   slight tremor. The tremor comes from a precomputed value-noise table sampled
   in each stroke's own local frame, so wobble rotates with a limb instead of
   shimmering at it. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});

  var NOISE_N = 1024;
  var noiseTable = new Float32Array(NOISE_N);
  (function seedNoise() {
    /* Deterministic so a reload draws the same page. */
    var s = 20050614;
    for (var i = 0; i < NOISE_N; i++) {
      s = (s * 1664525 + 1013904223) % 4294967296;
      noiseTable[i] = (s / 4294967296) * 2 - 1;
    }
  })();

  function noise(x) {
    var i = Math.floor(x);
    var f = x - i;
    var a = noiseTable[((i % NOISE_N) + NOISE_N) % NOISE_N];
    var b = noiseTable[(((i + 1) % NOISE_N) + NOISE_N) % NOISE_N];
    var s = f * f * (3 - 2 * f); // smoothstep keeps the line lazy, not jagged
    return a + (b - a) * s;
  }

  function pathLength(pts) {
    var total = 0;
    for (var i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return total;
  }

  /* Subdivide a polyline and nudge each sample sideways by noise. */
  function wobble(pts, seed, amp, spacing) {
    amp = amp == null ? 1.1 : amp;
    spacing = spacing || 7;
    var out = [];
    var walked = 0;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1];
      var b = pts[i];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var len = Math.hypot(dx, dy) || 0.0001;
      var steps = Math.max(1, Math.round(len / spacing));
      var nx = -dy / len;
      var ny = dx / len;
      for (var s = i === 1 ? 0 : 1; s <= steps; s++) {
        var t = s / steps;
        var d = walked + len * t;
        /* Taper the wobble at the ends so joints stay put. */
        var edge = Math.min(1, Math.min(d, 6) / 6);
        var n = noise(seed + d * 0.11) * amp * edge;
        out.push({ x: a.x + dx * t + nx * n, y: a.y + dy * t + ny * n });
      }
      walked += len;
    }
    return out;
  }

  /* Trim a polyline to the first `f` of its length (used by the redraw). */
  function partial(pts, f) {
    if (f >= 1) return pts;
    if (f <= 0) return [];
    var target = pathLength(pts) * f;
    var out = [pts[0]];
    var walked = 0;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1];
      var b = pts[i];
      var len = Math.hypot(b.x - a.x, b.y - a.y);
      if (walked + len >= target) {
        var t = (target - walked) / (len || 1);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        return out;
      }
      out.push(b);
      walked += len;
    }
    return out;
  }

  function strokePath(ctx, pts, opts) {
    if (pts.length < 2) return;
    opts = opts || {};
    ctx.save();
    ctx.strokeStyle = opts.color || Bonk.PALETTE.ink;
    ctx.lineWidth = opts.width || 3;
    ctx.lineCap = opts.cap || 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    if (opts.dash) ctx.setLineDash(opts.dash);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length - 1; i++) {
      /* Quadratic midpoints keep the tremor smooth rather than faceted. */
      var mx = (pts[i].x + pts[i + 1].x) / 2;
      var my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    var last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  }

  function line(ctx, x1, y1, x2, y2, opts) {
    opts = opts || {};
    strokePath(ctx, wobble([{ x: x1, y: y1 }, { x: x2, y: y2 }], opts.seed || 0, opts.amp, opts.spacing), opts);
  }

  function circlePoints(cx, cy, r, seed, amp, wonk) {
    amp = amp == null ? 1 : amp;
    var pts = [];
    var steps = Math.max(10, Math.round(r * 1.1));
    for (var i = 0; i <= steps; i++) {
      var a = (i / steps) * Math.PI * 2;
      var n = noise(seed + i * 0.7) * amp;
      var rr = r + n;
      pts.push({ x: cx + Math.cos(a) * rr * (wonk ? 1.04 : 1), y: cy + Math.sin(a) * rr });
    }
    return pts;
  }

  function circle(ctx, cx, cy, r, opts) {
    opts = opts || {};
    strokePath(ctx, circlePoints(cx, cy, r, opts.seed || 0, opts.amp), opts);
  }

  function fillPath(ctx, pts, color, alpha) {
    if (pts.length < 3) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function rectPoints(x, y, w, h, seed, amp) {
    return wobble(
      [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h },
        { x: x, y: y }
      ],
      seed,
      amp == null ? 1 : amp,
      9
    );
  }

  /* Loose parallel hatching, for shading a prop. */
  function hatch(ctx, x, y, w, h, opts) {
    opts = opts || {};
    var gap = opts.gap || 6;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    for (var i = -h; i < w; i += gap) {
      line(ctx, x + i, y + h, x + i + h, y, {
        color: opts.color || Bonk.PALETTE.pencil,
        width: opts.width || 1.2,
        alpha: opts.alpha == null ? 0.4 : opts.alpha,
        seed: i * 3.3,
        amp: 0.6
      });
    }
    ctx.restore();
  }

  var HAND_FONT = '"Shantell Sans", "Patrick Hand", "Bradley Hand", "Segoe Print", cursive';

  function handFont(size, weight) {
    return (weight || 600) + ' ' + size + 'px ' + HAND_FONT;
  }

  function text(ctx, str, x, y, opts) {
    opts = opts || {};
    ctx.save();
    ctx.font = handFont(opts.size || 16, opts.weight);
    ctx.fillStyle = opts.color || Bonk.PALETTE.ink;
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'middle';
    if (opts.rotate) {
      ctx.translate(x, y);
      ctx.rotate(opts.rotate);
      ctx.fillText(str, 0, 0);
    } else {
      ctx.fillText(str, x, y);
    }
    ctx.restore();
  }

  function measure(ctx, str, size, weight) {
    ctx.save();
    ctx.font = handFont(size, weight);
    var w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  }

  /* A speech bubble with a hand-drawn outline and a little tail. */
  function bubble(ctx, str, x, y, opts) {
    opts = opts || {};
    var size = opts.size || 17;
    var w = measure(ctx, str, size) + 22;
    var h = size + 18;
    var bx = x - w / 2;
    var by = y - h;
    var pts = rectPoints(bx, by, w, h, opts.seed || 11, 1.4);
    fillPath(ctx, pts, Bonk.PALETTE.paper, 0.94);
    strokePath(ctx, pts, { color: Bonk.PALETTE.ink, width: 2, alpha: opts.alpha == null ? 1 : opts.alpha });
    strokePath(
      ctx,
      wobble(
        [
          { x: x - 6, y: by + h - 1 },
          { x: x - 1, y: by + h + 10 },
          { x: x + 7, y: by + h - 1 }
        ],
        opts.seed || 11,
        0.8,
        5
      ),
      { color: Bonk.PALETTE.ink, width: 2, alpha: opts.alpha == null ? 1 : opts.alpha }
    );
    text(ctx, str, x, by + h / 2 - 1, {
      size: size,
      color: opts.color || Bonk.PALETTE.ink,
      alpha: opts.alpha == null ? 1 : opts.alpha
    });
    return { w: w, h: h };
  }

  /* A five-pointed doodle star, used for orbiting stars and confetti. */
  function star(ctx, cx, cy, r, rot, opts) {
    opts = opts || {};
    var pts = [];
    for (var i = 0; i <= 10; i++) {
      var a = rot + (i / 10) * Math.PI * 2 - Math.PI / 2;
      var rr = i % 2 === 0 ? r : r * 0.44;
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    if (opts.fill) fillPath(ctx, pts, opts.fill, opts.alpha);
    strokePath(ctx, pts, {
      color: opts.color || Bonk.PALETTE.ink,
      width: opts.width || 1.6,
      alpha: opts.alpha == null ? 1 : opts.alpha
    });
  }

  Bonk.Doodle = {
    noise: noise,
    wobble: wobble,
    partial: partial,
    pathLength: pathLength,
    strokePath: strokePath,
    line: line,
    circle: circle,
    circlePoints: circlePoints,
    rectPoints: rectPoints,
    fillPath: fillPath,
    hatch: hatch,
    text: text,
    measure: measure,
    bubble: bubble,
    star: star,
    handFont: handFont
  };
})();
