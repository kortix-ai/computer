"""Validate a presentation slide's dimensions via Playwright.

Usage: uv run validate_slide.py <slide_html_path>

Renders the HTML at 1920x1080 and measures actual content height.
Outputs JSON with pass/fail and measurements.
"""

import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright


async def validate(slide_path: str) -> dict:
    """Render slide and measure dimensions."""
    html_path = Path(slide_path).resolve()
    if not html_path.exists():
        return {"success": False, "error": f"File not found: {html_path}"}

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="/Users/markokraemer/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
        )
        try:
            page = await browser.new_page(viewport={"width": 1920, "height": 1080})
            await page.goto(f"file://{html_path}", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)

            dims = await page.evaluate("""
                () => {
                    const b = document.body;
                    const h = document.documentElement;
                    const scrollHeight = Math.max(b.scrollHeight, b.offsetHeight, h.clientHeight, h.scrollHeight, h.offsetHeight);
                    const scrollWidth = Math.max(b.scrollWidth, b.offsetWidth, h.clientWidth, h.scrollWidth, h.offsetWidth);
                    return { scrollHeight, scrollWidth, viewportHeight: window.innerHeight, viewportWidth: window.innerWidth };
                }
            """)
        finally:
            await browser.close()

    passed = dims["scrollHeight"] <= 1080 and dims["scrollWidth"] <= 1920
    excess_h = max(0, dims["scrollHeight"] - 1080)
    excess_w = max(0, dims["scrollWidth"] - 1920)

    return {
        "success": True,
        "validation_passed": passed,
        "content_height": dims["scrollHeight"],
        "content_width": dims["scrollWidth"],
        "target_height": 1080,
        "target_width": 1920,
        "excess_height": excess_h,
        "excess_width": excess_w,
        "slide_path": str(html_path),
    }


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"success": False, "error": "Usage: validate_slide.py <slide_html_path>"}))
        sys.exit(1)

    result = asyncio.run(validate(sys.argv[1]))
    print(json.dumps(result))
    sys.exit(0 if result.get("success") and result.get("validation_passed", True) else 1)


if __name__ == "__main__":
    main()
