"""
Java detection utility.
"""

import subprocess
import sys

_CREATION_FLAGS = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0


def check_java() -> tuple[bool, str]:
    """
    Check if Java is available on PATH.
    Returns ``(found, version_string)``.
    """
    try:
        result = subprocess.run(
            ["java", "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10,
            creationflags=_CREATION_FLAGS,
        )
        output = result.stdout.strip() or "(no output)"
        if result.returncode == 0:
            first_line = output.splitlines()[0] if output else "unknown"
            return True, first_line
        return False, output
    except FileNotFoundError:
        return False, "Java not found on PATH. Install Java 25+ from https://adoptium.net"
    except subprocess.TimeoutExpired:
        return False, "Java check timed out."
    except Exception as exc:
        return False, f"Error checking Java: {exc}"
