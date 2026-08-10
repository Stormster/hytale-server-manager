"""Tests for instance operations: running guards, settings migration on
rename/delete, sanitized create names, and import self-copy protection."""

import pytest

import services.instances as inst_svc
import services.server as server_svc
import services.settings as settings


@pytest.fixture
def root_env(monkeypatch, tmp_path):
    settings_dir = tmp_path / "appdata" / "HytaleServerManager"
    settings_dir.mkdir(parents=True)
    monkeypatch.setattr(settings, "_SETTINGS_DIR", str(settings_dir))
    monkeypatch.setattr(settings, "_SETTINGS_FILE", str(settings_dir / "settings.json"))
    monkeypatch.setattr(settings, "_cache", None)
    monkeypatch.setattr(settings, "_migrated", False)

    root = tmp_path / "servers"
    root.mkdir()
    settings.set_root_dir(str(root))
    return root


def test_delete_running_instance_refused(root_env, monkeypatch):
    (root_env / "Busy").mkdir()
    monkeypatch.setattr(server_svc, "is_instance_running", lambda name: True)
    with pytest.raises(ValueError, match="running"):
        inst_svc.delete_instance("Busy")
    assert (root_env / "Busy").is_dir()


def test_rename_running_instance_refused(root_env, monkeypatch):
    (root_env / "Busy").mkdir()
    monkeypatch.setattr(server_svc, "is_instance_running", lambda name: True)
    with pytest.raises(ValueError, match="running"):
        inst_svc.rename_instance("Busy", "Renamed")
    assert (root_env / "Busy").is_dir()


def test_rename_migrates_instance_settings(root_env, monkeypatch):
    (root_env / "Old").mkdir()
    monkeypatch.setattr(server_svc, "is_instance_running", lambda name: False)
    settings.set_instance_port("Old", 5520, 5620)
    settings.set_instance_server_settings("Old", {"ram_max_gb": 8})

    inst_svc.rename_instance("Old", "New")

    assert (root_env / "New").is_dir()
    assert settings.get_instance_port("New") == (5520, 5620)
    assert settings.get_instance_server_settings_for("New")["ram_max_gb"] == 8


def test_delete_purges_instance_settings(root_env, monkeypatch):
    (root_env / "Doomed").mkdir()
    monkeypatch.setattr(server_svc, "is_instance_running", lambda name: False)
    settings.set_instance_port("Doomed", 5521, 5621)

    inst_svc.delete_instance("Doomed")

    assert not (root_env / "Doomed").exists()
    assert settings.get_instance_port("Doomed") == (None, None)


def test_create_sanitizes_and_returns_name(root_env):
    result = inst_svc.create_instance("My:Server?")
    assert result["name"] == "My-Server"
    assert (root_env / "My-Server").is_dir()


def test_import_rejects_ancestor_of_root(root_env, tmp_path):
    # Make the source folder look like a valid server so validation reaches
    # the self-copy check.
    source = tmp_path  # ancestor of root_env
    (source / "Assets.zip").write_bytes(b"z")
    server = source / "Server"
    server.mkdir(exist_ok=True)
    (server / "HytaleServer.jar").write_bytes(b"j")

    with pytest.raises(ValueError, match="servers root"):
        inst_svc.import_instance("Oops", str(source))
