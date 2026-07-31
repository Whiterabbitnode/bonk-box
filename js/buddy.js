/* Bonk Box - the buddy himself: ragdoll bodies, the muscle system that keeps
   him upright, and the recovery choreography after a big bonk.

   No canvas or DOM in this file, so the physics can be stepped headless by
   test/physics-check.js.

   Muscle model: every joint runs a first-order chase toward a target angular
   velocity, and the chest gets a positional pull toward a point above the feet.
   Both are scaled by `strength`, which BLENDS between 0 and 1 over time. Nothing
   is ever snapped into place - a snap reads as teleporting and ruins the feel. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});

  /* Skeleton in design units; the whole figure is 141 tall and gets scaled. */
  var DESIGN_H = 141;
  /* Matter converts torque and force to velocity as (t / inertia) * dt^2 with
     dt in milliseconds, so this is the conversion factor for a 60fps step. */
  var DT2 = (1000 / 60) * (1000 / 60);
  var LAYOUT = {
    head: { r: 13.5, cy: 13.5 },
    chest: { w: 21, h: 33, cy: 43.5 },
    pelvis: { w: 19, h: 17, cy: 68.5 },
    upperArm: { w: 8, h: 27, cy: 44.5, cx: 11.5 },
    lowerArm: { w: 7.5, h: 25, cy: 70.5, cx: 11.5 },
    upperLeg: { w: 9, h: 31, cy: 92.5, cx: 7.5 },
    lowerLeg: { w: 8, h: 33, cy: 124.5, cx: 7.5 }
  };

  var JOINT_LIMITS = {
    neck: [-0.7, 0.7],
    spine: [-0.55, 0.55],
    shoulderL: [-2.8, 2.8],
    shoulderR: [-2.8, 2.8],
    elbowL: [-2.6, 0.08],
    elbowR: [-2.6, 0.08],
    hipL: [-1.7, 1.7],
    hipR: [-1.7, 1.7],
    kneeL: [-0.08, 2.4],
    kneeR: [-0.08, 2.4]
  };

  var POSE_STAND = {
    torso: 0,
    neck: 0,
    spine: 0,
    /* Arms splayed enough to read as arms: hanging dead vertical merges them
       into the torso line and he looks like a bundle of sticks. */
    shoulderL: 0.44,
    shoulderR: -0.44,
    elbowL: -0.16,
    elbowR: -0.16,
    hipL: 0.1,
    hipR: -0.1,
    kneeL: 0.04,
    kneeR: 0.04,
    height: 1
  };

  function pose(over) {
    var p = {};
    for (var k in POSE_STAND) p[k] = POSE_STAND[k];
    if (over) for (var j in over) p[j] = over[j];
    return p;
  }

  function blendPose(a, b, t) {
    var out = {};
    for (var k in a) out[k] = a[k] + (b[k] - a[k]) * t;
    return out;
  }

  /* Get-up choreography. Each entry is {t, pose} and we lerp between them.
     Kip-up is springy and quick; the climb is a wobbly push off the floor. */
  var GETUP = {
    kip: {
      duration: 1.05,
      keys: [
        { t: 0, p: pose({ height: 0.22, hipL: 1.5, hipR: 1.5, kneeL: 2.1, kneeR: 2.1, shoulderL: 1.5, shoulderR: -1.5, elbowL: -1.2, elbowR: -1.2, spine: 0.4 }) },
        { t: 0.3, p: pose({ height: 0.3, hipL: 1.9, hipR: 1.9, kneeL: 2.3, kneeR: 2.3, shoulderL: 2.2, shoulderR: -2.2, elbowL: -0.5, elbowR: -0.5, spine: 0.5 }) },
        { t: 0.52, p: pose({ height: 0.78, hipL: -0.5, hipR: -0.5, kneeL: 0.5, kneeR: 0.5, shoulderL: -1.1, shoulderR: 1.1, elbowL: -0.2, elbowR: -0.2, spine: -0.25 }) },
        { t: 0.72, p: pose({ height: 1.06, hipL: 0.2, hipR: -0.2, kneeL: 0.02, kneeR: 0.02, shoulderL: 1.1, shoulderR: -1.1, spine: 0.1 }) },
        { t: 1, p: pose({}) }
      ]
    },
    climb: {
      duration: 2.35,
      keys: [
        { t: 0, p: pose({ height: 0.16, torso: 0.5, hipL: 1.1, hipR: 0.9, kneeL: 1.6, kneeR: 1.3, shoulderL: 1.9, shoulderR: -1.9, elbowL: -1.9, elbowR: -1.9, spine: 0.35 }) },
        { t: 0.22, p: pose({ height: 0.3, torso: 0.35, hipL: 1.3, hipR: 1.1, kneeL: 1.9, kneeR: 1.6, shoulderL: 1.5, shoulderR: -1.5, elbowL: -0.9, elbowR: -0.9, spine: 0.3 }) },
        { t: 0.45, p: pose({ height: 0.5, torso: 0.22, hipL: 1.5, hipR: 0.7, kneeL: 2.1, kneeR: 0.6, shoulderL: 0.9, shoulderR: -0.9, elbowL: -0.5, elbowR: -0.5, spine: 0.2 }) },
        { t: 0.68, p: pose({ height: 0.78, torso: 0.1, hipL: 0.8, hipR: 0.15, kneeL: 1.1, kneeR: 0.2, shoulderL: 0.5, shoulderR: -0.5, elbowL: -0.4, elbowR: -0.4 }) },
        { t: 0.84, p: pose({ height: 0.99, hipL: 0.1, hipR: -0.1, kneeL: 0.05, kneeR: 0.05, shoulderL: 0.9, shoulderR: -0.9, elbowL: -1.5, elbowR: -1.5 }) },
        { t: 0.93, p: pose({ height: 1, shoulderL: 0.4, shoulderR: -1.6, elbowL: -0.3, elbowR: -2.1 }) },
        { t: 1, p: pose({}) }
      ]
    }
  };

  var IDLE = {
    breathe: { dur: 3.2, mood: [0, 1] },
    lookaround: { dur: 2.6, mood: [0.25, 1] },
    shift: { dur: 2.2, mood: [0.2, 1] },
    stretch: { dur: 2.8, mood: [0.35, 1] },
    wave: { dur: 2.2, mood: [0.6, 1] },
    dance: { dur: 3.4, mood: [0.72, 1] },
    heart: { dur: 3.6, mood: [0.8, 1] },
    sit: { dur: 5.5, mood: [0, 0.34] },
    protest: { dur: 3.4, mood: [0, 0.3] },
    sideeye: { dur: 3, mood: [0, 0.4] }
  };

  var PROTEST_SIGNS = ['rude.', 'I was HELPING', 'again?!', 'noted.', 'unpaid.'];
  var BONK_LINES = ['ouch.', 'oof', 'worth it.', 'you got me.', 'my ribs, sketched.', "you're absolutely right.", 'noted.', 'shipping a fix...'];
  var HAPPY_LINES = ['hehe', 'thanks!', 'again!', 'best day', 'wheee'];

  var Buddy = {
    parts: null,
    bodies: [],
    constraints: [],
    joints: [],
    scale: 1,

    strength: 1, // muscle blend, 0 = full ragdoll
    phase: 'stand', // stand | ragdoll | getup
    getupKind: 'kip',
    getupT: 0,
    settleTimer: 0,
    ragdollTimer: 0,

    facing: 1,
    look: { x: 0, y: 0 },
    squash: 0, // squash-and-stretch on the last hit
    squashAngle: 0,
    flatten: 0, // full-body pancake, from the anvil
    dizzy: 0,
    soggy: 0,
    shakeDry: 0,
    eating: 0,
    cheer: 0,
    braced: 0,

    stars: [],
    scuffMarks: [],
    decals: [],
    strokes: {},
    speech: null,
    sign: null,

    idle: { name: 'breathe', t: 0, dur: 3.2 },
    tickleGlow: 0,
    coinDrip: 0,
    grounded: 0,

    /* ---- construction ------------------------------------------------- */
    create: function (world, x, groundY) {
      var M = window.Matter;
      var s = (this.scale = Bonk.CONFIG.buddyHeight / DESIGN_H);
      var L = LAYOUT;
      var top = groundY - DESIGN_H * s;
      var group = M.Body.nextGroup(true); // limbs never collide with each other

      function common(extra) {
        var o = {
          collisionFilter: { group: group },
          friction: 0.55,
          frictionAir: 0.021,
          restitution: 0.22,
          slop: 0.02
        };
        for (var k in extra) o[k] = extra[k];
        return o;
      }

      function rect(name, def, side) {
        var cx = x + (def.cx || 0) * (side || 0) * s;
        return M.Bodies.rectangle(cx, top + def.cy * s, def.w * s, def.h * s, common({ label: name, density: def.density || 0.0009, chamfer: { radius: Math.min(def.w, def.h) * s * 0.3 } }));
      }

      var p = {};
      p.head = M.Bodies.circle(x, top + L.head.cy * s, L.head.r * s, common({ label: 'head', density: 0.0013 }));
      p.chest = rect('chest', { w: L.chest.w, h: L.chest.h, cy: L.chest.cy, density: 0.0017 });
      p.pelvis = rect('pelvis', { w: L.pelvis.w, h: L.pelvis.h, cy: L.pelvis.cy, density: 0.0016 });
      p.upperArmL = rect('upperArmL', L.upperArm, -1);
      p.upperArmR = rect('upperArmR', L.upperArm, 1);
      p.lowerArmL = rect('lowerArmL', L.lowerArm, -1);
      p.lowerArmR = rect('lowerArmR', L.lowerArm, 1);
      p.upperLegL = rect('upperLegL', L.upperLeg, -1);
      p.upperLegR = rect('upperLegR', L.upperLeg, 1);
      p.lowerLegL = rect('lowerLegL', L.lowerLeg, -1);
      p.lowerLegR = rect('lowerLegR', L.lowerLeg, 1);

      this.parts = p;
      this.bodies = Object.keys(p).map(function (k) {
        p[k].isBuddy = true;
        p[k].partName = k;
        return p[k];
      });

      /* Joints. Length 0 with high stiffness plus soft damping reads as
         cartilage: firm, but it gives a little under a heavy landing. */
      var cons = [];
      var joints = [];
      var self = this;
      function join(name, a, ax, ay, b, bx, by, stiffness) {
        var c = M.Constraint.create({
          bodyA: a,
          pointA: { x: ax * s, y: ay * s },
          bodyB: b,
          pointB: { x: bx * s, y: by * s },
          length: 0,
          stiffness: stiffness == null ? 0.85 : stiffness,
          damping: 0.14,
          label: name
        });
        cons.push(c);
        joints.push({ name: name, parent: a, child: b, limits: JOINT_LIMITS[name] });
        return c;
      }

      /* Anchor pairs must coincide exactly in the build pose. A millimetre of
         mismatch here is a permanent tug the solver can never satisfy, and it
         shows up as limbs that hang slightly off their sockets. */
      var halfChest = L.chest.h / 2;
      var halfPelvis = L.pelvis.h / 2;
      join('neck', p.chest, 0, -halfChest, p.head, 0, L.head.r, 0.9);
      join('spine', p.chest, 0, halfChest, p.pelvis, 0, -halfPelvis, 0.9);
      join('shoulderL', p.chest, -L.upperArm.cx, L.upperArm.cy - L.upperArm.h / 2 - L.chest.cy, p.upperArmL, 0, -L.upperArm.h / 2);
      join('shoulderR', p.chest, L.upperArm.cx, L.upperArm.cy - L.upperArm.h / 2 - L.chest.cy, p.upperArmR, 0, -L.upperArm.h / 2);
      join('elbowL', p.upperArmL, 0, L.upperArm.h / 2, p.lowerArmL, 0, -L.lowerArm.h / 2);
      join('elbowR', p.upperArmR, 0, L.upperArm.h / 2, p.lowerArmR, 0, -L.lowerArm.h / 2);
      join('hipL', p.pelvis, -L.upperLeg.cx, halfPelvis, p.upperLegL, 0, -L.upperLeg.h / 2);
      join('hipR', p.pelvis, L.upperLeg.cx, halfPelvis, p.upperLegR, 0, -L.upperLeg.h / 2);
      join('kneeL', p.upperLegL, 0, L.upperLeg.h / 2, p.lowerLegL, 0, -L.lowerLeg.h / 2);
      join('kneeR', p.upperLegR, 0, L.upperLeg.h / 2, p.lowerLegR, 0, -L.lowerLeg.h / 2);

      this.constraints = cons;
      this.joints = joints;

      /* Chest sits this far above the soles when he is fully upright. */
      this.chestAbove = (DESIGN_H - L.chest.cy) * s;
      this.footOffset = (L.lowerLeg.h / 2) * s;

      ['torso', 'armL', 'armR', 'legL', 'legR'].forEach(function (id) {
        self.strokes[id] = { ink: 1, smudged: false, delay: 0, drawing: false };
      });

      M.Composite.add(world, this.bodies.concat(cons));
      this.pose = pose({});
      this.target = pose({});
      return this;
    },

    /* ---- helpers ------------------------------------------------------ */
    localToWorld: function (body, lx, ly) {
      var s = this.scale;
      var c = Math.cos(body.angle);
      var sn = Math.sin(body.angle);
      var x = lx * s;
      var y = ly * s;
      return { x: body.position.x + x * c - y * sn, y: body.position.y + x * sn + y * c };
    },

    footPoint: function (which) {
      var leg = which === 'L' ? this.parts.lowerLegL : this.parts.lowerLegR;
      return this.localToWorld(leg, 0, LAYOUT.lowerLeg.h / 2);
    },

    handPoint: function (which) {
      var arm = which === 'L' ? this.parts.lowerArmL : this.parts.lowerArmR;
      return this.localToWorld(arm, 0, LAYOUT.lowerArm.h / 2);
    },

    center: function () {
      return this.parts.chest.position;
    },

    speed: function () {
      var total = 0;
      for (var i = 0; i < this.bodies.length; i++) total += this.bodies[i].speed;
      return total / this.bodies.length;
    },

    say: function (line, dur) {
      this.speech = { line: line, t: 0, dur: dur || 1.9 };
    },

    /* ---- muscle system ------------------------------------------------
       Muscles speak in torque, never in Body.setAngularVelocity. Setting
       velocity directly rewrites body.anglePrev, which is exactly where the
       constraint solver parks its correction from the previous step - doing
       that every frame tears the joints apart under load. Torque goes through
       Verlet integration and leaves the solver's bookkeeping alone.
       Matter turns torque into angular velocity as torque/inertia*dt^2. */
    _pd: function (body, targetAngle, gain, maxV) {
      var err = Bonk.angleDelta(body.angle, targetAngle);
      /* 0.5 is the sweet spot from test/physics-check tuning: below it the
         limbs sag several degrees under their own weight and raised arms
         droop; above it he starts to read as rigid rather than organic. */
      var desired = Bonk.clamp(err * 0.5, -(maxV || 0.32), maxV || 0.32);
      var dv = (desired - body.angularVelocity) * gain;
      body.torque += (dv * body.inertia) / DT2;
    },

    applyMuscles: function (dt) {
      var M = window.Matter;
      var s = this.strength;
      if (s <= 0.001) return;
      var p = this.parts;
      var t = this.pose;
      var gain = Bonk.CONFIG.muscleGain * s;

      /* Torso first: everything else is expressed relative to it. */
      var lean = this.leanX || 0;
      this._pd(p.chest, t.torso + lean, gain * 1.15);
      this._pd(p.pelvis, p.chest.angle + t.spine, gain);
      this._pd(p.head, p.chest.angle + t.neck, gain * 0.9);
      /* Arms are light and do most of the acting, so they get the full gain. */
      this._pd(p.upperArmL, p.chest.angle + t.shoulderL, gain);
      this._pd(p.upperArmR, p.chest.angle + t.shoulderR, gain);
      this._pd(p.lowerArmL, p.upperArmL.angle + t.elbowL, gain * 0.85);
      this._pd(p.lowerArmR, p.upperArmR.angle + t.elbowR, gain * 0.85);
      this._pd(p.upperLegL, p.pelvis.angle + t.hipL, gain);
      this._pd(p.upperLegR, p.pelvis.angle + t.hipR, gain);
      this._pd(p.lowerLegL, p.upperLegL.angle + t.kneeL, gain);
      this._pd(p.lowerLegR, p.upperLegR.angle + t.kneeR, gain);

      /* Balance: pull the chest toward a point above the soles, and only hold
         his weight up when something is actually under his feet. */
      var fL = this.footPoint('L');
      var fR = this.footPoint('R');
      var feetX = (fL.x + fR.x) / 2;
      var feetY = Math.max(fL.y, fR.y);
      var vx = p.chest.velocity.x;
      var tx = feetX - vx * 3.2; // step into the fall instead of toppling
      var ty = feetY - this.chestAbove * t.height;

      var ex = tx - p.chest.position.x;
      var ey = ty - p.chest.position.y;
      var K = Bonk.CONFIG.balanceK;
      var D = Bonk.CONFIG.balanceDamp;
      var fx = (Bonk.clamp(ex, -70, 70) * K - vx * D) * p.chest.mass * s;
      var fy = (Bonk.clamp(ey, -80, 80) * K * 1.35 - p.chest.velocity.y * D * 1.2) * p.chest.mass * s;

      if (this.grounded > 0) {
        /* Hold up most of the figure through the chest; the legs do the rest. */
        fy -= this.totalMass * 0.001 * 0.62 * s * t.height;
      }
      M.Body.applyForce(p.chest, p.chest.position, { x: fx, y: fy });

      /* A touch of lift at the pelvis stops him folding at the waist. */
      if (this.grounded > 0) {
        M.Body.applyForce(p.pelvis, p.pelvis.position, { x: 0, y: -this.totalMass * 0.001 * 0.16 * s * t.height });
      }
    },

    enforceJointLimits: function () {
      for (var i = 0; i < this.joints.length; i++) {
        var j = this.joints[i];
        if (!j.limits) continue;
        var rel = Bonk.angleDelta(0, j.child.angle - j.parent.angle);
        var over = 0;
        if (rel > j.limits[1]) over = rel - j.limits[1];
        else if (rel < j.limits[0]) over = rel - j.limits[0];
        if (!over) continue;
        /* Soft stop: bleed the joint back inside its range instead of
           clamping, which would look like a stutter. */
        var corr = Bonk.clamp(-over * 0.1, -0.28, 0.28);
        j.child.torque += (corr * 0.5 * j.child.inertia) / DT2;
        j.parent.torque -= (corr * 0.12 * j.parent.inertia) / DT2;
      }
    },

    /* Runaway energy is the classic ragdoll failure: one limb picks up speed,
       drags the chain, and the joints separate visibly. Cap before integration
       so an injected fling never reaches the solver at teleport speed. */
    clampVelocities: function () {
      var M = window.Matter;
      var MAX_SPEED = 26;
      var MAX_SPIN = 0.7;
      for (var i = 0; i < this.bodies.length; i++) {
        var b = this.bodies[i];
        if (!isFinite(b.position.x) || !isFinite(b.position.y)) {
          M.Body.setPosition(b, this.lastGoodCenter);
          M.Body.setVelocity(b, { x: 0, y: 0 });
          M.Body.setAngularVelocity(b, 0);
          continue;
        }
        if (b.speed > MAX_SPEED) {
          var k = MAX_SPEED / b.speed;
          M.Body.setVelocity(b, { x: b.velocity.x * k, y: b.velocity.y * k });
        }
        if (Math.abs(b.angularVelocity) > MAX_SPIN) {
          M.Body.setAngularVelocity(b, (b.angularVelocity < 0 ? -1 : 1) * MAX_SPIN);
        }
      }
      var c = this.parts.chest.position;
      if (isFinite(c.x) && isFinite(c.y)) {
        this.lastGoodCenter.x = c.x;
        this.lastGoodCenter.y = c.y;
      }
    },

    /* ---- reactions ---------------------------------------------------- */
    goRagdoll: function (seconds) {
      this.phase = 'ragdoll';
      this.ragdollTimer = Math.max(this.ragdollTimer, seconds || 0.35);
      this.settleTimer = 0;
    },

    smudgeLimbs: function (count) {
      var ids = ['armL', 'armR', 'legL', 'legR', 'torso'];
      for (var i = ids.length - 1; i > 0; i--) {
        var j = (Math.random() * (i + 1)) | 0;
        var tmp = ids[i];
        ids[i] = ids[j];
        ids[j] = tmp;
      }
      for (var k = 0; k < Math.min(count, ids.length); k++) {
        var st = this.strokes[ids[k]];
        st.smudged = true;
        st.ink = Bonk.rand(0.18, 0.55);
        st.drawing = false;
      }
    },

    /* Every bonk lands here: props, walls, floors, flings. */
    bonk: function (partName, speedAt, point, opts) {
      opts = opts || {};
      var C = Bonk.CONFIG;
      if (speedAt < C.bonkSpeed) return 0;

      var hardHat = Bonk.state.save.hat === 'hard' && partName === 'head';
      var scale = Bonk.clamp((speedAt - C.bonkSpeed) / 16, 0, 1.4);

      /* One anvil landing on him produces a collision pair per limb it touches.
         Without this window a single bonk would scuff and pay five times over,
         so anything inside it still squashes and sounds but barely counts. */
      var now = Bonk.state.time;
      var sameImpact = now - (this._lastBonkAt || -9) < 0.15;
      this._lastBonkAt = now;
      var weight = sameImpact ? 0.12 : 1;

      /* About three solid hits to reach the well-scuffed band where he gets up
         the wobbly way instead of kipping. */
      var scuffAmount = scale * 0.3 * (opts.scuffMul == null ? 1 : opts.scuffMul) * weight;
      if (hardHat) scuffAmount *= 0.22;

      Bonk.addScuffs(scuffAmount);
      Bonk.addMood(-scale * 0.09 * weight);

      this.squash = Math.min(1, this.squash + scale * 0.8);
      this.squashAngle = opts.angle || 0;
      this.lastHitPart = partName;

      if (point) this.addScuffMark(partName, point, hardHat);

      if (hardHat) {
        if (Bonk.Sound) Bonk.Sound.ting();
        if (Bonk.Particles) Bonk.Particles.star(point ? point.x : this.parts.head.position.x, point ? point.y : this.parts.head.position.y, 2, Bonk.PALETTE.highlighter);
      } else if (Bonk.Sound) {
        Bonk.Sound.thud(scale);
      }

      var big = speedAt >= C.bigBonkSpeed;
      if (big && !hardHat) {
        this.goRagdoll(0.5);
        this.dizzy = Math.max(this.dizzy, 2.4);
        this.addStars(2 + ((Math.random() * 3) | 0));
        this.smudgeLimbs(1 + ((Math.random() * 3) | 0));
        this.say(Math.random() < 0.28 ? "you're absolutely right." : Bonk.pick(BONK_LINES), 2.1);
        if (Bonk.Particles) Bonk.Particles.dust(point ? point.x : this.center().x, point ? point.y : this.center().y, 7, 1.1);
      } else if (this.strength > 0.5 && speedAt > C.bonkSpeed * 1.6) {
        this.goRagdoll(0.22);
        if (Math.random() < 0.4) this.say(Bonk.pick(BONK_LINES), 1.5);
      }

      var coins = Math.round((2 + scale * (opts.payMul == null ? 9 : opts.payMul * 9)) * weight);
      if (coins >= 1) Bonk.pay(coins, point || this.center());
      return coins;
    },

    addScuffMark: function (partName, point, hardHat) {
      var body = this.parts[partName];
      if (!body) return;
      var dx = point.x - body.position.x;
      var dy = point.y - body.position.y;
      var c = Math.cos(-body.angle);
      var sn = Math.sin(-body.angle);
      this.scuffMarks.push({
        part: partName,
        lx: (dx * c - dy * sn) / this.scale,
        ly: (dx * sn + dy * c) / this.scale,
        kind: hardHat ? 'spark' : Bonk.pick(['bandaid', 'cross', 'scribble']),
        rot: Bonk.rand(-1, 1),
        born: Bonk.state.time
      });
      if (this.scuffMarks.length > 9) this.scuffMarks.shift();
    },

    addStars: function (n) {
      for (var i = 0; i < n; i++) {
        this.stars.push({ a: Math.random() * 6.28, r: Bonk.rand(20, 28), speed: Bonk.rand(1.6, 2.8), size: Bonk.rand(4.5, 7) });
      }
      if (this.stars.length > 6) this.stars.splice(0, this.stars.length - 6);
    },

    popStar: function () {
      if (!this.stars.length) return;
      var st = this.stars.pop();
      var h = this.parts.head.position;
      if (Bonk.Particles) Bonk.Particles.star(h.x + Math.cos(st.a) * st.r, h.y + Math.sin(st.a) * st.r * 0.55 - 18, 1);
      if (Bonk.Sound) Bonk.Sound.pop(1.3);
    },

    tickle: function (dt, point) {
      var M = window.Matter;
      this.tickleGlow = 1;
      Bonk.addMood(dt * 0.32);
      Bonk.addScuffs(-dt * 0.02);
      this.coinDrip += dt;
      if (this.coinDrip > 0.55) {
        this.coinDrip = 0;
        Bonk.pay(2, point || this.center());
        if (Bonk.Sound) Bonk.Sound.giggle();
        if (Math.random() < 0.4) this.say(Bonk.pick(['hehe', 'heehee', 'stop it', 'ha!']), 1.1);
      }
      /* Squirm: little random impulses so he wriggles under the feather. */
      if (this.strength > 0.4) {
        var wig = ['upperArmL', 'upperArmR', 'lowerArmL', 'lowerArmR', 'upperLegL', 'upperLegR'];
        var b = this.parts[Bonk.pick(wig)];
        M.Body.setAngularVelocity(b, b.angularVelocity + Bonk.rand(-0.09, 0.09));
      }
    },

    eatCookie: function (at) {
      this.eating = 1.6;
      this.cheer = Math.max(this.cheer, 1.4);
      Bonk.addMood(0.34);
      Bonk.addScuffs(-0.38);
      this.dizzy = 0;
      while (this.stars.length) this.popStar();
      if (Bonk.Sound) Bonk.Sound.munch();
      if (Bonk.Particles) {
        Bonk.Particles.crumbsOfCookie(at.x, at.y);
        Bonk.Particles.hearts(this.parts.head.position.x, this.parts.head.position.y - 22, 3);
      }
      this.say(Bonk.pick(['thanks!', 'mmm.', 'a raise!', 'best user']), 2.1);
      Bonk.pay(15, at);
    },

    party: function () {
      this.cheer = 3.2;
      Bonk.addMood(0.5);
      Bonk.addScuffs(-0.18);
      this.idle = { name: 'dance', t: 0, dur: 3.4 };
      this.say(Bonk.pick(['WHEEE', 'party!', 'promotion?']), 2.2);
    },

    soak: function (at) {
      this.soggy = 3.4;
      Bonk.addMood(-0.12);
      if (Bonk.Particles) Bonk.Particles.splash(at.x, at.y, 26);
      if (Bonk.Sound) Bonk.Sound.splash();
      this.say(Bonk.pick(['blub.', 'soggy.', 'my sketch!']), 1.8);
    },

    pancake: function () {
      this.flatten = 1;
      this.goRagdoll(0.7);
      this.dizzy = Math.max(this.dizzy, 3);
      this.addStars(4);
      this.smudgeLimbs(3);
    },

    /* ---- per-frame ----------------------------------------------------- */
    update: function (dt, world) {
      var C = Bonk.CONFIG;
      var st = Bonk.state;

      this.grounded = Math.max(0, this.grounded - dt);
      this.squash *= Math.pow(0.06, dt);
      this.flatten *= Math.pow(0.25, dt); // pancake holds ~half a second
      this.dizzy = Math.max(0, this.dizzy - dt);
      this.soggy = Math.max(0, this.soggy - dt);
      this.cheer = Math.max(0, this.cheer - dt);
      this.eating = Math.max(0, this.eating - dt);
      this.braced = Math.max(0, this.braced - dt);
      this.tickleGlow = Math.max(0, this.tickleGlow - dt * 2.5);
      if (this.soggy > 0 && this.soggy < 1.2 && !this.shakeDry) this.shakeDry = 0.9;
      this.shakeDry = Math.max(0, this.shakeDry - dt);
      if (this.soggy > 1.2 && Bonk.Particles && Math.random() < dt * 7) {
        var drippy = Bonk.pick(['lowerArmL', 'lowerArmR', 'lowerLegL', 'lowerLegR', 'pelvis']);
        var dp = this.parts[drippy].position;
        Bonk.Particles.splash(dp.x, dp.y + 6, 1);
      }

      /* Mood and scuffs settle back toward normal on their own. */
      Bonk.addScuffs(-C.scuffHeal * dt * (1 + st.mood));
      st.mood += (C.moodRest - st.mood) * C.moodDrift * dt;

      this.healMarks();
      this.updatePhase(dt);
      this.updatePose(dt);
      this.updateStrokes(dt);

      if (this.speech) {
        this.speech.t += dt;
        if (this.speech.t > this.speech.dur) this.speech = null;
      }
      if (this.sign) {
        this.sign.t += dt;
        if (this.sign.t > this.sign.dur) this.sign = null;
      }
      for (var i = 0; i < this.stars.length; i++) this.stars[i].a += this.stars[i].speed * dt;
      for (var d = this.decals.length - 1; d >= 0; d--) {
        this.decals[d].age += dt;
        if (this.decals[d].age > this.decals[d].life) this.decals.splice(d, 1);
      }

      /* He looks where you are. */
      var head = this.parts.head.position;
      var dx = st.pointer.x - head.x;
      if (Math.abs(dx) > 12) this.facing = dx > 0 ? 1 : -1;
      this.look.x = Bonk.clamp(dx / 190, -1, 1);
      this.look.y = Bonk.clamp((st.pointer.y - head.y) / 190, -1, 1);
    },

    healMarks: function () {
      var want = Math.round(Bonk.state.scuffs * 9);
      while (this.scuffMarks.length > want) {
        var m = this.scuffMarks.shift();
        var body = this.parts[m.part];
        if (body && Bonk.Particles) {
          var w = this.localToWorld(body, m.lx, m.ly);
          Bonk.Particles.bandaid(w.x, w.y);
        }
      }
    },

    updatePhase: function (dt) {
      var C = Bonk.CONFIG;
      if (this.phase === 'stand') {
        this.strength = Math.min(1, this.strength + dt / C.muscleBlendIn);
        return;
      }

      if (this.phase === 'ragdoll') {
        /* Muscles release quickly - that part should feel like a switch. */
        this.strength = Math.max(0, this.strength - dt / 0.16);
        this.ragdollTimer -= dt;
        if (this.ragdollTimer > 0) return;
        if (this.speed() < C.calmSpeed) {
          this.settleTimer += dt;
        } else {
          this.settleTimer = 0;
        }
        if (this.settleTimer >= C.calmHold) {
          this.beginGetup();
        }
        return;
      }

      if (this.phase === 'getup') {
        var g = GETUP[this.getupKind];
        this.getupT += dt / g.duration;
        /* Strength eases in over the first two-thirds so the first movement is
           a lean, not a lurch. */
        var ramp = Bonk.clamp(this.getupT / 0.66, 0, 1);
        var eased = ramp * ramp * (3 - 2 * ramp);
        var wobble = this.getupKind === 'climb' ? 1 + Math.sin(this.getupT * 22) * 0.09 * (1 - this.getupT) : 1;
        this.strength = Bonk.clamp(eased * wobble, 0, 1);

        /* Stars pop off one at a time on the way up. */
        var starsLeft = Math.round((1 - this.getupT) * this.starsAtGetup);
        while (this.stars.length > Math.max(0, starsLeft)) this.popStar();

        if (this.getupKind === 'climb' && !this._dusted && this.getupT > 0.88) {
          this._dusted = true;
          var sh = this.localToWorld(this.parts.chest, 0, -LAYOUT.chest.h / 2);
          if (Bonk.Particles) Bonk.Particles.dust(sh.x, sh.y, 5, 0.7);
        }

        if (this.getupT >= 1) {
          this.phase = 'stand';
          this.strength = 1;
          this.dizzy = 0;
          this.idle = { name: 'wave', t: 0, dur: 1.4 };
          this.say(Bonk.pick(['all good.', 'still here.', 'fine. totally fine.', 'shipping a fix...', "you're absolutely right."]), 2);
          Bonk.pay(12, this.center());
          if (Bonk.Particles) {
            var f = this.footPoint('L');
            Bonk.Particles.dust(f.x, f.y, 6, 0.9);
          }
          if (Bonk.Sound) Bonk.Sound.poof();
        }
      }
    },

    beginGetup: function () {
      this.phase = 'getup';
      this.getupT = 0;
      this._dusted = false;
      this.getupKind = Bonk.state.scuffs < 0.35 ? 'kip' : 'climb';
      this.starsAtGetup = this.stars.length;
      var f = this.footPoint('L');
      if (Bonk.Particles) Bonk.Particles.dust(f.x, f.y, 5, 0.8);
      if (Bonk.Sound) Bonk.Sound.poof();

      /* Redraw the smudged limbs on the way up, staggered. */
      var ids = Object.keys(this.strokes);
      var order = 0;
      var dur = GETUP[this.getupKind].duration;
      for (var i = 0; i < ids.length; i++) {
        var s = this.strokes[ids[i]];
        if (s.smudged) {
          s.delay = 0.12 + order * (dur * 0.2);
          s.drawing = true;
          order++;
        }
      }
    },

    updateStrokes: function (dt) {
      for (var id in this.strokes) {
        var s = this.strokes[id];
        if (!s.smudged) continue;
        if (s.drawing) {
          if (s.delay > 0) {
            s.delay -= dt;
            continue;
          }
          s.ink = Math.min(1, s.ink + dt / 0.5);
          if (s.ink >= 1) {
            s.smudged = false;
            s.drawing = false;
          }
        }
      }
    },

    /* Choose and drive the target pose. */
    updatePose: function (dt) {
      var st = Bonk.state;
      var target;

      if (this.phase === 'getup') {
        target = this.sampleGetup(this.getupT);
      } else if (this.phase === 'ragdoll') {
        target = pose({});
      } else {
        target = this.idlePose(dt);
      }

      /* Blend toward the target instead of assigning it. */
      var rate = this.phase === 'getup' ? 0.32 : 0.2;
      this.pose = blendPose(this.pose, target, Math.min(1, rate * dt * 60));

      /* Breathing and a small weight shift, always on top. */
      if (this.phase === 'stand') {
        var t = st.time;
        this.pose.height += Math.sin(t * 1.5) * 0.008;
        this.pose.torso += Math.sin(t * 1.1) * 0.02;
        this.leanX = Math.sin(t * 0.42) * 0.035;
        if (this.shakeDry > 0) {
          this.leanX += Math.sin(st.time * 46) * 0.34 * this.shakeDry;
        }
      } else {
        this.leanX = 0;
      }
      if (this.soggy > 0 && this.phase === 'stand') {
        this.pose.shoulderL += 0.18;
        this.pose.shoulderR -= 0.18;
        this.pose.spine += 0.08;
      }
    },

    sampleGetup: function (t) {
      var keys = GETUP[this.getupKind].keys;
      for (var i = 1; i < keys.length; i++) {
        if (t <= keys[i].t) {
          var a = keys[i - 1];
          var b = keys[i];
          var f = (t - a.t) / (b.t - a.t || 1);
          var e = f * f * (3 - 2 * f);
          return blendPose(a.p, b.p, e);
        }
      }
      return keys[keys.length - 1].p;
    },

    idlePose: function (dt) {
      var st = Bonk.state;
      this.idle.t += dt;
      if (this.idle.t > this.idle.dur) this.pickIdle();
      var t = this.idle.t;
      var n = this.idle.name;
      var f = this.facing;

      if (this.eating > 0) {
        var e = 1 - this.eating / 1.6;
        return pose({ shoulderL: f > 0 ? -1.5 : 0.2, shoulderR: f > 0 ? -0.2 : 1.5, elbowL: f > 0 ? -1.9 : -0.3, elbowR: f > 0 ? -0.3 : -1.9, neck: Math.sin(e * 22) * 0.06 });
      }
      if (this.cheer > 0 && n !== 'dance') {
        return pose({ shoulderL: 2.3, shoulderR: -2.3, elbowL: -0.3, elbowR: -0.3, height: 1 + Math.abs(Math.sin(st.time * 8)) * 0.04 });
      }

      switch (n) {
        case 'wave': {
          var w = Math.sin(t * 9) * 0.45;
          return f > 0
            ? pose({ shoulderR: -2.25, elbowR: -0.45 + w, neck: -0.05 })
            : pose({ shoulderL: 2.25, elbowL: -0.45 - w, neck: 0.05 });
        }
        case 'stretch': {
          var up = Math.min(1, t / 0.7) * (t > 1.9 ? Math.max(0, 1 - (t - 1.9) / 0.7) : 1);
          return pose({ shoulderL: 0.2 + 2.4 * up, shoulderR: -0.2 - 2.4 * up, elbowL: -0.18 + 0.1 * up, elbowR: -0.18 + 0.1 * up, height: 1 + 0.045 * up, spine: -0.12 * up });
        }
        case 'shift': {
          var sh = Math.sin(t * 1.9);
          return pose({ hipL: 0.07 + sh * 0.16, hipR: -0.07 + sh * 0.16, torso: sh * 0.05, kneeL: 0.05 + Math.max(0, sh) * 0.22, kneeR: 0.05 + Math.max(0, -sh) * 0.22 });
        }
        case 'lookaround': {
          return pose({ neck: Math.sin(t * 1.5) * 0.32, torso: Math.sin(t * 1.5) * 0.06 });
        }
        case 'dance': {
          /* Muscles lag a moving target in proportion to how fast it moves, so
             a frantic beat reads as a twitch. Slow enough that the limbs
             actually arrive at the pose. */
          var b = st.time * 4.2;
          return pose({
            shoulderL: 0.3 + Math.sin(b) * 1.5,
            shoulderR: -0.3 + Math.sin(b + 3.14) * 1.5,
            elbowL: -0.5 + Math.sin(b * 2) * 0.3,
            elbowR: -0.5 + Math.sin(b * 2 + 1) * 0.3,
            torso: Math.sin(b * 0.5) * 0.16,
            hipL: 0.1 + Math.sin(b) * 0.22,
            hipR: -0.1 - Math.sin(b) * 0.22,
            height: 0.97 + Math.abs(Math.sin(b)) * 0.05
          });
        }
        case 'heart': {
          if (t > 0.9 && !this.idle.drew) {
            this.idle.drew = true;
            var fp = this.footPoint(this.facing > 0 ? 'R' : 'L');
            this.decals.push({ kind: 'heart', x: fp.x + this.facing * 16, y: fp.y - 8, age: 0, life: 9, r: 11 });
            if (Bonk.Sound) Bonk.Sound.pop(1.6);
          }
          var reach = Math.min(1, t / 0.8) * (t > 2.6 ? Math.max(0, 1 - (t - 2.6) / 0.7) : 1);
          return pose({
            height: 1 - 0.22 * reach,
            spine: 0.3 * reach,
            torso: 0.18 * this.facing * reach,
            kneeL: 0.05 + 0.5 * reach,
            kneeR: 0.05 + 0.5 * reach,
            shoulderR: f > 0 ? -0.2 - 0.9 * reach : -0.2,
            shoulderL: f > 0 ? 0.2 : 0.2 + 0.9 * reach,
            elbowR: f > 0 ? -0.18 - 0.5 * reach : -0.18,
            elbowL: f > 0 ? -0.18 : -0.18 - 0.5 * reach
          });
        }
        case 'sit': {
          return pose({ height: 0.46, hipL: 1.35, hipR: 1.3, kneeL: 1.5, kneeR: 1.45, shoulderL: 1.0, shoulderR: -1.0, elbowL: -1.75, elbowR: -1.75, spine: 0.16, torso: Math.sin(st.time * 0.9) * 0.03 });
        }
        case 'protest': {
          if (!this.sign && t > 0.4) this.sign = { text: Bonk.pick(PROTEST_SIGNS), t: 0, dur: 2.4 };
          return pose({ height: 0.52, hipL: 1.3, hipR: 1.25, kneeL: 1.45, kneeR: 1.4, shoulderR: f > 0 ? -2.2 : -0.2, shoulderL: f > 0 ? 0.2 : 2.2, elbowR: f > 0 ? -0.25 : -1.7, elbowL: f > 0 ? -1.7 : -0.25 });
        }
        case 'sideeye': {
          return pose({ shoulderL: 1.15, shoulderR: -1.15, elbowL: -1.85, elbowR: -1.85, torso: -0.06 * f, neck: 0.06 * f });
        }
        default:
          return pose({});
      }
    },

    pickIdle: function () {
      var mood = Bonk.state.mood;
      var options = [];
      for (var k in IDLE) {
        var d = IDLE[k];
        if (mood >= d.mood[0] && mood <= d.mood[1]) options.push(k);
      }
      var name = options.length ? Bonk.pick(options) : 'breathe';
      this.idle = { name: name, t: 0, dur: IDLE[name].dur, drew: false };
    },

    /* Reset for a fresh page: keeps coins and scuffs history, re-centres him. */
    reset: function (x, groundY) {
      var M = window.Matter;
      var top = groundY - DESIGN_H * this.scale;
      var s = this.scale;
      var L = LAYOUT;
      var place = {
        head: [0, L.head.cy],
        chest: [0, L.chest.cy],
        pelvis: [0, L.pelvis.cy],
        upperArmL: [-L.upperArm.cx, L.upperArm.cy],
        upperArmR: [L.upperArm.cx, L.upperArm.cy],
        lowerArmL: [-L.lowerArm.cx, L.lowerArm.cy],
        lowerArmR: [L.lowerArm.cx, L.lowerArm.cy],
        upperLegL: [-L.upperLeg.cx, L.upperLeg.cy],
        upperLegR: [L.upperLeg.cx, L.upperLeg.cy],
        lowerLegL: [-L.lowerLeg.cx, L.lowerLeg.cy],
        lowerLegR: [L.lowerLeg.cx, L.lowerLeg.cy]
      };
      for (var k in place) {
        var b = this.parts[k];
        M.Body.setPosition(b, { x: x + place[k][0] * s, y: top + place[k][1] * s });
        M.Body.setAngle(b, 0);
        M.Body.setVelocity(b, { x: 0, y: 0 });
        M.Body.setAngularVelocity(b, 0);
      }
      this.phase = 'stand';
      this.strength = 1;
      this.stars.length = 0;
      this.decals.length = 0;
      this.dizzy = 0;
      this.flatten = 0;
      this.soggy = 0;
      this.pose = pose({});
      for (var id in this.strokes) {
        this.strokes[id] = { ink: 1, smudged: false, delay: 0, drawing: false };
      }
    }
  };

  Object.defineProperty(Buddy, 'totalMass', {
    get: function () {
      if (this._mass) return this._mass;
      var m = 0;
      for (var i = 0; i < this.bodies.length; i++) m += this.bodies[i].mass;
      this._mass = m;
      return m;
    }
  });

  Buddy.lastGoodCenter = { x: 400, y: 300 };
  Buddy.LAYOUT = LAYOUT;
  Buddy.DESIGN_H = DESIGN_H;
  Buddy.GETUP = GETUP;

  Bonk.Buddy = Buddy;
})();
