"""
Competitor config — أضف منافس جديد بدون تعديل أي كود آخر
"""

COMPETITORS: dict = {
    "homecenter": {
        "name": "Homecenter",
        "base_url": "https://www.homecenter.com.sa",
        "search_path": "/search?q={query}",
        "language": "ar",
        "wait_for": "networkidle",
        "extra_wait_ms": 2000,
        "selectors": {
            # يُكتشف تلقائياً عند أول تشغيل — راجع auto_discover()
            "results":      "[data-testid='product-card'], .product-item, .product-card, article.product",
            "title":        "[data-testid='product-name'], .product-title, .product-name, h2, h3",
            "price":        "[data-testid='product-price'], .price, .product-price, [class*='price']",
            "link":         "a",
            "image":        "img",
            "availability": "[data-testid='stock'], .stock, .availability, [class*='stock'], [class*='avail']",
        },
        "pagination": {
            "enabled": True,
            "next_btn": "[aria-label='Next'], .pagination-next, button[data-testid='next']",
            "max_pages": 3,
        },
    },

    "noon": {
        "name": "Noon",
        "base_url": "https://www.noon.com/saudi-ar",
        "search_path": "/search/?q={query}",
        "language": "ar",
        "wait_for": "networkidle",
        "extra_wait_ms": 3000,
        "selectors": {
            "results":      "[data-qa='product-block'], .productContainer, [class*='productBlock'], [class*='ProductCard']",
            "title":        "[data-qa='product-name'], .name, [class*='name'], h2, h3",
            "price":        "[data-qa='product-price'], .price, [class*='price'], strong",
            "link":         "a",
            "image":        "img",
            "availability": "[data-qa='availability'], .availability, [class*='avail'], [class*='stock']",
        },
        "pagination": {
            "enabled": True,
            "next_btn": "[aria-label='next'], .next, button[data-qa='next-page']",
            "max_pages": 3,
        },
    },

    # ── أضف منافس جديد هنا فقط ──────────────────────────────────
    # "extra": {
    #     "name": "Extra",
    #     "base_url": "https://www.extra.com",
    #     "search_path": "/catalogsearch/result/?q={query}",
    #     "selectors": { ... },
    # },
}
