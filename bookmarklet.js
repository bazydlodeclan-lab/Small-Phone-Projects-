(function () {
  if (window._staxBot) {
    clearInterval(window._staxBot);
    window._staxBot = null;
    var bar = document.getElementById('_stax_bar');
    if (bar) bar.remove();
    return;
  }

  var bar = document.createElement('div');
  bar.id = '_stax_bar';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#1a1a2e;color:#00ff88;font:bold 13px monospace;padding:6px 12px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.5)';
  bar.innerHTML = '<span id="_stax_status">BOT STARTING...</span><button id="_stax_stop" style="background:#ff4466;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:12px">STOP</button>';
  document.body.prepend(bar);
  document.getElementById('_stax_stop').onclick = function () {
    clearInterval(window._staxBot);
    window._staxBot = null;
    bar.remove();
  };

  function setStatus(msg) {
    var el = document.getElementById('_stax_status');
    if (el) el.textContent = msg;
  }

  function parseMoney(txt) {
    return parseFloat((txt || '').replace(/[^\d.]/g, '')) || 0;
  }

  function textNodes() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var nodes = [], n;
    while ((n = walker.nextNode())) {
      var t = n.textContent.trim();
      if (t) nodes.push({ node: n, text: t });
    }
    return nodes;
  }

  function readYear() {
    var nodes = textNodes();
    for (var i = 0; i < nodes.length; i++) {
      var m = nodes[i].text.match(/Year\s+(\d+)\s+of\s+20/i);
      if (m) return parseInt(m[1]);
    }
    return 0;
  }

  function readCash() {
    var nodes = textNodes();
    for (var i = 0; i < nodes.length; i++) {
      if (/pocket\s*cash/i.test(nodes[i].text)) {
        for (var j = i + 1; j < Math.min(i + 6, nodes.length); j++) {
          if (/\$[\d,]/.test(nodes[j].text)) return parseMoney(nodes[j].text);
        }
        var parent = nodes[i].node.parentElement;
        if (parent) {
          var m = parent.closest('*').textContent.match(/\$([\d,]+)/);
          if (m) return parseMoney(m[0]);
        }
      }
    }
    return 0;
  }

  function isGameOver() {
    return /game\s*over|final\s*(score|result)|congratulations/i.test(document.body.textContent);
  }

  function readAssets() {
    var assets = [];
    var seen = new Set();
    document.querySelectorAll('button').forEach(function (btn) {
      if (!/buy/i.test(btn.textContent)) return;
      var card = btn.closest('[class]') || btn.parentElement;
      if (!card || seen.has(card)) return;
      seen.add(card);
      var txt = card.textContent;
      var priceMatch = txt.match(/\$([\d,]+\.?\d*)/);
      if (!priceMatch) return;
      var price = parseMoney(priceMatch[0]);
      if (price <= 0) return;
      var name = '';
      var walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      var n;
      while ((n = walker.nextNode())) {
        var t = n.textContent.trim();
        if (t && t.length > 1 && t.length < 40 && !/^\$|^\d|buy|sell|own|price/i.test(t)) { name = t; break; }
      }
      if (!name) name = 'asset_' + assets.length;
      var ownedMatch = txt.match(/(?:own(?:ed)?|qty|x)\s*[:\s]?\s*(\d+)/i);
      var owned = ownedMatch ? parseInt(ownedMatch[1]) : 0;
      assets.push({ name: name, price: price, owned: owned, buyBtn: btn, card: card });
    });
    return assets;
  }

  // --- State ---
  var priceHistory = {};  // name -> [price, ...]
  var lastYear = -1;
  var lastCash = -1;
  var acting = false;

  function recordPrices(assets) {
    assets.forEach(function (a) {
      if (!priceHistory[a.name]) priceHistory[a.name] = [];
      var h = priceHistory[a.name];
      if (!h.length || h[h.length - 1] !== a.price) h.push(a.price);
    });
  }

  function momentum(name) {
    var h = priceHistory[name] || [];
    if (h.length < 2) return 0;
    var base = h[Math.max(0, h.length - 3)];
    return base ? (h[h.length - 1] - base) / base : 0;
  }

  function bestAsset(assets) {
    // Score each asset: momentum is king; prefer assets with more price history
    return assets.slice().sort(function (a, b) {
      var ha = priceHistory[a.name] || [], hb = priceHistory[b.name] || [];
      var scoreA = momentum(a.name) + (ha.length >= 2 ? 0.01 : -0.5);
      var scoreB = momentum(b.name) + (hb.length >= 2 ? 0.01 : -0.5);
      return scoreB - scoreA;
    })[0];
  }

  // --- Click helpers ---
  function fillQtyAndConfirm(qty, delay) {
    setTimeout(function () {
      var input = document.querySelector('input[type="number"], input[placeholder*="uantit"], input[placeholder*="mount"]');
      if (input) {
        input.value = qty;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setTimeout(function () {
        var confirm = Array.from(document.querySelectorAll('button')).find(function (b) {
          return /confirm|buy|sell|ok|submit/i.test(b.textContent);
        });
        if (confirm) confirm.click();
      }, 250);
    }, delay || 350);
  }

  function sellAsset(asset, cb) {
    var sellBtn = Array.from(asset.card.querySelectorAll('button')).find(function (b) {
      return /sell/i.test(b.textContent);
    });
    if (!sellBtn || asset.owned <= 0) { if (cb) cb(); return; }
    sellBtn.click();
    fillQtyAndConfirm(asset.owned, 350);
    setTimeout(cb || function () {}, 900);
  }

  function buyAsset(asset, cash, cb) {
    var qty = Math.floor(cash / asset.price);
    if (qty < 1) { if (cb) cb(); return; }
    asset.buyBtn.click();
    fillQtyAndConfirm(qty, 350);
    setTimeout(cb || function () {}, 900);
  }

  // --- Main decision: sell everything else, buy all-in on best ---
  function allIn(assets, cash) {
    if (acting) return;
    acting = true;

    var best = bestAsset(assets);
    if (!best) { acting = false; return; }

    // Assets to sell: anything owned that isn't the best
    var toSell = assets.filter(function (a) { return a.owned > 0 && a.name !== best.name; });

    function doSells(i) {
      if (i >= toSell.length) {
        // Now buy all-in on best with all available cash
        var freshCash = readCash();
        var qty = Math.floor(freshCash / best.price);
        if (qty >= 1) {
          setStatus('BUY ' + qty + 'x ' + best.name + ' @$' + best.price);
          buyAsset(best, freshCash, function () { acting = false; });
        } else {
          acting = false;
        }
        return;
      }
      setStatus('SELL ' + toSell[i].owned + 'x ' + toSell[i].name);
      sellAsset(toSell[i], function () { doSells(i + 1); });
    }

    doSells(0);
  }

  // --- Main loop: poll every second ---
  window._staxBot = setInterval(function () {
    if (isGameOver()) {
      clearInterval(window._staxBot);
      setStatus('GAME OVER — bot stopped');
      return;
    }

    var year = readYear();
    var cash = readCash();
    var assets = readAssets();

    setStatus('Yr ' + year + '/20  $' + cash.toLocaleString() + '  ' + assets.length + ' assets');

    if (year <= 0 || acting) return;

    recordPrices(assets);

    var yearChanged = year !== lastYear;
    var gotNewCash = cash > lastCash + 500; // new cash dropped in

    if (yearChanged) lastYear = year;
    lastCash = cash;

    // Act on every new year OR whenever new cash arrives
    if ((yearChanged || gotNewCash) && cash > 0 && assets.length > 0) {
      allIn(assets, cash);
    }
  }, 1000);

  setStatus('BOT ACTIVE — watching...');
})();
