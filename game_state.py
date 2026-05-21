import re
import asyncio


def _parse_money(text):
    """Convert '$1,234.56' or '1234' to float."""
    cleaned = re.sub(r"[^\d.]", "", text or "")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


class GameState:
    def __init__(self, page):
        self.page = page
        self._js_state_key = None  # cached JS global key if found

    async def try_js_state(self):
        """Try to read game state directly from the JS app's global store."""
        result = await self.page.evaluate("""
            () => {
                if (window.__gameState) return window.__gameState;
                if (window.store && window.store.state) return window.store.state;
                if (window.gameStore) return window.gameStore;
                // Vue 3 devtools pattern
                try {
                    const app = document.querySelector('#app')?.__vue_app__;
                    if (app) {
                        const provides = app._context?.provides;
                        if (provides) return { _vue_provides: Object.keys(provides) };
                    }
                } catch(e) {}
                return null;
            }
        """)
        return result

    async def read(self):
        """Return a dict describing the current game state."""
        state = {
            "year": 0,
            "cash": 0.0,
            "net_worth": 0.0,
            "assets": {},
            "game_over": False,
        }

        # Try JS global state first
        js = await self.try_js_state()
        if js and isinstance(js, dict) and "year" in js:
            return self._parse_js_state(js)

        # Fall back to DOM scraping
        try:
            year_el = self.page.locator("text=/Year \\d+ of 20/").first
            year_text = await year_el.inner_text(timeout=3000)
            m = re.search(r"Year (\d+) of 20", year_text)
            if m:
                state["year"] = int(m.group(1))
        except Exception:
            pass

        try:
            cash_text = await self._read_adjacent_value("Pocket Cash")
            state["cash"] = _parse_money(cash_text)
        except Exception:
            pass

        try:
            nw_text = await self._read_adjacent_value("Overall Net Worth")
            state["net_worth"] = _parse_money(nw_text)
        except Exception:
            pass

        # Check for game-over screen
        try:
            game_over = await self.page.locator("text=/game over|final score|results/i").count()
            state["game_over"] = game_over > 0
        except Exception:
            pass

        state["assets"] = await self._read_assets()
        return state

    async def _read_adjacent_value(self, label_text):
        """Find a label and return text of the nearest sibling/parent that looks like a value."""
        locator = self.page.locator(f"text={label_text}").first
        parent = locator.locator("..")
        full_text = await parent.inner_text(timeout=3000)
        # Remove the label itself and return remaining text
        value = full_text.replace(label_text, "").strip()
        return value

    async def _read_assets(self):
        """Read all visible asset cards on the page."""
        assets = {}

        # Each asset appears in an expandable section / card
        # We look for containers that have both a price and a buy/sell button
        cards = self.page.locator("[class*='asset'], [class*='investment'], [class*='card']")
        count = await cards.count()

        for i in range(count):
            card = cards.nth(i)
            try:
                text = await card.inner_text(timeout=2000)
                asset = _parse_asset_card(text)
                if asset:
                    name = asset["name"]
                    if name not in assets:
                        assets[name] = asset
                    else:
                        # Multiple stocks: store as list
                        existing = assets[name]
                        if not isinstance(existing, list):
                            assets[name] = [existing]
                        assets[name].append(asset)
            except Exception:
                continue

        return assets

    def _parse_js_state(self, js):
        """Map a JS global state object to our standard dict."""
        year = js.get("year") or js.get("current_year") or 0
        cash = _parse_money(str(js.get("pocket_cash") or js.get("cash") or 0))
        net_worth = _parse_money(str(js.get("net_worth") or js.get("netWorth") or 0))
        game_over = bool(js.get("game_over") or js.get("gameOver"))
        assets = js.get("assets") or js.get("investments") or {}
        return {
            "year": int(year),
            "cash": cash,
            "net_worth": net_worth,
            "assets": assets,
            "game_over": game_over,
        }


def _parse_asset_card(text):
    """Extract name, price, owned from a card's raw inner text."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if not lines:
        return None

    # Need at least a price-looking token
    price = None
    for line in lines:
        m = re.search(r"\$[\d,]+\.?\d*", line)
        if m:
            price = _parse_money(m.group())
            break
    if price is None:
        return None

    name = lines[0]  # first non-empty line is usually the asset name
    owned = 0
    for line in lines:
        m = re.search(r"owned[:\s]+(\d+)|you own[:\s]+(\d+)|x(\d+)", line, re.I)
        if m:
            owned = int(next(g for g in m.groups() if g is not None))
            break

    return {"name": name, "price": price, "owned": owned}
