// ==UserScript==
// @name         Stax Bot
// @namespace    https://github.com/bazydlodeclan-lab/Small-Phone-Projects-
// @version      6.0
// @description  Auto-trades in Build Your Stax — invisible on home page, active only in game
// @match        https://buildyourstax.com/*
// @match        https://www.buildyourstax.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var priceHistory = {};
  var lastActedYear = -1;
  var lastActedCash = -1;
  var acting = false;
  var stopped = false;

  function parseMoney(str) {
    return parseFloat((str || '').replace(/[^\d.]/g, '')) || 0;
  }

  function isVisible(el) {
    return el.offsetWidth > 0 || el.offsetHeight > 0;
  }

  function findBuyButtons() {
    return Array.from(document.querySelectorAll('button')).filter(function (b) {
      var txt = b.textContent.trim();
      return /^(buy|invest|purchase|deposit|open account|add funds?)$/i.test(txt) && isVisible(b);
    });
  }

  function cardInfo(buyBtn) {
    var el = buyBtn;
    for (var i = 0; i < 8; i++) {
      if (!el.parentElement) break;
      el = el.parentElement;
      var text = el.innerText || '';
      var pm = text.match(/\$([\d,]+\.?\d*)/);
      if (!pm) continue;
      var price = parseMoney(pm[0]);
      if (price <= 0) continue;
      var name = '';
      var lines = text.split('\n').map(function (l) { return l.trim(); });
      for (var j = 0; j < lines.length; j++) {
        var l = lines[j];
        if (l && l.length > 1 && l.length < 60 && !/^\$|^\d|^buy$|^sell$/i.test(l)) {
          name = l; break;
        }
      }
      if (!name) name = 'Asset_' + price;
      var om = text.match(/(?:own(?:ed)?|shares?|qty|x)\s*:?\s*(\d+)/i);
      var owned = om ? parseInt(om[1]) : 0;
      var sellBtn = Array.from(el.querySelectorAll('button')).find(function (b) {
        return /^(sell|withdraw|remove|close|redeem)$/i.test(b.textContent.trim()) && isVisible(b);
      });
      return { name: name, price: price, owned: owned, buyBtn: buyBtn, sellBtn: sellBtn };
    }
    return null;
  }

  function readYear() {
    var t = document.body.innerText || '';
    var m = t.match(/year\s+(\d+)\s+of\s+20/i) || t.match(/\b(\d{1,2})\/20\b/);
    return m ? parseInt(m[1]) : 0;
  }

  function readCash() {
    var t = document.body.innerText || '';
    var m = t.match(/(?:pocket|cash|balance)[^\n$]{0,30}\$([\d,]+)/i)
          || t.match(/\$([\d,]+)[^\n$]{0,30}(?:pocket|cash|balance)/i);
    if (m) return parseMoney(m[1]);
    var amounts = (t.match(/\$[\d,]+/g) || []).map(parseMoney).filter(function (n) { return n > 0 && n < 100000; });
    return amounts.length ? Math.min.apply(null, amounts) : 0;
  }

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

  function clickAndFill(btn, qty, cb) {
    if (!btn) { setTimeout(cb || function () {}, 200); return; }
    btn.click();
    setTimeout(function () {
      var inp = document.querySelector('input[type="number"], input[placeholder*="uantit"], input[placeholder*="mount"]');
      if (inp) {
        inp.value = qty;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(function () {
          var ok = Array.from(document.querySelectorAll('button')).find(function (b) {
            return /confirm|ok|yes|done|buy|submit/i.test(b.textContent) && isVisible(b);
          });
          if (ok) ok.click();
          setTimeout(cb || function () {}, 500);
        }, 300);
      } else {
        setTimeout(cb || function () {}, 500);
      }
    }, 450);
  }

  function setStatus(msg) {
    var el = document.getElementById('_sm');
    if (el) el.textContent = msg;
  }

  function ensureBar() {
    if (document.getElementById('_sb')) return;
    var bar = document.createElement('div');
    bar.id = '_sb';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#1a1a2e;color:#0f0;font:bold 12px monospace;padding:4px 8px;display:flex;justify-content:space-between;align-items:center';
    bar.innerHTML = '<span id="_sm">BOT ON</span><button id="_sstop" style="background:red;color:#fff;border:none;padding:2px 6px;cursor:pointer">STOP</button>';
    document.body.appendChild(bar);
    document.getElementById('_sstop').onclick = function () {
      stopped = true;
      setStatus('Bot stopped.');
    };
  }

  function allIn(assets, cash) {
    if (acting || stopped) return;
    acting = true;
    var best = bestAsset(assets);
    if (!best) { acting = false; return; }
    var toSell = assets.filter(function (a) { return a.owned > 0 && a.name !== best.name && a.sellBtn; });

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

  // Poll every 3 seconds. No MutationObserver — completely passive until Buy buttons appear.
  setInterval(function () {
    if (stopped) return;

    var buyBtns = findBuyButtons();
    if (!buyBtns.length) return; // invisible on home page, does nothing until game starts

    ensureBar();

    var assets = [];
    var seen = new Set();
    buyBtns.forEach(function (btn) {
      var info = cardInfo(btn);
      if (!info || seen.has(info.name)) return;
      seen.add(info.name);
      assets.push(info);
    });

    if (!assets.length) {
      setStatus('BOT ON — reading prices...');
      return;
    }

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
      + '  ' + assets.length + ' assets  mom:' + (best ? momentum(best.name).toFixed(2) : '0'));

    var newYear = year !== lastActedYear; // act even if year reads as 0 (start of game)
    var newCash = cash > lastActedCash + 200;

    if ((newYear || newCash) && !acting) {
      lastActedYear = year;
      allIn(assets, cash);
    }
  }, 3000);

})();
