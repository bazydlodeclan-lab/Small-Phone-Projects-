"""
Build Your Stax Bot
-------------------
Usage:
  python bot.py              # desktop, visible browser
  python bot.py --mobile     # iPhone 14 Pro emulation
  python bot.py --headless   # no browser window
  python bot.py --discover   # dump DOM HTML to discover selectors, then exit
"""

import asyncio
import argparse
import sys
from playwright.async_api import async_playwright, devices

from game_state import GameState
from strategy import Strategy

GAME_URL = "https://buildyourstax.com"
POLL_INTERVAL = 5  # seconds, matches the game's tick_time


async def launch_browser(playwright, mobile=False, headless=False):
    browser = await playwright.chromium.launch(headless=headless)
    if mobile:
        context = await browser.new_context(**devices["iPhone 14 Pro"])
        print("[bot] Mobile mode: iPhone 14 Pro emulation")
    else:
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
    return browser, context


async def start_solo_game(page):
    """Navigate to the game and click through to a solo game."""
    print("[bot] Loading game...")
    await page.goto(GAME_URL, wait_until="domcontentloaded", timeout=30000)
    await asyncio.sleep(3)

    # Try common start-game button text variations
    start_texts = [
        "Play Solo", "Solo", "Start Game", "Single Player",
        "Play", "Start", "New Game", "Solo Game",
    ]
    for text in start_texts:
        try:
            btn = page.get_by_role("button", name=text)
            if await btn.count() > 0:
                await btn.first.click()
                print(f"[bot] Clicked: {text!r}")
                await asyncio.sleep(2)
                break
        except Exception:
            continue

    # Some games show a "how to play" modal — dismiss it
    for dismiss_text in ["Got it", "Close", "OK", "Skip", "Continue", "Let's Go"]:
        try:
            btn = page.get_by_role("button", name=dismiss_text)
            if await btn.count() > 0:
                await btn.first.click()
                await asyncio.sleep(1)
                break
        except Exception:
            continue

    print("[bot] Game started.")


async def execute_action(page, action):
    asset = action["asset"]
    qty = action["quantity"]
    action_type = action["type"]

    print(f"[bot] {action_type.upper()} {qty}x {asset}")

    # Find the card containing the asset name
    card = page.locator(f"text={asset}").locator("..").first

    try:
        btn = card.get_by_role("button", name=action_type.capitalize())
        if await btn.count() == 0:
            # Fallback: search wider in the page
            btn = page.get_by_role("button", name=action_type.capitalize()).first
        await btn.click(timeout=3000)
        await asyncio.sleep(0.5)

        # Handle quantity input modal if it appears
        qty_input = page.locator("input[type='number'], input[placeholder*='quantity'], input[placeholder*='amount']").first
        if await qty_input.count() > 0:
            await qty_input.fill(str(qty))
            await asyncio.sleep(0.3)
            # Confirm
            for confirm_text in ["Confirm", "Buy", "Sell", "OK", "Submit"]:
                try:
                    confirm_btn = page.get_by_role("button", name=confirm_text)
                    if await confirm_btn.count() > 0:
                        await confirm_btn.first.click()
                        break
                except Exception:
                    continue

        await asyncio.sleep(0.5)
    except Exception as e:
        print(f"[bot] Could not execute {action_type} for {asset}: {e}")


async def discover_mode(page):
    """Dump the page HTML so selectors can be identified."""
    print("[bot] DISCOVER MODE: waiting 15 seconds for game to load fully...")
    await asyncio.sleep(15)
    html = await page.evaluate("() => document.body.outerHTML")
    out_file = "discovered_dom.html"
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[bot] DOM written to {out_file} ({len(html)} chars)")
    print("[bot] Open that file to inspect selectors, then update game_state.py if needed.")


async def run(mobile=False, headless=False, discover=False):
    async with async_playwright() as p:
        browser, context = await launch_browser(p, mobile=mobile, headless=headless)
        page = await context.new_page()

        await start_solo_game(page)

        if discover:
            await discover_mode(page)
            await browser.close()
            return

        game_state = GameState(page)
        strategy = Strategy()
        last_year = -1

        print("[bot] Entering game loop...")
        while True:
            try:
                state = await game_state.read()
            except Exception as e:
                print(f"[bot] Error reading state: {e}")
                await asyncio.sleep(POLL_INTERVAL)
                continue

            year = state["year"]
            cash = state["cash"]
            net_worth = state["net_worth"]

            if state["game_over"]:
                print(f"[bot] GAME OVER — Final net worth: ${net_worth:,.2f}")
                break

            if year != last_year and year > 0:
                last_year = year
                print(f"[bot] Year {year}/20 | Cash: ${cash:,.2f} | Net worth: ${net_worth:,.2f}")

                actions = strategy.decide(state)
                for action in actions:
                    await execute_action(page, action)

            elif cash > 2500 + 500 and year > 3:
                # Extra cash mid-year — deploy it opportunistically
                actions = strategy.decide(state)
                for action in actions:
                    if action["type"] == "buy":
                        await execute_action(page, action)
                        break  # one buy per mid-year check

            await asyncio.sleep(POLL_INTERVAL)

        print("[bot] Done. Keeping browser open for 30 seconds so you can see the results.")
        await asyncio.sleep(30)
        await browser.close()


def main():
    parser = argparse.ArgumentParser(description="Build Your Stax bot")
    parser.add_argument("--mobile", action="store_true", help="Emulate iPhone 14 Pro")
    parser.add_argument("--headless", action="store_true", help="Run without visible browser")
    parser.add_argument("--discover", action="store_true", help="Dump DOM HTML and exit")
    args = parser.parse_args()

    asyncio.run(run(mobile=args.mobile, headless=args.headless, discover=args.discover))


if __name__ == "__main__":
    main()
