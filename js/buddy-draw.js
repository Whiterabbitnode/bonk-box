/* Bonk Box - drawing the buddy.
   He is a doodle, so nothing here is a sprite: every frame his limbs are struck
   as wobbly ink strokes over the physics bodies. The one piece worth reading
   closely is drawLimb(), which handles the smudge-and-redraw signature. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});
  var P = Bonk.PALETTE;

  function inkColor() {
    var ink = Bonk.INKS[Bonk.state.save.ink] || Bonk.INKS.graphite;
    return ink.color;
  }

  /* World-space point lists for each drawable stroke. */
  function strokePoints(B, id) {
    var L = Bonk.Buddy.LAYOUT;
    var p = B.parts;
    switch (id) {
      case 'torso':
        return [
          B.localToWorld(p.chest, 0, -L.chest.h / 2),
          B.localToWorld(p.chest, 0, L.chest.h / 2),
          B.localToWorld(p.pelvis, 0, -L.pelvis.h / 2),
          B.localToWorld(p.pelvis, 0, L.pelvis.h / 2)
        ];
      case 'armL':
        return [
          B.localToWorld(p.upperArmL, 0, -L.upperArm.h / 2),
          B.localToWorld(p.upperArmL, 0, L.upperArm.h / 2),
          B.localToWorld(p.lowerArmL, 0, L.lowerArm.h / 2)
        ];
      case 'armR':
        return [
          B.localToWorld(p.upperArmR, 0, -L.upperArm.h / 2),
          B.localToWorld(p.upperArmR, 0, L.upperArm.h / 2),
          B.localToWorld(p.lowerArmR, 0, L.lowerArm.h / 2)
        ];
      case 'legL':
        return [
          B.localToWorld(p.upperLegL, 0, -L.upperLeg.h / 2),
          B.localToWorld(p.upperLegL, 0, L.upperLeg.h / 2),
          B.localToWorld(p.lowerLegL, 0, L.lowerLeg.h / 2)
        ];
      case 'legR':
        return [
          B.localToWorld(p.upperLegR, 0, -L.upperLeg.h / 2),
          B.localToWorld(p.upperLegR, 0, L.upperLeg.h / 2),
          B.localToWorld(p.lowerLegR, 0, L.lowerLeg.h / 2)
        ];
    }
    return [];
  }

  var SEEDS = { torso: 3, armL: 61, armR: 127, legL: 199, legR: 271 };

  /* THE SIGNATURE. A stroke carries an `ink` level. At 1 it is a normal inked
     limb. After a big ragdoll some limbs drop to a fraction: the inked part is
     drawn solid and the rest is left as a faint sketchy ghost. During the
     get-up the ink level animates back to 1, so the missing length redraws
     itself tip-to-tail with a pencil point riding the leading edge. */
  function drawLimb(ctx, B, id, width, color) {
    var st = B.strokes[id];
    var raw = strokePoints(B, id);
    if (raw.length < 2) return;
    var pts = Bonk.Doodle.wobble(raw, SEEDS[id], 1.15, 7);

    if (st.ink >= 1) {
      Bonk.Doodle.strokePath(ctx, pts, { color: color, width: width });
      return;
    }

    /* What is left of the limb while it is only a smudge: a loose, broken
       pencil line where the ink used to be. */
    var ghost = Bonk.Doodle.wobble(raw, SEEDS[id] + 400, 2.6, 6);
    Bonk.Doodle.strokePath(ctx, ghost, { color: P.pencil, width: width * 0.7, alpha: 0.32, dash: [4, 7] });

    var drawn = Bonk.Doodle.partial(pts, st.ink);
    if (drawn.length > 1) {
      Bonk.Doodle.strokePath(ctx, drawn, { color: color, width: width });
      if (st.drawing && st.delay <= 0) {
        /* Pencil point at the leading edge, plus a wisp of graphite. */
        var tip = drawn[drawn.length - 1];
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, width * 0.42, 0, 6.29);
        ctx.fill();
        ctx.restore();
        if (Math.random() < 0.5) Bonk.Particles.graphite(tip.x, tip.y);
      }
    }
  }

  function drawFace(ctx, B, r, color) {
    var st = Bonk.state;
    var mood = st.mood;
    var f = B.facing;
    var dizzy = B.dizzy > 0;
    var eyeY = -r * 0.16;
    var eyeX = r * 0.36;
    var bias = f * r * 0.1;

    if (dizzy) {
      /* Spiral eyes. He is fine, he is just seeing the page twice. */
      [-1, 1].forEach(function (side) {
        ctx.save();
        ctx.translate(bias + side * eyeX, eyeY);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        var spin = Bonk.state.time * 3.5;
        for (var a = 0; a < 12.5; a += 0.25) {
          var rad = (a / 12.5) * r * 0.32;
          var px = Math.cos(a + spin) * rad;
          var py = Math.sin(a + spin) * rad;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      });
    } else if (B.eating > 0 || (B.cheer > 0 && mood > 0.7)) {
      /* Happy closed-arc eyes. */
      [-1, 1].forEach(function (side) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(bias + side * eyeX, eyeY + r * 0.08, r * 0.19, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.restore();
      });
    } else {
      var lookX = B.look.x * r * 0.15;
      var lookY = B.look.y * r * 0.1;
      /* A grumpy buddy side-eyes you instead of looking straight on. */
      if (mood < 0.35) {
        lookX = f * r * 0.16;
        lookY = -r * 0.04;
      }
      [-1, 1].forEach(function (side) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(bias + side * eyeX + lookX, eyeY + lookY, r * 0.115, 0, 6.29);
        ctx.fill();
        ctx.restore();
      });
    }

    /* Eyebrows carry most of the mood. */
    var browY = eyeY - r * 0.42;
    var tilt = (0.5 - mood) * 0.9;
    [-1, 1].forEach(function (side) {
      var x0 = bias + side * eyeX - r * 0.19;
      var x1 = bias + side * eyeX + r * 0.19;
      var lift = side * tilt * r * 0.2;
      Bonk.Doodle.line(ctx, x0, browY - lift, x1, browY + lift, {
        color: color,
        width: 2.1,
        seed: side * 40,
        amp: 0.4,
        spacing: 5
      });
    });

    /* Mouth: a curve whose sign is the mood, opening up when startled. */
    var mouthY = r * 0.42;
    var curve = (mood - 0.5) * r * 0.62;
    var open = B.phase === 'ragdoll' ? 1 : 0;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.3;
    ctx.lineCap = 'round';
    if (open) {
      ctx.beginPath();
      ctx.ellipse(bias, mouthY, r * 0.2, r * 0.26, 0, 0, 6.29);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(bias - r * 0.3, mouthY - curve * 0.35);
      ctx.quadraticCurveTo(bias, mouthY + curve, bias + r * 0.3, mouthY - curve * 0.35);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Hair goes frazzled as the scuffs pile up, and tidies itself as they mend.
     Spike shapes come from the noise table, not Math.random, or every hair
     would twitch to a new shape sixty times a second. */
  function drawFrazzle(ctx, r, amount, color) {
    if (amount < 0.28) return;
    var n = 3 + Math.round(amount * 4);
    for (var i = 0; i < n; i++) {
      var a = -Math.PI * 0.85 + (i / (n - 1)) * Math.PI * 0.7;
      var len = r * (0.3 + (Bonk.Doodle.noise(i * 3.7) * 0.5 + 0.5) * 0.22 + amount * 0.3);
      var kink = Bonk.Doodle.noise(i * 5.1 + 40) * 0.5;
      Bonk.Doodle.strokePath(
        ctx,
        [
          { x: Math.cos(a) * r * 0.92, y: Math.sin(a) * r * 0.92 },
          { x: Math.cos(a + kink * 0.5) * (r + len * 0.6), y: Math.sin(a + kink * 0.5) * (r + len * 0.6) },
          { x: Math.cos(a - kink * 0.4) * (r + len), y: Math.sin(a - kink * 0.4) * (r + len) }
        ],
        { color: color, width: 1.7, alpha: 0.55 + amount * 0.45 }
      );
    }
  }

  function drawHat(ctx, hat, r, color) {
    if (!hat) return;
    var top = -r * 0.92;
    if (hat === 'party') {
      var pts = [
        { x: -r * 0.62, y: top + r * 0.12 },
        { x: 0, y: top - r * 1.25 },
        { x: r * 0.62, y: top + r * 0.12 },
        { x: -r * 0.62, y: top + r * 0.12 }
      ];
      Bonk.Doodle.fillPath(ctx, pts, P.highlighter, 0.9);
      Bonk.Doodle.strokePath(ctx, Bonk.Doodle.wobble(pts, 7, 0.9, 8), { color: color, width: 2.4 });
      Bonk.Doodle.line(ctx, -r * 0.4, top - r * 0.2, r * 0.34, top - r * 0.44, { color: P.marker, width: 2, seed: 31, amp: 0.5 });
      ctx.save();
      ctx.fillStyle = P.marker;
      ctx.beginPath();
      ctx.arc(0, top - r * 1.32, r * 0.19, 0, 6.29);
      ctx.fill();
      ctx.restore();
    } else if (hat === 'wizard') {
      var wp = [
        { x: -r * 0.78, y: top + r * 0.14 },
        { x: r * 0.16, y: top - r * 1.75 },
        { x: r * 0.7, y: top + r * 0.14 },
        { x: -r * 0.78, y: top + r * 0.14 }
      ];
      Bonk.Doodle.fillPath(ctx, wp, '#4A4A6A', 0.85);
      Bonk.Doodle.strokePath(ctx, Bonk.Doodle.wobble(wp, 13, 1, 8), { color: color, width: 2.4 });
      Bonk.Doodle.line(ctx, -r * 1.02, top + r * 0.16, r * 0.94, top + r * 0.16, { color: color, width: 2.6, seed: 55, amp: 0.7 });
      Bonk.Doodle.star(ctx, -r * 0.12, top - r * 0.62, r * 0.2, Bonk.state.time * 0.6, { fill: P.highlighter, color: color, width: 1.2 });
      Bonk.Doodle.star(ctx, r * 0.24, top - r * 1.12, r * 0.13, -Bonk.state.time * 0.5, { fill: P.highlighter, color: color, width: 1 });
    } else if (hat === 'crown') {
      /* Paper crown, for three days running. */
      var cp = [
        { x: -r * 0.9, y: top + r * 0.2 },
        { x: -r * 1.0, y: top - r * 0.85 },
        { x: -r * 0.42, y: top - r * 0.3 },
        { x: 0, y: top - r * 1.05 },
        { x: r * 0.42, y: top - r * 0.3 },
        { x: r * 1.0, y: top - r * 0.85 },
        { x: r * 0.9, y: top + r * 0.2 },
        { x: -r * 0.9, y: top + r * 0.2 }
      ];
      Bonk.Doodle.fillPath(ctx, cp, P.highlighter, 0.9);
      Bonk.Doodle.strokePath(ctx, Bonk.Doodle.wobble(cp, 19, 0.8, 8), { color: color, width: 2.4 });
      Bonk.Doodle.star(ctx, 0, top - r * 0.12, r * 0.17, Bonk.state.time * 0.4, { fill: P.marker, color: color, width: 1.1 });
    } else if (hat === 'hard') {
      ctx.save();
      ctx.fillStyle = P.highlighter;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(0, top + r * 0.2, r * 0.86, Math.PI, 0);
      ctx.fill();
      ctx.restore();
      var dome = [];
      for (var i = 0; i <= 14; i++) {
        var a = Math.PI + (i / 14) * Math.PI;
        dome.push({ x: Math.cos(a) * r * 0.86, y: top + r * 0.2 + Math.sin(a) * r * 0.86 });
      }
      Bonk.Doodle.strokePath(ctx, dome, { color: color, width: 2.5 });
      Bonk.Doodle.line(ctx, -r * 1.12, top + r * 0.22, r * 1.12, top + r * 0.22, { color: color, width: 2.8, seed: 77, amp: 0.6 });
      Bonk.Doodle.line(ctx, 0, top - r * 0.62, 0, top + r * 0.16, { color: color, width: 1.7, seed: 91, amp: 0.4 });
    }
  }

  function drawScuffMarks(ctx, B, color) {
    for (var i = 0; i < B.scuffMarks.length; i++) {
      var m = B.scuffMarks[i];
      var body = B.parts[m.part];
      if (!body) continue;
      var w = B.localToWorld(body, m.lx, m.ly);
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(body.angle + m.rot);
      if (m.kind === 'bandaid') {
        Bonk.Particles.drawBandaid(ctx, 0, 0, 0, 1);
      } else if (m.kind === 'cross') {
        Bonk.Doodle.line(ctx, -4, -4, 4, 4, { color: P.marker, width: 2, seed: i * 9, amp: 0.4, spacing: 4 });
        Bonk.Doodle.line(ctx, 4, -4, -4, 4, { color: P.marker, width: 2, seed: i * 9 + 3, amp: 0.4, spacing: 4 });
      } else if (m.kind === 'scribble') {
        Bonk.Doodle.strokePath(
          ctx,
          [
            { x: -6, y: 0 },
            { x: -2, y: -3.5 },
            { x: 2, y: 3 },
            { x: 6, y: -1 }
          ],
          { color: P.marker, width: 1.8, alpha: 0.85 }
        );
      } else {
        Bonk.Doodle.star(ctx, 0, 0, 4, 0, { color: P.highlighter, width: 1.6 });
      }
      ctx.restore();
    }
  }

  function drawStars(ctx, B) {
    var h = B.parts.head.position;
    for (var i = 0; i < B.stars.length; i++) {
      var s = B.stars[i];
      var x = h.x + Math.cos(s.a) * s.r;
      var y = h.y - 20 + Math.sin(s.a) * s.r * 0.42;
      Bonk.Doodle.star(ctx, x, y, s.size, s.a * 0.7, { fill: P.highlighter, color: P.ink, width: 1.3, alpha: 0.95 });
    }
  }

  /* A tiny protest placard, held up in whichever hand is raised. */
  function drawSign(ctx, B) {
    if (!B.sign) return;
    var hand = B.handPoint(B.facing > 0 ? 'R' : 'L');
    var fade = Math.min(1, (B.sign.dur - B.sign.t) * 3, B.sign.t * 4);
    var w = Math.max(58, Bonk.Doodle.measure(ctx, B.sign.text, 15) + 18);
    var h = 30;
    var x = hand.x - w / 2;
    var y = hand.y - 40;
    Bonk.Doodle.line(ctx, hand.x, hand.y, hand.x, y + h, { color: P.pencil, width: 3, seed: 5, amp: 0.5 });
    var pts = Bonk.Doodle.rectPoints(x, y, w, h, 17, 1.2);
    Bonk.Doodle.fillPath(ctx, pts, P.paper, 0.95 * fade);
    Bonk.Doodle.strokePath(ctx, pts, { color: P.ink, width: 2, alpha: fade });
    Bonk.Doodle.text(ctx, B.sign.text, x + w / 2, y + h / 2, { size: 15, color: P.marker, alpha: fade });
  }

  function drawDecals(ctx, B) {
    for (var i = 0; i < B.decals.length; i++) {
      var d = B.decals[i];
      var fade = Math.min(1, d.age * 2.5) * Math.min(1, (d.life - d.age) / 2);
      if (d.kind === 'heart') Bonk.Particles.drawHeart(ctx, d.x, d.y, d.r, fade * 0.75);
      else if (d.kind === 'scorch') {
        /* A smudge of pencil where the firework went off, rubbed out slowly. */
        ctx.save();
        ctx.globalAlpha = fade * 0.3;
        for (var k = 0; k < 4; k++) {
          Bonk.Doodle.circle(ctx, d.x, d.y, d.r * (0.45 + k * 0.18), { color: P.pencil, width: 2.6 - k * 0.4, seed: d.x + k * 31, amp: 3.2 });
        }
        ctx.restore();
      }
    }
  }

  Bonk.BuddyDraw = {
    /* Floor doodles live under everything else. */
    drawUnder: function (ctx) {
      drawDecals(ctx, Bonk.Buddy);
    },

    draw: function (ctx) {
      var B = Bonk.Buddy;
      var st = Bonk.state;
      var color = inkColor();
      var L = Bonk.Buddy.LAYOUT;
      var s = B.scale;
      var headR = L.head.r * s;

      ctx.save();

      /* Pancake squash from the anvil, applied to the whole figure about his
         feet so he flattens onto the floor instead of into the air. */
      if (B.flatten > 0.01) {
        var fl = B.footPoint('L');
        var fr = B.footPoint('R');
        var fx = (fl.x + fr.x) / 2;
        var fy = Math.max(fl.y, fr.y);
        /* Overshoot on the way back gives the boing. */
        var e = B.flatten;
        ctx.translate(fx, fy);
        ctx.scale(1 + e * 0.5, 1 - e * 0.62);
        ctx.translate(-fx, -fy);
      }

      var q = B.squash;
      if (q > 0.01) {
        var c = B.center();
        ctx.translate(c.x, c.y);
        ctx.scale(1 + q * 0.1, 1 - q * 0.1);
        ctx.translate(-c.x, -c.y);
      }

      var w = 4.4 * s * (1 + q * 0.25);
      drawLimb(ctx, B, 'legL', w, color);
      drawLimb(ctx, B, 'legR', w, color);
      drawLimb(ctx, B, 'armL', w * 0.92, color);
      drawLimb(ctx, B, 'torso', w * 1.06, color);
      drawLimb(ctx, B, 'armR', w * 0.92, color);

      /* Hands and feet: a dab of ink so the limbs read as ending, not cut. */
      ctx.save();
      ctx.fillStyle = color;
      [B.handPoint('L'), B.handPoint('R')].forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, w * 0.42, 0, 6.29);
        ctx.fill();
      });
      ctx.restore();

      /* Head, drawn in its own rotating frame. */
      var head = B.parts.head;
      ctx.save();
      ctx.translate(head.position.x, head.position.y);
      ctx.rotate(head.angle);
      var hq = 1 + q * 0.16;
      ctx.scale(hq, 1 / hq);
      drawFrazzle(ctx, headR, st.scuffs, color);
      var hp = Bonk.Doodle.circlePoints(0, 0, headR, 5, 1.05);
      Bonk.Doodle.fillPath(ctx, hp, P.paper, 0.96);
      Bonk.Doodle.strokePath(ctx, hp, { color: color, width: 4.6 * s });
      drawFace(ctx, B, headR, color);
      drawHat(ctx, st.save.hat, headR, color);
      ctx.restore();

      drawScuffMarks(ctx, B, color);
      ctx.restore();

      drawStars(ctx, B);
      drawSign(ctx, B);

      /* Tickle: a couple of squiggles where the feather is working. */
      if (B.tickleGlow > 0.02) {
        var t = st.pointer;
        for (var i = 0; i < 2; i++) {
          var a = st.time * 9 + i * 2.1;
          Bonk.Doodle.strokePath(
            ctx,
            [
              { x: t.x + Math.cos(a) * 16, y: t.y + Math.sin(a) * 10 - 8 },
              { x: t.x + Math.cos(a + 0.8) * 22, y: t.y + Math.sin(a + 0.8) * 13 - 14 }
            ],
            { color: P.highlighter, width: 2.4, alpha: B.tickleGlow * 0.9 }
          );
        }
      }

      if (B.speech) {
        var fadeIn = Math.min(1, B.speech.t * 6);
        var fadeOut = Math.min(1, (B.speech.dur - B.speech.t) * 4);
        /* Clear the hat, which stands well above the head outline. */
        var hatLift = st.save.hat === 'wizard' ? headR * 2.1 : st.save.hat ? headR * 1.5 : 0;
        var top = head.position.y - headR - 14 - hatLift;
        Bonk.Doodle.bubble(ctx, B.speech.line, head.position.x, top, {
          alpha: Math.min(fadeIn, fadeOut),
          color: B.speech.line === "you're absolutely right." ? P.marker : P.ink,
          seed: 23
        });
      }
    }
  };
})();
