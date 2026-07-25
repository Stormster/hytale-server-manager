from utils.secret_redaction import mask_secret, sanitize_remote_connection, sanitize_settings_for_api


def test_mask_secret_short():
    assert mask_secret("abc") == "***"


def test_mask_secret_long():
    assert mask_secret("abcdefghijklmnop") == "abcd...mnop"


def test_sanitize_remote_connection():
    public = sanitize_remote_connection(
        {
            "id": "1",
            "name": "Test",
            "base_url": "https://example.com",
            "api_key": "supersecretapikeyvalue",
        }
    )
    assert "api_key" not in public
    assert public["api_key_set"] is True
    assert public["api_key_preview"] == "supe...alue"


def test_sanitize_settings_for_api():
    public = sanitize_settings_for_api(
        {
            "root_dir": "/tmp",
            "experimental_addon_license_key": "HM-EXP-1234567890",
            "remote_connections": [
                {"id": "1", "name": "Remote", "base_url": "https://x", "api_key": "remotekey12345678"}
            ],
        }
    )
    assert "experimental_addon_license_key" not in public
    assert public["experimental_addon_license_key_set"] is True
    assert public["experimental_addon_license_key_preview"] == "HM-E...7890"
    assert "api_key" not in public["remote_connections"][0]
    assert public["remote_connections"][0]["api_key_set"] is True
