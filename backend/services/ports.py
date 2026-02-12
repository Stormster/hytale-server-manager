"""
Instance port assignment – game port + Nitrado webserver (game+100).

Each instance gets: game_port (5520+), webserver_port = game_port + 100.
Enables concurrent servers as long as ports don't overlap.
"""

import os

from services import settings
from services import server as server_svc

GAME_PORT_BASE = 5520
GAME_PORT_MAX = 5600  # 80 slots; webserver goes to 5720
NITRADO_OFFSET = 100


def _get_used_game_ports(exclude_instance: str | None = None) -> set[int]:
    """Ports in use by other instances (stored) or running servers."""
    used = set()
    stored = settings.get_instance_ports()

    # From stored instance ports
    for name, p in stored.items():
        if name == exclude_instance:
            continue
        g = p.get("game") if isinstance(p, dict) else None
        if isinstance(g, int):
            used.add(g)

    # From running server(s)
    for name, port in server_svc.get_all_running_ports().items():
        if name != exclude_instance and port is not None:
            used.add(port)

    return used


def assign_port_for_instance(instance_name: str) -> tuple[int, int]:
    """
    Ensure instance has a unique (game_port, webserver_port).
    Assigns if missing. Returns (game_port, webserver_port).
    """
    game_port, webserver_port = settings.get_instance_port(instance_name)
    if game_port is not None and webserver_port is not None:
        # Already assigned – verify it's not conflicting
        used = _get_used_game_ports(exclude_instance=instance_name)
        if game_port not in used:
            return (game_port, webserver_port)
        # Conflict – reassign

    used = _get_used_game_ports(exclude_instance=instance_name)
    for p in range(GAME_PORT_BASE, GAME_PORT_MAX + 1):
        if p not in used:
            game_port = p
            webserver_port = p + NITRADO_OFFSET
            settings.set_instance_port(instance_name, game_port, webserver_port)
            return (game_port, webserver_port)

    # Fallback if exhausted
    game_port = GAME_PORT_BASE
    webserver_port = GAME_PORT_BASE + NITRADO_OFFSET
    settings.set_instance_port(instance_name, game_port, webserver_port)
    return (game_port, webserver_port)


def get_instance_ports_display(instance_names: list[str], root_dir: str) -> dict[str, dict[str, int]]:
    """
    Return {instance_name: {"game": int, "webserver": int}} for given instances.
    Game from settings (default 5520); webserver from Nitrado config or game+100.
    """
    import json
    result: dict[str, dict[str, int]] = {}
    for name in instance_names:
        game_port, webserver_port = settings.get_instance_port(name)
        if game_port is None:
            game_port = GAME_PORT_BASE
        if webserver_port is None:
            webserver_port = game_port + NITRADO_OFFSET

        # Nitrado – read from config if present (may have been set by plugin)
        if root_dir:
            server_dir = os.path.join(root_dir, name, "Server")
            nitrado_cfg = os.path.join(server_dir, "mods", "Nitrado_WebServer", "config.json")
            if os.path.isfile(nitrado_cfg):
                try:
                    with open(nitrado_cfg, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    w = data.get("BindPort")
                    if isinstance(w, int):
                        webserver_port = w
                except Exception:
                    pass

        result[name] = {"game": game_port, "webserver": webserver_port}
    return result
