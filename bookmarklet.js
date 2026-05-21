(function () {
  // Toggle: tap again to stop
  if (window._staxBot) {
    clearInterval(window._staxBot);
    window._staxBot = null;
    var bar = document.getElementById('_stax_bar');
    if (bar) bar.remove();
    return;
  }

  // --- Floating status bar ---
  var bar = document.createElement('div');
  bar.id = '_stax_bar';
  bar.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:999999',
    'background:#1a1a2e', 'color:#00ff88', 'font:bold 13px monospace',
    'padding:6px 12px', 'display:flex', 'justify-content:space-between',
    'align-items:center', 'box-shadow:0 2px 8px rgba(0,0,0,.5)'
  ].join(';');
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

  // --- Helpers ---
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

  function parseMoney(txt) {
    var c = (txt || '').replace(/[^\d.]/g, '');
    return parseFloat(c) || 0;
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

  // --- Read game state ---
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
        // Look at the next few text nodes for a dollar amount
        for (var j = i + 1; j < Math.min(i + 5, nodes.length); j++) {
          if (/\$[\d,]/.test(nodes[j].text)) return parseMoney(nodes[j].text);
        }
        // Or in the same parent element
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
    // Find clickable card-like elements that contain a price and a Buy button
    var assets = [];
    var buttons = $$('button');
    buttons.forEach(function (btn) {
      if (!/buy/i.test(btn.textContent)) return;
      var card = btn.closest('[class]') || btn.parentElement;
      if (!card) return;
      var txt = card.textContent;
      var priceMatch = txt.match(/\$([\d,]+\.?\d*)/);
      if (!priceMatch) return;
      var price = parseMoney(priceMatch[0]);
      if (price <= 0) return;

      // Extract name: first short text in the card that isn't a number or label
      var name = '';
      var walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      var n;
      while ((n = walker.nextNode())) {
        var t = n.textContent.trim();
        if (t && t.length > 1 && t.length < 40 && !/^\$|^\d|buy|sell|own|price/i.test(t)) {
          name = t;
          break;
        }
      }
      if (!name) name = 'asset_' + assets.length;

      // Owned quantity
      var ownedMatch = txt.match(/(?:own(?:ed)?|qty|x)\s*[:\s]?\s*(\d+)/i);
      var owned = ownedMatch ? parseInt(ownedMatch[1]) : 0;

      assets.push({ name: name, price: price, owned: owned, buyBtn: btn, card: card });
    });
    return assets;
  }

  // --- Strategy ---
  var priceHistory = {};   // name -> [price, ...]
  var buyPrices = {};      // name -> price paid
  var lastYear = -1;
  var CASH_BUFFER = 2500;

  function recordPrices(assets) {
    assets.forEach(function (a) {
      if (!priceHistory[a.name]) priceHistory[a.name] = [];
      priceHistory[a.name].push(a.price);
    });
  }

  function momentum(name) {
    var h = priceHistory[name] || [];
    if (h.length < 3) return 0;
    var base = h[h.length - 3];
    return base ? (h[h.length - 1] - base) / base : 0;
  }

  function decide(assets, cash) {
    var actions = [];
    var spendable = cash - CASH_BUFFER;

    // Sell: 25% profit or 15% loss
    assets.forEach(function (a) {
      if (a.owned <= 0) return;
      var bp = buyPrices[a.name];
      if (!bp) return;
      var gain = (a.price - bp) / bp;
      if (gain >= 0.25 || gain <= -0.15) {
        actions.push({ type: 'sell', asset: a });
        delete buyPrices[a.name];
      }
    });

    if (spendable <= 0) return actions;

    // Buy: rank by momentum, buy the best one we can afford
    var candidates = assets.slice().sort(function (a, b) {
      return momentum(b.name) - momentum(a.name);
    });

    for (var i = 0; i < candidates.length; i++) {
      var a = candidates[i];
      if (a.price <= 0 || spendable < a.price) continue;
      var mom = momentum(a.name);
      var h = priceHistory[a.name] || [];
      if (h.length < 2) continue; // wait for a second data point

      // Buy on positive momentum OR a dip of >10%
      if (mom > 0.03 || mom < -0.10) {
        var qty = Math.max(1, Math.floor(spendable * 0.6 / a.price));
        qty = Math.min(qty, Math.floor(spendable / a.price));
        if (qty >= 1) {
          actions.push({ type: 'buy', asset: a, qty: qty });
          buyPrices[a.name] = a.price;
          break;
        }
      }
    }

    return actions;
  }

  // --- Execute actions ---
  function clickBuy(asset, qty) {
    asset.buyBtn.click();
    setTimeout(function () {
      // Handle quantity input if a modal appears
      var input = document.querySelector('input[type="number"], input[placeholder*="uantit"], input[placeholder*="mount"]');
      if (input) {
        input.value = qty;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(function () {
          var confirm = Array.from(document.querySelectorAll('button')).find(function (b) {
            return /confirm|buy|ok|submit/i.test(b.textContent);
          });
          if (confirm) confirm.click();
        }, 300);
      }
    }, 400);
  }

  function clickSell(asset) {
    var sellBtn = Array.from(asset.card.querySelectorAll('button')).find(function (b) {
      return /sell/i.test(b.textContent);
    });
    if (!sellBtn) return;
    sellBtn.click();
    setTimeout(function () {
      var input = document.querySelector('input[type="number"]');
      if (input) {
        input.value = asset.owned;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(function () {
          var confirm = Array.from(document.querySelectorAll('button')).find(function (b) {
            return /confirm|sell|ok/i.test(b.textContent);
          });
          if (confirm) confirm.click();
        }, 300);
      }
    }, 400);
  }

  // --- Main loop ---
  window._staxBot = setInterval(function () {
    if (isGameOver()) {
      clearInterval(window._staxBot);
      setStatus('GAME OVER — bot stopped');
      return;
    }

    var year = readYear();
    var cash = readCash();
    var assets = readAssets();

    setStatus('Yr ' + year + '/20  Cash: $' + cash.toLocaleString() + '  Assets: ' + assets.length);

    if (year <= 0) return;

    recordPrices(assets);

    if (year !== lastYear && year > 0) {
      lastYear = year;
      var actions = decide(assets, cash);
      actions.forEach(function (action) {
        if (action.type === 'buy') {
          setStatus('BUY ' + action.qty + 'x ' + action.asset.name);
          clickBuy(action.asset, action.qty);
        } else {
          setStatus('SELL ' + action.asset.owned + 'x ' + action.asset.name);
          clickSell(action.asset);
        }
      });
    }
  }, 5000);

  setStatus('BOT ACTIVE — Yr 0/20');
})();
