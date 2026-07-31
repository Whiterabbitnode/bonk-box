/* Bonk Box - the pencil-case tray, the shop, the gauges and the name tag.
   Chrome is real DOM rather than canvas so it keeps keyboard focus, labels and
   hit targets for free. */
(function () {
  'use strict';
  var Bonk = (window.Bonk = window.Bonk || {});

  /* Doodle icons, drawn in currentColor so a selected tool turns marker red. */
  var ICONS = {
    hand: '<path d="M9 14V5.6a1.5 1.5 0 0 1 3 0V11m0-1.3a1.4 1.4 0 0 1 2.8 0V12m0-1.4a1.4 1.4 0 0 1 2.8 0v4.6a5.6 5.6 0 0 1-5.6 5.5h-1.2a5 5 0 0 1-4-2l-2.6-3.4a1.5 1.5 0 0 1 2.3-1.9L9 15"/>',
    feather: '<path d="M19 4.5C12.5 4.5 7.5 8.5 6.5 14.5L4 20"/><path d="M19 4.5c1 6-2.5 11-8.5 12.5"/><path d="M9 14.5c3.5-.5 6.5-2.5 8-5.5"/>',
    beachball: '<circle cx="12" cy="12" r="8"/><path d="M4.2 12h15.6"/><path d="M12 4.1c3 4.4 3 11.4 0 15.8"/><path d="M12 4.1c-3 4.4-3 11.4 0 15.8"/>',
    cookie: '<circle cx="12" cy="12" r="8"/><circle cx="9.4" cy="9.6" r="1" fill="currentColor"/><circle cx="14.4" cy="10.6" r="1" fill="currentColor"/><circle cx="11.4" cy="14.4" r="1" fill="currentColor"/><circle cx="15" cy="14.8" r="1" fill="currentColor"/>',
    waterballoon: '<path d="M12 4.5c4 4.2 5.6 6.9 5.6 9.6A5.6 5.6 0 0 1 12 19.7a5.6 5.6 0 0 1-5.6-5.6c0-2.7 1.6-5.4 5.6-9.6Z"/><path d="M12 4.5 10.4 2.6"/>',
    trampoline: '<path d="M3.5 9.5q8.5 4.5 17 0"/><path d="M3.5 9.5h17"/><path d="M5 10.5 3 19"/><path d="M19 10.5 21 19"/><path d="M7 10v2M12 11.5v2M17 10v2"/>',
    anvil: '<path d="M3 6.5h12.5l3.5 2.2-3.5 2.2h-3.8l-.4 3 3.2 2.1v3.5H7.5v-3.5l3.2-2.1-.4-3H3V6.5Z"/>',
    gustfan: '<circle cx="12" cy="12" r="7"/><path d="M12 12c-.5-2.8.6-4.6 2.3-4.4 1.7.2 1.8 2.6-.5 3.4"/><path d="M12 12c-2.4 1.6-4.4 1.3-4.8-.4-.4-1.7 1.8-2.6 3.2-.8"/><path d="M12 12c2.6 1 3.6 2.8 2.6 4.2-1 1.4-3.1.2-2.9-1.7"/>',
    bowlingball: '<circle cx="12" cy="12" r="8"/><circle cx="9.6" cy="9.4" r="1.2" fill="currentColor"/><circle cx="13.6" cy="8.8" r="1.2" fill="currentColor"/><circle cx="11.2" cy="12.8" r="1.2" fill="currentColor"/>',
    confetti: '<path d="M5 18 8 9"/><path d="M11.5 5.5 12 8"/><path d="M17 7l-1.5 2"/><path d="M19.5 12.5 17 13"/><path d="M14 17.5 15 20"/><path d="m9.5 13.5 1.5 1.5"/><path d="M19 4l.8 1.8L21.5 6l-1.7.9-.4 1.9-1.3-1.4-1.9.2 1-1.7-.8-1.7 1.6.5Z"/>',
    gravityflip: '<path d="M7.5 3.5v9"/><path d="m4.5 9.5 3 3 3-3"/><path d="M16.5 20.5v-9"/><path d="m13.5 14.5 3-3 3 3"/>',
    piano: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 12.5h18"/><path d="M7 12.5V18M11 12.5V18M15 12.5V18M19 12.5V18"/>',

    hat_party: '<path d="M12 3 5.5 19.5h13L12 3Z"/><circle cx="12" cy="2.6" r="1.7"/><path d="M8.4 13.5 15 11"/>',
    hat_wizard: '<path d="M13.5 2.5 6.5 17h12l-5-14.5Z"/><path d="M3.5 17h17"/><path d="m11.5 8.5.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.3.7.3-1.4-1-1 1.4-.2Z"/>',
    hat_hard: '<path d="M4.5 16.5a7.5 7.5 0 0 1 15 0"/><path d="M2.5 16.5h19"/><path d="M12 9v7.5"/>',
    ink_marker: '<path d="m12 3 4.2 8.4L12 21l-4.2-9.6L12 3Z"/><path d="M12 11.6V17"/>',
    ink_blueprint: '<path d="m12 3 4.2 8.4L12 21l-4.2-9.6L12 3Z"/><path d="M12 11.6V17"/>'
  };

  function svg(id) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[id] || '') + '</svg>';
  }

  var els = {};
  var lastCoins = -1;
  var lastMood = -1;
  var lastScuffs = -1;
  var popTimer = 0;

  function moodWord(m) {
    if (m > 0.85) return 'delighted';
    if (m > 0.68) return 'happy';
    if (m > 0.45) return 'ok';
    if (m > 0.28) return 'unimpressed';
    return 'grumpy';
  }

  function scuffWord(s) {
    if (s < 0.06) return 'none';
    if (s < 0.3) return 'a bit';
    if (s < 0.6) return 'scuffed';
    if (s < 0.85) return 'well scuffed';
    return 'a state';
  }

  var UI = {
    init: function () {
      els.tray = document.getElementById('tray');
      els.shop = document.getElementById('shop');
      els.shopItems = document.getElementById('shopItems');
      els.coinValue = document.getElementById('coinValue');
      els.coinTally = document.getElementById('coinTally');
      els.moodFill = document.getElementById('moodFill');
      els.scuffFill = document.getElementById('scuffFill');
      els.moodRead = document.getElementById('moodRead');
      els.scuffRead = document.getElementById('scuffRead');
      els.name = document.getElementById('nameInput');
      els.mute = document.getElementById('btnMute');
      els.shopBtn = document.getElementById('btnShop');

      els.name.value = Bonk.state.save.name;
      els.name.addEventListener('change', this.renameBuddy);
      els.name.addEventListener('blur', this.renameBuddy);
      els.name.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') els.name.blur();
        e.stopPropagation();
      });

      document.getElementById('btnShop').addEventListener('click', function () {
        UI.openShop();
      });
      document.getElementById('shopClose').addEventListener('click', function () {
        UI.closeShop();
      });
      els.shop.addEventListener('click', function (e) {
        if (e.target === els.shop) UI.closeShop();
      });
      document.getElementById('btnReset').addEventListener('click', function () {
        Bonk.freshPage();
      });
      document.getElementById('btnMute').addEventListener('click', function () {
        UI.toggleMute();
      });
      document.getElementById('btnBug').addEventListener('click', function () {
        Bonk.Sound.start();
        Bonk.Tools.shipBug();
      });

      window.addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (document.activeElement === els.name) return;
        var owned = Bonk.Tools.ownedOrder();
        if (e.key >= '1' && e.key <= '9') {
          var i = parseInt(e.key, 10) - 1;
          if (owned[i]) UI.selectTool(owned[i]);
        } else if (e.key === '0') {
          if (owned[9]) UI.selectTool(owned[9]);
        } else if (e.key === 'm' || e.key === 'M') {
          UI.toggleMute();
        } else if (e.key === 'r' || e.key === 'R') {
          Bonk.freshPage();
        } else if (e.key === 'Escape') {
          UI.closeShop();
        }
      });

      this.syncMute();
      this.renderTray();
      this.update(0);
    },

    renameBuddy: function () {
      var v = els.name.value.trim().slice(0, 18) || 'your agent';
      els.name.value = v;
      Bonk.state.save.name = v;
      Bonk.persist();
    },

    renderTray: function () {
      var owned = Bonk.Tools.ownedOrder();
      els.tray.innerHTML = '';
      owned.forEach(function (id, i) {
        var def = Bonk.Tools.all[id];
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tool';
        b.dataset.tool = id;
        b.setAttribute('aria-pressed', String(Bonk.state.tool === id));
        b.title = def.label + ' - ' + def.blurb;
        b.innerHTML = svg(id) + '<span class="key">' + (i < 9 ? i + 1 : i === 9 ? 0 : '') + '</span>';
        var label = document.createElement('span');
        label.className = 'label';
        label.textContent = def.label;
        b.appendChild(label);
        b.addEventListener('click', function () {
          UI.selectTool(id);
        });
        els.tray.appendChild(b);
      });
    },

    selectTool: function (id) {
      if (!Bonk.owns(id)) return;
      Bonk.state.tool = id;
      Array.prototype.forEach.call(els.tray.children, function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.tool === id));
      });
      Bonk.Sound.start();
      Bonk.Sound.pop(1.5);
    },

    toggleMute: function () {
      Bonk.state.save.muted = !Bonk.state.save.muted;
      Bonk.persist();
      this.syncMute();
      if (!Bonk.state.save.muted) {
        Bonk.Sound.start();
        Bonk.Sound.pop(1.2);
      }
    },

    syncMute: function () {
      var muted = Bonk.state.save.muted;
      els.mute.textContent = muted ? 'sound off' : 'sound on';
      els.mute.setAttribute('aria-pressed', String(muted));
    },

    /* ---- shop ---------------------------------------------------------- */
    openShop: function () {
      Bonk.state.shopOpen = true;
      els.shop.hidden = false;
      this.renderShop();
      var first = els.shopItems.querySelector('button:not(:disabled)');
      if (first) first.focus();
    },

    closeShop: function () {
      Bonk.state.shopOpen = false;
      els.shop.hidden = true;
      els.shopBtn.focus();
    },

    renderShop: function () {
      var save = Bonk.state.save;
      var frag = document.createDocumentFragment();

      function section(title) {
        var h = document.createElement('h3');
        h.className = 'shop-section';
        h.textContent = title;
        frag.appendChild(h);
      }

      function card(id, def, owned, equipped, onBuy) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'card' + (owned ? ' owned' : '') + (equipped ? ' equipped' : '');
        b.disabled = !owned && save.coins < def.price;

        var top = document.createElement('div');
        top.className = 'card-top';
        top.innerHTML = svg(id);
        var nm = document.createElement('span');
        nm.className = 'card-name';
        nm.textContent = def.label;
        top.appendChild(nm);

        var blurb = document.createElement('p');
        blurb.className = 'card-blurb';
        blurb.textContent = def.blurb;

        var price = document.createElement('span');
        price.className = 'card-price';
        price.textContent = owned ? (equipped ? 'wearing it' : def.type ? 'tap to wear' : 'in your tray') : def.price + ' coins';

        b.appendChild(top);
        b.appendChild(blurb);
        b.appendChild(price);
        b.addEventListener('click', onBuy);
        frag.appendChild(b);
      }

      section('toys');
      Bonk.Tools.order.forEach(function (id) {
        var def = Bonk.Tools.all[id];
        if (def.free) return;
        var owned = Bonk.owns(id);
        card(id, def, owned, false, function () {
          UI.buyTool(id);
        });
      });

      section('how he looks');
      Object.keys(Bonk.Tools.skins).forEach(function (id) {
        var def = Bonk.Tools.skins[id];
        var owned = Bonk.owns(id);
        var equipped = def.type === 'hat' ? save.hat === def.value : save.ink === def.value;
        card(id, def, owned, equipped, function () {
          UI.buySkin(id);
        });
      });

      els.shopItems.innerHTML = '';
      els.shopItems.appendChild(frag);
    },

    buyTool: function (id) {
      if (Bonk.owns(id)) return;
      var def = Bonk.Tools.all[id];
      if (!Bonk.spend(def.price)) return;
      Bonk.state.save.owned.push(id);
      Bonk.persist();
      Bonk.Sound.start();
      Bonk.Sound.party();
      Bonk.Buddy.say(Bonk.pick(['ooh', 'for me?', 'uh oh', 'delightful']), 1.8);
      this.renderTray();
      this.renderShop();
      this.selectTool(id);
      this.update(0, true);
    },

    buySkin: function (id) {
      var def = Bonk.Tools.skins[id];
      var save = Bonk.state.save;
      if (!Bonk.owns(id)) {
        if (!Bonk.spend(def.price)) return;
        save.owned.push(id);
        Bonk.Sound.start();
        Bonk.Sound.party();
      } else {
        Bonk.Sound.pop(1.4);
      }
      if (def.type === 'hat') {
        save.hat = save.hat === def.value ? null : def.value;
      } else {
        save.ink = save.ink === def.value ? 'graphite' : def.value;
      }
      Bonk.persist();
      Bonk.Buddy.say(Bonk.pick(['smart.', 'a look.', 'promotion?']), 1.6);
      this.renderShop();
      this.update(0, true);
    },

    /* ---- readouts ------------------------------------------------------ */
    flashCoins: function () {
      popTimer = 0.16;
      els.coinTally.classList.add('pop');
    },

    coinAnchor: function () {
      if (!els.coinTally) return { x: 0, y: 0 };
      var r = els.coinTally.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },

    update: function (dt, force) {
      var st = Bonk.state;
      if (popTimer > 0) {
        popTimer -= dt;
        if (popTimer <= 0) els.coinTally.classList.remove('pop');
      }

      if (force || st.save.coins !== lastCoins) {
        lastCoins = st.save.coins;
        els.coinValue.textContent = lastCoins;
        /* Nudge the shop button when something new is within reach. */
        var canBuy = false;
        var all = Bonk.Tools;
        Object.keys(all.all).forEach(function (id) {
          if (!all.all[id].free && !Bonk.owns(id) && st.save.coins >= all.all[id].price) canBuy = true;
        });
        Object.keys(all.skins).forEach(function (id) {
          if (!Bonk.owns(id) && st.save.coins >= all.skins[id].price) canBuy = true;
        });
        els.shopBtn.classList.toggle('nudge', canBuy);
      }

      if (force || Math.abs(st.mood - lastMood) > 0.02) {
        lastMood = st.mood;
        els.moodFill.setAttribute('width', (st.mood * 58).toFixed(1));
        els.moodRead.textContent = moodWord(st.mood);
      }
      if (force || Math.abs(st.scuffs - lastScuffs) > 0.02) {
        lastScuffs = st.scuffs;
        els.scuffFill.setAttribute('width', (st.scuffs * 58).toFixed(1));
        els.scuffRead.textContent = scuffWord(st.scuffs);
      }
    }
  };

  Bonk.UI = UI;
})();
