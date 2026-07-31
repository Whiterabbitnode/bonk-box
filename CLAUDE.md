# CLAUDE.md — Bonk Box

A browser physics toy: a stickman doodle on a sketchbook page that you fling
around, drop props on, and cheer up. Loving parody homage to Interactive Buddy
(2005). Tone is Looney Tunes: warm slapstick, and **he is always fine**.

## Vocabulary rules (hard requirement)

These apply everywhere — identifiers, function names, comments, UI copy, commit
messages, docs.

**Use:** bonk, boop, plop, splash, drop, whoosh, flick, scuff, mend, tidy,
erase, squash, boing.

**Never use:** kill, destroy, attack, weapon, shoot, bomb, explode, hurt, pain,
punish, torture, or damage as a noun. Injury is always **"scuffs"**. The anvil
*drops*, the balloon *splashes*, old props get *erased*.

No firearms or weapons of any kind. Props are classic cartoon slapstick only:
anvil, beach ball, water balloon, piano, feather, trampoline, fan, cookie,
confetti, bowling ball.

No gore, no blood, no injury realism. Scuffs are dizzy spiral eyes, orbiting
stars, band-aid crosses, frazzled hair, squash-and-stretch — and all of it heals
visibly on screen.

## Hard technical constraints

- **Must run by double-clicking `index.html` from `file://` with zero build
  step.** That means classic `<script>` tags, never ES module imports — Chrome
  blocks module imports on `file://`. Everything shares the `window.Bonk`
  namespace object.
- **matter-js is vendored** at `vendor/matter.min.js`. Do not hotlink it.
- The Google Fonts `<link>` is the only permitted network fetch, and the page
  must stay fully functional without it. No backend, no analytics, no other
  external calls.
- Never use Matter's built-in renderer. Everything is drawn by hand on one
  canvas.
- Sound is WebAudio-synthesised one-shots only. No audio files. Audio starts on
  the first user gesture; mute persists.

## Physics rules learned the hard way

Three of these were bugs that cost real time. Do not undo them.

1. **Muscles apply torque, never `Body.setAngularVelocity`.** Setting angular
   velocity every step rewrites `body.anglePrev`, which is exactly where Matter's
   constraint solver parks its correction from the previous step. Doing that per
   frame tears the joints apart under load. Matter converts torque as
   `torque / inertia * dt²`; `DT2` in `js/buddy.js` is that factor.
2. **Joint anchor pairs must coincide exactly in the build pose.** A few pixels
   of mismatch is a permanent tug the solver can never satisfy, and it shows as
   limbs hanging slightly out of their sockets forever.
3. **Matter mutates `constraint.pointA`/`pointB` in place** to track their
   bodies' rotation. When measuring joint separation, do *not* rotate them again
   — they are already in the body's current frame.
4. **Muscle strength blends, never snaps.** A snap reads as teleporting and
   destroys the feel. `test/physics-check.js` asserts the largest single-step
   change stays under 0.06.
5. **A pose target that moves faster than the muscles can track gets attenuated
   into a twitch.** If an animation looks weak, slow the target before reaching
   for more gain.
6. **One impact fires a collision pair per limb it touches.** `Buddy.bonk` has a
   0.15s impact window so a single anvil does not scuff and pay five times over.

## Feel is the acceptance bar

Not "it compiles" and not "the test passes". No constraint jitter, no exploding
limbs, no judder, no recovery that snaps instead of flowing, 60fps on a MacBook.
If flinging him around is not genuinely pleasing, it is not done.

Before claiming physics work is finished:

```bash
node test/physics-check.js   # all 16 checks
```

Then look at it in a browser. The headless check catches broken; it cannot
tell you whether something is delightful.

## Verification

Use the agent-browser CLI with a unique `--session`, re-snapshot after any DOM
change, and always `close` when done. Screenshots are evidence only if you read
them. For anything about internal state, prefer `agent-browser eval` over
inferring from a static frame — several apparent rendering bugs here turned out
to be idle animations caught mid-motion.

## Design

Palette (in `Bonk.PALETTE`, mirrored in `css/style.css` custom properties):
paper `#FAF7F2`, graph grid `#D9E4EE`, ink `#2B2B33`, marker red `#E0533D` used
sparingly, highlighter yellow `#FFD84D`, pencil grey `#8A8F98`.

The signature element is **recovery-by-redrawing**: after a big ragdoll some limb
strokes go smudged, and they redraw themselves tip-to-tail during the get-up.
It lives in `drawLimb()` in `js/buddy-draw.js` and the stroke ink state in
`js/buddy.js`. Protect it.

Respect `prefers-reduced-motion`: it skips screen shake and the page-flip
flourish. Keep visible keyboard focus states. Desktop-first; touch should
basically work.

The footer line stays exactly as it is:
"a loving parody of Interactive Buddy (2005) · made with ♥ by Granular".
