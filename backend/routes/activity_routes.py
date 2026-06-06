"""Activity audit log routes — read-only for clients; writes are internal only."""

from fastapi import APIRouter, Depends, Query
from bson import ObjectId

from auth import get_current_active_user
from config import activity_logs_collection
from services.audit_log import serialize_audit_log, build_type_filter
from utils.errors import api_error

router = APIRouter(prefix="/activity-logs", tags=["Activity Logs"])

READ_ROLES = ("Admin", "Procurement Officer", "Manager")
VALID_FILTERS = ("all", "rfq", "approvals", "invoices", "vendors")


def _require_read_access(user: dict):
    if user.get("role") not in READ_ROLES:
        api_error("FORBIDDEN", "Access denied.", status_code=403)


@router.get("")
async def list_activity_logs(
    type: str = Query("all", alias="type"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user=Depends(get_current_active_user),
):
    """Fetch immutable audit trail. No edit or delete endpoints exist."""
    _require_read_access(current_user)

    filter_key = (type or "all").lower()
    if filter_key not in VALID_FILTERS:
        api_error("INVALID_FILTER", f"Filter must be one of: {', '.join(VALID_FILTERS)}", field="type")

    query = build_type_filter(filter_key) or {}
    total = await activity_logs_collection.count_documents(query)
    skip = (page - 1) * limit

    cursor = (
        activity_logs_collection.find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    items = [serialize_audit_log(doc) async for doc in cursor]

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
        "filter": filter_key,
    }
