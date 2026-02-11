"""
Java detection utility.
"""

import subprocess


def check_java() -> tuple[bool, str]:
    """
    Check if Java is available on PATH.

    Returns ``(found, version_string)``.  If Java is not found the
    version_string contains a helpful error message.
    """
    try:
        result = subprocess.run(
            ["java", "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10,
        )
        output = result.stdout.strip() or "(no output)"
        # java -version prints to stderr on most JDKs; we merge via STDOUT
        if result.returncode == 0:
            # Try to extract the first line which typically has the version
            first_line = output.splitlines()[0] if output else "unknown"
            return True, first_line
        return False, output
    except FileNotFoundError:
        return False, "Java not found on PATH. Install Java 25+ from https://adoptium.net"
    except subprocess.TimeoutExpired:
        return False, "Java check timed out."
    except Exception as exc:
        return False, f"Error checking Java: {exc}"
