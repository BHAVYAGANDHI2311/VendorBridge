from fastapi import APIRouter, Depends, Query
from datetime import datetime
from bson import ObjectId
from typing import Optional
import re

from auth import get_current_active_user
from config import vendors_collection
from models import VendorCreate, VendorUpdate, VendorStatusUpdate, VendorStatus
from permissions import require_write_role, can_read_all_vendors, is_vendor_user
from utils.errors import api_error
from utils.vendor_validation import validate_gst, validate_phone, sanitize_vendor_fields
from seed import seed_vendors

router = APIRouter(prefix="/vendors", tags=["Vendors"])


def serialize_vendor(doc) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "category": doc["category"],
        "gst_number": doc["gst_number"],
        "contact_person": doc["contact_person"],
        "email": doc["email"],
        "phone": doc["phone"],
        "status": doc["status"],
        "kyc_status": doc.get("kyc_status", "Pending"),
        "linked_user_id": doc.get("linked_user_id"),
        "created_at": doc["created_at"].isoformat() if isinstance(doc["created_at"], datetime) else doc["created_at"],
        "updated_at": doc["updated_at"].isoformat() if isinstance(doc["updated_at"], datetime) else doc["updated_at"],
    }


async def get_status_counts(base_filter: dict) -> dict:
    pipeline = [
        {"$match": base_filter},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    results = await vendors_collection.aggregate(pipeline).to_list(length=10)
    counts = {"Active": 0, "Pending": 0, "Blocked": 0}
    for r in results:
        if r["_id"] in counts:
            counts[r["_id"]] = r["count"]
    counts["all"] = sum(counts.values())
    return counts


def build_search_filter(search: str):
    if not search.strip():
        return {}
    pattern = {"$regex": re_escape(search.strip()), "$options": "i"}
    return {"$or": [{"name": pattern}, {"gst_number": pattern}, {"category": pattern}]}


def re_escape(text: str) -> str:
    return re.escape(text)


@router.get("")
async def list_vendors(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    q: str = Query(""),
    status: Optional[str] = Query(None),
    current_user=Depends(get_current_active_user),
):
    await seed_vendors()

    if is_vendor_user(current_user):
        vendor = await vendors_collection.find_one({"email": current_user["email"]})
        if not vendor:
            api_error("NOT_FOUND", "No vendor profile linked to your account.", status_code=404)
        return {
            "items": [serialize_vendor(vendor)],
            "total": 1,
            "page": 1,
            "limit": 1,
            "pages": 1,
            "counts": await get_status_counts({"email": current_user["email"]}),
        }

    if not can_read_all_vendors(current_user):
        api_error("FORBIDDEN", "You do not have permission to view vendors.", status_code=403)

    query = {}
    if status and status.lower() != "all":
        valid = [s.value for s in VendorStatus]
        if status not in valid:
            api_error("INVALID_STATUS", f"Status must be one of: {', '.join(valid)}", field="status")
        query["status"] = status

    search_filter = build_search_filter(q)
    if search_filter:
        query = {"$and": [query, search_filter]} if query else search_filter

    total = await vendors_collection.count_documents(query)
    skip = (page - 1) * limit
    cursor = vendors_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
    items = [serialize_vendor(doc) async for doc in cursor]

    counts = await get_status_counts({})

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
        "counts": counts,
    }


@router.get("/{vendor_id}")
async def get_vendor(vendor_id: str, current_user=Depends(get_current_active_user)):
    if not ObjectId.is_valid(vendor_id):
        api_error("INVALID_ID", "Invalid vendor ID.", field="id")

    vendor = await vendors_collection.find_one({"_id": ObjectId(vendor_id)})
    if not vendor:
        api_error("NOT_FOUND", "Vendor not found.", status_code=404)

    if is_vendor_user(current_user):
        if vendor.get("email") != current_user["email"]:
            api_error("FORBIDDEN", "You can only view your own vendor profile.", status_code=403)
    elif not can_read_all_vendors(current_user):
        api_error("FORBIDDEN", "You do not have permission to view vendors.", status_code=403)

    return serialize_vendor(vendor)


@router.post("", status_code=201)
async def create_vendor(payload: VendorCreate, current_user=Depends(get_current_active_user)):
    require_write_role(current_user)

    try:
        gst = validate_gst(payload.gst_number)
        phone = validate_phone(payload.phone)
    except ValueError as e:
        field = "gst_number" if "GST" in str(e) else "phone"
        code = "INVALID_GST" if field == "gst_number" else "INVALID_PHONE"
        api_error(code, str(e), field=field)

    email = payload.email.lower().strip()

    if await vendors_collection.find_one({"email": email}):
        api_error("DUPLICATE_EMAIL", "A vendor with this email already exists.", field="email")

    if await vendors_collection.find_one({"gst_number": gst}):
        api_error("DUPLICATE_GST", "A vendor with this GST number already exists.", field="gst_number")

    now = datetime.utcnow()
    doc = sanitize_vendor_fields({
        "name": payload.name,
        "category": payload.category.value,
        "gst_number": gst,
        "contact_person": payload.contact_person,
        "email": email,
        "phone": phone,
        "status": payload.status.value,
        "kyc_status": payload.kyc_status.value,
        "linked_user_id": None,
        "created_at": now,
        "updated_at": now,
    })

    result = await vendors_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_vendor(doc)


@router.put("/{vendor_id}")
async def update_vendor(
    vendor_id: str,
    payload: VendorUpdate,
    current_user=Depends(get_current_active_user),
):
    require_write_role(current_user)

    if not ObjectId.is_valid(vendor_id):
        api_error("INVALID_ID", "Invalid vendor ID.", field="id")

    vendor = await vendors_collection.find_one({"_id": ObjectId(vendor_id)})
    if not vendor:
        api_error("NOT_FOUND", "Vendor not found.", status_code=404)

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        api_error("NO_CHANGES", "No fields provided to update.")

    if "gst_number" in updates:
        try:
            updates["gst_number"] = validate_gst(updates["gst_number"])
        except ValueError as e:
            api_error("INVALID_GST", str(e), field="gst_number")
        existing = await vendors_collection.find_one({
            "gst_number": updates["gst_number"],
            "_id": {"$ne": ObjectId(vendor_id)},
        })
        if existing:
            api_error("DUPLICATE_GST", "A vendor with this GST number already exists.", field="gst_number")

    if "email" in updates:
        email = updates["email"].lower().strip()
        updates["email"] = email
        existing = await vendors_collection.find_one({
            "email": email,
            "_id": {"$ne": ObjectId(vendor_id)},
        })
        if existing:
            api_error("DUPLICATE_EMAIL", "A vendor with this email already exists.", field="email")

    if "phone" in updates:
        try:
            updates["phone"] = validate_phone(updates["phone"])
        except ValueError as e:
            api_error("INVALID_PHONE", str(e), field="phone")

    if "category" in updates:
        updates["category"] = updates["category"].value if hasattr(updates["category"], "value") else updates["category"]
    if "status" in updates:
        updates["status"] = updates["status"].value if hasattr(updates["status"], "value") else updates["status"]
    if "kyc_status" in updates:
        updates["kyc_status"] = updates["kyc_status"].value if hasattr(updates["kyc_status"], "value") else updates["kyc_status"]

    text_fields = {"name", "contact_person"}
    for field in text_fields:
        if field in updates:
            updates[field] = sanitize_text(updates[field])

    updates["updated_at"] = datetime.utcnow()
    await vendors_collection.update_one({"_id": ObjectId(vendor_id)}, {"$set": updates})

    updated = await vendors_collection.find_one({"_id": ObjectId(vendor_id)})
    return serialize_vendor(updated)


@router.patch("/{vendor_id}/status")
async def update_vendor_status(
    vendor_id: str,
    payload: VendorStatusUpdate,
    current_user=Depends(get_current_active_user),
):
    """Soft-delete / block via status toggle."""
    require_write_role(current_user)

    if not ObjectId.is_valid(vendor_id):
        api_error("INVALID_ID", "Invalid vendor ID.", field="id")

    vendor = await vendors_collection.find_one({"_id": ObjectId(vendor_id)})
    if not vendor:
        api_error("NOT_FOUND", "Vendor not found.", status_code=404)

    await vendors_collection.update_one(
        {"_id": ObjectId(vendor_id)},
        {"$set": {"status": payload.status.value, "updated_at": datetime.utcnow()}},
    )

    updated = await vendors_collection.find_one({"_id": ObjectId(vendor_id)})
    return serialize_vendor(updated)
