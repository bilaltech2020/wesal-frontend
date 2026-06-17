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

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB_URL = "postgresql://postgres:QVZuuAXOAZCEYYriLVPrfSmrWboOQFEM@maglev.proxy.rlwy.net:12519/railway"
SECRET = "wesal-secret-2025"

def get_db():
    return psycopg2.connect(DB_URL)

class RegisterData(BaseModel):
    name: str
    email: str
    password: str

class LoginData(BaseModel):
    email: str
    password: str

class ScrapeData(BaseModel):
    url: str

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
            SECRET,
            algorithm="HS256"
        )
        return {"token": token, "tenant_id": user[1]}
    finally:
        cur.close()
        conn.close()

@app.post("/scrape")
def scrape_product(data: ScrapeData):
    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        response = httpx.get(data.url, headers=headers, timeout=15, follow_redirects=True)
        soup = BeautifulSoup(response.text, "html.parser")

        name = ""
        for sel in ["h1", ".product-title", ".product__title", "[class*='product-name']"]:
            el = soup.select_one(sel)
            if el:
                name = el.get_text(strip=True)
                break

        price = ""
        for sel in [".price", ".product-price", "[class*='price']", ".money"]:
            el = soup.select_one(sel)
            if el:
                price = el.get_text(strip=True)
                break

        img = ""
        img_el = soup.select_one(".product-image img, .product__media img, [class*='product'] img")
        if img_el:
            img = img_el.get("src", "")

        return {
            "url": data.url,
            "name": name,
            "price": price,
            "image": img,
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
