"""Tests for backup/restore guards: no restore while running, no restore of
incomplete backups, staged world-restore that survives corrupt zips."""

import json
import os
import zipfile

import pytest

import services.backup as bk
import services.server as server_svc
import services.settings as settings


@pytest.fixture
def instance_env(monkeypatch, tmp_path):
    """Isolated root with one active instance that has a Server folder."""
    settings_dir = tmp_path / "appdata" / "HytaleServerManager"
    settings_dir.mkdir(parents=True)
    monkeypatch.setattr(settings, "_SETTINGS_DIR", str(settings_dir))
    monkeypatch.setattr(settings, "_SETTINGS_FILE", str(settings_dir / "settings.json"))
    monkeypatch.setattr(settings, "_cache", None)
    monkeypatch.setattr(settings, "_migrated", False)

    root = tmp_path / "servers"
    inst = root / "Alpha"
    server = inst / "Server"
    server.mkdir(parents=True)
    (server / "HytaleServer.jar").write_bytes(b"jar")
    (server / "universe").mkdir()
    (server / "universe" / "world.dat").write_bytes(b"world-v1")

    settings.set_root_dir(str(root))
    settings.set_active_instance("Alpha")
    return {"root": root, "instance": inst, "server": server}


def _make_backup_entry(path, with_jar=True):
    server = os.path.join(path, "Server")
    os.makedirs(server, exist_ok=True)
    if with_jar:
        with open(os.path.join(server, "HytaleServer.jar"), "wb") as f:
            f.write(b"backup-jar")
    return bk.BackupEntry(str(path))


def test_restore_refuses_while_running(instance_env, tmp_path, monkeypatch):
    entry = _make_backup_entry(tmp_path / "bk1")
    monkeypatch.setattr(server_svc, "is_instance_running", lambda name: True)
    with pytest.raises(ValueError, match="Stop the server"):
        bk.restore_backup(entry)
    # Live server untouched
    assert (instance_env["server"] / "HytaleServer.jar").read_bytes() == b"jar"


def test_restore_refuses_incomplete_backup(instance_env, tmp_path):
    entry = _make_backup_entry(tmp_path / "bk2", with_jar=False)
    with pytest.raises(ValueError, match="incomplete"):
        bk.restore_backup(entry)
    assert (instance_env["server"] / "HytaleServer.jar").read_bytes() == b"jar"


def test_restore_swaps_in_backup(instance_env, tmp_path, monkeypatch):
    entry = _make_backup_entry(tmp_path / "bk3")
    monkeypatch.setattr(server_svc, "is_instance_running", lambda name: False)
    bk.restore_backup(entry)
    assert (instance_env["server"] / "HytaleServer.jar").read_bytes() == b"backup-jar"
    # No staging leftovers
    inst = instance_env["instance"]
    assert not (inst / "Server.restoring").exists()
    assert not (inst / "Server.pre-restore").exists()


def test_world_restore_corrupt_zip_preserves_universe(instance_env, monkeypatch):
    monkeypatch.setattr(server_svc, "is_instance_running", lambda name: False)
    backups = instance_env["server"] / "backups"
    backups.mkdir()
    (backups / "bad.zip").write_bytes(b"this is not a zip file")

    with pytest.raises(ValueError, match="corrupt"):
        bk.restore_hytale_world_backup("bad.zip")

    # The live universe must be untouched
    assert (instance_env["server"] / "universe" / "world.dat").read_bytes() == b"world-v1"


def test_world_restore_happy_path(instance_env, monkeypatch):
    monkeypatch.setattr(server_svc, "is_instance_running", lambda name: False)
    backups = instance_env["server"] / "backups"
    backups.mkdir()
    good = backups / "good.zip"
    with zipfile.ZipFile(good, "w") as zf:
        zf.writestr("universe/world.dat", b"world-v2")

    bk.restore_hytale_world_backup("good.zip")

    assert (instance_env["server"] / "universe" / "world.dat").read_bytes() == b"world-v2"
    # Pre-restore snapshot of the old universe was created
    pre = [p for p in os.listdir(backups) if p.startswith("pre-restore_")]
    assert len(pre) == 1
    # No staging leftovers
    assert not (instance_env["server"] / "universe.restoring").exists()
    assert not (instance_env["server"] / "universe.pre-restore").exists()


def test_backup_records_server_was_running(instance_env, monkeypatch):
    monkeypatch.setattr(server_svc, "is_instance_running", lambda name: True)
    entry = bk.create_backup(label="While running")
    with open(os.path.join(entry.path, "backup_info.json"), encoding="utf-8") as f:
        meta = json.load(f)
    assert meta["server_was_running"] is True
    assert entry.to_dict()["server_was_running"] is True


def test_rename_backup_preserves_metadata(instance_env, monkeypatch, tmp_path):
    monkeypatch.setattr(server_svc, "is_instance_running", lambda name: False)
    entry = bk.create_backup(label="update from 1.0 (release) to 2.0 (release)")
    bk.rename_backup(entry, "My renamed backup")
    with open(os.path.join(entry.path, "backup_info.json"), encoding="utf-8") as f:
        meta = json.load(f)
    assert meta["label"] == "My renamed backup"
    assert meta["from_version"] == "1.0"
    assert meta["to_version"] == "2.0"
