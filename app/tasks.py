"""
Celery Tasks — background competitor scanning
"""
import asyncio
import logging
from celery import Celery
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

from .scraper import search_competitor, scan_all_competitors
from .models  import Base, CompetitorPrice
from .config  import COMPETITORS

logger = logging.getLogger(__name__)

# ── Celery setup ────────────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "competitor_monitor",
    broker=REDIS_URL,
    backend=REDIS_URL,
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Riyadh",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,   # لا تأخذ أكثر من task واحد في نفس الوقت
)

# ── DB setup ────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine       = create_engine(DATABASE_URL) if DATABASE_URL else None
SessionLocal = sessionmaker(bind=engine) if engine else None


def _save_results(sku: str, query: str, results_by_competitor: dict):
    if not SessionLocal:
        logger.warning("No DATABASE_URL — results not saved")
        return
    with SessionLocal() as session:
        for competitor, results in results_by_competitor.items():
            for r in results:
                row = CompetitorPrice(
                    sku        = sku,
                    competitor = competitor,
                    query      = query,
                    title      = r.get("title"),
                    price      = r.get("price"),
                    link       = r.get("link"),
                    image      = r.get("image"),
                    available  = r.get("available"),
                    error      = r.get("error"),
                )
                session.add(row)
        session.commit()
    logger.info(f"Saved results for SKU={sku}")


# ── Tasks ───────────────────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def scan_product_task(self, sku: str, query: str, competitor_keys: list[str] | None = None):
    """
    يبحث عن منتج واحد في كل المنافسين.
    sku             : SKU أوتاث للتتبع
    query           : اسم المنتج للبحث
    competitor_keys : None = كل المنافسين
    """
    try:
        logger.info(f"scan_product_task: sku={sku} query={query} competitors={competitor_keys}")
        results = asyncio.run(
            scan_all_competitors(query, competitor_keys, max_results=5)
        )
        _save_results(sku, query, results)
        return {"sku": sku, "status": "done", "total": sum(len(v) for v in results.values())}
    except Exception as exc:
        logger.error(f"scan_product_task failed: {exc}")
        raise self.retry(exc=exc)


@celery_app.task
def scan_catalog_task(products: list[dict], competitor_keys: list[str] | None = None):
    """
    يمسح قائمة منتجات كاملة.
    products: [{"sku": "...", "query": "..."}, ...]
    """
    for product in products:
        scan_product_task.delay(
            sku            = product["sku"],
            query          = product["query"],
            competitor_keys = competitor_keys,
        )
    return {"queued": len(products)}


# ── Celery Beat schedule (اختياري — مسح يومي تلقائي) ───────────────────────
# من .env:
# SCAN_PRODUCTS_JSON='[{"sku":"WA-CT-1001","query":"طاولة رخام ذهبي"}]'

from celery.schedules import crontab
import json

SCAN_PRODUCTS = json.loads(os.getenv("SCAN_PRODUCTS_JSON", "[]"))

if SCAN_PRODUCTS:
    celery_app.conf.beat_schedule = {
        "daily-competitor-scan": {
            "task":     "competitor_monitor.tasks.scan_catalog_task",
            "schedule": crontab(hour=6, minute=0),   # كل يوم الساعة 6 صباحاً
            "args":     [SCAN_PRODUCTS],
        },
    }
