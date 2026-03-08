"""
API for Experimental addon: install .whl into addons directory.
Addon is loaded on next app restart.
"""

from fastapi import APIRouter, File, HTTPException, UploadFile

from plugin_loader import get_addons_dir

router = APIRouter(prefix="/api/addon", tags=["addon"])


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
    dest = addons_dir / "experimental_addon.whl"
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
