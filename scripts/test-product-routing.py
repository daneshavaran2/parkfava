import asyncio
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright, expect


BASE_URL = "http://localhost:8080"
SCREENSHOTS = Path("/tmp/browser/product-routing-test/screenshots")
PRODUCT_PATH_RE = re.compile(r"^/company/([^/]+)/product/([^/]+)$")


def assert_no_missing_outlet_route() -> None:
    """Guard against recreating a /company/$id layout that hides product children."""
    layout_route = Path("src/routes/company.$id.tsx")
    if not layout_route.exists():
        return
    source = layout_route.read_text(encoding="utf-8")
    if "<Outlet" not in source:
        raise AssertionError(
            "src/routes/company.$id.tsx exists but does not render <Outlet />; "
            "nested /company/:id/product/:pid pages would match without rendering."
        )


async def main() -> None:
    assert_no_missing_outlet_route()
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        page_errors: list[str] = []
        route_failures: list[str] = []
        page.on(
            "pageerror",
            lambda exc: page_errors.append(str(exc)),
        )
        page.on(
            "response",
            lambda response: route_failures.append(f"{response.status} {response.url}")
            if response.status >= 400
            and response.request.resource_type in {"document", "xhr", "fetch"}
            and "/company/" in response.url
            else None,
        )

        await page.goto(urljoin(BASE_URL, "/exhibition"), wait_until="domcontentloaded")
        await page.wait_for_selector('a[href^="/company/"]:not([href*="/product/"])', timeout=15000)

        company_paths = await page.eval_on_selector_all(
            'a[href^="/company/"]:not([href*="/product/"])',
            "els => Array.from(new Set(els.map(a => new URL(a.href).pathname)))",
        )
        company_paths = [path for path in company_paths if re.fullmatch(r"/company/[^/]+", path)]
        if not company_paths:
            raise AssertionError("No company pages were found from the exhibition grid.")

        checked_products = 0
        for company_path in company_paths:
            await page.goto(urljoin(BASE_URL, company_path), wait_until="domcontentloaded")
            await page.wait_for_selector("h1", timeout=15000)
            await expect(page.locator("h1").first).to_be_visible()
            await expect(page.get_by_text("محصولات و خدمات").first).to_be_visible(timeout=15000)

            more_links = await page.eval_on_selector_all(
                '[data-testid="product-more-link"]',
                "els => els.map(a => new URL(a.href).pathname)",
            )

            for product_path in more_links:
                match = PRODUCT_PATH_RE.match(product_path)
                if not match:
                    raise AssertionError(f"Product more link has wrong path: {product_path}")
                if match.group(1) != company_path.rsplit("/", 1)[-1]:
                    raise AssertionError(f"Product link company id does not match page: {product_path}")

                await page.goto(urljoin(BASE_URL, company_path), wait_until="domcontentloaded")
                link = page.locator(f'[data-testid="product-more-link"][href="{product_path}"]').first
                await expect(link).to_be_visible(timeout=15000)
                await link.click()
                await page.wait_for_url(lambda url: urlparse(url).path == product_path, timeout=15000)

                await expect(page.locator('[data-testid="product-detail-page"]')).to_be_visible(timeout=15000)
                await expect(page.locator('[data-testid="product-detail-hero"]')).to_be_visible()
                await expect(page.locator('[data-testid="product-detail-layout"]')).to_be_visible()
                await expect(page.get_by_text("مشخصات و توضیحات محصول")).to_be_visible()

                await page.reload(wait_until="domcontentloaded")
                await expect(page.locator('[data-testid="product-detail-layout"]')).to_be_visible(timeout=15000)
                await expect(page.get_by_text("مشخصات و توضیحات محصول")).to_be_visible()
                checked_products += 1

        await page.screenshot(path=str(SCREENSHOTS / "product-routing-final.png"))
        await browser.close()

        if checked_products == 0:
            raise AssertionError("Company pages rendered, but no product more controls were found to test.")
        if route_failures:
            raise AssertionError("Company/product route request failed: " + " | ".join(route_failures[-8:]))
        if page_errors:
            raise AssertionError("Browser runtime errors during product routing test: " + " | ".join(page_errors[-8:]))

        print(f"Checked {len(company_paths)} company pages and {checked_products} product routes.")


if __name__ == "__main__":
    asyncio.run(main())