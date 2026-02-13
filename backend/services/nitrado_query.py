"""
Query the Nitrado Query plugin for server info (player count, etc.).

Endpoint: GET /Nitrado/Query
Requires Nitrado WebServer + Query plugins. Anonymous access needs
nitrado.query.web.read.basic in the ANONYMOUS group of the Hytale server's
permissions.json (Server/permissions.json).
"""

import json
import os

from config import SERVER_DIR
from utils.paths import resolve_instance

QUERY_ACCEPT = "application/x.hytale.nitrado.query+json;version=1"
DEFAULT_HOST = "127.0.0.1"
# Nitrado WebServer = game_port + 100; fallback when config missing
NITRADO_OFFSET = 100
DEFAULT_GAME_PORT = 5520
DEFAULT_WEBSERVER_PORT = DEFAULT_GAME_PORT + NITRADO_OFFSET  # 5620


def _get_webserver_port_fallback() -> int:
    """
    When Nitrado config has no BindPort, derive from game port.
    Nitrado plugin uses game_port + 100.
    """
    try:
        from services import server as server_svc
        from services.settings import get_active_instance, get_instance_port

        game_port = server_svc.get_running_game_port()
        if game_port is not None:
            return game_port + NITRADO_OFFSET
        inst = get_active_instance()
        if inst:
            gp, wp = get_instance_port(inst)
            if wp is not None:
                return wp
            if gp is not None:
                return gp + NITRADO_OFFSET
    except Exception:
        pass
    return DEFAULT_WEBSERVER_PORT


def _get_webserver_config(server_dir: str) -> tuple[str, int, bool]:
    """(host, port, use_https). Port from config, or game_port+100 when missing."""
    path = os.path.join(server_dir, "mods", "Nitrado_WebServer", "config.json")
    port = None
    host = DEFAULT_HOST
    use_https = True
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            raw_host = data.get("BindHost") or DEFAULT_HOST
            # 0.0.0.0 / :: are bind-all addresses, not connectable – use loopback
            if raw_host in ("0.0.0.0", "::", "0:0:0:0:0:0:0:0"):
                host = DEFAULT_HOST
            else:
                host = raw_host
            port = data.get("BindPort")
            insecure = False
            tls = data.get("Tls") or {}
            if isinstance(tls, dict) and tls.get("Insecure"):
                insecure = True
            use_https = not insecure
        except Exception:
            pass
    if port is None:
        port = _get_webserver_port_fallback()
    return (host, port, use_https)


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
