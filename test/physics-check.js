/* Headless feel-check for the ragdoll. Run: node test/physics-check.js
   Steps the same code the page runs and reports the numbers that decide whether
   the toy feels right: does he settle upright, do the joints stay together, does
   any limb run away with energy, and does recovery blend rather than snap. */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var Matter = require(path.join(root, 'vendor/matter.min.js'));

global.window = global;
global.Matter = Matter;

['js/state.js', 'js/buddy.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
});

var Bonk = global.Bonk;
var W = 900;
var H = 560;
var FLOOR_Y = 500;

var engine = Matter.Engine.create();
engine.positionIterations = 14;
engine.velocityIterations = 10;
engine.constraintIterations = 6;

var walls = [
  Matter.Bodies.rectangle(W / 2, FLOOR_Y + 30, W, 60, { isStatic: true, friction: 0.8 }),
  Matter.Bodies.rectangle(-30, H / 2, 60, H * 2, { isStatic: true }),
  Matter.Bodies.rectangle(W + 30, H / 2, 60, H * 2, { isStatic: true }),
  Matter.Bodies.rectangle(W / 2, -30, W, 60, { isStatic: true })
];
Matter.Composite.add(engine.world, walls);

var buddy = Bonk.Buddy.create(engine.world, W / 2, FLOOR_Y);

Matter.Events.on(engine, 'beforeUpdate', function () {
  buddy.clampVelocities();
  buddy.applyMuscles(1 / 60);
  buddy.enforceJointLimits();
});
Matter.Events.on(engine, 'collisionActive', markGround);
Matter.Events.on(engine, 'collisionStart', markGround);
function markGround(evt) {
  for (var i = 0; i < evt.pairs.length; i++) {
    var p = evt.pairs[i];
    if (p.bodyA.isBuddy || p.bodyB.isBuddy) buddy.grounded = 0.16;
  }
}

var DT = 1000 / 60;
function step(n) {
  for (var i = 0; i < n; i++) {
    Bonk.state.time += DT / 1000;
    buddy.update(DT / 1000, engine.world);
    Matter.Engine.update(engine, DT);
  }
}

/* Matter rotates constraint.pointA/pointB in place to follow their bodies, so
   the anchors are already in the body's current frame - rotating them again
   here would report a separation that does not exist. */
function jointStretch() {
  var worst = 0;
  buddy.constraints.forEach(function (c) {
    var a = Matter.Vector.add(c.bodyA.position, c.pointA);
    var b = Matter.Vector.add(c.bodyB.position, c.pointB);
    worst = Math.max(worst, Matter.Vector.magnitude(Matter.Vector.sub(a, b)));
  });
  return worst;
}

function headHeight() {
  return FLOOR_Y - buddy.parts.head.position.y;
}

function maxAngularVel() {
  return buddy.bodies.reduce(function (m, b) {
    return Math.max(m, Math.abs(b.angularVelocity));
  }, 0);
}

function finite() {
  return buddy.bodies.every(function (b) {
    return isFinite(b.position.x) && isFinite(b.position.y) && isFinite(b.angle);
  });
}

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: ok, detail: detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '  ' + detail);
}

/* ---- 1. he stands on his own ---------------------------------------- */
step(300); // 5s
var restHeight = headHeight();
check('stands upright unaided', restHeight > 118 && restHeight < 150, 'head ' + restHeight.toFixed(1) + 'px above floor (expect ~125-142)');
check('joints hold together at rest', jointStretch() < 3.5, 'worst joint separation ' + jointStretch().toFixed(2) + 'px');
check('no residual spin at rest', maxAngularVel() < 0.06, 'max |angular velocity| ' + maxAngularVel().toFixed(4));

/* Height must be near-constant while idle: drift means he is sinking or
   levitating rather than standing. */
var hs = [];
for (var i = 0; i < 120; i++) {
  step(1);
  hs.push(headHeight());
}
var spread = Math.max.apply(null, hs) - Math.min.apply(null, hs);
check('idle height is stable', spread < 6, 'head height varies ' + spread.toFixed(2) + 'px over 2s (breathing sway)');

/* ---- 2. a hard fling ragdolls and does not explode -------------------- */
Matter.Body.setVelocity(buddy.parts.chest, { x: 26, y: -19 });
Matter.Body.setAngularVelocity(buddy.parts.chest, 0.5);
buddy.bonk('chest', 30, { x: buddy.parts.chest.position.x, y: buddy.parts.chest.position.y });

var smudgedAtBonk = Object.keys(buddy.strokes).filter(function (k) {
  return buddy.strokes[k].smudged;
});
check('big bonk released the muscles', buddy.phase === 'ragdoll', 'phase "' + buddy.phase + '"');
check('big bonk smudged limbs for the redraw', smudgedAtBonk.length > 0, 'smudged: ' + smudgedAtBonk.join(', '));

var worstDuringFlight = 0;
var worstSpeed = 0;
var minStrength = 1;
for (var j = 0; j < 45; j++) {
  step(1);
  minStrength = Math.min(minStrength, buddy.strength);
  worstDuringFlight = Math.max(worstDuringFlight, jointStretch());
  worstSpeed = Math.max(
    worstSpeed,
    buddy.bodies.reduce(function (m, b) {
      return Math.max(m, b.speed);
    }, 0)
  );
}
check('limbs stay attached through a hard fling', worstDuringFlight < 9, 'worst joint separation ' + worstDuringFlight.toFixed(2) + 'px');
check('no runaway energy', worstSpeed <= 27 && finite(), 'peak body speed ' + worstSpeed.toFixed(1) + 'px/step (capped at 26)');
check('went fully limp mid-flight', minStrength < 0.05, 'lowest muscle strength ' + minStrength.toFixed(3) + ' (0 = full ragdoll)');

/* ---- 3. recovery blends in rather than snapping ----------------------- */
var sawGetup = false;
var maxJump = 0;
var prev = buddy.strength;
for (var k = 0; k < 420; k++) {
  step(1);
  if (buddy.phase === 'getup') sawGetup = true;
  maxJump = Math.max(maxJump, Math.abs(buddy.strength - prev));
  prev = buddy.strength;
}
check('recovery sequence ran', sawGetup, 'reached "getup", ended at "' + buddy.phase + '"');
check('muscle blend never snaps', maxJump < 0.06, 'largest single-step strength change ' + maxJump.toFixed(4) + ' (a snap would be ~1.0)');
check('back on his feet after recovery', headHeight() > 110, 'head ' + headHeight().toFixed(1) + 'px above floor');
check('smudged strokes redrew to full ink', !Object.keys(buddy.strokes).some(function (kk) { return buddy.strokes[kk].smudged; }), 'all limb strokes back to ink 1.0');

/* ---- 4. survives sustained abuse ------------------------------------- */
for (var r = 0; r < 12; r++) {
  Matter.Body.setVelocity(buddy.parts.head, { x: (Math.random() - 0.5) * 60, y: -Math.random() * 34 });
  buddy.bonk('head', 20 + Math.random() * 14, buddy.parts.head.position);
  step(90);
}
step(600);
/* Twelve bonks make him grumpy, and a grumpy buddy sits down with his arms
   crossed - so the upright height bar drops when he has chosen to sit. */
var sitting = buddy.idle.name === 'sit' || buddy.idle.name === 'protest';
check(
  'survives 12 hard bonks in a row',
  finite() && jointStretch() < 1 && headHeight() > (sitting ? 60 : 100) && buddy.phase === 'stand',
  'head ' + headHeight().toFixed(1) + 'px, worst joint ' + jointStretch().toFixed(2) + 'px, phase ' + buddy.phase + ', mood ' + Bonk.state.mood.toFixed(2) + ', doing "' + buddy.idle.name + '"'
);

/* ---- 5. step cost ---------------------------------------------------- */
var t0 = process.hrtime.bigint();
step(600);
var ms = Number(process.hrtime.bigint() - t0) / 1e6 / 600;
check('physics step is cheap', ms < 2.2, ms.toFixed(3) + 'ms per step (16.7ms budget at 60fps)');

var failed = results.filter(function (r2) {
  return !r2.ok;
});
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
process.exit(failed.length ? 1 : 0);
