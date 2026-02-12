"""
Auto-install Nitrado WebServer and Query plugins on server download.

WebServer provides HTTP infrastructure; Query exposes player count and status.
Both from https://github.com/nitrado/hytale-plugin-webserver and
https://github.com/nitrado/hytale-plugin-query
"""

import os
import threading
from typing import Callable, Optional

import requests

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


def _ensure_query_permissions(server_dir: str) -> None:
    """Create or merge permissions.json so ANONYMOUS can read Nitrado Query basic info."""
    import json
    ws_dir = os.path.join(server_dir, "mods", "Nitrado_WebServer")
    os.makedirs(ws_dir, exist_ok=True)
    path = os.path.join(ws_dir, "permissions.json")
    data = {"Groups": {}}
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
    groups = data.setdefault("Groups", {})
    anon = groups.setdefault("ANONYMOUS", [])
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
    Installs to mods/ and plugins/ (Hytale may use either). Ensures query permissions.
    """
    mods_path = os.path.join(server_dir, "mods")
    plugins_path = os.path.join(server_dir, "plugins")
    os.makedirs(mods_path, exist_ok=True)
    os.makedirs(plugins_path, exist_ok=True)
    ok = True

    for repo, prefix, ext in PLUGINS:
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
            data = resp.content
            for folder in (mods_path, plugins_path):
                with open(os.path.join(folder, filename), "wb") as f:
                    f.write(data)
            if on_status:
                on_status(f"  Installed {filename}")
        except Exception as e:
            if on_status:
                on_status(f"  Failed to install {filename}: {e}")
            ok = False

    _ensure_query_permissions(server_dir)
    return ok
