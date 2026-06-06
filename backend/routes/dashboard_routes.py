from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta
from auth import get_current_active_user
from config import (
    rfqs_collection, purchase_orders_collection,
    invoices_collection, approvals_collection,
    vendors_collection,
)
from seed import seed_user_data

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

ACTIVE_RFQ_STATUSES = ["Sent", "Received", "Draft"]
MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def serialize_doc(doc):
    return {"id": str(doc["_id"]), **{k: v for k, v in doc.items() if k != "_id"}}


async def compute_monthly_trend(user_id: str, months: int = 6):
    """Aggregate approved/delivered PO spend by month from MongoDB."""
    start_date = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    start_date = start_date - timedelta(days=30 * (months - 1))

    pipeline = [
        {
            "$match": {
                "created_by": user_id,
                "status": {"$in": ["Approved", "Delivered"]},
                "created_at": {"$gte": start_date},
            }
        },
        {
            "$group": {
                "_id": {"$dateToString": {"format": "%Y-%m", "date": "$created_at"}},
                "spend": {"$sum": "$amount"},
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


async def compute_spending_this_month(user_id: str):
    """Sum approved PO amounts created in the current month."""
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    pipeline = [
        {
            "$match": {
                "created_by": user_id,
                "status": {"$in": ["Approved", "Delivered", "Pending"]},
                "created_at": {"$gte": month_start},
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    result = await purchase_orders_collection.aggregate(pipeline).to_list(length=1)
    return result[0]["total"] if result else 0


async def compute_spending_trend_pct(user_id: str):
    """Compare this month vs last month spending."""
    now = datetime.utcnow()
    this_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_start = (this_start - timedelta(days=1)).replace(day=1)

    async def month_total(start, end):
        pipeline = [
            {
                "$match": {
                    "created_by": user_id,
                    "status": {"$in": ["Approved", "Delivered"]},
                    "created_at": {"$gte": start, "$lt": end},
                }
            },
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
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
    await seed_user_data(user_id)

    pending_approvals = await approvals_collection.count_documents(
        {"requested_by": user_id, "status": "Pending"}
    )
    active_rfqs = await rfqs_collection.count_documents(
        {"created_by": user_id, "status": {"$in": ACTIVE_RFQ_STATUSES}}
    )
    total_pos = await purchase_orders_collection.count_documents({"created_by": user_id})
    total_invoices = await invoices_collection.count_documents({"created_by": user_id})
    vendor_count = await vendors_collection.count_documents({"status": "Active"})

    monthly_trend = await compute_monthly_trend(user_id, 6)
    spending_this_month = await compute_spending_this_month(user_id)
    spending_trend_pct = await compute_spending_trend_pct(user_id)

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
    user_id = str(current_user["_id"])
    await seed_user_data(user_id)

    query = {"created_by": user_id}
    if search.strip():
        query["title"] = {"$regex": search.strip(), "$options": "i"}

    rfqs = await rfqs_collection.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
    return [serialize_doc(r) for r in rfqs]


@router.get("/purchase-orders")
async def get_purchase_orders(
    current_user=Depends(get_current_active_user),
    search: str = Query("", alias="q"),
    limit: int = Query(7, ge=1, le=50),
):
    user_id = str(current_user["_id"])
    await seed_user_data(user_id)

    query = {"created_by": user_id}
    if search.strip():
        query["$or"] = [
            {"po_number": {"$regex": search.strip(), "$options": "i"}},
            {"vendor": {"$regex": search.strip(), "$options": "i"}},
        ]

    pos = await purchase_orders_collection.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
    return [serialize_doc(p) for p in pos]


@router.get("/invoices")
async def get_invoices(
    current_user=Depends(get_current_active_user),
    search: str = Query("", alias="q"),
    limit: int = Query(7, ge=1, le=50),
):
    user_id = str(current_user["_id"])
    await seed_user_data(user_id)

    query = {"created_by": user_id}
    if search.strip():
        query["$or"] = [
            {"invoice_number": {"$regex": search.strip(), "$options": "i"}},
            {"vendor": {"$regex": search.strip(), "$options": "i"}},
            {"po_number": {"$regex": search.strip(), "$options": "i"}},
        ]

    invs = await invoices_collection.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
    return [serialize_doc(i) for i in invs]


@router.get("/approvals")
async def get_approvals(
    current_user=Depends(get_current_active_user),
    search: str = Query("", alias="q"),
    limit: int = Query(10, ge=1, le=50),
):
    user_id = str(current_user["_id"])
    await seed_user_data(user_id)

    query = {"requested_by": user_id}
    if search.strip():
        query["title"] = {"$regex": search.strip(), "$options": "i"}

    apprs = await approvals_collection.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
    return [serialize_doc(a) for a in apprs]
