"""
Config files API routes – read/write server JSON configs, view logs.
"""

import json
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import SERVER_DIR
from utils.paths import resolve_instance

router = APIRouter()

_ALLOWED_FILES = {"config.json", "whitelist.json", "bans.json"}


class SaveConfigRequest(BaseModel):
    content: str


@router.get("/{filename}")
def read_config(filename: str):
    if filename not in _ALLOWED_FILES:
        raise HTTPException(status_code=400, detail=f"File not allowed: {filename}")

    path = os.path.join(resolve_instance(SERVER_DIR), filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"{filename} not found")

    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        # Pretty-print JSON
        try:
            parsed = json.loads(content)
            content = json.dumps(parsed, indent=2, ensure_ascii=False)
        except json.JSONDecodeError:
            pass
        return {"content": content}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/{filename}")
def save_config(filename: str, body: SaveConfigRequest):
    if filename not in _ALLOWED_FILES:
        raise HTTPException(status_code=400, detail=f"File not allowed: {filename}")

    path = os.path.join(resolve_instance(SERVER_DIR), filename)

    # Validate JSON
    try:
        parsed = json.loads(body.content)
        content = json.dumps(parsed, indent=2, ensure_ascii=False)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}")

    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/latest-log")
def latest_log():
    log_dir = os.path.join(resolve_instance(SERVER_DIR), "logs")
    if not os.path.isdir(log_dir):
        raise HTTPException(status_code=404, detail="No logs directory found")

    logs = sorted(
        [f for f in os.listdir(log_dir) if f.endswith(".log")],
        key=lambda f: os.path.getmtime(os.path.join(log_dir, f)),
        reverse=True,
    )
    if not logs:
        raise HTTPException(status_code=404, detail="No log files found")

    log_path = os.path.join(log_dir, logs[0])
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        return {"filename": logs[0], "content": content}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
