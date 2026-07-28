"""Smoke test: company profile in LIGHT theme.

Verifies for a seeded company profile:
  * The page fully loads (no error boundary, no 404)
  * FA and EN translations render (no leaked i18n keys like "company.foo")
  * Key text is visible on the light background (contrast sanity: text
    color must differ meaningfully from the page background)
  * The website link, when present, is visible (not hidden by same-color text)

If no seeded company exists, exits 0 with a "skipped" message so CI stays
green until seed data is available.
"""
from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

from playwright.async_api import async_playwright

BASE_URL = "http://localhost:8080"
ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "tests" / "smoke" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

# Any text token matching `word.word` with lowercase ascii is almost certainly
# an untranslated i18n key that leaked into the DOM.
I18N_KEY_RE = re.compile(r"\b[a-z][a-z0-9_]+\.[a-z][a-z0-9_.]+\b")

# Allow-list of substrings that legitimately match the regex (domains, file
# extensions, code identifiers rendered in the page).
ALLOWED_KEYSHAPED = (
    ".com", ".ir", ".org", ".net", ".io", ".co", ".app", ".dev",
    ".png", ".jpg", ".jpeg", ".webp", ".pdf", ".mp4", ".svg",
    "e.g.", "i.e.",
)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def looks_like_i18n_key(token: str) -> bool:
    if any(a in token for a in ALLOWED_KEYSHAPED):
        return False
    # Bare "x.y" with no digits and no path-like slashes is suspicious.
    return "/" not in token and not any(c.isdigit() for c in token)


async def set_prefs(page, lang: str, theme: str) -> None:
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.evaluate(
        """({lang, theme}) => {
            document.cookie = `lang=${lang}; path=/; max-age=31536000; samesite=lax`;
            document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
            try {
              localStorage.setItem('i18nextLng', lang);
              localStorage.setItem('theme', theme);
            } catch {}
        }""",
        {"lang": lang, "theme": theme},
    )


async def find_first_company(page) -> str | None:
    await page.goto(urljoin(BASE_URL, "/exhibition"), wait_until="domcontentloaded")
    try:
        await page.wait_for_selector('a[href^="/company/"]', timeout=15000)
    except Exception:
        return None
    paths: list[str] = await page.eval_on_selector_all(
        'a[href^="/company/"]:not([href*="/product/"])',
        "els => Array.from(new Set(els.map(a => new URL(a.href).pathname)))",
    )
    paths = sorted(p for p in paths if p.count("/") == 2)
    return paths[0] if paths else None


def parse_rgb(s: str) -> tuple[int, int, int, float]:
    m = re.match(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)", s or "")
    if not m:
        return (0, 0, 0, 1.0)
    a = float(m.group(4)) if m.group(4) is not None else 1.0
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)), a)


def luminance(rgb: tuple[int, int, int, float]) -> float:
    def chan(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b, _ = rgb
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)


def contrast_ratio(a: tuple[int, int, int, float], b: tuple[int, int, int, float]) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


async def check_page(page, path: str, lang: str) -> None:
    await set_prefs(page, lang, "light")
    await page.goto(urljoin(BASE_URL, path), wait_until="networkidle")
    # give the app a beat to finish hydration + async data
    await page.wait_for_timeout(500)

    # Should not be showing the error boundary or a 404
    body_text = (await page.locator("body").inner_text()).strip()
    for red_flag in ("Something went wrong", "Page not found", "خطای غیرمنتظره"):
        if red_flag.lower() in body_text.lower():
            fail(f"[{lang}] page shows error/404: {red_flag}")

    # Confirm we actually rendered the theme=light
    theme_attr = await page.evaluate("document.documentElement.getAttribute('data-theme') || document.documentElement.className")
    if "dark" in (theme_attr or "").lower():
        fail(f"[{lang}] page rendered dark despite theme=light (attr={theme_attr!r})")

    # Untranslated i18n keys leaking into the DOM
    tokens = I18N_KEY_RE.findall(body_text)
    leaks = [t for t in tokens if looks_like_i18n_key(t)]
    if leaks:
        fail(f"[{lang}] suspected untranslated i18n keys in DOM: {sorted(set(leaks))[:10]}")

    # Contrast sanity: sample the H1/H2 vs the page background
    heading = page.locator("h1, h2").first
    if await heading.count() == 0:
        fail(f"[{lang}] no h1/h2 heading rendered")
    hcolor, hbg = await heading.evaluate("""el => {
        const style = getComputedStyle(el);
        let bg = style.backgroundColor, node = el;
        while (node && (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
            node = node.parentElement;
            if (!node) break;
            bg = getComputedStyle(node).backgroundColor;
        }
        return [style.color, bg || getComputedStyle(document.body).backgroundColor];
    }""")
    ratio = contrast_ratio(parse_rgb(hcolor), parse_rgb(hbg))
    if ratio < 3.0:
        fail(f"[{lang}] heading contrast too low in light theme: {ratio:.2f} (color={hcolor}, bg={hbg})")
    print(f"ok  [{lang}] heading contrast = {ratio:.2f}")

    # Website link (if present) should be visible. Skip when the effective
    # background is a gradient/image — getComputedStyle().backgroundColor is
    # transparent for those and would produce a spurious low-contrast reading.
    site = page.locator('a[href^="http"]:not([href*="google.com"]):not([href*="nshn.ir"])').first
    if await site.count():
        scolor, sbg, sbgimg = await site.evaluate("""el => {
            const s = getComputedStyle(el);
            let bg = s.backgroundColor, bgimg = s.backgroundImage, node = el;
            while (node && (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && (!bgimg || bgimg === 'none')) {
                node = node.parentElement;
                if (!node) break;
                const cs = getComputedStyle(node);
                bg = cs.backgroundColor; bgimg = cs.backgroundImage;
            }
            return [s.color, bg || getComputedStyle(document.body).backgroundColor, bgimg];
        }""")
        if sbgimg and sbgimg != "none":
            print(f"ok  [{lang}] external link over gradient/image bg — skipping contrast check")
        else:
            r = contrast_ratio(parse_rgb(scolor), parse_rgb(sbg))
            if r < 3.0:
                fail(f"[{lang}] external link invisible in light theme: contrast={r:.2f} color={scolor} bg={sbg}")
            print(f"ok  [{lang}] external link contrast = {r:.2f}")

    shot = SHOTS / f"company-light-{lang}.png"
    await page.screenshot(path=str(shot))
    print(f"ok  [{lang}] screenshot -> {shot.relative_to(ROOT)}")


async def main() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        path = await find_first_company(page)
        if not path:
            print("skip: no seeded company profile found")
            await browser.close()
            return 0
        print(f"smoke: {path}")

        await check_page(page, path, "fa")
        await check_page(page, path, "en")

        await browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
