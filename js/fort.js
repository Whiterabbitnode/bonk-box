/* Bonk Box - the fort.

   Leave sticks lying about and, when he is in a decent mood and nothing else
   is happening, he walks over, picks one up, carries it back and builds
   himself a little lean-to. Then he stands back, proud, and draws a flag on it.

   Knock it down and he minds. That tension is the whole point: wrecking it
   still pays, because wrecking things is the game, but it costs mood and he
   lets you know about it. After a sulk he grumbles and starts again. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});

  /* A lean-to, built from the floor up: two planks flat on the ground, one
     laid across them, then two more leaned together into a roof.

     Note a plank is 70 long by 10 thick, so angle 0 is FLAT, not upright.
     Getting that backwards puts the roof pieces in mid-air where they fall
     over the moment they are let go and he thinks you wrecked it. */
  var SLOTS = [
    { dx: -30, dy: -5, angle: 0 },
    { dx: 30, dy: -5, angle: 0 },
    { dx: 0, dy: -15, angle: 0 },
    { dx: -33, dy: -28, angle: -0.876 },
    { dx: 33, dy: -28, angle: 0.876 }
  ];

  var PROTEST = ['I WORKED HARD ON THAT', 'seriously?!', 'that took AGES', 'unbelievable.'];

  var Fort = {
    state: 'idle', // idle | fetching | carrying | placing | admiring | done | upset | sulking
    pieces: [], // placed sticks, in slot order
    carried: null,
    base: null,
    timer: 0,
    cooldown: 0,
    upsetTimer: 0,
    stomp: 0,
    cloud: 0,
    flag: 0, // 0..1, how much of the flag is drawn
    settled: false,
    walkTarget: null,

    reset: function () {
      this.state = 'idle';
      this.pieces.length = 0;
      this.carried = null;
      this.base = null;
      this.flag = 0;
      this.settled = false;
      this.cloud = 0;
      this.stomp = 0;
      this.walkTarget = null;
      this.cooldown = 0;
    },

    /* Loose sticks on the floor that are not already part of the fort. */
    looseSticks: function () {
      var mine = this.pieces;
      var carried = this.carried;
      return Bonk.Props.list.filter(function (p) {
        return p.kind === 'stick' && !p.erasing && !p.placed && p !== carried && mine.indexOf(p) === -1;
      });
    },

    /* He will only start building when he is settled and reasonably cheerful. */
    canStart: function () {
      var B = Bonk.Buddy;
      return (
        this.state === 'idle' &&
        this.cooldown <= 0 &&
        B.phase === 'stand' &&
        B.strength > 0.9 &&
        Bonk.state.mood > 0.42 &&
        this.looseSticks().length > 0
      );
    },

    baseFor: function () {
      var B = Bonk.Buddy;
      var room = Bonk.room;
      var x = Bonk.clamp(B.center().x + B.facing * 90, room.left + 110, room.right - 110);
      return { x: x, y: room.bottom };
    },

    slotPoint: function (i) {
      var s = SLOTS[i];
      return { x: this.base.x + s.dx, y: this.base.y + s.dy, angle: s.angle };
    },

    update: function (dt) {
      var M = window.Matter;
      var B = Bonk.Buddy;
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.stomp = Math.max(0, this.stomp - dt);
      this.cloud = Math.max(0, this.cloud - dt);

      /* Being flung interrupts everything except the sulk. */
      if (B.phase !== 'stand' && this.state !== 'idle' && this.state !== 'done' && this.state !== 'sulking') {
        this.dropCarried();
        this.state = this.pieces.length ? 'done' : 'idle';
      }

      if (this.pieces.length) {
        this.settleCheck();
        this.checkStanding();
        this.restIfSettled();
      }

      switch (this.state) {
        case 'idle':
          if (this.canStart()) {
            this.base = this.baseFor();
            this.state = 'fetching';
            B.say(Bonk.pick(['a project.', 'right then.', 'building.']), 1.8);
          }
          break;

        case 'fetching': {
          var sticks = this.looseSticks();
          if (!sticks.length || this.pieces.length >= SLOTS.length) {
            this.finish();
            break;
          }
          /* Nearest loose stick. */
          var me = B.center();
          var best = null;
          var bestD = 1e9;
          for (var i = 0; i < sticks.length; i++) {
            var d = Math.abs(sticks[i].body.position.x - me.x);
            if (d < bestD) {
              bestD = d;
              best = sticks[i];
            }
          }
          this.walkTarget = best.body.position.x;
          if (bestD < 46) {
            this.carried = best;
            best.body.collisionFilter.mask = 0;
            this.state = 'carrying';
          }
          break;
        }

        case 'carrying': {
          if (!this.carried || this.carried.erasing) {
            this.carried = null;
            this.state = 'fetching';
            break;
          }
          var slot = this.slotPoint(this.pieces.length);
          this.walkTarget = slot.x - B.facing * 26;
          /* Hold it out in front of him while he walks. */
          var hand = B.handPoint(B.facing > 0 ? 'R' : 'L');
          M.Body.setPosition(this.carried.body, { x: hand.x + B.facing * 12, y: hand.y - 4 });
          M.Body.setAngle(this.carried.body, -0.25 * B.facing);
          M.Body.setVelocity(this.carried.body, { x: 0, y: 0 });
          M.Body.setAngularVelocity(this.carried.body, 0);

          if (Math.abs(B.center().x - slot.x) < 62) {
            this.place(slot);
          }
          break;
        }

        case 'placing':
          this.timer -= dt;
          if (this.timer <= 0) this.state = this.pieces.length >= SLOTS.length ? 'admiring' : 'fetching';
          break;

        case 'admiring':
          this.timer -= dt;
          this.walkTarget = null;
          this.flag = Math.min(1, this.flag + dt * 0.9);
          if (this.timer <= 0) this.finish();
          break;

        case 'done':
          this.walkTarget = null;
          break;

        case 'upset':
          this.upsetTimer -= dt;
          this.walkTarget = null;
          if (this.upsetTimer <= 0) {
            this.state = 'sulking';
            this.upsetTimer = 3.4;
          }
          break;

        case 'sulking':
          this.upsetTimer -= dt;
          if (this.upsetTimer <= 0) {
            B.say('fine. rebuilding.', 2.4);
            this.pieces.length = 0;
            this.flag = 0;
            this.settled = false;
            this.state = 'idle';
            this.cooldown = 1.2;
          }
          break;
      }

      /* Walk toward whatever he is currently after. */
      if (this.walkTarget != null && B.phase === 'stand') {
        this.walk(dt, this.walkTarget);
      }
    },

    /* Lean into a direction and swing the legs. Not a gait solver - just
       enough weight shift that he reads as walking rather than sliding. */
    walk: function (dt, targetX) {
      var M = window.Matter;
      var B = Bonk.Buddy;
      var dx = targetX - B.center().x;
      if (Math.abs(dx) < 14) return;
      var dir = dx > 0 ? 1 : -1;
      B.walkDir = dir;
      B.walking = 0.12;
      B.walkPhase = (B.walkPhase || 0) + dt * 7.5;
      M.Body.applyForce(B.parts.chest, B.parts.chest.position, { x: dir * 0.00023 * B.parts.chest.mass, y: 0 });
      M.Body.applyForce(B.parts.pelvis, B.parts.pelvis.position, { x: dir * 0.00017 * B.parts.pelvis.mass, y: 0 });
    },

    place: function (slot) {
      var M = window.Matter;
      var piece = this.carried;
      this.carried = null;
      if (!piece || piece.erasing) {
        this.state = 'fetching';
        return;
      }
      M.Body.setPosition(piece.body, { x: slot.x, y: slot.y });
      M.Body.setAngle(piece.body, slot.angle);
      M.Body.setVelocity(piece.body, { x: 0, y: 0 });
      M.Body.setAngularVelocity(piece.body, 0);
      piece.body.collisionFilter.mask = 0xffffffff;
      piece.placed = true;
      piece.slot = { x: slot.x, y: slot.y, angle: slot.angle };
      this.pieces.push(piece);
      this.lastPlacedAt = Bonk.state.time;

      Bonk.Particles.dust(slot.x, slot.y, 3, 0.5);
      Bonk.Sound.thud(0.3);
      this.state = 'placing';
      this.timer = 0.35;

      if (this.pieces.length >= SLOTS.length) {
        this.state = 'admiring';
        this.timer = 2.6;
        Bonk.Buddy.say('my fort.', 2.6);
        Bonk.Buddy.cheer = 2;
        Bonk.addMood(0.22);
        Bonk.pay(18, { x: slot.x, y: slot.y });
      }
    },

    finish: function () {
      this.state = this.pieces.length ? 'done' : 'idle';
      this.cooldown = 4;
      this.walkTarget = null;
      if (this.pieces.length >= SLOTS.length) this.flag = 1;
    },

    /* A finished fort just sits there, so let it sleep rather than solving it
       every step. Anything touching it wakes it again. */
    restIfSettled: function () {
      var M = window.Matter;
      if (this.state !== 'done' || !this.settled) return;
      for (var i = 0; i < this.pieces.length; i++) {
        var b = this.pieces[i].body;
        if (!b.isSleeping && b.speed < 0.12 && Math.abs(b.angularVelocity) < 0.01) M.Sleeping.set(b, true);
      }
    },

    wake: function (body) {
      if (body && body.isSleeping) window.Matter.Sleeping.set(body, false);
    },

    dropCarried: function () {
      if (!this.carried) return;
      this.carried.body.collisionFilter.mask = 0xffffffff;
      this.carried = null;
    },

    /* Once the finished fort stops moving, remember where every piece actually
       came to rest. Judging against the ideal slot instead would call his own
       settling a wrecking - planks shift and lean a little as they stack. */
    settleCheck: function () {
      if (this.settled || this.state !== 'done' || this.pieces.length < SLOTS.length) return;
      if (Bonk.state.time - (this.lastPlacedAt || 0) < 1.2) return;
      for (var i = 0; i < this.pieces.length; i++) {
        var b = this.pieces[i].body;
        if (b.speed > 0.35 || Math.abs(b.angularVelocity) > 0.03) return;
      }
      this.restTop = 1e9;
      for (var j = 0; j < this.pieces.length; j++) {
        var pb = this.pieces[j].body;
        this.pieces[j].rest = { x: pb.position.x, y: pb.position.y, angle: pb.angle };
        this.restTop = Math.min(this.restTop, pb.bounds.min.y);
      }
      this.settled = true;
    },

    /* Has his fort been knocked about? */
    checkStanding: function () {
      if (!this.settled || this.state === 'upset' || this.state === 'sulking') return;
      var wrecked = 0;
      for (var i = 0; i < this.pieces.length; i++) {
        var p = this.pieces[i];
        if (p.erasing || !p.rest) {
          wrecked++;
          continue;
        }
        var b = p.body;
        var moved = Math.hypot(b.position.x - p.rest.x, b.position.y - p.rest.y);
        var turned = Math.abs(Bonk.angleDelta(p.rest.angle, b.angle));
        if (moved > 26 || turned > 0.5) wrecked++;
      }
      /* The clearest sign a fort has been wrecked is that it got shorter.
         Counting displaced planks alone misses a shove that flattens the
         structure without throwing any single piece very far. */
      var top = 1e9;
      for (var k = 0; k < this.pieces.length; k++) top = Math.min(top, this.pieces[k].body.bounds.min.y);
      var collapsed = top > this.restTop + 20;

      if (wrecked >= 2 || collapsed) this.knockedDown();
    },

    knockedDown: function () {
      var B = Bonk.Buddy;
      this.state = 'upset';
      this.upsetTimer = 3.6;
      this.stomp = 3.6;
      this.cloud = 6.5;
      this.flag = 0;
      this.dropCarried();
      this.settled = false;
      for (var i = 0; i < this.pieces.length; i++) {
        this.pieces[i].placed = false;
        this.pieces[i].rest = null;
      }
      Bonk.addMood(-0.55);
      B.sign = { text: Bonk.pick(PROTEST), t: 0, dur: 3.2 };
      B.say(Bonk.pick(['NO', 'my FORT.', 'seriously?!']), 2.2);
      B.idle = { name: 'protest', t: 0, dur: 3.4 };
      Bonk.Sound.thud(1);
      /* Wrecking it still pays. That is the game. It just costs him. */
      Bonk.pay(26, B.center());
    },

    /* ---- drawing ------------------------------------------------------- */
    draw: function (ctx) {
      var D = Bonk.Doodle;
      var P = Bonk.PALETTE;

      /* Flag on the finished fort. */
      if (this.flag > 0.02 && this.pieces.length >= SLOTS.length && this.base) {
        var top = { x: this.base.x, y: this.base.y - 58 };
        var poleTop = top.y - 34;
        D.line(ctx, top.x, top.y, top.x, poleTop, { color: P.ink, width: 2.4, seed: 7, amp: 0.5 });
        var f = Bonk.clamp(this.flag, 0, 1);
        var pts = [
          { x: top.x, y: poleTop + 2 },
          { x: top.x + 26 * f, y: poleTop + 8 },
          { x: top.x, y: poleTop + 16 }
        ];
        D.fillPath(ctx, pts, P.marker, 0.75 * f);
        D.strokePath(ctx, pts, { color: P.ink, width: 1.8, alpha: f });
      }

    },

    /* Drawn after the buddy so it sits over his head rather than behind it. */
    drawOver: function (ctx) {
      var D = Bonk.Doodle;
      var P = Bonk.PALETTE;
      if (this.cloud > 0.02) {
        var B = Bonk.Buddy;
        var h = B.parts.head.position;
        var cy = h.y - 52;
        var fade = Math.min(1, this.cloud) * 0.85;
        ctx.save();
        ctx.globalAlpha = fade;
        for (var k = 0; k < 5; k++) {
          var a = k * 1.3 + Bonk.state.time * 0.6;
          D.circle(ctx, h.x + Math.cos(a) * 17, cy + Math.sin(a) * 5, 13, { color: P.pencil, width: 2.2, seed: 40 + k * 13, amp: 2.4 });
        }
        /* A little scribbled flash under it. */
        D.strokePath(
          ctx,
          [
            { x: h.x + 4, y: cy + 12 },
            { x: h.x - 4, y: cy + 22 },
            { x: h.x + 3, y: cy + 22 },
            { x: h.x - 5, y: cy + 33 }
          ],
          { color: P.highlighter, width: 2.6, alpha: fade }
        );
        ctx.restore();
      }
    }
  };

  Bonk.Fort = Fort;
  Bonk.Fort.SLOTS = SLOTS;
})();
