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
    quotations_collection,
)

MONTH_LABELS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

CATEGORY_COLORS = [
    "#2563EB", "#10B981", "#F59E0B", "#F97316",
    "#8B5CF6", "#EC4899", "#06B6D4", "#64748B",
]


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

    overdue_invoices = await invoices_collection.count_documents({
        "status": "Pending Payment",
        "due_date": {"$lt": cutoff},
    })

    total_pos = await purchase_orders_collection.count_documents({
        "created_at": {"$gte": start, "$lt": end},
    })

    pending_pipeline = [
        {
            "$match": {
                "status": "Pending Payment",
                "created_at": {"$gte": start, "$lt": end},
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$grand_total"}}},
    ]
    pending_result = await purchase_orders_collection.aggregate(pending_pipeline).to_list(length=1)
    pending_spend = pending_result[0]["total"] if pending_result else 0

    return {
        "total_spend": total_spend,
        "pending_spend": pending_spend,
        "total_pos": total_pos,
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
                        {"$ifNull": ["$category", "Uncategorized"]},
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

    total_spend = sum(r["amount"] for r in results) or 1
    max_amount = max(r["amount"] for r in results) or 1
    items = []
    for i, row in enumerate(results):
        items.append({
            "category": row["_id"],
            "amount": row["amount"],
            "percentage": round((row["amount"] / total_spend) * 100, 1),
            "bar_width": round((row["amount"] / max_amount) * 100, 1),
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


async def get_vendor_performance(month: int, year: int, limit: int = 10) -> list:
    """Vendor scorecard: spend, PO count, rating, quote win rate, avg delivery."""
    start, end = month_bounds(year, month)

    spend_pipeline = [
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
    ]
    spend_rows = {
        row["_id"]: row
        for row in await purchase_orders_collection.aggregate(spend_pipeline).to_list(length=100)
        if row["_id"]
    }

    quote_pipeline = [
        {
            "$match": {
                "submitted_at": {"$gte": start, "$lt": end},
                "status": {"$in": ["Submitted", "Selected", "Not Selected"]},
            }
        },
        {
            "$group": {
                "_id": "$vendor_id",
                "quotes_submitted": {"$sum": 1},
                "quotes_won": {
                    "$sum": {"$cond": [{"$eq": ["$status", "Selected"]}, 1, 0]}
                },
                "avg_delivery_days": {"$avg": "$delivery_days"},
            }
        },
    ]
    quote_rows = {
        row["_id"]: row
        for row in await quotations_collection.aggregate(quote_pipeline).to_list(length=100)
        if row["_id"]
    }

    vendor_ids = set(spend_rows.keys()) | set(quote_rows.keys())
    items = []

    for vid in vendor_ids:
        spend = spend_rows.get(vid, {})
        quotes = quote_rows.get(vid, {})
        submitted = quotes.get("quotes_submitted", 0)
        won = quotes.get("quotes_won", 0)
        win_rate = round((won / submitted) * 100, 1) if submitted else 0.0
        avg_delivery = round(quotes.get("avg_delivery_days") or 0, 1)

        rating = 0.0
        vendor_name = spend.get("vendor_name") or "Unknown"
        if ObjectId.is_valid(str(vid)):
            vendor = await vendors_collection.find_one({"_id": ObjectId(str(vid))})
            if vendor:
                rating = float(vendor.get("rating") or 0)
                vendor_name = vendor.get("name", vendor_name)

        on_time_score = min(100, round(max(0, 100 - (avg_delivery - 14) * 2), 1)) if avg_delivery else None

        items.append({
            "vendor_id": vid or "",
            "vendor_name": vendor_name,
            "spend": spend.get("spend", 0),
            "po_count": spend.get("po_count", 0),
            "rating": rating,
            "quotes_submitted": submitted,
            "quotes_won": won,
            "win_rate": win_rate,
            "avg_delivery_days": avg_delivery,
            "on_time_score": on_time_score,
        })

    items.sort(key=lambda x: (x["spend"], x["win_rate"]), reverse=True)
    return items[:limit]


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
        category = po.get("category", "")
        if not category and po.get("rfq_id") and ObjectId.is_valid(str(po["rfq_id"])):
            rfq = await rfqs_collection.find_one({"_id": ObjectId(str(po["rfq_id"]))})
            category = rfq.get("category", "") if rfq else ""

        rows.append({
            "record_type": "Purchase Order",
            "reference": po.get("po_number", ""),
            "vendor": po.get("vendor_name", ""),
            "category": category,
            "amount": po.get("grand_total", 0),
            "status": po.get("status", ""),
            "date": po.get("created_at"),
        })

    invoices = await invoices_collection.find(
        {"created_at": {"$gte": start, "$lt": end}}
    ).sort("created_at", -1).to_list(length=500)

    for inv in invoices:
        category = ""
        if inv.get("rfq_id") and ObjectId.is_valid(str(inv["rfq_id"])):
            rfq = await rfqs_collection.find_one({"_id": ObjectId(str(inv["rfq_id"]))})
            category = rfq.get("category", "") if rfq else ""

        rows.append({
            "record_type": "Invoice",
            "reference": inv.get("invoice_number", ""),
            "vendor": inv.get("vendor", {}).get("name", "") if isinstance(inv.get("vendor"), dict) else "",
            "category": category,
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
