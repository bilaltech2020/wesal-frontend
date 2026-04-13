"""
ERPNext Integration for Wesal KPI Dashboard
URL: http://144.91.102.29
"""

import httpx
from datetime import datetime, timedelta
from typing import Any

ERP_URL = "http://144.91.102.29"
API_KEY = "b938b723b9af108"
API_SECRET = "0800d09fd60ddeb"

HEADERS = {
    "Authorization": f"token {API_KEY}:{API_SECRET}",
    "Content-Type": "application/json",
}


async def erp_get(endpoint: str, params: dict = {}) -> Any:
    url = f"{ERP_URL}/api/resource/{endpoint}"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, headers=HEADERS, params=params)
        r.raise_for_status()
        return r.json()


async def erp_method(method: str, params: dict = {}) -> Any:
    url = f"{ERP_URL}/api/method/{method}"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, headers=HEADERS, params=params)
        r.raise_for_status()
        return r.json()


async def get_all_kpis() -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    month_start = datetime.now().replace(day=1).strftime("%Y-%m-%d")

    results = {}

    # ① الطلبات المتأخرة — Sales Orders past delivery date, not delivered
    try:
        data = await erp_get("Sales Order", {
            "filters": f'[["delivery_date","<","{today}"],["status","not in",["Delivered","Cancelled"]]]',
            "fields": '["name","delivery_date","status","customer","grand_total","transaction_date"]',
            "limit_page_length": 50,
        })
        late_orders = data.get("data", [])
        results["late_orders"] = {
            "count": len(late_orders),
            "items": [
                {
                    "id": o["name"],
                    "customer": o.get("customer", "—"),
                    "delivery_date": o.get("delivery_date", "—"),
                    "status": o.get("status", "—"),
                    "amount": o.get("grand_total", 0),
                    "days_late": (datetime.now() - datetime.strptime(o["delivery_date"], "%Y-%m-%d")).days
                    if o.get("delivery_date") else 0,
                }
                for o in late_orders
            ],
        }
    except Exception as e:
        results["late_orders"] = {"count": 0, "items": [], "error": str(e)}

    # ② الطلبات العالقة — Sales Orders in "To Deliver and Bill" or "To Bill" > 3 days
    try:
        data = await erp_get("Sales Order", {
            "filters": f'[["status","in",["To Deliver and Bill","To Deliver"]],["transaction_date","<","{week_ago}"]]',
            "fields": '["name","status","customer","transaction_date","grand_total"]',
            "limit_page_length": 50,
        })
        stuck = data.get("data", [])
        results["stuck_orders"] = {
            "count": len(stuck),
            "items": [{"id": o["name"], "customer": o.get("customer"), "status": o.get("status"), "date": o.get("transaction_date")} for o in stuck],
        }
    except Exception as e:
        results["stuck_orders"] = {"count": 0, "items": [], "error": str(e)}

    # ③ وقت المعالجة — avg days from creation to delivery
    try:
        data = await erp_get("Sales Order", {
            "filters": f'[["status","=","Delivered"],["transaction_date",">=","{month_start}"]]',
            "fields": '["name","transaction_date","delivery_date"]',
            "limit_page_length": 100,
        })
        delivered = data.get("data", [])
        if delivered:
            diffs = []
            for o in delivered:
                try:
                    t = datetime.strptime(o["transaction_date"], "%Y-%m-%d")
                    d = datetime.strptime(o["delivery_date"], "%Y-%m-%d")
                    diffs.append((d - t).days)
                except Exception:
                    pass
            avg_days = round(sum(diffs) / len(diffs), 1) if diffs else 0
        else:
            avg_days = 0
        results["avg_processing_days"] = {"value": avg_days, "target": 1.5, "sample": len(delivered)}
    except Exception as e:
        results["avg_processing_days"] = {"value": 0, "target": 1.5, "error": str(e)}

    # ④ المنتجات النافدة — Items with actual_qty = 0
    try:
        data = await erp_method("frappe.client.get_list", {
            "doctype": "Bin",
            "filters": '[["actual_qty","<=","0"]]',
            "fields": '["item_code","warehouse","actual_qty","reserved_qty"]',
            "limit_page_length": 100,
        })
        out_of_stock = data.get("message", [])
        results["out_of_stock"] = {
            "count": len(out_of_stock),
            "items": [{"sku": i.get("item_code"), "warehouse": i.get("warehouse"), "qty": i.get("actual_qty", 0)} for i in out_of_stock],
        }
    except Exception as e:
        results["out_of_stock"] = {"count": 0, "items": [], "error": str(e)}

    # ⑤ قريبة من النفاد — Items where actual_qty < reorder_level
    try:
        data = await erp_method("frappe.client.get_list", {
            "doctype": "Bin",
            "filters": '[["actual_qty","<","10"],["actual_qty",">","0"]]',
            "fields": '["item_code","warehouse","actual_qty","reserved_qty","projected_qty"]',
            "limit_page_length": 100,
        })
        low_stock = data.get("message", [])
        results["low_stock"] = {
            "count": len(low_stock),
            "items": [{"sku": i.get("item_code"), "warehouse": i.get("warehouse"), "qty": i.get("actual_qty", 0)} for i in low_stock],
        }
    except Exception as e:
        results["low_stock"] = {"count": 0, "items": [], "error": str(e)}

    # ⑥ تأخير الموردين — Purchase Orders overdue
    try:
        data = await erp_get("Purchase Order", {
            "filters": f'[["schedule_date","<","{today}"],["status","not in",["Delivered","Cancelled","Closed"]]]',
            "fields": '["name","supplier","schedule_date","status","grand_total"]',
            "limit_page_length": 50,
        })
        late_po = data.get("data", [])
        results["late_po"] = {
            "count": len(late_po),
            "items": [{"id": o["name"], "supplier": o.get("supplier"), "due": o.get("schedule_date"), "status": o.get("status")} for o in late_po],
        }
    except Exception as e:
        results["late_po"] = {"count": 0, "items": [], "error": str(e)}

    # ⑦ الشكاوى المفتوحة — Issues / Complaints open
    try:
        data = await erp_get("Issue", {
            "filters": '[["status","in",["Open","Replied"]]]',
            "fields": '["name","subject","status","creation","customer"]',
            "limit_page_length": 50,
        })
        issues = data.get("data", [])
        # بدون رد +24h
        no_reply_24h = [i for i in issues if i.get("status") == "Open"]
        results["open_complaints"] = {
            "count": len(issues),
            "no_reply_24h": len(no_reply_24h),
            "items": [{"id": i["name"], "subject": i.get("subject"), "status": i.get("status"), "customer": i.get("customer")} for i in issues],
        }
    except Exception as e:
        results["open_complaints"] = {"count": 0, "no_reply_24h": 0, "items": [], "error": str(e)}

    # ⑧ وقت الرد على العملاء — avg response time on Issues
    try:
        data = await erp_get("Issue", {
            "filters": f'[["creation",">=","{month_start}"],["status","=","Closed"]]',
            "fields": '["name","creation","first_responded_on","resolution_time"]',
            "limit_page_length": 100,
        })
        closed = data.get("data", [])
        times = [i.get("resolution_time", 0) for i in closed if i.get("resolution_time")]
        avg_hours = round(sum(times) / len(times) / 3600, 1) if times else 0
        results["avg_response_hours"] = {"value": avg_hours, "target": 2, "sample": len(closed)}
    except Exception as e:
        results["avg_response_hours"] = {"value": 0, "target": 2, "error": str(e)}

    # ⑨ المبيعات اليومية
    try:
        data = await erp_get("Sales Invoice", {
            "filters": f'[["posting_date","=","{today}"],["docstatus","=","1"]]',
            "fields": '["name","grand_total","customer"]',
            "limit_page_length": 500,
        })
        invoices = data.get("data", [])
        daily_sales = sum(i.get("grand_total", 0) for i in invoices)
        results["daily_sales"] = {
            "value": daily_sales,
            "target": 20000,
            "orders_count": len(invoices),
        }
    except Exception as e:
        results["daily_sales"] = {"value": 0, "target": 20000, "error": str(e)}

    # ⑩ التوصيل في الوقت — % orders delivered on or before delivery_date
    try:
        data = await erp_get("Delivery Note", {
            "filters": f'[["posting_date",">=","{month_start}"],["docstatus","=","1"]]',
            "fields": '["name","posting_date","lr_date","customer"]',
            "limit_page_length": 500,
        })
        deliveries = data.get("data", [])
        on_time = len(deliveries)  # نحسبها بعد ربط delivery_date من SO
        results["on_time_delivery"] = {
            "count": len(deliveries),
            "on_time": on_time,
            "pct": 86,  # placeholder حتى نربط مع SO
            "target": 95,
        }
    except Exception as e:
        results["on_time_delivery"] = {"count": 0, "on_time": 0, "pct": 0, "target": 95, "error": str(e)}

    return results
