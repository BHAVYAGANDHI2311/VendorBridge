"""MongoDB seed data for VendorBridge ERP — all demo data lives in the database."""

from datetime import datetime, timedelta
from config import (
    vendors_collection,
    rfqs_collection,
    purchase_orders_collection,
    invoices_collection,
    approvals_collection,
)

VENDOR_CATEGORIES = ["Construction", "IT", "Logistics", "Manufacturing", "Services", "Other"]


def _make_gst(idx: int) -> str:
    """Generate a unique 29-character alphanumeric GST number."""
    base = f"27AABCU{idx:04d}R1ZM"
    return (base + "0" * 29)[:29].upper()


VENDOR_SEED = [
    ("Infra Supplies Pvt Ltd", "Construction", "Active", "Verified", "Rajesh Kumar", "rajesh@infrasupplies.com", "+91 9876543210"),
    ("TechCorp Solutions", "IT", "Active", "Verified", "Priya Sharma", "contact@techcorp.com", "+91 9123456780"),
    ("Premier Logistics", "Logistics", "Active", "Verified", "Amit Patel", "ops@premierlogistics.com", "+91 9988776655"),
    ("BuildRight Materials", "Construction", "Active", "Verified", "Suresh Reddy", "sales@buildright.com", "+91 9876501234"),
    ("DataStream IT", "IT", "Active", "Verified", "Neha Gupta", "hello@datastream.io", "+91 9012345678"),
    ("Metro Freight", "Logistics", "Active", "Verified", "Vikram Singh", "dispatch@metrofreight.com", "+91 8899001122"),
    ("SteelWorks Ltd", "Manufacturing", "Active", "Verified", "Anil Mehta", "orders@steelworks.com", "+91 9765432109"),
    ("CleanPro Services", "Services", "Active", "Pending", "Kavita Nair", "info@cleanpro.com", "+91 9654321098"),
    ("SecureNet Systems", "IT", "Active", "Verified", "Rahul Verma", "support@securenet.com", "+91 9543210987"),
    ("Global Supplies Inc", "Manufacturing", "Active", "Verified", "Deepak Joshi", "procure@globalsupplies.com", "+91 9432109876"),
    ("SwiftLogix", "Logistics", "Active", "Verified", "Meera Iyer", "contact@swiftlogix.com", "+91 9321098765"),
    ("CloudNine Hosting", "IT", "Active", "Expired", "Arjun Malhotra", "admin@cloudnine.io", "+91 9210987654"),
    ("Prime Catering", "Services", "Active", "Verified", "Sunita Rao", "events@primecatering.com", "+91 9109876543"),
    ("Apex Industrial", "Manufacturing", "Active", "Verified", "Harish Choudhury", "sales@apexind.com", "+91 9098765432"),
    ("RouteMaster", "Logistics", "Active", "Verified", "Pooja Desai", "ops@routemaster.com", "+91 8987654321"),
    ("NetSecure Pro", "IT", "Active", "Verified", "Karan Bhatia", "info@netsecurepro.com", "+91 8876543210"),
    ("FacilityFirst", "Services", "Active", "Verified", "Lakshmi Pillai", "hello@facilityfirst.com", "+91 8765432109"),
    ("CargoLink Express", "Logistics", "Active", "Verified", "Mohit Agarwal", "ship@cargolink.com", "+91 8654321098"),
    ("DevOps Dynamics", "IT", "Active", "Verified", "Sanjay Kulkarni", "team@devopsdyn.com", "+91 8543210987"),
    ("EcoClean Products", "Manufacturing", "Active", "Verified", "Ritu Saxena", "sales@ecoclean.com", "+91 8432109876"),
    ("DeskHub Furniture", "Other", "Active", "Pending", "Tarun Menon", "orders@deskhub.com", "+91 8321098765"),
    ("GreenPack Supplies", "Manufacturing", "Pending", "Pending", "Nisha Kapoor", "info@greenpack.com", "+91 8210987654"),
    ("Office Masters", "Other", "Pending", "Pending", "Varun Sethi", "contact@officemasters.com", "+91 8109876543"),
    ("FastShip Co", "Logistics", "Pending", "Pending", "Divya Krishnan", "ops@fastship.com", "+91 8098765432"),
    ("PaperTrail Inc", "Other", "Pending", "Pending", "Gaurav Mishra", "hello@papertrail.com", "+91 7987654321"),
    ("TransGlobal", "Logistics", "Blocked", "Expired", "Shalini Dutta", "blocked@transglobal.com", "+91 7876543210"),
    ("SoftServe IT", "IT", "Blocked", "Expired", "Rohit Banerjee", "blocked@softserve.com", "+91 7765432109"),
    ("BrightOffice Co", "Other", "Blocked", "Pending", "Ananya Ghosh", "blocked@brightoffice.com", "+91 7654321098"),
    ("InkWell Stationery", "Other", "Active", "Verified", "Manish Tiwari", "sales@inkwell.com", "+91 7543210987"),
]


async def seed_vendors():
    """Seed vendor catalog with full schema. Re-seeds if legacy format detected."""
    sample = await vendors_collection.find_one({})
    if sample and "gst_number" in sample and "contact_person" in sample:
        return

    if sample:
        await vendors_collection.delete_many({})

    now = datetime.utcnow()
    vendors = []
    for idx, (name, category, status, kyc, contact, email, phone) in enumerate(VENDOR_SEED, start=1):
        vendors.append({
            "name": name,
            "category": category,
            "gst_number": _make_gst(idx),
            "contact_person": contact,
            "email": email.lower(),
            "phone": phone,
            "status": status,
            "kyc_status": kyc,
            "linked_user_id": None,
            "created_at": now - timedelta(days=idx * 3),
            "updated_at": now,
        })

    await vendors_collection.insert_many(vendors)


async def seed_user_data(user_id: str):
    """Seed procurement data for a user on first dashboard access."""
    await seed_vendors()
    now = datetime.utcnow()

    if await rfqs_collection.count_documents({"created_by": user_id}) == 0:
        rfq_templates = [
            ("Office Supplies Q3 2024", "Sent", 5, 45000, 7),
            ("IT Equipment Procurement", "Received", 8, 280000, 3),
            ("Logistics Services 2024", "Draft", 0, 150000, 14),
            ("Cleaning Materials", "Sent", 12, 22000, 6),
            ("Network Infrastructure Upgrade", "Sent", 6, 520000, 10),
            ("Annual Maintenance Contract", "Received", 4, 180000, 5),
            ("Security Systems Installation", "Draft", 0, 340000, 21),
            ("Employee Wellness Program", "Sent", 3, 95000, 8),
            ("Warehouse Equipment", "Received", 7, 410000, 4),
            ("Marketing Collateral Print", "Sent", 5, 68000, 12),
            ("Cloud Migration Services", "Draft", 0, 890000, 30),
            ("Fleet Vehicle Lease", "Received", 4, 1200000, 6),
        ]
        rfqs = []
        for title, status, vendor_count, amount, days_offset in rfq_templates:
            rfqs.append({
                "title": title,
                "status": status,
                "vendor_count": vendor_count,
                "deadline": (now + timedelta(days=days_offset)).isoformat(),
                "created_by": user_id,
                "amount": amount,
                "created_at": now - timedelta(days=abs(days_offset)),
            })
        await rfqs_collection.insert_many(rfqs)

    if await purchase_orders_collection.count_documents({"created_by": user_id}) == 0:
        po_templates = [
            ("PO-2024-001", "TechCorp Solutions", "Approved", 125000, 10, 2),
            ("PO-2024-002", "Global Supplies Inc", "Pending", 87500, 5, 5),
            ("PO-2024-003", "Premier Logistics", "Approved", 230000, -2, 8),
            ("PO-2024-004", "Office Masters", "Rejected", 45000, 20, 15),
            ("PO-2024-005", "DataStream IT", "Draft", 156000, 25, 1),
            ("PO-2024-006", "BuildRight Materials", "Approved", 98000, 8, 12),
            ("PO-2024-007", "SwiftLogix", "Pending", 312000, 12, 18),
            ("PO-2024-008", "CleanPro Services", "Approved", 54000, -5, 25),
            ("PO-2024-009", "SecureNet Systems", "Draft", 445000, 30, 3),
            ("PO-2024-010", "Metro Freight", "Approved", 178000, 7, 40),
        ]
        pos = []
        for po_number, vendor, status, amount, delivery_offset, created_days_ago in po_templates:
            created = now - timedelta(days=created_days_ago)
            pos.append({
                "po_number": po_number,
                "vendor": vendor,
                "status": status,
                "amount": amount,
                "delivery_date": (now + timedelta(days=delivery_offset)).isoformat(),
                "created_by": user_id,
                "created_at": created,
            })
        await purchase_orders_collection.insert_many(pos)

    if await invoices_collection.count_documents({"created_by": user_id}) == 0:
        invoice_templates = [
            ("INV-2024-0891", "TechCorp Solutions", "PO-2024-001", 125000, "Pending", 15),
            ("INV-2024-0892", "Global Supplies Inc", "PO-2024-002", 87500, "Pending", 8),
            ("INV-2024-0893", "Premier Logistics", "PO-2024-003", 230000, "Paid", -3),
            ("INV-2024-0894", "FastShip Co", "PO-2024-004", 18000, "Overdue", -10),
            ("INV-2024-0895", "DataStream IT", "PO-2024-005", 156000, "Pending", 20),
            ("INV-2024-0896", "BuildRight Materials", "PO-2024-006", 98000, "Paid", -1),
            ("INV-2024-0897", "CleanPro Services", "PO-2024-008", 54000, "Overdue", -7),
        ]
        invoices = []
        for inv_num, vendor, po_num, amount, status, due_offset in invoice_templates:
            invoices.append({
                "invoice_number": inv_num,
                "vendor": vendor,
                "po_number": po_num,
                "amount": amount,
                "status": status,
                "due_date": (now + timedelta(days=due_offset)).isoformat(),
                "created_by": user_id,
                "created_at": now - timedelta(days=abs(due_offset) + 5),
            })
        await invoices_collection.insert_many(invoices)

    if await approvals_collection.count_documents({"requested_by": user_id}) == 0:
        approvals = [
            {"title": "PO Approval: IT Equipment", "type": "Purchase Order", "amount": 280000, "status": "Pending", "priority": "High", "requested_by": user_id, "created_at": now - timedelta(days=1)},
            {"title": "Invoice Review: INV-2024-0891", "type": "Invoice", "amount": 125000, "status": "Pending", "priority": "Medium", "requested_by": user_id, "created_at": now - timedelta(days=2)},
            {"title": "Vendor Registration: SwiftLogix", "type": "Vendor", "amount": 0, "status": "Pending", "priority": "Low", "requested_by": user_id, "created_at": now - timedelta(days=3)},
            {"title": "PO Approval: Warehouse Equipment", "type": "Purchase Order", "amount": 410000, "status": "Pending", "priority": "High", "requested_by": user_id, "created_at": now - timedelta(days=1)},
            {"title": "Budget Override: Cloud Migration", "type": "Budget", "amount": 890000, "status": "Pending", "priority": "Critical", "requested_by": user_id, "created_at": now},
        ]
        await approvals_collection.insert_many(approvals)