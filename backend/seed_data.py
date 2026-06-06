#!/usr/bin/env python3
"""
VendorBridge — comprehensive MongoDB seed script.

Clears demo collections and inserts relational mock data that demonstrates
the full procurement workflow (RFQ → Quotation → Approval → PO → Invoice).

Run from the backend directory:
    python seed_data.py

Default login password for all seeded users: Vendor@123
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta

from bson import ObjectId
from faker import Faker
from pymongo import MongoClient

from auth import get_password_hash

MONGODB_URI = "mongodb://localhost:27017/"
DB_NAME = "vendorbridge_db"
DEFAULT_PASSWORD = "Vendor@123"

COLLECTIONS_TO_CLEAR = [
    "users",
    "vendors",
    "rfqs",
    "quotations",
    "approvals",
    "purchase_orders",
    "invoices",
    "activity_logs",
]

fake = Faker("en_IN")
Faker.seed(2026)
random.seed(2026)


def make_gst(state_code: str, pan_fragment: str, suffix: str) -> str:
    """Build a 29-char GSTIN compatible with app validation (15-char core + padding)."""
    core = f"{state_code}{pan_fragment}{suffix}"[:15].upper()
    return (core + "0" * 29)[:29]


def compute_tax_totals(line_items: list) -> dict:
    subtotal = round(
        sum(item.get("total", item["qty"] * item["unit_price"]) for item in line_items),
        2,
    )
    cgst = round(subtotal * 0.09, 2)
    sgst = round(subtotal * 0.09, 2)
    return {
        "subtotal": subtotal,
        "cgst": cgst,
        "sgst": sgst,
        "tax_amount": round(cgst + sgst, 2),
        "grand_total": round(subtotal + cgst + sgst, 2),
    }


def build_line_items(title: str, quantity: int, unit: str, unit_price: float) -> list:
    return [
        {
            "item_name": title,
            "qty": quantity,
            "unit": unit,
            "unit_price": unit_price,
            "total": round(quantity * unit_price, 2),
        }
    ]


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


def build_bill_to(user: dict) -> dict:
    return {
        "organization_name": user.get("company") or user.get("full_name", ""),
        "address": user.get("address", ""),
        "gstin": user.get("gstin", ""),
        "email": user.get("email", ""),
        "phone": user.get("phone", ""),
    }


def log_activity(
    logs: list,
    log_type: str,
    message: str,
    performer: dict,
    created_at: datetime,
    related_id: str | None = None,
    action: str | None = None,
) -> None:
    logs.append(
        {
            "type": log_type,
            "message": message,
            "performed_by": performer["_id"],
            "performer_name": performer["full_name"],
            "related_id": related_id,
            "action": action or log_type,
            "created_at": created_at,
        }
    )


def po_date_months_ago(base: datetime, months_back: int) -> datetime:
    month = base.month - months_back
    year = base.year
    while month < 1:
        month += 12
        year -= 1
    day = min(base.day, 28)
    return datetime(year, month, day, 10, 0, 0)


def seed_analytics_history(
    db,
    vendors: list,
    active_vendors: list,
    proc1: dict,
    proc2: dict,
    now: datetime,
    po_seq: int,
    inv_seq: int,
) -> tuple[int, int, int]:
    """Additional POs/invoices spread over prior months for reports analytics."""
    history_specs = [
        (5, "IT Hardware", 0, 420000, True, "Laptop refresh — regional offices"),
        (5, "Office Supplies", 1, 210000, True, "Q4 stationery replenishment"),
        (4, "IT Hardware", 0, 380000, True, "Server maintenance hardware kits"),
        (4, "Logistics & Transport", 2, 175000, True, "Inter-warehouse freight — Feb"),
        (3, "IT Hardware", 0, 480000, True, "Core network switch upgrade"),
        (3, "Office Supplies", 1, 320000, True, "Ergonomic seating procurement"),
        (3, "Logistics & Transport", 2, 230000, False, "North-zone freight contract"),
        (2, "Office Supplies", 1, 180000, True, "Printer toner & consumables"),
        (2, "IT Hardware", 0, 290000, True, "Monitor deployment — Pune"),
        (1, "Logistics & Transport", 2, 195000, True, "Last-mile delivery services"),
        (1, "Office Supplies", 1, 150000, False, "Pantry & breakroom supplies"),
        (0, "IT Hardware", 0, 350000, True, "Mid-year laptop procurement"),
        (0, "Office Supplies", 1, 220000, True, "Office refresh — HQ"),
    ]

    purchase_orders: list[dict] = []
    invoices: list[dict] = []
    procs = [proc1, proc2]

    for idx, (months_back, category, vendor_idx, subtotal, paid, title) in enumerate(history_specs):
        vendor = active_vendors[vendor_idx % len(active_vendors)]
        creator = procs[idx % len(procs)]
        po_date = po_date_months_ago(now, months_back) + timedelta(days=random.randint(0, 10))
        due_date = po_date + timedelta(days=30)
        line_items = build_line_items(title, random.randint(5, 50), "Units", round(subtotal / 20, 2))
        totals = compute_tax_totals(line_items)
        status = "Paid" if paid else "Pending Payment"
        if not paid and due_date < now:
            status = "Pending Payment"

        po_number = f"PO-2026-{po_seq:04d}"
        inv_number = f"INV-2026-{inv_seq:04d}"
        po_seq += 1
        inv_seq += 1

        po_doc = {
            "_id": ObjectId(),
            "po_number": po_number,
            "quotation_id": "",
            "approval_id": "",
            "rfq_id": "",
            "rfq_title": title,
            "category": category,
            "vendor_id": str(vendor["_id"]),
            "vendor_name": vendor["name"],
            "vendor": build_vendor_block(vendor),
            "bill_to": build_bill_to(creator),
            "line_items": line_items,
            "subtotal": totals["subtotal"],
            "base_amount": totals["subtotal"],
            "cgst": totals["cgst"],
            "sgst": totals["sgst"],
            "tax_amount": totals["tax_amount"],
            "grand_total": totals["grand_total"],
            "total_amount": totals["grand_total"],
            "status": status,
            "issue_date": po_date,
            "po_date": po_date,
            "invoice_date": po_date,
            "due_date": due_date,
            "created_by": str(creator["_id"]),
            "created_at": po_date,
            "updated_at": po_date,
        }

        invoice_doc = {
            "_id": ObjectId(),
            "invoice_number": inv_number,
            "po_id": str(po_doc["_id"]),
            "po_number": po_number,
            "quotation_id": "",
            "rfq_id": "",
            "rfq_title": title,
            "vendor_id": str(vendor["_id"]),
            "bill_to": build_bill_to(creator),
            "vendor": build_vendor_block(vendor),
            "line_items": line_items,
            "subtotal": totals["subtotal"],
            "cgst": totals["cgst"],
            "sgst": totals["sgst"],
            "grand_total": totals["grand_total"],
            "total_amount": totals["grand_total"],
            "status": status,
            "issue_date": po_date,
            "invoice_date": po_date,
            "due_date": due_date,
            "pdf_url": f"/mock/invoice_{inv_seq - 1}.pdf",
            "email_logs": [],
            "created_by": str(creator["_id"]),
            "created_at": po_date + timedelta(hours=3),
            "updated_at": po_date + timedelta(hours=3),
        }
        po_doc["invoice_id"] = str(invoice_doc["_id"])
        purchase_orders.append(po_doc)
        invoices.append(invoice_doc)

    if purchase_orders:
        db.purchase_orders.insert_many(purchase_orders)
        db.invoices.insert_many(invoices)

    return po_seq, inv_seq, len(purchase_orders)


def ensure_demo_users(db=None) -> None:
    """Upsert core demo accounts (Admin, Manager, etc.) without wiping other data."""
    from pymongo import MongoClient

    client = None
    if db is None:
        client = MongoClient(MONGODB_URI)
        db = client[DB_NAME]

    password_hash = get_password_hash(DEFAULT_PASSWORD)
    now = datetime.utcnow()
    demo_users = [
        {"full_name": "VendorBridge Admin", "email": "admin@vendorbridge.com", "role": "Admin", "company": None},
        {"full_name": "Priya Sharma", "email": "proc1@vendorbridge.com", "role": "Procurement Officer", "company": None},
        {"full_name": "Rahul Verma", "email": "proc2@vendorbridge.com", "role": "Procurement Officer", "company": None},
        {"full_name": "Anil Mehta", "email": "manager@vendorbridge.com", "role": "Manager", "company": None},
        {"full_name": "Rajesh Kumar", "email": "vendor1@tech.com", "role": "Vendor", "company": "TechCore Solutions Pvt Ltd"},
        {"full_name": "Neha Gupta", "email": "vendor2@office.com", "role": "Vendor", "company": "Office Masters India"},
        {"full_name": "Amit Patel", "email": "vendor3@logistics.com", "role": "Vendor", "company": "Swift Logistics Services"},
    ]

    for spec in demo_users:
        doc = {
            "full_name": spec["full_name"],
            "email": spec["email"],
            "password": password_hash,
            "password_hash": password_hash,
            "role": spec["role"],
            "company": spec["company"],
            "phone": fake.phone_number()[:15],
            "address": fake.address().replace("\n", ", "),
            "gstin": make_gst("29", fake.bothify("?????#####").upper(), "1Z5") if spec["company"] else "",
            "is_active": True,
        }
        existing = db.users.find_one({"email": spec["email"]})
        if existing:
            db.users.update_one({"email": spec["email"]}, {"$set": doc})
        else:
            doc["created_at"] = now
            db.users.insert_one(doc)

    if client:
        client.close()


def seed_database() -> None:
    client = MongoClient(MONGODB_URI)
    db = client[DB_NAME]
    now = datetime.utcnow()
    password_hash = get_password_hash(DEFAULT_PASSWORD)

    print("[*] Clearing existing collections...")
    for name in COLLECTIONS_TO_CLEAR:
        db[name].delete_many({})
        print(f"   Cleared {name}")

    # ── 1. Users ─────────────────────────────────────────────────────────────
    user_specs = [
        ("VendorBridge Admin", "Admin", "admin@vendorbridge.com", "Admin", None),
        ("Priya Sharma", "Procurement Officer", "proc1@vendorbridge.com", "Procurement Officer", None),
        ("Rahul Verma", "Procurement Officer", "proc2@vendorbridge.com", "Procurement Officer", None),
        ("Anil Mehta", "Manager", "manager@vendorbridge.com", "Manager", None),
        ("Rajesh Kumar", "Vendor", "vendor1@tech.com", "Vendor", "TechCore Solutions Pvt Ltd"),
        ("Neha Gupta", "Vendor", "vendor2@office.com", "Vendor", "Office Masters India"),
        ("Amit Patel", "Vendor", "vendor3@logistics.com", "Vendor", "Swift Logistics Services"),
    ]

    users: list[dict] = []
    for full_name, _, email, role_label, company in user_specs:
        users.append(
            {
                "_id": ObjectId(),
                "full_name": full_name,
                "email": email,
                "password": password_hash,
                "password_hash": password_hash,
                "role": role_label,
                "company": company,
                "phone": fake.phone_number()[:15],
                "address": fake.address().replace("\n", ", "),
                "gstin": make_gst("29", fake.bothify("?????#####").upper(), "1Z5") if company else "",
                "is_active": True,
                "created_at": now - timedelta(days=90),
            }
        )

    db.users.insert_many(users)
    by_email = {u["email"]: u for u in users}
    admin = by_email["admin@vendorbridge.com"]
    proc1 = by_email["proc1@vendorbridge.com"]
    proc2 = by_email["proc2@vendorbridge.com"]
    manager = by_email["manager@vendorbridge.com"]
    vendor_users = [
        by_email["vendor1@tech.com"],
        by_email["vendor2@office.com"],
        by_email["vendor3@logistics.com"],
    ]
    print(f"[OK] Seeded {len(users)} Users")

    # ── 2. Vendors ───────────────────────────────────────────────────────────
    vendor_specs = [
        {
            "name": "TechCore Solutions Pvt Ltd",
            "category": "IT Hardware",
            "email": "vendor1@tech.com",
            "status": "Active",
            "rating": 4.7,
            "linked_user": vendor_users[0],
        },
        {
            "name": "Office Masters India",
            "category": "Office Supplies",
            "email": "vendor2@office.com",
            "status": "Active",
            "rating": 4.2,
            "linked_user": vendor_users[1],
        },
        {
            "name": "Swift Logistics Services",
            "category": "Logistics & Transport",
            "email": "vendor3@logistics.com",
            "status": "Active",
            "rating": 3.8,
            "linked_user": vendor_users[2],
        },
        {
            "name": "GreenPack Eco Supplies",
            "category": "Packaging Materials",
            "email": "sales@greenpack.in",
            "status": "Blocked",
            "rating": 3.5,
            "linked_user": None,
        },
    ]

    vendors: list[dict] = []
    for idx, spec in enumerate(vendor_specs, start=1):
        vendor_doc = {
            "_id": ObjectId(),
            "name": spec["name"],
            "category": spec["category"],
            "gst_number": make_gst("27", fake.bothify("?????#####").upper(), f"{idx}Z5"),
            "email": spec["email"],
            "contact_email": spec["email"],
            "contact_person": fake.name(),
            "phone": fake.phone_number()[:15],
            "address": fake.address().replace("\n", ", "),
            "rating": spec["rating"],
            "status": spec["status"],
            "kyc_status": "Verified" if spec["status"] == "Active" else "Rejected",
            "linked_user_id": str(spec["linked_user"]["_id"]) if spec["linked_user"] else None,
            "created_at": now - timedelta(days=80),
        }
        vendors.append(vendor_doc)

    db.vendors.insert_many(vendors)
    active_vendors = [v for v in vendors if v["status"] == "Active"]
    print(f"[OK] Seeded {len(vendors)} Vendors")

    # ── 3. RFQs ──────────────────────────────────────────────────────────────
    rfq_templates = [
        {
            "title": "Enterprise Laptop Procurement Q1 2026",
            "description": "Supply of 50 business-grade laptops with 3-year onsite warranty for Bengaluru HQ.",
            "category": "IT Hardware",
            "quantity": 50,
            "unit": "Units",
            "unit_price_hint": 72000,
            "status": "Sent",
            "deadline_offset": 14,
            "created_by": proc1,
            "assign": active_vendors[:3],
        },
        {
            "title": "Ergonomic Office Furniture Refresh",
            "description": "Standing desks, ergonomic chairs, and monitor arms for the Pune office expansion.",
            "category": "Office Supplies",
            "quantity": 35,
            "unit": "Sets",
            "unit_price_hint": 18500,
            "status": "Sent",
            "deadline_offset": 10,
            "created_by": proc2,
            "assign": active_vendors[1:],
        },
        {
            "title": "Annual Server Hardware Upgrade",
            "description": "Rack servers, SSD storage, and UPS units for data-centre refresh.",
            "category": "IT Hardware",
            "quantity": 12,
            "unit": "Units",
            "unit_price_hint": 285000,
            "status": "Closed",
            "deadline_offset": -45,
            "created_by": proc1,
            "assign": active_vendors[:3],
        },
        {
            "title": "Bulk Stationery & Consumables FY26",
            "description": "A4 paper, pens, folders, and printer cartridges for all regional offices.",
            "category": "Office Supplies",
            "quantity": 500,
            "unit": "Lots",
            "unit_price_hint": 420,
            "status": "Closed",
            "deadline_offset": -38,
            "created_by": proc2,
            "assign": active_vendors[1:],
        },
        {
            "title": "Inter-city Freight Contract — North Zone",
            "description": "Monthly freight movement between Delhi, Jaipur, and Chandigarh warehouses.",
            "category": "Logistics & Transport",
            "quantity": 24,
            "unit": "Trips",
            "unit_price_hint": 45000,
            "status": "Closed",
            "deadline_offset": -30,
            "created_by": proc1,
            "assign": [active_vendors[2], active_vendors[0]],
        },
        {
            "title": "Network Switch & Firewall Deployment",
            "description": "Managed switches and next-gen firewalls for branch office rollout.",
            "category": "IT Hardware",
            "quantity": 18,
            "unit": "Units",
            "unit_price_hint": 52000,
            "status": "Closed",
            "deadline_offset": -22,
            "created_by": proc2,
            "assign": active_vendors[:2],
        },
    ]

    rfqs: list[dict] = []
    for idx, tmpl in enumerate(rfq_templates):
        created_at = now + timedelta(days=tmpl["deadline_offset"] - 7)
        deadline = now + timedelta(days=tmpl["deadline_offset"])
        line_items = build_line_items(
            tmpl["title"],
            tmpl["quantity"],
            tmpl["unit"],
            tmpl["unit_price_hint"],
        )
        assigned = tmpl["assign"]
        rfq_doc = {
            "_id": ObjectId(),
            "title": tmpl["title"],
            "description": tmpl["description"],
            "category": tmpl["category"],
            "quantity": tmpl["quantity"],
            "line_items": line_items,
            "deadline": deadline,
            "assigned_vendor_ids": [str(v["_id"]) for v in assigned],
            "assigned_vendors": [{"id": str(v["_id"]), "name": v["name"]} for v in assigned],
            "status": tmpl["status"],
            "created_by": str(tmpl["created_by"]["_id"]),
            "created_at": created_at,
            "updated_at": created_at,
        }
        rfqs.append(rfq_doc)

    db.rfqs.insert_many(rfqs)
    open_rfqs = [r for r in rfqs if r["status"] == "Sent"]
    closed_rfqs = [r for r in rfqs if r["status"] == "Closed"]
    print(f"[OK] Seeded {len(rfqs)} RFQs ({len(open_rfqs)} open, {len(closed_rfqs)} closed)")

    # ── 4–7. Closed RFQ workflow ───────────────────────────────────────────
    quotations: list[dict] = []
    approvals: list[dict] = []
    purchase_orders: list[dict] = []
    invoices: list[dict] = []
    activity_logs: list[dict] = []

    po_seq = 1
    inv_seq = 1

    for rfq_idx, rfq in enumerate(closed_rfqs):
        rfq_creator = proc1 if rfq["created_by"] == str(proc1["_id"]) else proc2
        assigned_vendor_objs = [
            v for v in active_vendors if str(v["_id"]) in rfq["assigned_vendor_ids"]
        ]
        quote_count = 3 if len(assigned_vendor_objs) >= 3 else 2
        bidding_vendors = assigned_vendor_objs[:quote_count]

        base_unit_price = rfq["line_items"][0]["unit_price"]
        price_factors = sorted([random.uniform(0.88, 1.12) for _ in bidding_vendors])
        delivery_options = sorted(random.sample(range(7, 45), k=len(bidding_vendors)))

        rfq_quotes: list[dict] = []
        for q_idx, vendor in enumerate(bidding_vendors):
            unit_price = round(base_unit_price * price_factors[q_idx], 2)
            line_items = build_line_items(
                rfq["line_items"][0]["item_name"],
                rfq["line_items"][0]["qty"],
                rfq["line_items"][0]["unit"],
                unit_price,
            )
            totals = compute_tax_totals(line_items)
            submitted_at = rfq["deadline"] - timedelta(days=random.randint(2, 5))

            quote_doc = {
                "_id": ObjectId(),
                "rfq_id": str(rfq["_id"]),
                "rfq_title": rfq["title"],
                "vendor_id": str(vendor["_id"]),
                "vendor_name": vendor["name"],
                "line_items": line_items,
                "subtotal": totals["subtotal"],
                "tax_amount": totals["tax_amount"],
                "cgst": totals["cgst"],
                "sgst": totals["sgst"],
                "grand_total": totals["grand_total"],
                "quoted_price": totals["grand_total"],
                "tax_percent": 18,
                "delivery_days": delivery_options[q_idx],
                "notes": fake.sentence(nb_words=12),
                "status": "Submitted",
                "submitted_at": submitted_at,
                "created_at": submitted_at,
                "updated_at": submitted_at,
            }
            rfq_quotes.append(quote_doc)
            quotations.append(quote_doc)

            vendor_user = next(
                (u for u in vendor_users if u.get("company") == vendor["name"]),
                vendor_users[0],
            )
            log_activity(
                activity_logs,
                "quotation",
                f"Quotation submitted — {vendor['name']} quoted ₹{totals['grand_total']:,.0f} for {rfq['title']}",
                vendor_user,
                submitted_at,
                related_id=str(quote_doc["_id"]),
                action="quotation_submitted",
            )

        # Lowest price wins
        winner = min(rfq_quotes, key=lambda q: q["grand_total"])
        for quote in rfq_quotes:
            if quote["_id"] == winner["_id"]:
                quote["status"] = "Selected"
            else:
                quote["status"] = "Not Selected"

        selected_at = rfq["deadline"] - timedelta(days=1)
        rfq["status"] = "Under Review"
        rfq["selected_quotation_id"] = str(winner["_id"])
        rfq["updated_at"] = selected_at

        log_activity(
            activity_logs,
            "quotation",
            f"Quotation selected — {winner['vendor_name']} selected for {rfq['title']}",
            rfq_creator,
            selected_at,
            related_id=str(winner["_id"]),
            action="quotation_selected",
        )

        approved_at = selected_at + timedelta(days=2)
        approval_doc = {
            "_id": ObjectId(),
            "quotation_id": str(winner["_id"]),
            "approver_id": str(manager["_id"]),
            "action": "Approved",
            "remarks": "Competitive pricing, approved",
            "timestamp": approved_at,
            "title": f"Quotation Approval: {winner['vendor_name']}",
            "type": "Quotation",
            "amount": winner["grand_total"],
            "status": "Approved",
            "priority": "High",
            "rfq_id": str(rfq["_id"]),
            "vendor_id": winner["vendor_id"],
            "vendor_name": winner["vendor_name"],
            "requested_by": str(rfq_creator["_id"]),
            "created_at": approved_at,
        }
        approvals.append(approval_doc)

        log_activity(
            activity_logs,
            "approval",
            f"Quotation approved — {winner['vendor_name']} for {rfq['title']} (₹{winner['grand_total']:,.0f})",
            manager,
            approved_at,
            related_id=str(approval_doc["_id"]),
            action="approval_approved",
        )

        po_date = approved_at + timedelta(days=1)
        po_number = f"PO-2026-{po_seq:04d}"
        inv_number = f"INV-2026-{inv_seq:04d}"
        po_seq += 1
        inv_seq += 1

        winner_vendor = next(v for v in vendors if str(v["_id"]) == winner["vendor_id"])
        totals = compute_tax_totals(winner["line_items"])
        invoice_status = "Paid" if rfq_idx % 2 == 0 else "Pending Payment"
        po_status = "Paid" if invoice_status == "Paid" else "Pending Payment"
        due_date = po_date + timedelta(days=30)

        po_doc = {
            "_id": ObjectId(),
            "po_number": po_number,
            "quotation_id": str(winner["_id"]),
            "approval_id": str(approval_doc["_id"]),
            "rfq_id": str(rfq["_id"]),
            "rfq_title": rfq["title"],
            "category": rfq["category"],
            "vendor_id": winner["vendor_id"],
            "vendor_name": winner["vendor_name"],
            "vendor": build_vendor_block(winner_vendor),
            "bill_to": build_bill_to(rfq_creator),
            "line_items": winner["line_items"],
            "subtotal": totals["subtotal"],
            "base_amount": totals["subtotal"],
            "cgst": totals["cgst"],
            "sgst": totals["sgst"],
            "tax_amount": totals["tax_amount"],
            "grand_total": totals["grand_total"],
            "total_amount": totals["grand_total"],
            "status": po_status,
            "issue_date": po_date,
            "po_date": po_date,
            "invoice_date": po_date,
            "due_date": due_date,
            "created_by": str(rfq_creator["_id"]),
            "created_at": po_date,
            "updated_at": po_date,
        }
        purchase_orders.append(po_doc)

        log_activity(
            activity_logs,
            "approval",
            f"PO generated — {po_number} created for {winner['vendor_name']} ({rfq['title']})",
            rfq_creator,
            po_date,
            related_id=str(po_doc["_id"]),
            action="po_generated",
        )

        invoice_doc = {
            "_id": ObjectId(),
            "invoice_number": inv_number,
            "po_id": str(po_doc["_id"]),
            "po_number": po_number,
            "quotation_id": str(winner["_id"]),
            "rfq_id": str(rfq["_id"]),
            "rfq_title": rfq["title"],
            "vendor_id": winner["vendor_id"],
            "bill_to": build_bill_to(rfq_creator),
            "vendor": build_vendor_block(winner_vendor),
            "line_items": winner["line_items"],
            "subtotal": totals["subtotal"],
            "cgst": totals["cgst"],
            "sgst": totals["sgst"],
            "grand_total": totals["grand_total"],
            "total_amount": totals["grand_total"],
            "status": invoice_status,
            "issue_date": po_date,
            "invoice_date": po_date,
            "due_date": due_date,
            "pdf_url": f"/mock/invoice_{inv_seq - 1}.pdf",
            "email_logs": [],
            "created_by": str(rfq_creator["_id"]),
            "created_at": po_date + timedelta(hours=2),
            "updated_at": po_date + timedelta(hours=2),
        }
        invoices.append(invoice_doc)
        po_doc["invoice_id"] = str(invoice_doc["_id"])

        log_activity(
            activity_logs,
            "invoice",
            f"Invoice {inv_number} issued for {po_number} — status {invoice_status}",
            rfq_creator,
            invoice_doc["created_at"],
            related_id=str(invoice_doc["_id"]),
            action="invoice_issued",
        )

    # RFQ creation logs (all 6)
    for rfq in rfqs:
        creator = proc1 if rfq["created_by"] == str(proc1["_id"]) else proc2
        log_activity(
            activity_logs,
            "rfq",
            f"RFQ created — {rfq['title']} ({rfq['status']})",
            creator,
            rfq["created_at"],
            related_id=str(rfq["_id"]),
            action="rfq_created",
        )

    # Vendor onboarding logs
    for vendor in vendors[:3]:
        log_activity(
            activity_logs,
            "vendor",
            f"Vendor onboarded — {vendor['name']} ({vendor['category']})",
            admin,
            vendor["created_at"],
            related_id=str(vendor["_id"]),
            action="vendor_onboarded",
        )

    activity_logs.sort(key=lambda x: x["created_at"])

    db.quotations.insert_many(quotations)
    print(f"[OK] Seeded {len(quotations)} Quotations")

    db.approvals.insert_many(approvals)
    print(f"[OK] Seeded {len(approvals)} Approvals")

    db.purchase_orders.insert_many(purchase_orders)
    print(f"[OK] Seeded {len(purchase_orders)} Purchase Orders")

    db.invoices.insert_many(invoices)
    print(f"[OK] Seeded {len(invoices)} Invoices")

    hist_po_seq, hist_inv_seq, hist_count = seed_analytics_history(
        db, vendors, active_vendors, proc1, proc2, now, po_seq, inv_seq,
    )
    if hist_count:
        print(f"[OK] Seeded {hist_count} historical POs/invoices for analytics (6-month trend)")

    # Update RFQs with workflow state
    for rfq in rfqs:
        db.rfqs.replace_one({"_id": rfq["_id"]}, rfq)

    db.activity_logs.insert_many(activity_logs)
    print(f"[OK] Seeded {len(activity_logs)} Activity Logs")

    # Seed RFQ reference data (categories / units) if missing — sync via pymongo
    try:
        from rfq_config_data import RFQ_CONFIG_DOC, CATEGORY_SEED, UNIT_SEED

        if db.app_config.count_documents({"_id": "rfq_settings"}) == 0:
            db.app_config.insert_one(RFQ_CONFIG_DOC)
        if db.categories.count_documents({}) == 0:
            ref_now = datetime.utcnow()
            db.categories.insert_many([{**c, "created_at": ref_now} for c in CATEGORY_SEED])
        if db.units.count_documents({}) == 0:
            ref_now = datetime.utcnow()
            db.units.insert_many([{**u, "created_at": ref_now} for u in UNIT_SEED])
        print("[OK] RFQ reference data (categories, units) verified")
    except Exception as exc:
        print(f"[WARN] RFQ reference data skipped: {exc}")

    client.close()

    print("\n[DONE] VendorBridge database seeded successfully!")
    print(f"   Database : {DB_NAME}")
    print(f"   Password : {DEFAULT_PASSWORD} (all demo users)")
    print("   Admin    : admin@vendorbridge.com")
    print("   Manager  : manager@vendorbridge.com")
    print("   Proc     : proc1@vendorbridge.com, proc2@vendorbridge.com")
    print("   Vendors  : vendor1@tech.com, vendor2@office.com, vendor3@logistics.com")


if __name__ == "__main__":
    seed_database()
