import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "vendorbridge_db")
SECRET_KEY = os.getenv("SECRET_KEY", "vendorbridge-super-secret-key")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))

# SMTP — required for real invoice emails (sent to logged-in user's email)
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "") or SMTP_USER
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")

client = AsyncIOMotorClient(MONGODB_URL)
db = client[DATABASE_NAME]

# Collections
users_collection = db["users"]
vendors_collection = db["vendors"]
rfqs_collection = db["rfqs"]
purchase_orders_collection = db["purchase_orders"]
invoices_collection = db["invoices"]
approvals_collection = db["approvals"]
quotations_collection = db["quotations"]
categories_collection = db["categories"]
units_collection = db["units"]
app_config_collection = db["app_config"]
activity_logs_collection = db["activity_logs"]

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads", "rfq")
os.makedirs(UPLOAD_DIR, exist_ok=True)
