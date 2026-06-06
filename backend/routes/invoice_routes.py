"""Invoice PDF generation and email delivery."""

import asyncio
import os
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from datetime import datetime
from bson import ObjectId
from pydantic import BaseModel, Field

from auth import get_current_active_user
from config import invoices_collection
from services.audit_log import write_audit_log
from services.email_service import (
    EmailDeliveryError,
    EmailNotConfiguredError,
    send_email_with_attachment,
)
from services.po_service import serialize_datetime
from permissions import require_invoice_access
from utils.errors import api_error

router = APIRouter(prefix="/invoices", tags=["Invoices"])
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")


class SendEmailPayload(BaseModel):
    subject: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=5000)


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
    require_invoice_access(current_user)
    if not ObjectId.is_valid(invoice_id):
        api_error("INVALID_ID", "Invalid invoice ID", field="id")

    doc = await invoices_collection.find_one({"_id": ObjectId(invoice_id)})
    if not doc:
        api_error("NOT_FOUND", "Invoice not found.", status_code=404)

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


def _generate_pdf_bytes(doc) -> tuple[bytes, str, str]:
    """Return (content_bytes, media_type, filename). Always prefers real PDF output."""
    context = _invoice_context(doc)
    html = _render_html(context)
    filename = f"{doc.get('invoice_number') or doc.get('po_number', 'invoice')}-invoice.pdf"

    try:
        from weasyprint import HTML
        pdf_bytes = HTML(string=html).write_pdf()
        if pdf_bytes:
            return pdf_bytes, "application/pdf", filename
    except Exception:
        pass

    try:
        from io import BytesIO
        from xhtml2pdf import pisa

        buffer = BytesIO()
        result = pisa.CreatePDF(html, dest=buffer, encoding="utf-8")
        if not result.err:
            pdf_bytes = buffer.getvalue()
            if pdf_bytes:
                return pdf_bytes, "application/pdf", filename
    except Exception:
        pass

    html_name = filename.replace(".pdf", ".html")
    return html.encode("utf-8"), "text/html", html_name


@router.get("/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: str,
    current_user=Depends(get_current_active_user),
):
    require_invoice_access(current_user)
    if not ObjectId.is_valid(invoice_id):
        api_error("INVALID_ID", "Invalid invoice ID", field="id")

    doc = await invoices_collection.find_one({"_id": ObjectId(invoice_id)})
    if not doc:
        api_error("NOT_FOUND", "Invoice not found.", status_code=404)

    content, media_type, filename = _generate_pdf_bytes(doc)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{invoice_id}/send-email")
async def send_invoice_email(
    invoice_id: str,
    payload: SendEmailPayload,
    current_user=Depends(get_current_active_user),
):
    require_invoice_access(current_user)
    if not ObjectId.is_valid(invoice_id):
        api_error("INVALID_ID", "Invalid invoice ID", field="id")

    doc = await invoices_collection.find_one({"_id": ObjectId(invoice_id)})
    if not doc:
        api_error("NOT_FOUND", "Invoice not found.", status_code=404)

    recipient = (current_user.get("email") or "").strip().lower()
    if not recipient:
        api_error(
            "VALIDATION_ERROR",
            "Your account has no registered email address.",
            field="email",
        )

    now = datetime.utcnow()
    content, media_type, attachment_name = _generate_pdf_bytes(doc)
    attachment_type = "PDF" if media_type == "application/pdf" else "HTML"

    try:
        await asyncio.to_thread(
            send_email_with_attachment,
            recipient,
            payload.subject,
            payload.message,
            content,
            attachment_name,
            media_type,
        )
    except EmailNotConfiguredError as exc:
        api_error("EMAIL_NOT_CONFIGURED", str(exc), status_code=503)
    except EmailDeliveryError as exc:
        api_error("EMAIL_SEND_FAILED", f"Failed to send email: {exc}", status_code=502)

    log_entry = {
        "to": recipient,
        "subject": payload.subject,
        "message": payload.message,
        "sent_by": current_user.get("full_name", ""),
        "sent_at": now.isoformat(),
        "attachment": attachment_name,
        "attachment_type": attachment_type,
        "attachment_size_bytes": len(content),
        "delivery": "smtp",
    }

    await invoices_collection.update_one(
        {"_id": ObjectId(invoice_id)},
        {
            "$push": {"email_logs": log_entry},
            "$set": {"updated_at": now},
        },
    )

    await write_audit_log(
        "invoice",
        f"Invoice sent — {doc.get('po_number', '')} emailed to {recipient}",
        current_user,
        related_id=invoice_id,
        action="invoice_sent",
    )

    return {
        "message": f"Invoice emailed to your registered address ({recipient})",
        "recipient": recipient,
        "log": log_entry,
    }
