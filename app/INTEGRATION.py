"""
كيف تضيف competitor_monitor لـ FastAPI الموجود (main.py)
"""

# 1. في main.py — أضف هذا:
from competitor_monitor.router import router as competitors_router
from competitor_monitor.models import Base
from competitor_monitor.tasks  import engine

# 2. أنشئ الجداول عند البداية:
if engine:
    Base.metadata.create_all(bind=engine)

# 3. أضف الـ router:
app.include_router(competitors_router)

# ─────────────────────────────────────────────
# Environment Variables المطلوبة في Railway:
# ─────────────────────────────────────────────
# REDIS_URL        = redis://...   (أضف Redis service في Railway)
# DATABASE_URL     = postgresql://... (موجود عندك)
#
# اختياري:
# SCAN_PRODUCTS_JSON = '[{"sku":"WA-CT-1001","query":"طاولة رخام ذهبي"}]'

# ─────────────────────────────────────────────
# بعد الـ deploy — اكتشف الـ selectors:
# ─────────────────────────────────────────────
# GET /competitors/discover/homecenter?query=طاولة
# GET /competitors/discover/noon?query=طاولة
#
# راجع top_classes في الـ response وحدّث config.py

# ─────────────────────────────────────────────
# اختبر مسح منتج واحد (sync):
# ─────────────────────────────────────────────
# POST /competitors/scan
# {
#   "sku": "WA-CT-1001",
#   "query": "طاولة جانبية رخام ذهبي",
#   "background": false
# }
