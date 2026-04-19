"""
FastAPI Router — Competitor Monitoring
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import logging

from .config  import COMPETITORS
from .scraper import search_competitor, scan_all_competitors, auto_discover
from .tasks   import scan_product_task, scan_catalog_task, SessionLocal, CompetitorPrice

logger = router = APIRouter(prefix="/competitors", tags=["competitors"])

# ── Schemas ─────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    sku:              str
    query:            str
    competitor_keys:  Optional[list[str]] = None  # None = كل المنافسين
    max_results:      int = 5
    background:       bool = True                 # True = Celery | False = sync

class CatalogScanRequest(BaseModel):
    products:         list[dict]    # [{"sku":"...", "query":"..."}]
    competitor_keys:  Optional[list[str]] = None

class AddCompetitorRequest(BaseModel):
    key:         str
    name:        str
    base_url:    str
    search_path: str        # مثال: "/search?q={query}"
    selectors:   dict
    wait_for:    str = "networkidle"
    extra_wait:  int = 2000
    max_pages:   int = 3


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/list")
def list_competitors():
    """قائمة المنافسين المضافين."""
    return {
        key: {
            "name":     cfg["name"],
            "base_url": cfg["base_url"],
        }
        for key, cfg in COMPETITORS.items()
    }


@router.post("/scan")
async def scan_product(req: ScanRequest):
    """
    يبحث عن منتج في المنافسين.
    background=True  → يضع الطلب في Celery queue (أسرع للكتالوج الكبير)
    background=False → يرجع النتيجة مباشرة (مفيد للاختبار)
    """
    keys = req.competitor_keys or list(COMPETITORS.keys())

    # تحقق أن المفاتيح صحيحة
    invalid = [k for k in keys if k not in COMPETITORS]
    if invalid:
        raise HTTPException(400, f"Unknown competitors: {invalid}")

    if req.background:
        task = scan_product_task.delay(req.sku, req.query, keys)
        return {"task_id": task.id, "status": "queued", "competitors": keys}

    # sync — مفيد للاختبار
    results = await scan_all_competitors(req.query, keys, req.max_results)
    return {"sku": req.sku, "results": results}


@router.post("/scan-all")
def scan_catalog(req: CatalogScanRequest):
    """يمسح كتالوج كامل — كل منتج يُضاف في Celery queue."""
    task = scan_catalog_task.delay(req.products, req.competitor_keys)
    return {"status": "queued", "products_count": len(req.products)}


@router.get("/results/{sku}")
def get_results(sku: str, competitor: Optional[str] = None, limit: int = 20):
    """يرجع نتائج مسح SKU محدد."""
    if not SessionLocal:
        raise HTTPException(503, "Database not configured")

    with SessionLocal() as session:
        q = session.query(CompetitorPrice).filter(CompetitorPrice.sku == sku)
        if competitor:
            q = q.filter(CompetitorPrice.competitor == competitor)
        rows = q.order_by(CompetitorPrice.scraped_at.desc()).limit(limit).all()

    return {"sku": sku, "count": len(rows), "results": [r.to_dict() for r in rows]}


@router.get("/results")
def get_all_results(competitor: Optional[str] = None, limit: int = 50):
    """يرجع آخر النتائج لكل المنتجات."""
    if not SessionLocal:
        raise HTTPException(503, "Database not configured")

    with SessionLocal() as session:
        q = session.query(CompetitorPrice)
        if competitor:
            q = q.filter(CompetitorPrice.competitor == competitor)
        rows = q.order_by(CompetitorPrice.scraped_at.desc()).limit(limit).all()

    return {"count": len(rows), "results": [r.to_dict() for r in rows]}


@router.post("/add")
def add_competitor(req: AddCompetitorRequest):
    """
    يضيف منافس جديد في runtime.
    ملاحظة: يُحفظ في الذاكرة فقط — لتثبيته أضفه في config.py
    """
    if req.key in COMPETITORS:
        raise HTTPException(400, f"Competitor '{req.key}' already exists")

    COMPETITORS[req.key] = {
        "name":         req.name,
        "base_url":     req.base_url,
        "search_path":  req.search_path,
        "selectors":    req.selectors,
        "wait_for":     req.wait_for,
        "extra_wait_ms": req.extra_wait,
        "pagination": {
            "enabled":  True,
            "next_btn": "[aria-label='Next'], .next",
            "max_pages": req.max_pages,
        },
    }
    return {"status": "added", "key": req.key}


@router.get("/discover/{competitor_key}")
async def discover_selectors(competitor_key: str, query: str = "طاولة"):
    """
    يفتح الموقع ويكتشف الـ CSS classes الشائعة —
    اشغله مرة واحدة لكل موقع جديد لمعرفة الـ selectors الصحيحة
    """
    if competitor_key not in COMPETITORS:
        raise HTTPException(404, f"Unknown competitor: {competitor_key}")
    hints = await auto_discover(competitor_key, query)
    return hints
