"""
Query the Nitrado Query plugin for server info (player count, etc.).

Endpoint: GET /Nitrado/Query
Requires Nitrado WebServer + Query plugins. Anonymous access needs
nitrado.query.web.read.basic in ANONYMOUS group (permissions.json).
"""

import json
import os

from config import SERVER_DIR
from utils.paths import resolve_instance

QUERY_ACCEPT = "application/x.hytale.nitrado.query+json;version=1"
DEFAULT_PORT = 7003
DEFAULT_HOST = "127.0.0.1"


def _get_webserver_config(server_dir: str) -> tuple[str, int, bool]:
    """(host, port, use_https). Default 127.0.0.1:7003, TLS on."""
    path = os.path.join(server_dir, "mods", "Nitrado_WebServer", "config.json")
    if not os.path.isfile(path):
        return (DEFAULT_HOST, DEFAULT_PORT, True)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        host = data.get("BindHost") or DEFAULT_HOST
        port = data.get("BindPort") or DEFAULT_PORT
        insecure = False
        tls = data.get("Tls") or {}
        if isinstance(tls, dict) and tls.get("Insecure"):
            insecure = True
        use_https = not insecure
        return (host, port, use_https)
    except Exception:
        return (DEFAULT_HOST, DEFAULT_PORT, True)


def query_players() -> int | None:
    """
    Fetch current player count from Nitrado Query plugin.
    Returns None if server not running, plugins missing, or request fails.
    """
    if not is_running():
        return None
    # Import here to avoid circular dependency
    from services import server as server_svc
    if not server_svc.is_running():
        return None

    server_dir = resolve_instance(SERVER_DIR)
    host, port, use_https = _get_webserver_config(server_dir)
    scheme = "https" if use_https else "http"
    url = f"{scheme}://{host}:{port}/Nitrado/Query"

    try:
        import requests
        if use_https:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        resp = requests.get(
            url,
            timeout=2,
            headers={"Accept": QUERY_ACCEPT},
            verify=False if use_https else True,
        )
        resp.raise_for_status()
        data = resp.json()

        # Prefer Basic.CurrentPlayers (minimal, always available if ANONYMOUS has nitrado.query.web.read.basic)
        basic = data.get("Basic") or {}
        if "CurrentPlayers" in basic:
            return int(basic["CurrentPlayers"])

        # Fallback to Universe.CurrentPlayers
        universe = data.get("Universe") or {}
        if "CurrentPlayers" in universe:
            return int(universe["CurrentPlayers"])

        return None
    except Exception:
        return None


def is_running() -> bool:
    """Avoid import loop - check via server module lazily."""
    from services import server as server_svc
    return server_svc.is_running()
