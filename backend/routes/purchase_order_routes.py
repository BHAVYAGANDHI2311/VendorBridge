"""Purchase order routes — created after L2 approval from selected quotation."""

from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta
from bson import ObjectId
from typing import Optional
from pydantic import BaseModel

from auth import get_current_active_user
from config import (
    purchase_orders_collection,
    invoices_collection,
    quotations_collection,
    vendors_collection,
    rfqs_collection,
    users_collection,
)
from services.audit_log import write_audit_log
from services.po_service import (
    compute_tax_totals,
    next_po_number,
    next_invoice_number,
    normalize_line_items,
    build_bill_to,
    build_vendor_block,
    serialize_datetime,
)
from permissions import require_po_write, is_vendor_user
from utils.errors import api_error

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])

PO_STATUSES = ("Pending Payment", "Paid", "Cancelled")


async def _vendor_id_for_user(user: dict) -> Optional[str]:
    if not is_vendor_user(user):
        return None
    vendor = await vendors_collection.find_one({"email": user["email"]})
    return str(vendor["_id"]) if vendor else None


async def _po_list_query(user: dict) -> dict:
    """Vendors see own POs only; staff see all."""
    vendor_id = await _vendor_id_for_user(user)
    if vendor_id:
        return {"vendor_id": vendor_id}
    return {}


async def _can_access_po(user: dict, doc: dict) -> bool:
    vendor_id = await _vendor_id_for_user(user)
    if vendor_id:
        return doc.get("vendor_id") == vendor_id
    return True


class POCreate(BaseModel):
    quotation_id: str
    rfq_id: Optional[str] = None
    approval_id: Optional[str] = None


class POStatusUpdate(BaseModel):
    status: str


def _serialize_po_summary(doc) -> dict:
    return {
        "id": str(doc["_id"]),
        "po_number": doc.get("po_number", ""),
        "vendor_name": doc.get("vendor_name", ""),
        "rfq_title": doc.get("rfq_title", ""),
        "grand_total": doc.get("grand_total", 0),
        "status": doc.get("status", "Pending Payment"),
        "po_date": serialize_datetime(doc.get("po_date")),
        "invoice_id": doc.get("invoice_id", ""),
        "created_at": serialize_datetime(doc.get("created_at")),
    }


def _serialize_po_detail(doc, invoice_doc=None) -> dict:
    data = {
        "id": str(doc["_id"]),
        "po_number": doc.get("po_number", ""),
        "quotation_id": doc.get("quotation_id", ""),
        "rfq_id": doc.get("rfq_id", ""),
        "rfq_title": doc.get("rfq_title", ""),
        "approval_id": doc.get("approval_id"),
        "status": doc.get("status", "Pending Payment"),
        "po_date": serialize_datetime(doc.get("po_date")),
        "invoice_date": serialize_datetime(doc.get("invoice_date")),
        "due_date": serialize_datetime(doc.get("due_date")),
        "line_items": doc.get("line_items", []),
        "subtotal": doc.get("subtotal", 0),
        "cgst": doc.get("cgst", 0),
        "sgst": doc.get("sgst", 0),
        "grand_total": doc.get("grand_total", 0),
        "bill_to": doc.get("bill_to", {}),
        "vendor": doc.get("vendor", {}),
        "invoice_id": doc.get("invoice_id", ""),
        "created_at": serialize_datetime(doc.get("created_at")),
    }
    if invoice_doc:
        data["invoice_number"] = invoice_doc.get("invoice_number", "")
        data["email_logs"] = invoice_doc.get("email_logs", [])
    return data


@router.post("", status_code=201)
async def create_purchase_order(
    payload: POCreate,
    current_user=Depends(get_current_active_user),
):
    """Create PO + invoice from an approved (selected) quotation."""
    require_po_write(current_user)

    if not ObjectId.is_valid(payload.quotation_id):
        api_error("INVALID_ID", "Invalid quotation ID", field="quotation_id")

    quotation = await quotations_collection.find_one({
        "_id": ObjectId(payload.quotation_id),
        "status": "Selected",
    })
    if not quotation:
        api_error("NOT_FOUND", "Selected quotation not found.", status_code=404)

    existing = await purchase_orders_collection.find_one({"quotation_id": payload.quotation_id})
    if existing:
        inv = None
        if existing.get("invoice_id") and ObjectId.is_valid(existing["invoice_id"]):
            inv = await invoices_collection.find_one({"_id": ObjectId(existing["invoice_id"])})
        return _serialize_po_detail(existing, inv)

    vendor_id = quotation.get("vendor_id")
    if not ObjectId.is_valid(vendor_id):
        api_error("NOT_FOUND", "Vendor not linked to quotation.", status_code=404)

    vendor = await vendors_collection.find_one({"_id": ObjectId(vendor_id)})
    if not vendor:
        api_error("NOT_FOUND", "Vendor not found.", status_code=404)

    rfq_id = payload.rfq_id or quotation.get("rfq_id")
    rfq_title = quotation.get("rfq_title", "")
    if rfq_id and ObjectId.is_valid(rfq_id):
        rfq = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
        if rfq:
            rfq_title = rfq.get("title", rfq_title)

    line_items = normalize_line_items(quotation.get("line_items", []))
    totals = compute_tax_totals(line_items)

    now = datetime.utcnow()
    po_date = now
    invoice_date = now
    due_date = now + timedelta(days=30)
    user_id = str(current_user["_id"])

    bill_to = build_bill_to(current_user)
    vendor_block = build_vendor_block(vendor)

    po_number = await next_po_number()
    invoice_number = await next_invoice_number()

    po_doc = {
        "po_number": po_number,
        "quotation_id": payload.quotation_id,
        "rfq_id": rfq_id or "",
        "rfq_title": rfq_title,
        "approval_id": payload.approval_id,
        "vendor_id": vendor_id,
        "vendor_name": vendor.get("name", ""),
        "vendor": vendor_block,
        "bill_to": bill_to,
        "line_items": line_items,
        "subtotal": totals["subtotal"],
        "cgst": totals["cgst"],
        "sgst": totals["sgst"],
        "grand_total": totals["grand_total"],
        "status": "Pending Payment",
        "po_date": po_date,
        "invoice_date": invoice_date,
        "due_date": due_date,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    po_result = await purchase_orders_collection.insert_one(po_doc)
    po_id = str(po_result.inserted_id)

    invoice_doc = {
        "invoice_number": invoice_number,
        "po_id": po_id,
        "po_number": po_number,
        "quotation_id": payload.quotation_id,
        "rfq_id": rfq_id or "",
        "rfq_title": rfq_title,
        "bill_to": bill_to,
        "vendor": vendor_block,
        "line_items": line_items,
        "subtotal": totals["subtotal"],
        "cgst": totals["cgst"],
        "sgst": totals["sgst"],
        "grand_total": totals["grand_total"],
        "status": "Pending Payment",
        "po_date": po_date,
        "invoice_date": invoice_date,
        "due_date": due_date,
        "email_logs": [],
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    inv_result = await invoices_collection.insert_one(invoice_doc)
    invoice_id = str(inv_result.inserted_id)

    await purchase_orders_collection.update_one(
        {"_id": po_result.inserted_id},
        {"$set": {"invoice_id": invoice_id}},
    )
    po_doc["_id"] = po_result.inserted_id
    po_doc["invoice_id"] = invoice_id

    await write_audit_log(
        "approval",
        f"PO generated — {po_number} created for {vendor.get('name', '')} ({rfq_title})",
        current_user,
        related_id=po_id,
        action="po_generated",
    )

    return _serialize_po_detail(po_doc, invoice_doc)


@router.get("")
async def list_purchase_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_user=Depends(get_current_active_user),
):
    query = await _po_list_query(current_user)

    total = await purchase_orders_collection.count_documents(query)
    skip = (page - 1) * limit
    cursor = purchase_orders_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
    items = [_serialize_po_summary(doc) async for doc in cursor]

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
    }


@router.get("/{po_id}")
async def get_purchase_order(
    po_id: str,
    current_user=Depends(get_current_active_user),
):
    if not ObjectId.is_valid(po_id):
        api_error("INVALID_ID", "Invalid purchase order ID", field="id")

    doc = await purchase_orders_collection.find_one({"_id": ObjectId(po_id)})
    if not doc:
        api_error("NOT_FOUND", "Purchase order not found.", status_code=404)

    if not await _can_access_po(current_user, doc):
        api_error("FORBIDDEN", "Access denied.", status_code=403)

    invoice_doc = None
    if doc.get("invoice_id") and ObjectId.is_valid(doc["invoice_id"]):
        invoice_doc = await invoices_collection.find_one({"_id": ObjectId(doc["invoice_id"])})

    profile = await users_collection.find_one({"_id": current_user["_id"]})
    if profile:
        doc["bill_to"] = build_bill_to(profile)

    return _serialize_po_detail(doc, invoice_doc)


@router.patch("/{po_id}/status")
async def update_po_status(
    po_id: str,
    payload: POStatusUpdate,
    current_user=Depends(get_current_active_user),
):
    require_po_write(current_user)

    if payload.status not in PO_STATUSES:
        api_error("VALIDATION_ERROR", f"Status must be one of: {', '.join(PO_STATUSES)}", field="status")

    if not ObjectId.is_valid(po_id):
        api_error("INVALID_ID", "Invalid purchase order ID", field="id")

    doc = await purchase_orders_collection.find_one({"_id": ObjectId(po_id)})
    if not doc:
        api_error("NOT_FOUND", "Purchase order not found.", status_code=404)

    now = datetime.utcnow()
    await purchase_orders_collection.update_one(
        {"_id": ObjectId(po_id)},
        {"$set": {"status": payload.status, "updated_at": now}},
    )

    if doc.get("invoice_id") and ObjectId.is_valid(doc["invoice_id"]):
        await invoices_collection.update_one(
            {"_id": ObjectId(doc["invoice_id"])},
            {"$set": {"status": payload.status, "updated_at": now}},
        )

    action = "payment_paid" if payload.status == "Paid" else "po_status_updated"
    await write_audit_log(
        "invoice",
        f"{doc.get('po_number', '')} marked as {payload.status}",
        current_user,
        related_id=po_id,
        action=action,
    )

    updated = await purchase_orders_collection.find_one({"_id": ObjectId(po_id)})
    inv = None
    if updated.get("invoice_id"):
        inv = await invoices_collection.find_one({"_id": ObjectId(updated["invoice_id"])})

    return _serialize_po_detail(updated, inv)
