"""
Proxy API for Hytale Remote Management plugin on hosted servers.
"""

from __future__ import annotations

import uuid

import requests
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from services import settings
from utils.secret_redaction import sanitize_remote_connection

router = APIRouter(prefix="/api/remote", tags=["remote"])

_REQUEST_TIMEOUT = 60


def _base_url(conn: dict) -> str:
    return str(conn.get("base_url", "")).rstrip("/")


def _headers(conn: dict) -> dict[str, str]:
    key = str(conn.get("api_key", "")).strip()
    if not key:
        raise HTTPException(400, "Remote connection has no API key")
    return {"X-API-Key": key, "Authorization": f"Bearer {key}"}


def _get_connection(connection_id: str) -> dict:
    conn = settings.get_remote_connection(connection_id)
    if not conn:
        raise HTTPException(404, "Remote connection not found")
    return conn


class RemoteConnectionBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    base_url: str = Field(min_length=8)
    api_key: str = Field(min_length=8)


class RemoteConnectionUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None


class RemoteCommandBody(BaseModel):
    connection_id: str
    command: str = Field(min_length=1, max_length=512)


class RemotePairBody(BaseModel):
    connection_id: str
    code: str = Field(min_length=4, max_length=32)
    pin: str | None = None


def _public_connection(conn: dict) -> dict:
    return sanitize_remote_connection(conn)


@router.get("/connections")
def list_connections():
    return {"connections": [_public_connection(c) for c in settings.get_remote_connections()]}


@router.post("/connections")
def add_connection(body: RemoteConnectionBody):
    conns = settings.get_remote_connections()
    entry = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "base_url": body.base_url.strip().rstrip("/"),
        "api_key": body.api_key.strip(),
    }
    conns.append(entry)
    settings.set_remote_connections(conns)
    return _public_connection(entry)


@router.put("/connections/{connection_id}")
def update_connection(connection_id: str, body: RemoteConnectionUpdate):
    conns = settings.get_remote_connections()
    for c in conns:
        if c.get("id") == connection_id:
            if body.name is not None:
                c["name"] = body.name.strip()
            if body.base_url is not None:
                c["base_url"] = body.base_url.strip().rstrip("/")
            if body.api_key is not None:
                c["api_key"] = body.api_key.strip()
            settings.set_remote_connections(conns)
            return _public_connection(c)
    raise HTTPException(404, "Remote connection not found")


@router.delete("/connections/{connection_id}")
def delete_connection(connection_id: str):
    conns = [c for c in settings.get_remote_connections() if c.get("id") != connection_id]
    settings.set_remote_connections(conns)
    return {"ok": True}


@router.get("/info")
def remote_info(connection_id: str):
    conn = _get_connection(connection_id)
    try:
        r = requests.get(f"{_base_url(conn)}/info", headers=_headers(conn), timeout=15, verify=False)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        raise HTTPException(502, f"Remote info failed: {e}") from e


@router.post("/pair")
def remote_pair(body: RemotePairBody):
    conn = _get_connection(body.connection_id)
    payload: dict = {"code": body.code.strip()}
    if body.pin:
        payload["pin"] = body.pin.strip()
    try:
        r = requests.post(
            f"{_base_url(conn)}/pair",
            json=payload,
            headers={**_headers(conn), "Content-Type": "application/json"},
            timeout=30,
            verify=False,
        )
        if not r.ok:
            raise HTTPException(r.status_code, r.text or "Pairing failed")
        return r.json()
    except HTTPException:
        raise
    except requests.RequestException as e:
        raise HTTPException(502, f"Remote pair failed: {e}") from e


@router.post("/command")
def remote_command(body: RemoteCommandBody):
    conn = _get_connection(body.connection_id)
    try:
        r = requests.post(
            f"{_base_url(conn)}/run-command",
            data=body.command,
            headers={**_headers(conn), "Content-Type": "text/plain"},
            timeout=_REQUEST_TIMEOUT,
            verify=False,
        )
        if r.status_code == 504:
            return r.json()
        if not r.ok:
            raise HTTPException(r.status_code, r.text or "Command failed")
        return r.json()
    except HTTPException:
        raise
    except requests.RequestException as e:
        raise HTTPException(502, f"Remote command failed: {e}") from e


@router.get("/mods/list")
def remote_mods_list(connection_id: str):
    conn = _get_connection(connection_id)
    try:
        r = requests.get(
            f"{_base_url(conn)}/mods/list",
            headers=_headers(conn),
            timeout=30,
            verify=False,
        )
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        raise HTTPException(502, f"Remote mods list failed: {e}") from e


@router.post("/mods/upload")
async def remote_mods_upload(connection_id: str, file: UploadFile = File(...)):
    conn = _get_connection(connection_id)
    content = await file.read()
    try:
        r = requests.post(
            f"{_base_url(conn)}/mods/upload",
            files={"file": (file.filename or "mod.jar", content, "application/java-archive")},
            headers=_headers(conn),
            timeout=120,
            verify=False,
        )
        if not r.ok:
            raise HTTPException(r.status_code, r.text or "Upload failed")
        return r.json()
    except HTTPException:
        raise
    except requests.RequestException as e:
        raise HTTPException(502, f"Remote mod upload failed: {e}") from e
