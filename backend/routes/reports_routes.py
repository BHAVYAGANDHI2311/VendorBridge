"""Reports & analytics routes — procurement insights from MongoDB aggregations."""

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from auth import get_current_active_user
from services.reports_service import (
    require_report_access,
    resolve_month_year,
    get_stats,
    get_spend_by_category,
    get_top_vendors,
    get_monthly_trend,
    build_export_rows,
    month_label,
)

router = APIRouter(prefix="/reports", tags=["Reports"])


def _parse_period(month: Optional[int], year: Optional[int]):
    m, y = resolve_month_year(month, year)
    return m, y


@router.get("/stats")
async def report_stats(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    current_user=Depends(get_current_active_user),
):
    require_report_access(current_user)
    m, y = _parse_period(month, year)
    return await get_stats(m, y)


@router.get("/spend-by-category")
async def report_spend_by_category(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    current_user=Depends(get_current_active_user),
):
    require_report_access(current_user)
    m, y = _parse_period(month, year)
    items = await get_spend_by_category(m, y)
    return {"items": items, "month": m, "year": y}


@router.get("/top-vendors")
async def report_top_vendors(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    limit: int = Query(10, ge=1, le=25),
    current_user=Depends(get_current_active_user),
):
    require_report_access(current_user)
    m, y = _parse_period(month, year)
    items = await get_top_vendors(m, y, limit)
    return {"items": items, "month": m, "year": y}


@router.get("/monthly-trend")
async def report_monthly_trend(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    current_user=Depends(get_current_active_user),
):
    """Last 6 months of paid PO spend, ending at the selected month."""
    require_report_access(current_user)
    m, y = _parse_period(month, year)
    items = await get_monthly_trend(m, y, 6)
    return {"items": items, "month": m, "year": y}


@router.get("/export")
async def export_report(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    current_user=Depends(get_current_active_user),
):
    require_report_access(current_user)
    m, y = _parse_period(month, year)
    rows = await build_export_rows(m, y)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Type", "Reference", "Vendor", "Category", "Amount", "Status", "Date"])

    for row in rows:
        date_val = row.get("date")
        if isinstance(date_val, datetime):
            date_str = date_val.strftime("%Y-%m-%d %H:%M")
        else:
            date_str = str(date_val or "")
        writer.writerow([
            row.get("record_type", ""),
            row.get("reference", ""),
            row.get("vendor", ""),
            row.get("category", ""),
            row.get("amount", ""),
            row.get("status", ""),
            date_str,
        ])

    filename = f"vendorbridge-report-{month_label(y, m).lower()}-{y}.csv"
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
