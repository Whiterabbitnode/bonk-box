# CLAUDE.md — Bonk Box

A browser physics toy: a stickman doodle on a sketchbook page that you fling
around, drop props on, and cheer up. Loving parody homage to Interactive Buddy
(2005). Tone is Looney Tunes: warm slapstick, and **he is always fine**.

## Vocabulary rules (hard requirement)

These apply everywhere — identifiers, function names, comments, UI copy, commit
messages, docs.

**Use:** bonk, boop, plop, splash, drop, whoosh, flick, scuff, mend, tidy,
erase, squash, boing, popper, firework, burst, pop, fizzle, sling.

**Never use:** kill, destroy, attack, weapon, shoot, bomb, explode, hurt, pain,
punish, torture, or damage as a noun. Injury is always **"scuffs"**. The anvil
*drops*, the balloon *splashes*, old props get *erased*.

No firearms or weapons of any kind. Props are classic cartoon slapstick only:
anvil, beach ball, water balloon, piano, feather, trampoline, fan, cookie,
confetti, bowling ball, sticks, party popper, firework.

The two celebration toys are **popper** and **firework** in every identifier and
every line of copy. `BOOM` and `POP!` are allowed as hand-lettered burst text on
screen, because that is comic lettering. They are not allowed as names for
anything in the code.

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
7. **Restitution alone will not make a ragdoll bounce.** Eleven loosely jointed
   bodies swallow an impact through the joints. `Buddy.bounce()` reflects the
   whole figure off the surface together, which is what reads as cartoon.
8. **Muscles cut out the same frame he goes limp.** The balance controller damps
   about a third of his velocity per step, so any lingering muscle strength eats
   a throw. Blending applies on the way back in only.
9. **Walking is the balance controller aimed ahead of him**, not extra force.
   Pushing against that controller gets you a twelve-pixels-a-second shuffle.
10. **A plank is 70 long by 10 thick, so angle 0 is FLAT.** The fort's slot
    angles are absolute body angles, not tilts from vertical.
11. **Never ask the window which monitor it is on.** `current_monitor()`
    returns None once the window sits outside every screen, so any position
    derived from it fails exactly when it is needed to bring the window back.
    Work from `primary_monitor()`. A peek that parks off screen and then cannot
    compute its way home kills the whole hooks feature in total silence.
12. **A flag set before a fallible step must come back down on every path.**
    The sliding flag leaked through an early return and wedged every future
    peek into a no-op. It is an RAII guard now.
13. **The fort is judged against where it came to rest**, and against its
    height, not against its ideal slots. Planks shift as they stack, and his
    own settling otherwise reads as vandalism.

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

## Peek policy (binding)

He appears for **heated**, **⌥⌘B** and **bonk** only. Ambient events (oops,
cheer, echo) are off by default and re-enabled per event in config. An ask must
dismiss completely — sign, buttons, hit boxes and chrome fade — on answer or
after 15 seconds. A half-dismissed ask leaves invisible buttons on the page.

## Updating

Self-update shells out to `curl` and `ditto` rather than taking a dependency,
stages the whole app before touching `/Applications`, and hands off to a
detached helper for the swap. Tauri's official updater plugin with signed
manifests is the robust long-term answer; it needs signing-key management, which
was deliberately not taken on here.

## Verification

Use the agent-browser CLI with a unique `--session`, re-snapshot after any DOM
change, and always `close` when done. Screenshots are evidence only if you read
them. For anything about internal state, prefer `agent-browser eval` over
inferring from a static frame — several apparent rendering bugs here turned out
to be idle animations caught mid-motion.

## Desktop app

`desktop/` is a Tauri v2 wrapper. `desktop/build-frontend.sh` copies the root
page into `desktop/dist/`; that folder is generated and gitignored, and the page
at the repo root stays the single source of truth. Never hand-edit anything
under `desktop/dist/`.

The menu-bar icon must be a **template** image: transparent background, solid
glyph (`desktop/src-tauri/icons/tray.png`). Handing it the app icon paints an
opaque blob, because template mode uses only the alpha channel. `Image::from_bytes`
needs tauri's `image-png` feature.

Rebuild with `cd desktop && npm run build`. Builds on this machine are arm64.

## Releasing

1. `cd desktop && npm run build`
2. `ditto -c -k --keepParent "src-tauri/target/release/bundle/macos/Bonk Box.app" "Bonk Box.app.zip"`
   — `ditto` rather than `zip`, to keep the bundle intact
3. `gh release create vX.Y.Z "Bonk Box.app.zip"`

`install.sh` pulls the newest release asset, unpacks it to `/Applications`,
clears the quarantine flag (the build is unsigned) and opens it.

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
