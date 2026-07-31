/* Bonk Box - the tally of how often you got heated at your agents.

   Three numbers arrive from the desktop shell and get drawn as pencil tally
   marks under the name tag. Nothing else ever comes across: no text, no dates
   beyond today and this week, no idea what you were working on. The counting
   and the reading both happen in desktop/src-tauri/src/heat.rs, which has the
   long version of the privacy story.

   In a plain browser this stays silent - the numbers never arrive, so nothing
   is drawn and the web toy is untouched. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});

  /* He only mentions it when he is already on your screen for another reason.
     The tally never summons him - that is the peek policy, and a scoreboard
     that opens a window to boast is a scoreboard you turn off. */
  var LINES = [
    'third time today. i\'m fine.',
    'for the record, i am counting.',
    'no notes. just the number.',
    'we\'ve both had a day.',
    'i keep the receipts.'
  ];

  var Heat = {
    today: 0,
    week: 0,
    all: 0,
    ready: false,
    shown: 0, // eases toward today, so a new mark draws itself on
    said: 0,

    set: function (today, week, all) {
      var rose = this.ready && today > this.today;
      this.today = today || 0;
      this.week = week || 0;
      this.all = all || 0;
      this.ready = true;
      if (rose) this.remark();
    },

    /* A dry aside, and only if you can already see him. */
    remark: function () {
      var B = Bonk.Buddy;
      if (!B || !B.parts) return;
      if (Bonk.Agent && Bonk.Agent.ask) return; // he is mid-question
      var now = performance.now();
      if (now - this.said < 60000) return;
      if (this.today < 3 || Math.random() > 0.5) return;
      this.said = now;
      var line = this.today === 3 ? LINES[0] : Bonk.pick(LINES.slice(1));
      B.say(line, 3.2);
    },

    update: function (dt) {
      var gap = this.today - this.shown;
      if (Math.abs(gap) < 0.02) this.shown = this.today;
      else this.shown += gap * Math.min(1, dt * 6);
    },

    /* Under the name tag when there is one, tucked into the corner when the
       small box has hidden it. Positioned through the same conversion every
       click uses, so it lands where it looks like it lands in both sizes. */
    anchor: function () {
      var tag = document.querySelector('.nametag');
      if (tag && tag.offsetParent && Bonk.toWorld) {
        var r = tag.getBoundingClientRect();
        return Bonk.toWorld(r.left, r.bottom + 10);
      }
      return Bonk.toWorld ? Bonk.toWorld(14, 12) : { x: 14, y: 12 };
    },

    draw: function (ctx) {
      if (!this.ready || this.all <= 0) return;
      var D = Bonk.Doodle;
      var P = Bonk.PALETTE;
      var at = this.anchor();
      var compact = document.body.classList.contains('compact');
      var size = compact ? 10 : 11;
      var x = at.x;
      /* It hangs below the name tag and nowhere else. Clamping it up to clear
         the top wall of the room only pushed it behind the tag, which is
         opaque, and the whole thing vanished. */
      var y = at.y;

      ctx.save();
      ctx.globalAlpha = compact ? 0.5 : 0.72;

      D.text(ctx, 'heated', x, y, { size: size, color: P.pencil, align: 'left' });
      var lead = D.measure(ctx, 'heated', size) + 8;

      /* Tally marks for today: fours upright, the fifth struck through. More
         than a couple of dozen and the number says it better than the marks. */
      var marks = Math.round(this.shown);
      var mx = x + lead;
      if (marks > 0 && marks <= 24) {
        var step = 4.5;
        var h = size + 1;
        for (var i = 0; i < marks; i++) {
          var g = i % 5;
          if (g === 4) {
            D.line(ctx, mx - step * 4 - 1.5, y + h / 2 + 1.5, mx + 1.5, y - h / 2 - 1.5, {
              color: P.marker, width: 1.6, seed: 40 + i, amp: 0.5
            });
            mx += step + 4;
          } else {
            D.line(ctx, mx, y - h / 2, mx, y + h / 2, {
              color: P.pencil, width: 1.6, seed: 7 + i * 3, amp: 0.5
            });
            mx += step;
          }
        }
      } else if (marks > 24) {
        D.text(ctx, String(marks), mx, y, { size: size + 2, color: P.marker, align: 'left' });
        mx += D.measure(ctx, String(marks), size + 2) + 6;
      }

      if (!compact) {
        var tail = 'week ' + this.week + ' · all time ' + this.all;
        D.text(ctx, tail, x, y + size + 6, { size: size - 1, color: P.pencil, align: 'left', alpha: 0.9 });
      }
      ctx.restore();
    },

    /* The shell pushes numbers in; this only asks once at startup in case he
       was already counting before the page finished loading. */
    init: function () {
      var self = this;
      var tries = 0;
      (function ask() {
        var T = window.__TAURI__;
        if (!T || !T.core) {
          if (++tries < 40) return window.setTimeout(ask, 100);
          return;
        }
        T.core
          .invoke('heat_tally')
          .then(function (n) {
            if (n && n.length === 3) self.set(n[0], n[1], n[2]);
          })
          .catch(function () {});
      })();
    }
  };

  Bonk.Heat = Heat;
})();
