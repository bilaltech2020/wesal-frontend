from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
import bcrypt
import uuid
from datetime import datetime, timedelta
from jose import jwt
import httpx
from bs4 import BeautifulSoup
import re
import base64
import json
from erpnext_integration import get_all_kpis

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB_URL = "postgresql://postgres:QVZuuAXOAZCEYYriLVPrfSmrWboOQFEM@maglev.proxy.rlwy.net:12519/railway"
SECRET = "wesal-secret-2025"
SERP_KEY = "1fc45735ba2ed26629fbe15e19d6a201f8e66852356fe8a6ea79daf20e221b38"
BROWSERLESS_TOKEN = "2UK6UHAHXQtJ1Nqd90153b8fcd33e5f5110456a7b7406f6b5"
OXYLABS_USER = "wesal_REULB"
OXYLABS_PASS = "Sad123123123+"

def get_db():
    return psycopg2.connect(DB_URL)

def fetch_with_browserless(url: str) -> str:
    """يجلب HTML الصفحة عبر Browserless — Playwright في السحابة"""
    script = f"""
export default async function ({{ page }}) {{
  await page.goto('{url}', {{ waitUntil: 'networkidle', timeout: 30000 }});
  await page.waitForTimeout(2000);
  return {{ data: await page.content(), type: 'html' }};
}}
"""
    res = httpx.post(
        f"https://production-sfo.browserless.io/function?token={BROWSERLESS_TOKEN}",
        content=script,
        headers={"Content-Type": "application/javascript"},
        timeout=60,
    )
    if res.status_code != 200:
        raise Exception(f"Browserless HTTP {res.status_code}: {res.text[:300]}")
    data = res.json()
    return data.get("data", "")

def fetch_with_oxylabs(url: str) -> str:
    """Oxylabs كـ fallback"""
    payload = {"source": "universal", "url": url}
    creds = base64.b64encode(f"{OXYLABS_USER}:{OXYLABS_PASS}".encode()).decode()
    res = httpx.post(
        "https://realtime.oxylabs.io/v1/queries",
        headers={"Authorization": f"Basic {creds}", "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    if res.status_code != 200:
        raise Exception(f"Oxylabs HTTP {res.status_code}")
    data = res.json()
    if "results" in data and data["results"]:
        return data["results"][0].get("content", "")
    raise Exception("No results from Oxylabs")

def smart_fetch(url: str) -> str:
    """يجرب Browserless أولاً، بعدين Oxylabs كـ fallback"""
    try:
        html = fetch_with_browserless(url)
        if html and len(html) > 500:
            return html
    except Exception as e:
        print(f"Browserless failed: {e}")
    return fetch_with_oxylabs(url)

def parse_product(html: str, url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    # اسم المنتج من og:title
    name = ""
    og_title = soup.find("meta", property="og:title")
    if og_title:
        t = og_title.get("content", "").strip()
        if "|" in t:
            t = t.split("|")[0].strip()
        if len(t) > 5:
            name = t

    if not name:
        for sel in ["h1", "[class*='product-name']", "[class*='ProductName']", ".product__title"]:
            el = soup.select_one(sel)
            if el:
                t = el.get_text(strip=True)
                if len(t) > 5:
                    name = t
                    break

    # السعر — نبحث بشكل أوسع
    price = ""
    # من og:description
    og_desc = soup.find("meta", property="og:description")
    if og_desc:
        desc = og_desc.get("content", "")
        match = re.search(r"([\d,\.]+)\s*(ر\.س|SAR|﷼)", desc)
        if match:
            price = match.group(0)

    # من JSON-LD
    if not price:
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                if isinstance(data, dict):
                    offers = data.get("offers", {})
                    if isinstance(offers, dict):
                        p = offers.get("price", "")
                        currency = offers.get("priceCurrency", "")
                        if p:
                            price = f"{p} {currency}".strip()
                            break
            except:
                pass

    # من selectors
    if not price:
        for sel in ["[class*='price']", "[class*='Price']", ".money", "[data-price]", "[itemprop='price']"]:
            el = soup.select_one(sel)
            if el:
                t = el.get_text(strip=True)
                if any(c.isdigit() for c in t) and len(t) < 50:
                    price = t
                    break

    # الصورة
    img = ""
    og_img = soup.find("meta", property="og:image")
    if og_img:
        img = og_img.get("content", "")

    return {"name": name, "price": price, "image": img, "url": url}

def parse_search_results(html: str, base_url: str) -> list:
    soup = BeautifulSoup(html, "html.parser")
    from urllib.parse import urlparse
    parsed = urlparse(base_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    selectors = ["[class*='product-card']", "[class*='ProductCard']", "[class*='product-item']", "[class*='ProductItem']", "[class*='product-tile']", "li[class*='product']"]
    cards = []
    for sel in selectors:
        cards = soup.select(sel)
        if cards:
            break
    results = []
    for card in cards[:10]:
        name = ""
        for ns in ["h2", "h3", "h4", "[class*='name']", "[class*='title']"]:
            el = card.select_one(ns)
            if el:
                t = el.get_text(strip=True)
                if len(t) > 3:
                    name = t
                    break
        price = ""
        for ps in ["[class*='price']", "[class*='Price']"]:
            el = card.select_one(ps)
            if el:
                t = el.get_text(strip=True)
                if any(c.isdigit() for c in t):
                    price = t
                    break
        link = ""
        a = card.select_one("a[href]")
        if a:
            href = a.get("href", "")
            link = href if href.startswith("http") else base + href
        if name:
            results.append({"name": name, "price": price, "url": link, "available": True})
    return results

class RegisterData(BaseModel):
    name: str
    email: str
    password: str

class LoginData(BaseModel):
    email: str
    password: str

class ScrapeData(BaseModel):
    url: str

class SearchData(BaseModel):
    sku: str
    site: str

@app.get("/")
def root():
    return {"status": "Wesal API running", "version": "1.0"}

@app.get("/health")
def health():
    try:
        conn = get_db()
        conn.close()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug-browserless")
def debug_browserless():
    try:
        url = "https://www.homecentre.com/sa/ar/p/167259223"
        html = smart_fetch(url)
        result = parse_product(html, url)
        return {"status": "ok", "name": result["name"], "price": result["price"], "image": result["image"], "html_length": len(html)}
    except Exception as e:
        return {"error": str(e)}

@app.post("/register")
def register(data: RegisterData):
    conn = get_db()
    cur = conn.cursor()
    try:
        password_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
        tenant_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        cur.execute("INSERT INTO tenants (id, name, email) VALUES (%s, %s, %s)", (tenant_id, data.name, data.email))
        cur.execute("INSERT INTO users (id, tenant_id, email, password_hash) VALUES (%s, %s, %s, %s)", (user_id, tenant_id, data.email, password_hash))
        conn.commit()
        return {"message": "تم التسجيل بنجاح", "tenant_id": tenant_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/login")
def login(data: LoginData):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, tenant_id, password_hash FROM users WHERE email = %s", (data.email,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="بيانات خاطئة")
        if not bcrypt.checkpw(data.password.encode(), user[2].encode()):
            raise HTTPException(status_code=401, detail="بيانات خاطئة")
        token = jwt.encode(
            {"user_id": user[0], "tenant_id": user[1], "exp": datetime.utcnow() + timedelta(minutes=1440)},
            SECRET, algorithm="HS256"
        )
        return {"token": token, "tenant_id": user[1]}
    finally:
        cur.close()
        conn.close()

@app.post("/scrape")
def scrape_product(data: ScrapeData):
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        response = httpx.get(data.url, headers=headers, timeout=15, follow_redirects=True)
        result = parse_product(response.text, data.url)
        result["status"] = "success"
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/scrape-dynamic")
def scrape_dynamic(data: ScrapeData):
    try:
        html = smart_fetch(data.url)
        result = parse_product(html, data.url)
        if result["name"] and len(result["name"]) > 5:
            return {
                "url": data.url,
                "name": result["name"],
                "price": result["price"],
                "image": result["image"],
                "count": 1,
                "results": [{"name": result["name"], "price": result["price"], "url": data.url, "available": True}],
                "status": "success"
            }
        results = parse_search_results(html, data.url)
        return {
            "url": data.url,
            "name": results[0]["name"] if results else "",
            "price": results[0]["price"] if results else "",
            "count": len(results),
            "results": results,
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/search-product")
def search_product(data: SearchData):
    try:
        site = data.site.replace("https://", "").replace("http://", "").rstrip("/")
        query = f"site:{site} {data.sku}"
        serp_res = httpx.get("https://serpapi.com/search", params={"q": query, "api_key": SERP_KEY, "num": 10, "hl": "ar", "gl": "sa"}, timeout=20)
        serp_data = serp_res.json()
        results = []
        for item in serp_data.get("organic_results", []):
            title = item.get("title", "")
            link = item.get("link", "")
            snippet = item.get("snippet", "")
            price = ""
            match = re.search(r"[\d,\.]+\s*(ر\.س|SAR|﷼)", snippet)
            if match:
                price = match.group(0)
            results.append({"name": title, "url": link, "price": price, "snippet": snippet, "available": True})
        return {"sku": data.sku, "site": site, "count": len(results), "results": results}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
@app.get("/erpnext-kpis")
async def erpnext_kpis():
    try:
        data = await get_all_kpis()
        return {"status": "ok", "data": data, "fetched_at": datetime.now().isoformat()}
    except Exception as e:
        return {"status": "error", "message": str(e), "data": {}}


# ══════════════════════════════════════════════════════════════
# COMPETITOR MONITOR v2 — SerpAPI + Product Detail + URL-based
# ══════════════════════════════════════════════════════════════

from typing import Optional, List
from urllib.parse import urlparse

# ── In-memory competitors config ─────────────────────────────
# فارغ — كل المواقع تُضاف من الـ frontend عبر /competitors/add
COMPETITORS_CONFIG: dict = {}

_competitor_results: list = []

# ── Category page patterns — نتجاهلها ────────────────────────
CATEGORY_PATTERNS = [
    "/category/", "/categories/", "/collections/", "/browse/",
    "/shop/", "/dept/", "/c/", "/cat/", "/taxonomy/",
    "?cat=", "?category=", "/search?", "/search/",
    "/tag/", "/brand/", "/brands/",
]

PRODUCT_HINTS = [
    "/product/", "/products/", "/p/", "/item/", "/items/",
    "/pd/", "/dp/", "-p-", "_p_", "/pr/",
    # Shopify / WooCommerce
    "/collections/", 
    # أوتاث وشبيهاتها
    "/shop/", "/store/",
]

# صفحات محتوى نتجاهلها
CONTENT_PATTERNS = [
    "/blog/", "/news/", "/article/", "/post/", "/about/",
    "/contact/", "/faq/", "/help/", "/support/", "/policy/",
    "/terms/", "/privacy/", "/career/", "/jobs/", "/press/",
    "/guide/", "/tips/", "/how-to/", "/learn/", "/inspiration/",
    "/قواعد", "/نصائح", "/مقال", "/افكار", "/أفكار", "/تصاميم",
]

def _is_product_page(url: str) -> bool:
    """يتحقق إن الرابط صفحة منتج فعلية."""
    url_lower = url.lower()
    path = urlparse(url).path.lower()

    # استثنِ category + search pages
    for pat in CATEGORY_PATTERNS:
        if pat in url_lower:
            return False

    # استثنِ صفحات المحتوى/المقالات
    for pat in CONTENT_PATTERNS:
        if pat in url_lower:
            return False

    # علامات واضحة لصفحة منتج
    for hint in PRODUCT_HINTS:
        if hint in url_lower:
            return True

    # Shopify product URLs: /collections/X/products/Y
    if "/collections/" in path and "/products/" in path:
        return True

    # URLs with numeric ID at end (common for product pages)
    import re
    if re.search(r'/\d{4,}/?$', path):
        return True

    # رابط طويل بدون كلمات محتوى = احتمال منتج
    segments = [s for s in path.split("/") if s and len(s) > 3]
    return len(segments) >= 2


# ── Schemas ──────────────────────────────────────────────────
class CompetitorScanRequest(BaseModel):
    sku: str
    query: str
    competitor_keys: Optional[List[str]] = None
    background: bool = False
    max_results: int = 10   # 0 = كل النتائج الممكنة
    fetch_details: bool = False  # True = أبطأ لكن أسعار أدق

class AddCompetitorRequest(BaseModel):
    key: str
    name: str
    url: str  # مثال: https://www.otath.com أو otath.com


# ── Price helpers ─────────────────────────────────────────────
def _extract_price_from_snippet(text: str) -> Optional[float]:
    """
    يستخرج السعر فقط إذا كان مصحوباً بعملة أو كلمة سعر.
    يتجنب الأرقام العشوائية كأرقام التليفون أو IDs.
    """
    if not text:
        return None
    # أولاً: سعر + عملة صريحة
    patterns_with_currency = [
        r"([\d,]+(?:\.\d+)?)\s*(?:ر\.س|SAR|﷼|SR|ريال)",
        r"(?:SAR|ر\.س|﷼)\s*([\d,]+(?:\.\d+)?)",
        r"(?:price|سعر|بـ|بسعر|يبدأ من|من)[:\s]*([\d,]+(?:\.\d+)?)",
    ]
    for pat in patterns_with_currency:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = _extract_price_float(m.group(1))
            # تحقق إن السعر منطقي (بين 1 و 999999)
            if val and 1 <= val <= 999999:
                return val
    return None

def _extract_price_float(price_str: str) -> Optional[float]:
    if not price_str:
        return None
    digits = re.sub(r"[^\d.]", "", str(price_str).replace(",", ""))
    try:
        return float(digits) if digits else None
    except ValueError:
        return None


# ── Fetch product page details ────────────────────────────────
def _fetch_product_details(url: str) -> dict:
    """
    يفتح صفحة المنتج ويجيب السعر الحقيقي والاسم الدقيق.
    يستخدم Browserless → Oxylabs كـ fallback.
    """
    try:
        html = smart_fetch(url)
        product = parse_product(html, url)
        price = _extract_price_float(product.get("price", ""))
        return {
            "title":     product.get("name") or None,
            "price":     price,
            "image":     product.get("image") or None,
            "available": True if price else None,
        }
    except Exception as e:
        return {"title": None, "price": None, "image": None, "available": None}


# ── Core SerpAPI search with full pagination ──────────────────

def _fetch_serp_page(domain_clean: str, query: str, start: int = 0, num: int = 10) -> list:
    """يجيب صفحة واحدة من SerpAPI."""
    try:
        r = httpx.get(
            "https://serpapi.com/search",
            params={
                "q":        f"site:{domain_clean} {query}",
                "api_key":  SERP_KEY,
                "num":      num,
                "start":    start,
                "hl":       "ar",
                "gl":       "sa",
                "no_cache": "true",
            },
            timeout=25,
        )
        return r.json().get("organic_results", [])
    except Exception:
        return []


def _parse_serp_item(item: dict, competitor_key: str, query: str, fetch_details: bool) -> dict:
    """يحول نتيجة SerpAPI واحدة لـ result dict."""
    link    = item.get("link", "")
    title   = item.get("title", "")
    snippet = item.get("snippet", "")

    # نظف title من اسم الموقع
    for sep in [" - ", " | ", " – ", " — ", " : "]:
        if sep in title:
            parts = title.split(sep)
            title = max(parts, key=len).strip()
            break

    price     = _extract_price_from_snippet(snippet) or _extract_price_from_snippet(title)
    combined  = (snippet + " " + title).lower()
    available = (
        False if any(w in combined for w in ["out of stock", "نفذ", "غير متوفر", "unavailable"])
        else True if price
        else None
    )
    image = item.get("thumbnail")

    if fetch_details and link:
        details = _fetch_product_details(link)
        if details.get("price"):
            price = details["price"]
        if details.get("title") and len(str(details["title"])) > len(title):
            title = details["title"]
        if details.get("image"):
            image = details["image"]
        if details.get("available") is not None:
            available = details["available"]

    return {
        "competitor": competitor_key,
        "query":      query,
        "title":      title or None,
        "price":      price,
        "currency":   "SAR",
        "link":       link,
        "image":      image,
        "available":  available,
        "scraped_at": datetime.utcnow().isoformat(),
        "error":      None,
    }


def _search_one_competitor(
    competitor_key: str,
    query: str,
    max_results: int = 10,
    fetch_details: bool = False,
) -> list:
    """
    يبحث في موقع منافس عبر SerpAPI مع pagination.
    max_results=0  → يجيب كل النتائج الممكنة (حتى 100 نتيجة)
    fetch_details  → يفتح كل صفحة منتج للسعر الحقيقي (أبطأ)
    """
    cfg = COMPETITORS_CONFIG.get(competitor_key)
    if not cfg:
        return []

    domain       = cfg.get("domain") or cfg["base_url"].replace("https://","").replace("http://","").rstrip("/")
    domain_clean = domain.replace("www.", "")
    all_organic  = []
    fetch_all    = (max_results == 0)
    per_page     = 10
    max_pages    = 10 if fetch_all else max(1, (max_results * 2 + per_page - 1) // per_page)

    for page in range(max_pages):
        organic = _fetch_serp_page(domain_clean, query, page * per_page, per_page)
        if not organic:
            break
        all_organic.extend(organic)
        if not fetch_all and len(all_organic) >= max_results * 2:
            break

    if not all_organic:
        return [{
            "competitor": competitor_key, "query": query,
            "title": None, "price": None, "currency": "SAR",
            "link": None, "image": None, "available": None,
            "scraped_at": datetime.utcnow().isoformat(),
            "error": "لم يُعثر على المنتج في هذا الموقع",
        }]

    # فلتر صفحات المنتجات
    product_items = [i for i in all_organic if _is_product_page(i.get("link", ""))]
    if not product_items:
        product_items = all_organic

    limit   = len(product_items) if fetch_all else min(max_results, len(product_items))
    results = []
    for item in product_items[:limit]:
        results.append(_parse_serp_item(item, competitor_key, query, fetch_details))

    return results


@app.get("/competitors/list")
def list_competitors():
    return {
        key: {"name": cfg["name"], "base_url": cfg["base_url"]}
        for key, cfg in COMPETITORS_CONFIG.items()
    }


@app.post("/competitors/scan")
def scan_competitor_product(req: CompetitorScanRequest):
    keys = req.competitor_keys or list(COMPETITORS_CONFIG.keys())

    # أضف أي موقع مو موجود تلقائياً من الـ key (domain)
    for key in keys:
        if key not in COMPETITORS_CONFIG:
            # حاول تبني base_url من الـ key
            domain = key.replace("_", ".")
            # إذا يبدو domain حقيقي
            if "." in domain:
                COMPETITORS_CONFIG[key] = {
                    "name":     domain,
                    "base_url": f"https://{domain}",
                    "domain":   domain,
                }

    # تجاهل أي keys ما عندها domain صحيح
    valid_keys = [k for k in keys if k in COMPETITORS_CONFIG]
    if not valid_keys:
        return {"sku": req.sku, "query": req.query, "results": {}, "total": 0,
                "error": "لم يتم إضافة أي موقع — أضف موقعاً أولاً"}

    all_results: dict = {}
    for key in valid_keys:
        results = _search_one_competitor(key, req.query, req.max_results, req.fetch_details)
        all_results[key] = results
        for r in results:
            _competitor_results.append({**r, "sku": req.sku})

    return {
        "sku":     req.sku,
        "query":   req.query,
        "results": all_results,
        "total":   sum(len(v) for v in all_results.values()),
    }


@app.post("/competitors/scan-all")
def scan_catalog(products: list, competitor_keys: Optional[List[str]] = None, fetch_details: bool = False):
    """يمسح كتالوج كامل — fetch_details=False للسرعة."""
    keys = competitor_keys or list(COMPETITORS_CONFIG.keys())
    for product in products:
        sku   = product.get("sku", "")
        query = product.get("query", "")
        if sku and query:
            for key in keys:
                results = _search_one_competitor(key, query, 3, fetch_details)
                for r in results:
                    _competitor_results.append({**r, "sku": sku})
    return {"status": "done", "scanned": len(products)}


@app.get("/competitors/results")
def get_all_results(competitor: Optional[str] = None, limit: int = 100):
    results = _competitor_results
    if competitor:
        results = [r for r in results if r.get("competitor") == competitor]
    results = sorted(results, key=lambda r: r.get("scraped_at", ""), reverse=True)
    return {"count": len(results[:limit]), "results": results[:limit]}


@app.get("/competitors/results/{sku}")
def get_sku_results(sku: str, competitor: Optional[str] = None):
    results = [r for r in _competitor_results if r.get("sku") == sku]
    if competitor:
        results = [r for r in results if r.get("competitor") == competitor]
    return {"sku": sku, "count": len(results), "results": results}


@app.post("/competitors/add")
def add_competitor(req: AddCompetitorRequest):
    """يضيف موقع منافس جديد — قبول otath.com أو https://otath.com"""
    if req.key in COMPETITORS_CONFIG:
        raise HTTPException(400, f"المنافس '{req.key}' موجود مسبقاً")

    url = req.url.strip()
    if not url.startswith("http"):
        url = "https://" + url.lstrip("/")

    parsed   = urlparse(url)
    domain   = parsed.netloc or parsed.path.split("/")[0]
    base_url = f"{parsed.scheme or 'https'}://{domain}"

    COMPETITORS_CONFIG[req.key] = {
        "name":     req.name,
        "base_url": base_url,
        "domain":   domain,
    }
    return {"status": "added", "key": req.key, "domain": domain, "total": len(COMPETITORS_CONFIG)}


@app.delete("/competitors/{key}")
def remove_competitor(key: str):
    if key not in COMPETITORS_CONFIG:
        raise HTTPException(404, f"'{key}' غير موجود")
    del COMPETITORS_CONFIG[key]
    return {"status": "removed", "key": key}
