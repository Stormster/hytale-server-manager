"""
Backups API routes – list, create, restore, delete.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services import backup as bk

router = APIRouter()


class CreateBackupRequest(BaseModel):
    label: Optional[str] = None


@router.get("")
def list_backups():
    entries = bk.list_backups()
    return [entry.to_dict() for entry in entries]


@router.get("/world-snapshots")
def list_world_snapshots():
    """Hytale universe backups (from --backup / /backup), stored in Server/backups/."""
    return bk.list_hytale_world_backups()


@router.get("/world-snapshots-folder")
def get_world_snapshots_folder():
    """Absolute path to Server/backups for opening in explorer."""
    return {"path": bk.get_hytale_world_backups_folder()}


@router.post("/world-snapshots/{filename}/restore")
def restore_world_snapshot(filename: str):
    """Restore a Hytale world backup. Creates pre-restore backup first. Server must be stopped."""
    try:
        bk.restore_hytale_world_backup(filename)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("")
def create_backup(body: CreateBackupRequest):
    try:
        entry = bk.create_backup(label=body.label)
        return entry.to_dict()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{folder_name}/restore")
def restore_backup(folder_name: str):
    entry = bk.find_backup(folder_name)
    if not entry:
        raise HTTPException(status_code=404, detail="Backup not found")
    try:
        bk.restore_backup(entry)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class RenameBackupRequest(BaseModel):
    label: str


@router.put("/{folder_name}/rename")
def rename_backup(folder_name: str, body: RenameBackupRequest):
    entry = bk.find_backup(folder_name)
    if not entry:
        raise HTTPException(status_code=404, detail="Backup not found")
    try:
        bk.rename_backup(entry, body.label)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/{folder_name}")
def delete_backup(folder_name: str):
    entry = bk.find_backup(folder_name)
    if not entry:
        raise HTTPException(status_code=404, detail="Backup not found")
    try:
        bk.delete_backup(entry)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
