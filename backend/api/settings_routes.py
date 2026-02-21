"""
Settings API routes – read/write persistent app settings.
"""

import os
import re
import subprocess
import sys
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Any

from services import settings

router = APIRouter()


def _get_firewall_rules_for_ports(port_protocols: list[tuple[int, str]]) -> dict[str, bool]:
    """Check which (port, protocol) pairs have an inbound Allow rule. Returns { "port:protocol": bool }. Windows only."""
    result: dict[str, bool] = {}
    for port, protocol in port_protocols:
        result[f"{port}:{protocol}"] = False

    if sys.platform != "win32":
        return result

    try:
        proc = subprocess.run(
            ["netsh", "advfirewall", "firewall", "show", "rule", "name=all"],
            capture_output=True,
            text=True,
            timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        if proc.returncode != 0:
            return result
        output = proc.stdout or ""
    except Exception:
        return result

    # Parse rule blocks: each has Rule Name, LocalPort, Protocol, Direction, Action
    blocks = re.split(r"\n(?=Rule Name:)", output)
    port_proto_allowed: set[tuple[int, str]] = set()
    for block in blocks:
        if "Rule Name:" not in block:
            continue
        direction = _extract(block, "Direction")
        action = _extract(block, "Action")
        if direction != "In" or action != "Allow":
            continue
        proto = _extract(block, "Protocol")
        local_port = _extract(block, "LocalPort")
        # Skip rules with LocalPort=Any: they are application-based (e.g. Hytale Client/JRE)
        # and only allow that specific executable, not our server's ports globally.
        if local_port == "Any":
            continue
        try:
            port_num = int(local_port)
        except ValueError:
            continue
        for port, protocol in port_protocols:
            if port == port_num and proto in ("Any", protocol.upper()):
                port_proto_allowed.add((port, protocol))

    for port, protocol in port_protocols:
        result[f"{port}:{protocol}"] = (port, protocol) in port_proto_allowed
    return result


def _extract(block: str, key: str) -> str:
    m = re.search(rf"^\s*{re.escape(key)}:\s*(.+)$", block, re.MULTILINE)
    return m.group(1).strip() if m else ""


def get_default_root_dir() -> str:
    """Return the default servers root folder: Documents/Hytale Servers."""
    base = os.environ.get("USERPROFILE", os.path.expanduser("~"))
    return os.path.join(base, "Documents", "Hytale Servers")


class UpdateSettingsRequest(BaseModel):
    root_dir: Optional[str] = None
    pro_license_key: Optional[str] = None
    instance_name: Optional[str] = None
    instance_server_settings: Optional[dict[str, Any]] = None
    game_port: Optional[int] = None
    webserver_port: Optional[int] = None


@router.get("/port-check")
def port_check(port: int, exclude_instance: Optional[str] = None):
    """Check if a port is in use (by another instance or system). Returns { in_use, conflict_with? }."""
    try:
        from services import settings
        from services import server as server_svc
    except ImportError:
        return {"in_use": False}
    # 1) Check other instances' stored ports (game + webserver)
    ports = settings.get_instance_ports()
    for name, p in ports.items():
        if name == exclude_instance:
            continue
        if isinstance(p, dict):
            g = p.get("game")
            w = p.get("webserver")
            if isinstance(g, int) and g == port:
                return {"in_use": True, "conflict_with": f"Instance '{name}' (game)"}
            if isinstance(w, int) and w == port:
                return {"in_use": True, "conflict_with": f"Instance '{name}' (web)"}
    # 2) Check running servers
    for name, p in server_svc.get_all_running_ports().items():
        if name != exclude_instance and p == port:
            return {"in_use": True, "conflict_with": f"Running instance '{name}'"}
    # 3) Check if system has something bound to this port
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("0.0.0.0", port))
    except OSError:
        return {"in_use": True, "conflict_with": "Another application"}
    return {"in_use": False}


@router.get("/firewall-status")
def firewall_status(ports: str):
    """
    Check which ports have Windows Firewall inbound Allow rules.
    ports: comma-separated "port:protocol" e.g. "5520:UDP,5620:TCP"
    Returns { "5520:UDP": true, "5620:TCP": false, ... }
    """
    port_protocols: list[tuple[int, str]] = []
    for part in ports.split(","):
        part = part.strip()
        if ":" in part:
            p, proto = part.split(":", 1)
            try:
                port_protocols.append((int(p.strip()), proto.strip().upper()))
            except ValueError:
                pass
    if not port_protocols:
        return {}
    return _get_firewall_rules_for_ports(port_protocols)


@router.get("/settings")
def get_settings():
    from services import instances as inst_svc

    data = settings.get_all()
    data["default_root_dir"] = get_default_root_dir()
    data["onboarding_completed"] = settings.has_completed_onboarding()

    # Clear stale active_instance if it no longer exists (e.g. fresh install with leftover settings)
    active = data.get("active_instance")
    if active:
        instance_names = [i["name"] for i in inst_svc.list_instances()]
        if active not in instance_names:
            settings.set_active_instance("")
            data["active_instance"] = ""

    return data


@router.put("/settings")
def update_settings(body: UpdateSettingsRequest):
    if body.root_dir is not None:
        path = os.path.abspath(body.root_dir)
        os.makedirs(path, exist_ok=True)
        settings.set_root_dir(path)
    if body.pro_license_key is not None:
        settings.set_pro_license_key(body.pro_license_key)
    if body.instance_name and body.instance_server_settings is not None:
        settings.set_instance_server_settings(body.instance_name, body.instance_server_settings)
    if body.instance_name:
        game = body.game_port if body.game_port is not None and 1 <= body.game_port <= 65535 else None
        webserver = body.webserver_port if body.webserver_port is not None and 1 <= body.webserver_port <= 65535 else None
        if game is not None or webserver is not None:
            cur_g, cur_w = settings.get_instance_port(body.instance_name)
            game = game if game is not None else cur_g or 5520
            webserver = webserver if webserver is not None else (cur_w if cur_w is not None else game + 100)
            settings.set_instance_port(body.instance_name, game, webserver)
            root = settings.get_root_dir()
            if root and webserver is not None:
                server_dir = os.path.join(root, body.instance_name, "Server")
                if os.path.isdir(server_dir):
                    from services.nitrado_plugins import set_webserver_port
                    set_webserver_port(server_dir, webserver)
    return settings.get_all()
