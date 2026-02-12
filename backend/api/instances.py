"""
Instance management API routes – list, create, import, delete, set active.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services import instances as inst_svc
from services import settings

router = APIRouter()


class CreateInstanceRequest(BaseModel):
    name: str


class ImportInstanceRequest(BaseModel):
    name: str
    source_path: str


class SetActiveRequest(BaseModel):
    name: str


@router.get("")
def list_instances():
    return inst_svc.list_instances()


@router.post("")
def create_instance(body: CreateInstanceRequest):
    try:
        result = inst_svc.create_instance(body.name)
        # Auto-activate the new instance
        settings.set_active_instance(body.name)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/import")
def import_instance(body: ImportInstanceRequest):
    try:
        result = inst_svc.import_instance(body.name, body.source_path)
        settings.set_active_instance(body.name)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{name}")
def delete_instance(name: str):
    try:
        inst_svc.delete_instance(name)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/active")
def set_active_instance(body: SetActiveRequest):
    root = settings.get_root_dir()
    if not root:
        raise HTTPException(status_code=400, detail="Root directory not configured")

    import os
    inst_dir = os.path.join(root, body.name)
    if not os.path.isdir(inst_dir):
        raise HTTPException(status_code=404, detail=f"Instance '{body.name}' not found")

    settings.set_active_instance(body.name)
    return {"ok": True, "active_instance": body.name}
