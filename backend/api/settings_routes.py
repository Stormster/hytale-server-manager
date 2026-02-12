"""
Settings API routes – read/write persistent app settings.
"""

import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services import settings

router = APIRouter()


def get_default_root_dir() -> str:
    """Return the default servers root folder: Documents/Hytale Servers."""
    base = os.environ.get("USERPROFILE", os.path.expanduser("~"))
    return os.path.join(base, "Documents", "Hytale Servers")


class UpdateSettingsRequest(BaseModel):
    root_dir: Optional[str] = None


@router.get("/settings")
def get_settings():
    data = settings.get_all()
    data["default_root_dir"] = get_default_root_dir()
    return data


@router.put("/settings")
def update_settings(body: UpdateSettingsRequest):
    if body.root_dir is not None:
        path = os.path.abspath(body.root_dir)
        os.makedirs(path, exist_ok=True)
        settings.set_root_dir(path)
    return settings.get_all()
