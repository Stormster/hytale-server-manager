"""Tests for settings persistence safety: corrupt-file recovery, atomic writes,
active-instance validation, and per-instance data migration."""

import importlib
import json
import os

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

    importlib.reload(mod)
    monkeypatch.setattr(mod, "_SETTINGS_DIR", str(settings_dir))
    monkeypatch.setattr(mod, "_SETTINGS_FILE", str(settings_file))
    monkeypatch.setattr(mod, "_cache", None)
    monkeypatch.setattr(mod, "_migrated", False)
    return mod, settings_file


def test_corrupt_settings_recovers_instead_of_crashing(settings_module):
    mod, settings_file = settings_module
    settings_file.write_text('{"root_dir": "C:\\\\Servers", "trunca', encoding="utf-8")

    data = mod.load()

    # Backend keeps working with fresh settings
    assert data["settings_schema_version"] == 1
    # The bad file was moved aside, not deleted
    assert (settings_file.parent / "settings.json.corrupt").is_file()


def test_save_round_trip(settings_module):
    mod, settings_file = settings_module
    mod.set_root_dir(str(settings_file.parent))
    persisted = json.loads(settings_file.read_text(encoding="utf-8"))
    assert persisted["root_dir"] == os.path.abspath(str(settings_file.parent))
    # No temp files left behind
    leftovers = [p for p in os.listdir(settings_file.parent) if p.endswith(".tmp")]
    assert leftovers == []


@pytest.mark.parametrize(
    "bad_name",
    ["../other", "..", "a/b", "a\\b", "C:\\Users\\x", "/etc"],
)
def test_set_active_instance_rejects_traversal(settings_module, bad_name):
    mod, _ = settings_module
    with pytest.raises(ValueError):
        mod.set_active_instance(bad_name)


def test_set_active_instance_allows_normal_and_empty(settings_module):
    mod, _ = settings_module
    mod.set_active_instance("My Survival Server")
    assert mod.get_active_instance() == "My Survival Server"
    mod.set_active_instance("")
    assert mod.get_active_instance() == ""


def test_rename_instance_data_migrates_ports_and_server_settings(settings_module):
    mod, _ = settings_module
    mod.set_instance_port("Old", 5520, 5620)
    mod.set_instance_server_settings("Old", {"ram_min_gb": 2, "ram_max_gb": 8})

    mod.rename_instance_data("Old", "New")

    assert mod.get_instance_port("New") == (5520, 5620)
    assert mod.get_instance_port("Old") == (None, None)
    assert mod.get_instance_server_settings_for("New")["ram_max_gb"] == 8
    assert mod.get_instance_server_settings_for("Old") == {}


def test_purge_instance_data_removes_stale_entries(settings_module):
    mod, _ = settings_module
    mod.set_instance_port("Doomed", 5520, 5620)
    mod.set_instance_server_settings("Doomed", {"ram_max_gb": 16})

    mod.purge_instance_data("Doomed")

    assert mod.get_instance_port("Doomed") == (None, None)
    assert mod.get_instance_server_settings_for("Doomed") == {}
