import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


class _AuditEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return str(o)
        if isinstance(o, uuid.UUID):
            return str(o)
        return super().default(o)


def _sanitize_changes(data: Any) -> Any:
    """Convert non-JSON-serializable types in changes dict."""
    if isinstance(data, dict):
        return {k: _sanitize_changes(v) for k, v in data.items()}
    if isinstance(data, list):
        return [_sanitize_changes(v) for v in data]
    if isinstance(data, Decimal):
        return str(data)
    if isinstance(data, uuid.UUID):
        return str(data)
    if isinstance(data, (date, datetime)):
        return data.isoformat()
    return data


async def create_audit_log(
    db: AsyncSession,
    user_id: Optional[uuid.UUID],
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    changes: Optional[dict[str, Any]] = None,
    ip_address: Optional[str] = None
):
    """Create an audit log entry."""
    audit = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        changes=_sanitize_changes(changes) if changes else None,
        ip_address=ip_address
    )
    db.add(audit)
    await db.commit()


def get_client_ip(request: Request) -> str:
    """Get client IP address from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_entity_changes(old_data: dict, new_data: dict) -> dict:
    """Calculate diff between old and new data."""
    changes = {}
    all_keys = set(old_data.keys()) | set(new_data.keys())
    
    for key in all_keys:
        old_val = old_data.get(key)
        new_val = new_data.get(key)
        
        # Skip unchanged values
        if old_val == new_val:
            continue
        
        # Skip internal fields
        if key in ("password_hash", "updated_at"):
            continue
        
        changes[key] = {
            "old": str(old_val) if old_val is not None else None,
            "new": str(new_val) if new_val is not None else None
        }
    
    return changes
