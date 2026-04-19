"""
Generic Competitor Scraper
يشتغل على أي موقع عبر config — لا يعرف شيئاً عن Homecenter أو Noon
"""

import asyncio
import random
import re
import logging
from datetime import datetime
from typing import Any

from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout

from .config import COMPETITORS

logger = logging.getLogger(__name__)

# ── User-agents rotation ────────────────────────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 Safari/605.1.15",
]


# ── Result schema ───────────────────────────────────────────────────────────
def _empty_result(competitor: str, query: str, error: str = "") -> dict:
    return {
        "competitor":   competitor,
        "query":        query,
        "title":        None,
        "price":        None,
        "currency":     "SAR",
        "link":         None,
        "image":        None,
        "available":    None,
        "scraped_at":   datetime.utcnow().isoformat(),
        "error":        error,
    }


def _parse_price(raw: str | None) -> float | None:
    if not raw:
        return None
    digits = re.sub(r"[^\d.]", "", raw.replace(",", ""))
    try:
        return float(digits) if digits else None
    except ValueError:
        return None


def _is_available(raw: str | None) -> bool | None:
    if raw is None:
        return None
    low = raw.lower()
    if any(w in low for w in ["out of stock", "unavailable", "نفذ", "غير متوفر"]):
        return False
    if any(w in low for w in ["in stock", "available", "متوفر", "add to cart", "اضف"]):
        return True
    return None


# ── Core page helpers ───────────────────────────────────────────────────────
async def _try_text(page: Page, selector: str) -> str | None:
    """يحاول يجيب النص من أول selector يشتغل."""
    for sel in selector.split(","):
        sel = sel.strip()
        try:
            el = await page.query_selector(sel)
            if el:
                text = await el.inner_text()
                if text and text.strip():
                    return text.strip()
        except Exception:
            continue
    return None


async def _try_attr(page: Page, selector: str, attr: str) -> str | None:
    for sel in selector.split(","):
        sel = sel.strip()
        try:
            el = await page.query_selector(sel)
            if el:
                val = await el.get_attribute(attr)
                if val:
                    return val
        except Exception:
            continue
    return None


async def _extract_card(card: Any, cfg: dict, base_url: str) -> dict:
    """يستخرج بيانات من product card element."""
    selectors = cfg["selectors"]

    async def card_text(sel: str) -> str | None:
        for s in sel.split(","):
            s = s.strip()
            try:
                el = await card.query_selector(s)
                if el:
                    t = await el.inner_text()
                    if t and t.strip():
                        return t.strip()
            except Exception:
                continue
        return None

    async def card_attr(sel: str, attr: str) -> str | None:
        for s in sel.split(","):
            s = s.strip()
            try:
                el = await card.query_selector(s)
                if el:
                    v = await el.get_attribute(attr)
                    if v:
                        return v
            except Exception:
                continue
        return None

    title        = await card_text(selectors["title"])
    price_raw    = await card_text(selectors["price"])
    avail_raw    = await card_text(selectors.get("availability", ""))
    link_raw     = await card_attr(selectors["link"], "href")
    image_raw    = await card_attr(selectors["image"], "src")

    # normalize link
    if link_raw and link_raw.startswith("/"):
        link_raw = base_url.rstrip("/") + link_raw

    return {
        "title":     title,
        "price":     _parse_price(price_raw),
        "link":      link_raw,
        "image":     image_raw,
        "available": _is_available(avail_raw),
    }


# ── Auto-discover selectors (debug helper) ─────────────────────────────────
async def auto_discover(competitor_key: str, query: str = "طاولة") -> dict:
    """
    يفتح صفحة البحث ويطبع الـ selectors الموجودة فعلاً —
    اشغله مرة واحدة وانسخ النتيجة في config.py
    """
    cfg      = COMPETITORS[competitor_key]
    url      = cfg["base_url"] + cfg["search_path"].format(query=query)
    hints    = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page    = await browser.new_page(user_agent=random.choice(USER_AGENTS))
        await page.goto(url, wait_until=cfg.get("wait_for", "domcontentloaded"), timeout=30000)
        await page.wait_for_timeout(cfg.get("extra_wait_ms", 2000))

        # اطبع أكثر 15 class شائعة في الصفحة
        classes = await page.evaluate("""() => {
            const freq = {};
            document.querySelectorAll('[class]').forEach(el => {
                el.className.split(/\s+/).forEach(c => {
                    if (c.length > 2) freq[c] = (freq[c]||0)+1;
                });
            });
            return Object.entries(freq)
                .sort((a,b)=>b[1]-a[1])
                .slice(0,20)
                .map(([c,n])=>({class:c, count:n}));
        }""")

        hints["top_classes"] = classes
        hints["url_tested"]  = url
        await browser.close()

    return hints


# ── Main search function ────────────────────────────────────────────────────
async def search_competitor(
    competitor_key: str,
    query: str,
    max_results: int = 5,
) -> list[dict]:
    """
    البحث عن منتج في موقع منافس.

    competitor_key : مفتاح من COMPETITORS — مثلاً "homecenter"
    query          : اسم المنتج أو SKU
    max_results    : أقصى عدد نتائج لكل موقع
    """
    if competitor_key not in COMPETITORS:
        raise ValueError(f"Unknown competitor: {competitor_key}. Available: {list(COMPETITORS)}")

    cfg      = COMPETITORS[competitor_key]
    base_url = cfg["base_url"]
    url      = base_url + cfg["search_path"].format(query=query)
    results  = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=random.choice(USER_AGENTS),
            viewport={"width": 1280, "height": 800},
            locale=cfg.get("language", "en"),
            extra_http_headers={"Accept-Language": "ar,en;q=0.9"},
        )
        page = await context.new_page()

        # إخفاء علامات Playwright
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
        """)

        current_url = url
        page_num    = 1
        max_pages   = cfg.get("pagination", {}).get("max_pages", 1)

        while current_url and page_num <= max_pages and len(results) < max_results:
            try:
                logger.info(f"[{competitor_key}] page {page_num} — {current_url}")
                await page.goto(current_url, wait_until=cfg.get("wait_for", "domcontentloaded"), timeout=30000)
                await page.wait_for_timeout(cfg.get("extra_wait_ms", 2000) + random.randint(500, 1500))

                # جمع الـ product cards
                cards = []
                for sel in cfg["selectors"]["results"].split(","):
                    cards = await page.query_selector_all(sel.strip())
                    if cards:
                        logger.info(f"[{competitor_key}] found {len(cards)} cards via '{sel.strip()}'")
                        break

                if not cards:
                    logger.warning(f"[{competitor_key}] no product cards found on page {page_num}")
                    break

                for card in cards[:max_results - len(results)]:
                    try:
                        data = await _extract_card(card, cfg, base_url)
                        if data.get("title") or data.get("link"):
                            results.append({
                                "competitor": competitor_key,
                                "query":      query,
                                **data,
                                "scraped_at": datetime.utcnow().isoformat(),
                                "error":      None,
                            })
                    except Exception as e:
                        logger.warning(f"[{competitor_key}] card extract error: {e}")

                # الصفحة التالية
                if not cfg.get("pagination", {}).get("enabled") or page_num >= max_pages:
                    break

                next_btn_sel = cfg["pagination"].get("next_btn", "")
                try:
                    next_btn = await page.query_selector(next_btn_sel)
                    if next_btn:
                        await next_btn.click()
                        await page.wait_for_timeout(2000)
                        current_url = page.url
                        page_num   += 1
                    else:
                        break
                except PWTimeout:
                    break

            except PWTimeout:
                logger.error(f"[{competitor_key}] timeout on page {page_num}")
                break
            except Exception as e:
                logger.error(f"[{competitor_key}] error: {e}")
                results.append(_empty_result(competitor_key, query, str(e)))
                break

        await browser.close()

    logger.info(f"[{competitor_key}] done — {len(results)} results for '{query}'")
    return results


# ── Scan multiple competitors in parallel ─────────────────────────────────
async def scan_all_competitors(
    query: str,
    competitor_keys: list[str] | None = None,
    max_results: int = 5,
) -> dict[str, list[dict]]:
    """
    يبحث في كل المنافسين بالتوازي.
    competitor_keys=None → يبحث في الكل
    """
    keys = competitor_keys or list(COMPETITORS.keys())

    tasks = {
        key: search_competitor(key, query, max_results)
        for key in keys
    }

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)

    return {
        key: res if not isinstance(res, Exception) else [_empty_result(key, query, str(res))]
        for key, res in zip(tasks.keys(), results)
    }
