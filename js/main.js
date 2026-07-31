/* Bonk Box - the page comes alive here: canvas, room, input, collisions and
   the render loop. Physics runs on a fixed 60Hz step regardless of display
   refresh, because the muscle gains are tuned per step. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});
  var M = window.Matter;
  var P = Bonk.PALETTE;
  var D;

  var canvas, ctx, dpr = 1;
  var W = 0;
  var H = 0;
  var engine, mouse, mouseConstraint;
  var walls = [];
  var roomStrokes = null;
  var shake = { x: 0, y: 0, amount: 0 };
  var pageFlip = 0;
  var acc = 0;
  var last = 0;
  var gravityFlip = 0;
  var trampolineCooldown = 0;
  var grabbedBuddy = false;
  var aim = { active: false, x0: 0, y0: 0, x1: 0, y1: 0 };
  var STEP = 1000 / 60;

  /* Slingshot: drag away from the anchor, and it flies the opposite way. */
  var MAX_LAUNCH = 24;
  function launchVelocity() {
    var dx = aim.x0 - aim.x1;
    var dy = aim.y0 - aim.y1;
    var len = Math.hypot(dx, dy);
    if (len < 1) return { x: 0, y: 0 };
    var power = Math.min(len * 0.075, MAX_LAUNCH);
    return { x: (dx / len) * power, y: (dy / len) * power };
  }

  var room = (Bonk.room = { left: 0, right: 0, top: 0, bottom: 0 });

  /* ---- setup ----------------------------------------------------------- */
  function layout() {
    var rect = canvas.getBoundingClientRect();
    W = Math.max(320, Math.round(rect.width));
    H = Math.max(360, Math.round(rect.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Insets clear the name tag above and the tool tray below. */
    room.left = Math.round(Math.min(90, W * 0.07));
    room.right = W - room.left;
    room.top = Math.round(Math.min(130, H * 0.22));
    room.bottom = Math.round(H - Math.min(150, H * 0.26));

    /* Size him to the room, once, before he is built. A short window gets a
       smaller buddy rather than a cramped one. */
    if (!Bonk.Buddy.parts) {
      Bonk.CONFIG.buddyHeight = Math.round(Bonk.clamp((room.bottom - room.top) * 0.56, 120, 200));
    }

    buildWalls();
    roomStrokes = null;
    if (mouse) mouse.pixelRatio = dpr;
  }

  function buildWalls() {
    if (walls.length) M.Composite.remove(engine.world, walls);
    var t = 200;
    walls = [
      M.Bodies.rectangle((room.left + room.right) / 2, room.bottom + t / 2, room.right - room.left + t * 2, t, { isStatic: true, friction: 0.7, restitution: 0.52, label: 'floor' }),
      M.Bodies.rectangle((room.left + room.right) / 2, room.top - t / 2, room.right - room.left + t * 2, t, { isStatic: true, friction: 0.4, restitution: 0.6, label: 'ceiling' }),
      M.Bodies.rectangle(room.left - t / 2, (room.top + room.bottom) / 2, t, room.bottom - room.top + t * 2, { isStatic: true, friction: 0.3, restitution: 0.74, label: 'wall' }),
      M.Bodies.rectangle(room.right + t / 2, (room.top + room.bottom) / 2, t, room.bottom - room.top + t * 2, { isStatic: true, friction: 0.3, restitution: 0.74, label: 'wall' })
    ];
    M.Composite.add(engine.world, walls);
  }

  function init() {
    canvas = document.getElementById('page');
    ctx = canvas.getContext('2d');
    D = Bonk.Doodle;

    Bonk.state.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    engine = M.Engine.create();
    /* Generous solver budget: this is one small ragdoll, not a crowd, and the
       joints looking attached matters more than the microseconds. */
    engine.positionIterations = 14;
    engine.velocityIterations = 10;
    /* 28 is high, but this is one small ragdoll and the frame budget is barely
       touched. Dragging him across the room by an ankle stretches a four-link
       chain, and fewer iterations leave a visible gap at the hip. */
    engine.constraintIterations = 28;
    engine.gravity.y = 1;

    layout();
    Bonk.Props.init(engine);
    Bonk.Buddy.create(engine.world, (room.left + room.right) / 2, room.bottom);
    Bonk.state.pointer.x = (room.left + room.right) / 2;
    Bonk.state.pointer.y = room.bottom - 120;

    mouse = M.Mouse.create(canvas);
    mouse.pixelRatio = dpr;
    /* A soft, rubbery grab. Stiffer than this and hauling him across the room
       by one forearm yanks that limb out of its socket faster than the solver
       can pull it back, which reads as the arm coming off. */
    mouseConstraint = M.MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: { stiffness: 0.1, damping: 0.12, length: 0, angularStiffness: 0 }
    });
    M.Composite.add(engine.world, mouseConstraint);

    /* Matter's mouse swallows wheel events by default; the page has nothing to
       scroll, but leave the listener passive so it never blocks. */
    canvas.removeEventListener('wheel', mouse.mousewheel);

    M.Events.on(mouseConstraint, 'startdrag', function (e) {
      if (e.body && e.body.isBuddy) {
        grabbedBuddy = true;
        Bonk.Buddy.say(Bonk.pick(['whoa', 'hey!', 'up we go', 'careful']), 1.2);
      }
      Bonk.Sound.start();
    });
    M.Events.on(mouseConstraint, 'enddrag', function (e) {
      if (e.body && e.body.isBuddy) {
        grabbedBuddy = false;
        /* A small kick on release makes the fling arc read as a throw. */
        M.Body.setVelocity(e.body, { x: e.body.velocity.x * 1.25, y: e.body.velocity.y * 1.25 });
        Bonk.Buddy.goRagdoll(0.3);
        Bonk.Sound.whoosh();
      }
    });

    M.Events.on(engine, 'beforeUpdate', function () {
      var B = Bonk.Buddy;
      B.clampVelocities();
      B.applyMuscles(STEP / 1000);
      B.enforceJointLimits();
    });
    /* Again after integration: the mouse constraint can hand a light limb more
       speed than the cap during a hard drag, and letting that reach the
       collision pass or the renderer is what a limb explosion looks like. */
    M.Events.on(engine, 'afterUpdate', function () {
      Bonk.Buddy.clampVelocities();
    });
    M.Events.on(engine, 'collisionStart', onCollisionStart);
    M.Events.on(engine, 'collisionActive', onCollisionActive);

    bindPointer();
    Bonk.UI.init();
    window.addEventListener('resize', layout);

    if (Bonk.state.returning) {
      window.setTimeout(function () {
        Bonk.Buddy.say('oh, you’re back.', 2.4);
        Bonk.Buddy.idle = { name: 'wave', t: 0, dur: 2.2 };
      }, 900);
    } else {
      window.setTimeout(function () {
        Bonk.Buddy.say('hi. drag me around?', 3);
      }, 1100);
    }
    Bonk.state.save.visits++;
    Bonk.persist();

    if (Bonk.state.save.friend) {
      Bonk.Friend.spawn(engine.world, (room.left + room.right) / 2 - 70, room.bottom - 40);
      Bonk.Buddy.speech = null;
    }

    /* First visit of a new day: he comes over and hands you something. */
    var gift = Bonk.rollStreak();
    if (gift) {
      window.setTimeout(function () {
        Bonk.Gift.offer(gift);
      }, Bonk.state.returning ? 2600 : 3600);
    }

    last = performance.now();
    requestAnimationFrame(frame);
  }

  /* ---- input ------------------------------------------------------------ */
  function bindPointer() {
    var pt = Bonk.state.pointer;

    function toWorld(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    canvas.addEventListener('pointermove', function (e) {
      var p = toWorld(e);
      pt.vx = p.x - pt.x;
      pt.vy = p.y - pt.y;
      pt.x = p.x;
      pt.y = p.y;
      pt.inside = true;
      if (aim.active) {
        aim.x1 = p.x;
        aim.y1 = p.y;
      }
    });

    canvas.addEventListener('pointerleave', function () {
      pt.inside = false;
      pt.down = false;
    });

    canvas.addEventListener('pointerdown', function (e) {
      var p = toWorld(e);
      pt.x = p.x;
      pt.y = p.y;
      pt.down = true;
      pt.inside = true;
      Bonk.Sound.start();
      var tool = Bonk.state.tool;
      var def = Bonk.Tools.all[tool];

      /* Throwables go on the slingshot: press to set the anchor, drag back to
         aim and load, release to let fly. */
      if (def && def.hurl) {
        aim.active = true;
        aim.x0 = Bonk.clamp(p.x, room.left + 30, room.right - 30);
        aim.y0 = Bonk.clamp(p.y, room.top + 30, room.bottom - 30);
        aim.x1 = aim.x0;
        aim.y1 = aim.y0;
        return;
      }
      if (tool !== 'hand' && tool !== 'feather') {
        Bonk.Tools.use(tool, Bonk.clamp(p.x, room.left + 30, room.right - 30), Bonk.clamp(p.y, room.top + 30, room.bottom - 30));
      }
    });

    window.addEventListener('pointerup', function () {
      pt.down = false;
      if (aim.active) {
        aim.active = false;
        var v = launchVelocity();
        /* A press with no meaningful drag is just a drop. */
        Bonk.Tools.use(Bonk.state.tool, aim.x0, aim.y0, Math.hypot(v.x, v.y) > 1.2 ? v : null);
        if (Math.hypot(v.x, v.y) > 4) Bonk.Sound.whoosh();
      }
    });

    /* Touch: keep the page from panning under a drag. */
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
    }, { passive: false });
  }

  /* The hand pushes when it is near him and moving; the feather tickles. */
  function handleHover(dt) {
    var st = Bonk.state;
    var pt = st.pointer;
    if (!pt.inside || st.shopOpen) return;
    var B = Bonk.Buddy;

    if (st.tool === 'feather') {
      var c = B.center();
      if (Math.hypot(pt.x - c.x, pt.y - c.y) < 78) B.tickle(dt, { x: pt.x, y: pt.y });
      return;
    }

    if (st.tool !== 'hand' || grabbedBuddy) return;
    var speed = Math.hypot(pt.vx, pt.vy);
    if (speed < 1.2) return;
    for (var i = 0; i < B.bodies.length; i++) {
      var b = B.bodies[i];
      var dx = b.position.x - pt.x;
      var dy = b.position.y - pt.y;
      var d = Math.hypot(dx, dy);
      if (d > 62) continue;
      var falloff = 1 - d / 62;
      M.Body.applyForce(b, b.position, {
        x: Bonk.clamp(pt.vx, -14, 14) * 0.00016 * falloff * b.mass,
        y: Bonk.clamp(pt.vy, -14, 14) * 0.00016 * falloff * b.mass
      });
    }
  }

  /* ---- collisions -------------------------------------------------------- */
  function contactPoint(pair, fallback) {
    if (pair.collision && pair.collision.supports && pair.collision.supports.length) {
      return pair.collision.supports[0];
    }
    return fallback;
  }

  function relSpeed(a, b) {
    return Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
  }

  function bounceOffTrampoline(body, prop) {
    if (trampolineCooldown > 0 && body.isBuddy) return;
    var vy = body.velocity.y;
    var boost = Math.min(Math.max(10, Math.abs(vy) * 1.22), 22);
    /* The whole figure has to leave the mat together. Kicking only the part
       that touched it means the other ten bodies immediately drag it back
       down, and the trampoline does nothing at all. */
    var targets = body.isBuddy ? Bonk.Buddy.bodies : [body];
    for (var i = 0; i < targets.length; i++) {
      M.Body.setVelocity(targets[i], { x: targets[i].velocity.x * 0.94, y: -boost });
    }
    prop.squish = 1;
    Bonk.Sound.boing(Bonk.clamp(boost / 20, 0.3, 1));
    if (body.isBuddy) {
      trampolineCooldown = 0.3;
      Bonk.addMood(0.09);
      Bonk.Buddy.cheer = Math.max(Bonk.Buddy.cheer, 0.7);
      Bonk.pay(4 + Math.round(boost / 3), body.position);
      if (Math.random() < 0.3) Bonk.Buddy.say(Bonk.pick(['wheee', 'again!', 'boing', 'weee']), 1.1);
    }
  }

  function onCollisionStart(evt) {
    var B = Bonk.Buddy;
    for (var i = 0; i < evt.pairs.length; i++) {
      var pair = evt.pairs[i];
      var a = pair.bodyA;
      var b = pair.bodyB;
      Bonk.Fort.wake(a);
      Bonk.Fort.wake(b);
      if ((a.isFriend || b.isFriend) && Bonk.Friend.sad <= 0) {
        var fr = a.isFriend ? a : b;
        if (fr.speed > 6) Bonk.Friend.bonked();
      }
      var part = a.isBuddy ? a : b.isBuddy ? b : null;
      var other = part === a ? b : a;
      var speed = relSpeed(a, b);

      if (part) {
        B.grounded = 0.18;
        var point = contactPoint(pair, part.position);

        if (other.propKind === 'trampoline' && other.prop && !other.prop.erasing) {
          bounceOffTrampoline(B.parts.chest, other.prop);
          continue;
        }

        if (other.isProp && other.prop && !other.prop.erasing) {
          var def = other.prop.def;
          other.prop.squish = 1;
          if (B.phase === 'ragdoll') B.bounce(speed, point, pair.collision && pair.collision.normal);
          if (def.onHit) def.onHit(other.prop, speed, point, part.partName);
          if (def.scuffMul !== 0) {
            B.bonk(part.partName, speed, point, { payMul: def.payMul, scuffMul: def.scuffMul });
            if (speed > Bonk.CONFIG.bigBonkSpeed) shakeScreen(Bonk.clamp(speed / 26, 0.2, 1));
          }
          continue;
        }

        if (other.isStatic) {
          var floorSpeed = Math.hypot(part.velocity.x, part.velocity.y);
          /* Every rebound off the room gets its tumble and its star. */
          if (B.phase === 'ragdoll') B.bounce(floorSpeed, point, pair.collision && pair.collision.normal);
          B.bonk(part.partName, floorSpeed, point, { payMul: 0.7, scuffMul: 0.75 });
          if (floorSpeed > Bonk.CONFIG.bigBonkSpeed) {
            shakeScreen(Bonk.clamp(floorSpeed / 26, 0.2, 0.8));
            Bonk.Particles.dust(point.x, point.y, 5, 0.8);
          }
        }
        continue;
      }

      /* Prop meets prop or prop meets room. */
      var prop = a.prop || b.prop;
      if (prop && !prop.erasing) {
        var otherBody = a.prop === prop ? b : a;
        if (otherBody.propKind === 'trampoline' && otherBody.prop && !otherBody.prop.erasing) {
          bounceOffTrampoline(prop.body, otherBody.prop);
          continue;
        }
        prop.squish = Math.min(1, prop.squish + speed / 18);
        if (prop.def.onLand && otherBody.isStatic) {
          prop.def.onLand(prop, speed, contactPoint(pair, prop.body.position));
        }
        if (speed > 7) Bonk.Sound.thud(Bonk.clamp(speed / 20, 0.1, 0.7));
      }
    }
  }

  function onCollisionActive(evt) {
    for (var i = 0; i < evt.pairs.length; i++) {
      var pair = evt.pairs[i];
      if (pair.bodyA.isBuddy || pair.bodyB.isBuddy) {
        Bonk.Buddy.grounded = 0.18;
        var other = pair.bodyA.isBuddy ? pair.bodyB : pair.bodyA;
        if (other.propKind === 'trampoline' && other.prop && !other.prop.erasing && Math.abs(Bonk.Buddy.parts.chest.velocity.y) > 2) {
          bounceOffTrampoline(Bonk.Buddy.parts.chest, other.prop);
        }
      }
    }
  }

  /* ---- world effects ----------------------------------------------------- */
  function shakeScreen(amount) {
    if (Bonk.state.reducedMotion) return;
    shake.amount = Math.min(1, shake.amount + amount);
  }
  Bonk.shakeScreen = shakeScreen;

  Bonk.flipGravity = function () {
    gravityFlip = 6.5;
    Bonk.Sound.party();
    Bonk.Buddy.say(Bonk.pick(['whoa', 'up is down', 'physics!', 'ceiling office']), 2.2);
    Bonk.pay(8, Bonk.Buddy.center());
    /* Give everything a nudge so nothing sits glued to the floor. */
    Bonk.Buddy.bodies.concat(
      Bonk.Props.list.map(function (p) {
        return p.body;
      })
    ).forEach(function (b) {
      if (!b.isStatic) M.Body.applyForce(b, b.position, { x: Bonk.rand(-0.0004, 0.0004) * b.mass, y: -0.0006 * b.mass });
    });
  };

  Bonk.onFriendBought = function () {
    Bonk.Friend.spawn(engine.world, Bonk.Buddy.center().x - 70, room.bottom - 40);
  };

  Bonk.freshPage = function () {
    aim.active = false;
    Bonk.state.starShower = 0;
    Bonk.Ride.active = false;
    Bonk.Fort.reset();
    Bonk.Props.clear();
    Bonk.Particles.clear();
    Bonk.Buddy.reset((room.left + room.right) / 2, room.bottom);
    gravityFlip = 0;
    engine.gravity.y = 1;
    if (!Bonk.state.reducedMotion) pageFlip = 1;
    Bonk.Sound.page();
    Bonk.Buddy.say(Bonk.pick(['fresh page.', 'clean slate', 'nice.']), 1.8);
  };

  /* ---- drawing ----------------------------------------------------------- */
  function buildRoomStrokes() {
    /* Hand-ruled twice, the way you would trace a box you drew slightly wrong
       the first time. Precomputed so the tremor never shimmers. */
    function edge(x1, y1, x2, y2, seed) {
      return [D.wobble([{ x: x1, y: y1 }, { x: x2, y: y2 }], seed, 1.5, 22), D.wobble([{ x: x1, y: y1 }, { x: x2, y: y2 }], seed + 200, 2.4, 30)];
    }
    roomStrokes = {
      floor: edge(room.left, room.bottom, room.right, room.bottom, 11),
      ceiling: edge(room.left, room.top, room.right, room.top, 71),
      leftWall: edge(room.left, room.top, room.left, room.bottom, 131),
      rightWall: edge(room.right, room.top, room.right, room.bottom, 191)
    };
  }

  function drawPaper() {
    ctx.fillStyle = P.paper;
    ctx.fillRect(0, 0, W, H);

    var g = 26;
    ctx.save();
    ctx.strokeStyle = P.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (var x = (W % g) / 2; x < W; x += g) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
    }
    for (var y = (H % g) / 2; y < H; y += g) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawRoom() {
    if (!roomStrokes) buildRoomStrokes();
    var opts1 = { color: P.ink, width: 3.4, alpha: 0.92 };
    var opts2 = { color: P.ink, width: 1.7, alpha: 0.33 };
    ['ceiling', 'leftWall', 'rightWall', 'floor'].forEach(function (k) {
      D.strokePath(ctx, roomStrokes[k][0], k === 'floor' ? { color: P.ink, width: 4.2, alpha: 0.95 } : opts1);
      D.strokePath(ctx, roomStrokes[k][1], opts2);
    });
    /* A little hatching under the floor so the box reads as a room. */
    D.hatch(ctx, room.left, room.bottom + 3, room.right - room.left, 22, { gap: 13, alpha: 0.28, width: 1.4 });
  }

  function drawCursor() {
    var st = Bonk.state;
    var pt = st.pointer;
    if (!pt.inside || st.shopOpen) return;
    ctx.save();
    ctx.translate(pt.x, pt.y);

    if (st.tool === 'hand') {
      var grab = pt.down ? 1 : 0;
      ctx.rotate(-0.18);
      var palm = D.circlePoints(0, 4, 8 - grab * 1.5, 3, 0.7);
      D.fillPath(ctx, palm, P.paper, 0.92);
      D.strokePath(ctx, palm, { color: P.ink, width: 2.2 });
      for (var i = 0; i < 4; i++) {
        var fx = -5.5 + i * 3.7;
        var len = (9 - Math.abs(i - 1.4) * 1.3) * (1 - grab * 0.55);
        D.line(ctx, fx, -2, fx - 1, -2 - len, { color: P.ink, width: 2.2, seed: 30 + i * 7, amp: 0.4, spacing: 4 });
      }
      D.line(ctx, -7, 4, -12, 0.5, { color: P.ink, width: 2.2, seed: 61, amp: 0.4, spacing: 4 });
    } else if (st.tool === 'feather') {
      ctx.rotate(0.5 + Math.sin(st.time * 7) * 0.14);
      D.line(ctx, 0, 14, 1, -13, { color: P.ink, width: 2.2, seed: 9, amp: 0.5 });
      for (var f = 0; f < 7; f++) {
        var t = f / 6;
        var y = 10 - t * 21;
        var w = 9 * Math.sin(t * 3.1) + 2;
        D.line(ctx, 0.6, y, -w, y - 4, { color: P.pencil, width: 1.6, seed: f * 11, amp: 0.4, spacing: 4 });
        D.line(ctx, 0.6, y, w, y - 4, { color: P.pencil, width: 1.6, seed: f * 11 + 3, amp: 0.4, spacing: 4 });
      }
    } else {
      /* Every other tool is a "drop it here" marker. */
      var def = Bonk.Tools.all[st.tool];
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = P.marker;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, 6.29);
      ctx.stroke();
      ctx.restore();
      var placeable = def && def.place;
      var arrow = placeable ? 1 : -1;
      D.strokePath(
        ctx,
        [
          { x: 0, y: -6 * arrow },
          { x: 0, y: 6 * arrow },
          { x: -4, y: 2 * arrow },
          { x: 0, y: 6 * arrow },
          { x: 4, y: 2 * arrow }
        ],
        { color: P.marker, width: 2.2 }
      );
    }
    ctx.restore();
  }

  /* The aiming line and a sketchy dotted arc showing where it will land. */
  function drawAim() {
    if (!aim.active) return;
    var v = launchVelocity();
    var power = Math.hypot(v.x, v.y);
    if (power < 1.2) return;

    D.line(ctx, aim.x1, aim.y1, aim.x0, aim.y0, { color: P.pencil, width: 1.8, alpha: 0.5, seed: 3, amp: 0.8 });

    /* Ballistic preview at the same step size the engine uses. */
    var x = aim.x0;
    var y = aim.y0;
    var vx = v.x;
    var vy = v.y;
    var g = engine.gravity.y * engine.gravity.scale * STEP * STEP;
    for (var i = 0; i < 90; i++) {
      x += vx;
      y += vy;
      vy += g;
      if (x < room.left || x > room.right || y > room.bottom) break;
      if (i % 5 === 0) {
        var fade = 0.85 * (1 - i / 90);
        var r = 3.1 - i / 44;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.fillStyle = P.marker;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.1, r), 0, 6.29);
        ctx.fill();
        ctx.restore();
      }
    }

    /* A little power gauge at the anchor. */
    var pct = Math.min(1, power / MAX_LAUNCH);
    D.circle(ctx, aim.x0, aim.y0, 10 + pct * 7, { color: P.marker, width: 2, alpha: 0.75, seed: 21, amp: 1 });
  }

  /* A blank sheet lying over the page, sliding off to the right to reveal the
     fresh one underneath. */
  function drawPageFlip() {
    if (pageFlip <= 0) return;
    var t = 1 - pageFlip;
    var x = t * t * (W + 80);
    ctx.save();
    ctx.globalAlpha = 0.97;
    ctx.fillStyle = P.paper;
    ctx.fillRect(x, 0, W + 80, H);
    ctx.strokeStyle = P.pencil;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x - 24 * Math.sin(t * 3.1), H / 2, x, H);
    ctx.stroke();
    ctx.restore();
  }

  /* ---- loop -------------------------------------------------------------- */
  function frame(now) {
    var dt = Math.min(64, now - last);
    last = now;
    var dts = dt / 1000;
    var st = Bonk.state;

    if (!st.shopOpen) {
      st.time += dts;

      /* Fixed-step physics, capped so a background tab does not fast-forward
         the whole room when it comes back. */
      acc = Math.min(acc + dt, STEP * 4);
      var guard = 0;
      while (acc >= STEP && guard < 4) {
        acc -= STEP;
        guard++;
        Bonk.Buddy.update(STEP / 1000, engine.world);
        Bonk.Props.update(STEP / 1000);
        Bonk.Fort.update(STEP / 1000);
        Bonk.Ride.update(STEP / 1000);
        Bonk.Friend.update(STEP / 1000);
        Bonk.Gift.update(STEP / 1000);
        M.Engine.update(engine, STEP);
      }

      /* Pointer-driven forces run once per frame, not once per substep, so a
         fast flick cannot be applied three times over. */
      handleHover(dts);
      mouseConstraint.collisionFilter.mask = st.tool === 'hand' ? 0xffffffff : 0;
      if (grabbedBuddy) Bonk.Buddy.goRagdoll(0.12);
      Bonk.state.pointer.vx *= 0.55;
      Bonk.state.pointer.vy *= 0.55;

      trampolineCooldown = Math.max(0, trampolineCooldown - dts);
      Bonk.Particles.update(dts);

      /* Gravity flip eases out and back so nothing teleports. */
      if (gravityFlip > 0) {
        gravityFlip -= dts;
        var phase = Bonk.clamp(Math.min(gravityFlip / 1.2, (6.5 - gravityFlip) / 1.2), 0, 1);
        engine.gravity.y = Bonk.lerp(1, -0.42, phase);
        if (gravityFlip <= 0) engine.gravity.y = 1;
      }

      if (shake.amount > 0) {
        shake.amount = Math.max(0, shake.amount - dts * 3.4);
        shake.x = Bonk.rand(-1, 1) * shake.amount * 9;
        shake.y = Bonk.rand(-1, 1) * shake.amount * 9;
      } else {
        shake.x = shake.y = 0;
      }
      if (pageFlip > 0) pageFlip = Math.max(0, pageFlip - dts * 2.4);
    }

    Bonk.UI.update(dts);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPaper();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    drawRoom();
    Bonk.Sun.draw(ctx);
    Bonk.BuddyDraw.drawUnder(ctx);
    Bonk.Props.draw(ctx);
    Bonk.Fort.draw(ctx);
    Bonk.Ride.draw(ctx);
    Bonk.BuddyDraw.draw(ctx);
    Bonk.Friend.draw(ctx);
    Bonk.Gift.draw(ctx);
    Bonk.Fort.drawOver(ctx);
    Bonk.Particles.draw(ctx);
    ctx.restore();
    drawAim();
    drawCursor();
    drawPageFlip();

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
