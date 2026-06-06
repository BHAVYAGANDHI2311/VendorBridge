"""Quotation routes — vendors submit quotations against RFQs assigned to them."""

from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import datetime
from bson import ObjectId
from typing import Optional
from pydantic import BaseModel, Field
from typing import List

from auth import get_current_active_user
from config import rfqs_collection, vendors_collection, quotations_collection, approvals_collection
from utils.errors import api_error
from utils.sanitize import sanitize_text
from services.audit_log import write_audit_log

router = APIRouter(prefix="/quotations", tags=["Quotations"])


# ─── Pydantic Models ────────────────────────────────────────────────────────

class QuotationLineItem(BaseModel):
    item_name: str
    qty: float
    unit: str = ""
    unit_price: float = Field(..., ge=0)
    delivery_days: int = Field(..., ge=0)


class QuotationSubmit(BaseModel):
    rfq_id: str
    line_items: List[QuotationLineItem]
    tax_percent: float = Field(0, ge=0, le=100)
    notes: str = ""
    payment_terms_days: Optional[int] = Field(None, ge=0)


class QuotationSelect(BaseModel):
    rfq_id: str
    quotation_id: str


# ─── Helpers ────────────────────────────────────────────────────────────────

def serialize_quotation(doc) -> dict:
    return {
        "id": str(doc["_id"]),
        "rfq_id": doc["rfq_id"],
        "rfq_title": doc.get("rfq_title", ""),
        "vendor_id": doc["vendor_id"],
        "vendor_name": doc.get("vendor_name", ""),
        "line_items": doc.get("line_items", []),
        "tax_percent": doc.get("tax_percent", 0),
        "subtotal": doc.get("subtotal", 0),
        "tax_amount": doc.get("tax_amount", 0),
        "grand_total": doc.get("grand_total", 0),
        "payment_terms_days": doc.get("payment_terms_days"),
        "max_delivery_days": _max_delivery_days(doc),
        "notes": doc.get("notes", ""),
        "status": doc.get("status", "Draft"),
        "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
        "updated_at": doc["updated_at"].isoformat() if isinstance(doc.get("updated_at"), datetime) else doc.get("updated_at"),
    }


def _vendor_visible_status(status: str) -> str:
    """Vendors must not see comparison outcomes (Selected / Not Selected)."""
    if status in ("Selected", "Not Selected"):
        return "Submitted"
    return status or "Draft"


def serialize_quotation_for_vendor(doc, vendor_id: str) -> dict:
    """Return only the calling vendor's quotation — masks comparison outcomes."""
    data = serialize_quotation(doc)
    if data["vendor_id"] != vendor_id:
        api_error("FORBIDDEN", "Access denied.", status_code=403)
    data["status"] = _vendor_visible_status(data["status"])
    return data


def _max_delivery_days(doc) -> int:
    days = [item.get("delivery_days", 0) for item in doc.get("line_items", [])]
    return max(days) if days else 0


def _parse_payment_terms(doc) -> str:
    days = doc.get("payment_terms_days")
    if days is not None:
        return f"{int(days)} days"
    notes = (doc.get("notes") or "").lower()
    for token in notes.replace("net", "").split():
        if token.isdigit():
            return f"{token} days"
    return doc.get("notes") or "—"


def _require_comparison_role(user: dict):
    role = user.get("role", "")
    if role not in ("Admin", "Procurement Officer", "Manager"):
        api_error("FORBIDDEN", "Only procurement staff can compare quotations.", status_code=403)


def serialize_rfq_for_quotation(doc) -> dict:
    """Minimal RFQ data for the vendor to see and quote against."""
    status = doc.get("status", "")
    if status == "Under Review":
        status = "Closed"
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "category": doc.get("category", ""),
        "deadline": doc["deadline"].isoformat() if isinstance(doc.get("deadline"), datetime) else doc.get("deadline"),
        "description": doc.get("description", ""),
        "line_items": doc.get("line_items", []),
        "status": status,
    }


def _require_vendor_role(user: dict):
    if user.get("role") != "Vendor":
        api_error("FORBIDDEN", "Only vendor accounts can access this endpoint.", status_code=403)


async def _get_vendor_for_user(user: dict):
    """Find the vendor profile linked to this user by email."""
    vendor = await vendors_collection.find_one({"email": user["email"], "status": "Active"})
    return vendor


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/rfqs")
async def list_quotable_rfqs(
    current_user=Depends(get_current_active_user),
):
    """List RFQs assigned to the logged-in vendor only."""
    _require_vendor_role(current_user)
    vendor = await _get_vendor_for_user(current_user)
    if not vendor:
        api_error("NOT_FOUND", "No vendor profile linked to your account.", status_code=404)

    vendor_id = str(vendor["_id"])

    # Find RFQs where this vendor is in the assigned list
    query = {
        "assigned_vendor_ids": vendor_id,
        "status": {"$in": ["Sent", "Open", "Received"]},
        "line_items": {"$exists": True, "$ne": []},
    }
    cursor = rfqs_collection.find(query).sort("created_at", -1).limit(50)
    items = [serialize_rfq_for_quotation(doc) async for doc in cursor]

    return {"items": items, "total": len(items)}


@router.get("/rfq/{rfq_id}")
async def get_rfq_for_quotation(
    rfq_id: str,
    current_user=Depends(get_current_active_user),
):
    """Get RFQ details for the calling vendor to submit their own quotation."""
    _require_vendor_role(current_user)

    if not ObjectId.is_valid(rfq_id):
        api_error("INVALID_ID", "Invalid RFQ ID", field="rfq_id")

    doc = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    if not doc:
        api_error("NOT_FOUND", "RFQ not found.", status_code=404)

    vendor = await _get_vendor_for_user(current_user)
    if not vendor:
        api_error("NOT_FOUND", "No vendor profile linked to your account.", status_code=404)

    vendor_id = str(vendor["_id"])
    if vendor_id not in (doc.get("assigned_vendor_ids") or []):
        api_error("FORBIDDEN", "You are not assigned to this RFQ.", status_code=403)

    existing_quotation = await quotations_collection.find_one({
        "rfq_id": rfq_id,
        "vendor_id": vendor_id,
    })

    result = serialize_rfq_for_quotation(doc)
    if existing_quotation:
        result["existing_quotation"] = serialize_quotation_for_vendor(existing_quotation, vendor_id)

    return result


@router.get("")
async def list_quotations(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    status: Optional[str] = Query(None),
    current_user=Depends(get_current_active_user),
):
    """List quotations — vendors see their own, admins see all."""
    role = current_user.get("role", "")
    query = {}

    if role == "Vendor":
        vendor = await _get_vendor_for_user(current_user)
        if not vendor:
            api_error("NOT_FOUND", "No vendor profile linked to your account.", status_code=404)
        query["vendor_id"] = str(vendor["_id"])
        total = await quotations_collection.count_documents(query)
        skip = (page - 1) * limit
        cursor = quotations_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
        items = [
            serialize_quotation_for_vendor(doc, str(vendor["_id"]))
            async for doc in cursor
        ]
    elif role in ("Admin", "Procurement Officer", "Manager"):
        if status:
            query["status"] = status
        total = await quotations_collection.count_documents(query)
        skip = (page - 1) * limit
        cursor = quotations_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
        items = [serialize_quotation(doc) async for doc in cursor]
    else:
        api_error("FORBIDDEN", "Access denied.", status_code=403)

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
    }


@router.post("/submit", status_code=201)
async def submit_quotation(
    payload: QuotationSubmit,
    current_user=Depends(get_current_active_user),
):
    """Submit a final quotation against an RFQ."""
    _require_vendor_role(current_user)
    return await _save_quotation(payload, current_user, status="Submitted")


@router.post("/draft", status_code=201)
async def save_quotation_draft(
    payload: QuotationSubmit,
    current_user=Depends(get_current_active_user),
):
    """Save a quotation draft."""
    _require_vendor_role(current_user)
    return await _save_quotation(payload, current_user, status="Draft")


async def _save_quotation(payload: QuotationSubmit, user: dict, status: str):
    """Core save logic for both draft and submit."""
    rfq_id = payload.rfq_id

    if not ObjectId.is_valid(rfq_id):
        api_error("INVALID_ID", "Invalid RFQ ID", field="rfq_id")

    rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    if not rfq:
        api_error("NOT_FOUND", "RFQ not found.", status_code=404)

    # Resolve vendor
    vendor = await _get_vendor_for_user(user)
    if not vendor:
        # Non-vendor users can't submit quotations
        api_error("FORBIDDEN", "Only vendors can submit quotations.", status_code=403)

    vendor_id = str(vendor["_id"])

    # Validate — only submit if assigned to this RFQ
    if vendor_id not in (rfq.get("assigned_vendor_ids") or []):
        api_error("FORBIDDEN", "You are not assigned to this RFQ.", status_code=403)

    # Validate line items if submitting (not draft)
    if status == "Submitted":
        if not payload.line_items:
            api_error("VALIDATION_ERROR", "At least one line item is required.", field="line_items")
        for i, item in enumerate(payload.line_items):
            if item.unit_price <= 0:
                api_error("VALIDATION_ERROR", f"Unit price must be greater than 0 for item {i + 1}.", field=f"line_items.{i}.unit_price")
            if item.delivery_days <= 0:
                api_error("VALIDATION_ERROR", f"Delivery days must be greater than 0 for item {i + 1}.", field=f"line_items.{i}.delivery_days")

    # Compute totals
    line_items_data = []
    subtotal = 0
    for item in payload.line_items:
        total = item.qty * item.unit_price
        subtotal += total
        line_items_data.append({
            "item_name": sanitize_text(item.item_name),
            "qty": item.qty,
            "unit": item.unit,
            "unit_price": item.unit_price,
            "total": round(total, 2),
            "delivery_days": item.delivery_days,
        })

    tax_amount = round(subtotal * payload.tax_percent / 100, 2)
    grand_total = round(subtotal + tax_amount, 2)

    now = datetime.utcnow()

    # Check if a quotation already exists for this vendor + RFQ
    existing = await quotations_collection.find_one({
        "rfq_id": rfq_id,
        "vendor_id": vendor_id,
    })

    doc = {
        "rfq_id": rfq_id,
        "rfq_title": rfq.get("title", ""),
        "vendor_id": vendor_id,
        "vendor_name": vendor.get("name", ""),
        "line_items": line_items_data,
        "tax_percent": payload.tax_percent,
        "subtotal": round(subtotal, 2),
        "tax_amount": tax_amount,
        "grand_total": grand_total,
        "notes": sanitize_text(payload.notes),
        "payment_terms_days": payload.payment_terms_days,
        "status": status,
        "updated_at": now,
    }

    if existing:
        # Update existing quotation
        await quotations_collection.update_one(
            {"_id": existing["_id"]},
            {"$set": doc},
        )
        doc["_id"] = existing["_id"]
        doc["created_at"] = existing["created_at"]
    else:
        # Create new quotation
        doc["created_at"] = now
        result = await quotations_collection.insert_one(doc)
        doc["_id"] = result.inserted_id

    if status == "Submitted":
        rfq_title = rfq.get("title", "")
        await write_audit_log(
            "quotation",
            f"Quotation submitted — {vendor.get('name', '')} for {rfq_title}",
            user,
            related_id=str(doc["_id"]),
            action="quotation_submitted",
        )

    return serialize_quotation_for_vendor(doc, vendor_id)


@router.get("/compare/rfqs")
async def list_comparable_rfqs(
    current_user=Depends(get_current_active_user),
):
    """RFQs that have at least one submitted quotation."""
    _require_comparison_role(current_user)

    pipeline = [
        {"$match": {"status": {"$in": ["Submitted", "Selected", "Not Selected"]}}},
        {"$group": {"_id": "$rfq_id", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gte": 1}}},
        {"$sort": {"count": -1}},
    ]
    groups = await quotations_collection.aggregate(pipeline).to_list(length=50)

    items = []
    for group in groups:
        rfq_id = group["_id"]
        if not ObjectId.is_valid(rfq_id):
            continue
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
        if not rfq:
            continue
        items.append({
            "rfq_id": rfq_id,
            "title": rfq.get("title", ""),
            "quotation_count": group["count"],
        })

    return {"items": items, "total": len(items)}


@router.get("/compare/{rfq_id}")
async def get_quotation_comparison(
    rfq_id: str,
    current_user=Depends(get_current_active_user),
):
    """Side-by-side comparison of submitted quotations for an RFQ."""
    _require_comparison_role(current_user)

    if not ObjectId.is_valid(rfq_id):
        api_error("INVALID_ID", "Invalid RFQ ID", field="rfq_id")

    rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    if not rfq:
        api_error("NOT_FOUND", "RFQ not found.", status_code=404)

    cursor = quotations_collection.find({
        "rfq_id": rfq_id,
        "status": {"$in": ["Submitted", "Selected", "Not Selected"]},
    }).sort("grand_total", 1)
    quotations = [doc async for doc in cursor]

    if not quotations:
        api_error("NOT_FOUND", "No quotations found for this RFQ.", status_code=404)

    selected_id = rfq.get("selected_quotation_id")

    vendor_ids = [q["vendor_id"] for q in quotations if ObjectId.is_valid(q["vendor_id"])]
    vendor_map = {}
    if vendor_ids:
        vendor_cursor = vendors_collection.find({
            "_id": {"$in": [ObjectId(vid) for vid in vendor_ids]},
        })
        async for vendor in vendor_cursor:
            vendor_map[str(vendor["_id"])] = vendor

    lowest_total = min(q.get("grand_total", 0) for q in quotations)

    columns = []
    for q in quotations:
        vendor = vendor_map.get(q["vendor_id"], {})
        rating = vendor.get("rating")
        qid = str(q["_id"])
        columns.append({
            "quotation_id": qid,
            "vendor_id": q["vendor_id"],
            "vendor_name": q.get("vendor_name", vendor.get("name", "")),
            "is_lowest": q.get("grand_total", 0) == lowest_total and q.get("status") != "Not Selected",
            "is_selected": qid == selected_id or q.get("status") == "Selected",
            "status": q.get("status", "Submitted"),
            "values": {
                "grand_total": q.get("grand_total", 0),
                "tax_percent": q.get("tax_percent", 0),
                "delivery_days": _max_delivery_days(q),
                "vendor_rating": rating,
                "payment_terms": _parse_payment_terms(q),
            },
        })

    return {
        "rfq_id": rfq_id,
        "rfq_title": rfq.get("title", ""),
        "quotation_count": len(columns),
        "criteria": [
            {"key": "grand_total", "label": "Grand Total", "format": "currency"},
            {"key": "tax_percent", "label": "GST %", "format": "percent"},
            {"key": "delivery_days", "label": "Delivery (days)", "format": "number"},
            {"key": "vendor_rating", "label": "Vendor rating", "format": "rating"},
            {"key": "payment_terms", "label": "Payment terms", "format": "text"},
        ],
        "columns": columns,
        "selected_quotation_id": selected_id,
        "footnote": "Green = lowest price, selecting vendor initiates the approval workflow.",
    }


@router.post("/select", status_code=201)
async def select_quotation(
    payload: QuotationSelect,
    current_user=Depends(get_current_active_user),
):
    """Select a vendor quotation and start the approval workflow."""
    _require_comparison_role(current_user)

    rfq_id = payload.rfq_id
    quotation_id = payload.quotation_id

    if not ObjectId.is_valid(rfq_id):
        api_error("INVALID_ID", "Invalid RFQ ID", field="rfq_id")
    if not ObjectId.is_valid(quotation_id):
        api_error("INVALID_ID", "Invalid quotation ID", field="quotation_id")

    quotation = await quotations_collection.find_one({
        "_id": ObjectId(quotation_id),
        "rfq_id": rfq_id,
        "status": "Submitted",
    })
    if not quotation:
        api_error("NOT_FOUND", "Quotation not found for this RFQ.", status_code=404)

    now = datetime.utcnow()
    user_id = str(current_user.get("_id") or current_user.get("id") or "")

    await quotations_collection.update_one(
        {"rfq_id": rfq_id, "status": "Submitted"},
        {"$set": {"status": "Not Selected", "updated_at": now}},
    )
    await quotations_collection.update_one(
        {"_id": ObjectId(quotation_id)},
        {"$set": {"status": "Selected", "updated_at": now}},
    )
    await rfqs_collection.update_one(
        {"_id": ObjectId(rfq_id)},
        {"$set": {"status": "Under Review", "selected_quotation_id": quotation_id, "updated_at": now}},
    )

    approval = {
        "title": f"Quotation Approval: {quotation.get('vendor_name', 'Vendor')}",
        "type": "Quotation",
        "amount": quotation.get("grand_total", 0),
        "status": "Pending",
        "priority": "High",
        "rfq_id": rfq_id,
        "quotation_id": quotation_id,
        "vendor_id": quotation.get("vendor_id"),
        "vendor_name": quotation.get("vendor_name", ""),
        "requested_by": user_id,
        "created_at": now,
    }
    result = await approvals_collection.insert_one(approval)

    rfq_title = quotation.get("rfq_title") or rfq.get("title", "")
    vendor_name = quotation.get("vendor_name", "Vendor")
    await write_audit_log(
        "quotation",
        f"Quotation selected — {vendor_name} selected for {rfq_title}",
        current_user,
        related_id=quotation_id,
        action="quotation_selected",
    )
    await write_audit_log(
        "approval",
        f"Approval initiated — {vendor_name} for {rfq_title} awaiting L1 review",
        current_user,
        related_id=str(result.inserted_id),
        action="approval_pending",
    )

    return {
        "message": "Vendor selected. Approval workflow initiated.",
        "approval_id": str(result.inserted_id),
        "quotation_id": quotation_id,
        "vendor_name": quotation.get("vendor_name", ""),
    }
