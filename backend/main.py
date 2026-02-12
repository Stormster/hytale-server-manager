"""
Hytale Server Manager – FastAPI backend.
Runs as a sidecar process, started by Tauri.
"""

import argparse
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
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    from api.server import router as server_router
    from api.updater import router as updater_router
    from api.backups import router as backups_router
    from api.config_files import router as config_router
    from api.auth import router as auth_router
    from api.info import router as info_router
    from api.settings_routes import router as settings_router
    from api.instances import router as instances_router

    app = FastAPI(title="Hytale Server Manager Backend")

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
    app.include_router(instances_router, prefix="/api/instances", tags=["instances"])

    @app.get("/api/health")
    async def health():
        return {"ok": True}

    return app


def main():
    args = parse_args()

    # Optionally pre-seed root_dir for dev convenience
    if args.root_dir:
        from services.settings import get_root_dir, set_root_dir
        if not get_root_dir():
            set_root_dir(os.path.abspath(args.root_dir))

    port = find_free_port(args.port)

    # Signal to Tauri that the backend is ready
    print(f"BACKEND_READY:{port}", flush=True)

    app = create_app()

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
