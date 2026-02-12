"""
Settings API routes – read/write persistent app settings.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services import settings

router = APIRouter()


class UpdateSettingsRequest(BaseModel):
    root_dir: Optional[str] = None


@router.get("/settings")
def get_settings():
    return settings.get_all()


@router.put("/settings")
def update_settings(body: UpdateSettingsRequest):
    if body.root_dir is not None:
        import os
        path = os.path.abspath(body.root_dir)
        os.makedirs(path, exist_ok=True)
        settings.set_root_dir(path)
    return settings.get_all()
