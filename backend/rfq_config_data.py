"""Seed RFQ-related reference data and app configuration into MongoDB."""

from datetime import datetime
from config import categories_collection, units_collection, app_config_collection

RFQ_CONFIG_DOC = {
    "_id": "rfq_settings",
    "validation": {
        "min_title_length": 3,
        "max_title_length": 200,
        "max_description_length": 2000,
        "min_deadline_hours_ahead": 24,
        "title_pattern": r"^[a-zA-Z0-9\s\-.,()&'/]+$",
        "min_line_items": 1,
        "min_qty": 0.01,
        "min_vendors_on_send": 1,
    },
    "file_upload": {
        "allowed_mime_types": [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
        "allowed_extensions": [".pdf", ".png", ".jpg", ".jpeg", ".docx", ".xlsx"],
        "max_file_size_bytes": 5242880,
        "max_total_files": 5,
    },
    "statuses": {
        "DRAFT": "Draft",
        "OPEN": "Sent",
        "CLOSED": "Closed",
    },
    "wizard_steps": [
        {"id": 1, "key": "basic_info", "label": "Fill RFQ details"},
        {"id": 2, "key": "line_items", "label": "Assign Vendors"},
        {"id": 3, "key": "review_send", "label": "Review & Submit"},
    ],
    "updated_at": datetime.utcnow(),
}

CATEGORY_SEED = [
    {"name": "Construction", "slug": "construction", "is_active": True},
    {"name": "IT & Technology", "slug": "it-technology", "is_active": True},
    {"name": "Logistics", "slug": "logistics", "is_active": True},
    {"name": "Manufacturing", "slug": "manufacturing", "is_active": True},
    {"name": "Office Supplies", "slug": "office-supplies", "is_active": True},
    {"name": "Services", "slug": "services", "is_active": True},
    {"name": "Facilities", "slug": "facilities", "is_active": True},
    {"name": "Other", "slug": "other", "is_active": True},
]

UNIT_SEED = [
    {"code": "NOS", "label": "Numbers (NOS)", "is_active": True},
    {"code": "KGS", "label": "Kilograms (KGS)", "is_active": True},
    {"code": "LTR", "label": "Litres (LTR)", "is_active": True},
    {"code": "MTR", "label": "Metres (MTR)", "is_active": True},
    {"code": "BOX", "label": "Boxes (BOX)", "is_active": True},
    {"code": "SET", "label": "Sets (SET)", "is_active": True},
    {"code": "PKT", "label": "Packets (PKT)", "is_active": True},
    {"code": "HRS", "label": "Hours (HRS)", "is_active": True},
]


async def seed_rfq_reference_data():
    if await app_config_collection.count_documents({"_id": "rfq_settings"}) == 0:
        await app_config_collection.insert_one(RFQ_CONFIG_DOC)
    else:
        await app_config_collection.update_one(
            {"_id": "rfq_settings"},
            {"$set": {k: v for k, v in RFQ_CONFIG_DOC.items() if k != "_id"}},
        )

    if await categories_collection.count_documents({}) == 0:
        now = datetime.utcnow()
        await categories_collection.insert_many([
            {**c, "created_at": now} for c in CATEGORY_SEED
        ])

    if await units_collection.count_documents({}) == 0:
        now = datetime.utcnow()
        await units_collection.insert_many([
            {**u, "created_at": now} for u in UNIT_SEED
        ])


async def get_rfq_config():
    await seed_rfq_reference_data()
    doc = await app_config_collection.find_one({"_id": "rfq_settings"})
    if not doc:
        return RFQ_CONFIG_DOC
    doc.pop("_id", None)
    return doc
