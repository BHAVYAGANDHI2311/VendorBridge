"""MongoDB seed data for VendorBridge ERP — all demo data lives in the database."""

import os
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
    """Optional demo vendor catalog — only when SEED_DEMO_DATA=true in environment."""
    if os.getenv("SEED_DEMO_DATA", "").lower() not in ("1", "true", "yes"):
        return

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


# seed_user_data removed — dashboard and lists use only real records created in-app.