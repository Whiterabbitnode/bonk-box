/* Bonk Box - tools, props and the doodle-coin economy.
   Props are ordinary Matter bodies with a doodle drawn over them. When the page
   gets too crowded the oldest one erases itself rather than being deleted, so
   the room always looks tidied rather than emptied. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});
  var P = Bonk.PALETTE;
  var D;

  /* ---- catalogue -------------------------------------------------------
     `free` tools are in the tray from the first visit. Everything else is
     bought with doodle-coins earned by playing. */
  var TOOLS = {
    hand: { label: 'Hand', price: 0, free: true, blurb: 'Nudge him, or grab a limb and fling.' },
    feather: { label: 'Feather', price: 0, free: true, blurb: 'Tickle. He giggles, and giggles pay.' },
    beachball: { label: 'Beach ball', price: 0, free: true, blurb: 'Light, bouncy, endlessly boopable.' },
    cookie: { label: 'Cookie', price: 90, blurb: 'He catches it and eats it. Mends scuffs.' },
    waterballoon: { label: 'Water balloon', price: 120, blurb: 'Splash. He goes soggy, then shakes dry.' },
    trampoline: { label: 'Trampoline', price: 170, place: true, blurb: 'Place it. Happy bounces pay out.' },
    anvil: { label: 'Anvil', price: 260, blurb: 'Drops from above. Pancake, then boing.' },
    gustfan: { label: 'Gust fan', price: 320, place: true, blurb: 'Place it. He leans in and flaps.' },
    bowlingball: { label: 'Bowling ball', price: 420, blurb: 'Heavy roller. Rolls where you aim it.' },
    confetti: { label: 'Confetti', price: 560, blurb: 'He dances. Mood goes through the ceiling.' },
    gravityflip: { label: 'Gravity flip', price: 780, blurb: 'Everything floats up. Then it comes back.' },
    piano: { label: 'Piano', price: 1400, blurb: 'Expensive, spectacular, rains musical notes.' }
  };

  var SKINS = {
    hat_party: { label: 'Party hat', price: 150, type: 'hat', value: 'party', blurb: 'Every day is a launch day.' },
    hat_wizard: { label: 'Wizard hat', price: 280, type: 'hat', value: 'wizard', blurb: 'For when the fix looks like magic.' },
    hat_hard: { label: 'Hard hat', price: 400, type: 'hat', value: 'hard', blurb: 'Head bonks go "ting". Far fewer scuffs.' },
    ink_marker: { label: 'Marker red ink', price: 200, type: 'ink', value: 'marker', blurb: 'Redraw him in marker.' },
    ink_blueprint: { label: 'Blueprint ink', price: 200, type: 'ink', value: 'blueprint', blurb: 'Redraw him in blueprint blue.' }
  };

  var ORDER = ['hand', 'feather', 'beachball', 'cookie', 'waterballoon', 'trampoline', 'anvil', 'gustfan', 'bowlingball', 'confetti', 'gravityflip', 'piano'];

  /* ---- prop definitions ------------------------------------------------ */
  var PROPS = {
    beachball: {
      make: function (M, x, y) {
        return M.Bodies.circle(x, y, 23, { restitution: 0.86, friction: 0.02, frictionAir: 0.012, density: 0.00055, label: 'beachball' });
      },
      payMul: 0.7,
      scuffMul: 0.35,
      sound: function (s) {
        Bonk.Sound.boing(s);
      }
    },
    waterballoon: {
      make: function (M, x, y) {
        return M.Bodies.circle(x, y, 16, { restitution: 0.12, friction: 0.4, density: 0.0018, label: 'waterballoon' });
      },
      payMul: 1.1,
      scuffMul: 0.25,
      burstAt: 3.2,
      onHit: function (prop, speed, point) {
        if (speed > 2.6) {
          Bonk.Buddy.soak(point);
          Bonk.Props.erase(prop, true);
          Bonk.pay(9, point);
        }
      },
      onLand: function (prop, speed, point) {
        if (speed > 3.2) {
          Bonk.Particles.splash(point.x, point.y, 18);
          Bonk.Sound.splash();
          Bonk.Props.erase(prop, true);
        }
      }
    },
    cookie: {
      make: function (M, x, y) {
        return M.Bodies.circle(x, y, 15, { restitution: 0.3, friction: 0.5, density: 0.0009, label: 'cookie' });
      },
      payMul: 0.4,
      scuffMul: 0,
      onHit: function (prop, speed, point) {
        Bonk.Buddy.eatCookie(point);
        Bonk.Props.erase(prop, true);
      }
    },
    anvil: {
      fromCeiling: true,
      make: function (M, x, y) {
        return M.Bodies.rectangle(x, y, 58, 40, { restitution: 0.04, friction: 0.9, density: 0.008, label: 'anvil', chamfer: { radius: 3 } });
      },
      payMul: 2.2,
      scuffMul: 1.15,
      onHit: function (prop, speed, point, partName) {
        if (speed > 7 && (partName === 'head' || partName === 'chest')) Bonk.Buddy.pancake();
        Bonk.Sound.thud(1);
      }
    },
    bowlingball: {
      make: function (M, x, y) {
        return M.Bodies.circle(x, y, 21, { restitution: 0.38, friction: 0.015, frictionAir: 0.004, density: 0.009, label: 'bowlingball' });
      },
      payMul: 1.8,
      scuffMul: 0.9
    },
    piano: {
      fromCeiling: true,
      make: function (M, x, y) {
        return M.Bodies.rectangle(x, y, 88, 66, { restitution: 0.08, friction: 0.8, density: 0.0075, label: 'piano', chamfer: { radius: 5 } });
      },
      payMul: 3.4,
      scuffMul: 1.2,
      onHit: function (prop, speed, point) {
        for (var i = 0; i < 6; i++) Bonk.Particles.note(point.x + Bonk.rand(-30, 30), point.y - Bonk.rand(0, 26));
        if (speed > 7) Bonk.Buddy.pancake();
      },
      onLand: function (prop, speed, point) {
        if (speed > 4) {
          for (var i = 0; i < 4; i++) Bonk.Particles.note(point.x + Bonk.rand(-40, 40), point.y - 30);
        }
      }
    },
    trampoline: {
      placeable: true,
      max: 2,
      make: function (M, x, y) {
        return M.Bodies.rectangle(x, y, 108, 12, { isStatic: true, restitution: 0.4, friction: 0.4, label: 'trampoline', chamfer: { radius: 6 } });
      },
      payMul: 0.5,
      scuffMul: 0
    },
    gustfan: {
      placeable: true,
      max: 2,
      make: function (M, x, y) {
        return M.Bodies.rectangle(x, y, 44, 46, { isStatic: true, friction: 0.5, label: 'gustfan', chamfer: { radius: 6 } });
      },
      payMul: 0.3,
      scuffMul: 0
    }
  };

  var Props = {
    list: [],
    world: null,
    engine: null,

    init: function (engine) {
      this.engine = engine;
      this.world = engine.world;
      D = Bonk.Doodle;
    },

    countLive: function () {
      var n = 0;
      for (var i = 0; i < this.list.length; i++) {
        if (!this.list[i].def.placeable && !this.list[i].erasing) n++;
      }
      return n;
    },

    spawn: function (kind, x, y, vel) {
      var M = window.Matter;
      var def = PROPS[kind];
      if (!def) return null;

      if (def.placeable) {
        var same = this.list.filter(function (p) {
          return p.kind === kind && !p.erasing;
        });
        while (same.length >= (def.max || 2)) this.erase(same.shift());
      } else {
        /* Over the cap, the oldest prop rubs itself off the page. */
        while (this.countLive() >= Bonk.CONFIG.maxProps) {
          var oldest = null;
          for (var i = 0; i < this.list.length; i++) {
            if (!this.list[i].def.placeable && !this.list[i].erasing) {
              oldest = this.list[i];
              break;
            }
          }
          if (!oldest) break;
          this.erase(oldest);
        }
      }

      var body = def.make(M, x, y);
      body.isProp = true;
      body.propKind = kind;
      if (vel) M.Body.setVelocity(body, vel);
      M.Composite.add(this.world, body);

      var prop = { kind: kind, def: def, body: body, born: Bonk.state.time, erasing: 0, seed: Math.random() * 500, squish: 0, spin: 0 };
      body.prop = prop;
      this.list.push(prop);
      return prop;
    },

    erase: function (prop, instant) {
      if (!prop || prop.erasing) return;
      prop.erasing = 0.0001;
      prop.eraseSpeed = instant ? 4.5 : 2.2;
      var pos = prop.body.position;
      Bonk.Particles.crumbs(pos.x, pos.y, instant ? 6 : 12);
    },

    remove: function (prop) {
      window.Matter.Composite.remove(this.world, prop.body);
      var i = this.list.indexOf(prop);
      if (i >= 0) this.list.splice(i, 1);
    },

    clear: function () {
      var copy = this.list.slice();
      for (var i = 0; i < copy.length; i++) this.remove(copy[i]);
    },

    update: function (dt) {
      var M = window.Matter;
      for (var i = this.list.length - 1; i >= 0; i--) {
        var p = this.list[i];
        p.squish *= Math.pow(0.05, dt);
        if (p.erasing) {
          p.erasing += dt * p.eraseSpeed;
          if (p.erasing >= 1) {
            this.remove(p);
            continue;
          }
          /* Ignore the world while it is being rubbed out. */
          p.body.collisionFilter.mask = 0;
        }
        if (p.kind === 'gustfan') this.blow(p, dt);
      }
      void M;
    },

    /* Wind from a placed fan, falling off with distance. */
    blow: function (fan, dt) {
      var M = window.Matter;
      var pos = fan.body.position;
      var dir = fan.dir || 1;
      var bodies = Bonk.Buddy.bodies.concat(
        this.list
          .filter(function (p) {
            return !p.def.placeable && !p.erasing;
          })
          .map(function (p) {
            return p.body;
          })
      );
      fan.spin += dt * 16;
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        var dx = (b.position.x - pos.x) * dir;
        var dy = b.position.y - pos.y;
        if (dx < 0 || dx > 300 || Math.abs(dy) > 90) continue;
        var falloff = 1 - dx / 300;
        M.Body.applyForce(b, b.position, { x: dir * 0.0016 * falloff * b.mass, y: -0.0004 * falloff * b.mass });
      }
      if (Math.random() < dt * 6) {
        Bonk.Particles.dust(pos.x + dir * 40, pos.y + Bonk.rand(-24, 24), 1, 0.5);
      }
    },

    /* ---- drawing ------------------------------------------------------ */
    draw: function (ctx) {
      for (var i = 0; i < this.list.length; i++) {
        var p = this.list[i];
        var fade = p.erasing ? 1 - p.erasing : 1;
        var b = p.body;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        var color = p.erasing ? P.pencil : P.ink;
        var width = p.erasing ? 1.6 : 3;
        var drawFn = DRAW[p.kind];
        if (drawFn) drawFn(ctx, p, color, width, p.erasing ? 0.5 : 1);
        ctx.restore();
      }
    }
  };

  /* Each prop draws itself in its own body frame. */
  var DRAW = {
    beachball: function (ctx, p, color, w, solid) {
      var r = 23;
      var pts = D.circlePoints(0, 0, r, p.seed, 0.9);
      if (solid > 0.6) {
        D.fillPath(ctx, pts, P.paper, 0.95);
        [[-Math.PI * 0.5, P.marker], [Math.PI * 0.17, P.highlighter]].forEach(function (wedge) {
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = wedge[1];
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, r - 1.5, wedge[0], wedge[0] + Math.PI * 0.45);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        });
      }
      D.strokePath(ctx, pts, { color: color, width: w });
      D.line(ctx, -r, 0, r, 0, { color: color, width: w * 0.55, seed: p.seed + 9, amp: 1.4 });
      D.line(ctx, 0, -r, 0, r, { color: color, width: w * 0.55, seed: p.seed + 19, amp: 1.4 });
    },

    waterballoon: function (ctx, p, color, w, solid) {
      var pts = [
        { x: 0, y: -19 },
        { x: 13, y: -6 },
        { x: 15, y: 7 },
        { x: 0, y: 17 },
        { x: -15, y: 7 },
        { x: -13, y: -6 },
        { x: 0, y: -19 }
      ];
      var wob = D.wobble(pts, p.seed, 1, 6);
      if (solid > 0.6) D.fillPath(ctx, wob, '#8FC3DC', 0.7);
      D.strokePath(ctx, wob, { color: color, width: w });
      D.line(ctx, 0, -19, -2, -25, { color: color, width: w * 0.8, seed: p.seed + 3, amp: 0.5 });
    },

    cookie: function (ctx, p, color, w, solid) {
      var pts = D.circlePoints(0, 0, 15, p.seed, 1.3);
      if (solid > 0.6) D.fillPath(ctx, pts, '#D9A868', 0.85);
      D.strokePath(ctx, pts, { color: color, width: w });
      var chips = [[-5, -4], [4, -6], [6, 4], [-4, 6], [0, 0]];
      ctx.save();
      ctx.fillStyle = '#6B4423';
      ctx.globalAlpha = solid;
      chips.forEach(function (c) {
        ctx.beginPath();
        ctx.arc(c[0], c[1], 2.1, 0, 6.29);
        ctx.fill();
      });
      ctx.restore();
    },

    anvil: function (ctx, p, color, w, solid) {
      /* Long flat top with a horn on one end, pinched waist, splayed base. */
      var pts = [
        { x: -26, y: -20 },
        { x: 20, y: -20 },
        { x: 29, y: -13 },
        { x: 20, y: -8 },
        { x: 9, y: -8 },
        { x: 7, y: 6 },
        { x: 18, y: 12 },
        { x: 19, y: 20 },
        { x: -19, y: 20 },
        { x: -18, y: 12 },
        { x: -7, y: 6 },
        { x: -9, y: -8 },
        { x: -26, y: -8 },
        { x: -26, y: -20 }
      ];
      var wob = D.wobble(pts, p.seed, 0.8, 11);
      if (solid > 0.6) D.fillPath(ctx, wob, '#C9CBD1', 0.85);
      D.strokePath(ctx, wob, { color: color, width: w });
      if (solid > 0.6) D.hatch(ctx, -22, -18, 26, 9, { gap: 5, alpha: 0.28 });
    },

    bowlingball: function (ctx, p, color, w, solid) {
      var pts = D.circlePoints(0, 0, 21, p.seed, 0.8);
      if (solid > 0.6) D.fillPath(ctx, pts, '#3A3A46', 0.9);
      D.strokePath(ctx, pts, { color: color, width: w });
      ctx.save();
      ctx.fillStyle = P.paper;
      ctx.globalAlpha = solid;
      [[-6, -6], [1, -8], [-2, 0]].forEach(function (h) {
        ctx.beginPath();
        ctx.arc(h[0], h[1], 2.8, 0, 6.29);
        ctx.fill();
      });
      ctx.restore();
    },

    piano: function (ctx, p, color, w, solid) {
      var pts = D.rectPoints(-44, -33, 88, 66, p.seed, 1);
      if (solid > 0.6) D.fillPath(ctx, pts, '#33333C', 0.9);
      D.strokePath(ctx, pts, { color: color, width: w });
      /* Lid and a run of keys. */
      D.line(ctx, -44, -14, 44, -20, { color: color, width: w * 0.8, seed: p.seed + 5, amp: 1 });
      ctx.save();
      ctx.globalAlpha = solid;
      ctx.fillStyle = P.paper;
      ctx.fillRect(-38, 6, 76, 20);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-38, 6, 76, 20);
      for (var i = 1; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(-38 + i * 7.6, 6);
        ctx.lineTo(-38 + i * 7.6, 26);
        ctx.stroke();
      }
      ctx.restore();
    },

    trampoline: function (ctx, p, color, w, solid) {
      var sag = Math.min(14, p.squish * 22);
      var mat = D.wobble(
        [
          { x: -54, y: 0 },
          { x: 0, y: sag },
          { x: 54, y: 0 }
        ],
        p.seed,
        0.8,
        8
      );
      if (solid > 0.6) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = P.marker;
        ctx.beginPath();
        ctx.moveTo(-54, 0);
        ctx.quadraticCurveTo(0, sag * 2, 54, 0);
        ctx.lineTo(54, 7);
        ctx.quadraticCurveTo(0, sag * 2 + 7, -54, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      D.strokePath(ctx, mat, { color: color, width: w + 1 });
      D.line(ctx, -50, 2, -60, 26, { color: color, width: w, seed: p.seed + 4, amp: 0.7 });
      D.line(ctx, 50, 2, 60, 26, { color: color, width: w, seed: p.seed + 8, amp: 0.7 });
      for (var i = -4; i <= 4; i++) {
        D.line(ctx, i * 11, 0, i * 11, 6, { color: color, width: 1.2, seed: p.seed + i, amp: 0.3, spacing: 4 });
      }
    },

    gustfan: function (ctx, p, color, w, solid) {
      var dir = p.dir || 1;
      var pts = D.circlePoints(0, 0, 22, p.seed, 0.9);
      if (solid > 0.6) D.fillPath(ctx, pts, P.paper, 0.9);
      D.strokePath(ctx, pts, { color: color, width: w });
      ctx.save();
      ctx.rotate(p.spin || 0);
      for (var i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        var blade = [
          { x: 0, y: 0 },
          { x: 15, y: -8 },
          { x: 18, y: 4 },
          { x: 0, y: 0 }
        ];
        if (solid > 0.6) D.fillPath(ctx, blade, P.pencil, 0.5);
        D.strokePath(ctx, blade, { color: color, width: 1.6 });
      }
      ctx.restore();
      D.line(ctx, -14 * dir, 22, 14 * dir, 22, { color: color, width: w, seed: p.seed + 2, amp: 0.5 });
      for (var k = 1; k <= 3; k++) {
        D.line(ctx, dir * (24 + k * 9), -10 + k * 3, dir * (32 + k * 11), -10 + k * 3, {
          color: P.pencil,
          width: 1.6,
          alpha: 0.5 + 0.3 * Math.sin(Bonk.state.time * 8 + k),
          seed: k * 12,
          amp: 0.8
        });
      }
    }
  };

  /* ---- what a click does for each tool -------------------------------- */
  var Tools = {
    all: TOOLS,
    skins: SKINS,
    order: ORDER,

    ownedOrder: function () {
      return ORDER.filter(function (id) {
        return Bonk.owns(id);
      });
    },

    /* Returns true if the click was consumed (so the hand does not also grab). */
    use: function (id, x, y) {
      var room = Bonk.room;
      switch (id) {
        case 'hand':
        case 'feather':
          return false;

        case 'beachball':
          Props.spawn('beachball', x, y, { x: Bonk.rand(-2, 2), y: 0 });
          Bonk.Sound.pop(0.9);
          return true;

        case 'cookie': {
          var head = Bonk.Buddy.parts.head.position;
          var dir = head.x > x ? 1 : -1;
          Props.spawn('cookie', x, y, { x: dir * Bonk.rand(3, 6), y: -4 });
          Bonk.Sound.whoosh();
          return true;
        }

        case 'waterballoon':
          Props.spawn('waterballoon', x, y, { x: 0, y: 3 });
          Bonk.Sound.whoosh();
          return true;

        /* Thrown down rather than merely dropped, so the landing has the same
           weight in a short window as in a tall one. */
        case 'anvil':
          Props.spawn('anvil', x, room.top + 40, { x: 0, y: 12 });
          Bonk.Sound.whoosh();
          return true;

        case 'piano':
          Props.spawn('piano', x, room.top + 55, { x: 0, y: 13 });
          Bonk.Sound.whoosh();
          Bonk.Particles.note(x, room.top + 70);
          return true;

        case 'bowlingball': {
          var fromLeft = x < (room.left + room.right) / 2;
          var p = Props.spawn('bowlingball', fromLeft ? room.left + 40 : room.right - 40, room.bottom - 30, {
            x: fromLeft ? 11 : -11,
            y: 0
          });
          if (p) window.Matter.Body.setAngularVelocity(p.body, fromLeft ? 0.35 : -0.35);
          Bonk.Sound.whoosh();
          return true;
        }

        case 'trampoline': {
          var tp = Props.spawn('trampoline', x, Math.min(y, room.bottom - 30));
          if (tp) Bonk.Sound.boing(0.5);
          return true;
        }

        case 'gustfan': {
          var fp = Props.spawn('gustfan', x, Math.min(y, room.bottom - 34));
          if (fp) {
            fp.dir = Bonk.Buddy.center().x >= x ? 1 : -1;
            fp.spin = 0;
            Bonk.Sound.whoosh();
          }
          return true;
        }

        case 'confetti': {
          var c = Bonk.Buddy.center();
          Bonk.Particles.confetti(c.x, c.y - 30, 80);
          Bonk.Buddy.party();
          Bonk.Sound.party();
          Bonk.pay(20, c);
          return true;
        }

        case 'gravityflip':
          Bonk.flipGravity();
          return true;
      }
      return false;
    },

    /* The marker-red button: pick something he owns and let it happen. */
    shipBug: function () {
      var room = Bonk.room;
      var owned = this.ownedOrder().filter(function (id) {
        return id !== 'hand' && id !== 'feather';
      });
      var pick = Bonk.pick(owned.length ? owned : ['beachball']);
      var c = Bonk.Buddy.center();
      var x = Bonk.clamp(c.x + Bonk.rand(-40, 40), room.left + 60, room.right - 60);
      Bonk.Buddy.say(Bonk.pick(['uh oh', 'that was me.', 'rolling back...', 'my bad', "you're absolutely right."]), 2);
      this.use(pick, x, room.top + 90);
      Bonk.pay(25, c);
      return pick;
    }
  };

  Bonk.Props = Props;
  Bonk.PropDefs = PROPS;
  Bonk.Tools = Tools;
})();
