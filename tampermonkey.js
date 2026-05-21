// ==UserScript==
// @name         Build Your Stax Bot
// @namespace    https://github.com/bazydlodeclan-lab/Small-Phone-Projects-
// @version      5.0
// @description  Auto-trades in Build Your Stax — all-in on best asset
// @match        https://buildyourstax.com/*
// @match        https://www.buildyourstax.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var priceHistory = {};
  var lastActedYear  = -1;
  var lastActedCash  = -1;
  var acting = false;
  var stopped = false;

  // ── Inject floating status bar ────────────────────────────────────────────
  function injectBar() {
    if (document.getElementById('_stax_bar')) return;
    var bar = document.createElement('div');
    bar.id = '_stax_bar';
    bar.style.cssText = [
      'position:fixed','top:0','left:0','right:0','z-index:2147483647',
      'background:#1a1a2e','color:#00ff88','font:bold 12px monospace',
      'padding:5px 10px','display:flex','justify-content:space-between',
      'align-items:center','box-shadow:0 2px 8px rgba(0,0,0,.9)'
    ].join(';');
    bar.innerHTML =
      '<span id="_stax_msg">BOT ON — scanning page...</span>' +
      '<button id="_stax_stop" style="background:#ff4466;color:#fff;border:none;' +
      'border-radius:4px;padding:3px 8px;cursor:pointer;font:bold 11px monospace">STOP</button>';
    document.body.appendChild(bar);
    document.getElementById('_stax_stop').onclick = function () {
      stopped = true;
      document.getElementById('_stax_msg').textContent = 'Bot stopped.';
    };
  }

  function setStatus(msg) {
    var el = document.getElementById('_stax_msg');
    if (el) el.textContent = msg;
  }

  // ── Parse money string ────────────────────────────────────────────────────
  function parseMoney(str) {
    return parseFloat((str || '').replace(/[^\d.]/g, '')) || 0;
  }

  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  // ── Find all trade buttons (very broad search) ────────────────────────────
  // Matches "Buy", "Invest", "Purchase", "+", "Add"
  var BUY_RE  = /^\s*(buy|invest|purchase|\+|add)\s*$/i;
  var SELL_RE = /^\s*(sell|remove|withdraw|-)\s*$/i;

  function findBuyButtons() {
    return Array.from(document.querySelectorAll('button, [role="button"], a.btn, .button'))
      .filter(function (el) {
        return BUY_RE.test(el.textContent.trim()) && isVisible(el);
      });
  }

  // ── Read rendered text of a card and extract price + name ────────────────
  function cardInfo(buyBtn) {
    // Walk up through ancestors looking for a container with a price
    var el = buyBtn;
    for (var i = 0; i < 8; i++) {
      if (!el.parentElement) break;
      el = el.parentElement;
      var text = el.innerText || '';
      var priceMatch = text.match(/\$([\d,]+\.?\d*)/);
      if (!priceMatch) continue;
      var price = parseMoney(priceMatch[0]);
      if (price <= 0) continue;

      // Name = first meaningful line
      var name = '';
      var lines = text.split('\n').map(function (l) { return l.trim(); });
      for (var j = 0; j < lines.length; j++) {
        var l = lines[j];
        if (l && l.length > 1 && l.length < 60
            && !/^\$|^\d|^buy$|^sell$|^invest$|^purchase$/i.test(l)) {
          name = l;
          break;
        }
      }
      if (!name) name = 'Asset_' + price;

      // Owned shares
      var ownedMatch = text.match(/(?:own(?:ed)?|shares?|qty|quantity|units?|x)\s*[:\s]?\s*(\d+)/i)
                    || text.match(/(\d+)\s+(?:share|unit|held)/i);
      var owned = ownedMatch ? parseInt(ownedMatch[1]) : 0;

      // Sell button in same container
      var sellBtn = Array.from(el.querySelectorAll('button, [role="button"]')).find(function (b) {
        return SELL_RE.test(b.textContent.trim()) && isVisible(b);
      });

      return { name: name, price: price, owned: owned, buyBtn: buyBtn, sellBtn: sellBtn, card: el };
    }
    return null;
  }

  // ── Read year from visible page text ─────────────────────────────────────
  function readYear() {
    var t = document.body.innerText || '';
    var m = t.match(/year\s+(\d+)\s+of\s+20/i)
          || t.match(/\b(\d{1,2})\s*\/\s*20\b/)
          || t.match(/year[:\s]+(\d+)/i)
          || t.match(/round[:\s]+(\d+)/i)
          || t.match(/period[:\s]+(\d+)/i);
    return m ? parseInt(m[1]) : 0;
  }

  // ── Read pocket cash ──────────────────────────────────────────────────────
  function readCash() {
    var t = document.body.innerText || '';
    // Look for cash labelled near a dollar amount
    var m = t.match(/(?:pocket|cash|balance|available|funds?)[^\n$]{0,40}\$([\d,]+)/i)
          || t.match(/\$([\d,]+)[^\n$]{0,40}(?:pocket|cash|balance|available)/i);
    if (m) return parseMoney(m[1]);
    // Fallback: smallest dollar amount on page (pocket cash < net worth)
    var amounts = (t.match(/\$[\d,]+/g) || []).map(parseMoney).filter(function (n) { return n > 0 && n < 100000; });
    return amounts.length ? Math.min.apply(null, amounts) : 0;
  }

  // ── Pick best asset by price momentum ────────────────────────────────────
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

  // ── Execute a buy or sell click ────────────────────────────────────────────
  function clickAndFill(btn, qty, cb) {
    if (!btn) { if (cb) setTimeout(cb, 200); return; }
    btn.click();
    setTimeout(function () {
      // Handle quantity input dialog
      var input = document.querySelector('input[type="number"]')
               || document.querySelector('input[placeholder*="uantit"]')
               || document.querySelector('input[placeholder*="ow many"]')
               || document.querySelector('input[placeholder*="mount"]');
      if (input) {
        input.value = qty;
        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(function () {
          var confirmBtn = Array.from(document.querySelectorAll('button')).find(function (b) {
            return /confirm|submit|ok|yes|done|buy|invest/i.test(b.textContent) && isVisible(b);
          });
          if (confirmBtn) confirmBtn.click();
          setTimeout(cb || function () {}, 500);
        }, 300);
      } else {
        setTimeout(cb || function () {}, 500);
      }
    }, 450);
  }

  // ── All-in: sell losers, buy winner ──────────────────────────────────────
  function allIn(assets, cash) {
    if (acting) return;
    acting = true;
    var best = bestAsset(assets);
    if (!best) { acting = false; return; }

    var toSell = assets.filter(function (a) {
      return a.owned > 0 && a.name !== best.name && a.sellBtn;
    });

    function doSells(i) {
      if (i >= toSell.length) {
        var qty = (cash > 0 && best.price > 0) ? Math.max(1, Math.floor(cash / best.price)) : 1;
        setStatus('BUY ' + qty + 'x ' + best.name);
        clickAndFill(best.buyBtn, qty, function () {
          lastActedCash = cash;
          acting = false;
        });
        return;
      }
      setStatus('SELL ' + toSell[i].name);
      clickAndFill(toSell[i].sellBtn, toSell[i].owned, function () { doSells(i + 1); });
    }
    doSells(0);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  function tick() {
    if (stopped) return;

    var buyBtns = findBuyButtons();

    // No buy buttons — game hasn't started or is loading
    if (buyBtns.length === 0) {
      // Show how many buttons total so user knows script is alive
      var allBtns = document.querySelectorAll('button').length;
      setStatus('BOT ON — ' + allBtns + ' buttons on page, none are Buy yet. Start the game.');
      return;
    }

    // Build asset list
    var assets = [];
    var seenCards = new Set();
    buyBtns.forEach(function (btn) {
      var info = cardInfo(btn);
      if (!info || seenCards.has(info.card)) return;
      seenCards.add(info.card);
      assets.push(info);
    });

    if (assets.length === 0) {
      setStatus('BOT ON — found Buy buttons but could not read prices. Game loading?');
      return;
    }

    // Record prices for momentum calc
    assets.forEach(function (a) {
      if (!priceHistory[a.name]) priceHistory[a.name] = [];
      var h = priceHistory[a.name];
      if (!h.length || h[h.length - 1] !== a.price) h.push(a.price);
    });

    var year = readYear();
    var cash = readCash();

    // Game over — year 20 reached
    if (year >= 20) {
      setStatus('GAME OVER — check your final score!');
      return;
    }

    setStatus('Yr ' + (year || '?') + '/20  $' + Math.round(cash).toLocaleString()
      + '  ' + assets.length + ' assets  mom:' + momentum(bestAsset(assets).name).toFixed(2));

    var newYear = year > 0 && year !== lastActedYear;
    var newCash = cash > lastActedCash + 200;

    if ((newYear || newCash) && !acting) {
      if (newYear) lastActedYear = year;
      allIn(assets, cash);
    }
  }

  // Wait for page to render, then poll every 2 seconds
  // Also re-scan whenever DOM changes significantly (React re-renders)
  function start() {
    injectBar();
    setInterval(tick, 2000);

    // MutationObserver fires an extra tick when React renders new content
    var observer = new MutationObserver(function (mutations) {
      var meaningful = mutations.some(function (m) {
        return m.addedNodes.length > 0;
      });
      if (meaningful && !acting && !stopped) tick();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(start, 1500);
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 1500); });
  }

})();
