ERA_SIGNATURES = {
    "great_depression": {
        "detect": lambda h: _stock_change(h, years=2) < -0.40,
        "priority": ["bonds", "gold", "savings"],
        "avoid": ["stocks", "crops"],
        "sell_threshold": -0.10,
        "buy_threshold": -0.30,
    },
    "postwar_boom": {
        "detect": lambda h: _stock_change(h, years=3) > 0.25 and _gold_change(h, years=3) < 0.10,
        "priority": ["index_fund", "stocks", "bonds"],
        "avoid": ["gold"],
        "sell_threshold": 0.30,
        "buy_threshold": -0.05,
    },
    "stagflation": {
        "detect": lambda h: _gold_change(h, years=3) > 0.20 and abs(_stock_change(h, years=3)) < 0.10,
        "priority": ["gold", "crops", "savings"],
        "avoid": ["bonds", "index_fund"],
        "sell_threshold": 0.25,
        "buy_threshold": 0.0,
    },
    "bull_market": {
        "detect": lambda h: _stock_change(h, years=3) > 0.40,
        "priority": ["stocks", "index_fund", "gold"],
        "avoid": ["bonds"],
        "sell_threshold": 0.35,
        "buy_threshold": -0.05,
    },
    "dot_com": {
        "detect": lambda h: _stock_change(h, years=2) > 0.50,
        "priority": ["stocks", "index_fund"],
        "avoid": ["bonds", "crops"],
        "sell_threshold": 0.20,  # take profits early before crash
        "buy_threshold": -0.05,
        "sell_after_year": 14,   # 70% of the way through = sell everything
    },
    "crisis": {
        "detect": lambda h: _stock_change(h, years=3) < -0.30,
        "priority": ["gold", "savings", "bonds"],
        "avoid": ["stocks", "crops"],
        "sell_threshold": -0.10,
        "buy_threshold": -0.20,
        "recovery_year": 14,     # re-enter stocks after crash
    },
}

CASH_BUFFER = 2500
DEFAULT_PRIORITY = ["index_fund", "stocks", "gold", "crops", "bonds", "savings"]


def _stock_change(history, years):
    prices = history.get("stock_index", [])
    if len(prices) < years + 1:
        return 0.0
    base = prices[-(years + 1)]
    if base == 0:
        return 0.0
    return (prices[-1] - base) / base


def _gold_change(history, years):
    prices = history.get("gold", [])
    if len(prices) < years + 1:
        return 0.0
    base = prices[-(years + 1)]
    if base == 0:
        return 0.0
    return (prices[-1] - base) / base


class Strategy:
    def __init__(self):
        self.price_history = {}   # asset_name -> [price, ...]
        self.buy_prices = {}      # asset_name -> price paid
        self.detected_era = None

    def record_prices(self, state):
        for asset_type, data in state.get("assets", {}).items():
            if isinstance(data, dict) and "price" in data:
                self.price_history.setdefault(asset_type, []).append(data["price"])
            elif isinstance(data, list):
                for item in data:
                    name = item.get("name", asset_type)
                    self.price_history.setdefault(name, []).append(item.get("price", 0))

        # Maintain a synthetic stock index for era detection
        stock_prices = [
            v[-1] for k, v in self.price_history.items()
            if k not in ("gold", "index_fund", "bonds", "savings", "cds")
            and v
        ]
        if stock_prices:
            self.price_history.setdefault("stock_index", []).append(
                sum(stock_prices) / len(stock_prices)
            )

    def detect_era(self):
        if self.detected_era:
            return self.detected_era
        for name, sig in ERA_SIGNATURES.items():
            try:
                if sig["detect"](self.price_history):
                    self.detected_era = name
                    print(f"[strategy] Detected era: {name}")
                    return name
            except Exception:
                pass
        return "unknown"

    def decide(self, state):
        self.record_prices(state)
        era = self.detect_era()
        era_cfg = ERA_SIGNATURES.get(era, {})

        year = state.get("year", 0)
        cash = state.get("cash", 0)
        spendable = cash - CASH_BUFFER
        actions = []

        if spendable <= 0:
            return actions

        # Forced sell before a known crash window
        if era == "dot_com" and year >= era_cfg.get("sell_after_year", 99):
            actions += self._sell_all(state)

        # Re-enter after crisis recovery
        if era == "crisis" and year >= era_cfg.get("recovery_year", 99):
            self.detected_era = "postwar_boom"  # treat recovery as growth era

        priority = era_cfg.get("priority", DEFAULT_PRIORITY)
        avoid = era_cfg.get("avoid", [])
        sell_thresh = era_cfg.get("sell_threshold", 0.25)
        buy_thresh = era_cfg.get("buy_threshold", -0.05)

        # Sell decisions
        actions += self._sell_decisions(state, sell_thresh)

        # Buy decisions
        actions += self._buy_decisions(state, spendable, priority, avoid, buy_thresh)

        return actions

    def _sell_decisions(self, state, sell_threshold):
        actions = []
        for asset_type, data in state.get("assets", {}).items():
            items = [data] if isinstance(data, dict) else data
            for item in items:
                name = item.get("name", asset_type)
                owned = item.get("owned", 0)
                price = item.get("price", 0)
                if owned <= 0 or price == 0:
                    continue
                buy_price = self.buy_prices.get(name)
                if buy_price is None:
                    continue
                gain = (price - buy_price) / buy_price
                stop_loss = -0.15
                if gain >= sell_threshold or gain <= stop_loss:
                    actions.append({"type": "sell", "asset": name, "quantity": owned})
                    del self.buy_prices[name]
        return actions

    def _buy_decisions(self, state, spendable, priority, avoid, buy_threshold):
        actions = []
        # Build a ranked list of buyable assets
        candidates = []
        for asset_type, data in state.get("assets", {}).items():
            if asset_type in avoid:
                continue
            items = [data] if isinstance(data, dict) else data
            for item in items:
                if not isinstance(item, dict):
                    continue
                name = item.get("name", asset_type)
                price = item.get("price", 0)
                if price <= 0:
                    continue
                history = self.price_history.get(name, [])
                momentum = self._momentum(history)
                # Score: higher priority index = lower score (better)
                pri_score = priority.index(asset_type) if asset_type in priority else len(priority)
                candidates.append((pri_score, -momentum, name, asset_type, price))

        candidates.sort()

        for pri_score, neg_mom, name, asset_type, price in candidates:
            if spendable < price:
                continue
            history = self.price_history.get(name, [])
            momentum = self._momentum(history)
            if momentum < buy_threshold and len(history) < 3:
                continue  # not enough data yet, skip non-priority assets
            qty = max(1, int(spendable * 0.6 / price))  # spend up to 60% of spendable on best asset
            qty = min(qty, int(spendable / price))
            if qty < 1:
                continue
            actions.append({"type": "buy", "asset": name, "asset_type": asset_type, "quantity": qty, "price": price})
            self.buy_prices[name] = price
            spendable -= qty * price
            break  # buy one asset type per year to stay decisive

        return actions

    def _sell_all(self, state):
        actions = []
        for asset_type, data in state.get("assets", {}).items():
            items = [data] if isinstance(data, dict) else data
            for item in items:
                name = item.get("name", asset_type)
                owned = item.get("owned", 0)
                if owned > 0:
                    actions.append({"type": "sell", "asset": name, "quantity": owned})
        return actions

    @staticmethod
    def _momentum(history):
        if len(history) < 3:
            return 0.0
        base = history[-3]
        if base == 0:
            return 0.0
        return (history[-1] - base) / base
