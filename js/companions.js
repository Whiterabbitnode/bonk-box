/* Bonk Box - the things that keep him company, and the things he rides.

   Three small modules that all hang off the same idea: the buddy is the star,
   and everything here orbits him.

     Ride   - the bottle rocket he takes for a lap of the room
     Friend - a tiny second stickman, the most expensive thing in the shop
     Gift   - the daily hand-over, where he pays YOU for coming back
*/
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});

  /* ---- the bottle rocket ride ------------------------------------------ */
  var Ride = {
    t: 0,
    active: false,
    rocket: null,

    begin: function () {
      if (this.active) return;
      var B = Bonk.Buddy;
      this.active = true;
      this.t = 0;
      B.goRagdoll(6);
      B.say(Bonk.pick(['WHEEEE', 'hold on', 'I regret nothing']), 3);
      Bonk.addMood(0.4);
      Bonk.Sound.whoosh();
      Bonk.pay(60, B.center());
    },

    end: function (at) {
      this.active = false;
      Bonk.Particles.confetti(at.x, at.y, 70);
      Bonk.Particles.star(at.x, at.y, 18);
      Bonk.Particles.burstText(at.x, at.y - 40, 'TA-DA', 40);
      Bonk.Sound.party();
      Bonk.Buddy.cheer = 3;
      Bonk.addMood(0.3);
      Bonk.pay(120, at);
      Bonk.Buddy.say(Bonk.pick(['again!', 'we ride.', 'best purchase']), 2.6);
    },

    update: function (dt) {
      if (!this.active) return;
      var M = window.Matter;
      var B = Bonk.Buddy;
      var R = Bonk.room;
      this.t += dt;

      /* A lap of the room: a wide loop that eases out into the finale. */
      var dur = 4.6;
      var f = this.t / dur;
      if (f >= 1) {
        this.end(B.center());
        return;
      }

      var cx = (R.left + R.right) / 2;
      var cy = (R.top + R.bottom) / 2;
      var rx = (R.right - R.left) * 0.34;
      var ry = (R.bottom - R.top) * 0.3;
      var a = -Math.PI / 2 + f * Math.PI * 2.2;
      var tx = cx + Math.cos(a) * rx;
      var ty = cy + Math.sin(a) * ry;

      /* Fly the chest along the path and let the rest of him trail. */
      var chest = B.parts.chest;
      var ex = tx - chest.position.x;
      var ey = ty - chest.position.y;
      M.Body.applyForce(chest, chest.position, {
        x: (ex * 0.00035 - chest.velocity.x * 0.0016) * chest.mass,
        y: (ey * 0.00035 - chest.velocity.y * 0.0016) * chest.mass - chest.mass * 0.001
      });
      /* Cancel gravity on the rest of him so he streams behind rather than
         being dragged into the floor. */
      for (var i = 0; i < B.bodies.length; i++) {
        var b = B.bodies[i];
        if (b === chest) continue;
        M.Body.applyForce(b, b.position, { x: 0, y: -b.mass * 0.0009 });
      }

      Bonk.Particles.sparkle(chest.position.x, chest.position.y + 18, 2);
      if (Math.random() < dt * 8) Bonk.Particles.star(chest.position.x, chest.position.y + 22, 1);
      if (Math.random() < dt * 2.5) B.say(Bonk.pick(['wheee', 'WOO', 'look at me']), 1);
    },

    draw: function (ctx) {
      if (!this.active) return;
      var B = Bonk.Buddy;
      var D = Bonk.Doodle;
      var P = Bonk.PALETTE;
      var c = B.parts.pelvis;
      ctx.save();
      ctx.translate(c.position.x, c.position.y + 14);
      ctx.rotate(Math.atan2(c.velocity.y, c.velocity.x) + Math.PI / 2);
      var body = D.rectPoints(-7, -18, 14, 34, 5, 0.8);
      D.fillPath(ctx, body, P.marker, 0.75);
      D.strokePath(ctx, body, { color: P.ink, width: 2.2 });
      D.strokePath(ctx, [{ x: -7, y: -18 }, { x: 0, y: -30 }, { x: 7, y: -18 }], { color: P.ink, width: 2.2 });
      ctx.restore();
    }
  };

  /* ---- the tiny friend --------------------------------------------------
     Deliberately not a second ragdoll: one small body that hops along after
     him, drawn as a little stickman. Two poses and a high five is plenty. */
  var Friend = {
    body: null,
    mood: 1,
    hopPhase: 0,
    highFive: 0,
    sad: 0,
    facing: 1,

    exists: function () {
      return !!this.body;
    },

    spawn: function (world, x, y) {
      if (this.body) return;
      var M = window.Matter;
      this.body = M.Bodies.circle(x, y, 13, {
        restitution: 0.4,
        friction: 0.6,
        frictionAir: 0.03,
        density: 0.0009,
        label: 'friend'
      });
      this.body.isFriend = true;
      M.Composite.add(world, this.body);
      Bonk.Buddy.say(Bonk.pick(['a FRIEND', 'hello you', 'oh! hi.']), 3);
      Bonk.Buddy.cheer = 3;
      Bonk.addMood(0.5);
      Bonk.Particles.hearts(x, y - 20, 6);
      Bonk.Sound.party();
    },

    remove: function (world) {
      if (!this.body) return;
      window.Matter.Composite.remove(world, this.body);
      this.body = null;
    },

    bonked: function () {
      this.sad = 3.2;
      Bonk.addMood(-0.25);
      Bonk.Buddy.say(Bonk.pick(['hey! not them.', 'leave them.', 'rude.']), 2.4);
    },

    update: function (dt) {
      if (!this.body) return;
      var M = window.Matter;
      var B = Bonk.Buddy;
      var b = this.body;
      this.sad = Math.max(0, this.sad - dt);
      this.highFive = Math.max(0, this.highFive - dt);

      /* Trail him at a polite distance, hopping. */
      var target = B.center().x - B.facing * 52;
      var dx = target - b.position.x;
      this.facing = dx > 0 ? 1 : -1;
      if (Math.abs(dx) > 24) {
        this.hopPhase += dt * 9;
        M.Body.applyForce(b, b.position, { x: Math.sign(dx) * 0.00028 * b.mass, y: 0 });
        /* A little hop when he is on the ground. */
        if (b.position.y > Bonk.room.bottom - 26 && Math.sin(this.hopPhase) > 0.94) {
          M.Body.setVelocity(b, { x: b.velocity.x, y: -4.6 });
        }
      }

      /* Close enough, both happy, and not too often: high five. */
      if (Math.abs(dx) < 40 && this.highFive <= 0 && this.sad <= 0 && Bonk.state.mood > 0.6 && B.phase === 'stand' && Math.random() < dt * 0.4) {
        this.highFive = 1.1;
        Bonk.Particles.star(b.position.x, b.position.y - 22, 3);
        Bonk.Sound.pop(1.5);
        Bonk.addMood(0.06);
        Bonk.pay(6, b.position);
      }

      /* Lend a hand at the fort: nudge loose sticks toward the build site. */
      if (Bonk.Fort && Bonk.Fort.state === 'fetching' && Bonk.Fort.base) {
        var sticks = Bonk.Fort.looseSticks();
        if (sticks.length) {
          var s = sticks[0].body;
          if (Math.hypot(s.position.x - b.position.x, s.position.y - b.position.y) < 70) {
            M.Body.applyForce(s, s.position, { x: Math.sign(Bonk.Fort.base.x - s.position.x) * 0.00016 * s.mass, y: 0 });
          }
        }
      }
    },

    draw: function (ctx) {
      if (!this.body) return;
      var D = Bonk.Doodle;
      var P = Bonk.PALETTE;
      var b = this.body;
      var ink = (Bonk.INKS[Bonk.state.save.ink] || Bonk.INKS.graphite).color;
      var x = b.position.x;
      var y = b.position.y;
      var f = this.facing;
      var up = this.highFive > 0 ? 1 : 0;
      var droop = this.sad > 0 ? 1 : 0;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(b.angle * 0.25);
      var r = 8;
      var head = D.circlePoints(0, -8, r, 3, 0.8);
      D.fillPath(ctx, head, P.paper, 0.95);
      D.strokePath(ctx, head, { color: ink, width: 2.6 });
      /* body, arms, legs */
      D.line(ctx, 0, -1, 0, 12, { color: ink, width: 2.6, seed: 9, amp: 0.4, spacing: 5 });
      D.line(ctx, 0, 2, -8 * f, up ? -9 : droop ? 9 : 6, { color: ink, width: 2.4, seed: 13, amp: 0.4, spacing: 5 });
      D.line(ctx, 0, 2, 8 * f, droop ? 9 : 7, { color: ink, width: 2.4, seed: 17, amp: 0.4, spacing: 5 });
      D.line(ctx, 0, 12, -6, 22, { color: ink, width: 2.4, seed: 21, amp: 0.4, spacing: 5 });
      D.line(ctx, 0, 12, 6, 22, { color: ink, width: 2.4, seed: 25, amp: 0.4, spacing: 5 });
      /* eyes and a mouth that knows how it feels */
      ctx.fillStyle = ink;
      [-3, 3].forEach(function (ex) {
        ctx.beginPath();
        ctx.arc(ex + f * 1.2, -9, 1.4, 0, 6.29);
        ctx.fill();
      });
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      var curve = droop ? -2.2 : 2.2;
      ctx.moveTo(-3, -4.5);
      ctx.quadraticCurveTo(0, -4.5 + curve, 3, -4.5);
      ctx.stroke();
      ctx.restore();
    }
  };

  /* ---- the daily gift ---------------------------------------------------
     He walks over and hands you a little sack of coins. The buddy you spend
     all day bonking pays your allowance. */
  var Gift = {
    pending: null,
    state: 'none', // none | walking | offering | done
    t: 0,

    offer: function (gift) {
      if (!gift) return;
      this.pending = gift;
      this.state = 'walking';
      this.t = 0;
    },

    update: function (dt) {
      if (this.state === 'none' || this.state === 'done') return;
      var B = Bonk.Buddy;
      this.t += dt;

      /* Give up gracefully if he is busy being flung about. */
      if (B.phase !== 'stand') {
        if (this.t > 14) this.finish();
        return;
      }

      if (this.state === 'walking') {
        var target = Bonk.clamp(Bonk.state.pointer.inside ? Bonk.state.pointer.x : (Bonk.room.left + Bonk.room.right) / 2, Bonk.room.left + 90, Bonk.room.right - 90);
        if (Math.abs(B.center().x - target) > 70 && this.t < 6) {
          if (Bonk.Fort) Bonk.Fort.walk(dt, target);
        } else {
          this.state = 'offering';
          this.t = 0;
          B.say('for you.', 2.6);
          B.idle = { name: 'wave', t: 0, dur: 2.4 };
        }
        return;
      }

      if (this.state === 'offering') {
        if (this.t > 0.9 && !this.paid) {
          this.paid = true;
          var g = this.pending;
          Bonk.pay(g.coins, { x: B.center().x, y: B.center().y - 30 });
          Bonk.Particles.star(B.center().x, B.center().y - 30, 6);
          Bonk.Particles.hearts(B.center().x, B.center().y - 40, 3);
          Bonk.Sound.party();
          if (g.unlocked && g.unlocked.length) {
            Bonk.Particles.burstText(B.center().x, B.center().y - 74, 'DAY ' + g.day, 30);
          }
          if (Bonk.UI) {
            Bonk.UI.renderTray();
            Bonk.UI.update(0, true);
          }
        }
        if (this.t > 2.6) {
          var g2 = this.pending;
          if (g2.unlocked && g2.unlocked.length) {
            B.say(g2.unlocked[0].label + '!', 3);
          } else {
            B.say(Bonk.pick(['come back tomorrow.', 'same time tomorrow?', 'tomorrow, then.']), 3);
          }
          this.finish();
        }
      }
    },

    finish: function () {
      this.state = 'done';
      this.pending = null;
      this.paid = false;
    },

    /* The little sack, held up while he offers it. */
    draw: function (ctx) {
      if (this.state !== 'offering') return;
      var B = Bonk.Buddy;
      var D = Bonk.Doodle;
      var P = Bonk.PALETTE;
      var hand = B.handPoint(B.facing > 0 ? 'R' : 'L');
      var fade = Math.min(1, this.t * 3, Math.max(0, (2.6 - this.t) * 2));
      ctx.save();
      ctx.globalAlpha = fade;
      var pts = [
        { x: hand.x - 12, y: hand.y + 4 },
        { x: hand.x - 8, y: hand.y + 22 },
        { x: hand.x + 8, y: hand.y + 22 },
        { x: hand.x + 12, y: hand.y + 4 },
        { x: hand.x - 12, y: hand.y + 4 }
      ];
      D.fillPath(ctx, pts, P.highlighter, 0.75);
      D.strokePath(ctx, D.wobble(pts, 31, 0.7, 7), { color: P.ink, width: 2.2 });
      D.line(ctx, hand.x - 12, hand.y + 4, hand.x + 12, hand.y + 4, { color: P.ink, width: 2, seed: 41, amp: 0.5, spacing: 5 });
      D.text(ctx, '$', hand.x, hand.y + 14, { size: 14, color: P.ink });
      ctx.restore();
    }
  };

  /* ---- the little sun ---------------------------------------------------
     Thirty days of coming back buys a sun. It rises, and he lies under it. */
  var Sun = {
    draw: function (ctx) {
      if (!Bonk.state.sunUp) return;
      var D = Bonk.Doodle;
      var P = Bonk.PALETTE;
      var R = Bonk.room;
      var x = R.right - 90;
      var y = R.top + 74;
      var t = Bonk.state.time;
      ctx.save();
      ctx.globalAlpha = 0.9;
      for (var i = 0; i < 10; i++) {
        var a = (i / 10) * Math.PI * 2 + t * 0.15;
        D.line(ctx, x + Math.cos(a) * 30, y + Math.sin(a) * 30, x + Math.cos(a) * (42 + Math.sin(t * 2 + i) * 3), y + Math.sin(a) * (42 + Math.sin(t * 2 + i) * 3), {
          color: P.highlighter,
          width: 3,
          seed: i * 7,
          amp: 0.6,
          spacing: 6
        });
      }
      var disc = D.circlePoints(x, y, 26, 5, 1.1);
      D.fillPath(ctx, disc, P.highlighter, 0.85);
      D.strokePath(ctx, disc, { color: P.ink, width: 2.6 });
      ctx.restore();
    }
  };

  Bonk.Ride = Ride;
  Bonk.Friend = Friend;
  Bonk.Gift = Gift;
  Bonk.Sun = Sun;
})();
