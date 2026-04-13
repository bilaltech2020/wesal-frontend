# ══════════════════════════════════════════════════════════
# أضف هذا الكود في main.py في wesal-backend
# بعد الـ imports الموجودة
# ══════════════════════════════════════════════════════════

# 1. أضف في أعلى الملف مع الـ imports:
# from erpnext_integration import get_all_kpis

# 2. أضف هذا الـ endpoint:

@app.get("/erpnext-kpis")
async def erpnext_kpis():
    """جلب جميع KPIs من ERPNext"""
    try:
        data = await get_all_kpis()
        return {"status": "ok", "data": data, "fetched_at": datetime.now().isoformat()}
    except Exception as e:
        return {"status": "error", "message": str(e), "data": {}}


@app.get("/erpnext-test")
async def erpnext_test():
    """اختبار الاتصال بـ ERPNext"""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "http://144.91.102.29/api/method/frappe.auth.get_logged_user",
                headers={"Authorization": "token b938b723b9af108:0800d09fd60ddeb"}
            )
            return {"status": "ok", "code": r.status_code, "body": r.json()}
    except Exception as e:
        return {"status": "error", "message": str(e)}
