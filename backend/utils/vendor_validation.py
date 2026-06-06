import re
from utils.sanitize import sanitize_text

GST_REGEX = re.compile(r"^[A-Za-z0-9]{29}$")
PHONE_REGEX = re.compile(r"^[+]?[\d\s\-()]{10,15}$")


def validate_gst(gst_number: str) -> str:
    gst = gst_number.strip().upper()
    if not GST_REGEX.match(gst):
        raise ValueError("GST number must be exactly 29 alphanumeric characters")
    return gst


def validate_phone(phone: str) -> str:
    cleaned = phone.strip()
    if not PHONE_REGEX.match(cleaned):
        raise ValueError("Invalid phone number format")
    digits = re.sub(r"\D", "", cleaned)
    if len(digits) < 10 or len(digits) > 15:
        raise ValueError("Phone number must contain 10–15 digits")
    return cleaned


def sanitize_vendor_fields(data: dict) -> dict:
    result = {}
    for key, value in data.items():
        if isinstance(value, str) and key not in ("email", "gst_number", "phone"):
            result[key] = sanitize_text(value)
        elif isinstance(value, str):
            result[key] = value.strip()
        else:
            result[key] = value
    return result
