"""Purchase order and invoice creation helpers."""

from datetime import datetime, timedelta
from bson import ObjectId

from config import purchase_orders_collection, invoices_collection


def compute_tax_totals(line_items: list) -> dict:
    subtotal = round(sum(item.get("total", item.get("qty", 0) * item.get("unit_price", 0)) for item in line_items), 2)
    cgst = round(subtotal * 0.09, 2)
    sgst = round(subtotal * 0.09, 2)
    grand_total = round(subtotal + cgst + sgst, 2)
    return {
        "subtotal": subtotal,
        "cgst": cgst,
        "sgst": sgst,
        "grand_total": grand_total,
    }


async def next_po_number() -> str:
    year = datetime.utcnow().year
    prefix = f"PO-{year}-"
    latest = await purchase_orders_collection.find_one(
        {"po_number": {"$regex": f"^{prefix}"}},
        sort=[("po_number", -1)],
    )
    if latest and latest.get("po_number"):
        try:
            seq = int(latest["po_number"].split("-")[-1]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


async def next_invoice_number() -> str:
    year = datetime.utcnow().year
    prefix = f"INV-{year}-"
    latest = await invoices_collection.find_one(
        {"invoice_number": {"$regex": f"^{prefix}"}},
        sort=[("invoice_number", -1)],
    )
    if latest and latest.get("invoice_number"):
        try:
            seq = int(latest["invoice_number"].split("-")[-1]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def normalize_line_items(raw_items: list) -> list:
    items = []
    for item in raw_items:
        qty = float(item.get("qty", 0))
        unit_price = float(item.get("unit_price", 0))
        total = round(item.get("total", qty * unit_price), 2)
        items.append({
            "item_name": item.get("item_name", ""),
            "qty": qty,
            "unit": item.get("unit", ""),
            "unit_price": unit_price,
            "total": total,
        })
    return items


def serialize_datetime(val):
    if isinstance(val, datetime):
        return val.isoformat()
    return val


def build_bill_to(user: dict) -> dict:
    return {
        "organization_name": user.get("company") or user.get("full_name", ""),
        "address": user.get("address", ""),
        "gstin": user.get("gstin", ""),
        "email": user.get("email", ""),
        "phone": user.get("phone", ""),
    }


def build_vendor_block(vendor: dict) -> dict:
    return {
        "id": str(vendor["_id"]),
        "name": vendor.get("name", ""),
        "address": vendor.get("address", ""),
        "gstin": vendor.get("gst_number", ""),
        "email": vendor.get("email", ""),
        "phone": vendor.get("phone", ""),
        "contact_person": vendor.get("contact_person", ""),
    }
