"""Record approval workflow steps into the immutable audit log."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Literal

from auth import get_current_active_user
from permissions import require_approval_access
from services.audit_log import write_audit_log

router = APIRouter(prefix="/approvals", tags=["Approvals"])


class ApprovalStepRecord(BaseModel):
    level: Literal["L1", "L2"]
    action: Literal["approved", "rejected"]
    rfq_id: str
    quotation_id: str = ""
    rfq_title: str = ""
    vendor_name: str = ""
    remarks: str = ""


@router.post("/audit-step", status_code=201)
async def record_approval_step(
    payload: ApprovalStepRecord,
    current_user=Depends(get_current_active_user),
):
    """Append-only audit entry for L1/L2 approval actions."""
    require_approval_access(current_user)

    verb = "approved" if payload.action == "approved" else "rejected"
    title = payload.rfq_title or "RFQ"
    vendor = payload.vendor_name or "vendor"
    message = f"{payload.level} {verb} — {vendor} for {title}"
    if payload.remarks:
        message += f" ({payload.remarks})"

    log_id = await write_audit_log(
        log_type="approval",
        message=message,
        performed_by=current_user,
        related_id=payload.quotation_id or payload.rfq_id,
        action=f"approval_{payload.action}",
    )

    return {"message": "Audit entry recorded", "log_id": log_id}
