"""
Immutable audit log service — write-once only.

No update, delete, or soft-delete. All procurement modules must call
write_audit_log() to append entries.
"""

from datetime import datetime
from typing import Optional

from bson import ObjectId

from config import activity_logs_collection

VALID_TYPES = frozenset({"rfq", "quotation", "approval", "invoice", "vendor"})

TYPE_FILTER_MAP = {
    "all": None,
    "rfq": ["rfq", "quotation"],
    "approvals": ["approval"],
    "invoices": ["invoice"],
    "vendors": ["vendor"],
}


async def write_audit_log(
    log_type: str,
    message: str,
    performed_by: dict,
    related_id: Optional[str] = None,
    action: Optional[str] = None,
) -> str:
    """Append a single immutable audit log entry. Returns inserted id."""
    if log_type not in VALID_TYPES:
        raise ValueError(f"Invalid audit log type: {log_type}")

    performer_id = performed_by.get("_id") or performed_by.get("id")
    doc = {
        "type": log_type,
        "message": message.strip(),
        "performed_by": ObjectId(performer_id) if performer_id else None,
        "performer_name": performed_by.get("full_name", ""),
        "related_id": related_id if related_id else None,
        "action": action or log_type,
        "created_at": datetime.utcnow(),
    }

    result = await activity_logs_collection.insert_one(doc)
    return str(result.inserted_id)


def serialize_audit_log(doc) -> dict:
    created = doc.get("created_at")
    return {
        "id": str(doc["_id"]),
        "type": doc.get("type", ""),
        "action": doc.get("action", doc.get("type", "")),
        "message": doc.get("message", ""),
        "performed_by": str(doc["performed_by"]) if doc.get("performed_by") else None,
        "performer_name": doc.get("performer_name", ""),
        "related_id": doc.get("related_id"),
        "created_at": created.isoformat() if isinstance(created, datetime) else created,
    }


def build_type_filter(filter_type: str) -> Optional[dict]:
    key = (filter_type or "all").lower()
    types = TYPE_FILTER_MAP.get(key)
    if types is None:
        return None
    return {"type": {"$in": types}}
