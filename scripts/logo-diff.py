#!/usr/bin/env python3
"""Pixel-diff the rotating 3D logo (via /dev/logo) against the reference image."""
import asyncio, sys
from pathlib import Path
from PIL import Image, ImageChops
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "src/assets/logo-reference.jpg"
OUT_DIR = ROOT / "artifacts"
OUT_DIR.mkdir(exist_ok=True)
SHOT = OUT_DIR / "logo-current.png"
DIFF = OUT_DIR / "logo-diff.png"

async def capture():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1280}, device_scale_factor=1)
        page = await ctx.new_page()
        await page.goto("http://localhost:8080/dev/logo", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        stage = page.locator("#logo-diff-stage")
        await stage.screenshot(path=str(SHOT))
        await browser.close()

def diff():
    ref = Image.open(REF).convert("RGB").resize((1024, 1024))
    cur = Image.open(SHOT).convert("RGB").resize((1024, 1024))
    d = ImageChops.difference(ref, cur)
    d.save(DIFF)
    # Percent of pixels differing by > 32 in any channel.
    import numpy as np
    arr = np.asarray(d)
    mask = (arr.max(axis=2) > 32)
    pct = float(mask.mean()) * 100.0
    print(f"logo-diff: {pct:.2f}% pixels differ (>32 threshold)")
    print(f"reference: {REF}\ncurrent:   {SHOT}\ndiff:      {DIFF}")
    return pct

async def main():
    await capture()
    pct = diff()
    sys.exit(0 if pct < 40 else 1)

if __name__ == "__main__":
    asyncio.run(main())
