"""
Auto-install Nitrado WebServer and Query plugins on server download.

WebServer provides HTTP infrastructure; Query exposes player count and status.
Both from https://github.com/nitrado/hytale-plugin-webserver and
https://github.com/nitrado/hytale-plugin-query
"""

import json
import os
from typing import Callable, Optional

import requests

# Nitrado WebServer = game_port + 100. When game port unknown, use 5620-5720.
WEBSERVER_PORT_BASE = 5620  # 5520 + 100
WEBSERVER_PORT_MAX = 5720

PLUGINS = [
    ("nitrado/hytale-plugin-webserver", "nitrado-webserver", ".jar"),
    ("nitrado/hytale-plugin-query", "nitrado-query", ".jar"),
]
GITHUB_API = "https://api.github.com/repos/{repo}/releases/latest"


_HEADERS = {"Accept": "application/vnd.github+json", "User-Agent": "Hytale-Server-Manager"}


def _get_jar_url(repo: str) -> tuple[str, str] | None:
    """(browser_download_url, filename) for the .jar asset, or None."""
    url = GITHUB_API.format(repo=repo)
    try:
        resp = requests.get(url, timeout=15, headers=_HEADERS)
        resp.raise_for_status()
        data = resp.json()
        for a in data.get("assets", []):
            name = (a.get("name") or "")
            if name.endswith(".jar"):
                return (a.get("browser_download_url", ""), name)
    except Exception:
        pass
    return None


def _get_latest_version(repo: str, prefix: str) -> str | None:
    """Get latest version string from GitHub releases, or None."""
    url = GITHUB_API.format(repo=repo)
    try:
        resp = requests.get(url, timeout=15, headers=_HEADERS)
        resp.raise_for_status()
        data = resp.json()
        tag = (data.get("tag_name") or "").lstrip("v")
        if tag:
            return tag
        for a in data.get("assets", []):
            name = (a.get("name") or "")
            if name.startswith(prefix) and name.endswith(".jar"):
                # nitrado-webserver-1.1.1.jar -> 1.1.1
                mid = name[len(prefix) : -4]
                if mid.startswith("-"):
                    return mid[1:] or None
                return mid or None
    except Exception:
        pass
    return None


def _version_less(a: str, b: str) -> bool:
    """True if a < b (a is older than b)."""
    try:
        from packaging.version import Version

        return Version(a) < Version(b)
    except Exception:
        return a < b


def get_nitrado_update_status(server_dir: str) -> dict:
    """
    Check if Nitrado plugins have updates available.
    Returns { update_available: bool, webserver: {installed, latest}, query: {installed, latest} }.
    """
    import re

    mods_path = os.path.join(server_dir, "mods")
    result: dict = {
        "update_available": False,
        "webserver": {"installed": None, "latest": None},
        "query": {"installed": None, "latest": None},
    }
    version_pattern = re.compile(r"(\d+\.\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?)")
    for repo, prefix, ext in PLUGINS:
        key = "webserver" if "webserver" in prefix else "query"
        installed = None
        for subdir in ("", "disabled"):
            dir_path = os.path.join(mods_path, subdir) if subdir else mods_path
            if not os.path.isdir(dir_path):
                continue
            for f in os.listdir(dir_path):
                if f.startswith(prefix) and f.endswith(ext):
                    m = version_pattern.search(f)
                    if m:
                        installed = m.group(1)
                    break
            if installed:
                break
        latest = _get_latest_version(repo, prefix)
        result[key]["installed"] = installed
        result[key]["latest"] = latest
        if installed and latest and _version_less(installed, latest):
            result["update_available"] = True
    return result


def _pick_unique_webserver_port(server_dir: str) -> int:
    """
    Pick a BindPort for this instance that does not collide with other instances.
    Scans all instances under root and returns the first free port in 7003..7999.
    Excludes the current instance so we can keep its port when re-running config.
    """
    from services.settings import get_root_dir

    root = get_root_dir()
    # server_dir is instance/Server; mods live at instance/Server/mods/
    current_norm = os.path.normpath(os.path.abspath(server_dir))
    used = set()
    if root and os.path.isdir(root):
        root_abs = os.path.abspath(root)
        for name in os.listdir(root):
            if name.startswith("."):
                continue
            inst_path = os.path.join(root_abs, name)
            inst_server = os.path.normpath(os.path.join(inst_path, "Server"))
            if inst_server == current_norm:
                continue  # don't count our own port as used
            cfg = os.path.join(inst_server, "mods", "Nitrado_WebServer", "config.json")
            if os.path.isfile(cfg):
                try:
                    with open(cfg, "r", encoding="utf-8") as f:
                        p = json.load(f).get("BindPort")
                        if isinstance(p, int) and WEBSERVER_PORT_BASE <= p <= WEBSERVER_PORT_MAX:
                            used.add(p)
                except Exception:
                    pass
    for port in range(WEBSERVER_PORT_BASE, WEBSERVER_PORT_MAX + 1):
        if port not in used:
            return port
    return WEBSERVER_PORT_BASE


NITRADO_OFFSET = 100  # webserver port = game_port + 100


def set_webserver_port(server_dir: str, port: int) -> None:
    """Set Nitrado WebServer BindPort to the given port."""
    ws_dir = os.path.join(server_dir, "mods", "Nitrado_WebServer")
    if not os.path.isdir(ws_dir):
        return
    path = os.path.join(ws_dir, "config.json")
    data: dict = {}
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
    data["BindPort"] = port
    data.setdefault("BindHost", "0.0.0.0")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def set_webserver_port_from_game(server_dir: str, game_port: int, webserver_port: Optional[int] = None) -> None:
    """Set Nitrado WebServer BindPort. Uses webserver_port if provided, else game_port + 100."""
    port = webserver_port if webserver_port is not None else game_port + NITRADO_OFFSET
    set_webserver_port(server_dir, port)


def _ensure_webserver_config(server_dir: str, *, force_unique: bool = False, game_port: Optional[int] = None) -> None:
    """
    Ensure Nitrado_WebServer/config.json has BindPort.
    When game_port given: use game_port + 100.
    Else: pick unique in 5620-5720 (100 ports away from default game 5520).
    """
    ws_dir = os.path.join(server_dir, "mods", "Nitrado_WebServer")
    os.makedirs(ws_dir, exist_ok=True)
    path = os.path.join(ws_dir, "config.json")
    data = {}
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
    if force_unique or data.get("BindPort") is None or game_port is not None:
        port = (game_port + NITRADO_OFFSET) if game_port is not None else _pick_unique_webserver_port(server_dir)
        data["BindPort"] = port
        data.setdefault("BindHost", "0.0.0.0")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)


def _ensure_query_permissions(server_dir: str) -> None:
    """Add nitrado.query.web.read.basic to ANONYMOUS in the Hytale server permissions.json.

    The Hytale server stores permissions at ``server_dir/permissions.json`` (lowercase
    ``"groups"`` key).  The Nitrado WebServer plugin checks the Hytale PermissionsModule
    at runtime, so the permission must live here – not in the plugin's own folder.
    """
    path = os.path.join(server_dir, "permissions.json")
    data: dict = {}
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass

    groups = data.setdefault("groups", {})
    anon: list = groups.setdefault("ANONYMOUS", [])
    needed = "nitrado.query.web.read.basic"
    if needed not in anon:
        anon.append(needed)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)


def install_nitrado_plugins(
    server_dir: str,
    on_status: Optional[Callable[[str], None]] = None,
) -> bool:
    """
    Download and install latest Nitrado WebServer + Query plugins.

    WebServer must load before Query (it provides the HTTP layer Query depends on).
    Installs to server_dir/mods/. Config folders (Nitrado_WebServer, Nitrado_Query)
    are never touched — only the .jar files are replaced, preserving user configs.
    """
    mods_path = os.path.join(server_dir, "mods")
    os.makedirs(mods_path, exist_ok=True)
    ok = True

    for repo, prefix, ext in PLUGINS:
        # Remove old version(s) before install — avoids duplicate plugins, preserves config folders
        for subdir in ("", "disabled"):
            dir_path = os.path.join(mods_path, subdir) if subdir else mods_path
            if not os.path.isdir(dir_path):
                continue
            try:
                for f in os.listdir(dir_path):
                    if f.startswith(prefix) and f.endswith(ext):
                        old_path = os.path.join(dir_path, f)
                        if os.path.isfile(old_path):
                            os.remove(old_path)
                            if on_status:
                                on_status(f"Removed old {f}")
            except OSError:
                pass
        if on_status:
            on_status(f"Installing Nitrado plugin: {prefix}...")
        result = _get_jar_url(repo)
        if not result:
            if on_status:
                on_status(f"  Could not fetch release for {repo}")
            ok = False
            continue
        download_url, filename = result
        if not download_url:
            ok = False
            continue
        try:
            resp = requests.get(download_url, timeout=60, stream=True, headers={"User-Agent": "Hytale-Server-Manager"})
            resp.raise_for_status()
            dest = os.path.join(mods_path, filename)
            with open(dest, "wb") as f:
                for chunk in resp.iter_content(chunk_size=65536):
                    f.write(chunk)
            if on_status:
                on_status(f"  Installed {filename}")
        except Exception as e:
            if on_status:
                on_status(f"  Failed to install {filename}: {e}")
            ok = False

    _ensure_webserver_config(server_dir)  # unique BindPort per instance to avoid conflicts
    _ensure_query_permissions(server_dir)
    return ok
