"""
Hytale Server Manager – FastAPI backend.
Runs as a sidecar process, started by Tauri.
"""

import argparse
import asyncio
import contextlib
import logging
import os
import socket
import sys


def parse_args():
    parser = argparse.ArgumentParser(description="Hytale Server Manager Backend")
    parser.add_argument("--port", type=int, default=21342, help="Port to listen on")
    parser.add_argument(
        "--root-dir",
        type=str,
        default=None,
        help="Pre-seed the root servers directory in settings (dev convenience)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Auto-reload on file changes (dev only)",
    )
    return parser.parse_args()


def find_free_port(start: int) -> int:
    """Find a free TCP port starting from *start*."""
    for port in range(start, start + 100):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"No free port found in range {start}-{start + 99}")


def create_app():
    # Pre-seed root_dir from env (used when running under uvicorn reload subprocess)
    root_dir = os.environ.get("HYTALE_ROOT_DIR")
    if root_dir:
        from services.settings import get_root_dir, set_root_dir
        if not get_root_dir():
            set_root_dir(os.path.abspath(root_dir))

    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    from api.server import router as server_router
    from api.updater import router as updater_router
    from api.backups import router as backups_router
    from api.config_files import router as config_router
    from api.auth import router as auth_router
    from api.info import router as info_router
    from api.settings_routes import router as settings_router
    from api.upnp_routes import router as upnp_router
    from api.instances import router as instances_router
    from api.mods import router as mods_router

    @contextlib.asynccontextmanager
    async def lifespan(app):
        task = None

        async def auto_update_loop():
            while True:
                try:
                    interval_hours = 12.0
                    instance_filter = []
                    try:
                        from services.settings import (
                            get_instance_auto_updates,
                            get_auto_update_interval_hours,
                        )
                        auto_updates = get_instance_auto_updates()
                        instance_filter = [n for n, enabled in auto_updates.items() if enabled]
                        interval_hours = get_auto_update_interval_hours()
                    except Exception:
                        pass
                    await asyncio.sleep(interval_hours * 3600)
                    if not instance_filter:
                        continue
                    try:
                        from services import updater as updater_svc
                        if updater_svc.get_update_in_progress():
                            continue
                        status = updater_svc.get_all_instances_update_status()
                        to_update = [
                            n for n, info in (status.get("instances") or {}).items()
                            if info.get("update_available") and n in instance_filter
                        ]
                        if not to_update:
                            continue
                        evt = asyncio.Event()
                        result = {"ok": False, "msg": ""}

                        def on_done(ok, msg):
                            result["ok"] = ok
                            result["msg"] = msg
                            evt.set()

                        updater_svc.perform_update_all(
                            on_done=on_done,
                            instance_filter=to_update,
                        )
                        await asyncio.wait_for(evt.wait(), timeout=3600)
                        if result["ok"]:
                            logging.getLogger(__name__).info("Auto-update completed: %s", result["msg"])
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:
                        logging.getLogger(__name__).warning("Auto-update failed: %s", exc)
                except asyncio.CancelledError:
                    break

        def start_scheduler():
            nonlocal task
            task = asyncio.create_task(auto_update_loop())

        async def stop_scheduler():
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        start_scheduler()
        yield
        await stop_scheduler()

    app = FastAPI(title="Hytale Server Manager Backend", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(server_router, prefix="/api/server", tags=["server"])
    app.include_router(updater_router, prefix="/api/updater", tags=["updater"])
    app.include_router(backups_router, prefix="/api/backups", tags=["backups"])
    app.include_router(config_router, prefix="/api/config", tags=["config"])
    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    app.include_router(info_router, prefix="/api", tags=["info"])
    app.include_router(settings_router, prefix="/api", tags=["settings"])
    app.include_router(upnp_router, prefix="/api/upnp", tags=["upnp"])
    app.include_router(instances_router, prefix="/api/instances", tags=["instances"])
    app.include_router(mods_router, prefix="/api/mods", tags=["mods"])

    # Load Experimental addon if present (addons/experimental_addon.whl or .pyz)
    try:
        from plugin_loader import load_experimental_addon
        if load_experimental_addon(app):
            pass  # Experimental addon routes/features now registered
    except Exception:
        pass  # No addon or load failed – open core runs without it

    @app.get("/api/health")
    async def health():
        return {"ok": True}

    return app


# Module-level app for uvicorn "main:app" (required for --reload)
app = create_app()


def main():
    args = parse_args()

    # Optionally pre-seed root_dir for dev convenience (pass to reload subprocess via env)
    if args.root_dir:
        os.environ["HYTALE_ROOT_DIR"] = os.path.abspath(args.root_dir)
        from services.settings import get_root_dir, set_root_dir
        if not get_root_dir():
            set_root_dir(os.path.abspath(args.root_dir))

    port = find_free_port(args.port)

    # Signal to Tauri that the backend is ready
    print(f"BACKEND_READY:{port}", flush=True)

    import uvicorn

    if args.reload:
        # Uvicorn requires import string for reload to work
        uvicorn.run(
            "main:app",
            host="127.0.0.1",
            port=port,
            log_level="warning",
            reload=True,
        )
    else:
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
