"""User management — Admin only."""

from fastapi import APIRouter, Depends, Query
from bson import ObjectId
from datetime import datetime
from pydantic import BaseModel

from auth import get_current_active_user
from config import users_collection
from permissions import require_roles, ADMIN
from utils.errors import api_error

router = APIRouter(prefix="/users", tags=["Users"])


class UserStatusUpdate(BaseModel):
    is_active: bool


def _serialize_user(doc) -> dict:
    created = doc.get("created_at")
    return {
        "id": str(doc["_id"]),
        "full_name": doc.get("full_name", ""),
        "email": doc.get("email", ""),
        "role": doc.get("role", ""),
        "company": doc.get("company", ""),
        "is_active": doc.get("is_active", True),
        "created_at": created.isoformat() if isinstance(created, datetime) else created,
    }


@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    q: str = Query(""),
    current_user=Depends(get_current_active_user),
):
    require_roles(current_user, frozenset({ADMIN}), "Only admins can manage users.")

    query = {}
    if q.strip():
        pattern = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"full_name": pattern}, {"email": pattern}, {"role": pattern}]

    total = await users_collection.count_documents(query)
    skip = (page - 1) * limit
    cursor = users_collection.find(query, {"password": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = [_serialize_user(doc) async for doc in cursor]

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
    }


@router.patch("/{user_id}/status")
async def update_user_status(
    user_id: str,
    payload: UserStatusUpdate,
    current_user=Depends(get_current_active_user),
):
    require_roles(current_user, frozenset({ADMIN}), "Only admins can manage users.")

    if not ObjectId.is_valid(user_id):
        api_error("INVALID_ID", "Invalid user ID.", field="id")
    if str(current_user["_id"]) == user_id:
        api_error("FORBIDDEN", "You cannot deactivate your own account.")

    result = await users_collection.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"is_active": payload.is_active}},
    )
    if result.matched_count == 0:
        api_error("NOT_FOUND", "User not found.", status_code=404)

    doc = await users_collection.find_one({"_id": ObjectId(user_id)}, {"password": 0})
    return _serialize_user(doc)
