"""Redact secrets before returning settings or connection data to the API client."""


def mask_secret(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = str(value).strip()
    if not trimmed:
        return None
    if len(trimmed) <= 8:
        return "*" * len(trimmed)
    return f"{trimmed[:4]}...{trimmed[-4:]}"


def sanitize_remote_connection(conn: dict) -> dict:
    out = {k: v for k, v in conn.items() if k != "api_key"}
    api_key = str(conn.get("api_key") or "").strip()
    out["api_key_set"] = bool(api_key)
    out["api_key_preview"] = mask_secret(api_key)
    return out


def sanitize_settings_for_api(data: dict) -> dict:
    out = dict(data)
    license_key = str(out.pop("experimental_addon_license_key", "") or "").strip()
    out["experimental_addon_license_key_set"] = bool(license_key)
    out["experimental_addon_license_key_preview"] = mask_secret(license_key)

    remote = out.get("remote_connections")
    if isinstance(remote, list):
        out["remote_connections"] = [sanitize_remote_connection(c) for c in remote if isinstance(c, dict)]

    return out
