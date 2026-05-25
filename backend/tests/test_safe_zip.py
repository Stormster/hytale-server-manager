import os
import tempfile
import zipfile

import pytest

from utils.safe_zip import safe_extractall


def test_safe_extractall_allows_normal_file():
    with tempfile.TemporaryDirectory() as tmp:
        zpath = os.path.join(tmp, "good.zip")
        dest = os.path.join(tmp, "out")
        os.makedirs(dest)
        with zipfile.ZipFile(zpath, "w") as zf:
            zf.writestr("hello.txt", b"hi")
        safe_extractall(zpath, dest)
        assert os.path.isfile(os.path.join(dest, "hello.txt"))


def test_safe_extractall_rejects_path_traversal():
    with tempfile.TemporaryDirectory() as tmp:
        zpath = os.path.join(tmp, "evil.zip")
        dest = os.path.join(tmp, "out")
        os.makedirs(dest)
        with zipfile.ZipFile(zpath, "w") as zf:
            zf.writestr("../outside.txt", b"no")
        with pytest.raises(ValueError, match="Unsafe"):
            safe_extractall(zpath, dest)
