"""Role-based access control — single source of truth for VendorBridge."""

from utils.errors import api_error

ADMIN = "Admin"
PROCUREMENT = "Procurement Officer"
MANAGER = "Manager"
VENDOR = "Vendor"

STAFF_ROLES = frozenset({ADMIN, PROCUREMENT, MANAGER})

# Page / feature access (matches product matrix)
VENDORS_VIEW = frozenset({ADMIN, PROCUREMENT})
VENDORS_WRITE = frozenset({ADMIN, PROCUREMENT})
RFQS_STAFF = frozenset({ADMIN, PROCUREMENT, MANAGER})
QUOTATIONS_COMPARE = frozenset({ADMIN, PROCUREMENT, MANAGER})
APPROVALS_ACCESS = frozenset({ADMIN, MANAGER})
PO_STAFF_WRITE = frozenset({ADMIN, PROCUREMENT, MANAGER})
INVOICES_ACCESS = frozenset({ADMIN, PROCUREMENT, MANAGER})
REPORTS_ACCESS = frozenset({ADMIN, PROCUREMENT, MANAGER})
ACTIVITY_ACCESS = frozenset({ADMIN, PROCUREMENT, MANAGER})
RFQ_CREATE = frozenset({ADMIN, PROCUREMENT})


def require_roles(user: dict, roles: frozenset, message: str = "Access denied."):
    if user.get("role") not in roles:
        api_error("FORBIDDEN", message, status_code=403)


def is_vendor_user(user: dict) -> bool:
    return user.get("role") == VENDOR


def can_read_all_vendors(user: dict) -> bool:
    return user.get("role") in VENDORS_VIEW


def require_write_role(user: dict, resource: str = "this resource"):
    if user.get("role") not in VENDORS_WRITE:
        api_error("FORBIDDEN", f"You do not have permission to modify {resource}.", status_code=403)


def can_compare_quotations(user: dict) -> bool:
    return user.get("role") in QUOTATIONS_COMPARE


def can_access_approvals(user: dict) -> bool:
    return user.get("role") in APPROVALS_ACCESS


def can_access_reports(user: dict) -> bool:
    return user.get("role") in REPORTS_ACCESS


def can_access_activity(user: dict) -> bool:
    return user.get("role") in ACTIVITY_ACCESS


def can_access_invoices(user: dict) -> bool:
    return user.get("role") in INVOICES_ACCESS


def can_write_po(user: dict) -> bool:
    return user.get("role") in PO_STAFF_WRITE


def require_po_write(user: dict):
    require_roles(user, PO_STAFF_WRITE, "You do not have permission to modify purchase orders.")


def require_invoice_access(user: dict):
    require_roles(user, INVOICES_ACCESS, "You do not have permission to access invoices.")


def require_approval_access(user: dict):
    require_roles(user, APPROVALS_ACCESS, "You do not have permission to access approvals.")


def require_comparison_role(user: dict):
    require_roles(user, QUOTATIONS_COMPARE, "Only authorized staff can compare quotations.")


def require_report_access(user: dict):
    require_roles(user, REPORTS_ACCESS, "You do not have permission to view reports.")


def require_activity_access(user: dict):
    require_roles(user, ACTIVITY_ACCESS, "You do not have permission to view the audit trail.")
