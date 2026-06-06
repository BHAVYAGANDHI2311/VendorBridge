from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from routes.auth_routes import router as auth_router
from routes.dashboard_routes import router as dashboard_router
from routes.vendor_routes import router as vendor_router
from routes.rfq_routes import router as rfq_router
from routes.quotation_routes import router as quotation_router
from config import vendors_collection

app = FastAPI(
    title="VendorBridge ERP API",
    description="Centralized Procurement Management System",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS — allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(vendor_router, prefix="/api")
app.include_router(rfq_router, prefix="/api")
app.include_router(quotation_router, prefix="/api")


@app.on_event("startup")
async def ensure_indexes():
    from seed import seed_vendors
    from rfq_config_data import seed_rfq_reference_data
    await seed_vendors()
    await seed_rfq_reference_data()
    await vendors_collection.create_index("email", unique=True)
    await vendors_collection.create_index("gst_number", unique=True)
    await vendors_collection.create_index("status")
    await vendors_collection.create_index([("name", 1)])
    await vendors_collection.create_index([("category", 1)])


@app.get("/")
async def root():
    return {
        "message": "VendorBridge ERP API is running",
        "version": "1.0.0",
        "docs": "/api/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "VendorBridge ERP"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
