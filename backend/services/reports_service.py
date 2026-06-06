"""Procurement reports aggregations from MongoDB."""

from calendar import monthrange
from datetime import datetime
from typing import Optional

from bson import ObjectId

from config import (
    purchase_orders_collection,
    rfqs_collection,
    invoices_collection,
    vendors_collection,
)

MONTH_LABELS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

READ_ROLES = ("Admin", "Procurement Officer", "Manager")

CATEGORY_COLORS = [
    "#2563EB", "#10B981", "#F59E0B", "#F97316",
    "#8B5CF6", "#EC4899", "#06B6D4", "#64748B",
]


def require_report_access(user: dict):
    from utils.errors import api_error
    if user.get("role") not in READ_ROLES:
        api_error("FORBIDDEN", "Access denied.", status_code=403)


def resolve_month_year(month: Optional[int], year: Optional[int]) -> tuple[int, int]:
    now = datetime.utcnow()
    m = month if month and 1 <= month <= 12 else now.month
    y = year if year and year >= 2000 else now.year
    return m, y


def month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)
    return start, end


def shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    month += delta
    while month < 1:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    return year, month


def month_label(year: int, month: int) -> str:
    return MONTH_LABELS[month - 1]


def overdue_cutoff(year: int, month: int) -> datetime:
    now = datetime.utcnow()
    if year == now.year and month == now.month:
        return now
    _, last_day = monthrange(year, month)
    return datetime(year, month, last_day, 23, 59, 59)


async def get_stats(month: int, year: int) -> dict:
    start, end = month_bounds(year, month)
    cutoff = overdue_cutoff(year, month)

    paid_match = {
        "status": "Paid",
        "created_at": {"$gte": start, "$lt": end},
    }
    spend_pipeline = [
        {"$match": paid_match},
        {"$group": {"_id": None, "total": {"$sum": "$grand_total"}}},
    ]
    spend_result = await purchase_orders_collection.aggregate(spend_pipeline).to_list(length=1)
    total_spend = spend_result[0]["total"] if spend_result else 0

    po_in_month = {"created_at": {"$gte": start, "$lt": end}}
    active_vendor_ids = await purchase_orders_collection.distinct("vendor_id", po_in_month)
    active_vendors = len([v for v in active_vendor_ids if v])

    total_rfqs = await rfqs_collection.count_documents({
        "created_at": {"$gte": start, "$lt": end},
        "status": {"$ne": "Draft"},
    })
    approved_rfqs = await rfqs_collection.count_documents({
        "created_at": {"$gte": start, "$lt": end},
        "status": "Closed",
    })
    success_rate = round((approved_rfqs / total_rfqs) * 100, 1) if total_rfqs else 0.0

    overdue_invoices = await purchase_orders_collection.count_documents({
        "status": "Pending Payment",
        "due_date": {"$lt": cutoff},
        "created_at": {"$gte": start, "$lt": end},
    })

    return {
        "total_spend": total_spend,
        "active_vendors": active_vendors,
        "rfq_success_rate": success_rate,
        "overdue_invoices": overdue_invoices,
        "month": month,
        "year": year,
        "month_label": f"{month_label(year, month)} {year}",
    }


async def get_spend_by_category(month: int, year: int) -> list:
    start, end = month_bounds(year, month)

    pipeline = [
        {
            "$match": {
                "status": "Paid",
                "created_at": {"$gte": start, "$lt": end},
            }
        },
        {
            "$addFields": {
                "rfq_oid": {
                    "$convert": {
                        "input": "$rfq_id",
                        "to": "objectId",
                        "onError": None,
                        "onNull": None,
                    }
                }
            }
        },
        {
            "$lookup": {
                "from": "rfqs",
                "localField": "rfq_oid",
                "foreignField": "_id",
                "as": "rfq",
            }
        },
        {"$unwind": {"path": "$rfq", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": {
                    "$cond": [
                        {"$and": [
                            {"$ne": ["$rfq.category", ""]},
                            {"$ne": ["$rfq.category", None]},
                        ]},
                        "$rfq.category",
                        "Uncategorized",
                    ]
                },
                "amount": {"$sum": "$grand_total"},
            }
        },
        {"$sort": {"amount": -1}},
    ]

    results = await purchase_orders_collection.aggregate(pipeline).to_list(length=50)
    if not results:
        return []

    max_amount = max(r["amount"] for r in results) or 1
    items = []
    for i, row in enumerate(results):
        items.append({
            "category": row["_id"],
            "amount": row["amount"],
            "percentage": round((row["amount"] / max_amount) * 100, 1),
            "color": CATEGORY_COLORS[i % len(CATEGORY_COLORS)],
        })
    return items


async def get_top_vendors(month: int, year: int, limit: int = 10) -> list:
    start, end = month_bounds(year, month)

    pipeline = [
        {
            "$match": {
                "status": "Paid",
                "created_at": {"$gte": start, "$lt": end},
            }
        },
        {
            "$group": {
                "_id": "$vendor_id",
                "vendor_name": {"$first": "$vendor_name"},
                "spend": {"$sum": "$grand_total"},
                "po_count": {"$sum": 1},
            }
        },
        {"$sort": {"spend": -1}},
        {"$limit": limit},
    ]

    results = await purchase_orders_collection.aggregate(pipeline).to_list(length=limit)
    return [
        {
            "vendor_id": row["_id"] or "",
            "vendor_name": row.get("vendor_name") or "Unknown",
            "spend": row["spend"],
            "po_count": row["po_count"],
        }
        for row in results
    ]


async def get_monthly_trend(end_month: int, end_year: int, months: int = 6) -> list:
    trend = []
    y, m = end_year, end_month

    for offset in range(months - 1, -1, -1):
        ty, tm = shift_month(y, m, -offset)
        start, end = month_bounds(ty, tm)
        pipeline = [
            {
                "$match": {
                    "status": "Paid",
                    "created_at": {"$gte": start, "$lt": end},
                }
            },
            {"$group": {"_id": None, "spend": {"$sum": "$grand_total"}}},
        ]
        result = await purchase_orders_collection.aggregate(pipeline).to_list(length=1)
        spend = result[0]["spend"] if result else 0
        trend.append({
            "month": month_label(ty, tm),
            "year": ty,
            "month_num": tm,
            "spend": spend,
            "is_current": ty == end_year and tm == end_month,
        })

    return trend


async def build_export_rows(month: int, year: int) -> list[dict]:
    start, end = month_bounds(year, month)
    rows = []

    rfqs = await rfqs_collection.find(
        {"created_at": {"$gte": start, "$lt": end}}
    ).sort("created_at", -1).to_list(length=500)

    for rfq in rfqs:
        rows.append({
            "record_type": "RFQ",
            "reference": rfq.get("title", ""),
            "vendor": "",
            "category": rfq.get("category", ""),
            "amount": "",
            "status": rfq.get("status", ""),
            "date": rfq.get("created_at"),
        })

    pos = await purchase_orders_collection.find(
        {"created_at": {"$gte": start, "$lt": end}}
    ).sort("created_at", -1).to_list(length=500)

    for po in pos:
        rows.append({
            "record_type": "Purchase Order",
            "reference": po.get("po_number", ""),
            "vendor": po.get("vendor_name", ""),
            "category": "",
            "amount": po.get("grand_total", 0),
            "status": po.get("status", ""),
            "date": po.get("created_at"),
        })

    invoices = await invoices_collection.find(
        {"created_at": {"$gte": start, "$lt": end}}
    ).sort("created_at", -1).to_list(length=500)

    for inv in invoices:
        rows.append({
            "record_type": "Invoice",
            "reference": inv.get("invoice_number", ""),
            "vendor": inv.get("vendor", {}).get("name", "") if isinstance(inv.get("vendor"), dict) else "",
            "category": "",
            "amount": inv.get("grand_total", 0),
            "status": inv.get("status", ""),
            "date": inv.get("created_at"),
        })

    vendor_ids = await purchase_orders_collection.distinct(
        "vendor_id",
        {"created_at": {"$gte": start, "$lt": end}},
    )
    for vid in vendor_ids:
        if not vid or not ObjectId.is_valid(str(vid)):
            continue
        vendor = await vendors_collection.find_one({"_id": ObjectId(str(vid))})
        if vendor:
            rows.append({
                "record_type": "Vendor Activity",
                "reference": vendor.get("name", ""),
                "vendor": vendor.get("name", ""),
                "category": vendor.get("category", ""),
                "amount": "",
                "status": vendor.get("status", ""),
                "date": vendor.get("updated_at") or vendor.get("created_at"),
            })

    return rows
