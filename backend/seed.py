"""MongoDB seed data for VendorBridge ERP — all demo data lives in the database."""

from datetime import datetime, timedelta
from config import (
    vendors_collection,
    rfqs_collection,
    purchase_orders_collection,
    invoices_collection,
    approvals_collection,
)


async def seed_vendors():
    """Seed global vendor catalog once."""
    if await vendors_collection.count_documents({}) > 0:
        return

    vendors = [
        {"name": "TechCorp Solutions", "category": "IT & Technology", "status": "Active", "rating": 4.8, "created_at": datetime.utcnow()},
        {"name": "Global Supplies Inc", "category": "Office Supplies", "status": "Active", "rating": 4.5, "created_at": datetime.utcnow()},
        {"name": "Premier Logistics", "category": "Logistics", "status": "Active", "rating": 4.7, "created_at": datetime.utcnow()},
        {"name": "Office Masters", "category": "Office Supplies", "status": "Active", "rating": 4.2, "created_at": datetime.utcnow()},
        {"name": "FastShip Co", "category": "Logistics", "status": "Active", "rating": 4.0, "created_at": datetime.utcnow()},
        {"name": "SwiftLogix", "category": "Logistics", "status": "Active", "rating": 4.6, "created_at": datetime.utcnow()},
        {"name": "BuildRight Materials", "category": "Facilities", "status": "Active", "rating": 4.3, "created_at": datetime.utcnow()},
        {"name": "CleanPro Services", "category": "Facilities", "status": "Active", "rating": 4.4, "created_at": datetime.utcnow()},
        {"name": "DataStream IT", "category": "IT & Technology", "status": "Active", "rating": 4.9, "created_at": datetime.utcnow()},
        {"name": "GreenPack Supplies", "category": "Office Supplies", "status": "Active", "rating": 4.1, "created_at": datetime.utcnow()},
        {"name": "Metro Freight", "category": "Logistics", "status": "Active", "rating": 4.5, "created_at": datetime.utcnow()},
        {"name": "SecureNet Systems", "category": "IT & Technology", "status": "Active", "rating": 4.7, "created_at": datetime.utcnow()},
        {"name": "Apex Industrial", "category": "Facilities", "status": "Active", "rating": 4.0, "created_at": datetime.utcnow()},
        {"name": "BrightOffice Co", "category": "Office Supplies", "status": "Active", "rating": 4.3, "created_at": datetime.utcnow()},
        {"name": "CloudNine Hosting", "category": "IT & Technology", "status": "Active", "rating": 4.6, "created_at": datetime.utcnow()},
        {"name": "Prime Catering", "category": "Facilities", "status": "Active", "rating": 4.2, "created_at": datetime.utcnow()},
        {"name": "SteelWorks Ltd", "category": "Facilities", "status": "Active", "rating": 4.4, "created_at": datetime.utcnow()},
        {"name": "PaperTrail Inc", "category": "Office Supplies", "status": "Active", "rating": 4.1, "created_at": datetime.utcnow()},
        {"name": "RouteMaster", "category": "Logistics", "status": "Active", "rating": 4.5, "created_at": datetime.utcnow()},
        {"name": "NetSecure Pro", "category": "IT & Technology", "status": "Active", "rating": 4.8, "created_at": datetime.utcnow()},
        {"name": "EcoClean Products", "category": "Facilities", "status": "Active", "rating": 4.0, "created_at": datetime.utcnow()},
        {"name": "DeskHub Furniture", "category": "Office Supplies", "status": "Active", "rating": 4.3, "created_at": datetime.utcnow()},
        {"name": "TransGlobal", "category": "Logistics", "status": "Active", "rating": 4.6, "created_at": datetime.utcnow()},
        {"name": "SoftServe IT", "category": "IT & Technology", "status": "Active", "rating": 4.5, "created_at": datetime.utcnow()},
        {"name": "FacilityFirst", "category": "Facilities", "status": "Active", "rating": 4.2, "created_at": datetime.utcnow()},
        {"name": "InkWell Stationery", "category": "Office Supplies", "status": "Active", "rating": 4.1, "created_at": datetime.utcnow()},
        {"name": "CargoLink Express", "category": "Logistics", "status": "Active", "rating": 4.7, "created_at": datetime.utcnow()},
        {"name": "DevOps Dynamics", "category": "IT & Technology", "status": "Active", "rating": 4.9, "created_at": datetime.utcnow()},
    ]
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
