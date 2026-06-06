from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from datetime import datetime, timedelta
from bson import ObjectId
from typing import Optional, List
import json
import re
import uuid
import os

from auth import get_current_active_user
from config import (
    rfqs_collection, vendors_collection, users_collection,
    categories_collection, units_collection, UPLOAD_DIR,
)
from permissions import require_write_role, is_vendor_user, RFQS_STAFF
from utils.errors import api_error
from utils.sanitize import sanitize_text
from rfq_config_data import get_rfq_config, seed_rfq_reference_data
from services.audit_log import write_audit_log

router = APIRouter(tags=["RFQs"])


def serialize_rfq(doc) -> dict:
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "category": doc.get("category", ""),
        "deadline": doc["deadline"].isoformat() if isinstance(doc.get("deadline"), datetime) else doc.get("deadline"),
        "description": doc.get("description", ""),
        "line_items": doc.get("line_items", []),
        "assigned_vendor_ids": doc.get("assigned_vendor_ids", []),
        "assigned_vendors": doc.get("assigned_vendors", []),
        "attachments": doc.get("attachments", []),
        "status": doc.get("status", "Draft"),
        "vendor_count": len(doc.get("assigned_vendor_ids", [])),
        "created_by": doc.get("created_by"),
        "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
        "updated_at": doc["updated_at"].isoformat() if isinstance(doc.get("updated_at"), datetime) else doc.get("updated_at"),
    }


def validate_rfq_payload(data: dict, config: dict, is_draft: bool = False) -> dict:
    v = config["validation"]
    errors = {}

    title = (data.get("title") or "").strip()
    if not is_draft:
        if len(title) < v["min_title_length"]:
            errors["title"] = f"Title must be at least {v['min_title_length']} characters"
        elif len(title) > v["max_title_length"]:
            errors["title"] = f"Title must be under {v['max_title_length']} characters"
        elif not re.match(v["title_pattern"], title):
            errors["title"] = "Title contains invalid characters"
    elif title and len(title) > v["max_title_length"]:
        errors["title"] = f"Title must be under {v['max_title_length']} characters"

    deadline = data.get("deadline")
    if not is_draft:
        if not deadline:
            errors["deadline"] = "Deadline is required"
        else:
            try:
                dl = datetime.fromisoformat(str(deadline).replace("Z", "").split("+")[0])
                min_dl = datetime.utcnow() + timedelta(hours=v["min_deadline_hours_ahead"])
                if dl < min_dl:
                    errors["deadline"] = f"Deadline must be at least {v['min_deadline_hours_ahead']} hours from now"
            except ValueError:
                errors["deadline"] = "Invalid deadline format"

    desc = data.get("description") or ""
    if len(desc) > v["max_description_length"]:
        errors["description"] = f"Description must be under {v['max_description_length']} characters"

    line_items = data.get("line_items") or []
    if not is_draft:
        if len(line_items) < v["min_line_items"]:
            errors["line_items"] = f"At least {v['min_line_items']} line item is required"
        for i, item in enumerate(line_items):
            if not (item.get("item_name") or "").strip():
                errors[f"line_items.{i}.item_name"] = "Item name is required"
            try:
                qty = float(item.get("qty") or 0)
            except (TypeError, ValueError):
                qty = 0
            if qty < v["min_qty"]:
                errors[f"line_items.{i}.qty"] = f"Quantity must be at least {v['min_qty']}"
            if not item.get("unit"):
                errors[f"line_items.{i}.unit"] = "Unit is required"

    vendor_ids = data.get("assigned_vendor_ids") or []
    if not is_draft and len(vendor_ids) < v.get("min_vendors_on_send", 1):
        errors["assigned_vendor_ids"] = f"At least {v.get('min_vendors_on_send', 1)} vendor must be assigned"

    return errors


@router.get("/rfqs/config")
async def rfq_config_endpoint(current_user=Depends(get_current_active_user)):
    await seed_rfq_reference_data()
    return await get_rfq_config()


@router.get("/categories")
async def list_categories(current_user=Depends(get_current_active_user)):
    await seed_rfq_reference_data()
    cats = await categories_collection.find({"is_active": True}).sort("name", 1).to_list(length=100)
    return [{"id": str(c["_id"]), "name": c["name"], "slug": c["slug"]} for c in cats]


@router.get("/units")
async def list_units(current_user=Depends(get_current_active_user)):
    await seed_rfq_reference_data()
    units = await units_collection.find({"is_active": True}).sort("code", 1).to_list(length=100)
    return [{"id": str(u["_id"]), "code": u["code"], "label": u["label"]} for u in units]


async def _rfq_list_query(user: dict) -> dict:
    """Vendors see assigned RFQs only; staff see all."""
    if is_vendor_user(user):
        vendor = await vendors_collection.find_one({"email": user["email"]})
        if not vendor:
            return {"_id": {"$exists": False}}
        return {"assigned_vendor_ids": str(vendor["_id"])}
    if user.get("role") in RFQS_STAFF:
        return {}
    return {"created_by": str(user["_id"])}


@router.get("/rfqs")
async def list_rfqs(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    status: Optional[str] = Query(None),
    current_user=Depends(get_current_active_user),
):
    query = await _rfq_list_query(current_user)
    if status:
        query = {**query, "status": status}

    total = await rfqs_collection.count_documents(query)
    skip = (page - 1) * limit
    cursor = rfqs_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
    items = [serialize_rfq(doc) async for doc in cursor]

    return {"items": items, "total": total, "page": page, "limit": limit, "pages": max(1, (total + limit - 1) // limit)}


@router.get("/rfqs/{rfq_id}")
async def get_rfq(rfq_id: str, current_user=Depends(get_current_active_user)):
    if not ObjectId.is_valid(rfq_id):
        api_error("INVALID_ID", "Invalid RFQ ID", field="id")
    doc = await rfqs_collection.find_one({"_id": ObjectId(rfq_id)})
    if not doc:
        api_error("NOT_FOUND", "RFQ not found", status_code=404)

    if is_vendor_user(current_user):
        vendor = await vendors_collection.find_one({"email": current_user["email"]})
        vendor_id = str(vendor["_id"]) if vendor else ""
        if vendor_id not in (doc.get("assigned_vendor_ids") or []):
            api_error("FORBIDDEN", "Access denied", status_code=403)
    elif current_user.get("role") not in RFQS_STAFF:
        if doc.get("created_by") != str(current_user["_id"]):
            api_error("FORBIDDEN", "Access denied", status_code=403)

    return serialize_rfq(doc)


async def _save_files(files: List[UploadFile], config: dict, rfq_id: str):
    fu = config["file_upload"]
    saved = []
    if len(files) > fu["max_total_files"]:
        api_error("TOO_MANY_FILES", f"Maximum {fu['max_total_files']} files allowed", field="attachments")

    rfq_dir = os.path.join(UPLOAD_DIR, rfq_id)
    os.makedirs(rfq_dir, exist_ok=True)

    for f in files:
        if not f.filename:
            continue
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in fu["allowed_extensions"]:
            api_error("INVALID_FILE_TYPE", f"File type {ext} not allowed", field="attachments")
        content = await f.read()
        if len(content) > fu["max_file_size_bytes"]:
            api_error("FILE_TOO_LARGE", f"File exceeds max size limit", field="attachments")
        if f.content_type and f.content_type not in fu["allowed_mime_types"]:
            api_error("INVALID_MIME", f"File type not allowed", field="attachments")

        file_id = str(uuid.uuid4())
        safe_name = re.sub(r"[^\w.\-]", "_", f.filename)
        path = os.path.join(rfq_dir, f"{file_id}_{safe_name}")
        with open(path, "wb") as out:
            out.write(content)

        saved.append({
            "id": file_id,
            "filename": safe_name,
            "original_name": f.filename,
            "size": len(content),
            "mime_type": f.content_type or "application/octet-stream",
            "path": path,
        })
    return saved


async def _resolve_vendors(vendor_ids: list):
    vendors = []
    for vid in vendor_ids:
        if not ObjectId.is_valid(vid):
            continue
        v = await vendors_collection.find_one({"_id": ObjectId(vid), "status": "Active"})
        if v:
            vendors.append({"id": str(v["_id"]), "name": v["name"], "email": v["email"]})
    return vendors


async def _create_rfq(data: dict, user_id: str, status: str, files: List[UploadFile]):
    config = await get_rfq_config()
    is_draft = status == config["statuses"]["DRAFT"]

    errors = validate_rfq_payload(data, config, is_draft=is_draft)
    if errors:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "Validation failed", "errors": errors})

    now = datetime.utcnow()
    vendor_ids = data.get("assigned_vendor_ids") or []
    vendors = await _resolve_vendors(vendor_ids) if vendor_ids else []

    deadline = None
    if data.get("deadline"):
        deadline = datetime.fromisoformat(str(data["deadline"]).replace("Z", "").split("+")[0])

    doc = {
        "title": sanitize_text(data.get("title") or ""),
        "category": data.get("category") or "",
        "deadline": deadline,
        "description": sanitize_text(data.get("description") or ""),
        "line_items": [
            {
                "id": item.get("id") or str(uuid.uuid4()),
                "item_name": sanitize_text(item.get("item_name") or ""),
                "qty": float(item.get("qty") or 0),
                "unit": item.get("unit") or "",
            }
            for item in (data.get("line_items") or [])
        ],
        "assigned_vendor_ids": [v["id"] for v in vendors],
        "assigned_vendors": vendors,
        "attachments": [],
        "status": status,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await rfqs_collection.insert_one(doc)
    rfq_id = str(result.inserted_id)

    if files:
        attachments = await _save_files(files, config, rfq_id)
        await rfqs_collection.update_one(
            {"_id": result.inserted_id},
            {"$set": {"attachments": attachments, "updated_at": datetime.utcnow()}},
        )
        doc["attachments"] = attachments

    doc["_id"] = result.inserted_id

    user_doc = await users_collection.find_one({"_id": ObjectId(user_id)})
    performer = user_doc or {"_id": user_id, "full_name": "System"}

    if status == config["statuses"]["DRAFT"]:
        await write_audit_log(
            "rfq",
            f"RFQ created — {doc['title']}",
            performer,
            related_id=rfq_id,
            action="rfq_created",
        )
    elif status == config["statuses"]["OPEN"]:
        vendor_count = len(vendors)
        await write_audit_log(
            "rfq",
            f"RFQ published — {doc['title']} sent to {vendor_count} vendor{'s' if vendor_count != 1 else ''}",
            performer,
            related_id=rfq_id,
            action="rfq_published",
        )

    # Simulate sending email notifications to all selected vendors
    if status == config["statuses"]["OPEN"]:
        print(f"\n[EMAIL SIMULATION] RFQ '{doc['title']}' has been finalized.")
        print(f"[EMAIL SIMULATION] Dispatching RFQ details to {len(vendors)} assigned vendor(s):")
        for v in vendors:
            print(f"  -> Sending notification email to {v['name']} ({v['email']})")
        print("[EMAIL SIMULATION] Dispatch complete.\n")

    return serialize_rfq(doc)


@router.post("/rfqs/draft", status_code=201)
async def create_draft_rfq(
    payload: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    current_user=Depends(get_current_active_user),
):
    require_write_role(current_user, "RFQs")
    config = await get_rfq_config()
    data = json.loads(payload)
    user_id = str(current_user["_id"])
    return await _create_rfq(data, user_id, config["statuses"]["DRAFT"], files)


@router.post("/rfqs/send", status_code=201)
async def send_rfq(
    payload: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    current_user=Depends(get_current_active_user),
):
    require_write_role(current_user, "RFQs")
    config = await get_rfq_config()
    data = json.loads(payload)
    user_id = str(current_user["_id"])
    return await _create_rfq(data, user_id, config["statuses"]["OPEN"], files)
