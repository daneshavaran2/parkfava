"""Visual regression test for company & product pages.

Captures screenshots of the first exhibition company profile and its first
product page, compares them pixel-wise against baselines stored under
tests/visual/baseline/. Run with UPDATE_BASELINE=1 to (re)generate baselines.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

from PIL import Image, ImageChops
from playwright.async_api import async_playwright


BASE_URL = "http://localhost:8080"
ROOT = Path(__file__).resolve().parent.parent
BASELINE_DIR = ROOT / "tests" / "visual" / "baseline"
CURRENT_DIR = ROOT / "tests" / "visual" / "current"
DIFF_DIR = ROOT / "tests" / "visual" / "diff"

# Tolerate up to 1% of pixels differing (fonts / anti-alias jitter across CI).
PIXEL_DIFF_TOLERANCE = 0.01

UPDATE = os.environ.get("UPDATE_BASELINE") == "1"


async def wait_ready(page) -> None:
    await page.wait_for_load_state("networkidle")
    await page.evaluate("document.fonts && document.fonts.ready")
    await page.wait_for_timeout(600)


async def snap(page, name: str) -> Path:
    CURRENT_DIR.mkdir(parents=True, exist_ok=True)
    path = CURRENT_DIR / f"{name}.png"
    await page.screenshot(path=str(path))
    return path


def compare(name: str, current: Path) -> tuple[bool, float]:
    baseline = BASELINE_DIR / f"{name}.png"
    if UPDATE or not baseline.exists():
        BASELINE_DIR.mkdir(parents=True, exist_ok=True)
        baseline.write_bytes(current.read_bytes())
        print(f"[baseline] wrote {baseline.relative_to(ROOT)}")
        return True, 0.0

    a = Image.open(baseline).convert("RGB")
    b = Image.open(current).convert("RGB")
    if a.size != b.size:
        b = b.resize(a.size)
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    if not bbox:
        return True, 0.0
    # Count non-zero pixels
    hist = diff.convert("L").getdata()
    changed = sum(1 for p in hist if p > 8)
    total = a.size[0] * a.size[1]
    ratio = changed / total
    if ratio > PIXEL_DIFF_TOLERANCE:
        DIFF_DIR.mkdir(parents=True, exist_ok=True)
        diff_path = DIFF_DIR / f"{name}.png"
        diff.save(diff_path)
        print(f"[diff]  saved {diff_path.relative_to(ROOT)} ({ratio*100:.2f}% pixels changed)")
        return False, ratio
    return True, ratio


VIEWPORTS = [
    ("desktop", {"width": 1280, "height": 1800}),
    # iPad landscape: boundary where 2-col grids transition to 3-col.
    ("tablet-lg", {"width": 1024, "height": 1366}),
    ("tablet", {"width": 768, "height": 1200}),
    # 414px covers iPhone 11 Pro Max / Plus-class devices where hero and grid
    # layouts break differently than the 375px small-mobile baseline.
    ("mobile-lg", {"width": 414, "height": 896}),
    ("mobile", {"width": 375, "height": 812}),
    # 320px: minimum supported width (iPhone SE 1st gen, low-end Android).
    # Below Tailwind's `sm` breakpoint; catches horizontal-overflow regressions.
    ("mobile-xs", {"width": 320, "height": 568}),
]


async def _find_company_and_product(page) -> tuple[str | None, str | None]:
    await page.goto(urljoin(BASE_URL, "/exhibition"), wait_until="domcontentloaded")
    await page.wait_for_selector('a[href^="/company/"]:not([href*="/product/"])', timeout=15000)
    company_paths: list[str] = await page.eval_on_selector_all(
        'a[href^="/company/"]:not([href*="/product/"])',
        "els => Array.from(new Set(els.map(a => new URL(a.href).pathname)))",
    )
    company_paths = sorted(p for p in company_paths if p.count("/") == 2)
    for cp in company_paths:
        await page.goto(urljoin(BASE_URL, cp), wait_until="domcontentloaded")
        await wait_ready(page)
        product_paths: list[str] = await page.eval_on_selector_all(
            '[data-testid="product-more-link"]',
            "els => els.map(a => new URL(a.href).pathname)",
        )
        if product_paths:
            return cp, product_paths[0]
    return (company_paths[0] if company_paths else None), None


async def _apply_prefs(page, lang: str, theme: str) -> None:
    """Set language cookie/localStorage + theme localStorage on localhost."""
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.evaluate(
        """([lang, theme]) => {
            document.cookie = `lang=${lang}; path=/; max-age=31536000; samesite=lax`;
            try { localStorage.setItem('i18nextLng', lang); } catch {}
            try { localStorage.setItem('fava-theme', theme); } catch {}
        }""",
        [lang, theme],
    )


async def run_viewport(pw, label: str, size: dict) -> tuple[bool, list[str]]:
    browser = await pw.chromium.launch(headless=True)
    context = await browser.new_context(viewport=size, device_scale_factor=1, locale="fa-IR")
    page = await context.new_page()
    results: list[str] = []
    ok = True

    company_path, product_path = await _find_company_and_product(page)
    if not company_path:
        print(f"[{label}] no company links found", file=sys.stderr)
        await browser.close()
        return False, results

    # Baseline snapshot (fa + dark, no explicit prefs) — matches historical baselines.
    await page.goto(urljoin(BASE_URL, company_path), wait_until="domcontentloaded")
    await wait_ready(page)
    company_snap = await snap(page, f"company-profile-{label}")
    c_ok, c_r = compare(f"company-profile-{label}", company_snap)
    ok = ok and c_ok
    results.append(f"[{label}] company-profile: {'OK' if c_ok else 'DIFF'} ({c_r*100:.2f}%)")

    if product_path:
        await page.goto(urljoin(BASE_URL, product_path), wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="product-detail-layout"]', timeout=15000)
        await wait_ready(page)
        product_snap = await snap(page, f"product-detail-{label}")
        p_ok, p_r = compare(f"product-detail-{label}", product_snap)
        ok = ok and p_ok
        results.append(f"[{label}] product-detail:  {'OK' if p_ok else 'DIFF'} ({p_r*100:.2f}%)")
    results.append(f"[{label}] chosen company: {company_path}")

    # Theme × language matrix — only for the compact set of viewports (keeps
    # baseline count manageable). Pins EN/FA and light/dark to prevent the
    # theme/language cross-wiring bug from recurring silently.
    if label in ("desktop", "mobile"):
        for lang in ("fa", "en"):
            for theme in ("light", "dark"):
                await _apply_prefs(page, lang, theme)
                await page.goto(urljoin(BASE_URL, company_path), wait_until="domcontentloaded")
                await wait_ready(page)
                name = f"company-profile-{label}-{lang}-{theme}"
                s = await snap(page, name)
                m_ok, m_r = compare(name, s)
                ok = ok and m_ok
                results.append(f"[{label}] {lang}/{theme}: {'OK' if m_ok else 'DIFF'} ({m_r*100:.2f}%)")

    await browser.close()
    return ok, results


async def main() -> int:
    async with async_playwright() as pw:
        overall = True
        for label, size in VIEWPORTS:
            ok, lines = await run_viewport(pw, label, size)
            for l in lines:
                print(l)
            overall = overall and ok
        return 0 if overall else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

