"""E2E: verify company-profile directions buttons.

For a company that has lat/lng coords rendered ([data-testid="directions-panel"]):
  * Neshan link points to nshn.ir/maps?lat=…&lng=…
  * Google Maps link points to google.com/maps/dir/?api=1&destination=lat,lng
  * Copy-location button writes ?lat=…&lng=… URL to the clipboard
  * Button labels translate between FA and EN

If no company in the seeded exhibition has coords, the script exits 0 with a
clear "skipped" message so CI stays green until seed data covers it.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

from playwright.async_api import async_playwright


BASE_URL = "http://localhost:8080"
ROOT = Path(__file__).resolve().parent.parent


def load_locale(lang: str) -> dict:
    p = ROOT / "src" / "i18n" / "locales" / f"{lang}.json"
    return json.loads(p.read_text(encoding="utf-8"))


async def find_company_with_coords(page) -> str | None:
    await page.goto(urljoin(BASE_URL, "/exhibition"), wait_until="domcontentloaded")
    await page.wait_for_selector('a[href^="/company/"]:not([href*="/product/"])', timeout=15000)
    paths: list[str] = await page.eval_on_selector_all(
        'a[href^="/company/"]:not([href*="/product/"])',
        "els => Array.from(new Set(els.map(a => new URL(a.href).pathname)))",
    )
    paths = sorted(p for p in paths if p.count("/") == 2)
    for cp in paths:
        await page.goto(urljoin(BASE_URL, cp), wait_until="domcontentloaded")
        try:
            await page.wait_for_selector('[data-testid="directions-panel"]', timeout=2500)
            return cp
        except Exception:
            continue
    return None


async def set_lang(page, lang: str) -> None:
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.evaluate(
        """(l) => {
            document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
            try { localStorage.setItem('i18nextLng', l); } catch {}
        }""",
        lang,
    )


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


async def check_lang(page, cp: str, lang: str, expected: dict) -> None:
    await set_lang(page, lang)
    await page.goto(urljoin(BASE_URL, cp), wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="directions-panel"]', timeout=10000)

    neshan_text = (await page.locator('[data-testid="btn-neshan"]').inner_text()).strip()
    gmaps_text = (await page.locator('[data-testid="btn-gmaps"]').inner_text()).strip()
    copy_text = (await page.locator('[data-testid="btn-copy-loc"]').inner_text()).strip()

    if expected["open_neshan"] not in neshan_text:
        fail(f"[{lang}] Neshan button text {neshan_text!r} missing {expected['open_neshan']!r}")
    if expected["open_gmaps"] not in gmaps_text:
        fail(f"[{lang}] GMaps button text {gmaps_text!r} missing {expected['open_gmaps']!r}")
    if expected["copy_location_link"] not in copy_text:
        fail(f"[{lang}] Copy button text {copy_text!r} missing {expected['copy_location_link']!r}")

    neshan_href = await page.locator('[data-testid="btn-neshan"]').get_attribute("data-href")
    gmaps_href = await page.locator('[data-testid="btn-gmaps"]').get_attribute("data-href")

    m1 = re.match(r"^https://nshn\.ir/maps\?lat=(-?\d+\.?\d*)&lng=(-?\d+\.?\d*)$", neshan_href or "")
    if not m1:
        fail(f"[{lang}] Neshan href malformed: {neshan_href!r}")
    lat, lng = m1.group(1), m1.group(2)

    lat = str(round(float(lat), 5)).rstrip("0").rstrip(".")
    lng = str(round(float(lng), 5)).rstrip("0").rstrip(".")
    expected_neshan = f"https://nshn.ir/maps?lat={lat}&lng={lng}"
    expected_gmaps = f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}"
    if neshan_href != expected_neshan:
        fail(f"[{lang}] Neshan href {neshan_href!r} != {expected_neshan!r}")
    if gmaps_href != expected_gmaps:
        fail(f"[{lang}] GMaps href {gmaps_href!r} != {expected_gmaps!r}")

    print(f"ok  [{lang}] labels + hrefs (lat={lat}, lng={lng})")

    # Copy-link: install clipboard shim, click, assert URL captured
    await page.evaluate(
        """() => {
            window.__copied = null;
            navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
        }"""
    )
    await page.locator('[data-testid="btn-copy-loc"]').click()
    await page.wait_for_timeout(150)
    copied = await page.evaluate("window.__copied")
    if not copied or f"lat={lat}" not in copied or f"lng={lng}" not in copied:
        fail(f"[{lang}] clipboard payload missing coords: {copied!r}")
    print(f"ok  [{lang}] clipboard payload = {copied}")

    await page.goto(copied, wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="directions-panel"]', timeout=10000)
    status = await page.locator('[data-testid="directions-panel"] [role="status"]').inner_text(timeout=5000)
    if expected["location_link_opened"] not in status:
        fail(f"[{lang}] copied location highlight missing: {status!r}")
    print(f"ok  [{lang}] copied profile URL highlights directions panel")


async def main() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        cp = await find_company_with_coords(page)
        if not cp:
            print("skip: no seeded company has lat/lng coords; test skipped.")
            await browser.close()
            return 0
        print(f"testing directions on {cp}")

        fa = load_locale("fa")["company"]
        en = load_locale("en")["company"]
        await check_lang(page, cp, "fa", fa)
        await check_lang(page, cp, "en", en)

        await browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
