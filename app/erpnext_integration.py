"""
ERPNext Integration for Outath / Wesal KPI Dashboard
Credentials loaded from environment variables — never hard-coded.
"""

import os
import asyncio
import httpx
from datetime import datetime, timedelta
from typing import Any

ERP_URL = os.getenv("ERPNEXT_URL", "http://144.91.102.29")
API_KEY = os.getenv("ERPNEXT_API_KEY", "")
API_SECRET = os.getenv("ERPNEXT_API_SECRET", "")


def _headers() -> dict:
    return {
        "Authorization": f"token {API_KEY}:{API_SECRET}",
        "Content-Type": "application/json",
    }


async def erp_get(endpoint: str, params: dict | None = None) -> Any:
    url = f"{ERP_URL}/api/resource/{endpoint}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, headers=_headers(), params=params or {})
        r.raise_for_status()
        return r.json()


async def erp_method(method: str, params: dict | None = None) -> Any:
    url = f"{ERP_URL}/api/method/{method}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, headers=_headers(), params=params or {})
        r.raise_for_status()
        return r.json()


def _date_range(period: str) -> tuple[str, str]:
    """Return (from_date, to_date) strings for the requested period."""
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    if period == "today":
        return today, today
    if period == "week":
        # بداية الأسبوع الحالي (الأحد أو الاثنين حسب تفضيلك)
        start = now - timedelta(days=now.weekday())
        return start.strftime("%Y-%m-%d"), today
    if period == "month":
        return now.replace(day=1).strftime("%Y-%m-%d"), today
    if period == "quarter":
        q_start_month = ((now.month - 1) // 3) * 3 + 1
        return now.replace(month=q_start_month, day=1).strftime("%Y-%m-%d"), today
    if period == "year":
        return now.replace(month=1, day=1).strftime("%Y-%m-%d"), today
    return now.replace(day=1).strftime("%Y-%m-%d"), today  # default: month


# ─── Individual KPI fetchers ────────────────────────────────────────────────

async def _late_orders(from_date: str, to_date: str) -> dict:
    """
    الطلبات المتأخرة ضمن الفترة المختارة:
    - delivery_date انتهى (< to_date)
    - تاريخ الطلب >= from_date
    - لم تُسلَّم بعد
    """
    try:
        data = await erp_get("Sales Order", {
            "filters": (
                f'[["delivery_date","<","{to_date}"],'
                f'["transaction_date",">=","{from_date}"],'
                f'["status","not in",["Delivered","Cancelled"]]]'
            ),
            "fields": '["name","delivery_date","status","customer","grand_total","transaction_date"]',
            "limit_page_length": 500,
        })
        items = data.get("data", [])
        return {
            "count": len(items),
            "items": [
                {
                    "id": o["name"],
                    "customer": o.get("customer", "—"),
                    "delivery_date": o.get("delivery_date", "—"),
                    "status": o.get("status", "—"),
                    "amount": o.get("grand_total", 0),
                    "days_late": (
                        datetime.now() - datetime.strptime(o["delivery_date"], "%Y-%m-%d")
                    ).days if o.get("delivery_date") else 0,
                }
                for o in items
            ],
        }
    except Exception as e:
        return {"count": 0, "items": [], "error": str(e)}


async def _stuck_orders(from_date: str) -> dict:
    """
    الطلبات العالقة: لم تُسلَّم ولم تُلغَ منذ from_date
    """
    try:
        data = await erp_get("Sales Order", {
            "filters": (
                f'[["status","in",["To Deliver and Bill","To Deliver"]],'
                f'["transaction_date",">=","{from_date}"]]'
            ),
            "fields": '["name","status","customer","transaction_date","grand_total"]',
            "limit_page_length": 500,
        })
        items = data.get("data", [])
        return {
            "count": len(items),
            "items": [
                {
                    "id": o["name"],
                    "customer": o.get("customer"),
                    "status": o.get("status"),
                    "date": o.get("transaction_date"),
                }
                for o in items
            ],
        }
    except Exception as e:
        return {"count": 0, "items": [], "error": str(e)}


async def _avg_processing(from_date: str) -> dict:
    try:
        data = await erp_get("Sales Order", {
            "filters": f'[["status","=","Delivered"],["transaction_date",">=","{from_date}"]]',
            "fields": '["name","transaction_date","delivery_date"]',
            "limit_page_length": 500,
        })
        delivered = data.get("data", [])
        diffs = []
        for o in delivered:
            try:
                t = datetime.strptime(o["transaction_date"], "%Y-%m-%d")
                d = datetime.strptime(o["delivery_date"], "%Y-%m-%d")
                diffs.append((d - t).days)
            except Exception:
                pass
        avg = round(sum(diffs) / len(diffs), 1) if diffs else 0
        return {"value": avg, "target": 1.5, "sample": len(delivered)}
    except Exception as e:
        return {"value": 0, "target": 1.5, "error": str(e)}


async def _out_of_stock() -> dict:
    try:
        data = await erp_method("frappe.client.get_list", {
            "doctype": "Bin",
            "filters": '[["actual_qty","<=","0"]]',
            "fields": '["item_code","warehouse","actual_qty","reserved_qty"]',
            "limit_page_length": 500,
        })
        items = data.get("message", [])
        return {
            "count": len(items),
            "items": [
                {"sku": i.get("item_code"), "warehouse": i.get("warehouse"), "qty": i.get("actual_qty", 0)}
                for i in items
            ],
        }
    except Exception as e:
        return {"count": 0, "items": [], "error": str(e)}


async def _low_stock() -> dict:
    try:
        data = await erp_method("frappe.client.get_list", {
            "doctype": "Bin",
            "filters": '[["actual_qty","<","10"],["actual_qty",">","0"]]',
            "fields": '["item_code","warehouse","actual_qty","reserved_qty","projected_qty"]',
            "limit_page_length": 500,
        })
        items = data.get("message", [])
        return {
            "count": len(items),
            "items": [
                {"sku": i.get("item_code"), "warehouse": i.get("warehouse"), "qty": i.get("actual_qty", 0)}
                for i in items
            ],
        }
    except Exception as e:
        return {"count": 0, "items": [], "error": str(e)}


async def _late_po(from_date: str, to_date: str) -> dict:
    """
    أوامر الشراء المتأخرة ضمن الفترة المختارة
    """
    try:
        data = await erp_get("Purchase Order", {
            "filters": (
                f'[["schedule_date",">=","{from_date}"],'
                f'["schedule_date","<","{to_date}"],'
                f'["status","not in",["Delivered","Cancelled","Closed"]]]'
            ),
            "fields": '["name","supplier","schedule_date","status","grand_total"]',
            "limit_page_length": 500,
        })
        items = data.get("data", [])
        return {
            "count": len(items),
            "items": [
                {
                    "id": o["name"],
                    "supplier": o.get("supplier"),
                    "due": o.get("schedule_date"),
                    "status": o.get("status"),
                    "amount": o.get("grand_total", 0),
                }
                for o in items
            ],
        }
    except Exception as e:
        return {"count": 0, "items": [], "error": str(e)}


async def _open_complaints() -> dict:
    # الشكاوى المفتوحة لا تتأثر بالفترة — دائماً الحالية
    try:
        data = await erp_get("Issue", {
            "filters": '[["status","in",["Open","Replied"]]]',
            "fields": '["name","subject","status","creation","customer"]',
            "limit_page_length": 200,
        })
        issues = data.get("data", [])
        cutoff = (datetime.now() - timedelta(hours=24)).isoformat()
        no_reply = [i for i in issues if i.get("status") == "Open" and i.get("creation", "") < cutoff]
        return {
            "count": len(issues),
            "no_reply_24h": len(no_reply),
            "items": [
                {
                    "id": i["name"],
                    "subject": i.get("subject"),
                    "status": i.get("status"),
                    "customer": i.get("customer"),
                    "created": i.get("creation"),
                }
                for i in issues
            ],
        }
    except Exception as e:
        return {"count": 0, "no_reply_24h": 0, "items": [], "error": str(e)}


async def _avg_response(from_date: str) -> dict:
    try:
        data = await erp_get("Issue", {
            "filters": f'[["creation",">=","{from_date}"],["status","=","Closed"]]',
            "fields": '["name","creation","first_responded_on","resolution_time"]',
            "limit_page_length": 500,
        })
        closed = data.get("data", [])
        times = [i.get("resolution_time", 0) for i in closed if i.get("resolution_time")]
        avg_hours = round(sum(times) / len(times) / 3600, 1) if times else 0
        return {"value": avg_hours, "target": 2, "sample": len(closed)}
    except Exception as e:
        return {"value": 0, "target": 2, "error": str(e)}


async def _daily_sales(from_date: str, to_date: str) -> dict:
    try:
        data = await erp_get("Sales Invoice", {
            "filters": (
                f'[["posting_date",">=","{from_date}"],'
                f'["posting_date","<=","{to_date}"],'
                f'["docstatus","=","1"]]'
            ),
            "fields": '["name","grand_total","customer","posting_date"]',
            "limit_page_length": 500,
        })
        invoices = data.get("data", [])
        total = sum(i.get("grand_total", 0) for i in invoices)
        return {
            "value": round(total, 2),
            "target": 20000,
            "orders_count": len(invoices),
        }
    except Exception as e:
        return {"value": 0, "target": 20000, "error": str(e)}


async def _on_time_delivery(from_date: str, to_date: str) -> dict:
    """
    Real on-time calculation using Delivery Notes vs Sales Order promised dates.
    """
    try:
        dn_data = await erp_get("Delivery Note", {
            "filters": (
                f'[["posting_date",">=","{from_date}"],'
                f'["posting_date","<=","{to_date}"],'
                f'["docstatus","=","1"]]'
            ),
            "fields": '["name","posting_date","customer","against_sales_order"]',
            "limit_page_length": 500,
        })
        deliveries = dn_data.get("data", [])
        if not deliveries:
            return {"count": 0, "on_time": 0, "pct": 0, "target": 95}

        so_names = list({d.get("against_sales_order") for d in deliveries if d.get("against_sales_order")})
        so_map: dict[str, str] = {}
        if so_names:
            chunk = ",".join(f'"{n}"' for n in so_names[:100])
            so_data = await erp_get("Sales Order", {
                "filters": f'[["name","in",[{chunk}]]]',
                "fields": '["name","delivery_date"]',
                "limit_page_length": 100,
            })
            for so in so_data.get("data", []):
                if so.get("delivery_date"):
                    so_map[so["name"]] = so["delivery_date"]

        on_time = 0
        late = 0
        for dn in deliveries:
            promised = so_map.get(dn.get("against_sales_order", ""))
            actual = dn.get("posting_date")
            if promised and actual:
                if actual <= promised:
                    on_time += 1
                else:
                    late += 1
            else:
                on_time += 1  # no promised date → count as ok

        total = len(deliveries)
        pct = round(on_time / total * 100, 1) if total else 0
        return {"count": total, "on_time": on_time, "late": late, "pct": pct, "target": 95}
    except Exception as e:
        return {"count": 0, "on_time": 0, "pct": 0, "target": 95, "error": str(e)}


# ─── Main entry point ────────────────────────────────────────────────────────

async def get_all_kpis(period: str = "month") -> dict:
    """
    Fetch all 10 KPIs in parallel for the requested period.
    period: "today" | "week" | "month" | "quarter" | "year"
    """
    from_date, to_date = _date_range(period)

    (
        late_orders,
        stuck_orders,
        avg_processing,
        out_of_stock,
        low_stock,
        late_po,
        open_complaints,
        avg_response,
        daily_sales,
        on_time,
    ) = await asyncio.gather(
        _late_orders(from_date, to_date),       # ✅ يستخدم from_date + to_date
        _stuck_orders(from_date),               # ✅ يستخدم from_date
        _avg_processing(from_date),
        _out_of_stock(),                        # لا تتأثر بالفترة
        _low_stock(),                           # لا تتأثر بالفترة
        _late_po(from_date, to_date),           # ✅ يستخدم from_date + to_date
        _open_complaints(),                     # لا تتأثر بالفترة
        _avg_response(from_date),
        _daily_sales(from_date, to_date),       # ✅ كان صح من البداية
        _on_time_delivery(from_date, to_date),  # ✅ أُضيف to_date
    )

    return {
        "period": period,
        "from_date": from_date,
        "to_date": to_date,
        "fetched_at": datetime.now().isoformat(),
        "late_orders": late_orders,
        "stuck_orders": stuck_orders,
        "avg_processing_days": avg_processing,
        "out_of_stock": out_of_stock,
        "low_stock": low_stock,
        "late_po": late_po,
        "open_complaints": open_complaints,
        "avg_response_hours": avg_response,
        "daily_sales": daily_sales,
        "on_time_delivery": on_time,
    }
