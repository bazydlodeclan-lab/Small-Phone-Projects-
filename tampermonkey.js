// ==UserScript==
// @name         Stax Bot
// @namespace    https://github.com/bazydlodeclan-lab/Small-Phone-Projects-
// @version      7.1
// @description  Auto-trades Build Your Stax
// @match        https://buildyourstax.com/*
// @match        https://www.buildyourstax.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // Savings account says "Deposit" not "Buy". Balance starts at $0 so price is 0 — allowed.
  // Quantity is NOT a text input. Game shows buttons: 1 | 10 | 25 | Max.
  var ACTION_RE  = /^(buy|deposit|invest|purchase|open|add)$/i;
  var SELL_RE    = /^(sell|withdraw|redeem|remove)$/i;
  var QTY_MAX_RE = /^(max|maximum|all)$/i;
  var CONFIRM_RE = /^(confirm|ok|yes|done|submit|continue|proceed)$/i;

  var priceHistory  = {};
  var lastActedYear = -1;
  var lastActedCash = -1;
  var acting        = false;
  var stopped       = false;

  function isVis(el) { return !!(el.offsetWidth || el.offsetHeight); }
  function money(s)  { return parseFloat((s || '').replace(/[^\d.]/g, '')) || 0; }
  function allBtns() { return Array.from(document.querySelectorAll('button')).filter(isVis); }

  // ── Status bar ───────────────────────────────────────────────────────────────
  function setStatus(msg) { var e = document.getElementById('_sm'); if (e) e.textContent = msg; }

  function ensureBar() {
    if (document.getElementById('_sb')) return;
    var bar  = document.createElement('div');
    bar.id   = '_sb';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#1a1a2e;color:#0f0;font:bold 11px monospace;padding:4px 8px;display:flex;justify-content:space-between;align-items:center';
    var msg  = document.createElement('span'); msg.id = '_sm'; msg.textContent = 'BOT ON';
    var stop = document.createElement('button');
    stop.textContent = 'STOP';
    stop.style.cssText = 'background:red;color:#fff;border:none;padding:2px 6px;cursor:pointer';
    stop.onclick = function () { stopped = true; setStatus('Bot stopped.'); };
    bar.appendChild(msg); bar.appendChild(stop);
    document.body.appendChild(bar);
  }

  // ── Read game year ───────────────────────────────────────────────────────────
  function readYear() {
    var t = document.body.innerText || '';
    var m = t.match(/current\s+game\s+year[:\s]+(\d+)/i)
          || t.match(/year\s+(\d+)\s+of\s+20/i)
          || t.match(/\b(\d{1,2})\s*\/\s*20\b/);
    return m ? parseInt(m[1]) : 0;
  }

  // ── Read pocket cash ─────────────────────────────────────────────────────────
  function readCash() {
    var t = document.body.innerText || '';
    var m = t.match(/pocket\s+cash[^\n$]{0,25}\$([\d,]+)/i)
          || t.match(/\$([\d,]+)[^\n$]{0,25}pocket\s+cash/i)
          || t.match(/cash[^\n$]{0,25}\$([\d,]+)/i);
    if (m) return money(m[1]);
    var amounts = (t.match(/\$[\d,]+/g) || []).map(money).filter(function (n) { return n >= 100 && n < 100000; });
    return amounts.length ? Math.min.apply(null, amounts) : 0;
  }

  // ── Find action buttons ──────────────────────────────────────────────────────
  function findActionBtns() {
    return allBtns().filter(function (b) { return ACTION_RE.test(b.textContent.trim()); });
  }

  // ── Extract card info ────────────────────────────────────────────────────────
  function cardInfo(actionBtn) {
    // Deposit buttons (savings account) start at $0 balance — price=0 is acceptable for them
    var isDepositType = /^(deposit|open|add)$/i.test(actionBtn.textContent.trim());

    var el = actionBtn;
    for (var i = 0; i < 10; i++) {
      if (!el.parentElement) break;
      el = el.parentElement;
      if (el === document.body) break;
      if (el.querySelectorAll('button').length > 8) continue; // too many buttons = not a single card

      var text = el.innerText || '';
      if (text.length < 8)    continue; // too tiny
      if (text.length > 2000) continue; // too big

      // Need a dollar amount — except for deposit-type where balance may be $0
      var pm    = text.match(/\$([\d,]+\.?\d*)/);
      var price = pm ? money(pm[0]) : 0;
      if (!isDepositType && price <= 0) continue;

      // Extract asset name: first non-trivial, non-button-label line
      var name  = '';
      var lines = text.split('\n').map(function (l) { return l.trim(); });
      for (var j = 0; j < lines.length; j++) {
        var l = lines[j];
        if (l && l.length > 2 && l.length < 80
          && !/^\$|^\d+\.?\d*%?$|^(buy|sell|deposit|withdraw|invest|confirm|max|cancel|ok|yes|done|purchase|open|add|redeem|remove|more|info|help|\?)$/i.test(l)) {
          name = l; break;
        }
      }
      if (!name) name = isDepositType ? 'Savings Account' : 'Asset';

      var sellBtn = Array.from(el.querySelectorAll('button')).find(function (b) {
        return SELL_RE.test(b.textContent.trim()) && isVis(b);
      });
      var om    = text.match(/(?:balance|own(?:ed)?|shares?|qty|units?)\s*[:\s]?\s*\$?([\d,]+\.?\d*)/i);
      var owned = om ? money(om[1]) : 0;

      return { name: name, price: price, owned: owned, actionBtn: actionBtn, sellBtn: sellBtn, card: el };
    }
    return null;
  }

  // ── Momentum strategy ────────────────────────────────────────────────────────
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

  // ── Click: action → Max → Confirm ───────────────────────────────────────────
  function doClick(actionBtn, label, cb) {
    setStatus('Clicking: ' + label + '...');
    actionBtn.click();

    setTimeout(function () {
      // Look for Max quantity button (1 | 10 | 25 | Max)
      var maxBtn = allBtns().find(function (b) { return QTY_MAX_RE.test(b.textContent.trim()); });
      if (maxBtn) {
        maxBtn.click();
      } else {
        // Fallback: click highest numeric option
        var numBtns = allBtns()
          .filter(function (b) { return /^(25|10|1)$/.test(b.textContent.trim()); })
          .sort(function (a, b) { return parseInt(b.textContent) - parseInt(a.textContent); });
        if (numBtns.length) numBtns[0].click();
      }

      setTimeout(function () {
        var confirmBtn = allBtns().find(function (b) { return CONFIRM_RE.test(b.textContent.trim()); });
        if (confirmBtn) confirmBtn.click();
        setTimeout(function () { if (cb) cb(); }, 700);
      }, 500);
    }, 700);
  }

  function clickBuy(asset, cb)  { doClick(asset.actionBtn, asset.actionBtn.textContent.trim() + ' ' + asset.name, cb); }
  function clickSell(asset, cb) {
    if (!asset.sellBtn) { setTimeout(function () { if (cb) cb(); }, 200); return; }
    doClick(asset.sellBtn, 'Sell ' + asset.name, cb);
  }

  // ── All-in ───────────────────────────────────────────────────────────────────
  function allIn(assets, cash) {
    if (acting || stopped) return;
    acting = true;
    var best = bestAsset(assets);
    if (!best) { acting = false; return; }

    var toSell = assets.filter(function (a) { return a.owned > 0 && a.name !== best.name && a.sellBtn; });

    function doSells(i) {
      if (i >= toSell.length) {
        clickBuy(best, function () { lastActedCash = cash; acting = false; });
        return;
      }
      clickSell(toSell[i], function () { doSells(i + 1); });
    }
    doSells(0);
  }

  // ── Main loop ────────────────────────────────────────────────────────────────
  setInterval(function () {
    if (stopped) return;

    var actionBtns = findActionBtns();

    // Show diagnostic info even when no action buttons found
    ensureBar();

    if (!actionBtns.length) {
      // Show what buttons ARE on the page so we can diagnose
      var pageBtns = allBtns().map(function (b) { return '"' + b.textContent.trim().slice(0, 12) + '"'; });
      if (pageBtns.length) {
        setStatus('No action btns. Page has: ' + pageBtns.slice(0, 4).join(' '));
      } else {
        setStatus('BOT ON — waiting for game to start...');
      }
      return;
    }

    // Build asset list
    var assets = [];
    var seen   = new Set();
    actionBtns.forEach(function (btn) {
      var info = cardInfo(btn);
      if (!info || seen.has(info.card)) return;
      seen.add(info.card);
      assets.push(info);
    });

    if (!assets.length) {
      // Cards found but couldn't read them — show button texts for diagnosis
      var btnTexts = actionBtns.map(function (b) { return '"' + b.textContent.trim() + '"'; }).join(' ');
      setStatus('Btns found: ' + btnTexts + ' — reading cards...');
      return;
    }

    // Track price history
    assets.forEach(function (a) {
      if (!priceHistory[a.name]) priceHistory[a.name] = [];
      var h = priceHistory[a.name];
      if (!h.length || h[h.length - 1] !== a.price) h.push(a.price);
    });

    var year = readYear();
    var cash = readCash();

    if (year >= 20) { setStatus('GAME OVER — check final score!'); return; }

    var best = bestAsset(assets);
    setStatus('Yr ' + (year || '?') + '/20  $' + Math.round(cash).toLocaleString()
      + '  ' + assets.length + ' assets  →' + best.name);

    var newYear = year !== lastActedYear;
    var newCash = cash > lastActedCash + 200;

    if ((newYear || newCash) && !acting) {
      lastActedYear = year;
      allIn(assets, cash);
    }
  }, 3000);

})();
