"""SMTP email delivery for VendorBridge."""

from __future__ import annotations

import smtplib
import ssl
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import (
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_TLS,
    SMTP_USER,
)


class EmailNotConfiguredError(Exception):
    """Raised when SMTP environment variables are missing."""


class EmailDeliveryError(Exception):
    """Raised when SMTP send fails."""


def is_smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def send_email_with_attachment(
    to: str,
    subject: str,
    body: str,
    attachment_bytes: bytes,
    filename: str,
    mime_type: str = "application/pdf",
) -> None:
    """Send an email with a single file attachment via SMTP."""
    if not is_smtp_configured():
        raise EmailNotConfiguredError(
            "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in backend/.env"
        )

    if not to or "@" not in to:
        raise EmailDeliveryError("Invalid recipient email address.")

    sender = SMTP_FROM or SMTP_USER
    msg = MIMEMultipart()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))

    maintype, _, subtype = (mime_type or "application/octet-stream").partition("/")
    if not subtype:
        maintype, subtype = "application", "octet-stream"

    part = MIMEBase(maintype, subtype)
    part.set_payload(attachment_bytes)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
    msg.attach(part)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            if SMTP_USE_TLS:
                server.starttls(context=ssl.create_default_context())
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(sender, [to], msg.as_string())
    except smtplib.SMTPException as exc:
        raise EmailDeliveryError(str(exc)) from exc
