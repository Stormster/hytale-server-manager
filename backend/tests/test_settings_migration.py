"""Tests for settings load migrations."""

import importlib
import json

import pytest


@pytest.fixture
def settings_module(monkeypatch, tmp_path):
    """Reload settings module with an isolated settings file."""
    settings_dir = tmp_path / "HytaleServerManager"
    settings_dir.mkdir(parents=True, exist_ok=True)
    settings_file = settings_dir / "settings.json"
    monkeypatch.setenv("APPDATA", str(tmp_path))
    monkeypatch.delenv("HSM_ENABLE_REMOTE", raising=False)

    import services.settings as mod

    monkeypatch.setattr(mod, "_SETTINGS_DIR", str(settings_dir))
    monkeypatch.setattr(mod, "_SETTINGS_FILE", str(settings_file))
    monkeypatch.setattr(mod, "_cache", None)
    monkeypatch.setattr(mod, "_migrated", False)
    importlib.reload(mod)
    return mod, settings_file


def test_migrates_pro_license_key_and_schema_version(settings_module):
    mod, settings_file = settings_module
    settings_file.write_text(
        json.dumps({"pro_license_key": "HM-EXP-OLD", "active_connection": "remote-1"}),
        encoding="utf-8",
    )

    data = mod.load()

    assert data["settings_schema_version"] == 1
    assert data["experimental_addon_license_key"] == "HM-EXP-OLD"
    assert "pro_license_key" not in data
    assert "active_connection" not in data

    persisted = json.loads(settings_file.read_text(encoding="utf-8"))
    assert persisted["experimental_addon_license_key"] == "HM-EXP-OLD"
    assert "pro_license_key" not in persisted


def test_preserves_remote_connections_when_dev_flag_set(settings_module, monkeypatch):
    mod, settings_file = settings_module
    monkeypatch.setenv("HSM_ENABLE_REMOTE", "1")
    importlib.reload(mod)
    settings_file.write_text(
        json.dumps(
            {
                "remote_connections": [{"id": "abc", "name": "Test", "base_url": "https://x", "api_key": "k"}],
                "active_connection": "abc",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(mod, "_cache", None)
    monkeypatch.setattr(mod, "_migrated", False)

    data = mod.load()

    assert len(data["remote_connections"]) == 1
    assert "active_connection" not in data
