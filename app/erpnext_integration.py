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




# ─── Employee Performance ────────────────────────────────────────────────────

async def _employee_performance(from_date: str, to_date: str) -> dict:
    """
    أداء الموظفين:
    - عدد الطلبات التي أنشأها كل موظف
    - متوسط الإدخال (طلبات/يوم)
    - سرعة التنفيذ (من إنشاء SO لإصدار DN)
    """
    try:
        # جلب Sales Orders مع الـ owner
        so_data = await erp_get("Sales Order", {
            "filters": f'[["transaction_date",">=","{from_date}"],["transaction_date","<=","{to_date}"],["docstatus","=","1"]]',
            "fields": '["name","owner","transaction_date","grand_total","status"]',
            "limit_page_length": 1000,
        })
        orders = so_data.get("data", [])

        # جلب Delivery Notes لحساب سرعة التنفيذ
        dn_data = await erp_get("Delivery Note", {
            "filters": f'[["posting_date",">=","{from_date}"],["posting_date","<=","{to_date}"],["docstatus","=","1"]]',
            "fields": '["name","owner","posting_date","against_sales_order"]',
            "limit_page_length": 1000,
        })
        dns = dn_data.get("data", [])

        # بناء map: SO → DN posting_date
        so_to_dn: dict = {}
        for dn in dns:
            so = dn.get("against_sales_order")
            if so and so not in so_to_dn:
                so_to_dn[so] = dn.get("posting_date")

        # حساب أيام الفترة
        try:
            days_in_period = (datetime.strptime(to_date, "%Y-%m-%d") - datetime.strptime(from_date, "%Y-%m-%d")).days + 1
        except Exception:
            days_in_period = 30

        # تجميع بالموظف
        emp_map: dict = {}
        for o in orders:
            emp = o.get("owner", "unknown")
            if emp not in emp_map:
                emp_map[emp] = {"orders": 0, "revenue": 0, "exec_days": []}
            emp_map[emp]["orders"] += 1
            emp_map[emp]["revenue"] += o.get("grand_total", 0) or 0

            # سرعة التنفيذ
            dn_date = so_to_dn.get(o["name"])
            so_date = o.get("transaction_date")
            if dn_date and so_date:
                try:
                    diff = (datetime.strptime(dn_date, "%Y-%m-%d") - datetime.strptime(so_date, "%Y-%m-%d")).days
                    emp_map[emp]["exec_days"].append(diff)
                except Exception:
                    pass

        result = []
        for emp, data in emp_map.items():
            avg_exec = round(sum(data["exec_days"]) / len(data["exec_days"]), 1) if data["exec_days"] else None
            result.append({
                "employee":       emp.split("@")[0] if "@" in emp else emp,
                "orders":         data["orders"],
                "revenue":        round(data["revenue"], 2),
                "daily_avg":      round(data["orders"] / days_in_period, 2),
                "avg_exec_days":  avg_exec,
                "exec_samples":   len(data["exec_days"]),
            })

        result.sort(key=lambda x: x["orders"], reverse=True)
        return {"employees": result[:15], "total_orders": len(orders)}

    except Exception as e:
        return {"employees": [], "error": str(e)}


# ─── Procurement Speed ───────────────────────────────────────────────────────

async def _procurement_speed(from_date: str, to_date: str) -> dict:
    """
    سرعة إصدار PO من تاريخ إنشاء طلب الشراء (Material Request → PO)
    """
    try:
        po_data = await erp_get("Purchase Order", {
            "filters": f'[["transaction_date",">=","{from_date}"],["transaction_date","<=","{to_date}"],["docstatus","=","1"]]',
            "fields": '["name","supplier","transaction_date","schedule_date","grand_total","owner"]',
            "limit_page_length": 500,
        })
        pos = po_data.get("data", [])

        days_list = []
        details = []
        for po in pos:
            t = po.get("transaction_date")
            s = po.get("schedule_date")
            if t and s:
                try:
                    diff = (datetime.strptime(s, "%Y-%m-%d") - datetime.strptime(t, "%Y-%m-%d")).days
                    days_list.append(diff)
                    details.append({
                        "po":        po["name"],
                        "supplier":  po.get("supplier"),
                        "issued_by": po.get("owner", "").split("@")[0],
                        "date":      t,
                        "days_to_delivery": diff,
                        "amount":    po.get("grand_total", 0),
                    })
                except Exception:
                    pass

        avg = round(sum(days_list) / len(days_list), 1) if days_list else 0
        return {
            "avg_days_to_delivery": avg,
            "total_pos": len(pos),
            "sample": len(days_list),
            "details": sorted(details, key=lambda x: x["days_to_delivery"])[:10],
        }

    except Exception as e:
        return {"avg_days_to_delivery": 0, "error": str(e)}


# ─── Shipping Speed ──────────────────────────────────────────────────────────

async def _shipping_speed(from_date: str, to_date: str) -> dict:
    """
    سرعة إصدار:
    - Delivery Note (من SO لـ DN)
    - Shipment (إذا وُجد)
    """
    try:
        # SO → DN speed
        so_data = await erp_get("Sales Order", {
            "filters": f'[["transaction_date",">=","{from_date}"],["transaction_date","<=","{to_date}"],["docstatus","=","1"],["status","in",["To Deliver","Completed","Closed"]]]',
            "fields": '["name","transaction_date","delivery_date"]',
            "limit_page_length": 500,
        })
        sos = so_data.get("data", [])

        dn_data = await erp_get("Delivery Note", {
            "filters": f'[["posting_date",">=","{from_date}"],["posting_date","<=","{to_date}"],["docstatus","=","1"]]',
            "fields": '["name","posting_date","against_sales_order","transporter_name","owner"]',
            "limit_page_length": 500,
        })
        dns = dn_data.get("data", [])

        so_map: dict = {o["name"]: o.get("transaction_date") for o in sos}

        dn_speed = []
        dn_details = []
        for dn in dns:
            so_name = dn.get("against_sales_order")
            so_date_str = so_map.get(so_name) if so_name else None
            dn_date_str = dn.get("posting_date")
            if so_date_str and dn_date_str:
                try:
                    diff = (datetime.strptime(dn_date_str, "%Y-%m-%d") - datetime.strptime(so_date_str, "%Y-%m-%d")).days
                    dn_speed.append(diff)
                    dn_details.append({
                        "dn":         dn["name"],
                        "so":         so_name,
                        "days":       diff,
                        "carrier":    dn.get("transporter_name", "—"),
                        "issued_by":  dn.get("owner", "").split("@")[0],
                        "date":       dn_date_str,
                    })
                except Exception:
                    pass

        avg_dn = round(sum(dn_speed) / len(dn_speed), 1) if dn_speed else 0

        # Shipment speed (if doctype exists)
        ship_avg = None
        try:
            ship_data = await erp_get("Shipment", {
                "filters": f'[["posting_date",">=","{from_date}"],["posting_date","<=","{to_date}"],["docstatus","=","1"]]',
                "fields": '["name","posting_date","delivery_date","status"]',
                "limit_page_length": 200,
            })
            shipments = ship_data.get("data", [])
            ship_days = []
            for s in shipments:
                p = s.get("posting_date")
                d = s.get("delivery_date")
                if p and d:
                    try:
                        ship_days.append((datetime.strptime(d, "%Y-%m-%d") - datetime.strptime(p, "%Y-%m-%d")).days)
                    except Exception:
                        pass
            ship_avg = round(sum(ship_days) / len(ship_days), 1) if ship_days else None
        except Exception:
            pass

        return {
            "avg_dn_days":        avg_dn,
            "avg_shipment_days":  ship_avg,
            "dn_count":           len(dns),
            "dn_sample":          len(dn_speed),
            "slowest_dns":        sorted(dn_details, key=lambda x: x["days"], reverse=True)[:5],
            "fastest_dns":        sorted(dn_details, key=lambda x: x["days"])[:5],
        }

    except Exception as e:
        return {"avg_dn_days": 0, "error": str(e)}

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
        employee_perf,
        procurement_speed,
        shipping_speed,
    ) = await asyncio.gather(
        _late_orders(from_date, to_date),
        _stuck_orders(from_date),
        _avg_processing(from_date),
        _out_of_stock(),
        _low_stock(),
        _late_po(from_date, to_date),
        _open_complaints(),
        _avg_response(from_date),
        _daily_sales(from_date, to_date),
        _on_time_delivery(from_date, to_date),
        _employee_performance(from_date, to_date),
        _procurement_speed(from_date, to_date),
        _shipping_speed(from_date, to_date),
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
        "employee_performance": employee_perf,
        "procurement_speed": procurement_speed,
        "shipping_speed": shipping_speed,
    }
