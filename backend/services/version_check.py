"""Version checking and update availability for Hytale server instances."""

from __future__ import annotations

import os

from config import PATCHLINE_FILE, VERSION_FILE
from services import downloader as dl
from utils.atomic_io import atomic_write_text
from utils.paths import resolve_instance, resolve_instance_by_name


def read_installed_version() -> str:
    vf = resolve_instance(VERSION_FILE)
    if os.path.isfile(vf):
        with open(vf, "r") as f:
            return f.read().strip() or "unknown"
    return "unknown"


def read_installed_patchline() -> str:
    pf = resolve_instance(PATCHLINE_FILE)
    if os.path.isfile(pf):
        with open(pf, "r") as f:
            return f.read().strip() or "release"
    return "release"


def save_version(version: str, patchline: str) -> None:
    # Patchline first: if we crash between the two writes, a stale version with
    # the right patchline only re-offers an update; the reverse hides one.
    atomic_write_text(resolve_instance(PATCHLINE_FILE), patchline)
    atomic_write_text(resolve_instance(VERSION_FILE), version)


def check_remote_versions() -> dict:
    result = {}
    remote_error = None
    remote_error_kind = None
    for pl in ("release", "pre-release"):
        rc, out = dl.print_version(pl)
        ok = rc == 0 and out and not out.startswith("[ERROR]")
        result[pl] = out.strip() if ok else None
        if not ok and remote_error is None:
            kind, msg = dl.classify_version_error(out or "")
            remote_error_kind = kind
            remote_error = msg
    return {
        "versions": result,
        "remote_error": remote_error,
        "remote_error_kind": remote_error_kind,
    }


def version_greater(a: str, b: str) -> bool:
    if not a:
        return False
    if not b or b == "unknown":
        return True
    return a > b


def version_less(a: str, b: str) -> bool:
    if not a or a == "unknown":
        return True
    if not b or b == "unknown":
        return False
    return a < b


def get_update_status() -> dict:
    iv = read_installed_version()
    ip = read_installed_patchline()
    remote_info = check_remote_versions()
    remote = remote_info.get("versions", {})
    rr = remote.get("release")
    rp = remote.get("pre-release")

    if ip == "release":
        update_available = version_greater(rr, iv) if rr else False
    else:
        update_available = version_greater(rp, iv) if rp else False

    can_switch_release = ip == "pre-release" and rr is not None
    can_switch_prerelease = ip == "release" and rp is not None
    switch_to_release_is_downgrade = can_switch_release and version_less(rr, iv)
    switch_to_prerelease_is_downgrade = can_switch_prerelease and version_less(rp, iv)

    return {
        "installed_version": iv,
        "installed_patchline": ip,
        "remote_release": rr,
        "remote_prerelease": rp,
        "remote_error": remote_info.get("remote_error"),
        "remote_error_kind": remote_info.get("remote_error_kind"),
        "update_available": update_available,
        "can_switch_release": can_switch_release,
        "can_switch_prerelease": can_switch_prerelease,
        "switch_to_release_is_downgrade": switch_to_release_is_downgrade,
        "switch_to_prerelease_is_downgrade": switch_to_prerelease_is_downgrade,
    }


def get_all_instances_update_status() -> dict:
    from services import instances as inst_svc

    remote_info = check_remote_versions()
    remote = remote_info.get("versions", {})
    rr = remote.get("release")
    rp = remote.get("pre-release")

    result = {}
    for inst in inst_svc.list_instances():
        if not inst.get("installed"):
            continue
        iv = inst.get("version") or "unknown"
        ip = inst.get("patchline") or "release"
        if ip == "release":
            update_available = version_greater(rr, iv) if rr else False
        else:
            update_available = version_greater(rp, iv) if rp else False
        can_switch_release = ip == "pre-release" and rr is not None
        can_switch_prerelease = ip == "release" and rp is not None
        switch_to_release_is_downgrade = can_switch_release and version_less(rr, iv)
        switch_to_prerelease_is_downgrade = can_switch_prerelease and version_less(rp, iv)
        result[inst["name"]] = {
            "update_available": update_available,
            "installed_version": iv,
            "installed_patchline": ip,
            "can_switch_release": can_switch_release,
            "can_switch_prerelease": can_switch_prerelease,
            "switch_to_release_is_downgrade": switch_to_release_is_downgrade,
            "switch_to_prerelease_is_downgrade": switch_to_prerelease_is_downgrade,
        }

    return {
        "instances": result,
        "remote_release": rr,
        "remote_prerelease": rp,
        "remote_error": remote_info.get("remote_error"),
        "remote_error_kind": remote_info.get("remote_error_kind"),
    }


def read_version_for_instance(instance_name: str) -> str:
    vf = resolve_instance_by_name(instance_name, VERSION_FILE)
    if os.path.isfile(vf):
        with open(vf, "r") as f:
            return f.read().strip() or "unknown"
    return "unknown"


def read_patchline_for_instance(instance_name: str) -> str:
    pf = resolve_instance_by_name(instance_name, PATCHLINE_FILE)
    if os.path.isfile(pf):
        with open(pf, "r") as f:
            return f.read().strip() or "release"
    return "release"


def save_version_for_instance(instance_name: str, version: str, patchline: str) -> None:
    vf = resolve_instance_by_name(instance_name, VERSION_FILE)
    pf = resolve_instance_by_name(instance_name, PATCHLINE_FILE)
    os.makedirs(os.path.dirname(vf), exist_ok=True)
    atomic_write_text(pf, patchline)
    atomic_write_text(vf, version)
