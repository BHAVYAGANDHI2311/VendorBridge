from fastapi import Depends
from auth import get_current_active_user
from utils.errors import api_error

WRITE_ROLES = {"Admin", "Procurement Officer"}
READ_ALL_ROLES = {"Admin", "Procurement Officer", "Manager"}


async def get_current_active_user_dep(current_user=Depends(get_current_active_user)):
    return current_user


def require_write_role(user: dict, resource: str = "this resource"):
    if user.get("role") not in WRITE_ROLES:
        api_error("FORBIDDEN", f"You do not have permission to modify {resource}.", status_code=403)


def can_read_all_vendors(user: dict) -> bool:
    return user.get("role") in READ_ALL_ROLES


def is_vendor_user(user: dict) -> bool:
    return user.get("role") == "Vendor"
