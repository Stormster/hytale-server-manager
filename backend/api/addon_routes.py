"""
API for Experimental addon installation and update checks.
Addon is loaded on next app restart.
"""

from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from config import MANAGER_VERSION
from plugin_loader import get_addons_dir
from services import settings as app_settings

router = APIRouter(prefix="/api/addon", tags=["addon"])

SITE_BASE_URL = os.environ.get("HYTALE_MANAGER_SITE_BASE_URL", "https://hytalemanager.com").rstrip("/")
ADDON_FILENAME = "experimental_addon.whl"
ADDON_PLUGIN_ID = "experimental_addon"
DEFAULT_CHANNEL = "stable"
REQUEST_TIMEOUT = 20
DOWNLOAD_TIMEOUT = 60


def _normalize_license_key(override: str | None = None) -> str:
    key = (override or "").strip() or app_settings.get_experimental_addon_license_key().strip()
    if not key:
        raise HTTPException(400, "Missing license key")
    return key


def _site_error_to_http(res: requests.Response) -> HTTPException:
    try:
        data = res.json()
    except Exception:
        data = {}
    msg = data.get("error") or data.get("detail") or f"Site request failed (HTTP {res.status_code})"
    code = res.status_code if res.status_code in (400, 401, 429) else 502
    return HTTPException(code, msg)


def _request_site_json(path: str, *, params: dict | None = None, headers: dict | None = None) -> dict:
    url = f"{SITE_BASE_URL}{path}"
    try:
        res = requests.get(url, params=params, headers=headers or {}, timeout=REQUEST_TIMEOUT)
    except Exception as e:
        raise HTTPException(502, f"Failed to contact update service: {e}") from e
    if not res.ok:
        raise _site_error_to_http(res)
    try:
        return res.json()
    except Exception as e:
        raise HTTPException(502, f"Update service returned invalid JSON: {e}") from e


def _assert_https(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme.lower() != "https":
        raise HTTPException(502, "Refusing non-HTTPS addon download URL")


def _download_with_sha256(download_url: str, target: Path) -> str:
    _assert_https(download_url)
    h = hashlib.sha256()
    try:
        with requests.get(download_url, stream=True, timeout=DOWNLOAD_TIMEOUT) as res:
            if not res.ok:
                raise HTTPException(502, f"Addon download failed (HTTP {res.status_code})")
            _assert_https(res.url)
            with target.open("wb") as f:
                for chunk in res.iter_content(chunk_size=1024 * 64):
                    if not chunk:
                        continue
                    f.write(chunk)
                    h.update(chunk)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed while downloading addon: {e}") from e
    return h.hexdigest()


@router.get("/license/verify")
def verify_experimental_license(license_key: str | None = None, key: str | None = None):
    """
    Verify a license key against hytalemanager.com.
    Accepts either `license_key` or `key` query params (same meaning).
    """
    effective_key = _normalize_license_key(license_key or key)
    data = _request_site_json("/api/verify-license", params={"key": effective_key})
    return {"ok": True, **data}


@router.get("/update/check")
def check_experimental_addon_update(
    license_key: str | None = None,
    plugin_id: str = ADDON_PLUGIN_ID,
    channel: str = DEFAULT_CHANNEL,
    current_version: str | None = None,
    app_version: str | None = None,
):
    """
    Check addon update metadata from hytalemanager.com.
    Uses x-license-key header (preferred over URL query for secrets).
    """
    effective_key = _normalize_license_key(license_key)
    params = {
        "plugin_id": plugin_id or ADDON_PLUGIN_ID,
        "channel": channel or DEFAULT_CHANNEL,
        "current_version": current_version or "",
        "app_version": app_version or MANAGER_VERSION,
    }
    data = _request_site_json(
        "/api/addon/update/check",
        params=params,
        headers={"x-license-key": effective_key},
    )
    return {"ok": True, **data}


class InstallFromSiteBody(BaseModel):
    license_key: str | None = None
    plugin_id: str = ADDON_PLUGIN_ID
    channel: str = DEFAULT_CHANNEL
    current_version: str | None = None
    app_version: str | None = None


@router.post("/update/install")
def install_experimental_addon_from_site(body: InstallFromSiteBody):
    """
    Download + verify + install addon from hytalemanager.com update API.
    Requires SHA-256 match before replacing the installed addon.
    """
    effective_key = _normalize_license_key(body.license_key)
    check = _request_site_json(
        "/api/addon/update/check",
        params={
            "plugin_id": body.plugin_id or ADDON_PLUGIN_ID,
            "channel": body.channel or DEFAULT_CHANNEL,
            "current_version": body.current_version or "",
            "app_version": body.app_version or MANAGER_VERSION,
        },
        headers={"x-license-key": effective_key},
    )

    if not check.get("update_available"):
        return {
            "ok": True,
            "update_available": False,
            "reason": check.get("reason", "already_latest"),
            "latest_version": check.get("latest_version"),
            "message": "No addon update available.",
        }

    download_url = str(check.get("download_url") or "").strip()
    expected_sha = str(check.get("sha256") or "").strip().lower()
    if not download_url:
        raise HTTPException(502, "Update service did not provide a download URL")
    if len(expected_sha) != 64:
        raise HTTPException(502, "Update service returned invalid sha256 metadata")

    addons_dir = get_addons_dir()
    addons_dir.mkdir(parents=True, exist_ok=True)
    dest = addons_dir / ADDON_FILENAME
    backup = addons_dir / f"{ADDON_FILENAME}.bak"

    tmp_fd, tmp_path = tempfile.mkstemp(prefix="experimental_addon_", suffix=".whl", dir=str(addons_dir))
    os.close(tmp_fd)
    tmp = Path(tmp_path)

    try:
        actual_sha = _download_with_sha256(download_url, tmp)
        if actual_sha.lower() != expected_sha:
            raise HTTPException(400, "Downloaded addon failed SHA-256 verification")

        if dest.exists():
            try:
                dest.replace(backup)
            except Exception:
                # If backup move fails, continue with direct replace below to avoid blocking update.
                pass
        tmp.replace(dest)

        # Remove stale pyz artifact if present so .whl is always authoritative.
        pyz = addons_dir / "experimental_addon.pyz"
        if pyz.exists():
            try:
                pyz.unlink()
            except Exception:
                pass

        return {
            "ok": True,
            "message": "Addon updated. Restart the app to activate.",
            "path": str(dest),
            "latest_version": check.get("latest_version"),
            "sha256": actual_sha,
        }
    finally:
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass


@router.post("/install")
async def install_experimental_addon(file: UploadFile = File(...)):
    """
    Accept a .whl file and copy it to the addons directory as experimental_addon.whl.
    The addon is loaded on next app restart.
    """
    if not file.filename or not file.filename.lower().endswith(".whl"):
        raise HTTPException(400, "Only .whl files are accepted")
    addons_dir = get_addons_dir()
    addons_dir.mkdir(parents=True, exist_ok=True)
    dest = addons_dir / ADDON_FILENAME
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(400, f"Failed to read file: {e}") from e
    try:
        dest.write_bytes(contents)
    except Exception as e:
        raise HTTPException(500, f"Failed to write addon: {e}") from e
    return {
        "ok": True,
        "message": "Addon installed. Restart the app to activate.",
        "path": str(dest),
    }
