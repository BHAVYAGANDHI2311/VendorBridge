"""Invoice PDF generation and email delivery."""

import os
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from datetime import datetime
from bson import ObjectId
from pydantic import BaseModel, EmailStr

from auth import get_current_active_user
from config import invoices_collection
from services.audit_log import write_audit_log
from services.po_service import serialize_datetime
from utils.errors import api_error

router = APIRouter(prefix="/invoices", tags=["Invoices"])

WRITE_ROLES = ("Admin", "Procurement Officer", "Manager")
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")


class SendEmailPayload(BaseModel):
    to: EmailStr
    subject: str
    message: str


def _require_write(user: dict):
    if user.get("role") not in WRITE_ROLES:
        api_error("FORBIDDEN", "Access denied.", status_code=403)


def _format_date(val) -> str:
    if not val:
        return "—"
    if isinstance(val, datetime):
        d = val
    else:
        try:
            d = datetime.fromisoformat(str(val).replace("Z", "").split("+")[0])
        except ValueError:
            return str(val)
    return d.strftime("%d %b %Y")


def _invoice_context(doc) -> dict:
    return {
        "invoice_number": doc.get("invoice_number", ""),
        "po_number": doc.get("po_number", ""),
        "status": doc.get("status", ""),
        "po_date": _format_date(doc.get("po_date")),
        "invoice_date": _format_date(doc.get("invoice_date")),
        "due_date": _format_date(doc.get("due_date")),
        "bill_to": doc.get("bill_to", {}),
        "vendor": doc.get("vendor", {}),
        "line_items": doc.get("line_items", []),
        "subtotal": doc.get("subtotal", 0),
        "cgst": doc.get("cgst", 0),
        "sgst": doc.get("sgst", 0),
        "grand_total": doc.get("grand_total", 0),
    }


def _render_html(context: dict) -> str:
    from jinja2 import Environment, FileSystemLoader
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    template = env.get_template("invoice_pdf.html")
    return template.render(**context)


@router.get("/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    current_user=Depends(get_current_active_user),
):
    _require_write(current_user)
    if not ObjectId.is_valid(invoice_id):
        api_error("INVALID_ID", "Invalid invoice ID", field="id")

    doc = await invoices_collection.find_one({"_id": ObjectId(invoice_id)})
    if not doc:
        api_error("NOT_FOUND", "Invoice not found.", status_code=404)

    if doc.get("created_by") != str(current_user["_id"]) and current_user.get("role") != "Admin":
        api_error("FORBIDDEN", "Access denied.", status_code=403)

    return {
        "id": str(doc["_id"]),
        "invoice_number": doc.get("invoice_number", ""),
        "po_id": doc.get("po_id", ""),
        "po_number": doc.get("po_number", ""),
        "status": doc.get("status", ""),
        "po_date": serialize_datetime(doc.get("po_date")),
        "invoice_date": serialize_datetime(doc.get("invoice_date")),
        "due_date": serialize_datetime(doc.get("due_date")),
        "bill_to": doc.get("bill_to", {}),
        "vendor": doc.get("vendor", {}),
        "line_items": doc.get("line_items", []),
        "subtotal": doc.get("subtotal", 0),
        "cgst": doc.get("cgst", 0),
        "sgst": doc.get("sgst", 0),
        "grand_total": doc.get("grand_total", 0),
    }


@router.get("/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: str,
    current_user=Depends(get_current_active_user),
):
    _require_write(current_user)
    if not ObjectId.is_valid(invoice_id):
        api_error("INVALID_ID", "Invalid invoice ID", field="id")

    doc = await invoices_collection.find_one({"_id": ObjectId(invoice_id)})
    if not doc:
        api_error("NOT_FOUND", "Invoice not found.", status_code=404)

    context = _invoice_context(doc)
    html = _render_html(context)
    filename = f"{doc.get('po_number', 'invoice')}-invoice.pdf"

    try:
        from weasyprint import HTML
        pdf_bytes = HTML(string=html).write_pdf()
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception:
        return Response(
            content=html.encode("utf-8"),
            media_type="text/html",
            headers={"Content-Disposition": f'attachment; filename="{doc.get("po_number", "invoice")}-invoice.html"'},
        )


@router.post("/{invoice_id}/send-email")
async def send_invoice_email(
    invoice_id: str,
    payload: SendEmailPayload,
    current_user=Depends(get_current_active_user),
):
    _require_write(current_user)
    if not ObjectId.is_valid(invoice_id):
        api_error("INVALID_ID", "Invalid invoice ID", field="id")

    doc = await invoices_collection.find_one({"_id": ObjectId(invoice_id)})
    if not doc:
        api_error("NOT_FOUND", "Invoice not found.", status_code=404)

    now = datetime.utcnow()
    log_entry = {
        "to": payload.to,
        "subject": payload.subject,
        "message": payload.message,
        "sent_by": current_user.get("full_name", ""),
        "sent_at": now.isoformat(),
    }

    print(f"\n[EMAIL SIMULATION] Invoice email to {payload.to}")
    print(f"[EMAIL SIMULATION] Subject: {payload.subject}")
    print(f"[EMAIL SIMULATION] Message: {payload.message}\n")

    await invoices_collection.update_one(
        {"_id": ObjectId(invoice_id)},
        {
            "$push": {"email_logs": log_entry},
            "$set": {"updated_at": now},
        },
    )

    await write_audit_log(
        "invoice",
        f"Invoice sent — {doc.get('po_number', '')} emailed to {payload.to}",
        current_user,
        related_id=invoice_id,
        action="invoice_sent",
    )

    return {"message": "Email sent successfully", "log": log_entry}
