// ==UserScript==
// @name         Stax Bot
// @namespace    https://github.com/bazydlodeclan-lab/Small-Phone-Projects-
// @version      7.0
// @description  Auto-trades Build Your Stax — correct quantity buttons, all assets
// @match        https://buildyourstax.com/*
// @match        https://www.buildyourstax.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ── Confirmed from game API research ────────────────────────────────────────
  // Savings Account → button says "Deposit" / reverse is "Withdraw"
  // Index Fund, Stocks, Crop, Gold → button says "Buy" / reverse is "Sell"
  // CD, Bonds → term-based, button likely "Purchase" or "Buy"
  // Quantity is NOT a text input — game shows buttons: 1 | 10 | 25 | Max
  // "Pocket Cash" is the exact label for available cash (confirmed from API)

  var ACTION_RE  = /^(buy|deposit|invest|purchase|open|add)$/i;
  var SELL_RE    = /^(sell|withdraw|redeem|remove)$/i;
  var QTY_MAX_RE = /^(max|maximum|all)$/i;
  var CONFIRM_RE = /^(confirm|ok|yes|done|submit|continue|proceed)$/i;

  var priceHistory  = {};
  var lastActedYear = -1;
  var lastActedCash = -1;
  var acting        = false;
  var stopped       = false;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function isVis(el) {
    return !!(el.offsetWidth || el.offsetHeight);
  }

  function money(str) {
    return parseFloat((str || '').replace(/[^\d.]/g, '')) || 0;
  }

  function visibleBtns() {
    return Array.from(document.querySelectorAll('button')).filter(isVis);
  }

  // ── Status bar — only injected once game is active ──────────────────────────
  function setStatus(msg) {
    var el = document.getElementById('_sm');
    if (el) el.textContent = msg;
  }

  function ensureBar() {
    if (document.getElementById('_sb')) return;
    var bar = document.createElement('div');
    bar.id = '_sb';
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
      'background:#1a1a2e', 'color:#0f0', 'font:bold 12px monospace',
      'padding:4px 8px', 'display:flex', 'justify-content:space-between',
      'align-items:center'
    ].join(';');
    var msg  = document.createElement('span');
    msg.id   = '_sm';
    msg.textContent = 'BOT ON';
    var stop = document.createElement('button');
    stop.textContent = 'STOP';
    stop.style.cssText = 'background:red;color:#fff;border:none;padding:2px 6px;cursor:pointer;font:bold 11px monospace';
    stop.onclick = function () { stopped = true; setStatus('Bot stopped.'); };
    bar.appendChild(msg);
    bar.appendChild(stop);
    document.body.appendChild(bar);
  }

  // ── Read game state ──────────────────────────────────────────────────────────
  function readYear() {
    var t = document.body.innerText || '';
    var m = t.match(/current\s+game\s+year[:\s]+(\d+)/i)
          || t.match(/year\s+(\d+)\s+of\s+20/i)
          || t.match(/\b(\d{1,2})\s*\/\s*20\b/);
    return m ? parseInt(m[1]) : 0;
  }

  function readCash() {
    var t = document.body.innerText || '';
    // "Pocket Cash" is the exact label per game API
    var m = t.match(/pocket\s+cash[^\n$]{0,25}\$([\d,]+)/i)
          || t.match(/\$([\d,]+)[^\n$]{0,25}pocket\s+cash/i)
          || t.match(/cash[^\n$]{0,25}\$([\d,]+)/i);
    if (m) return money(m[1]);
    // Fallback: smallest plausible cash amount on page
    var amounts = (t.match(/\$[\d,]+/g) || [])
      .map(money)
      .filter(function (n) { return n >= 100 && n < 100000; });
    return amounts.length ? Math.min.apply(null, amounts) : 0;
  }

  // ── Find all investment action buttons on the page ───────────────────────────
  function findActionBtns() {
    return visibleBtns().filter(function (b) {
      return ACTION_RE.test(b.textContent.trim());
    });
  }

  // ── Extract card info from an action button ──────────────────────────────────
  function cardInfo(actionBtn) {
    var el = actionBtn;
    for (var i = 0; i < 10; i++) {
      if (!el.parentElement) break;
      el = el.parentElement;
      if (el === document.body) break;

      // Skip giant containers (more than 5 visible buttons = multiple cards)
      var btnCount = el.querySelectorAll('button').length;
      if (btnCount > 8) continue;

      var text = el.innerText || '';
      if (text.length > 1500) continue; // too big to be one card

      // Must have a dollar amount to be a real investment card
      var pm = text.match(/\$([\d,]+\.?\d*)/);
      if (!pm) continue;
      var price = money(pm[0]);
      if (price <= 0) continue;

      // Asset name = first non-trivial, non-number, non-button-label line
      var name = '';
      var lines = text.split('\n').map(function (l) { return l.trim(); });
      for (var j = 0; j < lines.length; j++) {
        var l = lines[j];
        if (l && l.length > 2 && l.length < 80
          && !/^\$|^\d+\.?\d*$|^(buy|sell|deposit|withdraw|invest|confirm|max|cancel|ok|yes|done|purchase|open|add|redeem|remove)$/i.test(l)) {
          name = l;
          break;
        }
      }
      if (!name) name = 'Asset_' + price;

      // Sell / withdraw button in same card
      var sellBtn = Array.from(el.querySelectorAll('button')).find(function (b) {
        return SELL_RE.test(b.textContent.trim()) && isVis(b);
      });

      // Owned balance/shares
      var om = text.match(/(?:balance|own(?:ed)?|shares?|qty|units?|holding)\s*[:\s]?\s*\$?([\d,]+\.?\d*)/i);
      var owned = om ? money(om[1]) : 0;

      return { name: name, price: price, owned: owned, actionBtn: actionBtn, sellBtn: sellBtn, card: el };
    }
    return null;
  }

  // ── Strategy: momentum-based asset ranking ───────────────────────────────────
  function momentum(name) {
    var h = priceHistory[name] || [];
    if (h.length < 2) return 0;
    var base = h[Math.max(0, h.length - 3)];
    return base ? (h[h.length - 1] - base) / base : 0;
  }

  function bestAsset(assets) {
    return assets.slice().sort(function (a, b) {
      var ha = (priceHistory[a.name] || []).length;
      var hb = (priceHistory[b.name] || []).length;
      var sA = momentum(a.name) + (ha >= 2 ? 0.05 : -0.5);
      var sB = momentum(b.name) + (hb >= 2 ? 0.05 : -0.5);
      return sB - sA;
    })[0];
  }

  // ── Click an action button then select Max qty then confirm ──────────────────
  // The game uses preset buttons (1 | 10 | 25 | Max), NOT a text input field.
  function clickBuy(asset, cash, cb) {
    setStatus('→ ' + asset.actionBtn.textContent.trim() + ' ' + asset.name);
    asset.actionBtn.click();

    setTimeout(function () {
      // Step 1: look for Max quantity button
      var maxBtn = visibleBtns().find(function (b) {
        return QTY_MAX_RE.test(b.textContent.trim());
      });

      if (maxBtn) {
        maxBtn.click();
      } else {
        // Fallback: click highest numeric quantity button available (25 > 10 > 1)
        var numBtns = visibleBtns()
          .filter(function (b) { return /^(25|10|1)$/.test(b.textContent.trim()); })
          .sort(function (a, b) { return parseInt(b.textContent) - parseInt(a.textContent); });
        if (numBtns.length) numBtns[0].click();
      }

      // Step 2: confirm the transaction
      setTimeout(function () {
        var confirmBtn = visibleBtns().find(function (b) {
          return CONFIRM_RE.test(b.textContent.trim());
        });
        if (confirmBtn) confirmBtn.click();
        setTimeout(function () { if (cb) cb(); }, 700);
      }, 500);
    }, 600);
  }

  function clickSell(asset, cb) {
    if (!asset.sellBtn) { setTimeout(function () { if (cb) cb(); }, 200); return; }
    setStatus('→ Sell ' + asset.name);
    asset.sellBtn.click();

    setTimeout(function () {
      var maxBtn = visibleBtns().find(function (b) {
        return QTY_MAX_RE.test(b.textContent.trim());
      });
      if (maxBtn) maxBtn.click();

      setTimeout(function () {
        var confirmBtn = visibleBtns().find(function (b) {
          return CONFIRM_RE.test(b.textContent.trim());
        });
        if (confirmBtn) confirmBtn.click();
        setTimeout(function () { if (cb) cb(); }, 700);
      }, 500);
    }, 600);
  }

  // ── All-in: sell losers, buy winner ─────────────────────────────────────────
  function allIn(assets, cash) {
    if (acting || stopped) return;
    acting = true;

    var best = bestAsset(assets);
    if (!best) { acting = false; return; }

    var toSell = assets.filter(function (a) {
      return a.owned > 0 && a.name !== best.name && a.sellBtn;
    });

    function doSells(i) {
      if (i >= toSell.length) {
        clickBuy(best, cash, function () {
          lastActedCash = cash;
          acting = false;
        });
        return;
      }
      clickSell(toSell[i], function () { doSells(i + 1); });
    }
    doSells(0);
  }

  // ── Main loop — poll every 3 seconds, no MutationObserver ───────────────────
  setInterval(function () {
    if (stopped) return;

    var actionBtns = findActionBtns();
    if (!actionBtns.length) return; // silent on home page until game starts

    ensureBar();

    // Build asset list (deduplicate by card element)
    var assets = [];
    var seen = new Set();
    actionBtns.forEach(function (btn) {
      var info = cardInfo(btn);
      if (!info || seen.has(info.card)) return;
      seen.add(info.card);
      assets.push(info);
    });

    if (!assets.length) {
      setStatus('BOT ON — waiting for card prices...');
      return;
    }

    // Track price history for momentum calc
    assets.forEach(function (a) {
      if (!priceHistory[a.name]) priceHistory[a.name] = [];
      var h = priceHistory[a.name];
      if (!h.length || h[h.length - 1] !== a.price) h.push(a.price);
    });

    var year = readYear();
    var cash = readCash();

    if (year >= 20) {
      setStatus('GAME OVER — check your final score!');
      return;
    }

    var best = bestAsset(assets);
    setStatus('Yr ' + (year || '?') + '/20  $' + Math.round(cash).toLocaleString()
      + '  ' + assets.length + ' assets  best:' + best.name
      + '  mom:' + momentum(best.name).toFixed(2));

    // Act when year changes OR new cash arrives
    var newYear = year !== lastActedYear;
    var newCash = cash > lastActedCash + 200;

    if ((newYear || newCash) && !acting) {
      lastActedYear = year;
      allIn(assets, cash);
    }
  }, 3000);

})();
