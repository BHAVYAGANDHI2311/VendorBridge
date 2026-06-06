"""Dashboard routes — all metrics and lists from real MongoDB data only (no demo seed)."""

from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta

from auth import get_current_active_user
from config import (
    rfqs_collection,
    purchase_orders_collection,
    invoices_collection,
    approvals_collection,
    vendors_collection,
)
from permissions import is_vendor_user, RFQS_STAFF, INVOICES_ACCESS

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

ACTIVE_RFQ_STATUSES = ["Sent", "Open", "Received", "Draft"]
OPEN_RFQ_STATUSES = ["Sent", "Open", "Received"]
MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
PAID_PO_STATUSES = ["Paid", "Approved", "Delivered"]
SPEND_PO_STATUSES = ["Paid", "Pending Payment", "Approved", "Delivered", "Pending"]


async def _vendor_id_for_user(user: dict):
    if not is_vendor_user(user):
        return None
    vendor = await vendors_collection.find_one({"email": user["email"]})
    return str(vendor["_id"]) if vendor else None


async def _rfq_query(user: dict) -> dict:
    if is_vendor_user(user):
        vendor_id = await _vendor_id_for_user(user)
        if not vendor_id:
            return {"_id": {"$exists": False}}
        return {"assigned_vendor_ids": vendor_id}
    if user.get("role") in RFQS_STAFF:
        return {}
    return {"created_by": str(user["_id"])}


async def _po_query(user: dict) -> dict:
    vendor_id = await _vendor_id_for_user(user)
    if vendor_id:
        return {"vendor_id": vendor_id}
    return {}


def _iso(val):
    if isinstance(val, datetime):
        return val.isoformat()
    return val


def serialize_po_row(doc) -> dict:
    vendor = doc.get("vendor_name", "")
    if not vendor and isinstance(doc.get("vendor"), dict):
        vendor = doc["vendor"].get("name", "")
    elif not vendor and isinstance(doc.get("vendor"), str):
        vendor = doc["vendor"]
    return {
        "id": str(doc["_id"]),
        "po_number": doc.get("po_number", ""),
        "vendor": vendor,
        "amount": doc.get("grand_total", doc.get("amount", 0)),
        "status": doc.get("status", ""),
        "created_at": _iso(doc.get("created_at")),
    }


def serialize_invoice_row(doc) -> dict:
    vendor = doc.get("vendor_name", "")
    if not vendor and isinstance(doc.get("vendor"), dict):
        vendor = doc["vendor"].get("name", "")
    elif not vendor and isinstance(doc.get("vendor"), str):
        vendor = doc["vendor"]
    return {
        "id": str(doc["_id"]),
        "po_id": doc.get("po_id", ""),
        "invoice_number": doc.get("invoice_number", ""),
        "po_number": doc.get("po_number", ""),
        "vendor": vendor,
        "amount": doc.get("grand_total", doc.get("amount", 0)),
        "status": doc.get("status", ""),
        "due_date": _iso(doc.get("due_date")),
        "created_at": _iso(doc.get("created_at")),
    }


async def compute_monthly_trend(po_query: dict, months: int = 6):
    start_date = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    start_date = start_date - timedelta(days=30 * (months - 1))

    pipeline = [
        {
            "$match": {
                **po_query,
                "status": {"$in": PAID_PO_STATUSES},
                "created_at": {"$gte": start_date},
            }
        },
        {
            "$group": {
                "_id": {"$dateToString": {"format": "%Y-%m", "date": "$created_at"}},
                "spend": {"$sum": {"$ifNull": ["$grand_total", "$amount"]}},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    results = await purchase_orders_collection.aggregate(pipeline).to_list(length=months)
    trend = []
    for i in range(months - 1, -1, -1):
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_start = month_start - timedelta(days=30 * i)
        key = month_start.strftime("%Y-%m")
        label = MONTH_LABELS[month_start.month - 1]
        match = next((r for r in results if r["_id"] == key), None)
        trend.append({"month": label, "spend": match["spend"] if match else 0})
    return trend


async def compute_spending_this_month(po_query: dict):
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    pipeline = [
        {
            "$match": {
                **po_query,
                "status": {"$in": SPEND_PO_STATUSES},
                "created_at": {"$gte": month_start},
            }
        },
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$grand_total", "$amount"]}}}},
    ]
    result = await purchase_orders_collection.aggregate(pipeline).to_list(length=1)
    return result[0]["total"] if result else 0


async def compute_spending_trend_pct(po_query: dict):
    now = datetime.utcnow()
    this_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_start = (this_start - timedelta(days=1)).replace(day=1)

    async def month_total(start, end):
        pipeline = [
            {
                "$match": {
                    **po_query,
                    "status": {"$in": PAID_PO_STATUSES},
                    "created_at": {"$gte": start, "$lt": end},
                }
            },
            {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$grand_total", "$amount"]}}}},
        ]
        result = await purchase_orders_collection.aggregate(pipeline).to_list(length=1)
        return result[0]["total"] if result else 0

    this_month = await month_total(this_start, now + timedelta(days=1))
    last_month = await month_total(last_start, this_start)
    if last_month == 0:
        return 0.0 if this_month == 0 else 100.0
    return round(((this_month - last_month) / last_month) * 100, 1)


@router.get("/stats")
async def get_dashboard_stats(current_user=Depends(get_current_active_user)):
    user_id = str(current_user["_id"])
    rfq_base = await _rfq_query(current_user)
    po_base = await _po_query(current_user)

    active_rfqs = await rfqs_collection.count_documents({
        **rfq_base,
        "status": {"$in": OPEN_RFQ_STATUSES if is_vendor_user(current_user) else ACTIVE_RFQ_STATUSES},
    })

    pending_approvals = 0
    if current_user.get("role") in ("Admin", "Manager"):
        pending_approvals = await approvals_collection.count_documents({"status": "Pending"})

    vendor_count = 0
    if current_user.get("role") in ("Admin", "Procurement Officer"):
        vendor_count = await vendors_collection.count_documents({"status": "Active"})

    total_pos = await purchase_orders_collection.count_documents(po_base)
    total_invoices = 0
    if current_user.get("role") in INVOICES_ACCESS:
        total_invoices = await invoices_collection.count_documents({})

    monthly_trend = await compute_monthly_trend(po_base, 6)
    spending_this_month = await compute_spending_this_month(po_base)
    spending_trend_pct = await compute_spending_trend_pct(po_base)

    return {
        "pending_approvals": pending_approvals,
        "active_rfqs": active_rfqs,
        "total_purchase_orders": total_pos,
        "total_invoices": total_invoices,
        "spending_this_month": spending_this_month,
        "spending_trend_pct": spending_trend_pct,
        "vendor_count": vendor_count,
        "monthly_trend": monthly_trend,
        "user": {
            "full_name": current_user.get("full_name", ""),
            "role": current_user.get("role", ""),
            "email": current_user.get("email", ""),
        },
    }


@router.get("/rfqs")
async def get_rfqs(
    current_user=Depends(get_current_active_user),
    search: str = Query("", alias="q"),
    limit: int = Query(12, ge=1, le=50),
):
    query = await _rfq_query(current_user)
    if search.strip():
        query = {**query, "title": {"$regex": search.strip(), "$options": "i"}}

    rfqs = await rfqs_collection.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
    return [
        {
            "id": str(r["_id"]),
            "title": r.get("title", ""),
            "category": r.get("category", ""),
            "status": r.get("status", ""),
            "vendor_count": len(r.get("assigned_vendor_ids") or []),
            "deadline": _iso(r.get("deadline")),
            "created_at": _iso(r.get("created_at")),
        }
        for r in rfqs
    ]


@router.get("/purchase-orders")
async def get_purchase_orders(
    current_user=Depends(get_current_active_user),
    search: str = Query("", alias="q"),
    limit: int = Query(7, ge=1, le=50),
):
    query = await _po_query(current_user)
    if search.strip():
        s = search.strip()
        query = {
            **query,
            "$or": [
                {"po_number": {"$regex": s, "$options": "i"}},
                {"vendor_name": {"$regex": s, "$options": "i"}},
                {"vendor": {"$regex": s, "$options": "i"}},
            ],
        }

    pos = await purchase_orders_collection.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
    return [serialize_po_row(p) for p in pos]


@router.get("/invoices")
async def get_invoices(
    current_user=Depends(get_current_active_user),
    search: str = Query("", alias="q"),
    limit: int = Query(7, ge=1, le=50),
):
    if current_user.get("role") not in INVOICES_ACCESS:
        return []

    query = {}
    if search.strip():
        s = search.strip()
        query["$or"] = [
            {"invoice_number": {"$regex": s, "$options": "i"}},
            {"po_number": {"$regex": s, "$options": "i"}},
            {"vendor_name": {"$regex": s, "$options": "i"}},
        ]

    invs = await invoices_collection.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
    return [serialize_invoice_row(i) for i in invs]


@router.get("/approvals")
async def get_approvals(
    current_user=Depends(get_current_active_user),
    search: str = Query("", alias="q"),
    limit: int = Query(10, ge=1, le=50),
):
    if current_user.get("role") not in ("Admin", "Manager"):
        return []

    query = {"status": "Pending"}
    if search.strip():
        query["title"] = {"$regex": search.strip(), "$options": "i"}

    apprs = await approvals_collection.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
    return [
        {
            "id": str(a["_id"]),
            "title": a.get("title", ""),
            "type": a.get("type", ""),
            "amount": a.get("amount", 0),
            "status": a.get("status", ""),
            "priority": a.get("priority", ""),
            "created_at": _iso(a.get("created_at")),
        }
        for a in apprs
    ]
