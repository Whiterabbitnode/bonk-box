/* Bonk Box - doodle particles. Everything here is decoration: no particle ever
   touches the physics world, so we can be generous without wrecking the frame
   rate. Hard cap keeps a confetti party honest. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});
  var P = Bonk.PALETTE;

  var list = [];
  var MAX = 320;

  function add(p) {
    if (list.length >= MAX) list.shift();
    p.age = 0;
    p.seed = p.seed == null ? Math.random() * 900 : p.seed;
    list.push(p);
    return p;
  }

  function spread(n, x, y, make) {
    for (var i = 0; i < n; i++) add(make(i, n));
  }

  var Particles = {
    all: list,

    clear: function () {
      list.length = 0;
    },

    /* Soft grey puff - landings, get-ups, erased props. */
    dust: function (x, y, count, power) {
      power = power || 1;
      spread(count || 6, x, y, function () {
        var a = Bonk.rand(-Math.PI, 0);
        return {
          kind: 'dust',
          x: x + Bonk.rand(-6, 6),
          y: y + Bonk.rand(-4, 4),
          vx: Math.cos(a) * Bonk.rand(0.4, 1.8) * power,
          vy: Math.sin(a) * Bonk.rand(0.2, 1.1) * power - 0.3,
          r: Bonk.rand(4, 11) * power,
          life: Bonk.rand(0.5, 0.95)
        };
      });
    },

    /* Stars that pop off him one at a time as he shakes off a bonk. */
    star: function (x, y, count, color) {
      spread(count || 4, x, y, function () {
        return {
          kind: 'star',
          x: x,
          y: y,
          vx: Bonk.rand(-2.4, 2.4),
          vy: Bonk.rand(-3.4, -1),
          r: Bonk.rand(4, 8),
          spin: Bonk.rand(-6, 6),
          rot: Bonk.rand(0, 6.28),
          color: color || P.highlighter,
          life: Bonk.rand(0.6, 1.1)
        };
      });
    },

    confetti: function (x, y, count) {
      var colors = [P.highlighter, P.marker, '#7FB77E', '#6FA8C7', P.ink];
      spread(count || 60, x, y, function () {
        return {
          kind: 'confetti',
          x: x + Bonk.rand(-30, 30),
          y: y + Bonk.rand(-20, 10),
          vx: Bonk.rand(-5, 5),
          vy: Bonk.rand(-9, -2),
          r: Bonk.rand(3.5, 6.5),
          spin: Bonk.rand(-9, 9),
          rot: Bonk.rand(0, 6.28),
          color: Bonk.pick(colors),
          shape: Math.random() < 0.35 ? 'star' : 'strip',
          life: Bonk.rand(1.4, 2.6)
        };
      });
    },

    splash: function (x, y, count) {
      spread(count || 22, x, y, function () {
        var a = Bonk.rand(-Math.PI * 0.95, -Math.PI * 0.05);
        var sp = Bonk.rand(1.5, 6.5);
        return {
          kind: 'drop',
          x: x,
          y: y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          r: Bonk.rand(2, 4.5),
          life: Bonk.rand(0.5, 1.0)
        };
      });
    },

    /* Eraser crumbs - what is left when an old prop is rubbed off the page. */
    crumbs: function (x, y, count) {
      spread(count || 10, x, y, function () {
        return {
          kind: 'crumb',
          x: x + Bonk.rand(-14, 14),
          y: y + Bonk.rand(-12, 12),
          vx: Bonk.rand(-1.4, 1.4),
          vy: Bonk.rand(-2.2, -0.2),
          r: Bonk.rand(1.6, 3.4),
          rot: Bonk.rand(0, 6.28),
          life: Bonk.rand(0.7, 1.3)
        };
      });
    },

    /* Graphite dust off the pencil tip while a limb redraws itself. */
    graphite: function (x, y) {
      add({
        kind: 'crumb',
        x: x,
        y: y,
        vx: Bonk.rand(-0.5, 0.5),
        vy: Bonk.rand(0.1, 0.8),
        r: Bonk.rand(0.8, 1.8),
        rot: 0,
        life: Bonk.rand(0.3, 0.6)
      });
    },

    hearts: function (x, y, count) {
      spread(count || 3, x, y, function () {
        return {
          kind: 'heart',
          x: x + Bonk.rand(-10, 10),
          y: y,
          vx: Bonk.rand(-0.6, 0.6),
          vy: Bonk.rand(-1.6, -0.7),
          r: Bonk.rand(6, 10),
          life: Bonk.rand(1.1, 1.8)
        };
      });
    },

    crumbsOfCookie: function (x, y) {
      spread(8, x, y, function () {
        return {
          kind: 'crumb',
          x: x,
          y: y,
          vx: Bonk.rand(-2, 2),
          vy: Bonk.rand(-2.4, -0.4),
          r: Bonk.rand(1.5, 3),
          rot: 0,
          color: '#B98A55',
          life: Bonk.rand(0.5, 0.9)
        };
      });
    },

    /* A band-aid peeling off and fluttering away as a scuff mends. */
    bandaid: function (x, y) {
      add({
        kind: 'bandaid',
        x: x,
        y: y,
        vx: Bonk.rand(-1.2, 1.2),
        vy: Bonk.rand(-1.4, -0.4),
        rot: Bonk.rand(0, 6.28),
        spin: Bonk.rand(-3, 3),
        life: Bonk.rand(1.0, 1.6)
      });
    },

    note: function (x, y) {
      add({
        kind: 'note',
        x: x,
        y: y,
        vx: Bonk.rand(-1.6, 1.6),
        vy: Bonk.rand(-2.6, -1),
        r: Bonk.rand(8, 13),
        rot: Bonk.rand(-0.4, 0.4),
        life: Bonk.rand(1.1, 1.9)
      });
      if (Bonk.Sound) Bonk.Sound.note(Bonk.pick([392, 440, 523, 587, 659, 784]));
    },

    /* "+n" flying from the fun to the coin counter. */
    tally: function (x, y, amount) {
      add({
        kind: 'tally',
        x: x + Bonk.rand(-8, 8),
        y: y - 10,
        amount: amount,
        t: 0,
        life: 0.95,
        drift: Bonk.rand(-40, 40)
      });
    },

    update: function (dt) {
      var target = Bonk.UI ? Bonk.UI.coinAnchor() : { x: 0, y: 0 };
      for (var i = list.length - 1; i >= 0; i--) {
        var p = list[i];
        p.age += dt;
        if (p.age >= p.life) {
          list.splice(i, 1);
          continue;
        }
        var f = p.age / p.life;
        switch (p.kind) {
          case 'tally':
            /* Ease toward the counter so the payout reads as arriving. */
            p.x = Bonk.lerp(p.x, target.x + p.drift * (1 - f), 0.08);
            p.y = Bonk.lerp(p.y, target.y, 0.07);
            break;
          case 'dust':
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.94;
            p.vy = p.vy * 0.94 - 0.05;
            p.r += dt * 14;
            break;
          case 'confetti':
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.22;
            p.vx *= 0.99;
            p.rot += p.spin * dt;
            break;
          case 'drop':
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.34;
            break;
          case 'star':
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.12;
            p.rot += p.spin * dt;
            break;
          case 'crumb':
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.24;
            break;
          case 'heart':
            p.x += p.vx + Math.sin(p.age * 5 + p.seed) * 0.4;
            p.y += p.vy;
            break;
          case 'bandaid':
            p.x += p.vx + Math.sin(p.age * 6 + p.seed) * 0.7;
            p.y += p.vy;
            p.vy += 0.05;
            p.rot += p.spin * dt;
            break;
          case 'note':
            p.x += p.vx + Math.sin(p.age * 4 + p.seed) * 0.5;
            p.y += p.vy;
            p.vy += 0.04;
            break;
        }
      }
    },

    draw: function (ctx) {
      var D = Bonk.Doodle;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var f = p.age / p.life;
        var fade = 1 - f * f;
        switch (p.kind) {
          case 'tally':
            D.text(ctx, '+' + p.amount, p.x, p.y, {
              size: 17 + Math.min(8, p.amount * 0.35),
              color: P.highlighter,
              alpha: fade
            });
            D.text(ctx, '+' + p.amount, p.x, p.y, { size: 17 + Math.min(8, p.amount * 0.35), color: P.ink, alpha: fade * 0.45 });
            break;
          case 'dust':
            D.circle(ctx, p.x, p.y, p.r, { color: P.pencil, width: 1.6, alpha: fade * 0.5, seed: p.seed, amp: 1.6 });
            break;
          case 'confetti':
            if (p.shape === 'star') {
              D.star(ctx, p.x, p.y, p.r, p.rot, { fill: p.color, color: p.color, width: 1, alpha: fade });
            } else {
              ctx.save();
              ctx.globalAlpha = fade;
              ctx.translate(p.x, p.y);
              ctx.rotate(p.rot);
              ctx.fillStyle = p.color;
              ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
              ctx.restore();
            }
            break;
          case 'drop':
            ctx.save();
            ctx.globalAlpha = fade * 0.8;
            ctx.fillStyle = '#6FA8C7';
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.r * 0.75, p.r, 0, 0, 6.29);
            ctx.fill();
            ctx.restore();
            break;
          case 'star':
            D.star(ctx, p.x, p.y, p.r, p.rot, { fill: p.color, color: P.ink, width: 1.4, alpha: fade });
            break;
          case 'crumb':
            ctx.save();
            ctx.globalAlpha = fade * 0.7;
            ctx.fillStyle = p.color || P.pencil;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 6.29);
            ctx.fill();
            ctx.restore();
            break;
          case 'heart':
            drawHeart(ctx, p.x, p.y, p.r, fade);
            break;
          case 'bandaid':
            drawBandaid(ctx, p.x, p.y, p.rot, fade);
            break;
          case 'note':
            drawNote(ctx, p.x, p.y, p.r, p.rot, fade);
            break;
        }
      }
    },

    drawHeart: null
  };

  function drawHeart(ctx, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = P.marker;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.75);
    ctx.bezierCurveTo(x - r * 1.5, y - r * 0.35, x - r * 0.45, y - r * 1.15, x, y - r * 0.3);
    ctx.bezierCurveTo(x + r * 0.45, y - r * 1.15, x + r * 1.5, y - r * 0.35, x, y + r * 0.75);
    ctx.stroke();
    ctx.restore();
  }
  Particles.drawHeart = drawHeart;

  function drawBandaid(ctx, x, y, rot, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = '#F2D9BE';
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 1.4;
    roundRect(ctx, -9, -4, 18, 8, 3);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2.5, -1.6);
    ctx.lineTo(2.5, -1.6);
    ctx.moveTo(-2.5, 1.6);
    ctx.lineTo(2.5, 1.6);
    ctx.stroke();
    ctx.restore();
  }
  Particles.drawBandaid = drawBandaid;

  function drawNote(ctx, x, y, r, rot, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = P.ink;
    ctx.fillStyle = P.ink;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, r * 0.4, r * 0.36, r * 0.27, -0.4, 0, 6.29);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.02, r * 0.35);
    ctx.lineTo(-r * 0.02, -r * 0.6);
    ctx.lineTo(r * 0.5, -r * 0.85);
    ctx.stroke();
    ctx.restore();
  }
  Particles.drawNote = drawNote;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  Particles.roundRect = roundRect;

  Bonk.Particles = Particles;
})();
