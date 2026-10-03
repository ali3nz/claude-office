"""API routes for the shared office layout (issue 246 follow-up).

The edit-mode arrangement (per-object overrides + inserted sprites + the
selected room/area) used to live only in each browser's localStorage, so the
homepage embed - served through the embed proxy on a different origin - showed
a different office than the operator's desktop. The layout is now stored
server-side; every viewer loads it and publishes its own edits (last write
wins by timestamp).
"""

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import UserPreference

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/layout", tags=["layout"])

# Preference key holding the shared layout JSON.
LAYOUT_KEY = "office_layout"
# Safety cap: a layout is a small object map; anything bigger is a bug.
MAX_LAYOUT_BYTES = 512 * 1024


class LayoutBody(BaseModel):
    """Request body for publishing a layout."""

    layout: dict[str, object] | None = None


@router.get("")
async def get_layout(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Return the shared office layout, or null when none was published."""
    result = await db.execute(
        select(UserPreference).where(UserPreference.key == LAYOUT_KEY)
    )
    pref = result.scalar_one_or_none()
    if pref is None or not pref.value:
        return {"layout": None}
    try:
        return {"layout": json.loads(pref.value)}
    except (TypeError, ValueError):
        logger.warning("Stored office layout is not valid JSON; ignoring it")
        return {"layout": None}


@router.put("")
async def put_layout(
    body: LayoutBody,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Store the shared office layout (last write wins across devices)."""
    payload = json.dumps(body.layout or {}, separators=(",", ":"))
    if len(payload.encode("utf-8")) > MAX_LAYOUT_BYTES:
        raise HTTPException(status_code=413, detail="Layout too large")
    try:
        result = await db.execute(
            select(UserPreference).where(UserPreference.key == LAYOUT_KEY)
        )
        pref = result.scalar_one_or_none()
        if pref:
            pref.value = payload
        else:
            db.add(UserPreference(key=LAYOUT_KEY, value=payload))
        await db.commit()
        return {"ok": True}
    except Exception as e:
        await db.rollback()
        logger.exception("Error storing office layout: %s", e)
        raise HTTPException(status_code=500, detail="Failed to store layout") from e
