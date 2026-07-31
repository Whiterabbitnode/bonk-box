/* Bonk Box - reacting to your coding agent.

   The desktop app runs a small localhost listener and forwards event TYPES
   here. Five words, nothing else: oops, cheer, heated, echo-absolutely-right,
   bonk. No prompt text, no output, no file paths ever reach this file, because
   none of it ever leaves the hook script that noticed it.

   In a plain browser this file does nothing at all - there is no Tauri bridge
   to listen to, so the web toy is untouched. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});

  var Agent = {
    ask: null, // the heated prompt, when he is offering to take one for you
    lastAuto: 0,

    /* Every reaction is something he already knows how to do. */
    react: function (kind) {
      var B = Bonk.Buddy;
      if (!B || !B.parts) return;
      var here = B.center();

      switch (kind) {
        case 'oops':
          B.goRagdoll(0.4);
          B.say('shipping a fix...', 3.4);
          B.sign = { text: 'shipping a fix...', t: 0, dur: 3.4 };
          Bonk.addMood(-0.12);
          Bonk.Sound.thud(0.5);
          break;

        case 'cheer':
          B.party();
          Bonk.Particles.confetti(here.x, here.y - 40, 46);
          Bonk.Particles.star(here.x, here.y - 30, 8);
          Bonk.Sound.party();
          Bonk.addMood(0.3);
          break;

        case 'echo-absolutely-right':
          B.say("you're absolutely right.", 3.6);
          B.idle = { name: 'lookaround', t: 0, dur: 2.4 };
          Bonk.Sound.pop(1.2);
          break;

        case 'heated':
          this.offer();
          break;

        case 'update':
          break; // the sign is raised by updateReady()

        case 'bonk':
          B.say(Bonk.pick(['reporting in.', 'you rang?', 'go on then.']), 2.4);
          B.idle = { name: 'wave', t: 0, dur: 2.2 };
          Bonk.Sound.pop(1.4);
          break;
      }
    },

    /* The ask. He holds up a sign and offers himself as the outlet. */
    offer: function () {
      var B = Bonk.Buddy;
      this.ask = { t: 0 };
      document.body.classList.add('reacting');
      B.speech = null;
      B.idle = { name: 'lookaround', t: 0, dur: 6 };
      Bonk.Sound.pop(0.8);
    },

    accept: function () {
      this.dismiss(true); // you want him: he stays
      var B = Bonk.Buddy;
      Bonk.state.tool = 'hand';
      if (Bonk.UI) Bonk.UI.selectTool('hand');
      B.say(Bonk.pick(['do your worst.', 'ready.', 'go on.']), 2.6);
      B.idle = { name: 'breathe', t: 0, dur: 2 };
      if (window.__TAURI__ && window.__TAURI__.core) window.__TAURI__.core.invoke('set_engaged', { engaged: true });
    },

    decline: function () {
      this.dismiss();
      var B = Bonk.Buddy;
      B.say(Bonk.pick(['respect.', 'good. breathe.', 'proud of you.']), 3);
      B.idle = { name: 'wave', t: 0, dur: 2.2 };
      Bonk.addMood(0.2);
      Bonk.Particles.hearts(B.center().x, B.center().y - 34, 3);
      if (window.__TAURI__ && window.__TAURI__.core) window.__TAURI__.core.invoke('set_engaged', { engaged: false });
    },

    update: function (dt) {
      if (this.ask) {
        this.ask.t += dt;
        if (this.ask.t > 15) this.dismiss(); // he does not nag
      }
    },

    /* Clear the ask completely - sign, buttons, hit boxes, chrome fade. A
       half-dismissed ask leaves invisible buttons on the page. */
    dismiss: function (stayOpen) {
      this.ask = null;
      this.pending = null;
      document.body.classList.remove('reacting');
      /* Unless you chose to keep playing with him, he leaves entirely. */
      if (!stayOpen && window.__TAURI__ && window.__TAURI__.core) {
        window.setTimeout(function () {
          window.__TAURI__.core.invoke('stand_down');
        }, 900);
      }
    },

    /* A newer build exists. He is the one who tells you. */
    updateReady: function (version, url) {
      this.pending = { version: version, url: url };
      this.ask = { t: 0, kind: 'update' };
      document.body.classList.add('reacting');
      Bonk.Buddy.speech = null;
      Bonk.Sound.pop(1.3);
    },

    upToDate: function () {
      Bonk.Buddy.say(Bonk.pick(['all up to date.', 'newest me.', 'nothing new.']), 2.6);
    },

    updateNow: function () {
      var B = Bonk.Buddy;
      var p = this.pending;
      this.dismiss(true); // he is about to relaunch anyway
      B.say('back in a moment...', 6);
      B.idle = { name: 'wave', t: 0, dur: 3 };
      if (p && window.__TAURI__ && window.__TAURI__.core) {
        window.__TAURI__.core.invoke('apply_update', { url: p.url }).catch(function () {
          B.say('could not fetch it. later, then.', 3.4);
        });
      }
    },

    updateLater: function () {
      this.dismiss();
      Bonk.Buddy.say(Bonk.pick(['fair enough.', 'later then.', 'no rush.']), 2.4);
    },

    /* Hit test for the two drawn buttons, in canvas coordinates. */
    buttonAt: function (x, y) {
      if (!this.ask || !this.ask.boxes) return null;
      var b = this.ask.boxes;
      if (x >= b.yes.x && x <= b.yes.x + b.yes.w && y >= b.yes.y && y <= b.yes.y + b.yes.h) return 'yes';
      if (x >= b.no.x && x <= b.no.x + b.no.w && y >= b.no.y && y <= b.no.y + b.no.h) return 'no';
      return null;
    },

    draw: function (ctx) {
      if (!this.ask) return;
      var D = Bonk.Doodle;
      var P = Bonk.PALETTE;
      var B = Bonk.Buddy;
      var R = Bonk.room;
      var fade = Math.min(1, this.ask.t * 3);

      /* The placard, held up over his head. Eddie's line, self-bleeped. */
      var update = this.ask.kind === 'update';
      var line = update
        ? 'v' + (this.pending ? this.pending.version : '?') + ' is out.'
        : 'Do you want to f— this agent up?';
      /* Shrink the lettering until it fits the room he is actually in - the
         small peek box is far narrower than the full toy, and a clipped sign
         is worse than a smaller one. */
      var avail = R.right - R.left - 24;
      var size = 17;
      while (size > 10 && D.measure(ctx, line, size) + 30 > avail) size -= 1;
      var w = Math.min(avail, D.measure(ctx, line, size) + 30);
      var h = size + 26;
      var x = Bonk.clamp(B.center().x - w / 2, R.left + 10, R.right - w - 10);
      var y = Math.max(R.top + 6, B.parts.head.position.y - (h + 64));

      ctx.save();
      ctx.globalAlpha = fade;
      D.line(ctx, B.center().x, B.parts.head.position.y - 16, x + w / 2, y + h, { color: P.pencil, width: 3, seed: 5, amp: 0.6 });
      var card = D.rectPoints(x, y, w, h, 13, 1.2);
      D.fillPath(ctx, card, P.paper, 0.97);
      D.strokePath(ctx, card, { color: P.ink, width: 2.4 });
      D.text(ctx, line, x + w / 2, y + h / 2, { size: size, color: P.ink });

      /* Two hand-drawn buttons under it. */
      var bw = Math.min(150, (w - 16) / 2);
      var bh = Math.max(26, size + 12);
      var by = y + h + 10;
      var yesX = x + w / 2 - bw - 4;
      var noX = x + w / 2 + 4;

      var yes = D.rectPoints(yesX, by, bw, bh, 21, 1);
      D.fillPath(ctx, yes, P.marker, 0.14);
      D.strokePath(ctx, yes, { color: P.marker, width: 2.4 });
      var blab = Math.max(11, size - 3);
      D.text(ctx, update ? 'update now' : 'yes, absolutely', yesX + bw / 2, by + bh / 2, { size: blab, color: P.marker });

      var no = D.rectPoints(noX, by, bw, bh, 33, 1);
      D.fillPath(ctx, no, P.paper, 0.9);
      D.strokePath(ctx, no, { color: P.pencil, width: 2.2 });
      D.text(ctx, update ? 'later' : "I'm calm", noX + bw / 2, by + bh / 2, { size: blab, color: P.pencil });
      ctx.restore();

      this.ask.boxes = {
        yes: { x: yesX, y: by, w: bw, h: bh },
        no: { x: noX, y: by, w: bw, h: bh }
      };
    },

    /* Wire up to the desktop shell, if we are running inside it. */
    init: function () {
      var self = this;
      /* The bridge is injected by the desktop shell and may not be there the
         instant this runs, so try again for a moment before giving up. In a
         plain browser it never arrives and we simply do nothing. */
      var tries = 0;
      (function attach() {
        var T = window.__TAURI__;
        if (!T || !T.event || !T.event.listen) {
          if (++tries < 40) return window.setTimeout(attach, 100);
          return;
        }
        self.listen(T);
      })();
    },

    listen: function (T) {
      var self = this;
      self.wired = true;
      T.event.listen('bonk-event', function (e) {
        self.react(e.payload);
      });
      T.event.listen('bonk-retreat', function () {
        self.dismiss();
      });
      /* Any click into the window counts as engaging with him. */
      window.addEventListener('pointerdown', function (e) {
        /* Answering the ask is not the same as settling in to play - the
           button handlers decide what happens next, so do not mark him
           engaged out from under them. */
        var onButton = self.ask && self.buttonAt(e.clientX, e.clientY);
        if (!onButton && T.core) T.core.invoke('set_engaged', { engaged: true });
      });
    }
  };

  Bonk.Agent = Agent;
})();
