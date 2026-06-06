from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "Admin"
    PROCUREMENT_OFFICER = "Procurement Officer"
    VENDOR = "Vendor"
    MANAGER = "Manager"


# ─── Auth Models ────────────────────────────────────────────────────────────

class UserSignup(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.PROCUREMENT_OFFICER
    company: Optional[str] = None
    gstin: Optional[str] = None
    phone: Optional[str] = None

    @model_validator(mode='after')
    def check_vendor_fields(self):
        if self.role == UserRole.VENDOR:
            if not self.company or not self.company.strip():
                raise ValueError("Company is required for Vendor role")
            if not self.gstin or not self.gstin.strip():
                raise ValueError("GSTIN is required for Vendor role")
        return self


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    role: Optional[UserRole] = None


class ForgotPassword(BaseModel):
    email: EmailStr


class ResetPassword(BaseModel):
    token: str
    new_password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class TokenData(BaseModel):
    email: Optional[str] = None


# ─── User Response ────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    company: Optional[str] = None
    gstin: Optional[str] = None
    is_active: bool
    created_at: datetime


# ─── Dashboard Models ────────────────────────────────────────────────────

class RFQStatus(str, Enum):
    DRAFT = "Draft"
    SENT = "Sent"
    RECEIVED = "Received"
    CLOSED = "Closed"


class POStatus(str, Enum):
    DRAFT = "Draft"
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    DELIVERED = "Delivered"


class InvoiceStatus(str, Enum):
    DRAFT = "Draft"
    SUBMITTED = "Submitted"
    APPROVED = "Approved"
    PAID = "Paid"
    OVERDUE = "Overdue"


class ApprovalStatus(str, Enum):
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"


class AnalyticsData(BaseModel):
    total_vendors: int
    active_rfqs: int
    pending_approvals: int
    total_po_value: float
    monthly_spend: List[dict]
    top_categories: List[dict]


class DashboardStats(BaseModel):
    pending_approvals: int
    active_rfqs: int
    total_purchase_orders: int
    total_invoices: int
    monthly_spend: float
    savings_percentage: float
    on_time_delivery: float
    vendor_count: int
