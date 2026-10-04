"""API routes for the current and named shared office layouts."""

import json
import logging
import unicodedata
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import UserPreference

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/layout", tags=["layout"])

# Preference keys holding the current shared layout and the named snapshots.
LAYOUT_KEY = "office_layout"
SAVED_LAYOUTS_KEY = "office_saved_layouts"
# Bound each snapshot and the collection stored in the preferences table.
MAX_LAYOUT_BYTES = 512 * 1024
MAX_SAVED_LAYOUTS = 100
MAX_SAVED_LAYOUTS_BYTES = 5 * 1024 * 1024
MAX_LAYOUT_NAME_LENGTH = 64


class LayoutBody(BaseModel):
    """Request body for publishing the current layout."""

    layout: dict[str, object] | None = None


class EntityOverrideBody(BaseModel):
    """One optional edit applied to a built-in office entity."""

    x: float | None = Field(default=None, ge=20, le=1260, allow_inf_nan=False)
    y: float | None = Field(default=None, ge=20, le=1004, allow_inf_nan=False)
    turn: int | None = Field(default=None, ge=0, le=19)
    hidden: bool | None = None
    avatar: str | None = Field(default=None, max_length=128)


class InsertedSpriteBody(BaseModel):
    """An inserted sprite in the current SharedLayout contract."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1, max_length=128)
    sprite_path: str = Field(alias="spritePath", min_length=1, max_length=512)
    name: str = Field(min_length=1, max_length=128)
    x: float = Field(ge=20, le=1260, allow_inf_nan=False)
    y: float = Field(ge=20, le=1004, allow_inf_nan=False)
    turn: int | None = Field(default=None, ge=0, le=19)

    @field_validator("sprite_path")
    @classmethod
    def validate_sprite_path(cls, value: str) -> str:
        """Only persist paths that resolve inside the office's sprite tree."""
        if (
            not value.startswith("/sprites/")
            or "%" in value
            or "\\" in value
            or "?" in value
            or "#" in value
            or ".." in value.split("/")
        ):
            raise ValueError("spritePath must be a local /sprites/ path")
        return value


class SharedLayoutBody(BaseModel):
    """Validated snapshot saved by name and later applied to all viewers."""

    model_config = ConfigDict(populate_by_name=True)

    version: Literal[1]
    updated_at: int = Field(alias="updatedAt", ge=0)
    overrides: dict[str, EntityOverrideBody] = Field(default_factory=dict, max_length=10000)
    inserted: list[InsertedSpriteBody] = Field(default_factory=list, max_length=1000)
    area: str | None = Field(default=None, max_length=128)

    @field_validator("overrides")
    @classmethod
    def validate_override_ids(
        cls, value: dict[str, EntityOverrideBody]
    ) -> dict[str, EntityOverrideBody]:
        if any(not key or len(key) > 128 for key in value):
            raise ValueError("override ids must contain 1 to 128 characters")
        return value


def _normalize_layout_name(name: str) -> str:
    """Normalize and bound a user-visible layout name."""
    normalized = unicodedata.normalize("NFC", name).strip()
    if (
        not normalized
        or len(normalized) > MAX_LAYOUT_NAME_LENGTH
        or any(ord(char) < 32 or ord(char) == 127 for char in normalized)
        or "/" in normalized
        or "\\" in normalized
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Layout name must be 1-{MAX_LAYOUT_NAME_LENGTH} characters "
                "without path separators"
            ),
        )
    return normalized


async def _read_saved_layouts(db: AsyncSession) -> dict[str, object]:
    result = await db.execute(
        select(UserPreference).where(UserPreference.key == SAVED_LAYOUTS_KEY)
    )
    pref = result.scalar_one_or_none()
    if pref is None or not pref.value:
        return {}
    try:
        saved = json.loads(pref.value)
    except (TypeError, ValueError) as exc:
        logger.exception("Stored named office layouts are not valid JSON")
        raise HTTPException(status_code=500, detail="Saved layouts are unreadable") from exc
    if not isinstance(saved, dict):
        logger.error("Stored named office layouts are not a JSON object")
        raise HTTPException(status_code=500, detail="Saved layouts are unreadable")
    return saved


async def _save_saved_layouts(db: AsyncSession, saved: dict[str, object]) -> None:
    payload = json.dumps(saved, separators=(",", ":"), ensure_ascii=False)
    if len(payload.encode("utf-8")) > MAX_SAVED_LAYOUTS_BYTES:
        raise HTTPException(status_code=413, detail="Saved layouts are too large")

    result = await db.execute(
        select(UserPreference).where(UserPreference.key == SAVED_LAYOUTS_KEY)
    )
    pref = result.scalar_one_or_none()
    if pref:
        pref.value = payload
    else:
        db.add(UserPreference(key=SAVED_LAYOUTS_KEY, value=payload))
    await db.commit()


@router.get("")
async def get_layout(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Return the shared current office layout, or null when none was published."""
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
    """Store the shared current office layout (last write wins across devices)."""
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


@router.get("/saved")
async def list_saved_layouts(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, list[dict[str, str | int]]]:
    """List the server-saved layout names and their save timestamps."""
    saved = await _read_saved_layouts(db)
    layouts: list[dict[str, str | int]] = []
    for name, entry in saved.items():
        if not isinstance(entry, dict) or not isinstance(entry.get("savedAt"), int):
            logger.error("Stored named office layout metadata is invalid")
            raise HTTPException(status_code=500, detail="Saved layouts are unreadable")
        layouts.append({"name": name, "savedAt": entry["savedAt"]})
    layouts.sort(key=lambda item: str(item["name"]).casefold())
    return {"layouts": layouts}


@router.get("/saved/{name}")
async def get_saved_layout(
    name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Return one complete named layout snapshot."""
    normalized = _normalize_layout_name(name)
    saved = await _read_saved_layouts(db)
    entry = saved.get(normalized)
    if not isinstance(entry, dict) or not isinstance(entry.get("layout"), dict):
        raise HTTPException(status_code=404, detail="Saved layout not found")
    try:
        layout = SharedLayoutBody.model_validate(entry["layout"])
    except ValidationError as exc:
        logger.exception("Stored named office layout is invalid: %s", normalized)
        raise HTTPException(status_code=500, detail="Saved layout is unreadable") from exc
    saved_at = entry.get("savedAt")
    if not isinstance(saved_at, int):
        raise HTTPException(status_code=500, detail="Saved layout is unreadable")
    return {
        "name": normalized,
        "savedAt": saved_at,
        "layout": layout.model_dump(mode="json", by_alias=True, exclude_none=True),
    }


@router.put("/saved/{name}")
async def put_saved_layout(
    name: str,
    body: SharedLayoutBody,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Create or replace a named shared layout snapshot."""
    normalized = _normalize_layout_name(name)
    layout = body.model_dump(mode="json", by_alias=True, exclude_none=True)
    layout_payload = json.dumps(layout, separators=(",", ":"), ensure_ascii=False)
    if len(layout_payload.encode("utf-8")) > MAX_LAYOUT_BYTES:
        raise HTTPException(status_code=413, detail="Layout too large")

    try:
        saved = await _read_saved_layouts(db)
        if normalized not in saved and len(saved) >= MAX_SAVED_LAYOUTS:
            raise HTTPException(status_code=409, detail="Too many saved layouts")
        saved_at = int(datetime.now(UTC).timestamp() * 1000)
        saved[normalized] = {"savedAt": saved_at, "layout": layout}
        await _save_saved_layouts(db, saved)
        return {"ok": True, "name": normalized, "savedAt": saved_at}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Error storing named office layout: %s", normalized)
        raise HTTPException(status_code=500, detail="Failed to store saved layout") from exc
