// ==UserScript==
// @name         Build Your Stax Bot
// @namespace    https://github.com/bazydlodeclan-lab/Small-Phone-Projects-
// @version      2.0
// @description  Intercepts the game API and auto-trades every tick — all-in on best asset
// @match        https://buildyourstax.com/*
// @match        https://www.buildyourstax.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ── Shared state ────────────────────────────────────────────────────────────
  var gameCode = null;
  var gameState = null;        // last known state from API
  var priceHistory = {};       // assetId -> [price, ...]
  var actedOnYear = -1;
  var acting = false;

  // ── Status bar (injected after DOM is ready) ─────────────────────────────
  function injectBar() {
    if (document.getElementById('_stax_bar')) return;
    var bar = document.createElement('div');
    bar.id = '_stax_bar';
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'background:#1a1a2e', 'color:#00ff88', 'font:bold 13px monospace',
      'padding:6px 12px', 'display:flex', 'justify-content:space-between',
      'align-items:center', 'box-shadow:0 2px 8px rgba(0,0,0,.6)'
    ].join(';');
    bar.innerHTML = '<span id="_stax_msg">BOT WAITING — start a solo game</span>'
      + '<button id="_stax_stop" style="background:#ff4466;color:#fff;border:none;'
      + 'border-radius:4px;padding:4px 10px;cursor:pointer;font:bold 12px monospace">STOP</button>';
    document.body.appendChild(bar);
    document.getElementById('_stax_stop').onclick = function () { bar.remove(); };
  }

  function setStatus(msg) {
    var el = document.getElementById('_stax_msg');
    if (el) el.textContent = msg;
  }

  // Inject bar as soon as body exists
  if (document.body) {
    injectBar();
  } else {
    document.addEventListener('DOMContentLoaded', injectBar);
  }

  // ── Intercept fetch ──────────────────────────────────────────────────────
  var _fetch = window.fetch;
  window.fetch = function () {
    var args = Array.prototype.slice.call(arguments);
    var url = String(args[0] && args[0].url ? args[0].url : args[0]);

    return _fetch.apply(window, args).then(function (response) {
      if (url.indexOf('/wp-json/dev-api/v1/') !== -1) {
        response.clone().json().then(function (data) {
          handleApiResponse(url, data);
        }).catch(function () {});
      }
      return response;
    });
  };

  // Also intercept XMLHttpRequest in case the game uses it
  var _xhrOpen = XMLHttpRequest.prototype.open;
  var _xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    return _xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    xhr.addEventListener('load', function () {
      if (xhr._url && xhr._url.indexOf('/wp-json/dev-api/v1/') !== -1) {
        try {
          var data = JSON.parse(xhr.responseText);
          handleApiResponse(xhr._url, data);
        } catch (e) {}
      }
    });
    return _xhrSend.apply(this, arguments);
  };

  // ── Handle API responses ─────────────────────────────────────────────────
  function handleApiResponse(url, data) {
    // Capture game code from create-game
    if (url.indexOf('create-game') !== -1 || url.indexOf('new-game') !== -1) {
      var code = data.game_code || data.code || data.gameCode;
      if (code) {
        gameCode = code;
        setStatus('Game created — waiting for Year 1...');
      }
    }

    // Capture live state from get-game or any tick response
    if (url.indexOf('get-game') !== -1 || url.indexOf('game-state') !== -1
        || url.indexOf('tick') !== -1 || url.indexOf('game_tick') !== -1) {
      parseAndAct(data);
      return;
    }

    // Some games return state on every API call — try parsing regardless
    if (data && (data.tick !== undefined || data.year !== undefined
        || data.pocket_cash !== undefined || data.current_year !== undefined)) {
      parseAndAct(data);
    }
  }

  // ── Parse API data into a clean state object ─────────────────────────────
  function parseAndAct(raw) {
    // Year — try every key name we've seen in the wild
    var year = raw.year || raw.current_year || raw.tick
             || raw.current_tick || raw.game_year || 0;
    // Some APIs express year as tick number (120 ticks = 20 years → year = tick/6)
    if (year > 20) year = Math.ceil(year / 6);
    year = parseInt(year) || 0;

    // Cash
    var cash = 0;
    if (raw.pocket_cash !== undefined)       cash = parseFloat(raw.pocket_cash);
    else if (raw.cash !== undefined)         cash = parseFloat(raw.cash);
    else if (raw.portfolio && raw.portfolio.cash !== undefined) cash = parseFloat(raw.portfolio.cash);
    else if (raw.balance !== undefined)      cash = parseFloat(raw.balance);

    // Assets — try multiple shapes
    var rawAssets = raw.assets || raw.investments || raw.portfolio_assets
                  || (raw.portfolio && raw.portfolio.assets) || [];
    if (!Array.isArray(rawAssets)) {
      // Sometimes it's an object keyed by id
      rawAssets = Object.values(rawAssets);
    }

    var assets = rawAssets.map(function (a) {
      return {
        id:    a.id || a.investment_id || a.asset_id || String(a.name || ''),
        name:  a.name || a.title || a.label || String(a.id || ''),
        price: parseFloat(a.price || a.current_price || a.value || 0),
        owned: parseInt(a.owned || a.quantity || a.shares || a.amount || 0),
      };
    }).filter(function (a) { return a.price > 0; });

    // Only proceed if we got meaningful data
    if (year <= 0 && assets.length === 0) return;

    gameState = { year: year, cash: cash, assets: assets };

    // Update status bar
    setStatus('Yr ' + year + '/20  $' + Math.round(cash).toLocaleString()
      + '  ' + assets.length + ' assets');

    // Record price history
    assets.forEach(function (a) {
      if (!priceHistory[a.id]) priceHistory[a.id] = [];
      var h = priceHistory[a.id];
      if (!h.length || h[h.length - 1] !== a.price) h.push(a.price);
    });

    // Is the game actually over? Only if year is at the end.
    if (year >= 20 && /game\s*over|final|congratulations/i.test(document.body.textContent)) {
      setStatus('GAME OVER — check your final score!');
      return;
    }

    // Act once per year (or when new cash arrives)
    var gotNewCash = gameState && cash > (gameState.cash || 0) + 500;
    if ((year !== actedOnYear || gotNewCash) && cash > 0 && assets.length > 0) {
      actedOnYear = year;
      allIn(assets, cash);
    }
  }

  // ── Strategy: all-in on best asset ───────────────────────────────────────
  function momentum(id) {
    var h = priceHistory[id] || [];
    if (h.length < 2) return 0;
    var base = h[Math.max(0, h.length - 3)];
    return base ? (h[h.length - 1] - base) / base : 0;
  }

  function bestAsset(assets) {
    return assets.slice().sort(function (a, b) {
      var ha = priceHistory[a.id] || [], hb = priceHistory[b.id] || [];
      var sA = momentum(a.id) + (ha.length >= 2 ? 0.01 : -0.5);
      var sB = momentum(b.id) + (hb.length >= 2 ? 0.01 : -0.5);
      return sB - sA;
    })[0];
  }

  function allIn(assets, cash) {
    if (acting) return;
    acting = true;

    var best = bestAsset(assets);
    if (!best) { acting = false; return; }

    var toSell = assets.filter(function (a) {
      return a.owned > 0 && a.id !== best.id;
    });

    function doSells(i) {
      if (i >= toSell.length) {
        var qty = Math.floor(cash / best.price);
        if (qty >= 1) {
          setStatus('BUY ' + qty + 'x ' + best.name + ' @$' + best.price);
          clickTrade('buy', best.name, qty, function () { acting = false; });
        } else {
          acting = false;
        }
        return;
      }
      var a = toSell[i];
      setStatus('SELL ' + a.owned + 'x ' + a.name);
      clickTrade('sell', a.name, a.owned, function () { doSells(i + 1); });
    }

    doSells(0);
  }

  // ── DOM click helpers ─────────────────────────────────────────────────────
  function clickTrade(type, assetName, qty, cb) {
    // Find the button: look for a button with buy/sell text near the asset name
    var allBtns = Array.from(document.querySelectorAll('button'));
    var btn = null;

    // Strategy 1: find a button whose nearest ancestor also contains the asset name
    for (var i = 0; i < allBtns.length; i++) {
      var b = allBtns[i];
      if (!new RegExp(type, 'i').test(b.textContent)) continue;
      var parent = b.closest('[class]') || b.parentElement;
      if (parent && parent.textContent.toLowerCase().indexOf(assetName.toLowerCase()) !== -1) {
        btn = b;
        break;
      }
    }

    // Strategy 2: just find the first buy/sell button visible on screen
    if (!btn) {
      btn = allBtns.find(function (b) {
        return new RegExp('^\\s*' + type + '\\s*$', 'i').test(b.textContent.trim());
      });
    }

    if (!btn) {
      console.warn('[StaxBot] Could not find', type, 'button for', assetName);
      if (cb) setTimeout(cb, 200);
      return;
    }

    btn.click();

    // Handle quantity input modal if it appears
    setTimeout(function () {
      var input = document.querySelector(
        'input[type="number"], input[placeholder*="uantit"], input[placeholder*="mount"], input[placeholder*="ow many"]'
      );
      if (input) {
        input.value = qty;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(function () {
          // Click confirm/submit button in the modal
          var confirmBtn = Array.from(document.querySelectorAll('button')).find(function (b) {
            return /confirm|ok|submit|yes|done/i.test(b.textContent);
          });
          // Or if the same buy/sell button is now a confirm, click it again
          if (!confirmBtn) {
            confirmBtn = Array.from(document.querySelectorAll('button')).find(function (b) {
              return new RegExp(type, 'i').test(b.textContent);
            });
          }
          if (confirmBtn) confirmBtn.click();
          setTimeout(cb || function () {}, 400);
        }, 300);
      } else {
        setTimeout(cb || function () {}, 400);
      }
    }, 400);
  }

})();
