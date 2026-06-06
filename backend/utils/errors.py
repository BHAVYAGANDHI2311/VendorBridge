from fastapi import HTTPException
from typing import Optional


def api_error(code: str, message: str, field: Optional[str] = None, status_code: int = 400):
    detail = {"code": code, "message": message}
    if field:
        detail["field"] = field
    raise HTTPException(status_code=status_code, detail=detail)
