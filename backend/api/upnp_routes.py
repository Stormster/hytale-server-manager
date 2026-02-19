"""
UPnP port forwarding – attempt to add router port mappings via UPnP/IGD.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class PortMapping(BaseModel):
    port: int
    protocol: str  # "UDP" or "TCP"


class UPnPForwardRequest(BaseModel):
    ports: list[PortMapping]


def _try_upnp_forward(ports: list[tuple[int, str]]) -> dict[str, bool]:
    """
    Attempt to add port mappings via UPnP.
    Returns { "port:protocol": success }.
    """
    result: dict[str, bool] = {}
    for port, protocol in ports:
        result[f"{port}:{protocol}"] = False

    try:
        import miniupnpc
    except ImportError:
        return result

    try:
        upnp = miniupnpc.UPnP()
        upnp.discoverdelay = 3000  # ms – give routers time to respond
        ndevices = upnp.discover()
        if ndevices == 0:
            return result

        upnp.selectigd()
        local_ip = upnp.lanaddr
        if not local_ip:
            return result

        for port, protocol in ports:
            proto = protocol.upper()
            if proto not in ("TCP", "UDP"):
                continue
            try:
                desc = f"Hytale Server Manager - {port}/{proto}"
                upnp.addportmapping(port, proto, local_ip, port, desc, "")
                result[f"{port}:{protocol}"] = True
            except Exception:
                result[f"{port}:{protocol}"] = False

    except Exception:
        pass

    return result


@router.post("/forward")
def upnp_forward(req: UPnPForwardRequest):
    """
    Attempt to add router port mappings via UPnP.
    Returns { "results": { "5520:UDP": true, "5620:TCP": false, ... }, "discovery_ok": bool }.
    """
    ports = [(p.port, p.protocol.upper()) for p in req.ports if p.protocol.upper() in ("TCP", "UDP")]
    if not ports:
        return {"results": {}, "discovery_ok": False}

    results = _try_upnp_forward(ports)
    # If all False, discovery likely failed; if any True, we found the gateway
    discovery_ok = any(results.values()) or len(results) > 0  # We tried, so we have some signal
    # Actually: if we got any True, discovery worked. If all False, could be discovery failed or router rejected.
    discovery_ok = any(results.values())

    return {"results": results, "discovery_ok": discovery_ok}
