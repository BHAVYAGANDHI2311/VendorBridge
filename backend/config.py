import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "vendorbridge_db")
SECRET_KEY = os.getenv("SECRET_KEY", "vendorbridge-super-secret-key")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))

client = AsyncIOMotorClient(MONGODB_URL)
db = client[DATABASE_NAME]

# Collections
users_collection = db["users"]
vendors_collection = db["vendors"]
rfqs_collection = db["rfqs"]
purchase_orders_collection = db["purchase_orders"]
invoices_collection = db["invoices"]
approvals_collection = db["approvals"]
